"""
Circuit Breaker Service — Layer 7: SPC-Based Extraction Gate.
Z-score test on 7-day rolling override count vs. 30-day historical baseline.
Halts graph writes for an asset_class when z_score > 2.0.
"""

import asyncio
import statistics
from datetime import UTC, datetime, timedelta
from typing import Any

import structlog

log = structlog.get_logger(__name__)


class CircuitBreakerService:
    def __init__(self, supabase) -> None:
        self.supabase = supabase

    async def model_gate_block(self, asset_class: str) -> bool:
        """
        Whether the most recent Layer 0 model gate blocked this asset class.

        Enforcement deliberately routes through the circuit breaker rather than a parallel gate:
        the breaker is already the thing that halts extraction per asset class and is already
        consulted by the extraction path, so a second mechanism would mean two places to check and
        two ways to disagree. The gate only ever publishes `blocked_asset_classes` when
        `MODEL_GATE_ENFORCE` is on, so this is inert by default.
        """
        try:
            result = await asyncio.to_thread(
                lambda: self.supabase.table("audit_log")
                .select("details")
                .eq("action", "model_gate_result")
                .order("timestamp", desc=True)
                .limit(1)
                .execute()
            )
        except Exception as exc:  # noqa: BLE001 — a reporting lookup must not break extraction
            log.warning("circuit_breaker.model_gate_lookup_failed", error=str(exc))
            return False
        if not result.data:
            return False
        blocked = (result.data[0].get("details") or {}).get("blocked_asset_classes") or []
        return asset_class in blocked

    async def check(self, asset_class: str) -> dict[str, Any]:
        """
        Halt decision for an asset class — two independent inputs, one mechanism.

        1. SPC: rolling Z-score over human override rates (drift during production operation).
        2. Layer 0 model gate: a model that regressed on this class at its deployment gate.

        The architecture wants both contained the same way — route new inputs of that class to
        human-only processing until the model is retrained and passes validation.
        """
        if await self.model_gate_block(asset_class):
            log.warning("circuit_breaker.halted_by_model_gate", asset_class=asset_class)
            return {
                "halted": True,
                "z_score": 0.0,
                "reason": "model_gate_regression",
                "override_count_7d": 0,
            }

        now = datetime.now(UTC)
        thirty_days_ago = (now - timedelta(days=30)).isoformat()
        seven_days_ago = (now - timedelta(days=7)).isoformat()

        all_rows = await asyncio.to_thread(
            lambda: self.supabase.table("extraction_overrides")
            .select("created_at")
            .eq("asset_class", asset_class)
            .gte("created_at", thirty_days_ago)
            .execute()
        )
        rows = all_rows.data or []

        # Current 7-day count
        current_7d = sum(1 for r in rows if r["created_at"] >= seven_days_ago)

        # Bucket last 30 days into 4 weekly windows (bucket 0 = most recent 7 days)
        week_counts = [0, 0, 0, 0]
        for row in rows:
            ts = row["created_at"]
            ts_dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
            days_ago = (now - ts_dt).total_seconds() / 86400
            bucket = min(int(days_ago // 7), 3)
            week_counts[bucket] += 1

        historical = week_counts[1:]  # weeks 1–3 are the baseline; exclude current week

        if all(c == 0 for c in historical):
            return {
                "halted": False,
                "z_score": 0.0,
                "reason": "insufficient_history",
                "override_count_7d": current_7d,
            }

        try:
            mean = statistics.mean(historical)
            std = statistics.stdev(historical) if len(set(historical)) > 1 else 0.0
        except statistics.StatisticsError:
            return {"halted": False, "z_score": 0.0, "reason": "stats_error", "override_count_7d": current_7d}

        z_score = 0.0 if std == 0 else (current_7d - mean) / std
        halted = z_score > 2.0

        if halted:
            log.warning(
                "circuit_breaker.halted",
                asset_class=asset_class,
                z_score=z_score,
                current_7d=current_7d,
                mean=mean,
            )

        return {
            "halted": halted,
            "z_score": round(z_score, 3),
            "reason": "z_score_exceeded" if halted else "within_normal_range",
            "override_count_7d": current_7d,
        }

    async def record_override(
        self,
        asset_class: str,
        document_id: str | None,
        override_type: str,
    ) -> None:
        """Insert an extraction_overrides row for SPC tracking."""
        await asyncio.to_thread(
            lambda: self.supabase.table("extraction_overrides").insert({
                "asset_class": asset_class,
                "document_id": document_id,
                "override_type": override_type,
            }).execute()
        )
        log.info(
            "circuit_breaker.override_recorded",
            asset_class=asset_class,
            override_type=override_type,
        )

    async def get_all_states(self) -> list[dict[str, Any]]:
        """Returns current CB state per distinct asset_class that has override records."""
        result = await asyncio.to_thread(
            lambda: self.supabase.table("extraction_overrides")
            .select("asset_class")
            .execute()
        )
        classes = list({r["asset_class"] for r in (result.data or [])})
        states = []
        for ac in sorted(classes):
            state = await self.check(ac)
            state["asset_class"] = ac
            states.append(state)
        return states

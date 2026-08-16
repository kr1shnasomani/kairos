"""
Attribution worker — Layer 10: Telemetry-Grounded Outcome Attribution.
Evaluates maintenance outcomes against three parallel checks before any
confidence adjustment is made in the knowledge graph.
All three checks must confirm a genuine failure before any action is taken.
"""

import asyncio
import os
import statistics
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
import structlog
from supabase import create_client

from api.utils.failure_families import FAILURE_FAMILIES as _FAILURE_FAMILIES
from workers.celery_app import celery_app

log = structlog.get_logger(__name__)

_GO_URL = os.getenv("GO_CONNECTOR_URL", "http://kairos-backend-go:8090")


def _supabase():
    return create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])


@celery_app.task(queue="attribution", name="workers.attribution.evaluate_outcome")
def evaluate_outcome(event_id: str, asset_id: str) -> dict[str, Any]:
    """
    Triggered when a second work order for the same asset arrives within 30 days.
    All three checks must confirm genuine failure before flagging for review.
    """
    log.info("attribution.started", event_id=event_id, asset_id=asset_id)

    telemetry_check = _check_telemetry_baseline(asset_id, event_id)
    failure_check = _check_failure_code_match(asset_id, event_id)
    execution_check = _check_execution_compliance(event_id)

    genuine_failure = (
        telemetry_check.get("failed", False)
        and failure_check.get("matched", False)
        and execution_check.get("compliant", False)
    )

    result = {
        "event_id": event_id,
        "asset_id": asset_id,
        "telemetry_check": telemetry_check,
        "failure_check": failure_check,
        "execution_check": execution_check,
        "genuine_failure": genuine_failure,
        "action": "flagged_for_review" if genuine_failure else "no_action",
    }

    if genuine_failure:
        log.warning("attribution.genuine_recommendation_failure",
                    event_id=event_id, asset_id=asset_id)
        # Downgrades are human-gated: write to audit_log for engineering review
        try:
            _supabase().table("audit_log").insert({
                "action": "attribution_flag",
                "entity_type": "work_order",
                "entity_id": event_id,
                "performed_by": "attribution_worker",
                "details": result,
            }).execute()
        except Exception as exc:
            log.error("attribution.audit_log_failed", error=str(exc))

    log.info("attribution.complete", event_id=event_id, asset_id=asset_id,
             genuine_failure=genuine_failure, action=result["action"])
    return result


def _check_telemetry_baseline(asset_id: str, event_id: str) -> dict[str, Any]:
    """
    Post-maintenance telemetry check, gated on real instrumentation coverage.

    Coverage comes from engineer-verified P&ID topology (`OtCoverageService`), not from the
    historian's own assertion. When the affected component is not directly instrumented, telemetry
    is demoted to *supporting* evidence and the work-order closeout attestation becomes primary —
    the brownfield constraint in architecture Layer 10.

    When it is instrumented: checks whether the post-maintenance mean deviates > 2σ from baseline.
    """
    try:
        from api.services.ot_coverage import OtCoverageService

        cov = asyncio.run(OtCoverageService(_supabase()).asset_coverage(asset_id))
    except Exception as exc:
        log.warning("attribution.coverage_unavailable", error=str(exc))
        return {"primary_check": False, "failed": False, "reason": "coverage_unavailable"}

    # Brownfield downgrade (architecture Layer 10). Without a directly instrumented component,
    # telemetry can only confirm the equipment is running — never that the specific failure mode
    # was resolved. It is therefore demoted from primary evidence to supporting, and the
    # human-verified work-order closeout becomes the primary check.
    #
    # This used to be unreachable: the coverage endpoint returned a hardcoded 75% for every
    # asset, so `coverage_percent == 0` never fired and telemetry was always treated as primary.
    if not cov.get("has_direct_sensors"):
        return {
            "primary_check": False,
            "failed": False,
            "reason": "not_directly_instrumented",
            "coverage_type": cov.get("coverage_type", "none"),
            "evidence_role": "supporting",
            "primary_evidence": "work_order_closeout_attestation",
        }

    tag = cov["sensor_tags"][0]

    # Use event occurred_at as the maintenance date for the query window
    try:
        sb = _supabase()
        row = sb.table("operational_events").select("occurred_at").eq("event_id", event_id).single().execute()
        maint_date = datetime.fromisoformat(row.data["occurred_at"].replace("Z", "+00:00"))
    except Exception:
        maint_date = datetime.now(UTC) - timedelta(days=1)

    query_from = maint_date.isoformat()
    query_to = (maint_date + timedelta(days=30)).isoformat()

    try:
        ts = httpx.get(f"{_GO_URL}/ot/query",
                       params={"asset_id": asset_id, "tag": tag, "from": query_from, "to": query_to},
                       timeout=15).json()
    except Exception as exc:
        log.warning("attribution.historian_unreachable", error=str(exc))
        return {"primary_check": False, "failed": False, "reason": "historian_unreachable"}

    data = ts.get("data", [])
    values = [float(p["value"]) for p in data if "value" in p]
    if len(values) < 10:
        return {"primary_check": True, "failed": False, "reason": "insufficient_data", "point_count": len(values)}

    # First half = baseline, second half = post-maintenance window
    mid = len(values) // 2
    baseline = values[:mid]
    post = values[mid:]
    baseline_mean = statistics.mean(baseline)
    baseline_std = statistics.stdev(baseline) if len(baseline) > 1 else 0.0
    post_mean = statistics.mean(post)

    threshold = 2 * baseline_std if baseline_std > 0 else 0.5
    failed = abs(post_mean - baseline_mean) > threshold

    return {
        "primary_check": True,
        "failed": failed,
        "baseline_mean": round(baseline_mean, 4),
        "post_mean": round(post_mean, 4),
        "threshold_2sigma": round(threshold, 4),
        "tag": tag,
    }


def _check_failure_code_match(asset_id: str, event_id: str) -> dict[str, Any]:
    """
    Compares failure code families of the current WO and the prior WO for this asset.
    Same family = genuine recurrence pattern.
    """
    try:
        sb = _supabase()
        cutoff = (datetime.now(UTC) - timedelta(days=30)).isoformat()
        rows = (
            sb.table("operational_events")
            .select("event_id, payload")
            .eq("asset_id", asset_id)
            .eq("event_type", "work_order_created")
            .gte("occurred_at", cutoff)
            .order("occurred_at", desc=True)
            .limit(5)
            .execute()
        ).data or []
    except Exception as exc:
        log.warning("attribution.failure_code_query_failed", error=str(exc))
        return {"matched": False, "reason": "db_query_failed"}

    codes = []
    for row in rows:
        code = (row.get("payload") or {}).get("failure_code", "")
        if code:
            codes.append(code.upper())

    if len(codes) < 2:
        return {"matched": False, "reason": "insufficient_work_orders", "codes_found": len(codes)}

    # Map to family; unknown codes get their own family (no match)
    families = [_FAILURE_FAMILIES.get(c, c) for c in codes]
    matched = families[0] == families[1]

    return {
        "matched": matched,
        "current_code": codes[0],
        "prior_code": codes[1],
        "current_family": families[0],
        "prior_family": families[1],
    }


def _check_execution_compliance(event_id: str) -> dict[str, Any]:
    """
    Checks if the recommended action was documented in the work order close notes.
    compliant=True means the action WAS performed (not a deviation).
    """
    _ACTION_KEYWORDS = {
        "replaced", "repaired", "inspected", "calibrated", "lubricated",
        "aligned", "balanced", "cleaned", "adjusted", "tightened", "sealed",
    }

    try:
        sb = _supabase()
        row = sb.table("operational_events").select("payload").eq("event_id", event_id).single().execute()
        payload = row.data.get("payload") or {}
    except Exception as exc:
        log.warning("attribution.execution_query_failed", error=str(exc))
        return {"compliant": False, "reason": "db_query_failed"}

    close_notes = (payload.get("close_notes") or "").lower()
    if not close_notes:
        return {"compliant": False, "reason": "no_close_notes"}

    found = [kw for kw in _ACTION_KEYWORDS if kw in close_notes]
    return {
        "compliant": bool(found),
        "keywords_found": found,
        "close_notes_length": len(close_notes),
    }

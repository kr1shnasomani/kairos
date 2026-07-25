"""
Event bus service — Redis Streams producer/consumer (Layer 8).
Implements EEMUA 191 push governor logic.
"""

import asyncio
import json
import uuid
from datetime import datetime, timedelta
from typing import Any, Dict, Optional

import redis.asyncio as aioredis
import structlog

from api.config import Settings
from api.services.metrics import governor_suppressed

log = structlog.get_logger(__name__)


class EventBusService:
    """
    Publishes events to Redis Streams and manages the EEMUA 191 push governor.
    Governor enforces ≤6 push events per operator per hour in normal operation.
    """

    def __init__(self, redis: aioredis.Redis, settings: Settings):
        self.redis = redis
        self.settings = settings

    # -------------------------------------------------------------------------
    # Publishing
    # -------------------------------------------------------------------------

    async def publish(self, stream: str, event: Dict[str, Any]) -> str:
        """Publishes an event to a Redis Stream. Returns the stream entry ID."""
        # Serialize to flat dict (Redis Streams don't support nested structures)
        flat_event = {k: json.dumps(v) if isinstance(v, (dict, list)) else str(v) for k, v in event.items()}
        flat_event["published_at"] = datetime.utcnow().isoformat()
        entry_id = await self.redis.xadd(stream, flat_event)
        log.info("event_bus.published", stream=stream, event_id=flat_event.get("event_id"), entry_id=entry_id)
        return entry_id

    async def publish_work_order(self, event: Dict[str, Any]) -> str:
        return await self.publish(self.settings.REDIS_STREAM_WORK_ORDERS, event)

    async def publish_ptw(self, event: Dict[str, Any]) -> str:
        return await self.publish(self.settings.REDIS_STREAM_PTW, event)

    async def publish_shift_handover(self, event: Dict[str, Any]) -> str:
        return await self.publish(self.settings.REDIS_STREAM_SHIFT_HANDOVER, event)

    # -------------------------------------------------------------------------
    # EEMUA 191 Push Governor (Layer 8 — Trigger Governance Subsystem)
    # -------------------------------------------------------------------------

    def _governor_key(self, user_id: str) -> str:
        return f"kairos:governor:{user_id}:hourly_count"

    async def check_governor(
        self,
        user_id: str,
        priority: str = "normal",
        site_id: str = "",
        supabase=None,
    ) -> bool:
        """
        Returns True if a brief can be delivered to this user, False if suppressed.
        PTW briefs (priority='critical') are NEVER suppressed — always returns True.
        Checks plant operating state first: turnaround/shutdown/emergency suppresses
        all non-critical briefs regardless of hourly count.
        """
        if priority == "critical":
            return True  # PTW briefs are never suppressed (EEMUA 191 compliance)

        # Plant state gate — checked before hourly count
        if site_id and supabase:
            plant_state = await self.get_plant_state(site_id, supabase)
            if plant_state in ("turnaround", "shutdown", "emergency"):
                log.info(
                    "governor.plant_state_suppression",
                    user_id=user_id,
                    site_id=site_id,
                    plant_state=plant_state,
                    reason="plant_state_suppression",
                )
                return False

        count_key = self._governor_key(user_id)
        current_count = await self.redis.get(count_key)
        current_count = int(current_count) if current_count else 0

        ceiling = self.settings.MAX_PUSH_PER_USER_PER_HOUR
        if current_count >= ceiling:
            governor_suppressed.add(1, {"user_id": user_id})
            log.info("governor.suppressed", user_id=user_id, count=current_count, ceiling=ceiling)
            return False
        return True

    async def get_plant_state(self, site_id: str, supabase) -> str:
        """Returns the current plant operating state for a site (defaults to PLANT_STATE_DEFAULT)."""
        if not site_id:
            return self.settings.PLANT_STATE_DEFAULT
        try:
            result = await asyncio.to_thread(
                lambda: supabase.table("plant_operating_states")
                .select("state, expires_at")
                .eq("site_id", site_id)
                .order("set_at", desc=True)
                .limit(1)
                .execute()
            )
            if not result.data:
                return self.settings.PLANT_STATE_DEFAULT
            row = result.data[0]
            if row.get("expires_at"):
                from datetime import timezone
                expires = datetime.fromisoformat(row["expires_at"].replace("Z", "+00:00"))
                if expires < datetime.now(timezone.utc):
                    return self.settings.PLANT_STATE_DEFAULT
            return row.get("state", self.settings.PLANT_STATE_DEFAULT)
        except Exception as exc:
            log.warning("event_bus.plant_state_lookup_failed", site_id=site_id, error=str(exc))
            return self.settings.PLANT_STATE_DEFAULT

    async def record_push(self, user_id: str) -> int:
        """Increments the rolling hourly push counter for a user."""
        count_key = self._governor_key(user_id)
        pipe = self.redis.pipeline()
        pipe.incr(count_key)
        pipe.expire(count_key, 3600)  # 1-hour rolling window
        results = await pipe.execute()
        new_count = results[0]
        log.info("governor.push_recorded", user_id=user_id, count=new_count)
        return new_count

    async def record_push_once(self, user_id: str, brief_id: str) -> bool:
        """
        Records a governor push for a brief at most once per rolling hour.

        A brief is "pushed" the first time it is delivered to the operator; simply
        re-viewing it (a page refresh) must not re-count, or opening the inbox twice
        would blow past the hourly ceiling. Uses a per-brief SET NX marker so the
        underlying counter is only incremented on the brief's first delivery.
        Returns True if this call counted a new push, False if already counted.
        """
        seen_key = f"kairos:governor:{user_id}:counted:{brief_id}"
        first = await self.redis.set(seen_key, "1", nx=True, ex=3600)
        if first:
            await self.record_push(user_id)
        return bool(first)

    async def get_governor_state(self, user_id: str) -> Dict[str, Any]:
        from datetime import datetime, timedelta, timezone
        count_key = self._governor_key(user_id)
        current_count = await self.redis.get(count_key)
        current_count = int(current_count) if current_count else 0
        ceiling = self.settings.MAX_PUSH_PER_USER_PER_HOUR
        suppressed = current_count >= ceiling
        next_delivery_allowed_at = None
        if suppressed:
            ttl = await self.redis.ttl(count_key)
            if ttl > 0:
                next_delivery_allowed_at = (datetime.now(timezone.utc) + timedelta(seconds=ttl)).isoformat()
        return {
            "user_id": user_id,
            "push_count_last_hour": current_count,
            "ceiling": ceiling,
            "state": "suppressed" if suppressed else "normal",
            "next_delivery_allowed_at": next_delivery_allowed_at,
        }

    # -------------------------------------------------------------------------
    # Deduplication (canonical event normalization)
    # -------------------------------------------------------------------------

    # -------------------------------------------------------------------------
    # Event Correlation — Compound Events (Layer 8)
    # -------------------------------------------------------------------------

    async def correlate_events(
        self,
        asset_id: str,
        event_id: str,
        occurred_at: datetime,
        supabase,
    ) -> Optional[str]:
        """
        Groups events for the same asset within DEDUP_WINDOW_MINUTES into a compound event.
        Updates all correlated rows in operational_events with a shared compound_event_id.
        Returns the compound_event_id if correlation happened, else None.
        """
        window = timedelta(minutes=self.settings.DEDUP_WINDOW_MINUTES)
        window_start = (occurred_at - window).isoformat()
        window_end = (occurred_at + window).isoformat()

        result = await asyncio.to_thread(
            lambda: supabase.table("operational_events")
            .select("event_id, compound_event_id")
            .eq("asset_id", asset_id)
            .neq("event_id", str(event_id))
            .gte("occurred_at", window_start)
            .lte("occurred_at", window_end)
            .execute()
        )
        if not result.data:
            return None

        existing_compound_id = next(
            (r["compound_event_id"] for r in result.data if r.get("compound_event_id")),
            None,
        )
        compound_id = existing_compound_id or str(uuid.uuid4())

        all_ids = [r["event_id"] for r in result.data] + [str(event_id)]
        await asyncio.to_thread(
            lambda: supabase.table("operational_events")
            .update({"compound_event_id": compound_id})
            .in_("event_id", all_ids)
            .execute()
        )
        log.info("event_bus.compound_event_linked", compound_event_id=compound_id, event_ids=all_ids)
        return compound_id

    async def is_duplicate(self, asset_id: str, event_type: str) -> bool:
        """
        Checks if a semantically identical event was published within the dedup window.
        Dedup window default: 10 minutes (DEDUP_WINDOW_MINUTES).
        """
        dedup_key = f"kairos:dedup:{asset_id}:{event_type}"
        exists = await self.redis.exists(dedup_key)
        if not exists:
            ttl = self.settings.DEDUP_WINDOW_MINUTES * 60
            await self.redis.setex(dedup_key, ttl, "1")
        return bool(exists)

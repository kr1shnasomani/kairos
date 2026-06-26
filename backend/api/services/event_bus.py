"""
Event bus service — Redis Streams producer/consumer (Layer 8).
Implements EEMUA 191 push governor logic.
"""

import json
import time
from datetime import datetime
from typing import Any, Dict, Optional

import redis.asyncio as aioredis
import structlog

from api.config import Settings

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

    async def check_governor(self, user_id: str, priority: str = "normal") -> bool:
        """
        Returns True if a brief can be delivered to this user, False if suppressed.
        PTW briefs (priority='critical') are NEVER suppressed — always returns True.
        """
        if priority == "critical":
            return True  # PTW briefs are never suppressed (EEMUA 191 compliance)

        count_key = self._governor_key(user_id)
        current_count = await self.redis.get(count_key)
        current_count = int(current_count) if current_count else 0

        ceiling = self.settings.MAX_PUSH_PER_USER_PER_HOUR
        if current_count >= ceiling:
            log.info("governor.suppressed", user_id=user_id, count=current_count, ceiling=ceiling)
            return False
        return True

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

    async def get_governor_state(self, user_id: str) -> Dict[str, Any]:
        count_key = self._governor_key(user_id)
        current_count = await self.redis.get(count_key)
        current_count = int(current_count) if current_count else 0
        ceiling = self.settings.MAX_PUSH_PER_USER_PER_HOUR
        return {
            "user_id": user_id,
            "push_count_last_hour": current_count,
            "ceiling": ceiling,
            "state": "suppressed" if current_count >= ceiling else "normal",
        }

    # -------------------------------------------------------------------------
    # Deduplication (canonical event normalization)
    # -------------------------------------------------------------------------

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

"""
Events router — Layer 8: Operational Event Subscription and Proactive Delivery.
Receives work orders, PTW events, shift handovers, alarms from operational systems.
Publishes to Redis Streams for async brief generation.
"""

import asyncio

import structlog
from fastapi import APIRouter, status

from api.dependencies import CurrentUserDep, ElasticsearchDep, Neo4jDep, QdrantDep, RedisDep, SettingsDep, SupabaseDep
from api.models.event import (
    AlarmEvent,
    EventAck,
    PTWEvent,
    ShiftHandoverEvent,
    WorkOrderEvent,
)
from api.services.brief_engine import BriefEngine
from api.services.event_bus import EventBusService
from workers.attribution import evaluate_outcome

log = structlog.get_logger(__name__)
router = APIRouter()


@router.post("/work-order", summary="Ingest work order event", status_code=status.HTTP_202_ACCEPTED)
async def ingest_work_order(
    payload: WorkOrderEvent,
    current_user: CurrentUserDep,
    redis: RedisDep,
    supabase: SupabaseDep,
    settings: SettingsDep,
    driver: Neo4jDep,
    qdrant: QdrantDep,
    es: ElasticsearchDep,
) -> dict:
    """
    Receives a work order creation event from CMMS/EAM.
    Canonical deduplication: same asset + event_type within 10-min window → deduplicated.
    Persists to operational_events, publishes to Redis Stream for brief assembly.
    """
    bus = EventBusService(redis, settings)

    if await bus.is_duplicate(payload.asset_id, payload.event_type):
        log.info("events.work_order_deduplicated", event_id=payload.event_id, asset_id=payload.asset_id)
        return {"status": "deduplicated", "event_id": payload.event_id,
                "message": "Identical event received within dedup window."}

    event_dict = payload.model_dump(mode="json")

    await asyncio.to_thread(
        lambda: supabase.table("operational_events").insert({
            "event_id": payload.event_id,
            "event_type": payload.event_type,
            "source_system": payload.source_system,
            "site_id": payload.site_id,
            "asset_id": payload.asset_id,
            "payload": event_dict,
            "occurred_at": payload.occurred_at.isoformat(),
            "received_at": payload.received_at.isoformat(),
        }).execute()
    )

    stream_id = await bus.publish_work_order(event_dict)

    await asyncio.to_thread(
        lambda sid=stream_id: supabase.table("operational_events")
        .update({"redis_stream_id": sid})
        .eq("event_id", payload.event_id)
        .execute()
    )

    engine = BriefEngine(driver, qdrant, es, supabase, settings)
    brief = await engine.assemble_work_order_brief(payload)
    brief_id = await engine.deliver(brief, redis)

    # Attribution: if this asset had a prior WO in the last 30 days, evaluate outcome
    try:
        from datetime import datetime, timedelta, timezone
        cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
        count_result = await asyncio.to_thread(
            lambda: supabase.table("operational_events")
            .select("event_id", count="exact")
            .eq("asset_id", payload.asset_id)
            .eq("event_type", payload.event_type)
            .gte("occurred_at", cutoff)
            .execute()
        )
        if (count_result.count or 0) > 1:
            evaluate_outcome.delay(str(payload.event_id), payload.asset_id)
            log.info("attribution.enqueued", event_id=str(payload.event_id), asset_id=payload.asset_id)
    except Exception as exc:
        log.warning("attribution.enqueue_failed", error=str(exc))

    log.info("events.work_order_ingested", event_id=payload.event_id, asset_id=payload.asset_id,
             stream_id=stream_id, brief_id=brief_id)
    return {"status": "accepted", "event_id": payload.event_id, "stream_entry_id": stream_id,
            "brief_id": brief_id}


@router.post("/ptw", summary="Ingest Permit-to-Work event", status_code=status.HTTP_202_ACCEPTED)
async def ingest_ptw(
    payload: PTWEvent,
    current_user: CurrentUserDep,
    redis: RedisDep,
    supabase: SupabaseDep,
    settings: SettingsDep,
    driver: Neo4jDep,
    qdrant: QdrantDep,
    es: ElasticsearchDep,
) -> dict:
    """
    PTW events always trigger a safety brief with mandatory sign-off.
    Never deduplicated. Publishes to PTW stream AND directly to BRIEFS stream
    with priority=critical to bypass the EEMUA 191 governor.
    """
    bus = EventBusService(redis, settings)
    event_dict = payload.model_dump(mode="json")
    primary_asset_id = payload.asset_ids[0] if payload.asset_ids else None

    await asyncio.to_thread(
        lambda: supabase.table("operational_events").insert({
            "event_id": payload.event_id,
            "event_type": payload.event_type,
            "source_system": payload.source_system,
            "site_id": payload.site_id,
            "asset_id": primary_asset_id,
            "payload": event_dict,
            "occurred_at": payload.occurred_at.isoformat(),
            "received_at": payload.received_at.isoformat(),
        }).execute()
    )

    stream_id = await bus.publish_ptw(event_dict)

    # Publish directly to briefs stream with critical priority — bypasses governor
    await bus.publish(settings.REDIS_STREAM_BRIEFS, {
        **event_dict,
        "priority": "critical",
        "trigger_event_type": payload.event_type,
    })

    await asyncio.to_thread(
        lambda sid=stream_id: supabase.table("operational_events")
        .update({"redis_stream_id": sid})
        .eq("event_id", payload.event_id)
        .execute()
    )

    engine = BriefEngine(driver, qdrant, es, supabase, settings)
    brief = await engine.assemble_ptw_brief(payload)
    brief_id = await engine.deliver(brief, redis)

    log.info("events.ptw_ingested", event_id=payload.event_id, ptw_id=payload.ptw_id,
             stream_id=stream_id, brief_id=brief_id)
    return {"status": "accepted", "event_id": payload.event_id, "priority": "critical",
            "stream_entry_id": stream_id, "brief_id": brief_id}


@router.post("/shift-handover", summary="Ingest shift handover event", status_code=status.HTTP_202_ACCEPTED)
async def ingest_shift_handover(
    payload: ShiftHandoverEvent,
    current_user: CurrentUserDep,
    redis: RedisDep,
    supabase: SupabaseDep,
    settings: SettingsDep,
    driver: Neo4jDep,
    qdrant: QdrantDep,
    es: ElasticsearchDep,
) -> dict:
    """Triggers a shift handover brief for the incoming crew."""
    bus = EventBusService(redis, settings)
    event_dict = payload.model_dump(mode="json")

    await asyncio.to_thread(
        lambda: supabase.table("operational_events").insert({
            "event_id": payload.event_id,
            "event_type": payload.event_type,
            "source_system": payload.source_system,
            "site_id": payload.site_id,
            "asset_id": None,
            "payload": event_dict,
            "occurred_at": payload.occurred_at.isoformat(),
            "received_at": payload.received_at.isoformat(),
        }).execute()
    )

    stream_id = await bus.publish_shift_handover(event_dict)

    await asyncio.to_thread(
        lambda sid=stream_id: supabase.table("operational_events")
        .update({"redis_stream_id": sid})
        .eq("event_id", payload.event_id)
        .execute()
    )

    engine = BriefEngine(driver, qdrant, es, supabase, settings)
    brief = await engine.assemble_shift_handover_brief(payload)
    brief_id = await engine.deliver(brief, redis)

    log.info("events.shift_handover_ingested", event_id=payload.event_id, stream_id=stream_id,
             brief_id=brief_id)
    return {"status": "accepted", "event_id": payload.event_id, "stream_entry_id": stream_id,
            "brief_id": brief_id}


@router.post("/alarm", summary="Ingest alarm acknowledgment event", status_code=status.HTTP_202_ACCEPTED)
async def ingest_alarm(
    payload: AlarmEvent,
    current_user: CurrentUserDep,
    redis: RedisDep,
    supabase: SupabaseDep,
    settings: SettingsDep,
) -> dict:
    """Received when an operator acknowledges a DCS process alarm."""
    bus = EventBusService(redis, settings)
    event_dict = payload.model_dump(mode="json")

    await asyncio.to_thread(
        lambda: supabase.table("operational_events").insert({
            "event_id": payload.event_id,
            "event_type": payload.event_type,
            "source_system": payload.source_system,
            "site_id": payload.site_id,
            "asset_id": payload.asset_id,
            "payload": event_dict,
            "occurred_at": payload.occurred_at.isoformat(),
            "received_at": payload.received_at.isoformat(),
        }).execute()
    )

    stream_id = await bus.publish(settings.REDIS_STREAM_ALARMS, event_dict)

    await asyncio.to_thread(
        lambda sid=stream_id: supabase.table("operational_events")
        .update({"redis_stream_id": sid})
        .eq("event_id", payload.event_id)
        .execute()
    )

    log.info("events.alarm_ingested", event_id=payload.event_id, alarm_id=payload.alarm_id,
             stream_id=stream_id)
    return {"status": "accepted", "event_id": payload.event_id, "stream_entry_id": stream_id}


@router.post("/{event_id}/ack", summary="Acknowledge receipt of a brief")
async def acknowledge_event(
    event_id: str,
    payload: EventAck,
    current_user: CurrentUserDep,
    supabase: SupabaseDep,
) -> dict:
    """
    Records cryptographically signed acknowledgment of a proactive brief.
    Audit trail: what knowledge was available, when delivered, confirmed by whom.
    """
    await asyncio.to_thread(
        lambda: supabase.table("audit_log").insert({
            "action": "brief_acknowledged",
            "entity_type": "event",
            "entity_id": event_id,
            "performed_by": payload.user_id,
            "details": {
                "event_id": event_id,
                "timestamp": payload.acknowledged_at.isoformat(),
                "signature": payload.signature,
                "role": payload.role,
                "notes": payload.notes,
            },
        }).execute()
    )
    log.info("events.brief_acknowledged", event_id=event_id, user_id=payload.user_id)
    return {"status": "acknowledged", "event_id": event_id, "user_id": payload.user_id}

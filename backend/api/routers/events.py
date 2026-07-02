"""
Events router — Layer 8: Operational Event Subscription and Proactive Delivery.
Receives work orders, PTW events, shift handovers, alarms from operational systems.
Publishes to Redis Streams for async brief generation.
"""

import asyncio
from datetime import datetime, timezone

import shortuuid
import structlog
from fastapi import APIRouter, Depends, HTTPException, status

from api.dependencies import CurrentUserDep, ElasticsearchDep, Neo4jDep, QdrantDep, RedisDep, SettingsDep, SupabaseDep, require_role
from api.models.event import (
    AlarmEvent,
    DeviationFlagEvent,
    DeviationFlagResolveRequest,
    EventAck,
    PlantStateEvent,
    PTWEvent,
    ShiftHandoverEvent,
    WorkOrderEvent,
)
from api.services.brief_engine import BriefEngine
from api.services.event_bus import EventBusService
from workers.attribution import evaluate_outcome
from workers.brief_assembly import assemble_brief

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

    # Correlate with other events for the same asset within DEDUP_WINDOW_MINUTES
    await bus.correlate_events(payload.asset_id, str(payload.event_id), payload.occurred_at, supabase)

    # Delay brief assembly to allow correlated events (e.g. PTW) to arrive first.
    # If a pending task already exists for this asset, revoke it and re-enqueue so
    # the brief captures context from both events once assembled.
    window_secs = settings.LATE_ARRIVAL_WINDOW_MINUTES * 60
    pending_key = f"kairos:brief_pending:{payload.asset_id}"
    existing_id = await redis.get(pending_key)
    if existing_id:
        from workers.celery_app import celery_app as _app
        _app.control.revoke(existing_id, terminate=False)
        log.info("events.deferred_brief_revoked", asset_id=payload.asset_id, revoked_task=existing_id)
    task = assemble_brief.apply_async(args=[payload.event_type, event_dict], countdown=window_secs)
    await redis.setex(pending_key, window_secs + 60, task.id)
    task_id = task.id

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
             stream_id=stream_id, brief_task_id=task_id, brief_due_in_seconds=window_secs)
    return {"status": "accepted", "event_id": payload.event_id, "stream_entry_id": stream_id,
            "brief_task_id": task_id, "brief_due_in_seconds": window_secs}


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

    # PTW is always critical/immediate. Revoke any pending delayed brief for this asset
    # so we generate ONE brief (PTW's) with context from both events already in the DB.
    if primary_asset_id:
        existing_id = await redis.get(f"kairos:brief_pending:{primary_asset_id}")
        if existing_id:
            from workers.celery_app import celery_app as _app
            _app.control.revoke(existing_id, terminate=False)
            await redis.delete(f"kairos:brief_pending:{primary_asset_id}")
            log.info("events.ptw_revoked_pending_brief", asset_id=primary_asset_id, revoked_task=existing_id)

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

    window_secs = settings.LATE_ARRIVAL_WINDOW_MINUTES * 60
    pending_key = f"kairos:brief_pending:shift:{payload.site_id}"
    existing_id = await redis.get(pending_key)
    if existing_id:
        from workers.celery_app import celery_app as _app
        _app.control.revoke(existing_id, terminate=False)
        log.info("events.deferred_shift_brief_revoked", site_id=payload.site_id, revoked_task=existing_id)
    task = assemble_brief.apply_async(args=[payload.event_type, event_dict], countdown=window_secs)
    await redis.setex(pending_key, window_secs + 60, task.id)
    task_id = task.id

    log.info("events.shift_handover_ingested", event_id=payload.event_id, stream_id=stream_id,
             brief_task_id=task_id, brief_due_in_seconds=window_secs)
    return {"status": "accepted", "event_id": payload.event_id, "stream_entry_id": stream_id,
            "brief_task_id": task_id, "brief_due_in_seconds": window_secs}


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

    # Correlate alarm with other events for the same asset within DEDUP_WINDOW_MINUTES
    await bus.correlate_events(payload.asset_id, str(payload.event_id), payload.occurred_at, supabase)

    log.info("events.alarm_ingested", event_id=payload.event_id, alarm_id=payload.alarm_id,
             stream_id=stream_id)
    return {"status": "accepted", "event_id": payload.event_id, "stream_entry_id": stream_id}


# =============================================================================
# Physical Deviation Flag (Layer 6 / Layer 8)
# =============================================================================

@router.post("/deviation-flag", summary="Flag a physical deviation from engineering drawings", status_code=status.HTTP_202_ACCEPTED)
async def flag_deviation(
    payload: DeviationFlagEvent,
    current_user: CurrentUserDep,
    supabase: SupabaseDep,
    redis: RedisDep,
    settings: SettingsDep,
) -> dict:
    """
    Field technicians flag a physical state that does not match engineering drawings.
    Freezes all unacknowledged briefs for the affected asset until an engineer resolves it.
    Publishes to REDIS_STREAM_ALARMS with severity=critical.
    """
    reported_by = payload.reported_by or current_user.get("user_id", "unknown")

    insert_result = await asyncio.to_thread(
        lambda: supabase.table("quarantine_items").insert({
            "asset_id": payload.asset_id,
            "content": payload.description,
            "input_type": "deviation_flag",
            "submitted_by": reported_by,
            "session_context": {
                "reported_by": reported_by,
                "affected_topology_path": payload.affected_topology_path,
                "asset_id": payload.asset_id,
            },
        }).execute()
    )
    item_id = insert_result.data[0]["item_id"]

    # Freeze all unacknowledged briefs for this asset
    frozen_result = await asyncio.to_thread(
        lambda: supabase.table("briefs")
        .update({"delivery_frozen": True})
        .eq("asset_id", payload.asset_id)
        .is_("acknowledged_at", "null")
        .execute()
    )
    frozen_count = len(frozen_result.data or [])

    bus = EventBusService(redis, settings)
    stream_id = await bus.publish(settings.REDIS_STREAM_ALARMS, {
        "event_type": "deviation_flag",
        "asset_id": payload.asset_id,
        "description": payload.description,
        "severity": "critical",
        "item_id": item_id,
        "reported_by": reported_by,
    })

    await asyncio.to_thread(
        lambda: supabase.table("audit_log").insert({
            "action": "deviation_flag_raised",
            "entity_type": "quarantine_item",
            "entity_id": item_id,
            "performed_by": reported_by,
            "details": {
                "asset_id": payload.asset_id,
                "description": payload.description,
                "affected_topology_path": payload.affected_topology_path,
                "briefs_frozen": frozen_count,
                "stream_id": stream_id,
            },
        }).execute()
    )

    log.info("events.deviation_flag_raised", item_id=item_id, asset_id=payload.asset_id, frozen_count=frozen_count)
    return {
        "status": "accepted",
        "item_id": item_id,
        "asset_id": payload.asset_id,
        "briefs_frozen": frozen_count,
        "stream_entry_id": stream_id,
    }


@router.post("/deviation-flag/{item_id}/resolve", summary="Resolve a physical deviation flag")
async def resolve_deviation_flag(
    item_id: str,
    payload: DeviationFlagResolveRequest,
    supabase: SupabaseDep,
    current_user: dict = Depends(require_role("engineer", "admin")),
) -> dict:
    """
    Engineer resolves the deviation flag: promotes or disputes the quarantine item,
    unfreezes affected briefs, and optionally creates a MoC item if a topology change is confirmed.
    """
    if payload.resolution not in ("promoted", "disputed"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="resolution must be 'promoted' or 'disputed'")

    result = await asyncio.to_thread(
        lambda: supabase.table("quarantine_items")
        .select("item_id, review_status, asset_id, content")
        .eq("item_id", item_id)
        .eq("input_type", "deviation_flag")
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Deviation flag '{item_id}' not found")
    item = result.data[0]
    if item["review_status"] != "pending":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Already '{item['review_status']}'")

    asset_id = item.get("asset_id")
    now_iso = datetime.now(timezone.utc).isoformat()
    reviewer_id = current_user.get("user_id", "unknown")

    await asyncio.to_thread(
        lambda: supabase.table("quarantine_items").update({
            "review_status": payload.resolution,
            "reviewer_id": reviewer_id,
            "reviewed_at": now_iso,
        }).eq("item_id", item_id).execute()
    )

    # Unfreeze briefs for this asset
    unfreeze_result = await asyncio.to_thread(
        lambda: supabase.table("briefs")
        .update({"delivery_frozen": False})
        .eq("asset_id", asset_id)
        .eq("delivery_frozen", True)
        .execute()
    )
    unfrozen_count = len(unfreeze_result.data or [])

    # Create MoC item if topology change confirmed
    moc_id = None
    if payload.moc_warranted:
        moc_id = f"MOC-{shortuuid.uuid()[:8].upper()}"
        await asyncio.to_thread(
            lambda mid=moc_id: supabase.table("moc_items").insert({
                "moc_id": mid,
                "asset_id": asset_id,
                "description": f"Physical deviation confirmed: {item.get('content', '')}. {payload.notes or ''}".strip(),
                "conflicting_sources": [],
                "blast_radius": [],
                "status": "draft",
            }).execute()
        )

    await asyncio.to_thread(
        lambda: supabase.table("audit_log").insert({
            "action": "deviation_flag_resolved",
            "entity_type": "quarantine_item",
            "entity_id": item_id,
            "performed_by": reviewer_id,
            "details": {
                "asset_id": asset_id,
                "resolution": payload.resolution,
                "moc_warranted": payload.moc_warranted,
                "moc_id": moc_id,
                "notes": payload.notes,
                "briefs_unfrozen": unfrozen_count,
            },
        }).execute()
    )

    log.info("events.deviation_flag_resolved", item_id=item_id, resolution=payload.resolution, moc_id=moc_id)
    return {
        "status": "resolved",
        "item_id": item_id,
        "resolution": payload.resolution,
        "briefs_unfrozen": unfrozen_count,
        "moc_id": moc_id,
    }


@router.post("/plant-state", summary="Set plant operating state for a site", status_code=status.HTTP_202_ACCEPTED)
async def set_plant_state(
    payload: PlantStateEvent,
    supabase: SupabaseDep,
    current_user: dict = Depends(require_role("engineer", "admin")),
) -> dict:
    """
    Sets or updates the plant operating state for a site.
    turnaround/shutdown/emergency suppresses all non-critical briefs for that site.
    """
    now_iso = datetime.now(timezone.utc).isoformat()
    set_by = current_user.get("user_id", "unknown")

    await asyncio.to_thread(
        lambda: supabase.table("plant_operating_states").insert({
            "site_id": payload.site_id,
            "state": payload.state,
            "set_by": set_by,
            "set_at": now_iso,
            "expires_at": payload.expires_at.isoformat() if payload.expires_at else None,
        }).execute()
    )
    await asyncio.to_thread(
        lambda: supabase.table("audit_log").insert({
            "action": "plant_state_changed",
            "entity_type": "site",
            "entity_id": payload.site_id,
            "performed_by": set_by,
            "details": {
                "state": payload.state,
                "expires_at": payload.expires_at.isoformat() if payload.expires_at else None,
            },
        }).execute()
    )
    log.info("events.plant_state_set", site_id=payload.site_id, state=payload.state, set_by=set_by)
    return {"status": "set", "site_id": payload.site_id, "state": payload.state}


@router.get("/plant-state/{site_id}", summary="Get current plant operating state for a site")
async def get_plant_state_endpoint(
    site_id: str,
    current_user: CurrentUserDep,
    supabase: SupabaseDep,
    redis: RedisDep,
    settings: SettingsDep,
) -> dict:
    """Returns the active plant operating state for the operator dashboard banner."""
    bus = EventBusService(redis, settings)
    state = await bus.get_plant_state(site_id, supabase)
    return {"site_id": site_id, "state": state}


@router.get("/{event_id}", summary="Get event with correlated event IDs")
async def get_event(
    event_id: str,
    current_user: CurrentUserDep,
    supabase: SupabaseDep,
) -> dict:
    """Returns an operational event with its correlated_event_ids for the frontend audit trail."""
    result = await asyncio.to_thread(
        lambda: supabase.table("operational_events")
        .select("event_id, event_type, asset_id, occurred_at, payload, compound_event_id, redis_stream_id, received_at")
        .eq("event_id", event_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Event '{event_id}' not found")

    event = result.data[0]
    correlated_event_ids: list = []
    if event.get("compound_event_id"):
        corr = await asyncio.to_thread(
            lambda: supabase.table("operational_events")
            .select("event_id")
            .eq("compound_event_id", event["compound_event_id"])
            .neq("event_id", event_id)
            .execute()
        )
        correlated_event_ids = [r["event_id"] for r in (corr.data or [])]

    return {**event, "correlated_event_ids": correlated_event_ids}


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

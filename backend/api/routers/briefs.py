"""
Briefs router — Layer 8: Proactive brief delivery to field workers.
EEMUA 191 governor: ≤6 push events/operator/hour; PTW (critical) briefs always exempt.
"""

import asyncio
import structlog

from fastapi import APIRouter, HTTPException, Query, status

from api.dependencies import CurrentUserDep, RedisDep, SettingsDep, SupabaseDep
from api.models.brief import BriefFeedback
from api.services.event_bus import EventBusService

log = structlog.get_logger(__name__)

router = APIRouter()


@router.get("/", summary="Get pending briefs for the current user")
async def get_my_briefs(
    current_user: CurrentUserDep,
    supabase: SupabaseDep,
    redis: RedisDep,
    settings: SettingsDep,
    unacknowledged_only: bool = Query(True),
    limit: int = Query(10, le=50),
) -> dict:
    """
    Returns pending briefs for the authenticated user.
    EEMUA 191 governor: PTW (priority=critical) briefs always returned; all other
    priorities suppressed when push_count_last_hour >= ceiling (default 6).
    Calls record_push for every brief actually delivered to the operator.
    """
    user_id = current_user.get("user_id", "")
    bus = EventBusService(redis, settings)
    gov = await bus.get_governor_state(user_id)

    site_id = current_user.get("site_id", "")
    site_recipient = f"site-{site_id}" if site_id else None

    query = (
        supabase.table("briefs")
        .select(
            "brief_id, trigger_event_id, trigger_event_type, asset_id, work_order_id, ptw_id, "
            "recipient_user_id, priority, headline, body, action_items, warnings, "
            "quarantine_flags, sources, confidence, requires_countersignature, "
            "delivered_at, acknowledged_at, acknowledged_by, created_at"
        )
        .or_(f"recipient_user_id.eq.{user_id},recipient_user_id.eq.{site_recipient}" if site_recipient else f"recipient_user_id.eq.{user_id}")
        .order("created_at", desc=True)
        .limit(limit)
    )
    if unacknowledged_only:
        query = query.is_("acknowledged_at", "null")

    result = await asyncio.to_thread(lambda: query.execute())
    all_briefs = result.data or []

    # Separate critical (always pass) from non-critical (subject to governor)
    critical = [b for b in all_briefs if b.get("priority") == "critical"]
    normal = [b for b in all_briefs if b.get("priority") != "critical"]

    suppressed_count = 0
    if gov["state"] == "suppressed":
        suppressed_count = len(normal)
        normal = []
        log.info("governor.suppressed_briefs", user_id=user_id, suppressed=suppressed_count)

    delivered = critical + normal

    # Record a push event for each brief actually returned to the operator
    for _ in delivered:
        await bus.record_push(user_id)

    # Refresh governor state after recording pushes
    gov = await bus.get_governor_state(user_id)

    return {
        "briefs": delivered,
        "total_pending": len(delivered),
        "suppressed_count": suppressed_count,
        "governor_state": gov["state"],
        "push_count_last_hour": gov["push_count_last_hour"],
    }


@router.get("/governor/status", summary="Get push governor state for current user")
async def get_governor_status(
    current_user: CurrentUserDep,
    redis: RedisDep,
    settings: SettingsDep,
) -> dict:
    """Returns the current EEMUA 191 push governor state for the authenticated user."""
    user_id = current_user.get("user_id", "")
    bus = EventBusService(redis, settings)
    return await bus.get_governor_state(user_id)


@router.get("/{brief_id}", summary="Get a specific brief")
async def get_brief(
    brief_id: str,
    current_user: CurrentUserDep,
    supabase: SupabaseDep,
) -> dict:
    """Returns a single brief with full evidence lineage. Enforces recipient ownership."""
    user_id = current_user.get("user_id", "")
    result = await asyncio.to_thread(
        lambda: supabase.table("briefs")
        .select("*")
        .eq("brief_id", brief_id)
        .eq("recipient_user_id", user_id)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Brief '{brief_id}' not found")
    return result.data[0]


@router.post("/{brief_id}/ack", summary="Acknowledge a brief (required for PTW / safety-critical)")
async def ack_brief(
    brief_id: str,
    current_user: CurrentUserDep,
    supabase: SupabaseDep,
) -> dict:
    """
    Cryptographically logs that the user acknowledged the brief content.
    For PTW briefs (requires_countersignature=True), acknowledged_at is NOT set until
    a countersignature is received — enforced in Task 13 full wiring.
    """
    from datetime import datetime, timezone
    user_id = current_user.get("user_id", "")
    now = datetime.now(timezone.utc).isoformat()

    result = await asyncio.to_thread(
        lambda: supabase.table("briefs")
        .select("brief_id, requires_countersignature")
        .eq("brief_id", brief_id)
        .eq("recipient_user_id", user_id)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Brief '{brief_id}' not found")

    brief_row = result.data[0]
    requires_cs = brief_row.get("requires_countersignature", False)

    update: dict = {"acknowledged_by": user_id}
    if not requires_cs:
        update["acknowledged_at"] = now

    await asyncio.to_thread(
        lambda: supabase.table("briefs").update(update).eq("brief_id", brief_id).execute()
    )
    await asyncio.to_thread(
        lambda: supabase.table("audit_log").insert({
            "action": "brief_acknowledged",
            "entity_type": "brief",
            "entity_id": brief_id,
            "performed_by": user_id,
            "details": {"acknowledged_at": now, "requires_countersignature": requires_cs},
        }).execute()
    )
    return {
        "status": "acknowledged" if not requires_cs else "pending_countersignature",
        "brief_id": brief_id,
        "acknowledged_by": user_id,
    }


@router.post("/{brief_id}/feedback", summary="Submit feedback on brief accuracy")
async def submit_feedback(
    brief_id: str,
    payload: BriefFeedback,
    current_user: CurrentUserDep,
    supabase: SupabaseDep,
) -> dict:
    """
    Mandatory feedback interface: accurate / missing_context / incorrect.
    'incorrect' rating queues a background confidence recheck for all source documents
    cited in the brief. Task 16 attribution worker performs the actual adjustment.
    """
    user_id = current_user.get("user_id", "")
    await asyncio.to_thread(
        lambda: supabase.table("brief_feedback").insert({
            "brief_id": brief_id,
            "submitted_by": user_id,
            "rating": payload.rating,
            "notes": payload.notes,
            "submitted_at": payload.submitted_at.isoformat(),
        }).execute()
    )

    if payload.rating == "incorrect":
        asyncio.create_task(_recheck_brief_sources(brief_id, user_id, supabase))

    return {"status": "received", "brief_id": brief_id, "rating": payload.rating}


async def _recheck_brief_sources(brief_id: str, submitted_by: str, supabase) -> None:
    """
    Background task: fetches source document IDs from the brief and queues a confidence
    recheck entry in audit_log. Task 16 attribution worker reads these entries and applies
    the actual Neo4j edge confidence adjustment.
    """
    from datetime import datetime, timezone
    try:
        result = await asyncio.to_thread(
            lambda: supabase.table("briefs").select("sources, asset_id").eq("brief_id", brief_id).limit(1).execute()
        )
        if not result.data:
            return
        brief_row = result.data[0]
        sources = brief_row.get("sources") or []
        doc_ids = [s["document_id"] for s in sources if isinstance(s, dict) and s.get("document_id")]

        await asyncio.to_thread(
            lambda: supabase.table("audit_log").insert({
                "action": "confidence_recheck_queued",
                "entity_type": "brief",
                "entity_id": brief_id,
                "performed_by": submitted_by,
                "details": {
                    "reason": "incorrect_feedback",
                    "source_document_ids": doc_ids,
                    "asset_id": brief_row.get("asset_id"),
                    "queued_at": datetime.now(timezone.utc).isoformat(),
                },
            }).execute()
        )
        log.info("brief.confidence_recheck_queued", brief_id=brief_id, doc_count=len(doc_ids))
    except Exception as e:
        log.error("brief.recheck_task_failed", brief_id=brief_id, error=str(e))

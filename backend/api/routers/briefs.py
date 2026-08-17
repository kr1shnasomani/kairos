"""
Briefs router — Layer 8: Proactive brief delivery to field workers.
EEMUA 191 governor: ≤6 push events/operator/hour; PTW (critical) briefs always exempt.
"""

import asyncio
import hashlib
import hmac
from datetime import UTC, datetime

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status

from api.config import settings as app_settings
from api.dependencies import CurrentUserDep, RedisDep, SettingsDep, SupabaseDep, require_role
from api.models.brief import BriefFeedback
from api.services.event_bus import EventBusService

log = structlog.get_logger(__name__)

router = APIRouter()


def _sign_acknowledgment(secret: str, brief_id: str, user_id: str, action: str, at: str) -> str:
    """
    HMAC-SHA256 over the acknowledgment facts, keyed by APP_SECRET_KEY.

    ARCHITECTURE.md Layer 8 requires the acknowledgment to be "cryptographically signed with the
    user's identity" — this endpoint's docstring already claimed it was, but only a plain
    audit_log row was written, which anyone with table access could forge after the fact. The
    signature is stored in the immutable audit_log rather than on `briefs`, so no schema change
    is needed and the signed record lands where the audit trail already lives.

    Same construction as the MoC webhook verifier in routers/governance.py.
    """
    message = f"{brief_id}|{user_id}|{action}|{at}"
    return hmac.new(secret.encode(), message.encode(), hashlib.sha256).hexdigest()


def _brief_recipients(current_user: dict) -> list[str]:
    """Recipient ids a user may read: themselves plus their **site-wide** address
    (`site-{site_id}`). Site-wide briefs carry `recipient_user_id = site-{site_id}` and
    would otherwise be unopenable by any individual user. Mirrors the list endpoint's
    `.or_()` scoping so detail/ack agree with the list."""
    recipients = [current_user.get("user_id", "")]
    site_id = current_user.get("site_id", "")
    if site_id:
        recipients.append(f"site-{site_id}")
    return recipients


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
            "delivered_at, acknowledged_at, acknowledged_by, countersigned_by, countersigned_at, "
            "delivery_frozen, created_at"
        )
        .or_(f"recipient_user_id.eq.{user_id},recipient_user_id.eq.{site_recipient}" if site_recipient else f"recipient_user_id.eq.{user_id}")
        .order("created_at", desc=True)
        .limit(limit)
    )
    if unacknowledged_only:
        query = query.is_("acknowledged_at", "null")

    result = await asyncio.to_thread(lambda: query.execute())
    all_briefs = result.data or []

    # Frozen briefs are shown but excluded from governor push counting and delivery
    frozen = [b for b in all_briefs if b.get("delivery_frozen")]
    unfrozen = [b for b in all_briefs if not b.get("delivery_frozen")]

    # Separate critical (always pass) from non-critical (subject to governor) within unfrozen
    critical = [b for b in unfrozen if b.get("priority") == "critical"]
    normal = [b for b in unfrozen if b.get("priority") != "critical"]

    suppressed_count = 0
    if gov["state"] == "suppressed":
        suppressed_count = len(normal)
        normal = []
        log.info("governor.suppressed_briefs", user_id=user_id, suppressed=suppressed_count)

    # Plant state gate: turnaround/shutdown/emergency suppresses all non-critical briefs
    if normal and site_id:
        plant_state = await bus.get_plant_state(site_id, supabase)
        if plant_state in ("turnaround", "shutdown", "emergency"):
            suppressed_count += len(normal)
            log.info(
                "governor.plant_state_suppression",
                user_id=user_id,
                site_id=site_id,
                plant_state=plant_state,
                suppressed=len(normal),
                reason="plant_state_suppression",
            )
            normal = []

    # Priority order within what is delivered (architecture Layer 8, trigger governance): PTW
    # safety briefs first, then recurring-failure detections ahead of first-occurrence, then
    # everything else. Previously the split was only critical-vs-rest and the remainder kept
    # created_at order, so a routine brief could sit above a recurring-failure one.
    _RANK = {"critical": 0, "high": 1, "normal": 2, "medium": 2, "low": 3}

    def _priority_rank(b: dict) -> tuple[int, int]:
        rank = _RANK.get(b.get("priority") or "normal", 2)
        recurring = 0 if b.get("trigger_event_type") == "recurring_failure_detected" else 1
        return (rank, recurring)

    delivered = sorted(critical + normal, key=_priority_rank)

    # Each brief counts against the EEMUA governor exactly ONCE per rolling hour.
    # record_push_once is idempotent per brief_id, so re-opening the inbox (a page
    # refresh) never re-pushes already-delivered briefs — otherwise simply viewing
    # your briefs twice would exhaust the ceiling and suppress your own inbox.
    now = datetime.now(UTC)
    for b in delivered:
        delivered_at_str = b.get("delivered_at")
        if delivered_at_str:
            try:
                dt = datetime.fromisoformat(delivered_at_str.replace("Z", "+00:00"))
                if (now - dt).total_seconds() > 3600:
                    continue
            except ValueError:
                pass
        await bus.record_push_once(user_id, b["brief_id"])

    # Refresh governor state after recording pushes
    gov = await bus.get_governor_state(user_id)

    # Tag frozen briefs so the frontend can render the freeze banner
    for b in frozen:
        b["frozen"] = True
        b["freeze_reason"] = "Physical deviation flag pending resolution"

    return {
        "briefs": delivered + frozen,
        "total_pending": len(delivered) + len(frozen),
        "suppressed_count": suppressed_count,
        "governor_state": {
            "push_count_last_hour": gov["push_count_last_hour"],
            "ceiling": gov["ceiling"],
            "state": gov["state"],
        },
        "next_delivery_allowed_at": gov.get("next_delivery_allowed_at"),
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
    """Returns a single brief with full evidence lineage. Enforces recipient ownership —
    the user's own briefs plus **site-wide** briefs addressed to their site (`site-{site_id}`),
    which would otherwise be unopenable by anyone.

    One deliberate exception: **any staff role may open a PTW brief addressed to someone else.**
    A permit-to-work brief is a posted safety document for a work area, not private
    correspondence — Flow B has the issuing engineer acknowledge it and a *different* authority
    countersign, so at minimum two people must be able to read it, and in practice anyone working
    that isolation needs to. Restricting it to the recipient made the dual sign-off impossible.

    The exception is narrow: PTW briefs only, staff roles only. It does not widen the inbox
    listing, and it does not grant the right to *sign* — countersigning remains reliability/admin
    (`require_role` + OPA `can_countersign_brief`)."""
    result = await asyncio.to_thread(
        lambda: supabase.table("briefs")
        .select("*")
        .eq("brief_id", brief_id)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Brief '{brief_id}' not found")

    brief = result.data[0]
    is_recipient = brief.get("recipient_user_id") in _brief_recipients(current_user)
    is_readable_permit = (
        bool(brief.get("requires_countersignature"))
        and current_user.get("role") in {"engineer", "reliability", "admin"}
    )
    if not (is_recipient or is_readable_permit):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Brief '{brief_id}' not found")
    return brief


@router.post("/{brief_id}/ack", summary="Acknowledge a brief (required for PTW / safety-critical)")
async def ack_brief(
    brief_id: str,
    current_user: CurrentUserDep,
    supabase: SupabaseDep,
) -> dict:
    """
    Cryptographically logs that the user acknowledged the brief content.
    For PTW briefs (requires_countersignature=True), `acknowledged_at` is deliberately NOT set
    here — it is set by POST /briefs/{id}/countersign once a second distinct authority signs,
    which is the dual sign-off the architecture requires for safety-critical briefs (Flow B).
    """
    from datetime import datetime
    user_id = current_user.get("user_id", "")
    now = datetime.now(UTC).isoformat()

    result = await asyncio.to_thread(
        lambda: supabase.table("briefs")
        .select("brief_id, requires_countersignature")
        .eq("brief_id", brief_id)
        .in_("recipient_user_id", _brief_recipients(current_user))
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
    signature = _sign_acknowledgment(app_settings.APP_SECRET_KEY, brief_id, user_id, "acknowledged", now)
    await asyncio.to_thread(
        lambda: supabase.table("audit_log").insert({
            "action": "brief_acknowledged",
            "entity_type": "brief",
            "entity_id": brief_id,
            "performed_by": user_id,
            "details": {
                "acknowledged_at": now,
                "requires_countersignature": requires_cs,
                "signature": signature,
                "signature_alg": "HMAC-SHA256",
            },
        }).execute()
    )
    return {
        "status": "acknowledged" if not requires_cs else "pending_countersignature",
        "brief_id": brief_id,
        "acknowledged_by": user_id,
        "signature": signature,
    }


@router.post("/{brief_id}/countersign", summary="Countersign a PTW brief (second authority)")
async def countersign_brief(
    brief_id: str,
    supabase: SupabaseDep,
    current_user: dict = Depends(require_role("reliability", "admin")),
) -> dict:
    """
    Completes the dual sign-off required for safety-critical (PTW) briefs — architecture Flow B:
    the issuing engineer acknowledges, a second authority countersigns, and only then is the brief
    logged as delivered-and-accepted.

    Two distinct humans are mandatory: the countersigner may not be the user who acknowledged.
    `acknowledged_at` is set here, because that is the moment both signatures exist.
    """
    from datetime import datetime

    user_id = current_user.get("user_id", "")
    now = datetime.now(UTC).isoformat()

    # Deliberately NOT scoped by recipient. The countersigner is, by definition, someone other
    # than the person the brief was delivered to — Flow B has the issuing engineer acknowledge and
    # a second authority countersign. Scoping this read the way `ack` scopes its own made the
    # entire flow impossible: the second authority is never in `_brief_recipients`, so every
    # countersign attempt 404'd. Authorisation here is by role (`require_role` above, mirrored by
    # OPA's `can_countersign_brief`), not by delivery address.
    #
    # ponytail: single-site deployment, so role is a sufficient boundary. When the cross-site
    # control plane lands, scope this to the countersigner's site via the brief's asset.
    result = await asyncio.to_thread(
        lambda: supabase.table("briefs")
        .select("brief_id, requires_countersignature, acknowledged_by, acknowledged_at, countersigned_by")
        .eq("brief_id", brief_id)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Brief '{brief_id}' not found")

    brief_row = result.data[0]

    if not brief_row.get("requires_countersignature", False):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This brief does not require a countersignature.",
        )
    if brief_row.get("countersigned_by"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Brief '{brief_id}' is already countersigned.",
        )

    acknowledged_by = brief_row.get("acknowledged_by")
    if not acknowledged_by:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Brief must be acknowledged by the issuing authority before it can be countersigned.",
        )
    if acknowledged_by == user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="A countersignature requires a second, distinct authority — "
                   "the acknowledging user cannot countersign their own brief.",
        )

    await asyncio.to_thread(
        lambda: supabase.table("briefs").update({
            "countersigned_by": user_id,
            "countersigned_at": now,
            "acknowledged_at": now,  # both signatures now present
        }).eq("brief_id", brief_id).execute()
    )
    countersignature = _sign_acknowledgment(
        app_settings.APP_SECRET_KEY, brief_id, user_id, "countersigned", now
    )
    await asyncio.to_thread(
        lambda: supabase.table("audit_log").insert({
            "action": "brief_countersigned",
            "entity_type": "brief",
            "entity_id": brief_id,
            "performed_by": user_id,
            "details": {
                "countersigned_at": now,
                "acknowledged_by": acknowledged_by,
                "acknowledged_at": now,
                # Distinct from the acknowledger's signature: the two together are the
                # dual sign-off evidence for a PTW brief (Flow B).
                "signature": countersignature,
                "signature_alg": "HMAC-SHA256",
            },
        }).execute()
    )
    log.info(
        "briefs.countersigned",
        brief_id=brief_id,
        countersigned_by=user_id,
        acknowledged_by=acknowledged_by,
    )
    return {
        "status": "acknowledged",
        "brief_id": brief_id,
        "acknowledged_by": acknowledged_by,
        "countersigned_by": user_id,
        "countersigned_at": now,
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
    try:
        await asyncio.to_thread(
            lambda: supabase.table("brief_feedback").insert({
                "brief_id": brief_id,
                "submitted_by": user_id,
                "rating": payload.rating,
                "notes": payload.notes,
                "submitted_at": payload.submitted_at.isoformat(),
            }).execute()
        )
    except Exception as exc:
        detail = getattr(exc, "details", None) or str(exc)
        if "23503" in str(detail) or "23503" in str(exc):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Brief {brief_id} not found.")
        raise

    if payload.rating == "incorrect":
        asyncio.create_task(_recheck_brief_sources(brief_id, user_id, supabase))

    return {"status": "received", "brief_id": brief_id, "rating": payload.rating}


async def _recheck_brief_sources(brief_id: str, submitted_by: str, supabase) -> None:
    """
    Background task: fetches source document IDs from the brief and queues a confidence
    recheck entry in audit_log. Task 16 attribution worker reads these entries and applies
    the actual Neo4j edge confidence adjustment.
    """
    from datetime import datetime
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
                    "queued_at": datetime.now(UTC).isoformat(),
                },
            }).execute()
        )
        log.info("brief.confidence_recheck_queued", brief_id=brief_id, doc_count=len(doc_ids))
    except Exception as e:
        log.error("brief.recheck_task_failed", brief_id=brief_id, error=str(e))

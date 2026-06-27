"""
Governance router — Layer 7: Dual-Track Governance and Adjudication Plane.
Manages knowledge conflicts, MoC items, quarantine review, and blast-radius reports.
"""

import asyncio
import hashlib
import hmac
from datetime import datetime, timedelta, timezone
from typing import Optional

import shortuuid
import structlog
from fastapi import APIRouter, Body, Depends, Header, HTTPException, Query, status

from api.dependencies import CurrentUserDep, Neo4jDep, SupabaseDep, require_role
from api.models.document import PromoteQuarantineRequest
from api.services.graph import GraphService
from api.services.metrics import conflicts_open

log = structlog.get_logger(__name__)
router = APIRouter()


# =============================================================================
# Conflicts
# =============================================================================

@router.get("/conflicts", summary="List open knowledge conflicts")
async def list_conflicts(
    current_user: CurrentUserDep,
    supabase: SupabaseDep,
    track: Optional[str] = Query(None, description="'administrative' or 'engineering'"),
    asset_id: Optional[str] = Query(None),
    conflict_status: Optional[str] = Query(None, alias="status", description="open, pending_moc, resolved"),
    limit: int = Query(50, le=200),
) -> dict:
    """
    Returns conflicts from the dual-track governance plane.
    - Administrative: minor inconsistencies, lightweight review, 5-day SLA.
    - Engineering: safety-critical contradictions, requires MoC, 24h SLA for critical equipment.
    """
    query = supabase.table("knowledge_conflicts").select(
        "conflict_id, track, asset_id, parameter, source_a, source_b, authority_a, authority_b, severity, status, sla_deadline, created_at",
        count="exact",
    )
    if track:
        query = query.eq("track", track)
    if asset_id:
        query = query.eq("asset_id", asset_id)
    if conflict_status:
        query = query.eq("status", conflict_status)

    result = await asyncio.to_thread(
        lambda: query.order("created_at", desc=True).limit(limit).execute()
    )
    return {"conflicts": result.data or [], "total": result.count or 0}


@router.get("/conflicts/{conflict_id}", summary="Get conflict detail and blast-radius report")
async def get_conflict(
    conflict_id: str,
    current_user: CurrentUserDep,
    supabase: SupabaseDep,
    driver: Neo4jDep,
) -> dict:
    """Returns full conflict detail including both conflicting sources and blast-radius impact."""
    result = await asyncio.to_thread(
        lambda: supabase.table("knowledge_conflicts")
        .select("*")
        .eq("conflict_id", conflict_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Conflict '{conflict_id}' not found")

    conflict = result.data[0]
    # Compute blast-radius from the older document (source_a)
    source_a_doc_id = conflict.get("source_a", {}).get("document_id")
    blast = {}
    if source_a_doc_id:
        blast = await GraphService(driver).get_blast_radius(source_a_doc_id)

    return {"conflict": conflict, "blast_radius": blast}


@router.post("/conflicts/{conflict_id}/resolve", summary="Resolve an administrative conflict")
async def resolve_conflict(
    conflict_id: str,
    current_user: CurrentUserDep,
    supabase: SupabaseDep,
    resolution: dict = Body(...),
) -> dict:
    """
    Resolves an administrative-track conflict (no MoC required).
    Engineering-track conflicts can only be resolved via MoC webhook.
    """
    result = await asyncio.to_thread(
        lambda: supabase.table("knowledge_conflicts")
        .select("conflict_id, track, status")
        .eq("conflict_id", conflict_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Conflict '{conflict_id}' not found")

    conflict = result.data[0]
    if conflict["track"] == "engineering":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Engineering-track conflicts must be resolved via MoC webhook (POST /governance/moc/webhook).",
        )

    now = datetime.now(timezone.utc).isoformat()
    await asyncio.to_thread(
        lambda: supabase.table("knowledge_conflicts").update({
            "status": "resolved",
            "resolved_by": current_user.get("user_id", "unknown"),
            "resolved_at": now,
        }).eq("conflict_id", conflict_id).execute()
    )
    await asyncio.to_thread(
        lambda: supabase.table("audit_log").insert({
            "action": "conflict_resolved",
            "entity_type": "conflict",
            "entity_id": conflict_id,
            "performed_by": current_user.get("user_id", "unknown"),
            "details": {"resolution": resolution, "track": "administrative"},
        }).execute()
    )
    log.info("conflict.resolved", conflict_id=conflict_id, resolver=current_user.get("user_id"))
    return {"status": "resolved", "conflict_id": conflict_id}


# =============================================================================
# Quarantine Layer
# =============================================================================

@router.get("/quarantine", summary="List items in the quarantine layer")
async def list_quarantine(
    current_user: CurrentUserDep,
    supabase: SupabaseDep,
    asset_id: Optional[str] = Query(None),
    reviewer_id: Optional[str] = Query(None),
    review_status: Optional[str] = Query(None, description="pending, promoted, disputed, archived"),
    limit: int = Query(50, le=200),
) -> dict:
    """
    Returns unverified field inputs awaiting review.
    All quarantine results are clearly labeled as non-canonical.
    """
    query = supabase.table("quarantine_items").select(
        "item_id, asset_id, content, input_type, submitted_by, submitted_at, reviewer_id, review_status, work_order_id",
        count="exact",
    )
    if asset_id:
        query = query.eq("asset_id", asset_id)
    if reviewer_id:
        query = query.eq("reviewer_id", reviewer_id)
    if review_status:
        query = query.eq("review_status", review_status)
    else:
        query = query.eq("review_status", "pending")  # default: pending items only

    result = await asyncio.to_thread(
        lambda: query.order("submitted_at", desc=True).limit(limit).execute()
    )
    return {
        "items": result.data or [],
        "total": result.count or 0,
        "note": "All items are unverified field inputs — not reviewed by engineering authority.",
    }


@router.post("/quarantine/{item_id}/promote", summary="Promote quarantine item to canonical graph")
async def promote_quarantine_item(
    item_id: str,
    payload: PromoteQuarantineRequest,
    supabase: SupabaseDep,
    driver: Neo4jDep,
    current_user: dict = Depends(require_role("reliability", "admin", "engineer")),
) -> dict:
    """
    Human authority promotes an unverified field input to the canonical temporal graph.
    Requires reliability, engineer, or admin role.
    """
    result = await asyncio.to_thread(
        lambda: supabase.table("quarantine_items")
        .select("*")
        .eq("item_id", item_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Quarantine item '{item_id}' not found")

    item = result.data[0]
    if item["review_status"] != "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Item already has review_status='{item['review_status']}'.",
        )

    asset_id = item.get("asset_id")
    if not asset_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Quarantine item has no asset_id — cannot link to graph.")

    ctx = item.get("session_context") or {}
    document_id = ctx.get("document_id", f"PROMOTED-{item_id}")
    now = datetime.now(timezone.utc)

    graph = GraphService(driver)
    # Ensure Document node exists
    await graph.merge_document_node(document_id, {"authority_level": payload.authority_level, "document_type": payload.document_type})

    edge_result = await graph.create_knowledge_edge(
        source_id=asset_id,
        source_label="Asset",
        target_id=document_id,
        target_label="Document",
        relationship_type=payload.relationship_type,
        valid_from=now,
        authority_level=payload.authority_level,
        document_id=document_id,
        confidence=1.0,  # human-verified
        verification_status="verified",
    )

    now_iso = now.isoformat()
    await asyncio.to_thread(
        lambda: supabase.table("quarantine_items").update({
            "review_status": "promoted",
            "reviewer_id": current_user.get("user_id", "unknown"),
            "reviewed_at": now_iso,
        }).eq("item_id", item_id).execute()
    )

    # If conflict detected on the newly promoted edge, insert it
    conflict = edge_result.get("conflict")
    conflict_id = None
    if conflict:
        conflict_row = await asyncio.to_thread(
            lambda cd=conflict: supabase.table("knowledge_conflicts").insert({
                "track": cd["track"],
                "asset_id": asset_id,
                "parameter": cd["parameter"],
                "source_a": cd["source_a"],
                "source_b": cd["source_b"],
                "authority_a": cd["authority_a"],
                "authority_b": cd["authority_b"],
                "severity": cd["severity"],
                "status": "pending_moc" if cd["track"] == "engineering" else "open",
                "sla_deadline": (now + timedelta(hours=cd["sla_hours"])).isoformat(),
            }).execute()
        )
        if conflict_row.data:
            conflict_id = conflict_row.data[0].get("conflict_id")

    await asyncio.to_thread(
        lambda: supabase.table("audit_log").insert({
            "action": "quarantine_promoted",
            "entity_type": "quarantine_item",
            "entity_id": item_id,
            "performed_by": current_user.get("user_id", "unknown"),
            "details": {
                "edge_id": edge_result["edge_id"],
                "asset_id": asset_id,
                "relationship_type": payload.relationship_type,
                "authority_level": payload.authority_level,
                "notes": payload.notes,
                "conflict_id": conflict_id,
            },
        }).execute()
    )

    if conflict is not None:
        conflicts_open.add(1, {"track": conflict.get("track", "unknown")})
    log.info("quarantine.promoted", item_id=item_id, asset_id=asset_id, edge_id=edge_result["edge_id"])
    return {
        "status": "promoted",
        "item_id": item_id,
        "edge_id": edge_result["edge_id"],
        "conflict_detected": conflict is not None,
        "conflict_id": conflict_id,
    }


@router.post("/quarantine/{item_id}/dispute", summary="Dispute a quarantine item as incorrect")
async def dispute_quarantine_item(
    item_id: str,
    current_user: CurrentUserDep,
    supabase: SupabaseDep,
    reason: dict = Body(...),
) -> dict:
    """Flags a quarantine item as disputed with a reason. Does not delete it."""
    result = await asyncio.to_thread(
        lambda: supabase.table("quarantine_items")
        .select("item_id, review_status")
        .eq("item_id", item_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Quarantine item '{item_id}' not found")
    if result.data[0]["review_status"] != "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Item is already '{result.data[0]['review_status']}', cannot dispute.",
        )

    now_iso = datetime.now(timezone.utc).isoformat()
    await asyncio.to_thread(
        lambda: supabase.table("quarantine_items").update({
            "review_status": "disputed",
            "reviewer_id": current_user.get("user_id", "unknown"),
            "reviewed_at": now_iso,
        }).eq("item_id", item_id).execute()
    )
    log.info("quarantine.disputed", item_id=item_id, user=current_user.get("user_id"))
    return {"status": "disputed", "item_id": item_id, "reason": reason}


# =============================================================================
# MoC (Management of Change)
# =============================================================================

@router.get("/moc", summary="List MoC items")
async def list_moc(
    current_user: CurrentUserDep,
    supabase: SupabaseDep,
    moc_status: Optional[str] = Query(None, alias="status", description="draft, pending_approval, approved, rejected"),
) -> dict:
    """Returns Management of Change items, optionally filtered by status."""
    query = supabase.table("moc_items").select(
        "moc_id, conflict_id, asset_id, description, status, approved_by, approved_at, created_at",
        count="exact",
    )
    if moc_status:
        query = query.eq("status", moc_status)
    result = await asyncio.to_thread(
        lambda: query.order("created_at", desc=True).limit(100).execute()
    )
    return {"moc_items": result.data or [], "total": result.count or 0}


@router.post("/moc/webhook", summary="Receive MoC resolution webhook from plant MoC system")
async def receive_moc_webhook(
    supabase: SupabaseDep,
    driver: Neo4jDep,
    payload: dict = Body(...),
    x_webhook_signature: Optional[str] = Header(None),
) -> dict:
    """
    Receives MoC resolution from the plant's EAM/SAP MoC system.
    On approval: closes old validity window, promotes new fact to canonical, clears conflict.
    On rejection: logs outcome, keeps conflict open.
    """
    # Signature check when secret is configured
    from api.config import get_settings
    settings = get_settings()
    moc_secret = getattr(settings, "MOC_WEBHOOK_SECRET", None)
    if moc_secret and x_webhook_signature:
        import json
        expected = hmac.new(
            moc_secret.encode(),
            json.dumps(payload, sort_keys=True).encode(),
            hashlib.sha256,
        ).hexdigest()  # hmac.new is the stdlib constructor alias
        if not hmac.compare_digest(expected, x_webhook_signature):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid webhook signature")

    moc_id = payload.get("moc_id")
    resolution_status = payload.get("status")  # "approved" or "rejected"
    approved_by = payload.get("approved_by", "webhook")

    if not moc_id or resolution_status not in ("approved", "rejected"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Payload must include moc_id and status (approved|rejected)")

    moc_result = await asyncio.to_thread(
        lambda: supabase.table("moc_items").select("*").eq("moc_id", moc_id).execute()
    )
    if not moc_result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"MoC '{moc_id}' not found")

    moc = moc_result.data[0]
    conflict_id = moc.get("conflict_id")
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()

    await asyncio.to_thread(
        lambda: supabase.table("moc_items").update({
            "status": resolution_status,
            "approved_by": approved_by if resolution_status == "approved" else None,
            "approved_at": now_iso if resolution_status == "approved" else None,
            "webhook_received_at": now_iso,
        }).eq("moc_id", moc_id).execute()
    )

    if resolution_status == "approved" and conflict_id:
        # Fetch the conflict to get old edge (source_a) and new document (source_b)
        conflict_result = await asyncio.to_thread(
            lambda: supabase.table("knowledge_conflicts").select("*").eq("conflict_id", str(conflict_id)).execute()
        )
        if conflict_result.data:
            conflict = conflict_result.data[0]
            graph = GraphService(driver)
            old_edge_id = (conflict.get("source_a") or {}).get("edge_id")
            if old_edge_id:
                await graph.close_validity_window(old_edge_id, now)

            # Mark conflict resolved
            await asyncio.to_thread(
                lambda: supabase.table("knowledge_conflicts").update({
                    "status": "resolved",
                    "resolved_by": approved_by,
                    "resolved_at": now_iso,
                }).eq("conflict_id", str(conflict_id)).execute()
            )

    await asyncio.to_thread(
        lambda: supabase.table("audit_log").insert({
            "action": "moc_webhook_received",
            "entity_type": "moc_item",
            "entity_id": moc_id,
            "performed_by": approved_by,
            "details": {"resolution_status": resolution_status, "conflict_id": str(conflict_id) if conflict_id else None},
        }).execute()
    )

    log.info("moc.webhook_received", moc_id=moc_id, status=resolution_status)
    return {"status": "received", "moc_id": moc_id, "resolution": resolution_status}


# =============================================================================
# Blast Radius
# =============================================================================

@router.get("/blast-radius/{document_id}", summary="Get blast-radius report for a document change")
async def get_blast_radius(
    document_id: str,
    current_user: CurrentUserDep,
    driver: Neo4jDep,
) -> dict:
    """
    Traverses the graph to identify all downstream facts, procedures, and relationships
    that derive from the specified document. Used when a document is superseded or disputed.
    """
    return await GraphService(driver).get_blast_radius(document_id)

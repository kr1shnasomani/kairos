"""
Audit log router — immutable evidence lineage trail.
Frontend uses this to render the evidence lineage panel per entity.
"""

import asyncio
from typing import Optional

import structlog
from fastapi import APIRouter, Query

from api.dependencies import CurrentUserDep, SupabaseDep

log = structlog.get_logger(__name__)
router = APIRouter()


@router.get("/", summary="Query audit log by entity")
async def get_audit_log(
    current_user: CurrentUserDep,
    supabase: SupabaseDep,
    entity_type: Optional[str] = Query(None, description="asset, document, brief, conflict, quarantine_item, query"),
    entity_id: Optional[str] = Query(None, description="ID of the specific entity"),
    action: Optional[str] = Query(None, description="Filter by action type"),
    performed_by: Optional[str] = Query(None, description="Filter by user ID"),
    limit: int = Query(50, le=200),
    offset: int = Query(0),
) -> dict:
    """
    Returns immutable audit trail entries for the evidence lineage panel.
    Ordered chronologically descending (most recent first).
    """
    query = supabase.table("audit_log").select(
        "id, action, entity_type, entity_id, performed_by, timestamp, details",
        count="exact",
    )
    if entity_type:
        query = query.eq("entity_type", entity_type)
    if entity_id:
        query = query.eq("entity_id", entity_id)
    if action:
        query = query.eq("action", action)
    if performed_by:
        query = query.eq("performed_by", performed_by)

    result = await asyncio.to_thread(
        lambda: query.order("timestamp", desc=True).range(offset, offset + limit - 1).execute()
    )
    return {
        "items": result.data or [],
        "total": result.count or 0,
        "limit": limit,
        "offset": offset,
    }

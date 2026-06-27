"""
Assets router — Layer 1: Deterministic MDM Backbone.
Manages canonical asset identities, alias resolution, and the asset hierarchy.
"""

import asyncio
from datetime import datetime, timezone
from typing import Optional

import shortuuid
import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status

from api.dependencies import CurrentUserDep, ElasticsearchDep, Neo4jDep, SupabaseDep, require_role
from api.models.asset import AssetCreate
from api.services.graph import GraphService

log = structlog.get_logger(__name__)
router = APIRouter()


@router.post("/", summary="Register a new canonical asset", status_code=status.HTTP_201_CREATED)
async def create_asset(
    payload: AssetCreate,
    driver: Neo4jDep,
    supabase: SupabaseDep,
    es: ElasticsearchDep,
    current_user: dict = Depends(require_role("admin", "engineer")),
) -> dict:
    """
    Creates a deterministic asset node in the MDM backbone (Neo4j + Supabase).
    AI-inferred identities are never accepted — confirmed_by_user_id is mandatory.
    Uses MERGE in Neo4j so duplicate registrations are idempotent.
    """
    asset_id = payload.asset_id or f"ASSET-{shortuuid.uuid()[:8].upper()}"
    now = datetime.now(timezone.utc).isoformat()

    graph = GraphService(driver)
    await graph.create_asset_node({
        "asset_id": asset_id,
        "tag_number": payload.tag_number,
        "name": payload.name,
        "equipment_class": payload.equipment_class,
        "criticality": payload.criticality,
        "site_id": payload.site_id,
        "facility_id": payload.facility_id,
        "eam_source": payload.eam_source,
        "identity_confirmed": True,
        "parent_asset_id": payload.parent_asset_id,
    })

    supabase_row = {
        "asset_id": asset_id,
        "tag_number": payload.tag_number,
        "name": payload.name,
        "equipment_class": payload.equipment_class,
        "criticality": payload.criticality,
        "site_id": payload.site_id,
        "facility_id": payload.facility_id,
        "parent_asset_id": payload.parent_asset_id,
        "eam_source": payload.eam_source,
        "identity_confirmed": True,
        "identity_confirmed_by": payload.confirmed_by_user_id,
        "identity_confirmed_at": now,
    }
    await asyncio.to_thread(
        lambda: supabase.table("assets").upsert(supabase_row).execute()
    )

    await asyncio.to_thread(
        lambda: supabase.table("audit_log").insert({
            "action": "asset_created",
            "entity_type": "asset",
            "entity_id": asset_id,
            "performed_by": payload.confirmed_by_user_id,
            "details": {"tag_number": payload.tag_number, "eam_source": payload.eam_source},
        }).execute()
    )

    # Index into ES kairos_assets for exact-match search (tag numbers, names)
    try:
        await es.index(
            index="kairos_assets",
            id=asset_id,
            document={
                "asset_id": asset_id,
                "tag_number": payload.tag_number,
                "name": payload.name,
                "equipment_class": payload.equipment_class,
                "criticality": payload.criticality,
                "site_id": payload.site_id,
                "facility_id": payload.facility_id,
                "eam_source": payload.eam_source,
            },
        )
    except Exception as exc:
        log.warning("asset.es_index_failed", asset_id=asset_id, error=str(exc))

    log.info("asset.created", asset_id=asset_id, tag_number=payload.tag_number, confirmed_by=payload.confirmed_by_user_id)
    return {"asset_id": asset_id, "tag_number": payload.tag_number, "status": "created"}


@router.get("/", summary="List all registered assets")
async def list_assets(
    current_user: CurrentUserDep,
    driver: Neo4jDep,
    site_id: Optional[str] = Query(None),
    equipment_class: Optional[str] = Query(None),
    limit: int = Query(50, le=500),
    offset: int = Query(0),
) -> dict:
    """Paginated list of canonical asset nodes from the MDM backbone (Neo4j)."""
    graph = GraphService(driver)
    result = await graph.list_assets(
        site_id=site_id,
        equipment_class=equipment_class,
        skip=offset,
        limit=limit,
    )
    return {**result, "limit": limit, "offset": offset}


@router.get("/{asset_id}", summary="Get asset by canonical ID")
async def get_asset(
    asset_id: str,
    current_user: CurrentUserDep,
    driver: Neo4jDep,
) -> dict:
    """Returns the canonical asset node from the temporal graph."""
    graph = GraphService(driver)
    asset = await graph.get_asset(asset_id)
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Asset '{asset_id}' not found")
    return asset


@router.get("/{asset_id}/aliases", summary="List all known tag aliases for an asset")
async def get_asset_aliases(
    asset_id: str,
    current_user: CurrentUserDep,
    supabase: SupabaseDep,
) -> list:
    """
    Returns all known naming variants for a canonical asset ID from the alias map.
    Used by the extraction pipeline to resolve tag references in documents.
    """
    result = await asyncio.to_thread(
        lambda: supabase.table("asset_alias_map")
        .select("*")
        .eq("canonical_asset_id", asset_id)
        .execute()
    )
    return result.data or []


@router.get("/{asset_id}/hierarchy", summary="Get asset parent-child hierarchy")
async def get_asset_hierarchy(
    asset_id: str,
    current_user: CurrentUserDep,
    driver: Neo4jDep,
) -> dict:
    """
    Returns the asset's position in the facility hierarchy by traversing
    PARENT_OF relationships in Neo4j (up to 10 levels).
    """
    graph = GraphService(driver)
    hierarchy = await graph.get_asset_hierarchy(asset_id)
    if not hierarchy:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Asset '{asset_id}' not found")
    return hierarchy


@router.get("/{asset_id}/knowledge", summary="Get all knowledge graph facts for an asset")
async def get_asset_knowledge(
    asset_id: str,
    current_user: CurrentUserDep,
    driver: Neo4jDep,
    as_of: Optional[str] = Query(None, description="ISO8601 timestamp for time-travel query"),
) -> dict:
    """
    Returns all temporal graph edges (facts) for this asset.
    Pass as_of for time-travel queries — returns state of knowledge at that moment.
    """
    graph = GraphService(driver)
    if not await graph.get_asset(asset_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Asset '{asset_id}' not found")

    as_of_dt: Optional[datetime] = None
    if as_of:
        try:
            as_of_dt = datetime.fromisoformat(as_of)
        except ValueError:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Invalid as_of format: '{as_of}'. Use ISO8601.")

    facts = await graph.get_asset_knowledge_at(asset_id, as_of=as_of_dt)
    return {"asset_id": asset_id, "as_of": as_of or "now", "fact_count": len(facts), "facts": facts}

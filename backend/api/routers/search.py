"""
Search router — Layer 11: Reasoning and Synthesis Layer.
Hybrid retrieval: exact match (ES) + semantic vector (Qdrant) + graph traversal (Neo4j).
"""

import asyncio
from datetime import datetime
from typing import Optional

import structlog
from fastapi import APIRouter, Query

from api.dependencies import (
    CurrentUserDep,
    ElasticsearchDep,
    Neo4jDep,
    QdrantDep,
    SettingsDep,
    SupabaseDep,
)
from api.models.document import SearchResponse, SynthesizeRequest, SynthesizeResponse
from api.services.graph import GraphService
from api.services.llm import LLMService, SAFETY_CRITICAL_CATEGORIES
from api.services.search_engine import SearchEngineService
from api.services.search_service import SearchService
from api.services.vector_store import VectorStoreService

log = structlog.get_logger(__name__)

router = APIRouter()


@router.get("/", response_model=SearchResponse, summary="Hybrid knowledge search")
async def search(
    settings: SettingsDep,
    current_user: CurrentUserDep,
    driver: Neo4jDep,
    qdrant: QdrantDep,
    es: ElasticsearchDep,
    q: str = Query(..., description="Natural language or structured query"),
    asset_id: Optional[str] = Query(None, description="Scope search to a specific asset"),
    authority_min: int = Query(1, ge=1, le=5, description="Minimum authority level to include"),
    include_quarantine: bool = Query(False, description="Include unverified quarantine layer items"),
    as_of: Optional[str] = Query(None, description="ISO8601 timestamp for time-travel search"),
    limit: int = Query(10, le=50),
) -> SearchResponse:
    """
    Hybrid retrieval using three parallel methods:
    1. Exact match (ES) — tag numbers, part numbers, clause refs, document IDs
    2. Semantic vector search (Qdrant) — conceptual queries
    3. Graph traversal (Neo4j) — relationship and time-travel queries (requires asset_id)

    Results are authority-ranked: regulatory requirements (level 1) outrank field observations (level 5).
    Phase 1: retrieval only. synthesis=None until Phase 2.
    """
    as_of_dt = datetime.fromisoformat(as_of) if as_of else None

    svc = SearchService(
        graph=GraphService(driver, settings.NEO4J_DATABASE),
        vector=VectorStoreService(qdrant, settings),
        engine=SearchEngineService(es, settings),
        llm=LLMService(settings),
    )
    results = await svc.hybrid_search(
        query=q,
        collection=settings.QDRANT_COLLECTION_DOCUMENTS,
        asset_id=asset_id,
        authority_min=authority_min,
        include_quarantine=include_quarantine,
        as_of=as_of_dt,
        limit=limit,
    )
    methods = sorted({r.retrieval_method for r in results})
    return SearchResponse(query=q, results=results, total=len(results), retrieval_methods=methods)


@router.get("/assets/{asset_id}", summary="Search within a specific asset's knowledge")
async def search_asset(
    asset_id: str,
    current_user: CurrentUserDep,
    driver: Neo4jDep,
    qdrant: QdrantDep,
    es: ElasticsearchDep,
    settings: SettingsDep,
    q: str = Query(...),
    limit: int = Query(10, le=50),
) -> SearchResponse:
    """Asset-scoped hybrid search — delegates to the main search with asset_id locked."""
    svc = SearchService(
        graph=GraphService(driver, settings.NEO4J_DATABASE),
        vector=VectorStoreService(qdrant, settings),
        engine=SearchEngineService(es, settings),
        llm=LLMService(settings),
    )
    results = await svc.hybrid_search(
        query=q,
        collection=settings.QDRANT_COLLECTION_DOCUMENTS,
        asset_id=asset_id,
        authority_min=1,
        include_quarantine=False,
        as_of=None,
        limit=limit,
    )
    methods = sorted({r.retrieval_method for r in results})
    return SearchResponse(query=q, results=results, total=len(results), retrieval_methods=methods)


@router.post("/synthesize", response_model=SynthesizeResponse, summary="Synthesize an answer from retrieved knowledge")
async def synthesize(
    payload: SynthesizeRequest,
    current_user: CurrentUserDep,
    settings: SettingsDep,
    supabase: SupabaseDep,
) -> SynthesizeResponse:
    """
    Assembles retrieved knowledge into a provenance-backed answer via NIM or Ollama.
    Safety-critical categories trigger explicit refusal when evidence confidence is low.
    No-ops cleanly when no LLM is configured (Phase 1 fallback).
    """
    llm = LLMService(settings)
    result = await llm.synthesize(payload.query, payload.context, payload.query_category)

    parsed: dict = {}
    if result.get("answer"):
        parsed = LLMService.parse_synthesis_response(result["answer"])

    refused = bool(result.get("refused"))
    safety_critical = payload.query_category in SAFETY_CRITICAL_CATEGORIES if payload.query_category else False

    try:
        await asyncio.to_thread(
            lambda: supabase.table("audit_log").insert({
                "action": "synthesis",
                "entity_type": "query",
                "performed_by": current_user.get("user_id", "unknown"),
                "details": {
                    "query": payload.query,
                    "query_category": payload.query_category,
                    "sources_used": parsed.get("sources_used", []),
                    "confidence": parsed.get("confidence"),
                    "refused": refused,
                },
            }).execute()
        )
    except Exception as exc:
        log.warning("synthesis.audit_log_failed", error=str(exc))

    return SynthesizeResponse(
        answer=parsed.get("answer") or result.get("answer"),
        sources=result.get("sources", []),
        confidence=parsed.get("confidence") or result.get("confidence"),
        refused=refused,
        refusal_reason=result.get("refusal_reason"),
        safety_critical=safety_critical,
        sources_used=parsed.get("sources_used", []),
        uncertainty=parsed.get("uncertainty") or result.get("uncertainty"),
        model=result.get("model"),
        message=result.get("message"),
    )

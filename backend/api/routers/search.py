"""
Search router — Layer 11: Reasoning and Synthesis Layer.
Hybrid retrieval: exact match (ES) + semantic vector (Qdrant) + graph traversal (Neo4j).
"""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Query

from api.dependencies import (
    CurrentUserDep,
    ElasticsearchDep,
    Neo4jDep,
    QdrantDep,
    SettingsDep,
)
from api.models.document import SearchResponse
from api.services.graph import GraphService
from api.services.llm import LLMService
from api.services.search_engine import SearchEngineService
from api.services.search_service import SearchService
from api.services.vector_store import VectorStoreService

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


@router.post("/synthesize", summary="Synthesize an answer from retrieved knowledge (Phase 2+)")
async def synthesize(
    current_user: CurrentUserDep,
    payload: dict,
) -> dict:
    """
    Synthesis stub — Phase 2 gate. Returns a clean no-op until LLM is wired in Task 8.
    """
    return {
        "answer": None,
        "sources": [],
        "confidence": None,
        "safety_critical": False,
        "message": "Synthesis requires NVIDIA_NIM_API_KEY or Ollama to be configured.",
    }

"""
Search router — Layer 11: Reasoning and Synthesis Layer.
Hybrid retrieval: exact match (ES) + semantic vector (Qdrant) + graph traversal (Neo4j).
"""

import asyncio
from datetime import datetime, timedelta, timezone
from typing import Optional

import structlog
from fastapi import APIRouter, Query

import asyncio

from api.dependencies import (
    CurrentUserDep,
    ElasticsearchDep,
    Neo4jDep,
    QdrantDep,
    SettingsDep,
    SupabaseDep,
)
from api.models.document import RCAPackRequest, RCAPackResponse, SearchResponse, SynthesizeRequest, SynthesizeResponse
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
    supabase: SupabaseDep,
    q: str = Query(..., description="Natural language or structured query"),
    asset_id: Optional[str] = Query(None, description="Scope search to a specific asset"),
    authority_min: int = Query(5, ge=1, le=5, description="Minimum authority level to include (1=Regulatory only, 5=all)"),
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

    # Batch-fetch vault_url from Supabase so frontend can render "view source" links
    doc_ids = [r.document_id for r in results if r.document_id]
    if doc_ids:
        vault_rows = await asyncio.to_thread(
            lambda: supabase.table("documents")
            .select("document_id, vault_url")
            .in_("document_id", doc_ids)
            .execute()
        )
        vault_map = {row["document_id"]: row.get("vault_url") for row in (vault_rows.data or [])}
        for r in results:
            r.vault_url = vault_map.get(r.document_id)

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
        authority_min=5,
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


@router.post("/rca-pack", response_model=RCAPackResponse, summary="Generate RCA pack for an asset incident")
async def generate_rca_pack(
    payload: RCAPackRequest,
    current_user: CurrentUserDep,
    driver: Neo4jDep,
    qdrant: QdrantDep,
    supabase: SupabaseDep,
    settings: SettingsDep,
) -> RCAPackResponse:
    """
    Layer 11 RCA synthesis: assembles failure timeline + ranked hypotheses + supporting documents.

    Three parallel retrieval passes:
      1. Neo4j — Event nodes linked to asset in 90-day window (chronological timeline)
      2. Qdrant — semantic search on failure_code + asset_class against kairos_knowledge
      3. Supabase — operational_events (work orders, alarms, PTWs) in same window

    Passes combined evidence to LLMService for structured RCA synthesis.
    Falls back to raw timeline + documents when no LLM is configured.
    Safety-critical hypotheses: refused=True when confidence < 0.7.
    Every call written to audit_log.
    """
    window_start = payload.incident_date - timedelta(days=90)
    window_start_iso = window_start.isoformat()
    incident_iso = payload.incident_date.isoformat()

    graph = GraphService(driver, settings.NEO4J_DATABASE)
    llm = LLMService(settings)
    vector_store = VectorStoreService(qdrant, settings)

    # -- Parallel retrieval --
    neo4j_future = graph.get_event_timeline(payload.asset_id, window_start_iso)
    supabase_future = asyncio.to_thread(
        lambda: supabase.table("operational_events")
        .select("event_id, event_type, asset_id, occurred_at, payload")
        .eq("asset_id", payload.asset_id)
        .gte("occurred_at", window_start_iso)
        .in_("event_type", ["work_order_created", "alarm_acknowledged", "ptw_generated"])
        .order("occurred_at", desc=False)
        .limit(50)
        .execute()
    )
    asset_future = asyncio.to_thread(
        lambda: supabase.table("assets")
        .select("equipment_class")
        .eq("asset_id", payload.asset_id)
        .execute()
    )

    neo4j_events, supabase_result, asset_result = await asyncio.gather(
        neo4j_future, supabase_future, asset_future
    )

    # Normalise Supabase operational events into timeline format
    supabase_events = [
        {
            "event_type": row.get("event_type", ""),
            "occurred_at": row.get("occurred_at", ""),
            "description": (row.get("payload") or {}).get("description", ""),
            "source": "operational_events",
            "document_id": None,
        }
        for row in (supabase_result.data or [])
    ]

    # Merge and sort timeline chronologically
    timeline = neo4j_events + supabase_events
    timeline.sort(key=lambda e: e.get("occurred_at") or "")

    # -- Qdrant semantic search --
    asset_class = (asset_result.data[0].get("equipment_class") or "") if asset_result.data else ""
    embed_query = f"{payload.failure_code} {asset_class}".strip()
    query_vector = await llm.embed(embed_query, task="retrieval.query")

    evidence_hits = await vector_store.search(
        collection=settings.QDRANT_COLLECTION_KNOWLEDGE,
        query_vector=query_vector,
        limit=10,
        asset_id=payload.asset_id,
        include_quarantine=payload.include_quarantine,
    )

    evidence = [
        {
            "document_id": h["payload"].get("document_id", ""),
            "text": h["payload"].get("text") or h["payload"].get("content", ""),
            "authority_level": h["payload"].get("authority_level", 5),
            "confidence": h.get("score", 0.5),
        }
        for h in evidence_hits
    ]

    # -- LLM synthesis --
    rca_result = await llm.rca_synthesize(payload.failure_code, timeline, evidence)

    hypotheses: list = []
    confidence: Optional[float] = None
    refused = False
    synthesis_available = bool(rca_result.get("answer"))

    if synthesis_available:
        parsed = LLMService.parse_rca_response(rca_result["answer"])
        hypotheses = parsed["hypotheses"]
        confidence = parsed["confidence"]

        # Safety-critical refusal: low confidence on safety-relevant failure codes
        safety_keywords = {"pressure", "isolation", "torque", "electrical", "relief", "shutdown", "interlock"}
        code_lower = payload.failure_code.lower()
        if (confidence is not None and confidence < 0.7
                and any(kw in code_lower for kw in safety_keywords)):
            refused = True
            hypotheses = []

    supporting_documents = [
        {
            "document_id": e["document_id"],
            "authority_level": e["authority_level"],
            "confidence": e["confidence"],
        }
        for e in evidence
        if e.get("document_id")
    ]

    # -- Audit log --
    try:
        await asyncio.to_thread(
            lambda: supabase.table("audit_log").insert({
                "action": "rca_pack_generated",
                "entity_type": "asset",
                "entity_id": payload.asset_id,
                "performed_by": current_user.get("user_id", "unknown"),
                "details": {
                    "asset_id": payload.asset_id,
                    "incident_date": incident_iso,
                    "failure_code": payload.failure_code,
                    "timeline_events": len(timeline),
                    "evidence_docs": len(evidence),
                    "hypotheses_count": len(hypotheses),
                    "refused": refused,
                    "synthesis_available": synthesis_available,
                },
            }).execute()
        )
    except Exception as exc:
        log.warning("rca_pack.audit_log_failed", error=str(exc))

    log.info(
        "rca_pack.generated",
        asset_id=payload.asset_id,
        failure_code=payload.failure_code,
        timeline_count=len(timeline),
        evidence_count=len(evidence),
        hypotheses_count=len(hypotheses),
        synthesis_available=synthesis_available,
    )

    return RCAPackResponse(
        asset_id=payload.asset_id,
        incident_date=incident_iso,
        failure_code=payload.failure_code,
        timeline=timeline,
        hypotheses=hypotheses,
        supporting_documents=supporting_documents,
        confidence=confidence,
        refused=refused,
        synthesis_available=synthesis_available,
    )

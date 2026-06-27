"""
Search service — hybrid retrieval pipeline (Layer 11).
Parallel ES exact + Qdrant semantic + Neo4j graph traversal, authority re-ranked.
"""

import asyncio
from datetime import datetime
from typing import Any, Dict, List, Optional

import structlog

from api.models.document import SearchResult
from api.services.graph import GraphService
from api.services.llm import LLMService
from api.services.search_engine import SearchEngineService
from api.services.vector_store import VectorStoreService

log = structlog.get_logger(__name__)


class SearchService:
    def __init__(
        self,
        graph: GraphService,
        vector: VectorStoreService,
        engine: SearchEngineService,
        llm: LLMService,
    ):
        self.graph = graph
        self.vector = vector
        self.engine = engine
        self.llm = llm

    async def hybrid_search(
        self,
        query: str,
        collection: str,
        asset_id: Optional[str],
        authority_min: int,
        include_quarantine: bool,
        as_of: Optional[datetime],
        limit: int,
    ) -> List[SearchResult]:
        """
        Parallel retrieval from ES + Qdrant + Neo4j.
        Deduplicates by document_id (lowest authority_level wins, then highest score).
        Re-ranks: authority_level ASC, relevance_score DESC.
        """
        query_vector = await self.llm.embed(query, task="retrieval.query")

        coros: List[Any] = [
            self.engine.search(query, asset_id=asset_id, limit=limit),
            self.vector.search(collection, query_vector, limit=limit, asset_id=asset_id, authority_min=authority_min),
        ]
        if asset_id:
            coros.append(self.graph.get_asset_knowledge_at(asset_id, as_of=as_of, authority_min=authority_min))
        if include_quarantine:
            coros.append(
                self.vector.search(
                    collection, query_vector, limit=limit, asset_id=asset_id,
                    authority_min=authority_min, quarantine_only=True,
                )
            )

        gathered = await asyncio.gather(*coros, return_exceptions=True)

        es_raw = gathered[0] if not isinstance(gathered[0], Exception) else []
        qdrant_raw = gathered[1] if not isinstance(gathered[1], Exception) else []

        idx = 2
        graph_raw: List[Dict[str, Any]] = []
        quarantine_raw: List[Dict[str, Any]] = []
        if asset_id:
            graph_raw = gathered[idx] if not isinstance(gathered[idx], Exception) else []
            idx += 1
        if include_quarantine:
            quarantine_raw = gathered[idx] if not isinstance(gathered[idx], Exception) else []

        if isinstance(gathered[0], Exception):
            log.error("search.es_failed", error=str(gathered[0]))
        if isinstance(gathered[1], Exception):
            log.error("search.qdrant_failed", error=str(gathered[1]))

        merged: Dict[str, SearchResult] = {}
        for r in (
            self._normalize_es(es_raw)
            + self._normalize_qdrant(qdrant_raw, is_quarantine=False)
            + self._normalize_graph(graph_raw, asset_id)
            + self._normalize_qdrant(quarantine_raw, is_quarantine=True)
        ):
            self._merge(merged, r)

        ranked = sorted(merged.values(), key=lambda x: (x.authority_level, -x.relevance_score))
        return ranked[:limit]

    def _merge(self, acc: Dict[str, SearchResult], r: SearchResult) -> None:
        if not r.document_id:
            return
        existing = acc.get(r.document_id)
        if not existing:
            acc[r.document_id] = r
            return
        if r.authority_level < existing.authority_level or (
            r.authority_level == existing.authority_level and r.relevance_score > existing.relevance_score
        ):
            acc[r.document_id] = r

    def _normalize_es(self, hits: List[Dict]) -> List[SearchResult]:
        return [
            SearchResult(
                document_id=h.get("document_id") or "",
                asset_id=h.get("asset_id"),
                document_type=h.get("document_type", "unknown"),
                title=h.get("title") or "",
                snippet=h.get("snippet") or "",
                authority_level=h.get("authority_level", 5),
                status="active",
                relevance_score=float(h.get("score") or 0),
                retrieval_method="exact",
                is_quarantine=False,
            )
            for h in hits
        ]

    def _normalize_qdrant(self, hits: List[Dict], is_quarantine: bool) -> List[SearchResult]:
        return [
            SearchResult(
                document_id=p.get("document_id") or "",
                asset_id=p.get("asset_id"),
                document_type=p.get("document_type", "unknown"),
                title="",
                snippet=(p.get("text") or "")[:300],
                authority_level=p.get("authority_level", 5),
                status="active",
                relevance_score=float(h.get("score") or 0),
                retrieval_method="semantic",
                is_quarantine=is_quarantine,
            )
            for h in hits
            for p in [h.get("payload", {})]
        ]

    def _normalize_graph(self, hits: List[Dict], asset_id: Optional[str]) -> List[SearchResult]:
        return [
            SearchResult(
                document_id=edge.get("document_id") or "",
                asset_id=asset_id,
                document_type=target.get("document_type", "unknown"),
                title=target.get("title") or "",
                snippet="",
                authority_level=edge.get("authority_level", 5),
                status="active",
                relevance_score=float(edge.get("confidence") or 0.5),
                retrieval_method="graph",
                is_quarantine=False,
            )
            for h in hits
            for edge in [h.get("edge", {})]
            for target in [h.get("target", {})]
        ]

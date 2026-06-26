"""
Vector store service — Qdrant client wrapper (Layer 11: Semantic Retrieval).
"""

from typing import Any, Dict, List, Optional

import structlog
from qdrant_client import AsyncQdrantClient
from qdrant_client.models import (
    Distance,
    FieldCondition,
    Filter,
    MatchValue,
    PointStruct,
    VectorParams,
)

from api.config import Settings

log = structlog.get_logger(__name__)


class VectorStoreService:
    """
    Qdrant vector store — semantic search over extracted knowledge fragments.
    Two collections:
    - kairos_knowledge: extracted facts and graph-linked knowledge fragments
    - kairos_documents: full document chunks for RAG-style retrieval
    """

    def __init__(self, client: AsyncQdrantClient, settings: Settings):
        self.client = client
        self.settings = settings

    async def ensure_collections(self) -> None:
        """Creates Qdrant collections if they don't exist. Called at startup."""
        for collection_name in [
            self.settings.QDRANT_COLLECTION_KNOWLEDGE,
            self.settings.QDRANT_COLLECTION_DOCUMENTS,
        ]:
            existing = await self.client.get_collections()
            collection_names = [c.name for c in existing.collections]
            if collection_name not in collection_names:
                await self.client.create_collection(
                    collection_name=collection_name,
                    vectors_config=VectorParams(
                        size=self.settings.EMBEDDING_DIMENSION,
                        distance=Distance.COSINE,
                    ),
                )
                log.info("qdrant.collection_created", name=collection_name)

    async def upsert(
        self,
        collection: str,
        point_id: str,
        vector: List[float],
        payload: Dict[str, Any],
    ) -> None:
        """Upserts a vector point with payload metadata."""
        await self.client.upsert(
            collection_name=collection,
            points=[PointStruct(id=point_id, vector=vector, payload=payload)],
        )

    async def search(
        self,
        collection: str,
        query_vector: List[float],
        limit: int = 10,
        asset_id: Optional[str] = None,
        authority_min: int = 1,
        include_quarantine: bool = False,
    ) -> List[Dict[str, Any]]:
        """
        Semantic search with optional payload filtering.
        Filters: asset_id, authority_level >= authority_min, quarantine status.
        """
        must_conditions = []

        if asset_id:
            must_conditions.append(FieldCondition(key="asset_id", match=MatchValue(value=asset_id)))
        if not include_quarantine:
            must_conditions.append(FieldCondition(key="is_quarantine", match=MatchValue(value=False)))

        query_filter = Filter(must=must_conditions) if must_conditions else None

        results = await self.client.search(
            collection_name=collection,
            query_vector=query_vector,
            query_filter=query_filter,
            limit=limit,
            with_payload=True,
        )

        return [
            {
                "point_id": str(r.id),
                "score": r.score,
                "payload": r.payload,
            }
            for r in results
            if r.payload.get("authority_level", 5) >= authority_min
        ]

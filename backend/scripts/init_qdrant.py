"""
Init script — Create Qdrant collections with correct vector dimensions.
Run: python backend/scripts/init_qdrant.py
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import structlog
from qdrant_client import AsyncQdrantClient
from qdrant_client.models import Distance, VectorParams

from api.config import settings

log = structlog.get_logger(__name__)

COLLECTIONS = {
    settings.QDRANT_COLLECTION_KNOWLEDGE: {
        "description": "Extracted knowledge fragments — facts, parameters, relationships",
        "size": settings.EMBEDDING_DIMENSION,
        "distance": Distance.COSINE,
    },
    settings.QDRANT_COLLECTION_DOCUMENTS: {
        "description": "Full document chunks for RAG-style retrieval",
        "size": settings.EMBEDDING_DIMENSION,
        "distance": Distance.COSINE,
    },
}


async def init_collections():
    log.info("qdrant.init_started", url=settings.QDRANT_URL)

    client = AsyncQdrantClient(
        url=settings.QDRANT_URL,
        api_key=settings.QDRANT_API_KEY or None,
    )

    try:
        existing = await client.get_collections()
        existing_names = {c.name for c in existing.collections}
        log.info("qdrant.existing_collections", collections=list(existing_names))

        for name, config in COLLECTIONS.items():
            if name in existing_names:
                log.info("qdrant.collection_exists", name=name)
                continue

            await client.create_collection(
                collection_name=name,
                vectors_config=VectorParams(
                    size=config["size"],
                    distance=config["distance"],
                ),
            )
            log.info("qdrant.collection_created", name=name, size=config["size"])

        log.info("qdrant.init_complete")

    finally:
        await client.close()


if __name__ == "__main__":
    asyncio.run(init_collections())

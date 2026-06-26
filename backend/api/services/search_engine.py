"""
Search engine service — Elasticsearch exact search (Layer 11).
Handles tag number, part number, document ID, and regulatory clause lookup.
"""

from typing import Any, Dict, List, Optional

import structlog
from elasticsearch import AsyncElasticsearch

from api.config import Settings

log = structlog.get_logger(__name__)


class SearchEngineService:
    """
    Elasticsearch-backed exact and keyword search.
    Handles structured queries where precision matters over recall:
    - Equipment tag numbers (P-101, EQ-247)
    - Part numbers and material codes
    - Document IDs and revision references
    - Regulatory clause references (OISD-117 Clause 4.2.1)
    """

    def __init__(self, client: AsyncElasticsearch, settings: Settings):
        self.client = client
        self.settings = settings

    async def ensure_indices(self) -> None:
        """Creates ES indices with mappings if they don't exist."""
        indices = {
            self.settings.ELASTICSEARCH_INDEX_ASSETS: self._asset_mapping(),
            self.settings.ELASTICSEARCH_INDEX_DOCUMENTS: self._document_mapping(),
            self.settings.ELASTICSEARCH_INDEX_EVENTS: self._event_mapping(),
        }
        for index_name, mapping in indices.items():
            exists = await self.client.indices.exists(index=index_name)
            if not exists:
                await self.client.indices.create(index=index_name, body=mapping)
                log.info("elasticsearch.index_created", index=index_name)

    async def search(
        self,
        query: str,
        index: Optional[str] = None,
        asset_id: Optional[str] = None,
        limit: int = 10,
    ) -> List[Dict[str, Any]]:
        """
        Exact and full-text search. Prioritizes exact tag number matches.
        """
        indices = index or f"{self.settings.ELASTICSEARCH_INDEX_DOCUMENTS},{self.settings.ELASTICSEARCH_INDEX_ASSETS}"

        must_clauses: List[Any] = [
            {
                "multi_match": {
                    "query": query,
                    "fields": ["tag_number^3", "document_id^3", "clause_ref^3", "title^2", "content"],
                    "type": "best_fields",
                }
            }
        ]
        if asset_id:
            must_clauses.append({"term": {"asset_id": asset_id}})

        body = {
            "query": {"bool": {"must": must_clauses}},
            "size": limit,
            "highlight": {"fields": {"content": {}, "title": {}}},
        }

        try:
            response = await self.client.search(index=indices, body=body)
            hits = response["hits"]["hits"]
            return [
                {
                    "document_id": h["_source"].get("document_id"),
                    "asset_id": h["_source"].get("asset_id"),
                    "title": h["_source"].get("title"),
                    "snippet": h.get("highlight", {}).get("content", [""])[0],
                    "score": h["_score"],
                    "authority_level": h["_source"].get("authority_level", 5),
                }
                for h in hits
            ]
        except Exception as e:
            log.error("elasticsearch.search_failed", error=str(e))
            return []

    def _asset_mapping(self) -> Dict:
        return {
            "mappings": {
                "properties": {
                    "asset_id": {"type": "keyword"},
                    "tag_number": {"type": "keyword"},
                    "name": {"type": "text"},
                    "equipment_class": {"type": "keyword"},
                    "site_id": {"type": "keyword"},
                }
            }
        }

    def _document_mapping(self) -> Dict:
        return {
            "mappings": {
                "properties": {
                    "document_id": {"type": "keyword"},
                    "asset_id": {"type": "keyword"},
                    "title": {"type": "text"},
                    "content": {"type": "text", "analyzer": "standard"},
                    "document_type": {"type": "keyword"},
                    "authority_level": {"type": "integer"},
                    "status": {"type": "keyword"},
                    "ingested_at": {"type": "date"},
                }
            }
        }

    def _event_mapping(self) -> Dict:
        return {
            "mappings": {
                "properties": {
                    "event_id": {"type": "keyword"},
                    "asset_id": {"type": "keyword"},
                    "event_type": {"type": "keyword"},
                    "occurred_at": {"type": "date"},
                }
            }
        }

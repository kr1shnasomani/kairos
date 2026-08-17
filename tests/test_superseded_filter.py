"""Superseded documents must not surface as current (ARCHITECTURE.md §8).

Pure logic: fake ES / Qdrant clients capture the query that would be sent, so no services
are required. What is asserted is the *shape of the filter*, which is the thing that breaks.
"""

from typing import Any

import pytest

from api.services.search_engine import SearchEngineService
from api.services.vector_store import VectorStoreService

_SUPERSEDED_TERM = {"term": {"status": "superseded"}}


class _FakeES:
    """Captures the search body and returns no hits."""

    def __init__(self) -> None:
        self.body: dict[str, Any] = {}

    async def search(self, index: str, body: dict[str, Any]) -> dict[str, Any]:
        self.body = body
        return {"hits": {"hits": []}}


class _FakeQdrant:
    def __init__(self) -> None:
        self.query_filter: Any = None
        self.set_payload_args: dict[str, Any] = {}

    async def search(self, collection_name, query_vector, query_filter, limit, with_payload):
        self.query_filter = query_filter
        return []

    async def set_payload(self, collection_name, payload, points):
        self.set_payload_args = {"collection": collection_name, "payload": payload, "points": points}


class _Settings:
    ELASTICSEARCH_INDEX_DOCUMENTS = "kairos_documents"
    ELASTICSEARCH_INDEX_ASSETS = "kairos_assets"
    QDRANT_COLLECTION_DOCUMENTS = "kairos_documents"


def _must_not(body: dict[str, Any]) -> list:
    return body.get("query", {}).get("bool", {}).get("must_not", [])


# ── Elasticsearch ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_es_excludes_superseded_by_default():
    es = _FakeES()
    await SearchEngineService(es, _Settings()).search("MAWP for HE-301")
    assert _SUPERSEDED_TERM in _must_not(es.body)


@pytest.mark.asyncio
async def test_es_includes_superseded_for_time_travel():
    """A document superseded today was current at an earlier as_of — excluding it there
    answers the wrong question."""
    es = _FakeES()
    await SearchEngineService(es, _Settings()).search("MAWP for HE-301", include_superseded=True)
    assert _SUPERSEDED_TERM not in _must_not(es.body)


@pytest.mark.asyncio
async def test_es_uses_must_not_never_must_active():
    """
    The query spans kairos_assets too, whose documents carry no `status` field. Requiring
    status=active would drop every asset hit; excluding superseded leaves them alone.
    """
    es = _FakeES()
    await SearchEngineService(es, _Settings()).search("P-101")
    must = es.body["query"]["bool"]["must"]
    assert not any("status" in str(clause) for clause in must), must


# ── Qdrant ───────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_qdrant_excludes_superseded_by_default():
    q = _FakeQdrant()
    await VectorStoreService(q, _Settings()).search("kairos_documents", [0.1, 0.2])
    keys = [c.key for c in (q.query_filter.must_not or [])]
    assert "status" in keys


@pytest.mark.asyncio
async def test_qdrant_includes_superseded_for_time_travel():
    q = _FakeQdrant()
    await VectorStoreService(q, _Settings()).search(
        "kairos_documents", [0.1, 0.2], include_superseded=True
    )
    assert not (q.query_filter.must_not or [])


@pytest.mark.asyncio
async def test_qdrant_filter_survives_with_no_must_conditions():
    """
    Regression: the filter used to be `Filter(must=...) if must else None`. With no asset_id
    and quarantine already excluded there can still be a must_not, and returning None there
    would silently drop the superseded exclusion.
    """
    q = _FakeQdrant()
    await VectorStoreService(q, _Settings()).search(
        "kairos_documents", [0.1, 0.2], include_quarantine=True
    )
    assert q.query_filter is not None, "must_not alone must still produce a filter"


@pytest.mark.asyncio
async def test_mark_superseded_sets_payload_and_never_deletes():
    q = _FakeQdrant()
    await VectorStoreService(q, _Settings()).mark_superseded("kairos_documents", "DOC-1")
    assert q.set_payload_args["payload"] == {"status": "superseded"}
    assert q.set_payload_args["points"].must[0].key == "document_id"

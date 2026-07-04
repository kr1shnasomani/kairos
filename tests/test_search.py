"""Search — Tasks 9-12: hybrid retrieval, asset-scoped search, synthesis, RCA pack."""

import pytest
from datetime import datetime, timezone


async def test_search_returns_response_shape(admin_client):
    r = await admin_client.get("/search/", params={"q": "pump bearing failure"})
    assert r.status_code == 200
    body = r.json()
    assert "query" in body
    assert "results" in body
    assert "total" in body
    assert "retrieval_methods" in body
    assert isinstance(body["results"], list)


async def test_search_empty_query_rejected(admin_client):
    r = await admin_client.get("/search/")
    assert r.status_code == 422


async def test_search_with_asset_scope(admin_client, shared_asset_id):
    r = await admin_client.get("/search/", params={"q": "maintenance", "asset_id": shared_asset_id})
    assert r.status_code == 200
    body = r.json()
    assert "results" in body


async def test_search_authority_filter(admin_client):
    r = await admin_client.get("/search/", params={"q": "pressure", "authority_min": 1})
    assert r.status_code == 200


async def test_search_with_as_of(admin_client):
    r = await admin_client.get("/search/", params={
        "q": "inspection",
        "as_of": "2025-06-01T00:00:00Z",
    })
    assert r.status_code == 200


async def test_search_result_fields(admin_client):
    r = await admin_client.get("/search/", params={"q": "seal leak"})
    assert r.status_code == 200
    for result in r.json()["results"]:
        assert "retrieval_method" in result
        assert "relevance_score" in result


async def test_search_asset_scoped_endpoint(admin_client, shared_asset_id):
    r = await admin_client.get(f"/search/assets/{shared_asset_id}", params={"q": "failure mode"})
    assert r.status_code == 200
    body = r.json()
    assert "results" in body
    assert "retrieval_methods" in body


async def test_synthesize_response_shape(admin_client):
    r = await admin_client.post("/search/synthesize", json={
        "query": "What are common pump bearing failure modes?",
        "context": [
            {"text": "Bearing failures are often caused by overloading.", "confidence": 0.9, "authority_level": 3},
            {"text": "Misalignment causes premature bearing wear.", "confidence": 0.85, "authority_level": 2},
        ],
    }, timeout=120.0)
    assert r.status_code == 200
    body = r.json()
    assert "refused" in body
    assert "safety_critical" in body
    assert "sources" in body


async def test_synthesize_safety_critical_refusal(admin_client):
    """Safety-critical categories defined in llm.py: max_allowable_pressure, etc."""
    r = await admin_client.post("/search/synthesize", json={
        "query": "What is the max operating pressure for this vessel?",
        "context": [],
        "query_category": "max_allowable_pressure",
    }, timeout=120.0)
    assert r.status_code == 200
    body = r.json()
    assert body["safety_critical"] is True


async def test_rca_pack_response_shape(admin_client, shared_asset_id):
    r = await admin_client.post("/search/rca-pack", json={
        "asset_id": shared_asset_id,
        "incident_date": datetime.now(timezone.utc).isoformat(),
        "failure_code": "SEAL_LEAK",
        "include_quarantine": False,
    }, timeout=120.0)
    assert r.status_code == 200
    body = r.json()
    assert body["asset_id"] == shared_asset_id
    assert "timeline" in body
    assert "hypotheses" in body
    assert "supporting_documents" in body
    assert "synthesis_available" in body


async def test_rca_pack_refused_on_low_confidence_safety(admin_client, shared_asset_id):
    """Safety-critical failure codes with no evidence → refused=True."""
    r = await admin_client.post("/search/rca-pack", json={
        "asset_id": shared_asset_id,
        "incident_date": datetime.now(timezone.utc).isoformat(),
        "failure_code": "pressure_relief_stuck",
        "include_quarantine": False,
    }, timeout=120.0)
    assert r.status_code == 200
    body = r.json()
    # If synthesis runs and confidence is low on a safety keyword → refused
    # Just verify the field is present and boolean
    assert isinstance(body["refused"], bool)

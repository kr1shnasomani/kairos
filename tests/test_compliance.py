"""Compliance — Task 26: gap detection, dashboard, audit pack, frameworks."""


async def test_compliance_gaps_shape(admin_client):
    r = await admin_client.get("/compliance/gaps")
    assert r.status_code == 200
    body = r.json()
    assert "items" in body
    assert "total" in body
    assert "last_scan" in body
    assert body["last_scan"] == "realtime"


async def test_compliance_gaps_filter_framework(admin_client):
    r = await admin_client.get("/compliance/gaps", params={"framework": "OISD_117"})
    assert r.status_code == 200
    assert "items" in r.json()


async def test_compliance_gaps_filter_severity(admin_client):
    r = await admin_client.get("/compliance/gaps", params={"severity": "critical"})
    assert r.status_code == 200
    for item in r.json()["items"]:
        assert item["severity"] == "critical"


async def test_compliance_dashboard_shape(admin_client):
    r = await admin_client.get("/compliance/dashboard")
    assert r.status_code == 200
    body = r.json()
    assert "total_gaps" in body
    assert "by_framework" in body
    assert "by_asset_class" in body
    assert "last_updated" in body


async def test_compliance_frameworks_shape(admin_client):
    r = await admin_client.get("/compliance/frameworks")
    assert r.status_code == 200
    body = r.json()
    assert "configured_frameworks" in body
    assert "available_frameworks" in body
    assert isinstance(body["available_frameworks"], list)
    assert "OISD_117" in body["available_frameworks"]


async def test_compliance_audit_pack_requires_framework(admin_client):
    r = await admin_client.get("/compliance/audit-pack")
    assert r.status_code == 422


async def test_compliance_audit_pack_shape(admin_client):
    r = await admin_client.get("/compliance/audit-pack", params={"framework": "OISD_117"})
    assert r.status_code == 200
    body = r.json()
    assert body["framework"] == "OISD_117"
    assert "clauses" in body
    assert "total_clauses" in body
    assert "human_review_required" in body
    assert body["status"] == "draft"
    assert "Human sign-off required" in body["note"]

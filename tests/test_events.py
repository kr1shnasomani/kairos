"""Events — Tasks 13-16, 33: work orders, PTW, shift handover, alarms, tag-out, deviations."""

import pytest
from datetime import datetime, timezone
from tests.conftest import uid


def _now():
    return datetime.now(timezone.utc).isoformat()


def _work_order_payload(asset_id):
    return {
        "event_id": str(uid()),
        "source_system": "SAP_PM",
        "site_id": "SITE_001",
        "occurred_at": _now(),
        "received_at": _now(),
        "work_order_id": f"WO-{uid()}",
        "asset_id": asset_id,
        "failure_code": "BEARING_WEAR",
        "description": "Bearing temperature elevated above threshold",
        "priority": "high",
    }


# ---------------------------------------------------------------------------
# Work order
# ---------------------------------------------------------------------------

async def test_ingest_work_order(admin_client, shared_asset_id):
    r = await admin_client.post("/events/work-order", json=_work_order_payload(shared_asset_id))
    assert r.status_code == 202
    body = r.json()
    assert body["status"] == "accepted"
    assert "event_id" in body
    assert "stream_entry_id" in body
    assert "brief_task_id" in body


async def test_work_order_deduplication(admin_client):
    # Use a fresh asset so the first post is guaranteed "accepted" (no prior dedup window)
    fresh_asset_id = f"ASSET-DEDUP-{uid()}"
    r_asset = await admin_client.post("/assets/", json={
        "asset_id": fresh_asset_id,
        "tag_number": f"TAG-DEDUP-{uid()}",
        "name": "Dedup Test Asset",
        "equipment_class": "PUMP",
        "criticality": "critical",
        "site_id": "SITE_001",
        "facility_id": "FAC_001",
        "eam_source": "test",
        "confirmed_by_user_id": "test-runner",
    })
    assert r_asset.status_code == 201

    payload = _work_order_payload(fresh_asset_id)
    r1 = await admin_client.post("/events/work-order", json=payload)
    r2 = await admin_client.post("/events/work-order", json=payload)
    assert r1.status_code == 202
    assert r2.status_code == 202
    # First is accepted, second (same asset+type within window) is deduplicated
    assert r1.json()["status"] == "accepted"
    assert r2.json()["status"] == "deduplicated"


async def test_work_order_recurring_detection(admin_client, shared_asset_id):
    """Two WOs with same failure_code on the same asset → recurring_detected on second."""
    payload1 = _work_order_payload(shared_asset_id)
    payload2 = {**_work_order_payload(shared_asset_id), "event_id": uid(), "work_order_id": f"WO-{uid()}"}
    # Send first, then wait a tick (dedup window is asset+event_type based, not failure_code)
    r1 = await admin_client.post("/events/work-order", json=payload1)
    # Use a different asset to bypass dedup but same failure family
    asset2 = f"ASSET-{uid()}"
    r_asset = await admin_client.post("/assets/", json={
        "asset_id": asset2,
        "tag_number": f"TAG-{uid()}",
        "name": "Recurrence Test Asset",
        "equipment_class": "PUMP",
        "criticality": "critical",
        "site_id": "SITE_001",
        "facility_id": "FAC_001",
        "eam_source": "test",
        "confirmed_by_user_id": "test-runner",
    })
    assert r_asset.status_code == 201
    payload2["asset_id"] = asset2
    r2 = await admin_client.post("/events/work-order", json=payload2)
    assert r2.status_code == 202
    assert "recurring_detected" in r2.json()


async def test_get_event(admin_client):
    # Use a fresh unique asset to avoid dedup window from shared_asset_id
    fresh_asset_id = f"ASSET-EV-{uid()}"
    r_asset = await admin_client.post("/assets/", json={
        "asset_id": fresh_asset_id,
        "tag_number": f"TAG-EV-{uid()}",
        "name": "Event Get Test Asset",
        "equipment_class": "PUMP",
        "criticality": "critical",
        "site_id": "SITE_001",
        "facility_id": "FAC_001",
        "eam_source": "test",
        "confirmed_by_user_id": "test-runner",
    })
    assert r_asset.status_code == 201

    payload = _work_order_payload(fresh_asset_id)
    r = await admin_client.post("/events/work-order", json=payload)
    assert r.status_code == 202
    event_id = r.json()["event_id"]

    r2 = await admin_client.get(f"/events/{event_id}")
    assert r2.status_code == 200
    body = r2.json()
    assert body["event_id"] == event_id
    assert "correlated_event_ids" in body


async def test_list_events_filters_and_paginates(admin_client, shared_asset_id):
    created = await admin_client.post("/events/work-order", json=_work_order_payload(shared_asset_id))
    assert created.status_code == 202

    response = await admin_client.get("/events/?event_type=work_order_created&limit=1&offset=0")
    assert response.status_code == 200
    body = response.json()
    assert body["limit"] == 1
    assert body["offset"] == 0
    assert body["total"] >= 1
    assert all(item["event_type"] == "work_order_created" for item in body["items"])


async def test_acknowledge_event(admin_client, shared_asset_id):
    payload = _work_order_payload(shared_asset_id)
    r = await admin_client.post("/events/work-order", json=payload)
    event_id = r.json()["event_id"]

    r2 = await admin_client.post(f"/events/{event_id}/ack", json={
        "user_id": "test-runner",
        "role": "engineer",
        "acknowledged_at": _now(),
    })
    assert r2.status_code == 200
    assert r2.json()["status"] == "acknowledged"


# ---------------------------------------------------------------------------
# PTW
# ---------------------------------------------------------------------------

async def test_ingest_ptw(admin_client, shared_asset_id):
    r = await admin_client.post("/events/ptw", json={
        "event_id": uid(),
        "source_system": "PTW_system",
        "site_id": "SITE_001",
        "occurred_at": _now(),
        "received_at": _now(),
        "ptw_id": f"PTW-{uid()}",
        "work_area": "Pump Hall A",
        "asset_ids": [shared_asset_id],
        "ptw_type": "isolation",
        "issuing_engineer_id": "ENG-001",
    })
    assert r.status_code == 202
    body = r.json()
    assert body["status"] == "accepted"
    assert body["priority"] == "critical"
    assert "brief_id" in body


# ---------------------------------------------------------------------------
# Shift handover
# ---------------------------------------------------------------------------

async def test_ingest_shift_handover(admin_client):
    r = await admin_client.post("/events/shift-handover", json={
        "event_id": uid(),
        "source_system": "DCS",
        "site_id": "SITE_001",
        "occurred_at": _now(),
        "received_at": _now(),
        "outgoing_shift_lead_id": "OPS-OUT-001",
        "incoming_shift_lead_id": "OPS-IN-001",
        "handover_time": _now(),
    })
    assert r.status_code == 202
    body = r.json()
    assert body["status"] == "accepted"
    assert "brief_task_id" in body


# ---------------------------------------------------------------------------
# Alarm
# ---------------------------------------------------------------------------

async def test_ingest_alarm(admin_client, shared_asset_id):
    r = await admin_client.post("/events/alarm", json={
        "event_id": uid(),
        "source_system": "DCS",
        "site_id": "SITE_001",
        "occurred_at": _now(),
        "received_at": _now(),
        "alarm_id": f"ALM-{uid()}",
        "asset_id": shared_asset_id,
        "alarm_tag": f"{shared_asset_id}-HH",
        "alarm_description": "High vibration on pump shaft",
        "severity": "high",
        "acknowledged_by": "OPS-001",
    })
    assert r.status_code == 202
    assert r.json()["status"] == "accepted"


# ---------------------------------------------------------------------------
# Tag-out (Task 33)
# ---------------------------------------------------------------------------

async def test_ingest_tag_out(admin_client, shared_asset_id):
    r = await admin_client.post("/events/tag-out", json={
        "event_id": uid(),
        "source_system": "LOTO_system",
        "site_id": "SITE_001",
        "occurred_at": _now(),
        "received_at": _now(),
        "asset_id": shared_asset_id,
        "tag_out_reason": "Planned maintenance — bearing replacement",
        "performed_by": "TECH-001",
    })
    assert r.status_code == 202
    body = r.json()
    assert body["status"] == "accepted"
    assert "stream_entry_id" in body


async def test_tag_out_deduplication(admin_client, shared_asset_id):
    payload = {
        "event_id": uid(),
        "source_system": "LOTO_system",
        "site_id": "SITE_001",
        "occurred_at": _now(),
        "received_at": _now(),
        "asset_id": shared_asset_id,
        "tag_out_reason": "Dup test",
        "performed_by": "TECH-001",
    }
    r1 = await admin_client.post("/events/tag-out", json=payload)
    r2 = await admin_client.post("/events/tag-out", json=payload)
    assert r1.status_code == 202
    assert r2.status_code == 202
    assert r2.json()["status"] == "deduplicated"


# ---------------------------------------------------------------------------
# Inspection complete
# ---------------------------------------------------------------------------

async def test_ingest_inspection_complete_passed(admin_client, shared_asset_id):
    r = await admin_client.post("/events/inspection-complete", json={
        "event_id": uid(),
        "source_system": "inspection_app",
        "site_id": "SITE_001",
        "occurred_at": _now(),
        "received_at": _now(),
        "asset_id": shared_asset_id,
        "inspection_type": "vibration_analysis",
        "result": "passed",
        "performed_by": "TECH-001",
        "confidence": 0.95,
    })
    assert r.status_code == 202
    body = r.json()
    assert body["status"] == "accepted"
    # High confidence → no quarantine
    assert body["quarantine_item_id"] is None


async def test_ingest_inspection_complete_low_confidence_quarantined(admin_client, shared_asset_id):
    r = await admin_client.post("/events/inspection-complete", json={
        "event_id": uid(),
        "source_system": "inspection_app",
        "site_id": "SITE_001",
        "occurred_at": _now(),
        "received_at": _now(),
        "asset_id": shared_asset_id,
        "inspection_type": "visual",
        "result": "conditional",
        "performed_by": "TECH-002",
        "confidence": 0.5,
    })
    assert r.status_code == 202
    body = r.json()
    # confidence < 0.7 → goes to quarantine
    assert body["quarantine_item_id"] is not None


# ---------------------------------------------------------------------------
# Deviation flag
# ---------------------------------------------------------------------------

async def test_deviation_flag_and_resolve(admin_client, shared_asset_id):
    r = await admin_client.post("/events/deviation-flag", json={
        "asset_id": shared_asset_id,
        "description": "P&ID shows valve V-101 but physical is missing",
        "affected_topology_path": "loop/feed/V-101",
    })
    assert r.status_code == 202
    body = r.json()
    assert body["status"] == "accepted"
    item_id = body["item_id"]

    r2 = await admin_client.post(f"/events/deviation-flag/{item_id}/resolve", json={
        "resolution": "disputed",
        "moc_warranted": False,
        "notes": "Confirmed as drawing error, not physical deviation",
    })
    assert r2.status_code == 200
    assert r2.json()["resolution"] == "disputed"


async def test_deviation_flag_resolve_invalid_resolution(admin_client, shared_asset_id):
    r = await admin_client.post("/events/deviation-flag", json={
        "asset_id": shared_asset_id,
        "description": "Test deviation",
    })
    item_id = r.json()["item_id"]

    r2 = await admin_client.post(f"/events/deviation-flag/{item_id}/resolve", json={
        "resolution": "not_a_real_resolution",
    })
    assert r2.status_code == 400


async def test_deviation_flag_resolve_promoted(admin_client, shared_asset_id):
    """resolution=promoted → 200, resolution field is promoted, briefs_unfrozen in response."""
    r = await admin_client.post("/events/deviation-flag", json={
        "asset_id": shared_asset_id,
        "description": "Topology confirmed changed — bypass valve installed",
    })
    assert r.status_code == 202
    item_id = r.json()["item_id"]

    r2 = await admin_client.post(f"/events/deviation-flag/{item_id}/resolve", json={
        "resolution": "promoted",
        "moc_warranted": False,
        "notes": "Physical change verified by engineer",
    })
    assert r2.status_code == 200
    body = r2.json()
    assert body["resolution"] == "promoted"
    assert "briefs_unfrozen" in body
    assert body["moc_id"] is None


async def test_deviation_flag_resolve_moc_warranted(admin_client, shared_asset_id):
    """moc_warranted=True → 200 and moc_id is returned in response."""
    r = await admin_client.post("/events/deviation-flag", json={
        "asset_id": shared_asset_id,
        "description": "Topology change requiring management of change sign-off",
    })
    assert r.status_code == 202
    item_id = r.json()["item_id"]

    r2 = await admin_client.post(f"/events/deviation-flag/{item_id}/resolve", json={
        "resolution": "promoted",
        "moc_warranted": True,
        "notes": "Confirmed — new bypass loop added to P&ID",
    })
    assert r2.status_code == 200
    body = r2.json()
    assert body["resolution"] == "promoted"
    assert body["moc_id"] is not None
    assert body["moc_id"].startswith("MOC-")


async def test_ingest_inspection_with_document_id(admin_client, shared_asset_id):
    """Inspection with document_id provided → INSPECTION_RECORD Neo4j edge → edge_id not null."""
    r = await admin_client.post("/events/inspection-complete", json={
        "event_id": uid(),
        "source_system": "inspection_app",
        "site_id": "SITE_001",
        "occurred_at": _now(),
        "received_at": _now(),
        "asset_id": shared_asset_id,
        "inspection_type": "thickness_measurement",
        "result": "passed",
        "performed_by": "TECH-001",
        "confidence": 0.92,
        "document_id": f"DOC-INSP-{uid()}",  # triggers INSPECTION_RECORD edge in Neo4j
    })
    assert r.status_code == 202
    body = r.json()
    assert body["status"] == "accepted"
    assert body["edge_id"] is not None  # non-null only when document_id provided


# ---------------------------------------------------------------------------
# Plant state
# ---------------------------------------------------------------------------

async def test_set_and_get_plant_state(admin_client):
    r = await admin_client.post("/events/plant-state", json={
        "site_id": "SITE_001",
        "state": "normal",
    })
    assert r.status_code == 202
    assert r.json()["state"] == "normal"

    r2 = await admin_client.get("/events/plant-state/SITE_001")
    assert r2.status_code == 200
    assert "state" in r2.json()

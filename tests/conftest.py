"""
Shared fixtures for KAIROS integration tests.
Requires `make dev` to be running before executing the suite.
"""

import os
import pytest
import httpx
from uuid import uuid4

BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8000")

# Static internal key — never expires, returns role=admin.
# Defined in backend/api/config.py INTERNAL_API_KEY default.
_INTERNAL_KEY = os.getenv("INTERNAL_API_KEY", "kairos-internal-dev-key")

ADMIN_EMAIL = "admin@kairos.local"
ADMIN_PASSWORD = "KairosAdmin123!"
ENGINEER_EMAIL = "engineer@kairos.local"
ENGINEER_PASSWORD = "KairosEngineer123!"
FIELD_EMAIL = "field_worker@kairos.local"
FIELD_PASSWORD = "KairosField123!"


def uid() -> str:
    return uuid4().hex[:8].upper()


# ---------------------------------------------------------------------------
# Session-scoped token fixtures (sync — avoids event-loop scope conflicts)
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def engineer_token():
    r = httpx.post(
        f"{BASE_URL}/auth/login",
        json={"email": ENGINEER_EMAIL, "password": ENGINEER_PASSWORD},
        timeout=30,
    )
    assert r.status_code == 200, f"Engineer login failed: {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def field_token():
    r = httpx.post(
        f"{BASE_URL}/auth/login",
        json={"email": FIELD_EMAIL, "password": FIELD_PASSWORD},
        timeout=30,
    )
    assert r.status_code == 200, f"Field login failed: {r.text}"
    return r.json()["access_token"]


# ---------------------------------------------------------------------------
# Per-test async HTTP clients
# ---------------------------------------------------------------------------

@pytest.fixture
async def admin_client():
    # Uses INTERNAL_API_KEY — never expires, role=admin. No login required.
    async with httpx.AsyncClient(
        base_url=BASE_URL,
        headers={"Authorization": f"Bearer {_INTERNAL_KEY}"},
        timeout=30.0,
    ) as client:
        yield client


@pytest.fixture
async def engineer_client(engineer_token):
    async with httpx.AsyncClient(
        base_url=BASE_URL,
        headers={"Authorization": f"Bearer {engineer_token}"},
        timeout=30.0,
    ) as client:
        yield client


@pytest.fixture
async def field_client(field_token):
    async with httpx.AsyncClient(
        base_url=BASE_URL,
        headers={"Authorization": f"Bearer {field_token}"},
        timeout=30.0,
    ) as client:
        yield client


@pytest.fixture
async def anon_client():
    async with httpx.AsyncClient(base_url=BASE_URL, timeout=15.0) as client:
        yield client


# ---------------------------------------------------------------------------
# Session-scoped shared asset (created once, reused across tests)
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def shared_asset_id():
    asset_id = f"ASSET-TEST-{uid()}"
    r = httpx.post(
        f"{BASE_URL}/assets/",
        json={
            "asset_id": asset_id,
            "tag_number": f"TAG-{asset_id}",
            "name": f"Integration Test Asset {asset_id}",
            "equipment_class": "PUMP",
            "criticality": "critical",
            "site_id": "SITE_001",
            "facility_id": "FAC_001",
            "eam_source": "integration_test",
            "confirmed_by_user_id": "test-runner",
        },
        headers={"Authorization": f"Bearer {_INTERNAL_KEY}"},
        timeout=30,
    )
    assert r.status_code in (200, 201), f"Shared asset creation failed: {r.text}"
    return asset_id

"""
Seed test users for Kairos development.
Creates admin, engineer, and field_worker users in Supabase Auth.
Run inside the API container:
  docker exec kairos-backend-api python scripts/seed_users.py
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import structlog
from supabase import create_client

from api.config import settings

log = structlog.get_logger(__name__)

TEST_USERS = [
    {
        "email": "admin@kairos.local",
        "password": "KairosAdmin123!",
        "user_metadata": {"role": "admin", "site_id": "SITE_001", "name": "Admin User"},
    },
    {
        "email": "engineer@kairos.local",
        "password": "KairosEngineer123!",
        "user_metadata": {"role": "engineer", "site_id": "SITE_001", "name": "Engineer User"},
    },
    {
        "email": "field_worker@kairos.local",
        "password": "KairosField123!",
        "user_metadata": {"role": "field_worker", "site_id": "SITE_001", "name": "Field Worker"},
    },
    # Reliability and compliance existed in OPA (infra/policies/kairos.rego) but had no seeded
    # user, so neither persona could be logged into — the two roles that actually demonstrate
    # governance were the two nobody could show. Reliability owns the one-way quarantine gate
    # (`promote_quarantine`, which engineers deliberately do NOT have); compliance is a read-only
    # auditor scoped to the compliance cockpit and audit trail.
    {
        "email": "reliability@kairos.local",
        "password": "KairosReliability123!",
        "user_metadata": {"role": "reliability", "site_id": "SITE_001", "name": "Reliability Engineer"},
    },
    {
        "email": "compliance@kairos.local",
        "password": "KairosCompliance123!",
        "user_metadata": {"role": "compliance", "site_id": "SITE_001", "name": "Compliance Auditor"},
    },
]


async def seed():
    sb = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)

    existing = sb.auth.admin.list_users()
    existing_emails = {u.email for u in existing}

    for user in TEST_USERS:
        if user["email"] in existing_emails:
            log.info("seed_users.skip_existing", email=user["email"])
            continue
        result = sb.auth.admin.create_user({
            "email": user["email"],
            "password": user["password"],
            "user_metadata": user["user_metadata"],
            "email_confirm": True,
        })
        log.info("seed_users.created", email=result.user.email, id=str(result.user.id))

    log.info("seed_users.done", count=len(TEST_USERS))


if __name__ == "__main__":
    asyncio.run(seed())

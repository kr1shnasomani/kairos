"""Trust boundary — OPA enforcement surface, claim mapping, fail-closed, and site tenancy.

Pure logic + one localhost connection-refused probe. No stack, no secrets, no network egress.
"""

import asyncio

import pytest
from fastapi import HTTPException

from api.config import Settings
from api.dependencies import site_scope
from api.middleware.opa import OPAMiddleware, action_for, claims_to_user

# =============================================================================
# Which routes are policy-enforced
# =============================================================================


@pytest.mark.parametrize(
    ("method", "path", "expected"),
    [
        # writes — unchanged mapping
        ("POST", "/governance/quarantine/abc/promote", "promote_quarantine"),
        ("POST", "/documents/ingest", "ingest_document"),
        ("POST", "/assets/", "write_assets"),
        ("POST", "/events/work-order", "write_api"),
        # sensitive reads — previously enforced nowhere
        ("GET", "/audit-log/", "read_audit"),
        ("GET", "/compliance/gaps", "read_compliance"),
        ("GET", "/compliance/dashboard", "read_compliance"),
        ("GET", "/governance/quarantine", "read_governance"),
        # reads the UI treats as open to every authenticated role — must stay unenforced,
        # or the field-worker flows break without closing any boundary
        ("GET", "/search/", None),
        ("GET", "/briefs/", None),
        ("GET", "/assets/EQ-101", None),
        # never enforced
        ("GET", "/health/", None),
        ("POST", "/auth/login", None),
        ("GET", "/docs", None),
    ],
)
def test_action_for(method, path, expected):
    assert action_for(method, path) == expected


def test_cors_preflight_is_never_gated():
    # This middleware is outermost, so it sees the preflight before CORSMiddleware — and a
    # preflight carries no Authorization header. Gating it 401s every cross-origin request.
    assert action_for("OPTIONS", "/compliance/gaps") is None
    assert action_for("OPTIONS", "/documents/ingest") is None
    assert action_for("HEAD", "/compliance/gaps") == "read_compliance"


# =============================================================================
# Claim mapping — the app role is in user_metadata, not the top-level `role`
# =============================================================================


def test_role_comes_from_user_metadata_not_postgres_role():
    claims = {
        "sub": "u-1",
        "email": "e@example.test",
        "role": "authenticated",  # Supabase's Postgres role — matches no rego role
        "user_metadata": {"role": "engineer", "site_id": "SITE_001"},
    }
    user = claims_to_user(claims)
    assert user["role"] == "engineer"
    assert user["site_id"] == "SITE_001"
    assert user["user_id"] == "u-1"


def test_missing_metadata_falls_back_to_least_privilege():
    assert claims_to_user({"sub": "u-2"})["role"] == "field_worker"


# =============================================================================
# Fail closed when OPA is unreachable
# =============================================================================


def _middleware(debug: bool) -> OPAMiddleware:
    # Port 1 on loopback refuses immediately — no egress, no waiting on a timeout.
    return OPAMiddleware(
        app=None, opa_url="http://127.0.0.1:1", jwt_secret="s", internal_api_key="k", debug=debug
    )


def test_unreachable_opa_denies_outside_dev():
    mw = _middleware(debug=False)
    assert asyncio.run(mw._ask_opa({"role": "engineer"}, "write_assets", "/assets")) is False


def test_unreachable_opa_still_passes_through_in_dev():
    mw = _middleware(debug=True)
    assert asyncio.run(mw._ask_opa({"role": "engineer"}, "write_assets", "/assets")) is True


def test_internal_service_key_is_recognised_without_being_a_jwt():
    mw = _middleware(debug=False)

    class _Req:
        headers = {"Authorization": "Bearer k"}

    user = mw._user_from_request(_Req())
    assert user is not None and user["role"] == "admin"


def test_garbage_token_is_not_a_user():
    mw = _middleware(debug=False)

    class _Req:
        headers = {"Authorization": "Bearer not-a-jwt"}

    assert mw._user_from_request(_Req()) is None


# =============================================================================
# Site tenancy — derived from the token, never the query string
# =============================================================================

_ENGINEER = {"role": "engineer", "site_id": "SITE_001"}


def test_non_admin_is_pinned_to_own_site_when_none_requested():
    assert site_scope(_ENGINEER, None) == "SITE_001"


def test_non_admin_may_restate_own_site():
    assert site_scope(_ENGINEER, "SITE_001") == "SITE_001"


def test_non_admin_cannot_read_another_site():
    with pytest.raises(HTTPException) as exc:
        site_scope(_ENGINEER, "SITE_002")
    assert exc.value.status_code == 403


def test_account_without_a_site_gets_nothing_rather_than_everything():
    with pytest.raises(HTTPException) as exc:
        site_scope({"role": "engineer", "site_id": ""}, None)
    assert exc.value.status_code == 403


def test_admin_keeps_the_cross_site_view():
    admin = {"role": "admin", "site_id": "SITE_001"}
    assert site_scope(admin, None) is None
    assert site_scope(admin, "SITE_002") == "SITE_002"


# =============================================================================
# Dev bypass requires debug AND a non-production env
# =============================================================================


@pytest.mark.parametrize(
    ("env", "debug", "expected"),
    [
        ("development", True, True),
        ("development", False, False),
        ("production", True, False),  # the mis-set-env case the guardrail alone could miss
        ("production", False, False),
    ],
)
def test_dev_bypass_allowed(env, debug, expected):
    # APP_ENV=production trips the secret guardrail, so build the production cases with the
    # secrets already set — the property, not the guardrail, is what is under test here.
    extra = (
        {
            "INTERNAL_API_KEY": "set",
            "APP_SECRET_KEY": "set",
            "NEO4J_PASSWORD": "set",
            "SUPABASE_SERVICE_ROLE_KEY": "set",
            "SUPABASE_JWT_SECRET": "set",
        }
        if env == "production"
        else {}
    )
    if env == "production" and debug:
        # the guardrail refuses to construct at all — which is itself the enforcement
        with pytest.raises(ValueError, match="APP_DEBUG must be false"):
            Settings(APP_ENV=env, APP_DEBUG=debug, **extra)
        return
    assert Settings(APP_ENV=env, APP_DEBUG=debug, **extra).dev_bypass_allowed is expected

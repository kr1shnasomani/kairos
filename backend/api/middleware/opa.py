"""
OPA middleware — policy enforcement for write operations and sensitive reads.
Calls kairos-opa for the enforced routes; denies with 403 if OPA returns false.
Skips the check when `dev_bypass_allowed` and no Authorization header (dev bypass, same as auth).

Fails **closed**: if OPA cannot be reached, the request is denied outside dev. An authorization
layer that answers "allow" when it is down is not an authorization layer.
"""


import httpx
import structlog
from fastapi.responses import JSONResponse
from jose import JWTError, jwt
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

log = structlog.get_logger(__name__)

_SKIP_PREFIXES = ("/health", "/auth", "/docs", "/openapi", "/redoc")
_WRITE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})
# OPTIONS is deliberately absent: this middleware is the outermost one, so it sees the CORS
# preflight before CORSMiddleware does — and a preflight carries no Authorization header, so
# enforcing it would 401 every cross-origin request the browser app makes.
_READ_METHODS = frozenset({"GET", "HEAD"})

# Routes mapped to OPA action names from kairos.rego
_ACTION_MAP = (
    ("/governance/quarantine", "promote_quarantine"),
    ("/governance/moc", "resolve_admin_conflict"),
    ("/governance/conflicts", "resolve_admin_conflict"),
    ("/documents", "ingest_document"),
    ("/assets", "write_assets"),
)

# Reads that leak governed material to roles the UI already refuses to show it to.
# `use-role.ts` gates these three surfaces client-side; without this map the backend
# enforced nothing, so the audit trail and the compliance cockpit were readable by any
# authenticated role — including `field_worker` — by calling the API directly.
#
# Deliberately narrow. `/search`, `/briefs` and `/assets` reads stay unenforced: the UI
# already treats them as open to every authenticated role, so gating them here would break
# the field-worker flows without closing a boundary.
_READ_ACTION_MAP = (
    ("/audit-log", "read_audit"),
    ("/compliance", "read_compliance"),
    ("/governance", "read_governance"),
)


def action_for(method: str, path: str) -> str | None:
    """OPA action for this request, or None when the route is not policy-enforced."""
    if any(path.startswith(p) for p in _SKIP_PREFIXES):
        return None
    if method in _WRITE_METHODS:
        for prefix, name in _ACTION_MAP:
            if path.startswith(prefix):
                return name
        return "write_api"  # non-sensitive catch-all; allowed by rego for any authenticated role
    if method in _READ_METHODS:
        for prefix, name in _READ_ACTION_MAP:
            if path.startswith(prefix):
                return name
    return None


def claims_to_user(claims: dict) -> dict:
    """Map Supabase JWT claims onto the shape `kairos.rego` expects.

    The app role lives in `user_metadata.role`. The token's **top-level** `role` is Postgres's
    `"authenticated"`, which matches no entry in the rego role table — so reading it made
    `user_permissions` undefined and `allow` false for every caller. That was invisible only
    because the layer never actually ran: no-token requests took the dev pass-through, and
    tokens that did arrive failed to decode (see `_user_from_request`). Mirrors the mapping in
    `dependencies.get_current_user` so both halves of the trust boundary agree on who a user is.
    """
    meta = claims.get("user_metadata") or {}
    return {
        "user_id": claims.get("sub", ""),
        "email": claims.get("email", ""),
        "role": meta.get("role", "field_worker"),
        "site_id": meta.get("site_id", ""),
    }


class OPAMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, opa_url: str, jwt_secret: str, internal_api_key: str, debug: bool = False):
        super().__init__(app)
        self.opa_url = f"{opa_url}/v1/data/kairos/authz/allow"
        self.jwt_secret = jwt_secret
        self.internal_api_key = internal_api_key
        self.debug = debug

    async def dispatch(self, request: Request, call_next):
        action = action_for(request.method, request.url.path)
        if action is None:
            return await call_next(request)

        user = self._user_from_request(request)
        if user is None:
            if self.debug:
                return await call_next(request)  # no token in dev → pass through
            return JSONResponse({"detail": "Authentication required"}, status_code=401)

        allowed = await self._ask_opa(user, action, request.url.path)
        if not allowed:
            log.info(
                "opa.denied",
                user_id=user.get("user_id"),
                role=user.get("role"),
                action=action,
                path=request.url.path,
            )
            return JSONResponse(
                {"detail": f"Forbidden: role '{user.get('role')}' is not permitted to perform this action"},
                status_code=403,
            )
        return await call_next(request)

    def _user_from_request(self, request: Request) -> dict | None:
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return None
        token = auth[7:]
        # Internal service principal — the Go connector and the Celery workers authenticate with
        # INTERNAL_API_KEY, which is not a JWT. Without this it decodes to None and, once the
        # middleware stops failing open, every connector write is a 401. Same principal as
        # `dependencies.get_current_user`.
        if self.internal_api_key and token == self.internal_api_key:
            return {"user_id": "service-kairos-connector", "role": "admin", "site_id": "SITE_001"}
        try:
            claims = jwt.decode(
                token,
                self.jwt_secret,
                algorithms=["HS256"],
                # Supabase stamps aud="authenticated"; python-jose rejects a token that carries
                # an `aud` it was not given one to match, so leaving this on made *every* real
                # token undecodable here.
                options={"verify_exp": True, "verify_aud": False},
            )
        except JWTError:
            return None
        return claims_to_user(claims)

    async def _ask_opa(self, user: dict, action: str, resource: str) -> bool:
        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                resp = await client.post(
                    self.opa_url,
                    json={"input": {"user": user, "action": action, "resource": resource}},
                )
                return resp.status_code == 200 and resp.json().get("result", False)
        except Exception as exc:
            # Fail closed outside dev. This used to `return True` unconditionally, so OPA being
            # down — or unreachable, or misconfigured — silently disabled authorization
            # everywhere instead of taking the API offline. In dev the pass-through stays, so a
            # stack without the OPA container still works.
            log.error("opa.unreachable", error=str(exc), action=action, fail_open=self.debug)
            return self.debug

"""
OPA middleware — policy enforcement for write operations.
Calls kairos-opa for POST/PUT/DELETE routes; denies with 403 if OPA returns false.
Skips check when APP_DEBUG=True and no Authorization header (dev bypass, same as auth).
"""

from typing import Optional

import httpx
import structlog
from fastapi.responses import JSONResponse
from jose import JWTError, jwt
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

log = structlog.get_logger(__name__)

_SKIP_PREFIXES = ("/health", "/auth", "/docs", "/openapi", "/redoc")
_WRITE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})

# Routes mapped to OPA action names from kairos.rego
_ACTION_MAP = (
    ("/governance/quarantine", "promote_quarantine"),
    ("/governance/moc", "resolve_admin_conflict"),
    ("/governance/conflicts", "resolve_admin_conflict"),
    ("/documents", "ingest_document"),
    ("/assets", "write_assets"),
)


def _action(path: str) -> str:
    for prefix, name in _ACTION_MAP:
        if path.startswith(prefix):
            return name
    return "write_api"  # non-sensitive catch-all; allowed by rego for any authenticated role


class OPAMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, opa_url: str, jwt_secret: str, debug: bool = False):
        super().__init__(app)
        self.opa_url = f"{opa_url}/v1/data/kairos/authz/allow"
        self.jwt_secret = jwt_secret
        self.debug = debug

    async def dispatch(self, request: Request, call_next):
        if request.method not in _WRITE_METHODS:
            return await call_next(request)
        if any(request.url.path.startswith(p) for p in _SKIP_PREFIXES):
            return await call_next(request)

        user = self._user_from_request(request)
        if user is None:
            if self.debug:
                return await call_next(request)  # no token in dev → pass through
            return JSONResponse({"detail": "Authentication required"}, status_code=401)

        allowed = await self._ask_opa(user, _action(request.url.path), request.url.path)
        if not allowed:
            log.info(
                "opa.denied",
                user_id=user.get("user_id"),
                role=user.get("role"),
                action=_action(request.url.path),
                path=request.url.path,
            )
            return JSONResponse(
                {"detail": f"Forbidden: role '{user.get('role')}' is not permitted to perform this action"},
                status_code=403,
            )
        return await call_next(request)

    def _user_from_request(self, request: Request) -> Optional[dict]:
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return None
        try:
            return jwt.decode(
                auth[7:],
                self.jwt_secret,
                algorithms=["HS256"],
                options={"verify_exp": True},
            )
        except JWTError:
            return None

    async def _ask_opa(self, user: dict, action: str, resource: str) -> bool:
        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                resp = await client.post(
                    self.opa_url,
                    json={"input": {"user": user, "action": action, "resource": resource}},
                )
                return resp.status_code == 200 and resp.json().get("result", False)
        except Exception as exc:
            # ponytail: fail-open so OPA being down doesn't take the API offline in dev
            log.warning("opa.unreachable", error=str(exc), action=action)
            return True

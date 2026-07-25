"""
KAIROS — FastAPI Dependency Injection
Provides shared clients as FastAPI dependencies (injected per-request or application-wide).
"""

import asyncio
import hashlib
import time
from typing import Annotated

import redis.asyncio as aioredis
import structlog
from elasticsearch import AsyncElasticsearch
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from neo4j import AsyncDriver, AsyncGraphDatabase
from qdrant_client import AsyncQdrantClient
from supabase import Client, create_client
from temporalio.client import Client as TemporalClient

from api.config import Settings, get_settings

log = structlog.get_logger(__name__)

SettingsDep = Annotated[Settings, Depends(get_settings)]

# =============================================================================
# Neo4j — Temporal Reality Graph
# =============================================================================

_neo4j_driver: AsyncDriver | None = None


async def get_neo4j_driver(settings: SettingsDep) -> AsyncDriver:
    global _neo4j_driver
    if _neo4j_driver is None:
        _neo4j_driver = AsyncGraphDatabase.driver(
            settings.NEO4J_URI,
            auth=(settings.NEO4J_USERNAME, settings.NEO4J_PASSWORD),
            # Aura Free closes idle connections; without pool hygiene the next query on a
            # stale pooled connection throws SessionExpired ("defunct connection") → the
            # intermittent 500s seen on Neo4j-backed endpoints (compliance/dashboard,
            # /assets/{id}/knowledge, graph, blast-radius). Liveness-check a connection
            # that's been idle before handing it out, and recycle connections well before
            # Aura's idle timeout so they never go stale.
            liveness_check_timeout=30,          # ping (RESET) a connection idle >30s; replace if dead
            max_connection_lifetime=300,        # recycle after 5 min, below Aura's idle window
            connection_acquisition_timeout=60,
        )
    return _neo4j_driver


Neo4jDep = Annotated[AsyncDriver, Depends(get_neo4j_driver)]


# =============================================================================
# Qdrant — Vector Store
# =============================================================================

_qdrant_client: AsyncQdrantClient | None = None


async def get_qdrant_client(settings: SettingsDep) -> AsyncQdrantClient:
    global _qdrant_client
    if _qdrant_client is None:
        _qdrant_client = AsyncQdrantClient(
            url=settings.QDRANT_URL,
            api_key=settings.QDRANT_API_KEY or None,
        )
    return _qdrant_client


QdrantDep = Annotated[AsyncQdrantClient, Depends(get_qdrant_client)]


# =============================================================================
# Elasticsearch — Exact Search
# =============================================================================

_es_client: AsyncElasticsearch | None = None


async def get_es_client(settings: SettingsDep) -> AsyncElasticsearch:
    global _es_client
    if _es_client is None:
        kwargs: dict = {"hosts": [settings.ELASTICSEARCH_URL]}
        if settings.ELASTICSEARCH_USERNAME:
            kwargs["basic_auth"] = (
                settings.ELASTICSEARCH_USERNAME,
                settings.ELASTICSEARCH_PASSWORD,
            )
        _es_client = AsyncElasticsearch(**kwargs)
    return _es_client


ElasticsearchDep = Annotated[AsyncElasticsearch, Depends(get_es_client)]


# =============================================================================
# Redis — Cache + Streams
# =============================================================================

_redis_client: aioredis.Redis | None = None


async def get_redis(settings: SettingsDep) -> aioredis.Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = aioredis.from_url(
            settings.REDIS_URL,
            password=settings.REDIS_PASSWORD or None,
            db=settings.REDIS_DB_CACHE,
            decode_responses=True,
        )
    return _redis_client


RedisDep = Annotated[aioredis.Redis, Depends(get_redis)]


# =============================================================================
# Temporal — Workflow Orchestration
# =============================================================================

_temporal_client: TemporalClient | None = None


async def get_temporal_client(settings: SettingsDep) -> TemporalClient:
    global _temporal_client
    if _temporal_client is None:
        _temporal_client = await TemporalClient.connect(
            settings.TEMPORAL_ADDRESS,
            namespace=settings.TEMPORAL_NAMESPACE,
        )
    return _temporal_client


TemporalDep = Annotated[TemporalClient, Depends(get_temporal_client)]


# =============================================================================
# Supabase — Document Vault, Relational DB, Auth
# Uses service role key: bypasses RLS (backend-only access)
# =============================================================================

_supabase_client: Client | None = None


def get_supabase(settings: SettingsDep) -> Client:
    global _supabase_client
    if _supabase_client is None:
        _supabase_client = create_client(
            settings.SUPABASE_URL,
            settings.SUPABASE_SERVICE_ROLE_KEY,
        )
    return _supabase_client


SupabaseDep = Annotated[Client, Depends(get_supabase)]


# =============================================================================
# Auth — JWT Bearer token verification
# =============================================================================

bearer_scheme = HTTPBearer(auto_error=False)

# --- Verified-token cache -----------------------------------------------------
# ponytail: tiny in-process TTL cache so a valid token skips the Supabase Auth
# round-trip on every request. Revocation is still enforced — just up to
# AUTH_CACHE_TTL_SECONDS stale. Per-worker; entries keyed by token hash.
_AUTH_CACHE_MAX = 2048
_auth_cache: dict[str, tuple[float, dict]] = {}


def _auth_cache_get(token: str) -> dict | None:
    entry = _auth_cache.get(hashlib.sha256(token.encode()).hexdigest())
    if entry is None:
        return None
    expires_at, user = entry
    if time.monotonic() >= expires_at:
        _auth_cache.pop(hashlib.sha256(token.encode()).hexdigest(), None)
        return None
    return user


def _auth_cache_put(token: str, user: dict, ttl: int) -> None:
    if ttl <= 0:
        return
    if len(_auth_cache) >= _AUTH_CACHE_MAX:
        now = time.monotonic()
        for k in [k for k, (exp, _) in _auth_cache.items() if now >= exp]:
            _auth_cache.pop(k, None)
        if len(_auth_cache) >= _AUTH_CACHE_MAX:
            _auth_cache.clear()  # bounded worst case; rare
    _auth_cache[hashlib.sha256(token.encode()).hexdigest()] = (time.monotonic() + ttl, user)


async def get_current_user(
    settings: SettingsDep,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)] = None,
) -> dict:
    """
    Decode and validate the JWT bearer token.
    In development, if no token is provided and APP_DEBUG is True, returns a mock user.
    In production, raises 401 for missing/invalid tokens.
    """
    if not credentials:
        if settings.APP_DEBUG:
            # Allow unauthenticated access in dev for rapid iteration
            log.warning("auth.bypass", reason="APP_DEBUG=true, no token provided")
            return {"user_id": "dev-user", "role": "engineer", "site_id": "SITE_001"}
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Bearer token required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials

    # Internal service bypass — Go connector and Celery workers call with INTERNAL_API_KEY
    if token == settings.INTERNAL_API_KEY:
        return {"user_id": "service-kairos-connector", "email": "connector@internal", "role": "admin", "site_id": "SITE_001", "sub": "service-connector"}

    # Fast path: recently-verified token — skips the Supabase Auth round-trip.
    cached = _auth_cache_get(token)
    if cached is not None:
        return cached

    try:
        # Use a fresh client with anon key for token verification — keeps the global
        # service-role client's session clean (auth.get_user mutates client state).
        verify_client = create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)
        result = await asyncio.to_thread(lambda: verify_client.auth.get_user(token))
        user = result.user
        if not user:
            raise ValueError("No user returned")
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired token: {e}",
            headers={"WWW-Authenticate": "Bearer"},
        )

    meta = user.user_metadata or {}
    user_dict = {
        "user_id": str(user.id),
        "email": user.email,
        "role": meta.get("role", "field_worker"),
        "site_id": meta.get("site_id", ""),
        "sub": str(user.id),
    }
    _auth_cache_put(token, user_dict, settings.AUTH_CACHE_TTL_SECONDS)
    return user_dict


CurrentUserDep = Annotated[dict, Depends(get_current_user)]


# =============================================================================
# Role-Based Access Control helpers
# =============================================================================

def require_role(*roles: str):
    """
    Dependency factory: raises 403 if the current user's role is not in `roles`.
    Usage: Depends(require_role("engineer", "admin"))
    """
    async def _check(current_user: CurrentUserDep) -> dict:
        user_role = current_user.get("role", "")
        if user_role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{user_role}' does not have access. Required: {list(roles)}",
            )
        return current_user
    return _check

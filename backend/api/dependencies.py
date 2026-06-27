"""
KAIROS — FastAPI Dependency Injection
Provides shared clients as FastAPI dependencies (injected per-request or application-wide).
"""

from functools import lru_cache
from typing import Annotated

import redis.asyncio as aioredis
import structlog
from elasticsearch import AsyncElasticsearch
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
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

    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.SUPABASE_JWT_SECRET or settings.APP_SECRET_KEY,
            algorithms=["HS256"],
            options={"verify_exp": True},
        )
        return payload
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired token: {e}",
            headers={"WWW-Authenticate": "Bearer"},
        )


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

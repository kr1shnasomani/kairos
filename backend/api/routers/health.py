"""
Health router — liveness and readiness probes.
"""

import asyncio
from fastapi import APIRouter, Response, status
from pydantic import BaseModel

from api.dependencies import Neo4jDep, QdrantDep, ElasticsearchDep, RedisDep, TemporalDep

router = APIRouter()


class HealthResponse(BaseModel):
    status: str
    version: str
    service: str


@router.get("/", response_model=HealthResponse, summary="Liveness probe")
async def health_check() -> HealthResponse:
    """Returns 200 if the API process is alive."""
    from api.config import settings
    return HealthResponse(status="ok", version=settings.APP_VERSION, service="kairos-api")


@router.get("/detailed", summary="Detailed readiness probe")
async def detailed_health_check(
    response: Response,
    neo4j: Neo4jDep,
    qdrant: QdrantDep,
    es: ElasticsearchDep,
    redis: RedisDep,
    temporal: TemporalDep,
) -> dict:
    """
    Returns 200 when all downstream dependencies are reachable.
    Pings Neo4j, Qdrant, ES, Redis, and Temporal.
    """
    checks = {
        "neo4j": "pending",
        "qdrant": "pending",
        "elasticsearch": "pending",
        "redis": "pending",
        "temporal": "pending",
    }

    async def check_neo4j():
        try:
            await neo4j.verify_connectivity()
            checks["neo4j"] = "ok"
        except Exception as e:
            checks["neo4j"] = f"error: {str(e)}"

    async def check_qdrant():
        try:
            await qdrant.get_collections()
            checks["qdrant"] = "ok"
        except Exception as e:
            checks["qdrant"] = f"error: {str(e)}"

    async def check_es():
        try:
            await es.info()
            checks["elasticsearch"] = "ok"
        except Exception as e:
            checks["elasticsearch"] = f"error: {str(e)}"

    async def check_redis():
        try:
            await redis.ping()
            checks["redis"] = "ok"
        except Exception as e:
            checks["redis"] = f"error: {str(e)}"

    async def check_temporal():
        try:
            await temporal.service_client.check_health()
            checks["temporal"] = "ok"
        except Exception as e:
            checks["temporal"] = f"error: {str(e)}"

    await asyncio.gather(
        check_neo4j(),
        check_qdrant(),
        check_es(),
        check_redis(),
        check_temporal(),
    )

    overall_status = "ready"
    if any(status != "ok" for status in checks.values()):
        overall_status = "degraded"
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return {"status": overall_status, "checks": checks}

"""
Health router — liveness and readiness probes.
"""

from fastapi import APIRouter
from pydantic import BaseModel

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


@router.get("/ready", summary="Readiness probe")
async def readiness_check() -> dict:
    """
    Returns 200 when all downstream dependencies are reachable.
    TODO: add per-service checks (Neo4j, Qdrant, Redis, ES).
    """
    return {"status": "ready", "checks": {"neo4j": "pending", "qdrant": "pending", "redis": "pending"}}

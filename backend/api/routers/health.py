"""
Health router — liveness and readiness probes.
"""

import asyncio
import time

import httpx
from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel

from api.dependencies import (
    ElasticsearchDep,
    Neo4jDep,
    QdrantDep,
    RedisDep,
    SettingsDep,
    TemporalDep,
    require_role,
)

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


@router.get("/model", summary="Probe an external model provider (admin, opt-in)")
async def model_health_check(
    provider: str,
    settings: SettingsDep,
    _user: dict = Depends(require_role("admin")),
) -> dict:
    """Minimal liveness probe for a rate-limited model provider (NIM / Gemini / Jina / Groq).

    Admin-only and NOT polled by default — each call spends real provider quota. The System Health
    page fires it at most once/minute per provider, and only when that provider's toggle is on.
    Uses the smallest possible request (1 token / 1 embedding / a models list).
    """
    provider = provider.lower()
    t0 = time.perf_counter()

    async def _post(url: str, key: str, body: dict) -> httpx.Response:
        async with httpx.AsyncClient(timeout=20) as c:
            return await c.post(url, headers={"Authorization": f"Bearer {key}"}, json=body)

    try:
        if provider == "nim":
            if not settings.NVIDIA_NIM_API_KEY:
                return {"provider": provider, "ok": False, "detail": "not configured"}
            r = await _post(f"{settings.NVIDIA_NIM_BASE_URL}/chat/completions", settings.NVIDIA_NIM_API_KEY,
                            {"model": settings.NVIDIA_NIM_MODEL, "messages": [{"role": "user", "content": "ping"}], "max_tokens": 1})
            model = settings.NVIDIA_NIM_MODEL
        elif provider == "gemini":
            if not settings.GEMINI_API_KEY:
                return {"provider": provider, "ok": False, "detail": "not configured"}
            r = await _post(f"{settings.GEMINI_BASE_URL}/chat/completions", settings.GEMINI_API_KEY,
                            {"model": settings.GEMINI_MODEL, "messages": [{"role": "user", "content": "ping"}], "max_tokens": 1})
            model = settings.GEMINI_MODEL
        elif provider == "jina":
            if not settings.JINA_API_KEY:
                return {"provider": provider, "ok": False, "detail": "not configured"}
            r = await _post(settings.JINA_EMBED_URL, settings.JINA_API_KEY,
                            {"model": settings.JINA_EMBED_MODEL, "input": ["ping"]})
            model = settings.JINA_EMBED_MODEL
        elif provider == "groq":
            if not settings.GROQ_API_KEY:
                return {"provider": provider, "ok": False, "detail": "not configured"}
            async with httpx.AsyncClient(timeout=20) as c:
                r = await c.get("https://api.groq.com/openai/v1/models",
                                headers={"Authorization": f"Bearer {settings.GROQ_API_KEY}"})
            model = settings.GROQ_WHISPER_MODEL
        else:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=f"Unknown provider '{provider}'.")

        latency_ms = (time.perf_counter() - t0) * 1000
        return {"provider": provider, "ok": r.status_code < 300, "status": r.status_code,
                "model": model, "latency_ms": round(latency_ms), "detail": None if r.status_code < 300 else r.text[:120]}
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001 — a probe failure is a status, not a 500
        return {"provider": provider, "ok": False,
                "latency_ms": round((time.perf_counter() - t0) * 1000), "detail": str(exc)[:120]}

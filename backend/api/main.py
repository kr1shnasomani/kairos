"""
KAIROS — FastAPI Application Entry Point
"""

from contextlib import asynccontextmanager
from typing import AsyncGenerator

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from api.config import settings
from api.middleware.telemetry import setup_telemetry
from api.routers import (
    assets,
    auth,
    briefs,
    compliance,
    documents,
    events,
    governance,
    health,
    search,
)

log = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifecycle: startup and shutdown."""
    log.info("kairos.startup", env=settings.APP_ENV, version=settings.APP_VERSION)
    # Initialise connections, warm caches, etc. (per-service setup)
    yield
    log.info("kairos.shutdown")


def create_app() -> FastAPI:
    app = FastAPI(
        title="KAIROS API",
        description=(
            "Industrial Operational Intelligence Platform — "
            "proactive, event-driven knowledge delivery for asset-intensive industries."
        ),
        version=settings.APP_VERSION,
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
        lifespan=lifespan,
    )

    # -------------------------------------------------------------------------
    # CORS
    # -------------------------------------------------------------------------
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # -------------------------------------------------------------------------
    # OpenTelemetry (no-op when OTEL endpoint is not configured)
    # -------------------------------------------------------------------------
    if settings.APP_ENV != "test":
        setup_telemetry(app)

    # -------------------------------------------------------------------------
    # Routers — one per domain layer
    # -------------------------------------------------------------------------
    app.include_router(health.router, prefix="/health", tags=["Health"])
    app.include_router(auth.router, prefix="/auth", tags=["Auth"])
    app.include_router(assets.router, prefix="/assets", tags=["Assets (Layer 1)"])
    app.include_router(documents.router, prefix="/documents", tags=["Documents (Layer 2-3)"])
    app.include_router(search.router, prefix="/search", tags=["Search (Layer 11)"])
    app.include_router(events.router, prefix="/events", tags=["Events (Layer 8)"])
    app.include_router(briefs.router, prefix="/briefs", tags=["Briefs (Layer 8)"])
    app.include_router(governance.router, prefix="/governance", tags=["Governance (Layer 7)"])
    app.include_router(compliance.router, prefix="/compliance", tags=["Compliance"])

    # -------------------------------------------------------------------------
    # Global exception handler
    # -------------------------------------------------------------------------
    @app.exception_handler(Exception)
    async def global_exception_handler(request, exc: Exception) -> JSONResponse:
        log.error("unhandled_exception", exc=str(exc), path=str(request.url))
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error. Check logs for details."},
        )

    return app


app = create_app()

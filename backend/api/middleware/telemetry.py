"""
Telemetry middleware — OpenTelemetry instrumentation.
Sets up tracing and metrics for FastAPI.
"""

import structlog
from fastapi import FastAPI
from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

log = structlog.get_logger(__name__)


def setup_telemetry(app: FastAPI) -> None:
    """Configure OpenTelemetry tracing. No-op if OTEL endpoint is unreachable."""
    try:
        from api.config import settings

        resource = Resource.create({
            "service.name": settings.OTEL_SERVICE_NAME,
            "service.version": settings.OTEL_SERVICE_VERSION,
            "deployment.environment": settings.APP_ENV,
        })

        provider = TracerProvider(resource=resource)

        exporter = OTLPSpanExporter(
            endpoint=settings.OTEL_EXPORTER_OTLP_ENDPOINT,
            insecure=True,
        )
        provider.add_span_processor(BatchSpanProcessor(exporter))
        trace.set_tracer_provider(provider)

        FastAPIInstrumentor.instrument_app(app, tracer_provider=provider)

        log.info("telemetry.setup", endpoint=settings.OTEL_EXPORTER_OTLP_ENDPOINT)
    except Exception as e:
        log.warning("telemetry.setup_failed", error=str(e), reason="OTEL collector may not be running")

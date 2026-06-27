"""
Telemetry middleware — OpenTelemetry instrumentation.
Sets up tracing and metrics for FastAPI, Redis, and HTTPX.
"""

import structlog
from fastapi import FastAPI
from opentelemetry import metrics, trace
from opentelemetry.exporter.otlp.proto.grpc.metric_exporter import OTLPMetricExporter
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
from opentelemetry.instrumentation.redis import RedisInstrumentor
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

log = structlog.get_logger(__name__)


def setup_telemetry(app: FastAPI) -> None:
    """Configure OpenTelemetry tracing and metrics. No-op if OTEL endpoint is unreachable."""
    try:
        from api.config import settings

        resource = Resource.create({
            "service.name": settings.OTEL_SERVICE_NAME,
            "service.version": settings.OTEL_SERVICE_VERSION,
            "deployment.environment": settings.APP_ENV,
        })

        # --- Traces ---
        tracer_provider = TracerProvider(resource=resource)
        tracer_provider.add_span_processor(
            BatchSpanProcessor(OTLPSpanExporter(
                endpoint=settings.OTEL_EXPORTER_OTLP_ENDPOINT,
                insecure=True,
            ))
        )
        trace.set_tracer_provider(tracer_provider)

        # --- Metrics ---
        metric_reader = PeriodicExportingMetricReader(
            OTLPMetricExporter(
                endpoint=settings.OTEL_EXPORTER_OTLP_ENDPOINT,
                insecure=True,
            ),
            export_interval_millis=15_000,
        )
        meter_provider = MeterProvider(resource=resource, metric_readers=[metric_reader])
        metrics.set_meter_provider(meter_provider)

        # --- Auto-instrumentors ---
        FastAPIInstrumentor.instrument_app(app, tracer_provider=tracer_provider)
        RedisInstrumentor().instrument(tracer_provider=tracer_provider)
        HTTPXClientInstrumentor().instrument(tracer_provider=tracer_provider)

        log.info("telemetry.setup", endpoint=settings.OTEL_EXPORTER_OTLP_ENDPOINT)
    except Exception as e:
        log.warning("telemetry.setup_failed", error=str(e), reason="OTEL collector may not be running")

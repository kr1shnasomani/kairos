"""
Celery application — async task queue configuration.
Brokers: Redis (dev). Workers: ingestion, extraction, attribution.
"""

import os

from celery import Celery

broker_url = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/1")
result_backend = os.getenv("CELERY_RESULT_BACKEND", "redis://localhost:6379/1")

celery_app = Celery(
    "kairos",
    broker=broker_url,
    backend=result_backend,
    include=[
        "workers.ingestion",
        "workers.extraction",
        "workers.attribution",
        "workers.voice_transcription",
        "workers.brief_assembly",
        "workers.model_validation",
        "workers.offboarding",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_routes={
        "workers.ingestion.*": {"queue": "ingestion"},
        "workers.extraction.*": {"queue": "extraction"},
        "workers.attribution.*": {"queue": "attribution"},
        "workers.voice_transcription.*": {"queue": "transcription"},
        "workers.brief_assembly.*": {"queue": "ingestion"},
        "workers.model_validation.*": {"queue": "validation"},
        "workers.offboarding.*": {"queue": "elicitation"},
    },
    task_track_started=True,
    task_acks_late=True,  # Ensure tasks aren't lost if worker crashes
    worker_prefetch_multiplier=1,  # One task at a time for ML-heavy jobs
    # Perf/reliability wins (celery-expert skill):
    result_expires=3600,  # expire results so the Redis backend can't grow unbounded
    broker_connection_retry_on_startup=True,  # don't crash if Redis lags at startup (Celery 6 default=False)
    worker_max_tasks_per_child=200,  # recycle workers to cap memory creep on long-lived pools
)

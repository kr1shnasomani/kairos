"""
Celery application — async task queue configuration.
Brokers: Redis (dev). Workers: ingestion, extraction, attribution.
"""

from celery import Celery
import os

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
    },
    task_track_started=True,
    task_acks_late=True,  # Ensure tasks aren't lost if worker crashes
    worker_prefetch_multiplier=1,  # One task at a time for ML-heavy jobs
)

"""
DEAD STUBS — do not wire these tasks.

The real ingestion pipeline runs entirely through Temporal activities in
workflows/document_pipeline.py (task queue: kairos-ingestion).

These task names remain registered so celery_app.include doesn't error on
import, but they raise immediately if called so failures are visible rather
than silently returning placeholder data.
"""

from workers.celery_app import celery_app


@celery_app.task(queue="ingestion", name="workers.ingestion.ingest_document")
def ingest_document(*args, **kwargs):
    raise RuntimeError(
        "workers.ingestion.ingest_document is a dead stub. "
        "Use DocumentIngestionWorkflow via Temporal (task queue: kairos-ingestion)."
    )


@celery_app.task(queue="ingestion", name="workers.ingestion.reindex_document")
def reindex_document(*args, **kwargs):
    raise RuntimeError(
        "workers.ingestion.reindex_document is a dead stub. "
        "Re-indexing is handled by Temporal activities."
    )

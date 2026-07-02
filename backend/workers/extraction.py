"""
DEAD STUBS — do not wire these tasks.

Entity linking and form extraction run as Temporal activities inside
DocumentIngestionWorkflow (link_to_graph, run_ner activities).
"""

from workers.celery_app import celery_app


@celery_app.task(queue="extraction", name="workers.extraction.link_entities")
def link_entities(*args, **kwargs):
    raise RuntimeError(
        "workers.extraction.link_entities is a dead stub. "
        "Entity linking runs via the link_to_graph Temporal activity."
    )


@celery_app.task(queue="extraction", name="workers.extraction.run_form_extraction")
def run_form_extraction(*args, **kwargs):
    raise RuntimeError(
        "workers.extraction.run_form_extraction is a dead stub. "
        "Form extraction is handled by Temporal activities."
    )

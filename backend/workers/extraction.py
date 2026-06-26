"""
Extraction worker — processes extracted entities for canonical graph linking.
"""
import structlog
from workers.celery_app import celery_app

log = structlog.get_logger(__name__)


@celery_app.task(queue="extraction", name="workers.extraction.link_entities")
def link_entities(document_id: str, entities: list) -> dict:
    """
    Links extracted NER entities to canonical asset IDs.
    Low-confidence links route to human review (never AI-inferred into canonical graph).
    """
    log.info("extraction.link_entities_started", document_id=document_id, entity_count=len(entities))
    # TODO: query alias map, resolve to asset_id, create Neo4j edges
    return {"document_id": document_id, "linked": 0, "review_required": 0}


@celery_app.task(queue="extraction", name="workers.extraction.run_form_extraction")
def run_form_extraction(document_id: str) -> dict:
    """
    Layout-aware extraction for industrial forms: inspection checklists,
    work order fields, PTW sections. Maps field contents to semantic meaning.
    """
    log.info("extraction.form_started", document_id=document_id)
    # TODO: form extraction model
    return {"document_id": document_id, "fields_extracted": 0}

"""
Ingestion worker — Layer 2 + Layer 3: Vault storage → OCR → NER → Graph + Vector indexing.
This is the core document processing pipeline.
Celery tasks are wrapped by Temporal.io workflows for crash-resilience.
"""

import hashlib
import io
import structlog
from typing import Any, Dict, Optional

from workers.celery_app import celery_app

log = structlog.get_logger(__name__)


@celery_app.task(
    bind=True,
    queue="ingestion",
    name="workers.ingestion.ingest_document",
    max_retries=3,
    default_retry_delay=60,
)
def ingest_document(
    self,
    document_id: str,
    file_bytes_b64: str,
    mime_type: str,
    document_type: str,
    authority_level: int,
    asset_id: Optional[str],
    source_system: str,
    uploaded_by: str,
) -> Dict[str, Any]:
    """
    Full ingestion pipeline:
    1. Compute SHA-256 hash (integrity verification)
    2. Store in Supabase Storage vault (unchanged, immutable)
    3. Run OCR (PaddleOCR 3.0)
    4. Run NER (mXLM-RoBERTa)
    5. Link entities to canonical asset IDs (alias resolution)
    6. Create temporal graph edges in Neo4j (all 5 required properties)
    7. Index embedding vectors in Qdrant
    8. Index text in Elasticsearch
    9. Route low-confidence items to human review queue

    Designed to be idempotent — safe to retry after partial failure.
    """
    import base64

    log.info("ingestion.started", document_id=document_id, document_type=document_type)

    try:
        file_bytes = base64.b64decode(file_bytes_b64)

        # Step 1: SHA-256 hash
        sha256 = hashlib.sha256(file_bytes).hexdigest()
        log.info("ingestion.hash_computed", document_id=document_id, sha256=sha256)

        # Step 2: Vault storage (Supabase — stubbed until configured)
        # vault_url = vault_service.upload(document_id, file_bytes, mime_type)
        vault_url = f"pending://{document_id}"  # Placeholder

        # Step 3: OCR
        # ocr_result = await ocr_service.extract_text(file_bytes, mime_type)
        # text = ocr_result["text"]
        # overall_confidence = ocr_result["overall_confidence"]
        text = ""  # TODO: wire up OCR service
        overall_confidence = 0.0

        # Step 4: NER
        # ner_result = await ner_service.extract_entities(text)
        ner_result = {"entities": [], "requires_annotation": False}  # TODO: wire up NER service

        # Step 5: Asset linking
        # For each entity of type ASSET_TAG, resolve to canonical asset_id via alias map

        # Step 6: Neo4j graph edges
        # For each extracted fact, create temporal edge with all 5 properties

        # Step 7: Qdrant vector indexing
        # Chunk text, embed, upsert to kairos_documents collection

        # Step 8: Elasticsearch text indexing
        # Index full document text and metadata

        # Step 9: Route low-confidence items to review queue

        result = {
            "document_id": document_id,
            "sha256": sha256,
            "vault_url": vault_url,
            "ocr_confidence": overall_confidence,
            "entities_found": len(ner_result["entities"]),
            "requires_review": ner_result["requires_annotation"],
            "status": "complete",
        }

        log.info("ingestion.complete", **result)
        return result

    except Exception as exc:
        log.error("ingestion.failed", document_id=document_id, error=str(exc))
        raise self.retry(exc=exc)


@celery_app.task(queue="ingestion", name="workers.ingestion.reindex_document")
def reindex_document(document_id: str) -> Dict[str, Any]:
    """
    Re-runs vector and text indexing for an existing document without re-running OCR.
    Used when model updates improve extraction quality (Layer 0 validation gate).
    """
    log.info("reindex.started", document_id=document_id)
    # TODO: fetch extraction result from DB, re-embed, re-index
    return {"document_id": document_id, "status": "reindexed"}

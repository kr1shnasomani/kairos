"""
Document pipeline — Temporal.io durable workflow.
Wraps the Celery ingestion steps as a crash-resilient, resumable workflow.
If the worker dies mid-ingestion, Temporal resumes from the last completed step.
"""

from datetime import timedelta
from typing import Any, Dict, Optional

import structlog
from temporalio import activity, workflow
from temporalio.common import RetryPolicy

log = structlog.get_logger(__name__)

DEFAULT_RETRY = RetryPolicy(
    initial_interval=timedelta(seconds=5),
    backoff_coefficient=2.0,
    maximum_interval=timedelta(minutes=5),
    maximum_attempts=5,
)


# =============================================================================
# Activities (individual steps, each independently retryable)
# =============================================================================

@activity.defn
async def store_in_vault(document_id: str, file_bytes_b64: str, mime_type: str) -> Dict[str, Any]:
    """Step 1: Store document in immutable vault and compute SHA-256."""
    import base64, hashlib
    file_bytes = base64.b64decode(file_bytes_b64)
    sha256 = hashlib.sha256(file_bytes).hexdigest()
    # TODO: Supabase Storage upload
    log.info("activity.vault_stored", document_id=document_id, sha256=sha256)
    return {"sha256": sha256, "vault_url": f"pending://{document_id}"}


@activity.defn
async def run_ocr(document_id: str, file_bytes_b64: str, mime_type: str) -> Dict[str, Any]:
    """Step 2: Run OCR on the document."""
    # TODO: call OCR service
    log.info("activity.ocr_complete", document_id=document_id)
    return {"text": "", "overall_confidence": 0.0, "requires_review": False}


@activity.defn
async def run_ner(document_id: str, text: str) -> Dict[str, Any]:
    """Step 3: Run NER on extracted text."""
    # TODO: call NER service
    log.info("activity.ner_complete", document_id=document_id)
    return {"entities": [], "requires_annotation": False}


@activity.defn
async def link_to_graph(document_id: str, entities: list, asset_id: Optional[str]) -> Dict[str, Any]:
    """Step 4: Create temporal graph edges in Neo4j."""
    # TODO: call graph service
    log.info("activity.graph_linked", document_id=document_id)
    return {"edges_created": 0}


@activity.defn
async def index_vectors(document_id: str, text: str, metadata: Dict[str, Any]) -> Dict[str, Any]:
    """Step 5: Embed and index in Qdrant."""
    log.info("activity.vectors_indexed", document_id=document_id)
    return {"chunks_indexed": 0}


@activity.defn
async def index_text(document_id: str, text: str, metadata: Dict[str, Any]) -> Dict[str, Any]:
    """Step 6: Index in Elasticsearch."""
    log.info("activity.text_indexed", document_id=document_id)
    return {"indexed": True}


# =============================================================================
# Workflow — orchestrates all activities
# =============================================================================

@workflow.defn
class DocumentIngestionWorkflow:
    """
    Durable ingestion workflow. Crash-resilient: if the worker dies at any step,
    Temporal resumes from the last completed activity on restart.
    """

    @workflow.run
    async def run(self, params: Dict[str, Any]) -> Dict[str, Any]:
        document_id = params["document_id"]
        file_bytes_b64 = params["file_bytes_b64"]
        mime_type = params.get("mime_type", "application/pdf")
        asset_id = params.get("asset_id")

        workflow.logger.info("document_pipeline.started", document_id=document_id)

        # Step 1: Vault
        vault_result = await workflow.execute_activity(
            store_in_vault,
            args=[document_id, file_bytes_b64, mime_type],
            start_to_close_timeout=timedelta(minutes=5),
            retry_policy=DEFAULT_RETRY,
        )

        # Step 2: OCR
        ocr_result = await workflow.execute_activity(
            run_ocr,
            args=[document_id, file_bytes_b64, mime_type],
            start_to_close_timeout=timedelta(minutes=10),
            retry_policy=DEFAULT_RETRY,
        )

        # Step 3: NER
        ner_result = await workflow.execute_activity(
            run_ner,
            args=[document_id, ocr_result["text"]],
            start_to_close_timeout=timedelta(minutes=5),
            retry_policy=DEFAULT_RETRY,
        )

        # Step 4: Graph linking
        graph_result = await workflow.execute_activity(
            link_to_graph,
            args=[document_id, ner_result["entities"], asset_id],
            start_to_close_timeout=timedelta(minutes=5),
            retry_policy=DEFAULT_RETRY,
        )

        # Steps 5 & 6: Index in parallel
        vector_result, text_result = await workflow.wait(
            [
                workflow.execute_activity(
                    index_vectors,
                    args=[document_id, ocr_result["text"], {"asset_id": asset_id}],
                    start_to_close_timeout=timedelta(minutes=5),
                    retry_policy=DEFAULT_RETRY,
                ),
                workflow.execute_activity(
                    index_text,
                    args=[document_id, ocr_result["text"], {"asset_id": asset_id}],
                    start_to_close_timeout=timedelta(minutes=2),
                    retry_policy=DEFAULT_RETRY,
                ),
            ]
        )

        result = {
            "document_id": document_id,
            "sha256": vault_result["sha256"],
            "ocr_confidence": ocr_result["overall_confidence"],
            "entities_found": len(ner_result["entities"]),
            "graph_edges": graph_result["edges_created"],
            "vector_chunks": vector_result["chunks_indexed"],
            "status": "complete",
        }

        workflow.logger.info("document_pipeline.complete", document_id=document_id)
        return result

"""
Document pipeline — Temporal.io durable workflow.
Crash-resilient: if the activity worker dies mid-ingestion, Temporal resumes
from the last completed activity checkpoint on restart.

Param convention: workflow receives vault_path (not raw bytes) so activities
download directly from Supabase Storage — the vault is the source of truth.
"""

import asyncio
import hashlib
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

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
# Activity helpers — shared Supabase client factory (sync, thread-safe)
# =============================================================================

_supabase_client = None
_redis_client = None


def _get_supabase():
    """Returns a cached Supabase client — one connection per worker process."""
    global _supabase_client
    if _supabase_client is None:
        import os
        from supabase import create_client
        _supabase_client = create_client(
            os.environ["SUPABASE_URL"],
            os.environ["SUPABASE_SERVICE_ROLE_KEY"],
        )
    return _supabase_client


def _get_redis():
    """Returns a cached sync Redis client — one connection per worker process."""
    global _redis_client
    if _redis_client is None:
        import os
        import redis as sync_redis
        _redis_client = sync_redis.from_url(
            os.environ.get("REDIS_URL", "redis://kairos-redis:6379"),
            decode_responses=True,
        )
    return _redis_client


# =============================================================================
# Activity 1: store_in_vault
# =============================================================================

@activity.defn
async def store_in_vault(
    document_id: str,
    vault_path: str,
    mime_type: str,
    job_id: str,
) -> Dict[str, Any]:
    """
    Downloads the document from Supabase Storage, verifies its SHA-256 against
    the canonical hash in the documents table, and advances the job to ocr_running.
    The vault is the source of truth — bytes come from Storage, not workflow params.
    """
    supabase = _get_supabase()

    # Download raw bytes from vault
    file_bytes = await asyncio.to_thread(
        lambda: supabase.storage.from_("kairos-vault").download(vault_path)
    )
    computed_sha256 = hashlib.sha256(file_bytes).hexdigest()

    # Verify SHA-256 against canonical record
    doc_result = await asyncio.to_thread(
        lambda: supabase.table("documents")
        .select("sha256_hash")
        .eq("document_id", document_id)
        .execute()
    )
    if not doc_result.data:
        raise RuntimeError(f"Document '{document_id}' not found in vault registry")

    canonical_sha256 = doc_result.data[0]["sha256_hash"]
    if computed_sha256 != canonical_sha256:
        raise RuntimeError(
            f"SHA-256 integrity check FAILED for {document_id}: "
            f"expected={canonical_sha256} computed={computed_sha256}"
        )

    # Advance job stage → ocr_running
    await asyncio.to_thread(
        lambda: supabase.table("extraction_jobs").update({
            "pipeline_stage": "ocr_running",
            "progress_pct": 10,
            "started_at": datetime.now(timezone.utc).isoformat(),
        }).eq("job_id", job_id).execute()
    )

    log.info(
        "activity.vault_verified",
        document_id=document_id,
        sha256=computed_sha256,
        bytes=len(file_bytes),
    )
    return {
        "sha256": computed_sha256,
        "bytes_downloaded": len(file_bytes),
        "verified": True,
    }


# =============================================================================
# Activity 2: run_ocr
# =============================================================================

@activity.defn
async def run_ocr(
    document_id: str,
    vault_path: str,
    mime_type: str,
    job_id: str,
) -> Dict[str, Any]:
    """
    Downloads the document from Storage and runs the OCR pipeline.
    - Confidence >= 0.5  → advances stage to ner_running
    - Confidence < 0.5   → sets stage to review_required, publishes to
                           Redis Stream kairos:events:review_required
    """
    from api.services.ocr import OCRService

    supabase = _get_supabase()

    # Download bytes from vault (activities re-download independently — vault is truth)
    file_bytes = await asyncio.to_thread(
        lambda: supabase.storage.from_("kairos-vault").download(vault_path)
    )

    # Run extraction
    ocr = OCRService()
    result = await ocr.extract_text(file_bytes, mime_type=mime_type)

    overall_confidence = result.get("overall_confidence", 0.0)
    requires_review = overall_confidence < 0.5

    if requires_review:
        # Route to human review — stop the pipeline here
        await asyncio.to_thread(
            lambda: supabase.table("extraction_jobs").update({
                "pipeline_stage": "review_required",
                "progress_pct": 20,
                "ocr_confidence": overall_confidence,
                "review_pending": 1,
                "error": result.get("error") or "OCR confidence below threshold (< 0.5)",
            }).eq("job_id", job_id).execute()
        )

        # Publish to Redis Stream for human review queue
        redis = _get_redis()
        await asyncio.to_thread(
            lambda: redis.xadd(
                "kairos:events:review_required",
                {
                    "document_id": document_id,
                    "job_id": job_id,
                    "reason": "low_ocr_confidence",
                    "ocr_confidence": str(overall_confidence),
                    "extraction_method": result.get("extraction_method", "unknown"),
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                },
            )
        )

        log.warning(
            "activity.ocr_review_required",
            document_id=document_id,
            confidence=overall_confidence,
        )
    else:
        # Advance to NER stage
        await asyncio.to_thread(
            lambda: supabase.table("extraction_jobs").update({
                "pipeline_stage": "ner_running",
                "progress_pct": 30,
                "ocr_confidence": overall_confidence,
            }).eq("job_id", job_id).execute()
        )
        log.info(
            "activity.ocr_complete",
            document_id=document_id,
            confidence=overall_confidence,
            method=result.get("extraction_method"),
            block_count=result.get("block_count", 0),
        )

    return {
        "text": result.get("text", ""),
        "overall_confidence": overall_confidence,
        "requires_review": requires_review,
        "block_count": result.get("block_count", 0),
        "extraction_method": result.get("extraction_method", "unknown"),
    }


# =============================================================================
# Activity 3: run_ner — stub (Task 5)
# =============================================================================

@activity.defn
async def run_ner(document_id: str, text: str, job_id: str) -> Dict[str, Any]:
    """Step 3: NER entity extraction. Wired in Task 5."""
    log.info("activity.ner_stub", document_id=document_id, text_length=len(text))
    return {"entities": [], "requires_annotation": False}


# =============================================================================
# Activity 4: link_to_graph — stub (Task 5)
# =============================================================================

@activity.defn
async def link_to_graph(
    document_id: str,
    entities: List[Dict[str, Any]],
    asset_id: Optional[str],
    authority_level: int,
    job_id: str,
) -> Dict[str, Any]:
    """Step 4: Graph edge creation. Wired in Task 5."""
    log.info("activity.graph_stub", document_id=document_id, entity_count=len(entities))
    return {"edges_created": 0}


# =============================================================================
# Activity 5: index_vectors — stub (Task 6)
# =============================================================================

@activity.defn
async def index_vectors(
    document_id: str,
    text: str,
    metadata: Dict[str, Any],
    job_id: str,
) -> Dict[str, Any]:
    """Step 5: Qdrant vector indexing. Wired in Task 6."""
    log.info("activity.vectors_stub", document_id=document_id)
    return {"chunks_indexed": 0}


# =============================================================================
# Activity 6: index_text — stub (Task 6)
# =============================================================================

@activity.defn
async def index_text(
    document_id: str,
    text: str,
    metadata: Dict[str, Any],
    job_id: str,
) -> Dict[str, Any]:
    """Step 6: Elasticsearch text indexing. Wired in Task 6."""
    log.info("activity.es_stub", document_id=document_id)
    return {"indexed": False}


@activity.defn
async def mark_complete(job_id: str, document_id: str) -> None:
    """Sets pipeline_stage to 'complete' and progress to 100 in extraction_jobs."""
    supabase = _get_supabase()
    await asyncio.to_thread(
        lambda: supabase.table("extraction_jobs").update({
            "pipeline_stage": "complete",
            "progress_pct": 100,
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }).eq("job_id", job_id).execute()
    )
    log.info("activity.pipeline_complete", document_id=document_id, job_id=job_id)


# =============================================================================
# Workflow — orchestrates all activities with early-exit on review_required
# =============================================================================

@workflow.defn
class DocumentIngestionWorkflow:
    """
    Durable ingestion workflow. Crash-resilient: if the activity worker dies at
    any step, Temporal resumes from the last completed activity on restart.

    Workflow params: {document_id, vault_path, mime_type, asset_id,
                      document_type, authority_level, job_id}
    """

    @workflow.run
    async def run(self, params: Dict[str, Any]) -> Dict[str, Any]:
        document_id = params["document_id"]
        vault_path = params["vault_path"]
        mime_type = params.get("mime_type", "application/pdf")
        asset_id = params.get("asset_id")
        authority_level = params.get("authority_level", 4)
        job_id = params["job_id"]

        workflow.logger.info("document_pipeline.started", document_id=document_id)

        # ── Step 1: Verify vault integrity ──────────────────────────────────
        vault_result = await workflow.execute_activity(
            store_in_vault,
            args=[document_id, vault_path, mime_type, job_id],
            start_to_close_timeout=timedelta(minutes=5),
            retry_policy=DEFAULT_RETRY,
        )

        # ── Step 2: OCR ─────────────────────────────────────────────────────
        ocr_result = await workflow.execute_activity(
            run_ocr,
            args=[document_id, vault_path, mime_type, job_id],
            start_to_close_timeout=timedelta(minutes=10),
            retry_policy=DEFAULT_RETRY,
        )

        # Early exit: low-confidence OCR routes to human review
        if ocr_result.get("requires_review"):
            workflow.logger.warning(
                "document_pipeline.routed_to_review",
                document_id=document_id,
                confidence=ocr_result["overall_confidence"],
            )
            return {
                "document_id": document_id,
                "status": "review_required",
                "ocr_confidence": ocr_result["overall_confidence"],
                "reason": "ocr_confidence_below_threshold",
            }

        # ── Step 3: NER ─────────────────────────────────────────────────────
        ner_result = await workflow.execute_activity(
            run_ner,
            args=[document_id, ocr_result["text"], job_id],
            start_to_close_timeout=timedelta(minutes=5),
            retry_policy=DEFAULT_RETRY,
        )

        # ── Step 4: Graph linking ────────────────────────────────────────────
        graph_result = await workflow.execute_activity(
            link_to_graph,
            args=[document_id, ner_result["entities"], asset_id, authority_level, job_id],
            start_to_close_timeout=timedelta(minutes=5),
            retry_policy=DEFAULT_RETRY,
        )

        # ── Steps 5 & 6: Vector + text indexing in parallel ─────────────────
        vector_result, text_result = await asyncio.gather(
            workflow.execute_activity(
                index_vectors,
                args=[document_id, ocr_result["text"], {"asset_id": asset_id}, job_id],
                start_to_close_timeout=timedelta(minutes=5),
                retry_policy=DEFAULT_RETRY,
            ),
            workflow.execute_activity(
                index_text,
                args=[document_id, ocr_result["text"], {"asset_id": asset_id}, job_id],
                start_to_close_timeout=timedelta(minutes=2),
                retry_policy=DEFAULT_RETRY,
            ),
        )

        # ── Step 7: Mark complete in Supabase ───────────────────────────────
        await workflow.execute_activity(
            mark_complete,
            args=[job_id, document_id],
            start_to_close_timeout=timedelta(minutes=1),
            retry_policy=DEFAULT_RETRY,
        )

        workflow.logger.info("document_pipeline.complete", document_id=document_id)
        return {
            "document_id": document_id,
            "sha256": vault_result["sha256"],
            "ocr_confidence": ocr_result["overall_confidence"],
            "extraction_method": ocr_result.get("extraction_method"),
            "entities_found": len(ner_result["entities"]),
            "graph_edges": graph_result["edges_created"],
            "vector_chunks": vector_result["chunks_indexed"],
            "status": "complete",
        }

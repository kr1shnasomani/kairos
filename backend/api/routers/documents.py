"""
Documents router — Layer 2: Immutable Evidence Vault + Layer 3: Perception Engine.
Handles document ingestion into the vault, triggers the extraction pipeline,
and surfaces extraction status and results.
"""

import asyncio
import hashlib
import time
from datetime import datetime, timezone
from typing import Optional

import shortuuid
import structlog
from fastapi import APIRouter, Body, File, Form, HTTPException, UploadFile, status

from api.config import settings
from api.dependencies import CurrentUserDep, Neo4jDep, SupabaseDep, TemporalDep
from api.models.document import DocumentStatus, ExtractionResult, VaultDocument
from api.services.graph import GraphService
from api.services.metrics import ingestion_duration
from workflows.document_pipeline import DocumentIngestionWorkflow

log = structlog.get_logger(__name__)
router = APIRouter()


@router.post("/ingest", summary="Ingest a document into the immutable vault", status_code=status.HTTP_202_ACCEPTED)
async def ingest_document(
    current_user: CurrentUserDep,
    supabase: SupabaseDep,
    temporal: TemporalDep,
    file: UploadFile = File(...),
    asset_id: Optional[str] = Form(None, description="Canonical asset ID to link this document to"),
    document_type: str = Form(..., description="oem_manual, procedure, inspection_report, ptw, shift_log, regulation"),
    source_system: str = Form("manual_upload"),
    authority_level: int = Form(4, ge=1, le=5, description="1=Regulatory 2=Engineering 3=OEM 4=Procedure 5=Field"),
) -> dict:
    """
    Ingests a document into the immutable vault (Supabase Storage).

    - Computes SHA-256 before anything touches the file.
    - Duplicate SHA-256 is idempotent: returns the existing document_id immediately.
    - Stores the original artifact byte-for-byte unchanged — no preprocessing before storage.
    - Inserts rows in `documents` and `extraction_jobs`, links to asset if provided.
    - Triggers the durable `DocumentIngestionWorkflow` via Temporal.

    Returns immediately with document_id + job_id. Poll /documents/{document_id}/status.
    """
    _ingest_start = time.monotonic()
    file_bytes = await file.read()
    sha256 = hashlib.sha256(file_bytes).hexdigest()

    # Idempotency: same file ingested twice returns the existing record
    existing = await asyncio.to_thread(
        lambda: supabase.table("documents")
        .select("document_id, sha256_hash, status")
        .eq("sha256_hash", sha256)
        .execute()
    )
    if existing.data:
        existing_doc = existing.data[0]
        log.info("ingest.duplicate", sha256=sha256, document_id=existing_doc["document_id"])
        return {
            "status": "duplicate",
            "document_id": existing_doc["document_id"],
            "sha256": sha256,
            "message": "Identical file already exists in the vault.",
        }

    document_id = f"DOC-{shortuuid.uuid()[:12].upper()}"
    storage_path = f"{document_type}/{document_id}/{file.filename}"
    mime_type = file.content_type or "application/octet-stream"
    now = datetime.now(timezone.utc).isoformat()

    # Upload raw bytes — no transformation, no preprocessing (Layer 2 immutability)
    try:
        await asyncio.to_thread(
            lambda: supabase.storage.from_(settings.SUPABASE_STORAGE_BUCKET).upload(
                storage_path,
                file_bytes,
                {"content-type": mime_type},
            )
        )
    except Exception as exc:
        log.error("ingest.storage_upload_failed", document_id=document_id, error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Vault storage upload failed: {exc}",
        )

    # Stable authenticated URL — Supabase Storage pattern for private buckets
    vault_url = (
        f"{settings.SUPABASE_URL}/storage/v1/object/authenticated"
        f"/{settings.SUPABASE_STORAGE_BUCKET}/{storage_path}"
    )

    # Insert canonical vault record + job atomically-ish; clean up blob if DB fails
    try:
        await asyncio.to_thread(
            lambda: supabase.table("documents").insert({
                "document_id": document_id,
                "sha256_hash": sha256,
                "file_name": file.filename,
                "file_size_bytes": len(file_bytes),
                "mime_type": mime_type,
                "document_type": document_type,
                "authority_level": authority_level,
                "source_system": source_system,
                "vault_url": vault_url,
                "status": "active",
                "ingested_at": now,
                "ingested_by": current_user.get("user_id", "unknown"),
            }).execute()
        )

        job_result = await asyncio.to_thread(
            lambda: supabase.table("extraction_jobs").insert({
                "document_id": document_id,
                "pipeline_stage": "queued",
                "progress_pct": 0,
                "created_at": now,
            }).execute()
        )
    except Exception as exc:
        # Blob is in Storage but DB failed — remove the orphaned blob
        log.error("ingest.db_insert_failed", document_id=document_id, error=str(exc))
        try:
            await asyncio.to_thread(
                lambda: supabase.storage.from_(settings.SUPABASE_STORAGE_BUCKET).remove([storage_path])
            )
        except Exception as cleanup_exc:
            log.error("ingest.orphan_cleanup_failed", storage_path=storage_path, error=str(cleanup_exc))
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Vault DB registration failed: {exc}")

    job_id = job_result.data[0]["job_id"]

    # Link to canonical asset if provided
    if asset_id:
        await asyncio.to_thread(
            lambda: supabase.table("document_asset_links").insert({
                "document_id": document_id,
                "asset_id": asset_id,
                "linked_at": now,
            }).execute()
        )

    # Audit trail (fire-and-forget on failure — document is already committed)
    try:
        await asyncio.to_thread(
            lambda: supabase.table("audit_log").insert({
                "action": "document_ingested",
                "entity_type": "document",
                "entity_id": document_id,
                "performed_by": current_user.get("user_id", "unknown"),
                "details": {
                    "sha256": sha256,
                    "document_type": document_type,
                    "authority_level": authority_level,
                    "file_name": file.filename,
                    "asset_id": asset_id,
                    "source_system": source_system,
                },
            }).execute()
        )
    except Exception as exc:
        log.warning("ingest.audit_log_failed", document_id=document_id, error=str(exc))

    # Trigger durable extraction workflow via Temporal
    # Pass vault_path (not file bytes) — activities download from Storage directly
    try:
        await temporal.start_workflow(
            DocumentIngestionWorkflow.run,
            args=[{
                "document_id": document_id,
                "vault_path": storage_path,
                "mime_type": mime_type,
                "asset_id": asset_id,
                "document_type": document_type,
                "authority_level": authority_level,
                "job_id": str(job_id),
            }],
            id=f"ingest-{document_id}",
            task_queue=settings.TEMPORAL_TASK_QUEUE,
        )
        workflow_status = "triggered"
    except Exception as exc:
        # Temporal down: vault record and DB row are committed; workflow can be re-triggered
        log.warning("ingest.temporal_unavailable", document_id=document_id, error=str(exc))
        workflow_status = "workflow_pending"

    ingestion_duration.record(time.monotonic() - _ingest_start, {"document_type": document_type})
    log.info(
        "ingest.complete",
        document_id=document_id,
        sha256=sha256,
        job_id=str(job_id),
        workflow=workflow_status,
    )
    return {
        "status": "accepted",
        "document_id": document_id,
        "job_id": str(job_id),
        "sha256": sha256,
        "vault_path": storage_path,
        "workflow": workflow_status,
        "message": f"Document queued for extraction. Poll /documents/{document_id}/status for progress.",
    }


@router.get("/", summary="List vault documents")
async def list_documents(
    current_user: CurrentUserDep,
    supabase: SupabaseDep,
    asset_id: Optional[str] = None,
    document_type: Optional[str] = None,
    doc_status: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> dict:
    """Lists documents in the vault with optional filtering by asset, type, or status."""
    query = supabase.table("documents").select("*", count="exact")

    if document_type:
        query = query.eq("document_type", document_type)
    if doc_status:
        query = query.eq("status", doc_status)

    if asset_id:
        # Get document IDs linked to this asset first
        link_result = await asyncio.to_thread(
            lambda: supabase.table("document_asset_links")
            .select("document_id")
            .eq("asset_id", asset_id)
            .execute()
        )
        linked_ids = [r["document_id"] for r in (link_result.data or [])]
        if not linked_ids:
            return {"documents": [], "total": 0, "limit": limit, "offset": offset}
        query = query.in_("document_id", linked_ids)

    result = await asyncio.to_thread(
        lambda: query.order("ingested_at", desc=True).range(offset, offset + limit - 1).execute()
    )
    return {
        "documents": result.data or [],
        "total": result.count or 0,
        "limit": limit,
        "offset": offset,
    }


@router.get("/{document_id}/status", summary="Poll extraction pipeline status")
async def get_extraction_status(
    document_id: str,
    current_user: CurrentUserDep,
    supabase: SupabaseDep,
) -> DocumentStatus:
    """Returns the current status of the OCR → NER → graph extraction pipeline for a document."""
    result = await asyncio.to_thread(
        lambda: supabase.table("extraction_jobs")
        .select("*")
        .eq("document_id", document_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No extraction job found for document '{document_id}'",
        )
    row = result.data[0]
    return DocumentStatus(
        document_id=document_id,
        pipeline_stage=row["pipeline_stage"],
        progress_percent=row["progress_pct"],
        ocr_confidence=row.get("ocr_confidence"),
        ner_entity_count=row.get("entity_count"),
        graph_edges_created=row.get("graph_edges"),
        review_items_pending=row.get("review_pending", 0),
        error=row.get("error"),
        updated_at=datetime.fromisoformat(row["created_at"]) if row.get("created_at") else datetime.now(timezone.utc),
    )


@router.get("/{document_id}/extraction", summary="Get extraction results (entities, facts)")
async def get_extraction_results(
    document_id: str,
    current_user: CurrentUserDep,
    supabase: SupabaseDep,
) -> ExtractionResult:
    """
    Returns structured extraction results: extracted entities, confidence scores,
    graph edges created, and items routed to human review.
    """
    doc_result = await asyncio.to_thread(
        lambda: supabase.table("documents").select("document_id").eq("document_id", document_id).execute()
    )
    if not doc_result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Document '{document_id}' not found")

    # quarantine_items are linked by asset_id, not document_id — populated in Task 5
    # when link_to_graph routes low-confidence entities to quarantine with session_context

    job_result = await asyncio.to_thread(
        lambda: supabase.table("extraction_jobs")
        .select("entity_count, graph_edges")
        .eq("document_id", document_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    job = job_result.data[0] if job_result.data else {}

    return ExtractionResult(
        document_id=document_id,
        extraction_model="mXLM-RoBERTa + PaddleOCR3",
        entities=[],
        graph_edges_created=job.get("graph_edges") or 0,
        vector_chunks_indexed=0,
        review_items=[],  # populated by link_to_graph activity in Task 5
    )


@router.get("/{document_id}", summary="Get vault document metadata")
async def get_document(
    document_id: str,
    current_user: CurrentUserDep,
    supabase: SupabaseDep,
) -> VaultDocument:
    """Returns the vault metadata for a document including SHA-256 hash, version chain, and status."""
    result = await asyncio.to_thread(
        lambda: supabase.table("documents").select("*").eq("document_id", document_id).execute()
    )
    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document '{document_id}' not found in vault",
        )
    doc = result.data[0]

    links_result = await asyncio.to_thread(
        lambda: supabase.table("document_asset_links")
        .select("asset_id")
        .eq("document_id", document_id)
        .execute()
    )
    asset_links = [r["asset_id"] for r in (links_result.data or [])]

    return VaultDocument(
        document_id=doc["document_id"],
        sha256_hash=doc["sha256_hash"],
        file_name=doc["file_name"],
        file_size_bytes=doc["file_size_bytes"],
        mime_type=doc["mime_type"],
        document_type=doc["document_type"],
        authority_level=doc["authority_level"],
        source_system=doc["source_system"],
        vault_url=doc.get("vault_url"),
        ingested_at=datetime.fromisoformat(doc["ingested_at"]),
        ingested_by=doc["ingested_by"],
        status=doc["status"],
        version_chain=doc.get("version_chain"),
        asset_links=asset_links,
        access_tags=[],
    )


@router.post("/{document_id}/supersede", summary="Mark a document as superseded by a newer version")
async def supersede_document(
    document_id: str,
    current_user: CurrentUserDep,
    supabase: SupabaseDep,
    driver: Neo4jDep,
    new_document_id: str = Body(..., embed=True, description="document_id of the replacement document"),
) -> dict:
    """
    Closes the validity window on the old document and links it to the new version.
    The old artifact is NEVER deleted — immutability is non-negotiable.

    Side effects:
    - All Neo4j edges referencing this document have their valid_to window closed.
    - Blast-radius analysis is computed and returned.
    - If any affected edge carried authority_level <= 3 (OEM/Engineering/Regulatory),
      a MoC draft is created in moc_items for engineering review.
    """
    # Verify both documents exist
    old_result = await asyncio.to_thread(
        lambda: supabase.table("documents")
        .select("document_id, status, authority_level")
        .eq("document_id", document_id)
        .execute()
    )
    if not old_result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Document '{document_id}' not found")
    if old_result.data[0]["status"] == "superseded":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Document '{document_id}' is already superseded.",
        )

    new_result = await asyncio.to_thread(
        lambda: supabase.table("documents")
        .select("document_id, status")
        .eq("document_id", new_document_id)
        .execute()
    )
    if not new_result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Replacement document '{new_document_id}' not found in vault. Ingest it first.",
        )

    now = datetime.now(timezone.utc)

    # Mark old document superseded in Supabase; link to new version via version_chain
    await asyncio.to_thread(
        lambda: supabase.table("documents").update({
            "status": "superseded",
        }).eq("document_id", document_id).execute()
    )
    await asyncio.to_thread(
        lambda: supabase.table("documents").update({
            "version_chain": document_id,
        }).eq("document_id", new_document_id).execute()
    )

    # Close all active Neo4j knowledge edges that reference the old document
    graph = GraphService(driver)
    closed_count = await graph.close_validity_windows_for_document(document_id, now)

    # Blast-radius analysis
    blast = await graph.get_blast_radius(document_id)

    # MoC required if any affected edge had authority_level <= 3 (OEM/Engineering/Regulatory)
    moc_required = any(
        edge.get("edge", {}).get("authority_level", 5) <= 3
        for edge in blast.get("affected", [])
    )
    moc_id = None
    if moc_required:
        moc_id = f"MOC-{shortuuid.uuid()[:8].upper()}"
        await asyncio.to_thread(
            lambda: supabase.table("moc_items").insert({
                "moc_id": moc_id,
                "asset_id": None,
                "description": (
                    f"Document '{document_id}' superseded by '{new_document_id}'. "
                    f"{closed_count} graph edges closed. "
                    f"{blast['affected_count']} downstream facts require review."
                ),
                "conflicting_sources": [{"old": document_id, "new": new_document_id}],
                "blast_radius": blast.get("affected", [])[:50],  # cap payload size
                "status": "draft",
            }).execute()
        )

    # Audit trail
    await asyncio.to_thread(
        lambda: supabase.table("audit_log").insert({
            "action": "document_superseded",
            "entity_type": "document",
            "entity_id": document_id,
            "performed_by": current_user.get("user_id", "unknown"),
            "details": {
                "new_document_id": new_document_id,
                "edges_closed": closed_count,
                "blast_radius_count": blast["affected_count"],
                "moc_created": moc_id,
            },
        }).execute()
    )

    log.info(
        "document.superseded",
        old=document_id,
        new=new_document_id,
        edges_closed=closed_count,
        blast_radius=blast["affected_count"],
        moc_id=moc_id,
    )
    return {
        "status": "superseded",
        "old_document_id": document_id,
        "new_document_id": new_document_id,
        "edges_closed": closed_count,
        "blast_radius": blast,
        "moc_required": moc_required,
        "moc_id": moc_id,
    }

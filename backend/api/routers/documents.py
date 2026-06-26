"""
Documents router — Layer 2: Immutable Evidence Vault + Layer 3: Perception Engine.
Handles document ingestion into the vault, triggers the extraction pipeline,
and surfaces extraction status and results.
"""

from typing import Optional

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile, status

from api.dependencies import CurrentUserDep
from api.models.document import DocumentStatus, ExtractionResult, VaultDocument

router = APIRouter()


@router.post("/ingest", summary="Ingest a document into the immutable vault", status_code=status.HTTP_202_ACCEPTED)
async def ingest_document(
    current_user: CurrentUserDep,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    asset_id: Optional[str] = Form(None, description="Canonical asset ID to link this document to"),
    document_type: str = Form(..., description="E.g. oem_manual, procedure, inspection_report, ptw, shift_log"),
    source_system: str = Form("manual_upload"),
    authority_level: int = Form(4, ge=1, le=5, description="1=Regulatory, 2=Engineering std, 3=OEM, 4=Procedure, 5=Field"),
) -> dict:
    """
    Ingests a document into the immutable vault (Supabase Storage).
    - Computes SHA-256 hash for integrity verification.
    - Stores original artifact unchanged (no preprocessing before storage).
    - Triggers the perception pipeline (OCR → NER → graph + vectors) asynchronously.

    Returns immediately with a job_id to track extraction progress.
    """
    # TODO: stream to Supabase Storage, compute hash, enqueue Celery task
    # from workers.ingestion import ingest_document_task
    # background_tasks.add_task(ingest_document_task.delay, ...)
    return {
        "status": "accepted",
        "job_id": "PENDING",
        "message": "Document queued for ingestion. Poll /documents/{job_id}/status for progress.",
    }


@router.get("/{document_id}", summary="Get vault document metadata")
async def get_document(
    document_id: str,
    current_user: CurrentUserDep,
) -> VaultDocument:
    """Returns the vault metadata for a document including SHA-256 hash, version chain, and status."""
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Document '{document_id}' not found")


@router.get("/{document_id}/status", summary="Poll extraction pipeline status")
async def get_extraction_status(
    document_id: str,
    current_user: CurrentUserDep,
) -> DocumentStatus:
    """Returns the current status of the OCR → NER → graph extraction pipeline for a document."""
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Document '{document_id}' not found")


@router.get("/{document_id}/extraction", summary="Get extraction results (entities, facts)")
async def get_extraction_results(
    document_id: str,
    current_user: CurrentUserDep,
) -> ExtractionResult:
    """
    Returns structured extraction results: extracted entities, confidence scores,
    graph edges created, and any items routed to human review.
    """
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Document '{document_id}' not found")


@router.get("/", summary="List vault documents")
async def list_documents(
    current_user: CurrentUserDep,
    asset_id: Optional[str] = None,
    document_type: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> dict:
    """Lists documents in the vault with optional filtering by asset, type, or status."""
    return {"documents": [], "total": 0, "limit": limit, "offset": offset}


@router.post("/{document_id}/supersede", summary="Mark a document as superseded by a newer version")
async def supersede_document(
    document_id: str,
    new_document_id: str,
    current_user: CurrentUserDep,
) -> dict:
    """
    Closes the validity window on the old document and links it to the new version.
    The old artifact is NEVER deleted — immutability is non-negotiable.
    Triggers blast-radius analysis on all downstream graph facts.
    """
    # TODO: update Neo4j validity windows and trigger blast-radius traversal
    return {"status": "superseded", "old": document_id, "new": new_document_id}

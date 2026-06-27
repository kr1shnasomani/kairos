"""
Pydantic models — Document (Layer 2: Immutable Vault, Layer 3: Extraction)
"""

from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class VaultDocument(BaseModel):
    document_id: str
    sha256_hash: str
    file_name: str
    file_size_bytes: int
    mime_type: str
    document_type: str
    authority_level: int = Field(..., ge=1, le=5)
    source_system: str
    vault_url: Optional[str] = Field(None, description="Authenticated Supabase Storage URL for direct retrieval")
    ingested_at: datetime
    ingested_by: str
    status: str = Field(..., description="active, superseded, archived, disputed")
    version_chain: Optional[str] = Field(None, description="document_id this supersedes (new version → old version pointer)")
    asset_links: List[str] = Field(default_factory=list, description="Linked canonical asset IDs")
    access_tags: List[str] = Field(default_factory=list)


class DocumentStatus(BaseModel):
    document_id: str
    pipeline_stage: str = Field(
        ...,
        description="queued, ocr_running, ner_running, graph_linking, vector_indexing, review_required, complete, failed"
    )
    progress_percent: int = Field(..., ge=0, le=100)
    ocr_confidence: Optional[float] = None
    ner_entity_count: Optional[int] = None
    graph_edges_created: Optional[int] = None
    review_items_pending: int = 0
    error: Optional[str] = None
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class ExtractedEntity(BaseModel):
    entity_type: str = Field(..., description="asset_tag, process_parameter, material, person, date, regulation, failure_mode")
    value: str
    normalized_value: Optional[str] = None
    confidence: float = Field(..., ge=0.0, le=1.0)
    span_start: Optional[int] = None
    span_end: Optional[int] = None
    linked_asset_id: Optional[str] = None
    requires_review: bool = False


class ExtractionResult(BaseModel):
    document_id: str
    extraction_model: str
    entities: List[ExtractedEntity] = Field(default_factory=list)
    graph_edges_created: int = 0
    vector_chunks_indexed: int = 0
    review_items: List[Dict[str, Any]] = Field(default_factory=list)
    extracted_at: datetime = Field(default_factory=datetime.utcnow)


class SearchResult(BaseModel):
    document_id: str
    asset_id: Optional[str] = None
    document_type: str
    title: str
    snippet: str
    authority_level: int
    status: str
    relevance_score: float
    retrieval_method: str = Field(..., description="exact, semantic, graph")
    is_quarantine: bool = False
    vault_url: Optional[str] = None


class ConflictItem(BaseModel):
    conflict_id: str
    track: str = Field(..., description="administrative, engineering")
    asset_id: Optional[str] = None
    parameter: str
    source_a: Dict[str, Any]
    source_b: Dict[str, Any]
    authority_a: int
    authority_b: int
    severity: str
    status: str = Field(..., description="open, pending_moc, resolved")
    sla_deadline: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class QuarantineItem(BaseModel):
    item_id: str
    asset_id: Optional[str] = None
    content: str
    input_type: str = Field(..., description="field_observation, voice_note, elicitation_response, deviation_flag")
    submitted_by: str
    submitted_at: datetime
    reviewer_id: Optional[str] = None
    review_status: str = Field(default="pending", description="pending, promoted, disputed, archived")
    linked_work_order_id: Optional[str] = None

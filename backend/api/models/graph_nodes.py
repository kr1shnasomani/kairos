"""
Pydantic models — Temporal Graph Nodes (Layer 4)
Mirrors the Neo4j node/edge structure for API serialization.
"""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class TemporalEdge(BaseModel):
    """
    Every edge in the temporal reality graph carries all five properties.
    See ARCHITECTURE.md Layer 4 for the full specification.
    """
    edge_id: str
    relationship_type: str
    source_node_id: str
    target_node_id: str

    # Temporal validity window
    valid_from: datetime
    valid_to: datetime | None = None  # None = currently valid

    # Authority hierarchy (1=Regulatory ... 5=Field observation)
    authority_level: int = Field(..., ge=1, le=5)

    # Provenance
    document_id: str = Field(..., description="Pointer to artifact in immutable vault")
    extraction_event_id: str

    # Confidence
    confidence: float = Field(..., ge=0.0, le=1.0)

    # Verification status
    verification_status: str = Field(
        ...,
        description="unverified, verified, disputed, superseded, quarantined"
    )
    verified_by: str | None = None
    verified_at: datetime | None = None


class GraphNode(BaseModel):
    node_id: str
    node_type: str = Field(
        ...,
        description="Asset, Event, Document, Concept, Person, Organisation"
    )
    properties: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class KnowledgeGraphSnapshot(BaseModel):
    """A subgraph snapshot for API responses (e.g., asset context view)."""
    nodes: list[GraphNode] = Field(default_factory=list)
    edges: list[TemporalEdge] = Field(default_factory=list)
    as_of: datetime | None = None  # Point-in-time for time-travel queries
    total_nodes: int = 0
    total_edges: int = 0

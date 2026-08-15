"""
Pydantic models — Asset (Layer 1: MDM Backbone)
"""

from datetime import UTC, datetime
from typing import Optional

from pydantic import BaseModel, Field


class Asset(BaseModel):
    asset_id: str = Field(..., description="Canonical asset ID from EAM/ERP golden record")
    tag_number: str
    name: str
    equipment_class: str
    criticality: str = Field(..., description="safety_critical, critical, non_critical")
    site_id: str
    facility_id: str
    parent_asset_id: str | None = None
    status: str = Field(default="active", description="active, decommissioned, under_review")
    eam_source: str = Field(..., description="SAP_PM, Maximo, Infor_EAM, manual")
    identity_confirmed_by: str | None = None
    identity_confirmed_at: datetime | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class AssetCreate(BaseModel):
    asset_id: str | None = Field(None, description="Canonical ID from EAM — auto-generated if not provided")
    tag_number: str
    name: str
    equipment_class: str
    criticality: str = Field(..., pattern="^(safety_critical|critical|non_critical)$")
    site_id: str
    facility_id: str
    parent_asset_id: str | None = None
    eam_source: str = "manual"
    confirmed_by_user_id: str = Field(..., min_length=1, description="Human authority confirming this identity — required, no AI-inferred identities")


class TagAliasMap(BaseModel):
    canonical_asset_id: str
    alias: str
    alias_source: str = Field(..., description="Source document or system where this alias was found")
    confirmed: bool = False
    confidence: float = Field(..., ge=0.0, le=1.0)


class AssetHierarchy(BaseModel):
    asset_id: str
    tag_number: str
    name: str
    level: int
    parent: Optional["AssetHierarchy"] = None
    children: list["AssetHierarchy"] = Field(default_factory=list)

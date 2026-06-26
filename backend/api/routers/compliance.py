"""
Compliance router — Regulatory compliance gap detection and audit preparation.
Maps facility regulatory framework against current procedures, equipment states,
and inspection records.
"""

from typing import Optional

from fastapi import APIRouter, Query

from api.dependencies import CurrentUserDep, Neo4jDep

router = APIRouter()


@router.get("/gaps", summary="List detected compliance gaps")
async def list_compliance_gaps(
    current_user: CurrentUserDep,
    driver: Neo4jDep,
    framework: Optional[str] = Query(None, description="Regulatory framework: OISD, PESO, FDA_21CFR, CEA, ISO_45001"),
    asset_id: Optional[str] = Query(None),
    severity: Optional[str] = Query(None, description="critical, major, minor"),
    limit: int = Query(50, le=200),
) -> dict:
    """
    Detects gaps between applicable regulatory requirements and current documented procedures/states.
    Designed with high-recall: errs toward flagging rather than clearing (false-negative control).
    All compliance clearances for safety-critical requirements require mandatory human review.
    """
    # TODO: implement regulatory requirement → procedure/equipment-state comparison
    return {"gaps": [], "total": 0, "framework": framework, "last_scan": None}


@router.get("/dashboard", summary="Compliance posture dashboard")
async def compliance_dashboard(
    current_user: CurrentUserDep,
    driver: Neo4jDep,
    site_id: Optional[str] = Query(None),
) -> dict:
    """
    Continuous compliance gap dashboard: total gaps by severity, by regulatory clause,
    by asset class. Designed for Quality Managers and Compliance Officers.
    """
    return {
        "site_id": site_id,
        "total_gaps": {"critical": 0, "major": 0, "minor": 0},
        "by_framework": {},
        "by_asset_class": {},
        "last_updated": None,
    }


@router.get("/audit-pack", summary="Generate audit evidence package")
async def generate_audit_pack(
    current_user: CurrentUserDep,
    driver: Neo4jDep,
    framework: str = Query(..., description="Target regulatory framework"),
    clauses: Optional[list[str]] = Query(None, description="Specific clause IDs to include"),
) -> dict:
    """
    Pre-populates audit evidence package organized by regulatory clause.
    Links each clause to supporting documents in the immutable vault.
    Positions as audit-preparation acceleration — human sign-off is still required.
    All clearances below confidence threshold are blocked for human review.
    """
    # TODO: graph traversal → gather evidence per regulatory clause → assemble package
    return {
        "framework": framework,
        "clauses": [],
        "total_clauses": 0,
        "total_evidence_docs": 0,
        "human_review_required": [],
        "status": "draft",
    }


@router.get("/frameworks", summary="List configured regulatory frameworks")
async def list_frameworks(current_user: CurrentUserDep) -> dict:
    """
    Returns the regulatory frameworks configured for this deployment.
    Frameworks are sector-configurable: OISD/PESO (oil & gas), FDA 21 CFR (pharma),
    CEA/IEC (power), ISO 45001 (safety across all sectors), etc.
    """
    return {
        "configured_frameworks": [],
        "available_frameworks": [
            "OISD", "PESO", "FDA_21CFR_PART11", "CEA", "IEC_62443",
            "ISO_45001", "ISO_22000", "FSSAI", "SCHEDULE_M"
        ]
    }

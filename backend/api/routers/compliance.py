"""
Compliance router — Regulatory compliance gap detection and audit preparation.
Maps facility regulatory framework against current procedures, equipment states,
and inspection records. High-recall by design: errs toward flagging over clearing.
"""

from typing import Optional

from fastapi import APIRouter, Query

from api.dependencies import CurrentUserDep, Neo4jDep
from api.services.graph import GraphService

router = APIRouter()

_SEVERITY = {1: "critical", 2: "major"}


def _severity(authority_level: int) -> str:
    return _SEVERITY.get(authority_level, "minor")


# Gap detection Cypher — run for each (Regulation × Asset) pair where no verified procedure exists.
# High-recall: returns a gap unless a verified, active procedure edge explicitly covers the asset.
# ponytail: `applies_to_equipment_class IS NULL` means regulation applies to all equipment classes.
_GAP_CYPHER = """
MATCH (reg:Concept {type: 'Regulation'})
WHERE ($framework IS NULL OR reg.framework = $framework)
MATCH (a:Asset)
WHERE (reg.applies_to_equipment_class IS NULL
    OR a.equipment_class = reg.applies_to_equipment_class
    OR a.equipment_class CONTAINS reg.applies_to_equipment_class
    OR reg.applies_to_equipment_class CONTAINS a.equipment_class)
  AND ($asset_id IS NULL OR a.asset_id = $asset_id)
  AND ($site_id IS NULL OR a.site_id = $site_id)
WITH reg, a
WHERE NOT EXISTS {
  MATCH (a)-[r:KNOWLEDGE_EDGE]->(d:Document)
  WHERE r.verification_status = 'verified'
    AND r.valid_to IS NULL
    AND d.document_type = 'procedure'
}
RETURN reg.concept_id AS concept_id,
       reg.framework AS framework,
       reg.clause_id AS clause_id,
       reg.requirement_text AS requirement_text,
       reg.applies_to_equipment_class AS applies_to,
       reg.authority_level AS authority_level,
       a.asset_id AS asset_id,
       a.tag_number AS tag_number,
       a.equipment_class AS equipment_class,
       a.site_id AS site_id
ORDER BY reg.authority_level ASC, a.asset_id ASC
LIMIT $limit
"""

_DASHBOARD_CYPHER = """
MATCH (reg:Concept {type: 'Regulation'})
MATCH (a:Asset)
WHERE (reg.applies_to_equipment_class IS NULL
    OR a.equipment_class = reg.applies_to_equipment_class
    OR a.equipment_class CONTAINS reg.applies_to_equipment_class
    OR reg.applies_to_equipment_class CONTAINS a.equipment_class)
  AND ($site_id IS NULL OR a.site_id = $site_id)
WITH reg, a
WHERE NOT EXISTS {
  MATCH (a)-[r:KNOWLEDGE_EDGE]->(d:Document)
  WHERE r.verification_status = 'verified'
    AND r.valid_to IS NULL
    AND d.document_type = 'procedure'
}
RETURN reg.authority_level AS authority_level,
       reg.framework AS framework,
       reg.applies_to_equipment_class AS equipment_class,
       count(*) AS gap_count
ORDER BY reg.authority_level ASC
"""

_AUDIT_CYPHER = """
MATCH (reg:Concept {type: 'Regulation', framework: $framework})
WHERE ($clauses IS NULL OR reg.clause_id IN $clauses)
OPTIONAL MATCH (a:Asset)
WHERE reg.applies_to_equipment_class IS NULL
    OR a.equipment_class = reg.applies_to_equipment_class
    OR a.equipment_class CONTAINS reg.applies_to_equipment_class
    OR reg.applies_to_equipment_class CONTAINS a.equipment_class
OPTIONAL MATCH (a)-[r:KNOWLEDGE_EDGE]->(d:Document)
WHERE r.valid_to IS NULL
  AND (d.document_type IS NULL OR d.document_type IN ['procedure', 'inspection_report', 'oem_manual', 'regulation'])
WITH reg, collect(DISTINCT CASE WHEN d IS NOT NULL THEN {
    document_id: d.document_id,
    document_type: d.document_type,
    confidence: r.confidence,
    verification_status: r.verification_status
} END) AS raw_evidence
RETURN reg.clause_id AS clause_id,
       reg.requirement_text AS requirement_text,
       reg.applies_to_equipment_class AS applies_to,
       reg.authority_level AS authority_level,
       [e IN raw_evidence WHERE e IS NOT NULL] AS evidence
ORDER BY reg.clause_id ASC
"""


@router.get("/gaps", summary="List detected compliance gaps")
async def list_compliance_gaps(
    current_user: CurrentUserDep,
    driver: Neo4jDep,
    framework: Optional[str] = Query(None, description="Regulatory framework: OISD_117, ISO_45001, etc."),
    asset_id: Optional[str] = Query(None),
    site_id: Optional[str] = Query(None),
    severity: Optional[str] = Query(None, description="critical, major, minor"),
    limit: int = Query(100, le=500),
) -> dict:
    """
    Detects gaps: Regulation nodes with no verified procedure edge on applicable assets.
    High-recall: errs toward flagging. False-negative control — never auto-clears safety-critical.
    """
    async with driver.session(database="neo4j") as session:
        result = await session.run(
            _GAP_CYPHER,
            framework=framework,
            asset_id=asset_id,
            site_id=site_id,
            limit=limit,
        )
        rows = [dict(r) async for r in result]

    gaps = [
        {**r, "severity": _severity(r["authority_level"])}
        for r in rows
        if severity is None or _severity(r["authority_level"]) == severity
    ]

    return {"gaps": gaps, "total": len(gaps), "framework": framework, "last_scan": "realtime"}


@router.get("/dashboard", summary="Compliance posture dashboard")
async def compliance_dashboard(
    current_user: CurrentUserDep,
    driver: Neo4jDep,
    site_id: Optional[str] = Query(None),
) -> dict:
    """
    Aggregated compliance gap counts by severity, framework, and equipment class.
    Designed for Quality Managers and Compliance Officers.
    """
    async with driver.session(database="neo4j") as session:
        result = await session.run(_DASHBOARD_CYPHER, site_id=site_id)
        rows = [dict(r) async for r in result]

    totals = {"critical": 0, "major": 0, "minor": 0}
    by_framework: dict = {}
    by_asset_class: dict = {}

    for r in rows:
        sev = _severity(r["authority_level"])
        count = r["gap_count"]
        totals[sev] = totals.get(sev, 0) + count

        fw = r["framework"] or "unknown"
        by_framework.setdefault(fw, {"critical": 0, "major": 0, "minor": 0})
        by_framework[fw][sev] = by_framework[fw].get(sev, 0) + count

        cls = r["equipment_class"] or "all"
        by_asset_class.setdefault(cls, {"critical": 0, "major": 0, "minor": 0})
        by_asset_class[cls][sev] = by_asset_class[cls].get(sev, 0) + count

    return {
        "site_id": site_id,
        "total_gaps": totals,
        "by_framework": by_framework,
        "by_asset_class": by_asset_class,
        "last_updated": "realtime",
    }


@router.get("/audit-pack", summary="Generate audit evidence package")
async def generate_audit_pack(
    current_user: CurrentUserDep,
    driver: Neo4jDep,
    framework: str = Query(..., description="Target regulatory framework, e.g. OISD_117"),
    clauses: Optional[list[str]] = Query(None, description="Specific clause IDs; omit for all clauses in framework"),
) -> dict:
    """
    Assembles evidence package per regulatory clause.
    Clauses with all evidence below confidence 0.7 require human review before clearance.
    Human sign-off is mandatory — this is audit-preparation acceleration, not automated compliance.
    """
    async with driver.session(database="neo4j") as session:
        result = await session.run(_AUDIT_CYPHER, framework=framework, clauses=clauses)
        rows = [dict(r) async for r in result]

    human_review_required = []
    assembled = []

    for r in rows:
        evidence = r.get("evidence") or []
        verified = [e for e in evidence if e.get("verification_status") == "verified"]
        low_confidence = all(e.get("confidence", 0) < 0.7 for e in evidence) if evidence else True

        clause_entry = {
            "clause_id": r["clause_id"],
            "requirement_text": r["requirement_text"],
            "applies_to": r["applies_to"],
            "authority_level": r["authority_level"],
            "severity": _severity(r["authority_level"]),
            "evidence": evidence,
            "verified_evidence_count": len(verified),
            "clearance_blocked": low_confidence,
        }
        assembled.append(clause_entry)
        if low_confidence:
            human_review_required.append(r["clause_id"])

    total_docs = sum(len(c["evidence"]) for c in assembled)

    return {
        "framework": framework,
        "clauses": assembled,
        "total_clauses": len(assembled),
        "total_evidence_docs": total_docs,
        "human_review_required": human_review_required,
        "note": "Human sign-off required for all clearances. This package is audit-preparation only.",
        "status": "draft",
    }


@router.get("/frameworks", summary="List configured regulatory frameworks")
async def list_frameworks(
    current_user: CurrentUserDep,
    driver: Neo4jDep,
) -> dict:
    """Returns frameworks present in the Neo4j knowledge graph (i.e. already seeded)."""
    async with driver.session(database="neo4j") as session:
        result = await session.run(
            "MATCH (c:Concept {type: 'Regulation'}) RETURN DISTINCT c.framework AS framework ORDER BY framework"
        )
        seeded = [r["framework"] async for r in result]

    return {
        "configured_frameworks": seeded,
        "available_frameworks": [
            "OISD_117", "PESO", "FDA_21CFR_PART11", "CEA", "IEC_62443",
            "ISO_45001", "ISO_22000", "FSSAI", "SCHEDULE_M",
        ],
    }

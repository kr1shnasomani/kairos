"""
Graph service — Neo4j temporal graph operations (Layer 4).
All write operations enforce the six mandatory edge properties.
"""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import structlog
from neo4j import AsyncDriver

log = structlog.get_logger(__name__)


class GraphService:
    """
    Service layer for all Neo4j temporal graph operations.
    Enforces: validity windows, authority hierarchy, provenance pointers,
    confidence scores, and verification status on every edge write.
    """

    _SAFETY_CRITICAL_KEYWORDS = {"pressure", "temperature", "inspection", "isolation", "material"}

    def __init__(self, driver: AsyncDriver, database: str | None = None):
        self.driver = driver
        # Default to the configured database, not a hardcoded "neo4j" — Aura names its DB after the
        # instance ID (e.g. "2016aa75"), so callers that omit `database` must still hit the right one.
        if database is None:
            from api.config import settings
            database = settings.NEO4J_DATABASE
        self.database = database

    async def health_check(self) -> bool:
        try:
            async with self.driver.session(database=self.database) as session:
                result = await session.run("RETURN 1 AS ok")
                await result.single()
            return True
        except Exception as e:
            log.error("neo4j.health_check_failed", error=str(e))
            return False

    # -------------------------------------------------------------------------
    # Asset nodes (Layer 1)
    # -------------------------------------------------------------------------

    async def create_asset_node(self, asset_data: Dict[str, Any]) -> str:
        """
        Creates or merges a canonical asset node. If parent_asset_id is provided,
        creates a PARENT_OF relationship from parent to this asset.
        """
        node_cypher = """
        MERGE (a:Asset {asset_id: $asset_id})
        ON CREATE SET
            a.tag_number = $tag_number,
            a.name = $name,
            a.equipment_class = $equipment_class,
            a.criticality = $criticality,
            a.site_id = $site_id,
            a.facility_id = $facility_id,
            a.eam_source = $eam_source,
            a.identity_confirmed = $identity_confirmed,
            a.created_at = $created_at
        RETURN a.asset_id AS asset_id
        """
        parent_cypher = """
        MATCH (parent:Asset {asset_id: $parent_asset_id})
        MATCH (child:Asset {asset_id: $asset_id})
        MERGE (parent)-[:PARENT_OF]->(child)
        """
        async with self.driver.session(database=self.database) as session:
            params = {k: v for k, v in asset_data.items() if k != "parent_asset_id"}
            params["created_at"] = datetime.now(timezone.utc).isoformat()
            result = await session.run(node_cypher, **params)
            record = await result.single()
            asset_id = record["asset_id"]

            if asset_data.get("parent_asset_id"):
                await session.run(
                    parent_cypher,
                    parent_asset_id=asset_data["parent_asset_id"],
                    asset_id=asset_id,
                )
        return asset_id

    async def get_asset(self, asset_id: str) -> Optional[Dict[str, Any]]:
        cypher = "MATCH (a:Asset {asset_id: $asset_id}) RETURN a"
        async with self.driver.session(database=self.database) as session:
            result = await session.run(cypher, asset_id=asset_id)
            record = await result.single()
            return dict(record["a"]) if record else None

    async def list_assets(
        self,
        site_id: Optional[str] = None,
        equipment_class: Optional[str] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> Dict[str, Any]:
        """Returns paginated asset list with total count. Authority pre-filter before traversal."""
        where_clauses = []
        params: Dict[str, Any] = {"skip": skip, "limit": limit}
        if site_id:
            where_clauses.append("a.site_id = $site_id")
            params["site_id"] = site_id
        if equipment_class:
            where_clauses.append("a.equipment_class = $equipment_class")
            params["equipment_class"] = equipment_class

        where = ("WHERE " + " AND ".join(where_clauses)) if where_clauses else ""

        list_cypher = f"""
        MATCH (a:Asset) {where}
        RETURN a
        ORDER BY a.created_at DESC
        SKIP $skip LIMIT $limit
        """
        count_cypher = f"MATCH (a:Asset) {where} RETURN count(a) AS total"

        async with self.driver.session(database=self.database) as session:
            count_result = await session.run(count_cypher, **{k: v for k, v in params.items() if k not in ("skip", "limit")})
            count_record = await count_result.single()
            total = count_record["total"] if count_record else 0

            list_result = await session.run(list_cypher, **params)
            assets = [dict(record["a"]) async for record in list_result]

        return {"assets": assets, "total": total}

    async def get_asset_hierarchy(self, asset_id: str) -> Optional[Dict[str, Any]]:
        """
        Returns the asset's position in the hierarchy:
        ancestors (walk up PARENT_OF chain, up to 10 levels) and direct children.
        """
        asset_cypher = "MATCH (a:Asset {asset_id: $asset_id}) RETURN a"
        ancestors_cypher = """
        MATCH (a:Asset {asset_id: $asset_id})<-[:PARENT_OF*1..10]-(ancestor:Asset)
        RETURN DISTINCT ancestor
        ORDER BY ancestor.created_at ASC
        """
        children_cypher = """
        MATCH (a:Asset {asset_id: $asset_id})-[:PARENT_OF]->(child:Asset)
        RETURN child
        """
        async with self.driver.session(database=self.database) as session:
            asset_result = await session.run(asset_cypher, asset_id=asset_id)
            asset_record = await asset_result.single()
            if not asset_record:
                return None

            asset = dict(asset_record["a"])

            anc_result = await session.run(ancestors_cypher, asset_id=asset_id)
            ancestors = [dict(record["ancestor"]) async for record in anc_result]

            ch_result = await session.run(children_cypher, asset_id=asset_id)
            children = [dict(record["child"]) async for record in ch_result]

        return {"asset": asset, "ancestors": ancestors, "children": children}

    # -------------------------------------------------------------------------
    # Knowledge edges (Layer 4 — all five properties enforced)
    # -------------------------------------------------------------------------

    # Maps Neo4j node labels to their primary key property name
    _LABEL_ID_FIELD = {
        "Asset": "asset_id",
        "Document": "document_id",
        "Event": "event_id",
        "Concept": "concept_id",
        "Person": "person_id",
        "Organisation": "org_id",
    }

    async def merge_document_node(self, document_id: str, props: Optional[Dict[str, Any]] = None) -> None:
        """MERGE a Document node into Neo4j (idempotent). Called before creating edges to it."""
        cypher = """
        MERGE (d:Document {document_id: $document_id})
        ON CREATE SET d += $props, d.created_at = $created_at
        """
        async with self.driver.session(database=self.database) as session:
            await session.run(
                cypher,
                document_id=document_id,
                props=props or {},
                created_at=datetime.now(timezone.utc).isoformat(),
            )

    async def merge_concept_node(self, concept_id: str, props: Optional[Dict[str, Any]] = None) -> None:
        """MERGE a Concept node into Neo4j (idempotent). Used for topology elements, regulations, etc."""
        cypher = """
        MERGE (c:Concept {concept_id: $concept_id})
        ON CREATE SET c += $props, c.created_at = $created_at
        """
        async with self.driver.session(database=self.database) as session:
            await session.run(
                cypher,
                concept_id=concept_id,
                props=props or {},
                created_at=datetime.now(timezone.utc).isoformat(),
            )

    async def detect_conflict(
        self,
        source_id: str,
        source_label: str,
        relationship_type: str,
        new_document_id: str,
        new_authority_level: int,
    ) -> Optional[Dict[str, Any]]:
        """
        Checks for an active edge on the same (source, relationship_type) from a DIFFERENT document.
        Returns conflict metadata dict for Supabase insert, or None if no conflict.
        """
        if source_label not in self._LABEL_ID_FIELD:
            return None
        src_field = self._LABEL_ID_FIELD[source_label]
        # Safe: src_field and source_label come from validated whitelist
        cypher = f"""
        MATCH (src:{source_label} {{{src_field}: $source_id}})-[r:KNOWLEDGE_EDGE]->(existing)
        WHERE r.relationship_type = $relationship_type
          AND (r.valid_to IS NULL OR r.valid_to > datetime())
          AND r.document_id <> $new_document_id
          AND r.verification_status <> 'superseded'
        RETURN r.edge_id AS edge_id, r.document_id AS document_id,
               r.authority_level AS authority_level, r.confidence AS confidence
        LIMIT 1
        """
        async with self.driver.session(database=self.database) as session:
            result = await session.run(
                cypher,
                source_id=source_id,
                relationship_type=relationship_type,
                new_document_id=new_document_id,
            )
            record = await result.single()
        if not record:
            return None

        param_lower = relationship_type.lower()
        is_safety_param = any(kw in param_lower for kw in self._SAFETY_CRITICAL_KEYWORDS)
        track = "engineering" if (new_authority_level <= 3 and is_safety_param) else "administrative"
        sla_hours = 24 if track == "engineering" else 5 * 24
        severity = "critical" if new_authority_level == 1 else ("major" if track == "engineering" else "minor")

        return {
            "parameter": relationship_type,
            "track": track,
            "severity": severity,
            "source_a": {"edge_id": record["edge_id"], "document_id": record["document_id"],
                         "authority_level": record["authority_level"], "confidence": record["confidence"]},
            "source_b": {"document_id": new_document_id, "authority_level": new_authority_level},
            "authority_a": record["authority_level"],
            "authority_b": new_authority_level,
            "sla_hours": sla_hours,
        }

    # Sentinel: stored as valid_to when the edge has no expiry yet.
    # Neo4j drops null properties, so we use far-future to guarantee the key exists.
    _OPEN_VALID_TO = datetime(9999, 12, 31, 23, 59, 59, tzinfo=timezone.utc)

    async def create_knowledge_edge(
        self,
        source_id: str,
        source_label: str,
        target_id: str,
        target_label: str,
        relationship_type: str,
        # Six mandatory edge properties:
        valid_from: datetime,
        authority_level: int,
        document_id: str,
        confidence: float,
        verification_status: str = "unverified",
        valid_to: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        """
        Creates a temporal knowledge edge with all six mandatory properties.
        Labels must be from the known node label set (validated against whitelist).
        Returns {"edge_id": str, "conflict": dict|None} — conflict is non-None when
        an existing active edge for the same (source, relationship_type) was found.
        """
        if source_label not in self._LABEL_ID_FIELD or target_label not in self._LABEL_ID_FIELD:
            raise ValueError(f"Unknown label: {source_label!r} or {target_label!r}")
        if not (1 <= authority_level <= 5):
            raise ValueError(f"authority_level must be 1-5, got {authority_level}")
        if not (0.0 <= confidence <= 1.0):
            raise ValueError(f"confidence must be 0.0-1.0, got {confidence}")

        src_field = self._LABEL_ID_FIELD[source_label]
        tgt_field = self._LABEL_ID_FIELD[target_label]
        edge_id = f"{source_id}_{relationship_type}_{target_id}_{valid_from.isoformat()}"

        # Detect conflict before writing (labels come from validated whitelist — f-string safe)
        conflict = await self.detect_conflict(
            source_id=source_id,
            source_label=source_label,
            relationship_type=relationship_type,
            new_document_id=document_id,
            new_authority_level=authority_level,
        )

        cypher = f"""
        MATCH (src:{source_label} {{{src_field}: $source_id}})
        MATCH (tgt:{target_label} {{{tgt_field}: $target_id}})
        CREATE (src)-[r:KNOWLEDGE_EDGE {{
            edge_id: $edge_id,
            relationship_type: $relationship_type,
            valid_from: $valid_from,
            valid_to: $valid_to,
            authority_level: $authority_level,
            document_id: $document_id,
            confidence: $confidence,
            verification_status: $verification_status
        }}]->(tgt)
        RETURN r.edge_id AS edge_id
        """
        async with self.driver.session(database=self.database) as session:
            result = await session.run(
                cypher,
                source_id=source_id,
                target_id=target_id,
                relationship_type=relationship_type,
                edge_id=edge_id,
                valid_from=valid_from.isoformat(),
                valid_to=(valid_to or self._OPEN_VALID_TO).isoformat(),
                authority_level=authority_level,
                document_id=document_id,
                confidence=confidence,
                verification_status=verification_status,
            )
            record = await result.single()

        return {"edge_id": record["edge_id"] if record else edge_id, "conflict": conflict}

    async def close_validity_window(self, edge_id: str, valid_to: datetime) -> None:
        """Closes the validity window on an edge (supersession, never deletion)."""
        cypher = """
        MATCH ()-[r:KNOWLEDGE_EDGE {edge_id: $edge_id}]->()
        SET r.valid_to = $valid_to, r.verification_status = 'superseded'
        """
        async with self.driver.session(database=self.database) as session:
            await session.run(cypher, edge_id=edge_id, valid_to=valid_to.isoformat())

    async def close_validity_windows_for_document(self, document_id: str, valid_to: datetime) -> int:
        """
        Closes all active edges that reference a specific document (document supersession).
        Returns the count of edges closed. Never deletes — only sets valid_to + status.
        """
        cypher = """
        MATCH ()-[r:KNOWLEDGE_EDGE {document_id: $document_id}]-()
        WHERE (r.valid_to IS NULL OR r.valid_to > datetime())
        SET r.valid_to = $valid_to, r.verification_status = 'superseded'
        RETURN count(r) AS closed
        """
        async with self.driver.session(database=self.database) as session:
            result = await session.run(cypher, document_id=document_id, valid_to=valid_to.isoformat())
            record = await result.single()
            return record["closed"] if record else 0

    # -------------------------------------------------------------------------
    # Time-travel queries (Layer 4)
    # -------------------------------------------------------------------------

    async def get_asset_knowledge_at(
        self,
        asset_id: str,
        as_of: Optional[datetime] = None,
        authority_min: int = 5,
    ) -> List[Dict[str, Any]]:
        """
        Returns all temporal graph edges for an asset, optionally scoped to a
        historical point-in-time. Uses composite index on (asset_id, valid_from, valid_to).
        """
        as_of_str = as_of.isoformat() if as_of else datetime.now(timezone.utc).isoformat()
        cypher = """
        MATCH (a:Asset {asset_id: $asset_id})-[r:KNOWLEDGE_EDGE]->(target)
        WHERE r.valid_from <= $as_of
          AND (r.valid_to IS NULL OR r.valid_to > $as_of)
          AND r.authority_level <= $authority_min
        RETURN r, target
        ORDER BY r.authority_level ASC, r.valid_from DESC
        """
        async with self.driver.session(database=self.database) as session:
            result = await session.run(
                cypher,
                asset_id=asset_id,
                as_of=as_of_str,
                authority_min=authority_min,
            )
            # Dedupe by edge_id property: the graph can hold multiple physical KNOWLEDGE_EDGE
            # relationships that share one logical edge_id (Cypher DISTINCT can't collapse them
            # — they're separate graph elements). Keep the first, drop repeats.
            seen: set[str] = set()
            facts: List[Dict[str, Any]] = []
            async for record in result:
                edge = dict(record["r"])
                edge_id = edge.get("edge_id")
                if edge_id in seen:
                    continue
                seen.add(edge_id)
                facts.append({"edge": edge, "target": dict(record["target"])})
            return facts

    # -------------------------------------------------------------------------
    # Blast-radius analysis (Layer 7)
    # -------------------------------------------------------------------------

    async def get_event_timeline(
        self,
        asset_id: str,
        window_start: str,
        limit: int = 50,
    ) -> List[Dict[str, Any]]:
        """
        Returns Event nodes linked to an asset (by property or relationship)
        with occurred_at >= window_start, ordered chronologically.
        """
        cypher = """
        MATCH (e:Event)
        WHERE (e.asset_id = $asset_id
               OR EXISTS { MATCH (a:Asset {asset_id: $asset_id})-[]->(e) })
          AND e.occurred_at >= $window_start
        RETURN DISTINCT
            e.event_id   AS event_id,
            e.event_type AS event_type,
            e.occurred_at AS occurred_at,
            e.description AS description,
            e.document_id AS document_id,
            e.source      AS source
        ORDER BY e.occurred_at ASC
        LIMIT $limit
        """
        async with self.driver.session(database=self.database) as session:
            result = await session.run(cypher, asset_id=asset_id, window_start=window_start, limit=limit)
            return [
                {
                    "event_id": r["event_id"],
                    "event_type": r["event_type"],
                    "occurred_at": r["occurred_at"],
                    "description": r["description"] or "",
                    "document_id": r["document_id"],
                    "source": r["source"] or "neo4j",
                }
                async for r in result
            ]

    async def get_blast_radius(self, document_id: str) -> Dict[str, Any]:
        """
        Traverses the graph to find all facts and downstream relationships
        that derive from the specified document (provenance_pointer = document_id).
        """
        # Return both endpoints: the affected entity is the edge SOURCE (e.g. the asset
        # whose knowledge derives from this document); the target is usually the document
        # node itself. Dedupe by edge_id — re-runs can leave duplicate relationships.
        cypher = """
        MATCH (source)-[r:KNOWLEDGE_EDGE {document_id: $document_id}]->(target)
        RETURN r, source, target
        LIMIT 500
        """
        async with self.driver.session(database=self.database) as session:
            result = await session.run(cypher, document_id=document_id)
            seen: set = set()
            affected = []
            async for record in result:
                edge = dict(record["r"])
                edge_id = edge.get("edge_id")
                if edge_id and edge_id in seen:
                    continue
                if edge_id:
                    seen.add(edge_id)
                affected.append({
                    "edge": edge,
                    "source": dict(record["source"]),
                    "target": dict(record["target"]),
                })
            return {"document_id": document_id, "affected_count": len(affected), "affected": affected}

    async def get_last_inspection_date(self, asset_id: str) -> Optional[str]:
        """Returns the most recent inspection Event occurred_at for an asset, or None."""
        cypher = """
        MATCH (e:Event)
        WHERE (e.asset_id = $asset_id
               OR EXISTS { MATCH (a:Asset {asset_id: $asset_id})-[]->(e) })
          AND e.event_type = 'inspection'
        RETURN e.occurred_at AS inspection_date
        ORDER BY e.occurred_at DESC LIMIT 1
        """
        async with self.driver.session(database=self.database) as session:
            result = await session.run(cypher, asset_id=asset_id)
            record = await result.single()
            if record and record["inspection_date"]:
                val = record["inspection_date"]
                return val.isoformat() if hasattr(val, "isoformat") else str(val)
            return None

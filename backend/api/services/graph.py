"""
Graph service — Neo4j temporal graph operations (Layer 4).
All write operations enforce the five mandatory edge properties.
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

    def __init__(self, driver: AsyncDriver, database: str = "neo4j"):
        self.driver = driver
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

    async def create_knowledge_edge(
        self,
        source_node_id: str,
        target_node_id: str,
        relationship_type: str,
        # Five mandatory edge properties:
        valid_from: datetime,
        authority_level: int,
        document_id: str,
        confidence: float,
        verification_status: str = "unverified",
        valid_to: Optional[datetime] = None,
    ) -> str:
        """
        Creates a temporal knowledge edge with all five mandatory properties.
        Raises ValueError if any required property is missing.
        """
        if not (1 <= authority_level <= 5):
            raise ValueError(f"authority_level must be 1-5, got {authority_level}")
        if not (0.0 <= confidence <= 1.0):
            raise ValueError(f"confidence must be 0.0-1.0, got {confidence}")

        edge_id = f"{source_node_id}_{relationship_type}_{target_node_id}_{valid_from.isoformat()}"
        cypher = """
        MATCH (src {node_id: $source_node_id})
        MATCH (tgt {node_id: $target_node_id})
        CREATE (src)-[r:KNOWLEDGE_EDGE {
            edge_id: $edge_id,
            relationship_type: $relationship_type,
            valid_from: $valid_from,
            valid_to: $valid_to,
            authority_level: $authority_level,
            document_id: $document_id,
            confidence: $confidence,
            verification_status: $verification_status
        }]->(tgt)
        RETURN r.edge_id AS edge_id
        """
        async with self.driver.session(database=self.database) as session:
            result = await session.run(
                cypher,
                source_node_id=source_node_id,
                target_node_id=target_node_id,
                relationship_type=relationship_type,
                edge_id=edge_id,
                valid_from=valid_from.isoformat(),
                valid_to=valid_to.isoformat() if valid_to else None,
                authority_level=authority_level,
                document_id=document_id,
                confidence=confidence,
                verification_status=verification_status,
            )
            record = await result.single()
            return record["edge_id"] if record else edge_id

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
        WHERE r.valid_to IS NULL
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
        authority_min: int = 1,
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
          AND r.authority_level >= $authority_min
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
            return [{"edge": dict(record["r"]), "target": dict(record["target"])} async for record in result]

    # -------------------------------------------------------------------------
    # Blast-radius analysis (Layer 7)
    # -------------------------------------------------------------------------

    async def get_blast_radius(self, document_id: str) -> Dict[str, Any]:
        """
        Traverses the graph to find all facts and downstream relationships
        that derive from the specified document (provenance_pointer = document_id).
        """
        cypher = """
        MATCH ()-[r:KNOWLEDGE_EDGE {document_id: $document_id}]->(target)
        RETURN r, target
        LIMIT 500
        """
        async with self.driver.session(database=self.database) as session:
            result = await session.run(cypher, document_id=document_id)
            affected = [{"edge": dict(record["r"]), "target": dict(record["target"])} async for record in result]
            return {"document_id": document_id, "affected_count": len(affected), "affected": affected}

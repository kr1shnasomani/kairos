"""
Graph service — Neo4j temporal graph operations (Layer 4).
All write operations enforce the five mandatory edge properties.
"""

from datetime import datetime
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
        """Creates or merges a canonical asset node in the MDM backbone."""
        cypher = """
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
        async with self.driver.session(database=self.database) as session:
            result = await session.run(cypher, **asset_data, created_at=datetime.utcnow().isoformat())
            record = await result.single()
            return record["asset_id"]

    async def get_asset(self, asset_id: str) -> Optional[Dict[str, Any]]:
        cypher = "MATCH (a:Asset {asset_id: $asset_id}) RETURN a"
        async with self.driver.session(database=self.database) as session:
            result = await session.run(cypher, asset_id=asset_id)
            record = await result.single()
            return dict(record["a"]) if record else None

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
        properties: Optional[Dict[str, Any]] = None,
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
        as_of_str = as_of.isoformat() if as_of else datetime.utcnow().isoformat()
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

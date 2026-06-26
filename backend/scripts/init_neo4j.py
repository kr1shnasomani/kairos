"""
Init script — Apply Neo4j schema (constraints + indices).
Run: python backend/scripts/init_neo4j.py
"""

import asyncio
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent))

import structlog
from neo4j import AsyncGraphDatabase

from api.config import settings

log = structlog.get_logger(__name__)

SCHEMA_FILE = Path(__file__).parent.parent / "db" / "neo4j" / "init_schema.cypher"


async def apply_schema():
    log.info("neo4j.schema_init_started", uri=settings.NEO4J_URI)

    driver = AsyncGraphDatabase.driver(
        settings.NEO4J_URI,
        auth=(settings.NEO4J_USERNAME, settings.NEO4J_PASSWORD),
    )

    try:
        # Test connection
        async with driver.session(database=settings.NEO4J_DATABASE) as session:
            result = await session.run("RETURN 'connected' AS status")
            record = await result.single()
            log.info("neo4j.connected", status=record["status"])

        # Read and apply schema
        schema_cypher = SCHEMA_FILE.read_text()
        statements = [s.strip() for s in schema_cypher.split(";") if s.strip() and not s.strip().startswith("//")]

        async with driver.session(database=settings.NEO4J_DATABASE) as session:
            for i, statement in enumerate(statements, 1):
                if not statement:
                    continue
                try:
                    await session.run(statement)
                    log.info("neo4j.statement_applied", index=i, preview=statement[:60])
                except Exception as e:
                    log.warning("neo4j.statement_skipped", index=i, error=str(e))

        log.info("neo4j.schema_init_complete", statements_applied=len(statements))

    finally:
        await driver.close()


if __name__ == "__main__":
    asyncio.run(apply_schema())

"""
Document pipeline — Temporal.io durable workflow.
Crash-resilient: if the activity worker dies mid-ingestion, Temporal resumes
from the last completed activity checkpoint on restart.

Param convention: workflow receives vault_path (not raw bytes) so activities
download directly from Supabase Storage — the vault is the source of truth.
"""

import asyncio
import hashlib
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import structlog
from temporalio import activity, workflow
from temporalio.common import RetryPolicy

log = structlog.get_logger(__name__)

DEFAULT_RETRY = RetryPolicy(
    initial_interval=timedelta(seconds=5),
    backoff_coefficient=2.0,
    maximum_interval=timedelta(minutes=5),
    maximum_attempts=5,
)


# =============================================================================
# Activity helpers — shared Supabase client factory (sync, thread-safe)
# =============================================================================

_supabase_client = None
_redis_client = None
_neo4j_driver = None
_qdrant_client = None
_es_client = None


def _get_supabase():
    """Returns a cached Supabase client — one connection per worker process."""
    global _supabase_client
    if _supabase_client is None:
        import os
        from supabase import create_client
        _supabase_client = create_client(
            os.environ["SUPABASE_URL"],
            os.environ["SUPABASE_SERVICE_ROLE_KEY"],
        )
    return _supabase_client


def _get_redis():
    """Returns a cached sync Redis client — one connection per worker process."""
    global _redis_client
    if _redis_client is None:
        import os
        import redis as sync_redis
        _redis_client = sync_redis.from_url(
            os.environ.get("REDIS_URL", "redis://kairos-redis:6379"),
            decode_responses=True,
        )
    return _redis_client


def _get_neo4j_driver():
    """Returns a cached async Neo4j driver — one per worker process."""
    global _neo4j_driver
    if _neo4j_driver is None:
        import os
        from neo4j import AsyncGraphDatabase
        _neo4j_driver = AsyncGraphDatabase.driver(
            os.environ.get("NEO4J_URI", "bolt://kairos-neo4j:7687"),
            auth=(
                os.environ.get("NEO4J_USERNAME", "neo4j"),
                os.environ.get("NEO4J_PASSWORD", "kairos_dev_password"),
            ),
        )
    return _neo4j_driver


def _get_qdrant_client():
    """Returns a cached async Qdrant client — one per worker process."""
    global _qdrant_client
    if _qdrant_client is None:
        import os
        from qdrant_client import AsyncQdrantClient
        _qdrant_client = AsyncQdrantClient(
            url=os.environ.get("QDRANT_URL", "http://kairos-qdrant:6333"),
        )
    return _qdrant_client


def _get_es_client():
    """Returns a cached async Elasticsearch client — one per worker process."""
    global _es_client
    if _es_client is None:
        import os
        from elasticsearch import AsyncElasticsearch
        _es_client = AsyncElasticsearch(
            [os.environ.get("ELASTICSEARCH_URL", "http://kairos-elasticsearch:9200")]
        )
    return _es_client


# =============================================================================
# Activity 1: store_in_vault
# =============================================================================

@activity.defn
async def store_in_vault(
    document_id: str,
    vault_path: str,
    mime_type: str,
    job_id: str,
) -> Dict[str, Any]:
    """
    Downloads the document from Supabase Storage, verifies its SHA-256 against
    the canonical hash in the documents table, and advances the job to ocr_running.
    The vault is the source of truth — bytes come from Storage, not workflow params.
    """
    supabase = _get_supabase()

    # Download raw bytes from vault
    file_bytes = await asyncio.to_thread(
        lambda: supabase.storage.from_("kairos-vault").download(vault_path)
    )
    computed_sha256 = hashlib.sha256(file_bytes).hexdigest()

    # Verify SHA-256 against canonical record
    doc_result = await asyncio.to_thread(
        lambda: supabase.table("documents")
        .select("sha256_hash")
        .eq("document_id", document_id)
        .execute()
    )
    if not doc_result.data:
        raise RuntimeError(f"Document '{document_id}' not found in vault registry")

    canonical_sha256 = doc_result.data[0]["sha256_hash"]
    if computed_sha256 != canonical_sha256:
        raise RuntimeError(
            f"SHA-256 integrity check FAILED for {document_id}: "
            f"expected={canonical_sha256} computed={computed_sha256}"
        )

    # Advance job stage → ocr_running
    await asyncio.to_thread(
        lambda: supabase.table("extraction_jobs").update({
            "pipeline_stage": "ocr_running",
            "progress_pct": 10,
            "started_at": datetime.now(timezone.utc).isoformat(),
        }).eq("job_id", job_id).execute()
    )

    log.info(
        "activity.vault_verified",
        document_id=document_id,
        sha256=computed_sha256,
        bytes=len(file_bytes),
    )
    return {
        "sha256": computed_sha256,
        "bytes_downloaded": len(file_bytes),
        "verified": True,
    }


# =============================================================================
# Activity 2: run_ocr
# =============================================================================

@activity.defn
async def run_ocr(
    document_id: str,
    vault_path: str,
    mime_type: str,
    job_id: str,
    document_type: str = "unknown",
) -> Dict[str, Any]:
    """
    Downloads the document from Storage and runs the OCR pipeline.
    - pid_drawing       → skips OCR; loads mock topology fixture; routes all elements to quarantine
    - Confidence >= 0.5 → advances stage to ner_running
    - Confidence < 0.5  → sets stage to review_required, publishes to kairos:events:review_required
    """
    import json
    import os

    from api.services.ocr import OCRService

    supabase = _get_supabase()

    # ── PID drawing fast path: topology extraction, no OCR ──────────────────
    if document_type == "pid_drawing":
        from api.services.graph import GraphService

        fixture_path = os.path.join(os.path.dirname(__file__), "..", "fixtures", "pid_topology_mock.json")
        with open(fixture_path) as f:
            topology = json.load(f)

        graph = GraphService(_get_neo4j_driver())
        now = datetime.now(timezone.utc)

        # Merge Document node with pid_topology type so edges can point to it
        await graph.merge_document_node(document_id, {"document_type": "pid_topology", "authority_level": 3})

        # Flatten all topology elements into one iterable
        all_elements = (
            [{"element_group": "equipment_nodes", **e} for e in topology.get("equipment_nodes", [])]
            + [{"element_group": "isolation_valves", **v} for v in topology.get("isolation_valves", [])]
            + [{"element_group": "instrumentation_loops", **l} for l in topology.get("instrumentation_loops", [])]
            + [{"element_group": "isolation_boundaries", **b} for b in topology.get("isolation_boundaries", [])]
        )

        element_count = 0
        for elem in all_elements:
            elem_id = elem["id"]
            elem_group = elem["element_group"]

            # Merge Concept node so the KNOWLEDGE_EDGE MATCH succeeds
            await graph.merge_concept_node(elem_id, {
                "label": elem.get("tag") or elem.get("loop_id") or elem.get("boundary_id") or elem_id,
                "element_type": elem_group,
                "source_document_id": document_id,
            })

            # Unverified edge: Document -[CONTAINS_TOPOLOGY_ELEMENT]-> Concept
            try:
                await graph.create_knowledge_edge(
                    source_id=document_id,
                    source_label="Document",
                    target_id=elem_id,
                    target_label="Concept",
                    relationship_type="CONTAINS_TOPOLOGY_ELEMENT",
                    valid_from=now,
                    authority_level=3,
                    document_id=document_id,
                    confidence=0.85,
                    verification_status="unverified",
                )
            except Exception as exc:
                log.warning("pid.edge_create_failed", element_id=elem_id, error=str(exc))

            # Each element → quarantine for human element-by-element engineer verification
            ctx = {k: v for k, v in elem.items() if k != "element_group"}
            ctx["source_document_id"] = document_id
            ctx["element_group"] = elem_group
            await asyncio.to_thread(
                lambda eid=elem_id, eg=elem_group, c=ctx: supabase.table("quarantine_items").insert({
                    "asset_id": None,
                    "content": f"PID element: {eid} ({eg})",
                    "input_type": "deviation_flag",
                    "submitted_by": "extraction_pipeline",
                    "session_context": c,
                }).execute()
            )
            element_count += 1

        # One manifest item with the full topology JSON — serves GET /topology
        await asyncio.to_thread(
            lambda: supabase.table("quarantine_items").insert({
                "asset_id": None,
                "content": f"PID_TOPOLOGY_MANIFEST:{document_id}",
                "input_type": "deviation_flag",
                "submitted_by": "extraction_pipeline",
                "session_context": {
                    "source_document_id": document_id,
                    "element_type": "topology_manifest",
                    "topology": topology,
                },
            }).execute()
        )

        await asyncio.to_thread(
            lambda: supabase.table("extraction_jobs").update({
                "pipeline_stage": "pid_topology_queued",
                "progress_pct": 80,
                "entity_count": element_count,
            }).eq("job_id", job_id).execute()
        )

        log.info("activity.pid_topology_extracted", document_id=document_id, elements=element_count)
        return {
            "pid_drawing": True,
            "text": "",
            "overall_confidence": 1.0,
            "requires_review": False,
            "element_count": element_count,
        }
    # ── End PID fast path ───────────────────────────────────────────────────

    # Download bytes from vault (activities re-download independently — vault is truth)
    file_bytes = await asyncio.to_thread(
        lambda: supabase.storage.from_("kairos-vault").download(vault_path)
    )

    # Run extraction
    ocr = OCRService()
    result = await ocr.extract_text(file_bytes, mime_type=mime_type)

    overall_confidence = result.get("overall_confidence", 0.0)
    requires_review = overall_confidence < 0.5

    if requires_review:
        # Route to human review — stop the pipeline here
        await asyncio.to_thread(
            lambda: supabase.table("extraction_jobs").update({
                "pipeline_stage": "review_required",
                "progress_pct": 20,
                "ocr_confidence": overall_confidence,
                "review_pending": 1,
                "error": result.get("error") or "OCR confidence below threshold (< 0.5)",
            }).eq("job_id", job_id).execute()
        )

        # Publish to Redis Stream for human review queue
        redis = _get_redis()
        await asyncio.to_thread(
            lambda: redis.xadd(
                "kairos:events:review_required",
                {
                    "document_id": document_id,
                    "job_id": job_id,
                    "reason": "low_ocr_confidence",
                    "ocr_confidence": str(overall_confidence),
                    "extraction_method": result.get("extraction_method", "unknown"),
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                },
            )
        )

        log.warning(
            "activity.ocr_review_required",
            document_id=document_id,
            confidence=overall_confidence,
        )
    else:
        # Advance to NER stage
        await asyncio.to_thread(
            lambda: supabase.table("extraction_jobs").update({
                "pipeline_stage": "ner_running",
                "progress_pct": 30,
                "ocr_confidence": overall_confidence,
            }).eq("job_id", job_id).execute()
        )
        log.info(
            "activity.ocr_complete",
            document_id=document_id,
            confidence=overall_confidence,
            method=result.get("extraction_method"),
            block_count=result.get("block_count", 0),
        )

    return {
        "text": result.get("text", ""),
        "overall_confidence": overall_confidence,
        "requires_review": requires_review,
        "block_count": result.get("block_count", 0),
        "extraction_method": result.get("extraction_method", "unknown"),
    }


# =============================================================================
# Activity 3: run_ner
# =============================================================================

@activity.defn
async def run_ner(document_id: str, text: str, job_id: str) -> Dict[str, Any]:
    """Step 3: NER entity extraction — mXLM-RoBERTa, degrades gracefully when model absent."""
    from api.services.ner import NERService

    supabase = _get_supabase()
    ner = NERService()
    result = await ner.extract_entities(text)
    entities = result.get("entities", [])

    await asyncio.to_thread(
        lambda: supabase.table("extraction_jobs").update({
            "pipeline_stage": "graph_linking",
            "progress_pct": 50,
            "entity_count": len(entities),
        }).eq("job_id", job_id).execute()
    )
    log.info("activity.ner_complete", document_id=document_id, entity_count=len(entities))
    return {
        "entities": entities,
        "requires_annotation": result.get("requires_annotation", False),
    }


# =============================================================================
# Activity 4: link_to_graph
# =============================================================================

@activity.defn
async def link_to_graph(
    document_id: str,
    entities: List[Dict[str, Any]],
    asset_id: Optional[str],
    authority_level: int,
    job_id: str,
) -> Dict[str, Any]:
    """
    Step 4: Resolve ASSET_TAG entities to canonical assets and write KNOWLEDGE_EDGE rows.
    Confidence >= 0.7 + resolved → unverified graph edge.
    Confidence < 0.7 or unresolved → quarantine_items (never auto-promotes to canonical graph).
    """
    from api.services.graph import GraphService
    from api.services.ner import NERService

    supabase = _get_supabase()
    graph = GraphService(_get_neo4j_driver())
    ner = NERService()

    # Build alias lookup from Supabase {alias: canonical_asset_id}
    alias_result = await asyncio.to_thread(
        lambda: supabase.table("asset_alias_map").select("alias, canonical_asset_id").execute()
    )
    alias_map = {row["alias"]: row["canonical_asset_id"] for row in (alias_result.data or [])}

    # Also map canonical asset_ids to themselves so tags that directly match a
    # canonical ID (e.g. "P-101") resolve without needing an alias_map entry.
    canonical_result = await asyncio.to_thread(
        lambda: supabase.table("assets").select("asset_id").execute()
    )
    for row in (canonical_result.data or []):
        cid = row["asset_id"]
        alias_map.setdefault(cid, cid)
        alias_map.setdefault(cid.upper().replace(" ", ""), cid)

    doc_meta = await asyncio.to_thread(
        lambda: supabase.table("documents")
        .select("document_type, occurred_at, ingested_at")
        .eq("document_id", document_id)
        .execute()
    )
    doc_row = doc_meta.data[0] if doc_meta.data else {}
    doc_type = doc_row.get("document_type", "unknown")
    await graph.merge_document_node(document_id, {"authority_level": authority_level, "document_type": doc_type})

    # Circuit breaker pre-flight: check Z-score per asset_class before any graph writes
    from api.services.circuit_breaker import CircuitBreakerService
    cb = CircuitBreakerService(supabase)

    candidate_ids = list({
        ner.resolve_asset_tag(e.get("text", ""), alias_map)
        for e in entities
        if e.get("entity_type") == "ASSET_TAG" and e.get("confidence", 0.0) >= 0.7
    } - {None})

    asset_class_map: Dict[str, str] = {}
    if candidate_ids:
        asset_rows = await asyncio.to_thread(
            lambda: supabase.table("assets").select("asset_id, equipment_class").in_("asset_id", candidate_ids).execute()
        )
        asset_class_map = {
            r["asset_id"]: (r.get("equipment_class") or "unknown")
            for r in (asset_rows.data or [])
        }

    checked_classes: Dict[str, dict] = {}
    for cid in candidate_ids:
        ac = asset_class_map.get(cid, "unknown")
        if ac not in checked_classes:
            checked_classes[ac] = await cb.check(ac)

    halted_classes = [ac for ac, r in checked_classes.items() if r["halted"]]
    if halted_classes:
        redis = _get_redis()
        await asyncio.to_thread(
            lambda: redis.xadd("kairos:events:review_required", {
                "document_id": document_id,
                "reason": "circuit_breaker_halted",
                "halted_classes": ",".join(halted_classes),
                "job_id": job_id,
            })
        )
        log.warning(
            "activity.link_to_graph.circuit_breaker_halted",
            document_id=document_id,
            halted_classes=halted_classes,
        )
        return {
            "edges_created": 0,
            "quarantine_count": 0,
            "circuit_breaker_halted": True,
            "halted_classes": halted_classes,
        }

    now = datetime.now(timezone.utc)

    # Timestamp normalization: canonical_valid_from = ingested_at by default;
    # use source occurred_at only when drift is within tolerance
    _ingested_str = doc_row.get("ingested_at")
    _occurred_str = doc_row.get("occurred_at")
    _ingested_dt = (
        datetime.fromisoformat(_ingested_str.replace("Z", "+00:00"))
        if _ingested_str else now
    )
    canonical_valid_from = _ingested_dt

    if _occurred_str:
        _tol = int(os.environ.get("TIMESTAMP_DRIFT_TOLERANCE_MINUTES", "60"))
        _source_dt = datetime.fromisoformat(_occurred_str.replace("Z", "+00:00"))
        _drift = abs((_source_dt - _ingested_dt).total_seconds() / 60)
        if _drift > _tol:
            await asyncio.to_thread(
                lambda: supabase.table("audit_log").insert({
                    "action": "timestamp_drift_detected",
                    "entity_type": "document",
                    "entity_id": document_id,
                    "performed_by": "extraction_pipeline",
                    "details": {
                        "source_ts": _occurred_str,
                        "ingested_ts": _ingested_str,
                        "drift_minutes": round(_drift, 2),
                    },
                }).execute()
            )
            await asyncio.to_thread(
                lambda: supabase.table("extraction_jobs")
                .update({"timestamp_drift_detected": True})
                .eq("job_id", job_id)
                .execute()
            )
            log.warning(
                "activity.timestamp_drift_detected",
                document_id=document_id,
                drift_minutes=round(_drift, 2),
                source_ts=_occurred_str,
            )
        else:
            canonical_valid_from = _source_dt

    edges_created = 0
    quarantine_count = 0

    for entity in entities:
        if entity.get("entity_type") != "ASSET_TAG":
            continue

        confidence = entity.get("confidence", 0.0)
        raw_tag = entity.get("text", "")

        # Low confidence → quarantine regardless of resolution; never touch the graph
        if confidence < 0.7:
            await asyncio.to_thread(
                lambda e=entity, rt=raw_tag, c=confidence: supabase.table("quarantine_items").insert({
                    "asset_id": asset_id,
                    "content": f"Low-confidence entity: '{rt}' (confidence={c:.2f})",
                    "input_type": "deviation_flag",
                    "submitted_by": "extraction_pipeline",
                    "session_context": {"document_id": document_id, "entity": e},
                }).execute()
            )
            quarantine_count += 1
            continue

        canonical_id = ner.resolve_asset_tag(raw_tag, alias_map)

        if canonical_id:
            # Resolved: write unverified edge — human must verify before it becomes canonical
            try:
                result = await graph.create_knowledge_edge(
                    source_id=canonical_id,
                    source_label="Asset",
                    target_id=document_id,
                    target_label="Document",
                    relationship_type="DOCUMENTED_BY",
                    valid_from=canonical_valid_from,
                    authority_level=authority_level,
                    document_id=document_id,
                    confidence=confidence,
                    verification_status="unverified",
                )
                edges_created += 1

                conflict = result.get("conflict")
                if conflict:
                    from datetime import timedelta
                    await asyncio.to_thread(
                        lambda cd=conflict, aid=canonical_id: supabase.table("knowledge_conflicts").insert({
                            "track": cd["track"],
                            "asset_id": aid,
                            "parameter": cd["parameter"],
                            "source_a": cd["source_a"],
                            "source_b": cd["source_b"],
                            "authority_a": cd["authority_a"],
                            "authority_b": cd["authority_b"],
                            "severity": cd["severity"],
                            "status": "pending_moc" if cd["track"] == "engineering" else "open",
                            "sla_deadline": (now + timedelta(hours=cd["sla_hours"])).isoformat(),
                        }).execute()
                    )
                    log.info("link.conflict_detected", asset_id=canonical_id, track=conflict["track"],
                             parameter=conflict["parameter"])
            except Exception as exc:
                log.warning("link.edge_create_failed", asset_id=canonical_id, document_id=document_id, error=str(exc))
        else:
            # Unresolved: register as unconfirmed alias candidate (if we have a parent asset) + quarantine
            if asset_id:
                try:
                    normalized = raw_tag.strip().upper().replace(" ", "")
                    await asyncio.to_thread(
                        lambda na=normalized: supabase.table("asset_alias_map").upsert({
                            "canonical_asset_id": asset_id,
                            "alias": na,
                            "alias_source": f"ner_extraction:{document_id}",
                            "confidence": confidence,
                            "confirmed": False,
                        }, on_conflict="alias").execute()
                    )
                except Exception as exc:
                    log.warning("link.alias_insert_failed", alias=raw_tag, error=str(exc))

            await asyncio.to_thread(
                lambda e=entity, rt=raw_tag: supabase.table("quarantine_items").insert({
                    "asset_id": asset_id,
                    "content": f"Unresolved asset tag: '{rt}'",
                    "input_type": "deviation_flag",
                    "submitted_by": "extraction_pipeline",
                    "session_context": {"document_id": document_id, "entity": e},
                }).execute()
            )
            quarantine_count += 1

    # Persist edge count so GET /documents/{id}/status can report it
    await asyncio.to_thread(
        lambda: supabase.table("extraction_jobs").update({
            "graph_edges": edges_created,
        }).eq("job_id", job_id).execute()
    )

    log.info(
        "activity.link_to_graph_complete",
        document_id=document_id,
        edges=edges_created,
        quarantined=quarantine_count,
    )
    return {"edges_created": edges_created, "quarantine_count": quarantine_count}


# =============================================================================
# Activity 5: index_vectors
# =============================================================================

@activity.defn
async def index_vectors(
    document_id: str,
    text: str,
    metadata: Dict[str, Any],
    job_id: str,
) -> Dict[str, Any]:
    """
    Step 5: Chunk text and index embeddings into Qdrant kairos_documents collection.
    Embedding via Jina AI (primary) with Ollama nomic-embed-text as fallback.
    """
    import uuid as uuid_lib
    from api.services.llm import LLMService
    from api.services.vector_store import VectorStoreService
    from api.config import Settings

    settings = Settings()
    vector_store = VectorStoreService(_get_qdrant_client(), settings)
    llm = LLMService(settings)

    # Word-based chunking (~400 words / 50-word overlap ≈ 512 / 50 token segments)
    words = text.split()
    chunk_size, overlap = 400, 50
    chunks: List[str] = []
    i = 0
    while i < len(words):
        chunks.append(" ".join(words[i: i + chunk_size]))
        i += chunk_size - overlap
    if not chunks:
        return {"chunks_indexed": 0}

    asset_id = metadata.get("asset_id")
    authority_level = metadata.get("authority_level", 5)
    chunks_indexed = 0

    for idx, chunk_text in enumerate(chunks):
        vector = await llm.embed(chunk_text)
        if not vector:
            log.warning("index_vectors.embed_failed", document_id=document_id, chunk=idx,
                        hint="Jina and Ollama both unreachable — check JINA_API_KEY and OLLAMA_BASE_URL")
            continue

        point_id = str(uuid_lib.uuid5(uuid_lib.NAMESPACE_URL, f"{document_id}:{idx}"))
        await vector_store.upsert(
            collection=settings.QDRANT_COLLECTION_DOCUMENTS,
            point_id=point_id,
            vector=vector,
            payload={
                "document_id": document_id,
                "asset_id": asset_id,
                "chunk_index": idx,
                "authority_level": authority_level,
                "is_quarantine": False,
                "text": chunk_text,
            },
        )
        chunks_indexed += 1

    log.info("activity.index_vectors_complete", document_id=document_id, chunks=chunks_indexed)
    return {"chunks_indexed": chunks_indexed}


# =============================================================================
# Activity 6: index_text
# =============================================================================

@activity.defn
async def index_text(
    document_id: str,
    text: str,
    metadata: Dict[str, Any],
    job_id: str,
) -> Dict[str, Any]:
    """
    Step 6: Index full document content into Elasticsearch kairos_documents index.
    Always succeeds — ES is always available in the stack. Used for exact/keyword search.
    """
    from api.services.search_engine import SearchEngineService
    from api.config import Settings

    settings = Settings()
    es = _get_es_client()
    search_svc = SearchEngineService(es, settings)

    await search_svc.ensure_indices()

    await es.index(
        index=settings.ELASTICSEARCH_INDEX_DOCUMENTS,
        id=document_id,
        document={
            "document_id": document_id,
            "asset_id": metadata.get("asset_id"),
            "title": metadata.get("title", document_id),
            "content": text,
            "document_type": metadata.get("document_type", "unknown"),
            "authority_level": metadata.get("authority_level", 5),
            "status": "active",
            "ingested_at": datetime.now(timezone.utc).isoformat(),
        },
    )

    log.info("activity.index_text_complete", document_id=document_id)
    return {"indexed": True}


@activity.defn
async def mark_complete(job_id: str, document_id: str) -> None:
    """Sets pipeline_stage to 'complete' and progress to 100 in extraction_jobs."""
    supabase = _get_supabase()
    await asyncio.to_thread(
        lambda: supabase.table("extraction_jobs").update({
            "pipeline_stage": "complete",
            "progress_pct": 100,
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }).eq("job_id", job_id).execute()
    )
    log.info("activity.pipeline_complete", document_id=document_id, job_id=job_id)


# =============================================================================
# Workflow — orchestrates all activities with early-exit on review_required
# =============================================================================

@workflow.defn
class DocumentIngestionWorkflow:
    """
    Durable ingestion workflow. Crash-resilient: if the activity worker dies at
    any step, Temporal resumes from the last completed activity on restart.

    Workflow params: {document_id, vault_path, mime_type, asset_id,
                      document_type, authority_level, job_id}
    """

    @workflow.run
    async def run(self, params: Dict[str, Any]) -> Dict[str, Any]:
        document_id = params["document_id"]
        vault_path = params.get("vault_path")
        if not vault_path:
            workflow.logger.error(f"document_pipeline.missing_vault_path document_id={document_id}")
            return {"status": "failed", "reason": "missing vault_path"}
        mime_type = params.get("mime_type", "application/pdf")
        asset_id = params.get("asset_id")
        authority_level = params.get("authority_level", 4)
        document_type = params.get("document_type", "unknown")
        job_id = params["job_id"]

        workflow.logger.info("document_pipeline.started", document_id=document_id)

        # ── Step 1: Verify vault integrity ──────────────────────────────────
        vault_result = await workflow.execute_activity(
            store_in_vault,
            args=[document_id, vault_path, mime_type, job_id],
            start_to_close_timeout=timedelta(minutes=5),
            retry_policy=DEFAULT_RETRY,
        )

        # ── Step 2: OCR ─────────────────────────────────────────────────────
        ocr_result = await workflow.execute_activity(
            run_ocr,
            args=[document_id, vault_path, mime_type, job_id, document_type],
            start_to_close_timeout=timedelta(minutes=10),
            retry_policy=DEFAULT_RETRY,
        )

        # PID drawings: topology loaded into quarantine; skip NER/linking/indexing
        if ocr_result.get("pid_drawing"):
            await workflow.execute_activity(
                mark_complete,
                args=[job_id, document_id],
                start_to_close_timeout=timedelta(minutes=1),
                retry_policy=DEFAULT_RETRY,
            )
            workflow.logger.info(
                "document_pipeline.pid_topology_complete",
                document_id=document_id,
                elements=ocr_result.get("element_count", 0),
            )
            return {
                "document_id": document_id,
                "status": "pid_topology_queued",
                "element_count": ocr_result.get("element_count", 0),
            }

        # Early exit: low-confidence OCR routes to human review
        if ocr_result.get("requires_review"):
            workflow.logger.warning(
                "document_pipeline.routed_to_review document_id=%s confidence=%s",
                document_id,
                ocr_result["overall_confidence"],
            )
            return {
                "document_id": document_id,
                "status": "review_required",
                "ocr_confidence": ocr_result["overall_confidence"],
                "reason": "ocr_confidence_below_threshold",
            }

        # ── Step 3: NER ─────────────────────────────────────────────────────
        ner_result = await workflow.execute_activity(
            run_ner,
            args=[document_id, ocr_result["text"], job_id],
            start_to_close_timeout=timedelta(minutes=5),
            retry_policy=DEFAULT_RETRY,
        )

        # ── Step 4: Graph linking ────────────────────────────────────────────
        graph_result = await workflow.execute_activity(
            link_to_graph,
            args=[document_id, ner_result["entities"], asset_id, authority_level, job_id],
            start_to_close_timeout=timedelta(minutes=5),
            retry_policy=DEFAULT_RETRY,
        )

        # ── Steps 5 & 6: Vector + text indexing in parallel ─────────────────
        indexing_metadata = {
            "asset_id": asset_id,
            "authority_level": authority_level,
            "document_type": document_type,
        }
        vector_result, text_result = await asyncio.gather(
            workflow.execute_activity(
                index_vectors,
                args=[document_id, ocr_result["text"], indexing_metadata, job_id],
                start_to_close_timeout=timedelta(minutes=5),
                retry_policy=DEFAULT_RETRY,
            ),
            workflow.execute_activity(
                index_text,
                args=[document_id, ocr_result["text"], indexing_metadata, job_id],
                start_to_close_timeout=timedelta(minutes=2),
                retry_policy=DEFAULT_RETRY,
            ),
        )

        # ── Step 7: Mark complete in Supabase ───────────────────────────────
        await workflow.execute_activity(
            mark_complete,
            args=[job_id, document_id],
            start_to_close_timeout=timedelta(minutes=1),
            retry_policy=DEFAULT_RETRY,
        )

        workflow.logger.info("document_pipeline.complete", document_id=document_id)
        return {
            "document_id": document_id,
            "sha256": vault_result["sha256"],
            "ocr_confidence": ocr_result["overall_confidence"],
            "extraction_method": ocr_result.get("extraction_method"),
            "entities_found": len(ner_result["entities"]),
            "graph_edges": graph_result["edges_created"],
            "vector_chunks": vector_result["chunks_indexed"],
            "status": "complete",
        }

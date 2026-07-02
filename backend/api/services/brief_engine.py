"""
Brief Assembly Engine — Layer 8: Contextual brief construction from the knowledge graph.
Phase 1: raw retrieved facts. Phase 2 (not wired): LLM synthesis.
"""

import asyncio
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import structlog
from elasticsearch import AsyncElasticsearch
from neo4j import AsyncDriver
from qdrant_client import AsyncQdrantClient
from supabase import Client

from api.config import Settings
from api.models.brief import Brief, SourceCitation
from api.models.event import PTWEvent, ShiftHandoverEvent, WorkOrderEvent
from api.services.event_bus import EventBusService
from api.services.metrics import briefs_delivered
from api.services.graph import GraphService
from api.services.llm import LLMService
from api.services.vector_store import VectorStoreService

log = structlog.get_logger(__name__)


class BriefEngine:
    def __init__(
        self,
        driver: AsyncDriver,
        qdrant: AsyncQdrantClient,
        es: AsyncElasticsearch,
        supabase: Client,
        settings: Settings,
    ):
        self.graph = GraphService(driver)
        self.vector = VectorStoreService(qdrant, settings)
        self.es = es
        self.supabase = supabase
        self.settings = settings
        self.llm = LLMService(settings)

    # -------------------------------------------------------------------------
    # Work order brief
    # -------------------------------------------------------------------------

    async def assemble_work_order_brief(self, event: WorkOrderEvent) -> Brief:
        graph_task = self.graph.get_asset_knowledge_at(event.asset_id)
        vector_task = self._vector_search(f"failure {event.failure_code}", event.asset_id)
        quarantine_task = self._get_quarantine(event.asset_id)
        conflicts_task = self._get_open_conflicts(event.asset_id)
        procedures_task = self._es_procedures(event.asset_id)

        results = await asyncio.gather(
            graph_task, vector_task, quarantine_task, conflicts_task, procedures_task,
            return_exceptions=True,
        )
        graph_edges, vector_hits, quarantine_items, conflicts, procedures = [
            r if not isinstance(r, Exception) else [] for r in results
        ]

        sources = _sources_from_graph(graph_edges) + _sources_from_vector(vector_hits)
        warnings = [c["parameter"] for c in conflicts if isinstance(c, dict) and "parameter" in c]
        quarantine_flags = [q["item_id"] for q in quarantine_items if isinstance(q, dict)]
        action_items = [
            p.get("title") or p.get("document_id", "Review procedure")
            for p in procedures[:3]
        ]

        if graph_edges:
            top = graph_edges[0]
            edge = top.get("edge", {})
            target = top.get("target", {})
            headline = (
                f"Asset {event.asset_id}: {edge.get('relationship_type', 'knowledge edge')} "
                f"→ {target.get('tag_number') or target.get('concept_id') or 'linked node'} "
                f"(authority {edge.get('authority_level', '?')})"
            )
        else:
            headline = f"Asset {event.asset_id}: no prior knowledge edges found — first occurrence of failure code {event.failure_code}"

        body_lines = [f"Work order: {event.work_order_id} | Failure code: {event.failure_code}"]
        if graph_edges:
            body_lines.append(f"\nKnowledge graph — {len(graph_edges)} active edge(s):")
            for e in graph_edges[:5]:
                edge = e.get("edge", {})
                body_lines.append(
                    f"  • {edge.get('relationship_type', '?')} | confidence={edge.get('confidence', '?')} | "
                    f"authority={edge.get('authority_level', '?')}"
                )
        if vector_hits:
            body_lines.append(f"\nSimilar failure patterns (semantic, top {len(vector_hits[:3])}):")
            for h in vector_hits[:3]:
                p = h.get("payload", {})
                body_lines.append(f"  • [{p.get('document_id', '?')}] score={h.get('score', 0):.2f}")
        if procedures:
            body_lines.append(f"\nApplicable procedures in ES ({len(procedures)} found):")
            for p in procedures[:3]:
                body_lines.append(f"  • {p.get('title') or p.get('document_id', '?')}")

        # Enrich with correlated events from the same compound event window
        correlated = await self._get_correlated_events(str(event.event_id))
        for c in correlated:
            et = c.get("event_type", "")
            p = c.get("payload") or {}
            if et == "alarm_acknowledged":
                body_lines.append(
                    f"\n[DCS ALARM correlated] Tag: {p.get('alarm_tag', '?')} — {p.get('alarm_description', '')}"
                )
            elif et == "ptw_generated":
                body_lines.append(
                    f"\n[PTW correlated] ID: {p.get('ptw_id', '?')} | Isolation: {p.get('isolation_points', [])}"
                )
            elif et in ("shift_handover", "work_order_created"):
                body_lines.append(f"\n[{et.upper()} correlated] at {c.get('occurred_at', '?')}")

        confidence = _calc_confidence(graph_edges, vector_hits)

        return Brief(
            brief_id=str(uuid.uuid4()),
            trigger_event_id=event.event_id,
            trigger_event_type=event.event_type,
            asset_id=event.asset_id,
            work_order_id=event.work_order_id,
            recipient_user_id=event.assigned_technician_id or f"site-{event.site_id}",
            priority="normal",
            headline=headline,
            body="\n".join(body_lines),
            action_items=action_items,
            warnings=warnings,
            quarantine_flags=quarantine_flags,
            sources=sources,
            confidence=confidence,
        )

    # -------------------------------------------------------------------------
    # PTW brief
    # -------------------------------------------------------------------------

    async def assemble_ptw_brief(self, event: PTWEvent) -> Brief:
        topology_task = self._isolation_topology(event.asset_ids)
        reqs_task = self._ptw_regulatory_requirements(event.ptw_type)
        quarantine_task = asyncio.gather(
            *[self._get_quarantine(aid) for aid in event.asset_ids],
            return_exceptions=True,
        )

        results = await asyncio.gather(topology_task, reqs_task, quarantine_task, return_exceptions=True)
        topology, regulations, per_asset_quarantine = [
            r if not isinstance(r, Exception) else [] for r in results
        ]

        # Flatten quarantine flags across all assets in boundary
        quarantine_flags: List[str] = []
        for q_list in (per_asset_quarantine or []):
            if isinstance(q_list, list):
                quarantine_flags += [q["item_id"] for q in q_list if isinstance(q, dict)]

        sources = _sources_from_graph(topology)
        warnings = []
        if quarantine_flags:
            warnings.append(f"{len(quarantine_flags)} quarantine item(s) in isolation boundary — review before work")
        if regulations:
            warnings += [r.get("requirement_text", "") for r in regulations[:2]]

        body_lines = [
            f"PTW {event.ptw_id} | Type: {event.ptw_type} | Area: {event.work_area}",
            f"Isolation boundary: {', '.join(event.asset_ids)}",
        ]
        if topology:
            body_lines.append(f"\nGraph knowledge for boundary assets ({len(topology)} edges):")
            for e in topology[:5]:
                edge = e.get("edge", {})
                body_lines.append(f"  • {edge.get('relationship_type', '?')} | confidence={edge.get('confidence', '?')}")
        if regulations:
            body_lines.append(f"\nRegulatory requirements ({len(regulations)}):")
            for r in regulations[:3]:
                body_lines.append(f"  • [{r.get('clause_id', '?')}] {r.get('requirement_text', '')}")

        primary_asset = event.asset_ids[0] if event.asset_ids else None
        return Brief(
            brief_id=str(uuid.uuid4()),
            trigger_event_id=event.event_id,
            trigger_event_type=event.event_type,
            asset_id=primary_asset,
            ptw_id=event.ptw_id,
            recipient_user_id=event.issuing_engineer_id,
            priority="critical",
            headline=f"PTW {event.ptw_id} ({event.ptw_type.upper()}) — {len(event.asset_ids)} asset(s) in boundary",
            body="\n".join(body_lines),
            action_items=[
                "Verify all isolation points per PTW checklist",
                "Confirm no active quarantine deviations in boundary",
                "Sign and countersign before work commences",
            ],
            warnings=warnings,
            quarantine_flags=quarantine_flags,
            sources=sources,
            confidence=_calc_confidence(topology, []),
            requires_countersignature=True,
        )

    # -------------------------------------------------------------------------
    # Shift handover brief
    # -------------------------------------------------------------------------

    async def assemble_shift_handover_brief(self, event: ShiftHandoverEvent) -> Brief:
        open_wo_task = self._get_open_work_orders(event.site_id)
        active_alarms_task = self._get_active_alarms(event.site_id)
        conflicts_task = self._get_open_conflicts(None)  # site-wide

        results = await asyncio.gather(
            open_wo_task, active_alarms_task, conflicts_task, return_exceptions=True
        )
        open_wos, alarms, conflicts = [
            r if not isinstance(r, Exception) else [] for r in results
        ]

        warnings = [c["parameter"] for c in conflicts if isinstance(c, dict) and "parameter" in c]

        body_lines = [
            f"Shift handover at {event.handover_time} | Site: {event.site_id}",
            f"Outgoing: {event.outgoing_shift_lead_id} → Incoming: {event.incoming_shift_lead_id}",
        ]
        if open_wos:
            body_lines.append(f"\nOpen work orders ({len(open_wos)}):")
            for wo in open_wos[:5]:
                body_lines.append(f"  • {wo.get('event_id', '?')} — {wo.get('payload', {}).get('description', '')}")
        if alarms:
            body_lines.append(f"\nActive/recent alarms ({len(alarms)}):")
            for a in alarms[:5]:
                body_lines.append(f"  • {a.get('event_id', '?')} [{a.get('asset_id', '?')}]")
        if conflicts:
            body_lines.append(f"\nOpen knowledge conflicts ({len(conflicts)}) — review required")

        return Brief(
            brief_id=str(uuid.uuid4()),
            trigger_event_id=event.event_id,
            trigger_event_type=event.event_type,
            recipient_user_id=event.incoming_shift_lead_id,
            priority="high",
            headline=(
                f"Shift handover: {len(open_wos)} open WO(s), {len(alarms)} alarm(s), "
                f"{len(conflicts)} open conflict(s)"
            ),
            body="\n".join(body_lines),
            action_items=["Review open work orders", "Acknowledge active alarms", "Resolve open knowledge conflicts"],
            warnings=warnings,
            quarantine_flags=[],
            sources=[],
            confidence=0.9,
        )

    # -------------------------------------------------------------------------
    # Delivery — save to Supabase, publish to briefs Redis stream
    # -------------------------------------------------------------------------

    async def deliver(self, brief: Brief, redis) -> str:
        """
        Saves brief to Supabase and publishes to Redis briefs stream.
        Cool-down: if a brief for the same (recipient, asset) was delivered within
        the last 4 hours, skips delivery and returns the existing brief_id.
        PTW briefs (priority='critical') always bypass cool-down.
        """
        if brief.asset_id and brief.priority != "critical":
            cooldown_floor = (datetime.now(timezone.utc) - timedelta(hours=4)).isoformat()
            existing = await asyncio.to_thread(
                lambda: self.supabase.table("briefs")
                .select("brief_id")
                .eq("recipient_user_id", brief.recipient_user_id)
                .eq("asset_id", brief.asset_id)
                .gte("created_at", cooldown_floor)
                .limit(1)
                .execute()
            )
            if existing.data:
                prior_id = existing.data[0]["brief_id"]
                log.info(
                    "brief_engine.cooldown_suppressed",
                    asset_id=brief.asset_id,
                    recipient=brief.recipient_user_id,
                    prior_brief_id=prior_id,
                )
                return prior_id

        delivered_at = datetime.now(timezone.utc).isoformat()

        row = {
            "brief_id": brief.brief_id,
            "trigger_event_id": brief.trigger_event_id,
            "trigger_event_type": brief.trigger_event_type,
            "asset_id": brief.asset_id,
            "work_order_id": brief.work_order_id,
            "ptw_id": brief.ptw_id,
            "recipient_user_id": brief.recipient_user_id,
            "priority": brief.priority,
            "headline": brief.headline,
            "body": brief.body,
            "action_items": [ai for ai in brief.action_items],
            "warnings": brief.warnings,
            "quarantine_flags": brief.quarantine_flags,
            "sources": [s.model_dump() for s in brief.sources],
            "confidence": brief.confidence,
            "requires_countersignature": brief.requires_countersignature,
            "delivered_at": delivered_at,
        }
        await asyncio.to_thread(
            lambda: self.supabase.table("briefs").insert(row).execute()
        )

        bus = EventBusService(redis, self.settings)
        await bus.publish(self.settings.REDIS_STREAM_BRIEFS, {
            "brief_id": brief.brief_id,
            "recipient_user_id": brief.recipient_user_id,
            "priority": brief.priority,
            "trigger_event_id": brief.trigger_event_id,
            "trigger_event_type": brief.trigger_event_type,
            "headline": brief.headline,
        })

        briefs_delivered.add(1, {
            "priority": brief.priority,
            "trigger_event_type": brief.trigger_event_type,
        })
        log.info(
            "brief_engine.delivered",
            brief_id=brief.brief_id,
            recipient=brief.recipient_user_id,
            priority=brief.priority,
            trigger=brief.trigger_event_type,
        )
        return brief.brief_id

    # -------------------------------------------------------------------------
    # Private helpers
    # -------------------------------------------------------------------------

    async def _get_correlated_events(self, event_id: str) -> List[Dict[str, Any]]:
        """Fetches other events sharing the same compound_event_id."""
        try:
            row = await asyncio.to_thread(
                lambda: self.supabase.table("operational_events")
                .select("compound_event_id")
                .eq("event_id", event_id)
                .execute()
            )
            compound_id = row.data[0].get("compound_event_id") if row.data else None
            if not compound_id:
                return []
            corr = await asyncio.to_thread(
                lambda: self.supabase.table("operational_events")
                .select("event_type, payload, occurred_at")
                .eq("compound_event_id", compound_id)
                .neq("event_id", event_id)
                .execute()
            )
            return corr.data or []
        except Exception as e:
            log.warning("brief_engine.correlated_events_failed", error=str(e))
            return []

    async def _vector_search(self, query: str, asset_id: str) -> List[Dict[str, Any]]:
        try:
            vector = await self.llm.embed(query, task="retrieval.query")
            return await self.vector.search(
                self.settings.QDRANT_COLLECTION_KNOWLEDGE,
                vector,
                asset_id=asset_id,
                limit=5,
            )
        except Exception as e:
            log.warning("brief_engine.vector_search_failed", error=str(e))
            return []

    async def _get_quarantine(self, asset_id: str) -> List[Dict[str, Any]]:
        result = await asyncio.to_thread(
            lambda: self.supabase.table("quarantine_items")
            .select("item_id, source_document_id, review_status")
            .eq("asset_id", asset_id)
            .eq("review_status", "pending")
            .execute()
        )
        return result.data or []

    async def _get_open_conflicts(self, asset_id: Optional[str]) -> List[Dict[str, Any]]:
        query = self.supabase.table("knowledge_conflicts").select("conflict_id, parameter, track, severity").eq("status", "open")
        if asset_id:
            query = query.eq("asset_id", asset_id)
        result = await asyncio.to_thread(lambda: query.execute())
        return result.data or []

    async def _es_procedures(self, asset_id: str) -> List[Dict[str, Any]]:
        try:
            resp = await self.es.search(
                index=self.settings.ELASTICSEARCH_INDEX_DOCUMENTS,
                body={
                    "query": {"bool": {"must": [
                        {"term": {"asset_id": asset_id}},
                        {"term": {"document_type": "procedure"}},
                    ]}},
                    "_source": ["document_id", "title", "authority_level"],
                    "size": 5,
                },
            )
            return [h["_source"] for h in resp["hits"]["hits"]]
        except Exception as e:
            log.warning("brief_engine.es_procedures_failed", error=str(e))
            return []

    async def _isolation_topology(self, asset_ids: List[str]) -> List[Dict[str, Any]]:
        """Graph edges for all assets in the PTW isolation boundary."""
        edges: List[Dict[str, Any]] = []
        tasks = [self.graph.get_asset_knowledge_at(aid) for aid in asset_ids]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        for r in results:
            if isinstance(r, list):
                edges.extend(r)
        return edges

    async def _ptw_regulatory_requirements(self, ptw_type: str) -> List[Dict[str, Any]]:
        """Fetch relevant OISD_117 regulations for this PTW type from the graph."""
        cypher = """
        MATCH (reg:Concept {type: 'Regulation', framework: 'OISD_117'})
        RETURN reg.clause_id AS clause_id, reg.requirement_text AS requirement_text
        LIMIT 5
        """
        async with self.graph.driver.session(database=self.graph.database) as session:
            result = await session.run(cypher)
            return [dict(r) async for r in result]

    async def _get_open_work_orders(self, site_id: str) -> List[Dict[str, Any]]:
        result = await asyncio.to_thread(
            lambda: self.supabase.table("operational_events")
            .select("event_id, asset_id, payload, occurred_at")
            .eq("event_type", "work_order_created")
            .eq("site_id", site_id)
            .order("occurred_at", desc=True)
            .limit(10)
            .execute()
        )
        return result.data or []

    async def _get_active_alarms(self, site_id: str) -> List[Dict[str, Any]]:
        result = await asyncio.to_thread(
            lambda: self.supabase.table("operational_events")
            .select("event_id, asset_id, occurred_at")
            .eq("event_type", "alarm_acknowledged")
            .eq("site_id", site_id)
            .order("occurred_at", desc=True)
            .limit(10)
            .execute()
        )
        return result.data or []


# -------------------------------------------------------------------------
# Module-level helpers
# -------------------------------------------------------------------------

def _sources_from_graph(edges: List[Dict[str, Any]]) -> List[SourceCitation]:
    sources = []
    for e in edges:
        edge = e.get("edge", {})
        doc_id = edge.get("document_id")
        if not doc_id:
            continue
        sources.append(SourceCitation(
            document_id=doc_id,
            document_type=edge.get("document_type", "unknown"),
            title=doc_id,
            authority_level=edge.get("authority_level", 5),
            relevant_excerpt=edge.get("relationship_type", ""),
            is_quarantine=edge.get("verification_status") != "verified",
        ))
    return sources


def _sources_from_vector(hits: List[Dict[str, Any]]) -> List[SourceCitation]:
    sources = []
    for h in hits:
        p = h.get("payload", {})
        doc_id = p.get("document_id")
        if not doc_id:
            continue
        sources.append(SourceCitation(
            document_id=doc_id,
            document_type=p.get("document_type", "unknown"),
            title=p.get("title", doc_id),
            authority_level=p.get("authority_level", 5),
            relevant_excerpt=f"Semantic similarity score: {h.get('score', 0):.3f}",
            is_quarantine=p.get("is_quarantine", False),
        ))
    return sources


def _calc_confidence(graph_edges: List, vector_hits: List) -> float:
    if not graph_edges and not vector_hits:
        return 0.3
    verified = sum(
        1 for e in graph_edges
        if e.get("edge", {}).get("verification_status") == "verified"
    )
    if not graph_edges:
        return 0.6
    return min(0.5 + 0.1 * verified + 0.05 * min(len(vector_hits), 5), 0.95)

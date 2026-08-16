"""
P&ID element-by-element verification gate (Layer 3 → Layer 7) — no network, no Supabase.

Guards the gate the architecture calls non-negotiable: candidate topology must not be treated as
canonical until an engineer has confirmed it element by element. Before this, the endpoint returned
a hardcoded `"verification_status": "unverified"` string, so no reviewer action could ever change
what the drawing reported.
"""

from api.services.topology import SAFETY_CRITICAL_GROUPS, TopologyVerificationService

DOC = "DOC-PID-1"


class _Query:
    """Chainable stand-in for the supabase-py query builder."""

    def __init__(self, rows: list[dict], updates: list[dict]):
        self._rows, self._updates = rows, updates

    def select(self, *_a, **_kw):
        return self

    def eq(self, *_a):
        return self

    def neq(self, *_a):
        return self

    def insert(self, payload):
        self._updates.append(payload)
        return self

    def update(self, payload):
        self._updates.append(payload)
        return self

    def execute(self):
        return type("Result", (), {"data": self._rows})()


class FakeSupabase:
    def __init__(self, rows: list[dict]):
        self.rows = rows
        self.updates: list[dict] = []

    def table(self, _name: str):
        return _Query(self.rows, self.updates)


class RecordingGraph:
    def __init__(self):
        self.calls: list[dict] = []

    async def set_topology_element_verification(self, **kw):
        self.calls.append(kw)
        return 1


def _row(element_id: str, group: str, review_status: str = "pending") -> dict:
    return {
        "item_id": f"item-{element_id}",
        "review_status": review_status,
        "reviewer_id": None,
        "reviewed_at": None,
        "session_context": {
            "id": element_id,
            "element_group": group,
            "source_document_id": DOC,
        },
    }


async def test_unreviewed_drawing_is_unverified_and_not_canonical():
    sb = FakeSupabase([_row("XV-203", "isolation_boundaries"), _row("FT-3047", "instrumentation_loops")])
    svc = TopologyVerificationService(sb)
    summary = svc.summarize(await svc.element_statuses(DOC))

    assert summary["verification_status"] == "unverified"
    assert summary["canonical_ready"] is False


async def test_status_is_derived_per_element_not_per_document():
    """The bug this replaces: one document-level literal applied to every element."""
    sb = FakeSupabase([
        _row("XV-203", "isolation_boundaries", "promoted"),
        _row("FT-3047", "instrumentation_loops", "pending"),
        _row("PG-18", "isolation_valves", "disputed"),
    ])
    svc = TopologyVerificationService(sb)
    statuses = await svc.element_statuses(DOC)

    assert statuses["XV-203"]["verification_status"] == "verified"
    assert statuses["FT-3047"]["verification_status"] == "unverified"
    assert statuses["PG-18"]["verification_status"] == "disputed"


async def test_partial_confirmation_does_not_reach_canonical():
    sb = FakeSupabase([
        _row("XV-203", "isolation_boundaries", "promoted"),
        _row("FT-3047", "instrumentation_loops", "pending"),
    ])
    svc = TopologyVerificationService(sb)
    summary = svc.summarize(await svc.element_statuses(DOC))

    assert summary["verification_status"] == "partially_verified"
    assert summary["canonical_ready"] is False


async def test_all_safety_critical_confirmed_is_canonical_ready():
    sb = FakeSupabase([
        _row("XV-203", "isolation_boundaries", "promoted"),
        _row("FT-3047", "instrumentation_loops", "promoted"),
    ])
    svc = TopologyVerificationService(sb)
    summary = svc.summarize(await svc.element_statuses(DOC))

    assert summary["verification_status"] == "verified"
    assert summary["canonical_ready"] is True
    assert summary["safety_critical_verified"] == 2


async def test_a_single_disputed_element_blocks_canonical():
    """A drawing with a contested element is not canonical, however much else is confirmed."""
    sb = FakeSupabase([
        _row("XV-203", "isolation_boundaries", "promoted"),
        _row("FT-3047", "instrumentation_loops", "promoted"),
        _row("PG-18", "isolation_valves", "disputed"),
    ])
    svc = TopologyVerificationService(sb)
    summary = svc.summarize(await svc.element_statuses(DOC))

    assert summary["canonical_ready"] is False


async def test_confirming_an_element_promotes_its_existing_graph_edge():
    sb = FakeSupabase([_row("XV-203", "isolation_boundaries")])
    graph = RecordingGraph()
    svc = TopologyVerificationService(sb, graph)

    result = await svc.verify_elements(
        DOC, [{"element_id": "XV-203", "decision": "confirmed"}], reviewer_id="eng-1"
    )

    assert result["applied"] == ["XV-203"]
    assert graph.calls[0]["verification_status"] == "verified"
    assert graph.calls[0]["verified_by"] == "eng-1"
    assert sb.updates[0]["review_status"] == "promoted"


async def test_rejecting_an_element_marks_it_disputed_not_verified():
    sb = FakeSupabase([_row("XV-203", "isolation_boundaries")])
    graph = RecordingGraph()
    svc = TopologyVerificationService(sb, graph)

    await svc.verify_elements(
        DOC, [{"element_id": "XV-203", "decision": "rejected"}], reviewer_id="eng-1"
    )

    assert sb.updates[0]["review_status"] == "disputed"
    assert graph.calls[0]["verification_status"] == "disputed"


async def test_unknown_element_is_reported_not_silently_applied():
    sb = FakeSupabase([_row("XV-203", "isolation_boundaries")])
    svc = TopologyVerificationService(sb, RecordingGraph())

    result = await svc.verify_elements(
        DOC, [{"element_id": "GHOST-1", "decision": "confirmed"}], reviewer_id="eng-1"
    )

    assert result["applied"] == []
    assert result["unknown_elements"] == ["GHOST-1"]


async def test_graph_failure_does_not_lose_the_human_decision():
    class BrokenGraph:
        async def set_topology_element_verification(self, **_kw):
            raise RuntimeError("neo4j unreachable")

    sb = FakeSupabase([_row("XV-203", "isolation_boundaries")])
    svc = TopologyVerificationService(sb, BrokenGraph())

    result = await svc.verify_elements(
        DOC, [{"element_id": "XV-203", "decision": "confirmed"}], reviewer_id="eng-1"
    )

    assert result["applied"] == ["XV-203"]
    assert sb.updates[0]["review_status"] == "promoted"


def test_safety_critical_groups_match_the_architecture():
    assert SAFETY_CRITICAL_GROUPS == {"isolation_boundaries", "instrumentation_loops"}


async def test_manifest_row_is_excluded_but_element_rows_are_not():
    """
    Regression: the manifest used to be filtered with
    `.neq("session_context->>element_type", "topology_manifest")`. Element rows carry no
    `element_type` key, so that compared against SQL NULL — which is NULL, not TRUE — and
    PostgREST dropped *every element row*. Live drawings reported `elements_total: 0` while
    plainly having elements, and no Confirm action could ever match an element id.

    The manifest must be excluded; the elements must survive.
    """
    manifest = {
        "item_id": "manifest",
        "review_status": "pending",
        "reviewer_id": None,
        "reviewed_at": None,
        "session_context": {
            "source_document_id": DOC,
            "element_type": "topology_manifest",
            "topology": {},
        },
    }
    sb = FakeSupabase([manifest, _row("XV-203", "isolation_boundaries"), _row("FT-3047", "instrumentation_loops")])
    statuses = await TopologyVerificationService(sb).element_statuses(DOC)

    assert set(statuses) == {"XV-203", "FT-3047"}
    assert "manifest" not in statuses

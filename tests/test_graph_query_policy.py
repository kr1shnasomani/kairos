"""Graph query policy — ARCHITECTURE.md §7.

The section's failing mode is a temporal graph query that plans as a scan or walks unbounded.
`scripts/verify_graph_perf.py` covers plan shape and needs a live Neo4j; this covers the part
that can be enforced statically, so an unbounded traversal cannot reach a review.

Pure source inspection. No stack, no secrets, no network.
"""

import re

import pytest

from api.services import graph as graph_module

SOURCE = __import__("inspect").getsource(graph_module)

# `[:REL*` with no upper bound. An upper bound is required, and it may be a literal (`*1..10`)
# or the interpolated policy constant (`*1..{MAX_TRAVERSAL_DEPTH}`) — hence `(\d|\{)`.
_UNBOUNDED = re.compile(r"\[:[A-Z_|]+\*(?!\d*\.\.(?:\d|\{))")


def test_no_unbounded_variable_length_traversal():
    """An unbounded `*` on a temporal graph is the pathological case §7 is written about:
    it makes the planner's work a function of graph size rather than query scope."""
    offenders = _UNBOUNDED.findall(SOURCE)
    assert not offenders, (
        f"unbounded variable-length traversal(s) in graph.py: {offenders} — "
        f"bound them with MAX_TRAVERSAL_DEPTH"
    )


def test_traversal_depth_comes_from_the_policy_constant():
    """A literal depth inlined per query is not a policy — the next traversal added would pick
    its own number and nothing would notice."""
    assert isinstance(graph_module.MAX_TRAVERSAL_DEPTH, int)
    assert 1 <= graph_module.MAX_TRAVERSAL_DEPTH <= 25, "a depth this large is not a bound"
    assert f"*1..{graph_module.MAX_TRAVERSAL_DEPTH}" not in SOURCE.replace(
        "{MAX_TRAVERSAL_DEPTH}", "SENTINEL"
    ), "depth is hardcoded inline; interpolate MAX_TRAVERSAL_DEPTH instead"


@pytest.mark.parametrize(
    "pattern",
    [
        r"\[:[A-Z_|]+\*1\.\.\{MAX_TRAVERSAL_DEPTH\}\]",  # the interpolated form
    ],
)
def test_the_bounded_traversal_is_present(pattern):
    assert re.search(pattern, SOURCE), "expected the depth-bounded PARENT_OF traversal"


def test_blast_radius_is_row_capped():
    """Blast radius is not anchored on an indexed node, so its ceiling is a LIMIT. Without one a
    contaminated document could return the whole edge set."""
    assert "LIMIT 500" in SOURCE, "blast-radius query must stay row-capped"

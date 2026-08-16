"""
Cross-source timestamp alignment (Layer 4) — pure logic, no network, no Supabase.

The trap this guards against is in what gets compared. Comparing `occurred_at` against
`ingested_at` would flag essentially every document in the golden corpus — those values sit months
apart by design for historical records — and bury real clock skew under thousands of false
positives. Drift means *the same correlated event reported by two different source systems at two
different times*, and nothing else.
"""

from api.services.timestamp_alignment import TimestampAlignmentService as TAS

TOLERANCE = 60


def _ev(source: str, ts: str, event_id: str = "e1") -> dict:
    return {"event_id": event_id, "source_system": source, "occurred_at": ts}


def test_two_systems_agreeing_is_not_drift():
    r = TAS.analyse(
        [_ev("sap_pm", "2026-07-15T08:00:00Z"), _ev("cmms", "2026-07-15T08:05:00Z", "e2")],
        TOLERANCE,
    )
    assert r["drift_detected"] is False
    assert r["drift_minutes"] == 5.0


def test_four_hour_skew_between_systems_is_drift():
    """The architecture's own example: SAP PM four hours ahead of the maintenance log."""
    r = TAS.analyse(
        [_ev("sap_pm", "2026-07-15T12:00:00Z"), _ev("cmms", "2026-07-15T08:00:00Z", "e2")],
        TOLERANCE,
    )
    assert r["drift_detected"] is True
    assert r["drift_minutes"] == 240.0
    assert r["reason"] == "cross_system_drift"


def test_same_source_at_different_times_is_not_drift():
    """
    Two events from one system are two events, not one event with clock skew. Counting them
    would manufacture drift out of ordinary event volume.
    """
    r = TAS.analyse(
        [_ev("cmms", "2026-07-15T08:00:00Z"), _ev("cmms", "2026-07-15T20:00:00Z", "e2")],
        TOLERANCE,
    )
    assert r["drift_detected"] is False
    assert r["reason"] == "single_source"


def test_single_event_cannot_drift():
    r = TAS.analyse([_ev("sap_pm", "2026-07-15T08:00:00Z")], TOLERANCE)
    assert r["drift_detected"] is False
    assert r["reason"] == "single_source"


def test_normalises_to_the_best_synchronised_clock():
    """The historian is the site-canonical reference — the most precisely clock-synced system."""
    r = TAS.analyse(
        [
            _ev("cmms", "2026-07-15T12:00:00Z"),
            _ev("historian", "2026-07-15T08:00:00Z", "e2"),
            _ev("email_archive", "2026-07-15T14:00:00Z", "e3"),
        ],
        TOLERANCE,
    )
    assert r["canonical_source"] == "historian"
    assert r["canonical_timestamp"].startswith("2026-07-15T08:00:00")


def test_unparseable_timestamps_are_skipped_not_treated_as_zero():
    """A bad timestamp read as epoch-zero would report ~56 years of drift."""
    r = TAS.analyse(
        [_ev("sap_pm", "not-a-timestamp"), _ev("cmms", "2026-07-15T08:00:00Z", "e2")],
        TOLERANCE,
    )
    assert r["drift_detected"] is False
    assert r["reason"] == "single_source"  # only one usable source remained


def test_no_usable_timestamps_reports_cleanly():
    r = TAS.analyse([_ev("sap_pm", ""), _ev("cmms", None, "e2")], TOLERANCE)
    assert r["drift_detected"] is False
    assert r["reason"] == "no_usable_timestamps"
    assert r["canonical_timestamp"] is None


def test_tolerance_is_configurable():
    events = [_ev("sap_pm", "2026-07-15T09:30:00Z"), _ev("cmms", "2026-07-15T08:00:00Z", "e2")]
    assert TAS.analyse(events, tolerance_minutes=60)["drift_detected"] is True
    assert TAS.analyse(events, tolerance_minutes=120)["drift_detected"] is False


def test_widest_pair_wins_across_three_systems():
    r = TAS.analyse(
        [
            _ev("historian", "2026-07-15T08:00:00Z"),
            _ev("cmms", "2026-07-15T08:30:00Z", "e2"),
            _ev("email_archive", "2026-07-15T11:00:00Z", "e3"),
        ],
        TOLERANCE,
    )
    assert r["drift_minutes"] == 180.0
    assert r["drift_detected"] is True

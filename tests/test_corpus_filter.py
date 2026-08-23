"""
Service-free tests for `api/services/corpus.py` — the test-artifact predicate shared by
`GET /assets/{id}/knowledge` and `benchmark/run_kg_completeness.py`.

The dangerous direction here is OVER-matching. This filter never deletes anything, but a
pattern that swallows a real corpus file name makes genuine evidence invisible in the graph
view, and an invisible fact is indistinguishable from an absent one. The real corpus names are
pinned below so widening the regex fails loudly.
"""

import pytest

from api.services.corpus import is_test_artifact, partition_test_artifacts

# Every real name in the golden corpus that the filter must NEVER match. Taken from the live
# vault on 2026-08-23 (23 active corpus documents).
REAL_CORPUS_NAMES = [
    "sop_he_301_isolation.pdf",
    "oem_manual_eq1xx_seal.pdf",
    "oem_bulletin_fp_sb_2025_04.pdf",
    "insp_v247_2025_11.pdf",
    "ptw_v247.pdf",
    "pid_line3_isolation_boundary.png",
    "shift_log.txt",
    "work_order_closeout_form.pdf",
    "work_orders_eq101_family.csv",
    "regulatory_clause_excerpts.pdf",
    "handwritten_shift_log.png",
    "scanned_inspection_degraded.png",
]

# Names the suite and hand-run sweeps actually wrote, observed live in the vault.
TEST_ARTIFACT_NAMES = [
    "ann_test_1252F91A.txt",
    "dbtest_01869BC0.txt",
    "test_04F1EF6B.txt",
    "probe_scratch.txt",
    "tmp_upload.txt",
    "# Kairos scratch.md",
    # Added by decision D8 (2026-08-23). Both name a file after this system or its harness,
    # never after plant equipment; neither appears in dataset_manifest.csv.
    "e2e_shift_log.txt",
    "kairos_ingest_test.pdf",
]


@pytest.mark.parametrize("name", REAL_CORPUS_NAMES)
def test_real_corpus_documents_are_never_filtered(name):
    assert is_test_artifact(name) is False, (
        f"{name!r} is real corpus evidence. Matching it here hides it from the graph view, "
        "which is the one failure mode this filter must not have."
    )


@pytest.mark.parametrize("name", TEST_ARTIFACT_NAMES)
def test_known_test_artifacts_are_filtered(name):
    assert is_test_artifact(name) is True


def test_matches_are_anchored_at_the_start():
    """`test_` mid-name is a real word, not a prefix — `pressure_test_report.pdf` is evidence."""
    assert is_test_artifact("pressure_test_report.pdf") is False
    assert is_test_artifact("insp_dbtest_note.pdf") is False


@pytest.mark.parametrize("name", ["hydro_test.pdf", "pressure_test.pdf", "insp_he301_test.pdf"])
def test_a_test_stem_does_not_make_a_document_an_artifact(name):
    """D8 rejected a `_test.ext` stem rule for exactly these. A hydrostatic test report is plant
    evidence; matching it would hide real knowledge, which is worse than leaving noise visible."""
    assert is_test_artifact(name) is False


def test_case_is_ignored():
    assert is_test_artifact("TEST_ABC.txt") is True
    assert is_test_artifact("DBTest_01.txt") is True


def test_missing_or_empty_file_name_is_not_an_artifact():
    """Unclassifiable is not disposable — see the module docstring."""
    assert is_test_artifact(None) is False
    assert is_test_artifact("") is False


def test_partition_returns_only_matching_ids():
    rows = [
        {"document_id": "DOC-REAL", "file_name": "ptw_v247.pdf"},
        {"document_id": "DOC-FAKE", "file_name": "test_9B4CB0DA.txt"},
        {"document_id": "DOC-NONAME", "file_name": None},
    ]
    assert partition_test_artifacts(rows) == {"DOC-FAKE"}


def test_partition_skips_rows_without_an_id():
    rows = [{"file_name": "test_abc.txt"}, {"document_id": "", "file_name": "test_def.txt"}]
    assert partition_test_artifacts(rows) == set()


def test_promoted_ids_are_never_classifiable_as_artifacts():
    """`PROMOTED-<uuid>` has no vault row at all, so it can never appear in a lookup result —
    which is exactly why an id absent from `documents` must be kept, not dropped."""
    rows = [{"document_id": "PROMOTED-f17b1416", "file_name": None}]
    assert partition_test_artifacts(rows) == set()

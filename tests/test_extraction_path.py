"""
Extraction-path flagging (Layer 3) — no network, no Supabase.

The architecture wants handwritten content marked with "lower initial confidence scores, flagged
explicitly in the extraction output". The flag is the requirement; the score change is not — and
scaling `overall_confidence` down would push image-path extractions under the `< 0.7` quarantine
threshold, silently moving real facts out of the canonical graph. That is a retrieval regression
dressed up as a safeguard, and the golden dataset's handwritten inspection note and shift log are
exactly what it would have hit.

So: a separate field, and confidence left alone.
"""

import asyncio

from api.services.ocr import OCRService

QUARANTINE_THRESHOLD = 0.7


def _extract(data: bytes, mime: str) -> dict:
    return asyncio.run(OCRService().extract_text(data, mime_type=mime))


def test_plain_text_is_native_and_not_handwriting_suspect():
    r = _extract(b"Pump P-101 seal replaced on 2026-03-04.", "text/plain")
    assert r["extraction_path"] == "native"
    assert r["handwriting_suspect"] is False


def test_native_paths_stay_well_above_the_quarantine_threshold():
    r = _extract(b"Inspection complete. No abnormal vibration.", "text/plain")
    assert r["overall_confidence"] > QUARANTINE_THRESHOLD


def test_unreadable_input_reports_unknown_path_not_a_false_native():
    """An error envelope must not claim it parsed digital text."""
    r = _extract(b"", "application/vnd.ms-excel")
    assert r["extraction_path"] == "unknown"
    assert r["handwriting_suspect"] is False


def test_every_envelope_carries_the_flag():
    """
    Guards the failure mode where one return path forgets the field and a consumer reading
    `result["extraction_path"]` raises KeyError only on the rare branch.
    """
    for data, mime in [
        (b"text", "text/plain"),
        (b"", "application/vnd.ms-excel"),
        (b"", "message/rfc822"),
    ]:
        r = _extract(data, mime)
        assert "extraction_path" in r, mime
        assert "handwriting_suspect" in r, mime
        assert r["extraction_path"] in {"native", "ocr", "unknown"}, mime


def test_flag_is_independent_of_confidence():
    """
    The whole point: the marker carries the signal, so downstream can surface a
    handwriting-suspect badge without the quarantine gate moving underneath it.
    """
    r = _extract(b"Shift log entry", "text/plain")
    assert r["handwriting_suspect"] is False
    assert r["overall_confidence"] == 1.0  # untouched by the flagging change


def _vault_doc(file_name: str, mime_type: str, document_type: str):
    from api.models.document import VaultDocument
    return VaultDocument(
        document_id="D-1", sha256_hash="x" * 64, file_name=file_name, file_size_bytes=10,
        mime_type=mime_type, document_type=document_type, authority_level=3,
        source_system="test", ingested_at="2026-08-16T00:00:00Z", ingested_by="test",
        status="active",
    )


def test_handwritten_image_documents_are_flagged():
    for dt in ("shift_log", "inspection_report"):
        d = _vault_doc("handwritten_note.png", "image/png", dt)
        assert d.extraction_path == "ocr"
        assert d.handwriting_suspect is True, dt


def test_engineering_drawings_are_not_handwriting_suspect():
    """
    A P&ID is an image and takes the vision path, but carries no handwriting. Flagging it would
    put a caution badge on every drawing in the vault and teach reviewers to ignore the badge.
    Caught on live data — both were PNGs, so the naive mime-only rule flagged the drawing too.
    """
    d = _vault_doc("pid_line3.png", "image/png", "pid_drawing")
    assert d.extraction_path == "ocr"      # it did come off an image
    assert d.handwriting_suspect is False  # but it is not handwriting


def test_digital_documents_are_native_and_unflagged():
    d = _vault_doc("manual.pdf", "application/pdf", "oem_manual")
    assert d.extraction_path == "native"
    assert d.handwriting_suspect is False

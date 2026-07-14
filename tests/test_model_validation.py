"""Layer-0 NER model-gate scoring — pure logic, no network.

Guards the partial (span-overlap) matcher that decides entity-F1 true positives: a model that
predicts a broader span ("FISCHER PUMPS LTD.") must still credit the ground-truth entity ("Fischer"),
while a stray short token ("18") must not spuriously match a longer tag ("PG-18").
"""

from workers.model_validation import _span_match


def test_exact_match():
    assert _span_match("EQ-101", "eq-101")            # case-insensitive exact


def test_prediction_wider_than_ground_truth():
    assert _span_match("FISCHER PUMPS LTD.", "fischer")          # gt contained in prediction
    assert _span_match("MERIDIAN HEAT TRANSFER SYSTEMS", "meridian")


def test_ground_truth_wider_than_prediction():
    assert _span_match("Ananya", "ananya iyer")       # prediction contained in gt (>=4 chars)


def test_short_token_does_not_spuriously_match():
    assert not _span_match("18", "pg-18")             # 2-char overlap must not match
    assert not _span_match("EQ", "eq-101")            # 2-char overlap must not match


def test_no_overlap():
    assert not _span_match("XV-203", "eq-101")
    assert not _span_match("", "eq-101")              # empty prediction never matches

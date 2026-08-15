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


# --- Model-gate wiring -------------------------------------------------------------
# Regression: NERService() took no model argument, so run_model_validation.py's
# --model-name (and the Celery gate's model_name) only *labelled* the result — the call
# always used NVIDIA_NIM_NER_MODEL. The gate reported an authoritative-looking F1
# attributed to a model it never invoked, and when the configured model was unreachable it
# scored the regex fallback instead.

def test_ner_service_honours_explicit_model():
    from api.services.ner import NERService

    svc = NERService(model="meta/llama-3.2-11b-vision-instruct")
    assert svc._nim_model == "meta/llama-3.2-11b-vision-instruct"


def test_ner_service_falls_back_to_env_model(monkeypatch):
    from api.services.ner import NERService

    monkeypatch.setenv("NVIDIA_NIM_NER_MODEL", "some/other-model")
    assert NERService()._nim_model == "some/other-model"


def test_model_gate_passes_its_model_to_the_ner_service():
    """The gate must score the model it was asked about, not whatever the env holds."""
    import inspect

    from scripts import run_model_validation
    from workers import model_validation

    for module in (run_model_validation, model_validation):
        src = inspect.getsource(module)
        assert "NERService(model=model_name)" in src, (
            f"{module.__name__} must construct NERService with the requested model"
        )

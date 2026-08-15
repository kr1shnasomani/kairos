"""Safety-critical query classification + refusal gate (services/llm.py).

These guard the gate that was previously unreachable: nothing in the system set
query_category, so SAFETY_CRITICAL_CATEGORIES never fired. Pure logic, no services.
"""

import pytest

from api.services.llm import SAFETY_CRITICAL_CATEGORIES, LLMService

classify = LLMService.classify_query_category


@pytest.mark.parametrize(
    "query,expected",
    [
        ("What is the maximum allowable pressure for HE-301?", "max_allowable_pressure"),
        ("MAWP for the pressure vessel?", "max_allowable_pressure"),
        ("current max operating pressure engineering value", "max_allowable_pressure"),
        ("What is the PSV set pressure on V-247?", "pressure_relief_setting"),
        ("relief valve setting for the vessel", "pressure_relief_setting"),
        ("Which valves make up the isolation boundary for V-247?", "isolation_interlock_sequence"),
        ("lockout tagout sequence for the feed pump", "isolation_interlock_sequence"),
        ("Which valve is the primary safety isolation valve for V-247?", "isolation_interlock_sequence"),
        ("flange bolt torque specification", "torque_specification"),
        ("motor insulation class for EQ-102", "electrical_rating"),
        ("emergency shutdown setpoint for the compressor", "safety_shutdown_setpoint"),
    ],
)
def test_safety_critical_queries_are_classified(query, expected):
    assert classify(query) == expected
    assert expected in SAFETY_CRITICAL_CATEGORIES


@pytest.mark.parametrize(
    "query",
    [
        "What are the known aliases for pump EQ-101?",
        "Which field technician worked on the seal repair?",
        "How many mechanical seal failures has EQ-101 had?",
        "Which OEM manufactures the HE-3xx heat exchangers?",
        # Regression (benchmark Q06): the equipment is *named* "isolation valve", but the
        # question asks a date. Bare "isolation" used to match and refuse it, hiding a fact
        # the vault holds. Refusing a lookup is as wrong as guessing a parameter.
        "When was isolation valve XV-203 last inspected?",
        "Which work order documents the isolation valve replacement?",
    ],
)
def test_non_safety_queries_are_not_classified(query):
    assert classify(query) is None


def test_relief_setting_wins_over_generic_pressure():
    """Ordering guard: 'relief set pressure' contains 'pressure' but is not MAWP."""
    assert classify("relief valve set pressure on the separator") == "pressure_relief_setting"


async def test_refuses_safety_query_on_unauthoritative_evidence(settings_fixture=None):
    """Only field-observation evidence (level 5) -> refuse, do not answer."""
    from api.config import settings

    llm = LLMService(settings)
    result = await llm.synthesize(
        query="max allowable pressure for HE-301",
        retrieved_context=[{"document_id": "QN-1", "text": "operator thinks ~20 bar", "authority_level": 5}],
        query_category="max_allowable_pressure",
    )
    assert result["refused"] is True
    assert result["answer"] is None
    assert result["sources"], "refusal must still return the sources for direct verification"


async def test_authoritative_evidence_clears_the_gate(monkeypatch):
    """
    OEM-authority evidence (level 3) must not be refused just for lacking a `confidence`
    field — hybrid search and graph facts carry authority_level, not confidence, so a
    confidence-only gate would refuse every safety query. Cascade stubbed: this asserts
    the gate opened, not what the model said.
    """
    from api.config import settings

    llm = LLMService(settings)
    monkeypatch.setattr(
        llm, "_synthesize_cascade", lambda prompt, ctx: _answer({"answer": "MAWP is 24 bar", "sources": ctx})
    )
    result = await llm.synthesize(
        query="max allowable pressure for HE-301",
        retrieved_context=[{"document_id": "OEM-1", "text": "MAWP 24 bar", "authority_level": 3}],
        query_category="max_allowable_pressure",
    )
    assert not result.get("refused")
    assert result.get("refusal_reason") is None
    assert result["answer"] == "MAWP is 24 bar"


async def _answer(payload):
    return payload


# --- Provider cascade: exhausted quota must not look like a wrong answer ------------
# Repeated benchmark runs exhausted the Gemini free tier; every NIM timeout then became a
# silent no-answer, dragging measured answer quality from 24/25 to 13/25. A 429 is an
# operational limit with a fix, so it must be labelled as one.

async def test_all_providers_rate_limited_reports_the_reason(monkeypatch):
    from api.config import settings

    llm = LLMService(settings)
    monkeypatch.setattr(LLMService, "nim_available", property(lambda self: True))
    monkeypatch.setattr(LLMService, "openrouter_available", property(lambda self: True))
    monkeypatch.setattr(LLMService, "gemini_available", property(lambda self: True))
    monkeypatch.setattr(LLMService, "ollama_available", property(lambda self: False))

    def limited(provider):
        async def _fn(prompt, context):
            return {"answer": None, "error": "429", "sources": context,
                    "rate_limited": True, "failed_provider": provider}
        return _fn

    monkeypatch.setattr(llm, "_synthesize_nim", limited("nim"))
    # Every configured tier must be stubbed. When OpenRouter was added this test still passed a
    # real key through `openrouter_available`, so the cascade made a live call and got an answer —
    # failing the assertion *and* putting a network round-trip inside the service-free suite, which
    # is specified to run with no secrets and no network. Add a stub here for any new tier.
    monkeypatch.setattr(llm, "_synthesize_openrouter", limited("openrouter"))
    monkeypatch.setattr(llm, "_synthesize_gemini", limited("gemini"))

    result = await llm.synthesize(query="seal part number for EQ-101", retrieved_context=[
        {"document_id": "OEM-1", "text": "P/N MS-4471-B", "authority_level": 3}
    ])

    assert result["answer"] is None
    assert result["rate_limited"] is True
    assert "quota exhausted" in result["message"]
    assert all(p in result["message"] for p in ("nim", "openrouter", "gemini"))
    assert "not a knowledge gap" in result["message"]


async def test_ordinary_failure_is_not_reported_as_rate_limited(monkeypatch):
    """A timeout or 500 must not be mislabelled as a quota problem."""
    from api.config import settings

    llm = LLMService(settings)
    monkeypatch.setattr(LLMService, "nim_available", property(lambda self: True))
    # Disabled explicitly: a real OPENROUTER_API_KEY in the environment would otherwise make this
    # reach the network. It would still pass (an answer sets neither flag), which is worse — a
    # silently network-dependent test in the suite that is meant to have none.
    monkeypatch.setattr(LLMService, "openrouter_available", property(lambda self: False))
    monkeypatch.setattr(LLMService, "gemini_available", property(lambda self: False))
    monkeypatch.setattr(LLMService, "ollama_available", property(lambda self: False))

    async def timed_out(prompt, context):
        return {"answer": None, "error": "ReadTimeout", "sources": context,
                "rate_limited": False, "failed_provider": "nim"}

    monkeypatch.setattr(llm, "_synthesize_nim", timed_out)
    result = await llm.synthesize(query="seal part number", retrieved_context=[
        {"document_id": "OEM-1", "text": "x", "authority_level": 3}
    ])
    assert not result.get("rate_limited")
    assert not result.get("message")


# --- Safety gate: authority must come from RELEVANT evidence -------------------------
# Found by manual QA 2026-08-15. The gate took min(authority_level) over the whole retrieved
# context, so one unrelated authoritative document anywhere in it cleared a safety-critical
# refusal. In the live copilot that was the normal case (top-6 hybrid hits nearly always include
# an L1 regulation), so the gate almost never fired.

async def _synth(llm, query, context):
    return await llm.synthesize(query=query, retrieved_context=context,
                                query_category="isolation_interlock_sequence")


async def test_offtopic_authoritative_source_no_longer_clears_the_gate(monkeypatch):
    """An OEM bulletin for a DIFFERENT asset must not vouch for this one.

    Measured on the real corpus: asking for V-247's isolation boundary retrieved two Fischer
    L3 bulletins about EQ-101 pump seals, ranked 3rd/4th by relevance. They cleared the gate.
    """
    from api.config import settings

    llm = LLMService(settings)
    monkeypatch.setattr(llm, "_synthesize_cascade", lambda prompt, ctx: _answer({"answer": "x", "sources": ctx}))

    ctx = [
        {"document_id": "DOC-PTW", "text": "permit to work V-247", "authority_level": 4,
         "relevance_score": 0.0325, "asset_id": "V-247"},
        {"document_id": "DOC-FISCHER", "text": "EQ-1xx seal bulletin", "authority_level": 3,
         "relevance_score": 0.0313, "asset_id": "EQ-101"},
        {"document_id": "DOC-REGREF", "text": "standards index", "authority_level": 1,
         "relevance_score": 0.0156, "asset_id": None},
    ]
    result = await _synth(llm, "isolation boundary for V-247", ctx)
    assert result.get("refused") is True


async def test_on_topic_authoritative_source_still_clears_the_gate(monkeypatch):
    """The gate must not become a blanket refusal — that is why the authority arm exists.
    An OEM bulletin for the SAME asset is exactly the evidence it should accept."""
    from api.config import settings

    llm = LLMService(settings)
    monkeypatch.setattr(llm, "_synthesize_cascade", lambda prompt, ctx: _answer({"answer": "x", "sources": ctx}))

    ctx = [
        {"document_id": "DOC-OEM", "text": "HE-3xx max operating pressure 16.2 bar", "authority_level": 3,
         "relevance_score": 0.033, "asset_id": "HE-301"},
        {"document_id": "DOC-SOP", "text": "site procedure", "authority_level": 4,
         "relevance_score": 0.031, "asset_id": "HE-301"},
    ]
    result = await _synth(llm, "maximum allowable pressure for HE-301", ctx)
    assert not result.get("refused")


async def test_context_without_relevance_scores_keeps_previous_behaviour(monkeypatch):
    """Hand-assembled context (graph facts, elicitation) carries no scores; do not silently
    change refusal behaviour for callers that never knew to send them."""
    from api.config import settings

    llm = LLMService(settings)
    monkeypatch.setattr(llm, "_synthesize_cascade", lambda prompt, ctx: _answer({"answer": "x", "sources": ctx}))

    ctx = [{"document_id": "DOC-SOP", "text": "site procedure", "authority_level": 4},
           {"document_id": "DOC-REG", "text": "regulation", "authority_level": 1}]
    result = await _synth(llm, "isolation boundary for V-247", ctx)
    assert not result.get("refused")

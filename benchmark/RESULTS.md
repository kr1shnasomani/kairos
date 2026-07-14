# KAIROS — Benchmark Results

Raw output of the three evaluation scripts. **Measured 2026-07-14** on the live stack (golden dataset
loaded; cloud models: NVIDIA NIM `llama-3.1-70b` synthesis · `ministral-14b` NER · Jina · Groq).
Methodology, interpretation, and the reasoning behind the answer misses live in
[`../docs/BENCHMARKS.md`](../docs/BENCHMARKS.md).

## 1. `verify_layers.py` — per-layer smoke + latency

```
  KAIROS — Layer Verification
  ==============================================================================
  LAYER                 CHECK                                 STATUS      ms
  ------------------------------------------------------------------------------
  Auth                  POST /auth/login                      PASS         0   token ok
  L0 Validation         GET /governance/validation-corpus/stats PASS     289   HTTP 200
  L1 MDM                GET /assets                           PASS        19   HTTP 200
  L2 Vault              GET /documents                        PASS        95   HTTP 200
  L4 Graph              GET /governance/circuit-breaker       PASS        68   HTTP 200
  L5 OT (mock)          GET /ot/query (go connector)          PASS         9   HTTP 200
  L6 Quarantine         GET /governance/quarantine            PASS       165   HTTP 200
  L7 Governance         GET /governance/conflicts             PASS       157   HTTP 200
  L8 Events/Briefs      GET /briefs                           PASS       124   HTTP 200
  L9 Elicitation        GET /elicitation/offboarding          PASS       123   HTTP 200
  L11 Retrieval         GET /search                           PASS      1395   HTTP 200
  L12 Frontend          GET / (frontend)                      PASS       276   HTTP 200
  Datastores            GET /health/detailed                  PASS        15   HTTP 200
  ------------------------------------------------------------------------------
  13/13 checks passed
```

## 2. `run_benchmark.py` — domain-expert Q&A (25 questions)

```
  KAIROS — Domain Benchmark  (25 questions)
  ====================================================================================
  ID   QUESTION                                      RETR    CORRECT SRC  VIA          ms
  ------------------------------------------------------------------------------------
  Q01  What mechanical seal part number should be u  HIT     YES     ✓    nim        7553
  Q02  What failure mode precedes mechanical seal f  HIT     YES     ✓    nim        7558
  Q03  Which OEM bulletin revised the seal part num  HIT     YES     ✓    nim        7894
  Q04  What is the current maximum operating pressu  HIT     YES     ✓    nim       28158
  Q05  Which OEM manufactures the HE-3xx heat excha  HIT     no      ✓    nim       10617
  Q06  When was isolation valve XV-203 last inspect  HIT     YES     ✓    nim        8167
  Q07  Which valves make up the isolation boundary   HIT     YES     ✓    nim        8741
  Q08  What are the known aliases for pump EQ-101?   HIT     YES     ✓    gemini    48162
  Q09  How many mechanical seal failures has EQ-101  HIT     no      ✓    nim        9485
  Q10  Was the EQ-102 electrical insulation fault t  HIT     YES     ✓    nim       21989
  Q11  Which site operating procedures reference th  HIT     YES     ✓    nim        7185
  Q12  What regulatory standards apply to this petr  HIT     YES     ✓    nim       12412
  Q13  What seal part number was used for EQ-101 be  HIT     YES     ✓    nim       37278
  Q14  In the May 2025 EQ-101 seal repair, was the   HIT     YES     ✓    nim        4414
  Q15  Which field technician is associated with th  HIT     YES     ✓    nim        3168
  Q16  Which OEM manufactures the feed pumps at the  HIT     YES     ✓    nim        3183
  Q17  Which earlier bulletin did the Meridian pres  HIT     YES     ✓    nim       36463
  Q18  What equipment class does asset EQ-101 belon  HIT     YES     ✓    nim        8998
  Q19  Which valve is the primary safety isolation   HIT     YES     ✓    nim       24095
  Q20  What are the known aliases for pump EQ-102?   HIT     YES     ✓    nim        8346
  Q21  What was the maximum operating pressure for   HIT     YES     ✓    nim        3867
  Q22  Does the EQ-102 electrical fault reduce conf  HIT     YES     ✓    nim       10586
  Q23  Which OISD standard is referenced for the fa  HIT     YES     ✓    nim        5595
  Q24  Which work order documents the EQ-102 electr  HIT     YES     ✓    nim        3199
  Q25  What is the maximum operating pressure engin  HIT     YES     ✓    nim        6664
  ------------------------------------------------------------------------------------
  Retrieval (fact reaches context):    25/25 (100%)  95% CI [87–100%]
  Answer quality (facts, not negated): 23/25 (92%)  95% CI [75–98%]
  Provenance (sources cited):          25/25 (100%)  95% CI [87–100%]
  Synthesis latency:                   p50 8346 ms · p95 37278 ms · avg 13351 ms

  By category (retrieval · answer · provenance)
    aggregation            1/1 · 0/1 · 1/1
    alias-resolution       2/2 · 2/2 · 2/2
    blast-radius           1/1 · 1/1 · 1/1
    causal                 1/1 · 1/1 · 1/1
    counterfactual         2/2 · 2/2 · 2/2
    current-fact           4/4 · 3/4 · 4/4
    mdm                    1/1 · 1/1 · 1/1
    personnel              1/1 · 1/1 · 1/1
    regulatory             2/2 · 2/2 · 2/2
    safety-isolation       2/2 · 2/2 · 2/2
    supersession           1/1 · 1/1 · 1/1
    temporal               1/1 · 1/1 · 1/1
    temporal-history       1/1 · 1/1 · 1/1
    temporal-supersession  2/2 · 2/2 · 2/2
    traceability           3/3 · 3/3 · 3/3
  KG linkage:                        10/10 assets linked (100%) · 105 edges (0 verified)
```

Retrieval / provenance / KG / latency / CIs are fully deterministic. Answer quality depends on the LLM
under test (NIM), so it can vary ±1 question run-to-run. The two `no`s (Q05 Meridian, Q09 seal-count) are
honest synthesis misses, explained in [`../docs/BENCHMARKS.md`](../docs/BENCHMARKS.md).

## 3. `run_model_validation.py` — Layer-0 entity-extraction F1

Ground truth: `validation_corpus` (13 human-verified entities grounded in canon, anchored to clean-text
docs; seeded by `scripts/seed_validation_corpus.py`). Partial (span-overlap) matching, the NER standard.

```json
{
  "model_name": "mistralai/ministral-14b-instruct-2512",
  "corpus_size": 13,
  "precision": 1.0,
  "recall": 0.9231,
  "f1": 0.96,
  "by_entity_type": {
    "ASSET_TAG":    {"precision": 1.0, "recall": 1.0,  "f1": 1.0,    "count": 9},
    "PERSON":       {"precision": 1.0, "recall": 1.0,  "f1": 1.0,    "count": 2},
    "ORGANIZATION": {"precision": 1.0, "recall": 0.5,  "f1": 0.6667, "count": 2}
  }
}
```

NER is a stochastic model, so F1 varies run-to-run: **observed range F1 0.89–0.96, recall stable ~0.92**.
`ASSET_TAG` (the safety-critical equipment-tag type) is consistently perfect; `ORGANIZATION` is canon-limited
to 2 samples (Fischer, Meridian) so a single miss swings its rate. This is a snapshot of a stochastic model,
not a fixed constant.

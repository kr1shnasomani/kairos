# KAIROS — Benchmark Results

Raw output of the evaluation scripts. **Measured 2026-08-15** on the live stack (cloud stores:
Neo4j Aura · Qdrant Cloud · Supabase; cloud models: NVIDIA NIM `llama-3.1-70b` synthesis, falling back
to OpenRouter on the *same* model then Gemini · `llama-3.2-11b-vision` NER · Jina embed · Groq STT).

- Methodology and interpretation: [`../docs/BENCHMARKS.md`](../docs/BENCHMARKS.md)
- Caveats, known confounds and what each number does **not** prove:
  [`../docs/implementation/status.md` § Benchmark caveats](../docs/implementation/status.md#benchmark-caveats--measurement-notes-2026-08-15)

## Summary

| Metric | Result | Harness |
|---|---|---|
| Layer smoke checks | **13/13 pass** | `verify_layers.py` |
| Retrieval (fact reaches context) | **25/25 (100%)** | `run_benchmark.py` |
| Answer quality (facts stated, not negated) | **24/25 (96%)** | `run_benchmark.py` |
| Provenance (sources cited) | **25/25 (100%)** | `run_benchmark.py` |
| Entity-extraction F1 (Layer-0 gate) | **0.917** | `run_model_validation.py` |
| Compliance gap detection | **P 1.000 · R 0.973 · F1 0.986** | `run_compliance_eval.py` |
| Time-to-answer vs keyword search | **25.6% modelled reduction** | `run_time_to_answer.py` |
| Concurrency | **2275 requests · 0% errors · knee at 50 VU** | `run_load_test.py` |

## 1. `verify_layers.py` — per-layer smoke + latency

```
  LAYER                 CHECK                                 STATUS      ms
  ------------------------------------------------------------------------------
  Auth                  POST /auth/login                      PASS         0   token ok
  L0 Validation         GET /governance/validation-corpus/stat PASS       608   HTTP 200
  L1 MDM                GET /assets                           PASS       119   HTTP 200
  L2 Vault              GET /documents                        PASS       187   HTTP 200
  L4 Graph              GET /governance/circuit-breaker       PASS       321   HTTP 200
  L5 OT (mock)          GET /ot/query (go connector)          PASS        10   HTTP 200
  L6 Quarantine         GET /governance/quarantine            PASS       168   HTTP 200
  L7 Governance         GET /governance/conflicts             PASS       189   HTTP 200
  L8 Events/Briefs      GET /briefs                           PASS       186   HTTP 200
  L9 Elicitation        GET /elicitation/offboarding          PASS       127   HTTP 200
  L11 Retrieval         GET /search                           PASS       974   HTTP 200
  L12 Frontend          GET / (frontend)                      PASS       103   HTTP 200
  Datastores            GET /health/detailed                  PASS       281   HTTP 200
  ------------------------------------------------------------------------------
  13/13 checks passed
```

## 2. `run_benchmark.py` — domain-expert Q&A (25 questions)

```
  Retrieval (fact reaches context):    25/25 (100%)  95% CI [87–100%]
  Answer quality (facts, not negated): 24/25 (96%)   95% CI [80–99%]
  Provenance (sources cited):          25/25 (100%)  95% CI [87–100%]
  Synthesis latency:                   p50 40321 ms · p95 95527 ms · avg 41995 ms
  Answered by:                         nim 18 · gemini 4 · refused 3

  By category (retrieval · answer · provenance)
    aggregation            1/1 · 0/1 · 1/1
    alias-resolution       2/2 · 2/2 · 2/2
    blast-radius           1/1 · 1/1 · 1/1
    causal                 1/1 · 1/1 · 1/1
    counterfactual         2/2 · 2/2 · 2/2
    current-fact           4/4 · 4/4 · 4/4
    mdm                    1/1 · 1/1 · 1/1
    personnel              1/1 · 1/1 · 1/1
    regulatory             2/2 · 2/2 · 2/2
    safety-isolation       2/2 · 2/2 · 2/2
    supersession           1/1 · 1/1 · 1/1
    temporal               1/1 · 1/1 · 1/1
    temporal-history       1/1 · 1/1 · 1/1
    temporal-supersession  2/2 · 2/2 · 2/2
    traceability           3/3 · 3/3 · 3/3
  KG linkage:                        10/10 assets linked (100%) · 130 edges (0 verified)
```

Run twice on 2026-08-15 under different provider mixes (12/25 and 4/25 Gemini); both scored 24/25.
The one miss is Q09 `aggregation`. Three questions (Q07, Q19, Q25) legitimately refuse via the
safety-critical gate; the grader counts a refusal as a correct outcome, since it carries its own
sources for direct verification.

> **Measured at `NVIDIA_NIM_TIMEOUT=90`; the shipping value is now 60** (lowered because 90 breached
> the frontend's 90 s budget — see the status.md caveats). A confirmation run at 60 s was attempted
> and came back **INVALID**: Google's free-tier quota was exhausted partway through, so 7 of 25
> questions returned no answer from any provider and the run scored 17/25 — a measure of quota, not
> of quality. **17/25 is not published anywhere and should not be quoted.** 24/25 stands as the last
> valid measurement; re-confirm at 60 s once the Gemini quota resets.

## 3. `run_model_validation.py` — Layer-0 entity-extraction F1

```json
{
  "model_name": "meta/llama-3.2-11b-vision-instruct",
  "corpus_size": 13,
  "precision": 1.0,
  "recall": 0.8462,
  "f1": 0.9167,
  "by_entity_type": {
    "ASSET_TAG":    {"precision": 1.0, "recall": 1.0, "f1": 1.0, "count": 9},
    "PERSON":       {"precision": 1.0, "recall": 1.0, "f1": 1.0, "count": 2},
    "ORGANIZATION": {"precision": 0.0, "recall": 0.0, "f1": 0.0, "count": 2}
  },
  "extraction_paths": {"nim": 3, "regex": 2},
  "fallback_extractions": 2,
  "validity": "SUSPECT"
}
```

Previous run (2026-07-25, same model and corpus): precision 0.800 · recall 0.923 · F1 0.857.

**`validity: SUSPECT`** — 2 of 5 extractions fell back to the regex path, which matches ASSET_TAG
only, so this F1 is a ceiling rather than a measurement of the model. Cause and fix in the
status.md caveats linked at the top.

## 4. `run_compliance_eval.py` — compliance gap-detection accuracy

```
  Applicable (clause × asset) pairs in ground truth: 52
  Findings returned by /compliance/gaps:             52
    of which gap:                 36
    of which unverified_evidence: 16

  Gap detection — precision 1.000  recall 0.973  F1 0.986
    true positives  36
    false positives 0   (flagged a gap that the dataset satisfies)
    false negatives 1   (missed a real gap)

  Full status agreement: 51/52 pairs

  False negatives:
    4.1.2    EQ-103   reported unverified_evidence
```

Reproduced exactly from the 2026-07-25 run. Requires `scripts/seed_regulations.py` to have run at
least once, so clause nodes carry `requires_document_type`.

## 5. `run_time_to_answer.py` — time-to-answer vs BM25 keyword search

```
  Questions: 25   assumption: 120s to read one document

  MACHINE TIME
    BM25-only mean:                 15.6 ms
    KAIROS retrieve+synth:       15666.5 ms

  DOCUMENTS OPENED BEFORE THE FACT
    BM25-only mean rank:            1.52
    fact in top-10 for:        24/25 questions
    KAIROS:                         1.00  (cited source, verified once)

  MODELLED HUMAN TIME TO A TRUSTED ANSWER
    traditional:                    76.0 min total  (3.0 min/question)
    KAIROS:                         56.5 min total  (2.3 min/question)
    reduction:                      25.6 %
```

Figures from 2026-07-25 — **not re-run on 2026-08-15**. The 120 s/document reading assumption is an
input, not a measurement (`SECONDS_PER_DOCUMENT` overrides it).

## 6. `run_load_test.py` — concurrency sweep

```
    VU   reqs      rps    p50 ms    p95 ms    p99 ms    max ms    err
  ------------------------------------------------------------------------------
     1     25      6.7     102.8     277.6     834.1     834.1  0.0%
     5    125     32.6     114.9     274.7     794.7     795.0  0.0%
    10    250     57.0     147.7     308.3     406.9     817.2  0.0%
    25    625     76.1     259.7     777.8    1076.4    1141.5  0.0%
    50   1250     69.0     528.6    2061.1    2734.3    3423.4  0.0%

  p95 relative to single-user baseline:
    1 VU 1.00x · 5 VU 0.99x · 10 VU 1.11x · 25 VU 2.80x · 50 VU 7.42x
  First sustained bottleneck: p95 exceeds 3x baseline from 50 VU upward.
```

2275 requests across 9 read endpoints, 0% errors at every level. Reads only — model-backed endpoints
are excluded so a sweep cannot burn provider quota. Supersedes the 2026-07-25 sweep (840 requests,
25 VU max, 10-request baseline).

---

**Scope, not a gap:** the corpus is synthetic by design. KAIROS has no connection to a live plant
(no historian, no EAM, no real document archive), so every figure above is measured against the
authored golden dataset in `dataset/`. That is the intended MVP boundary — see `status.md` §Headline —
not an unfinished task. Read the numbers as "correct on a known corpus"; where corpus size sets a
floor on what a figure can prove, that is recorded in the status.md caveats linked at the top.

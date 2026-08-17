# KAIROS — Benchmark Results

Raw output of the evaluation scripts. **Measured 2026-08-16** on the live stack (cloud stores:
Neo4j Aura · Qdrant Cloud · Supabase; cloud models: NVIDIA NIM `llama-3.1-70b` synthesis, falling back
to OpenRouter on the *same* model then Gemini · `llama-3.2-11b-vision` NER · Jina embed · Groq STT).

**This is the first full sweep on the shipping configuration** — all 37 questions, the 40-label NER
corpus, and `NVIDIA_NIM_TIMEOUT=60`. Every figure below supersedes the 2026-08-15 numbers, which were
measured on the retired 25-question set at a 90 s cap.

- Methodology and interpretation: [`../docs/BENCHMARKS.md`](../docs/BENCHMARKS.md)
- Caveats, known confounds and what each number does **not** prove:
  [`../docs/implementation/status.md` § How to read these](../docs/implementation/status.md#how-to-read-these--the-caveats-that-still-apply)

## Summary

| Metric | Result | Harness |
|---|---|---|
| Layer smoke checks | **13/13 pass** | `verify_layers.py` |
| Retrieval (fact reaches context) | **37/37 (100%)** | `run_benchmark.py` |
| Answer quality (facts stated, not negated) | **34/37 (91%)** — run validity `VALID` | `run_benchmark.py` |
| Provenance (sources cited) | **37/37 (100%)** | `run_benchmark.py` |
| Entity-extraction F1 (Layer-0 gate) | **0.847** on 40 labels — `SUSPECT`, 1 of 15 extractions fell back | `run_model_validation.py` |
| Compliance gap detection | **P 1.000 · R 0.838 · F1 0.912** — see §4, the ground truth is stale, not the code | `run_compliance_eval.py` |
| Time-to-answer vs keyword search | **9.5% modelled reduction** | `run_time_to_answer.py` |
| Concurrency | **2275 requests · 0% errors · knee at 50 VU** | `run_load_test.py` |

## 1. `verify_layers.py` — per-layer smoke + latency

```
  LAYER                 CHECK                                 STATUS      ms
  ------------------------------------------------------------------------------
  Auth                  POST /auth/login                      PASS         0   token ok
  L0 Validation         GET /governance/validation-corpus/stat PASS       492   HTTP 200
  L1 MDM                GET /assets                           PASS      1670   HTTP 200
  L2 Vault              GET /documents                        PASS       163   HTTP 200
  L4 Graph              GET /governance/circuit-breaker       PASS       212   HTTP 200
  L5 OT (mock)          GET /ot/query (go connector)          PASS        31   HTTP 200
  L6 Quarantine         GET /governance/quarantine            PASS       199   HTTP 200
  L7 Governance         GET /governance/conflicts             PASS       230   HTTP 200
  L8 Events/Briefs      GET /briefs                           PASS       363   HTTP 200
  L9 Elicitation        GET /elicitation/offboarding          PASS       406   HTTP 200
  L11 Retrieval         GET /search                           PASS      3672   HTTP 200
  L12 Frontend          GET / (frontend)                      PASS       180   HTTP 200
  Datastores            GET /health/detailed                  PASS       339   HTTP 200
  ------------------------------------------------------------------------------
  13/13 checks passed
```

## 2. `run_benchmark.py` — domain-expert Q&A

```
  Retrieval (fact reaches context):    37/37 (100%)  95% CI [91–100%]
  Answer quality (facts, not negated): 34/37 (91%)   95% CI [79–97%]
  Provenance (sources cited):          37/37 (100%)  95% CI [91–100%]
  Synthesis latency:                   p50 32324 ms · p95 64986 ms · avg 35353 ms
  Answered by:                         nim 23 · openrouter 11 · refused 3
  Run validity:                        VALID — 34/37 answered by llama-3.1-70b (nim 23 + openrouter 11)

  By category (retrieval · answer · provenance)
    aggregation            2/2 · 1/2 · 2/2
    alias-resolution       2/2 · 2/2 · 2/2
    blast-radius           2/2 · 1/2 · 2/2
    causal                 2/2 · 2/2 · 2/2
    counterfactual         2/2 · 2/2 · 2/2
    current-fact           6/6 · 6/6 · 6/6
    mdm                    2/2 · 2/2 · 2/2
    personnel              3/3 · 3/3 · 3/3
    regulatory             2/2 · 2/2 · 2/2
    safety-isolation       2/2 · 2/2 · 2/2
    supersession           2/2 · 2/2 · 2/2
    temporal               2/2 · 2/2 · 2/2
    temporal-history       2/2 · 2/2 · 2/2
    temporal-supersession  2/2 · 2/2 · 2/2
    traceability           4/4 · 3/4 · 4/4
  KG linkage:                        10/10 assets linked (100%) · 45 edges (2 verified)
```

The three misses are **Q09** (`aggregation`), **Q29** (`blast-radius`) and **Q35** (`traceability`).
All three *retrieve* correctly and cite sources — the synthesis declines to commit. Q09 was also the
single miss in the 25-question era, so it is a standing weakness rather than a new one.

**91% is not a regression against the old 96%** — it is a different, wider test. The 24/25 was
25 questions with eight categories at n=1; this is 37 questions with none below n=2. Per-category
rates should be read with the n attached: at n=2, one flip moves a category by 50%.

**All 3 refusals (Q07, Q19, Q25) are genuine**, checked against the graph rather than assumed — no
asset in any of them carries an authoritative (≤L3) source for the safety-critical parameter asked
for. Q25 is the instructive one: the Meridian bulletin revising the HE-3xx limit to 16.2 bar is
linked to **HE-301**, and Q25 asks about **HE-302/303**, so answering would mean extrapolating a
pressure limit onto assets no source covers. The grader scores a refusal as correct, so this was
audited specifically to confirm the score is not propped up by false refusals: **raw and adjusted
scores are identical.**

**Provider mix is the reason this run is `VALID`.** 11 of 34 answers came from OpenRouter, which
serves the *same* `llama-3.1-70b` as NIM — so the model that answered never changed. Under the older
NIM → Gemini cascade those 11 would have been a different model family and the run would have been
flagged `SUSPECT`.

**Latency is the honest cost of the 60 s cap.** p95 64986 ms is high because the cap keeps work on
NIM rather than truncating it onto a faster fallback. A lower cap produces a prettier p95 that
measures the fallback instead of the production model.

## 3. `run_model_validation.py` — Layer-0 entity-extraction F1

```json
{
  "model_name": "meta/llama-3.2-11b-vision-instruct",
  "corpus_size": 40,
  "precision": 0.8,
  "recall": 0.9,
  "f1": 0.8471,
  "by_entity_type": {
    "ASSET_TAG":    {"precision": 1.0, "recall": 0.9,    "f1": 0.9474, "count": 30},
    "PERSON":       {"precision": 1.0, "recall": 1.0,    "f1": 1.0,    "count": 7},
    "ORGANIZATION": {"precision": 1.0, "recall": 0.6667, "f1": 0.8,    "count": 3}
  },
  "extraction_paths": {"nim": 14, "regex": 1},
  "fallback_extractions": 1,
  "validity": "SUSPECT"
}
```

First measurement on the **40-label** corpus (was 13). Not comparable to the previous 0.917/0.857,
which were scored on the retired set.

**The NER timeout fix is validated here.** 14 of 15 extractions ran on the model with **zero
timeouts**; the run that produced 0.917 had two 30 s timeouts out of five. `PERSON` is now 1.0 at
n=7 and `ORGANIZATION` 0.8 at n=3 — both were 0.0 in at least one earlier run.

**`validity: SUSPECT` — but the cause has changed, and that matters.** The single fallback was
`ner.parse_failed` (the model emitted malformed JSON), **not** a timeout. The old SUSPECT verdicts
were a latency problem and are fixed; this is a response-parsing problem and is a different defect.
F1 remains a ceiling while any extraction falls back, because the regex last resort matches
ASSET_TAG only.

`ORGANIZATION` at n=3 cannot be grown from this corpus — it holds exactly two unambiguous vendors.
Quote that per-type F1 with its n, or not to four decimals.

## 4. `run_compliance_eval.py` — compliance gap-detection accuracy

```
  Applicable (clause × asset) pairs in ground truth: 52
  Findings returned by /compliance/gaps:             47
    of which gap:                 31
    of which unverified_evidence: 16

  Gap detection — precision 1.000  recall 0.838  F1 0.912
    true positives  31
    false positives 0   (flagged a gap that the dataset satisfies)
    false negatives 6   (missed a real gap)

  Full status agreement: 46/52 pairs

  False negatives:
    10.2.1   EQ-101   reported nothing
    4.1.1    EQ-101   reported nothing
    4.1.2    EQ-103   reported unverified_evidence
    8.1.1    EQ-101   reported nothing
    8.2.1    EQ-101   reported nothing
    9.1.1    EQ-101   reported nothing
```

**F1 fell 0.986 → 0.912 and the code did not change. The ground truth went stale.** Five of the six
false negatives are the same event: every one is an EQ-101 clause requiring
`document_type: 'procedure'`, and EQ-101 now has a **verified** procedure document —
`PROMOTED-f17b1416-…`, created when a human promoted a quarantined item during the conformance work.
The graph held **zero** verified edges when 0.986 was measured; it now holds two. Those clauses are
genuinely covered, and covered pairs are omitted from the findings list, which is why they read as
"reported nothing".

The truth table is derived from the static dataset manifest, so it cannot know about evidence a human
promoted after it was authored. **It was deliberately not amended** — the same call already recorded
for `4.1.2 / EQ-103` (the sixth false negative, a long-standing ground-truth artefact). Copying the
system's output into its own ground truth would destroy the independence that makes the measurement
worth anything.

> **Known property of this harness, not a one-off:** its ground truth is corpus-derived, so the score
> drifts *downward* as humans legitimately promote knowledge into the graph. Precision — the
> safety-relevant direction — is unaffected and stays at **1.000** with zero false positives.

## 5. `run_time_to_answer.py` — time-to-answer vs BM25 keyword search

```
  Questions: 37   assumption: 120s to read one document

  MACHINE TIME
    BM25-only mean:                 34.8 ms
    KAIROS retrieve+synth:       26749.0 ms

  DOCUMENTS OPENED BEFORE THE FACT
    BM25-only mean rank:            1.35
    fact in top-10 for:        36/37 questions
    KAIROS:                         1.00  (cited source, verified once)

  MODELLED HUMAN TIME TO A TRUSTED ANSWER
    traditional:                   100.0 min total  (2.7 min/question)
    KAIROS:                         90.5 min total  (2.4 min/question)
    reduction:                       9.5 %
```

**The reduction fell 25.6% → 9.5%, for two honest reasons.** BM25's mean rank *improved* on the wider
question set (1.52 → 1.35), so the baseline it is measured against got better; and KAIROS machine time
rose (15.7 s → 26.7 s) because the 60 s cap keeps work on NIM instead of truncating onto a faster
fallback. The old figure was also taken with a **180 s** client budget — twice what the browser
allows — so it counted calls the product would have aborted. That budget is now pinned to the
frontend's 90 s, and the harness is paced like `run_benchmark.py`.

The 120 s/document reading assumption is an input, not a measurement (`SECONDS_PER_DOCUMENT`
overrides it). On a 20-document corpus BM25 already finds the answer at rank 1.35, so there is little
headroom to win — see the status.md note on why this figure is a floor set by corpus size.

## 6. `run_load_test.py` — concurrency sweep

```
  Endpoints: 9 (reads only)
  Requests per worker per level: 25

    VU   reqs      rps    p50 ms    p95 ms    p99 ms    max ms    err
  ------------------------------------------------------------------------------
     1     25      5.8     135.9     272.6    1076.3    1076.3  0.0%
     5    125     26.5     147.0     352.4     819.0     943.2  0.0%
    10    250     50.4     159.4     375.9     511.5     801.5  0.0%
    25    625     72.3     269.9     777.6     985.4    1164.0  0.0%
    50   1250     74.5     499.8    1839.5    2139.0    2356.9  0.0%

  p95 relative to single-user baseline:
    1 VU 1.00x · 5 VU 1.29x · 10 VU 1.38x · 25 VU 2.85x · 50 VU 6.75x
  First sustained bottleneck: p95 exceeds 3x baseline from 50 VU upward.
```

2275 requests across 9 read endpoints, 0% errors at every level — reproduces the 2026-08-15 sweep
(knee at 50 VU in both). Reads only: model-backed endpoints are excluded so a sweep cannot burn
provider quota. Still a load test, not a soak — nothing here speaks to memory growth or connection
leakage over hours (backlog #7, spec written, deferred).

---

**Scope, not a gap:** the corpus is synthetic by design. KAIROS has no connection to a live plant
(no historian, no EAM, no real document archive), so every figure above is measured against the
authored golden dataset in `dataset/`. That is the intended MVP boundary — see `status.md` §Headline —
not an unfinished task. Read the numbers as "correct on a known corpus"; where corpus size sets a
floor on what a figure can prove, that is recorded in the status.md caveats linked at the top.

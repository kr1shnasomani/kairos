# KAIROS — Benchmark Results

Raw output of the evaluation scripts. **Measured 2026-07-25** on the live stack (cloud stores:
Neo4j Aura · Qdrant Cloud · Supabase; cloud models: NVIDIA NIM `llama-3.1-70b` synthesis with Gemini
fallback · `llama-3.2-11b-vision` NER · Jina embed · Groq STT). Methodology and interpretation live in
[`../docs/BENCHMARKS.md`](../docs/BENCHMARKS.md).

This run supersedes the 2026-07-14 figures, which predated three changes to retrieval: RRF fusion
replacing raw BM25-vs-cosine score comparison, duplicate merging that keeps the longest snippet, and
graph hits carrying real snippet text instead of `""`.

## 1. `verify_layers.py` — per-layer smoke + latency

```
  LAYER                 CHECK                                   STATUS      ms
  ------------------------------------------------------------------------------
  Auth                  POST /auth/login                        PASS         0   token ok
  L0 Validation         GET /governance/validation-corpus/stats  PASS       265   HTTP 200
  L1 MDM                GET /assets                              PASS       233   HTTP 200
  L2 Vault              GET /documents                           PASS       262   HTTP 200
  L4 Graph              GET /governance/circuit-breaker          PASS       153   HTTP 200
  L5 OT (mock)          GET /ot/query (go connector)             PASS         2   HTTP 200
  L6 Quarantine         GET /governance/quarantine               PASS      7660   HTTP 200
  L7 Governance         GET /governance/conflicts                PASS       164   HTTP 200
  L8 Events/Briefs      GET /briefs                              PASS       167   HTTP 200
  L9 Elicitation        GET /elicitation/offboarding             PASS       105   HTTP 200
  L11 Retrieval         GET /search                              PASS      2229   HTTP 200
  L12 Frontend          GET / (frontend)                         PASS      1788   HTTP 200
  Datastores            GET /health/detailed                     PASS       272   HTTP 200
  ------------------------------------------------------------------------------
  13/13 checks passed
```

## 2. `run_benchmark.py` — domain-expert Q&A (25 questions)

```
  Retrieval (fact reaches context):    25/25 (100%)  95% CI [87–100%]
  Answer quality (facts, not negated): 22–24/25 (88–96%) across 3 runs — see note below
  Provenance (sources cited):          25/25 (100%)  95% CI [87–100%]
  Synthesis latency:                   p50 10502 ms · p95 45772 ms · avg 14248 ms

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
    temporal-history       1/1 · 0/1 · 1/1
    temporal-supersession  2/2 · 1/2 · 2/2
    traceability           3/3 · 3/3 · 3/3
  KG linkage:                        10/10 assets linked (100%) · 130 edges (0 verified)
```

**Answer quality: 22–24/25 (88–96%) on a rested provider quota. Later runs in the same session are
INVALID — see the quota confound below.** Retrieval and provenance are deterministic and stayed at
25/25 in every run.

> ### ⚠️ Provider-quota confound — read before quoting any answer-quality figure
>
> The synthesis cascade is **NIM → Gemini → Ollama** (Ollama unconfigured). Repeated benchmark runs in
> one session exhausted the **Gemini free-tier quota**, after which Gemini returned `HTTP 429` and every
> NIM timeout became a *no answer* rather than a fallback answer. Observed sequence in one session:
>
> | Run | `NVIDIA_NIM_TIMEOUT` | Answer quality | Gemini state |
> |---|---|---|---|
> | 1–3 | 45 s | **23, 24, 22 / 25** | quota available |
> | 4 | 20 s | 13/25 | quota exhausted (429) |
> | 5 | 45 s | 18/25 | quota exhausted (429) |
>
> Runs 4–5 measure quota exhaustion, not model quality, and must not be cited. **Take one clean
> measurement on a rested quota and use that.** Verify first: a 429 from Gemini invalidates the run.
>
> **This is a real fragility, not just a measurement artefact.** The cascade's second tier is a
> free-tier key, so under sustained load — a judge hammering the copilot, or a demo with several
> concurrent users — answer quality degrades toward zero while retrieval keeps working. Mitigations:
> configure Ollama as a genuine third tier, move Gemini to a paid tier, or drop the cascade so a NIM
> failure surfaces as an honest error instead of silently becoming a miss.

**The latency tail is a timeout, not inference — but shortening it is not a free win.** p95 is ~46 s
because a hanging NIM call burns the full `NVIDIA_NIM_TIMEOUT=45` before Gemini answers in ~2 s.
Dropping the cap to 20 s cut p95 to **20.9 s (−56%)**, which confirms the diagnosis. That experiment
ran under exhausted Gemini quota, so its quality reading is uninterpretable and the change was
reverted to 45 s. **Re-test on a rested quota before adopting it** — the latency prize is large and the
mechanism is understood; only the quality cost is unmeasured. The category table above is the final run; which
questions miss changes between runs (Q09 `aggregation` is the most persistent — the model under-counts
seal failures, and the facts do reach context, so it is a synthesis miss, not a retrieval one).

**Three questions now legitimately refuse** (Q07 isolation boundary, Q19 primary safety isolation
valve, Q25 max operating pressure) and the grader counts a refusal as a correct outcome — it carries
its own sources for direct verification. This is the first run in which the safety gate fires at all:
nothing in the system previously set `query_category`, so `refused` was always `false`.

**A false refusal was found and fixed by this run.** Q06 — *"When was isolation valve XV-203 last
inspected?"* — was refused on the first pass because the bare keyword `isolation` matched the
*equipment name* in a date-lookup question. Refusing a fact the vault holds is as wrong as guessing a
parameter, so the isolation patterns now require intent (`isolation boundary`, `safety isolation`,
`isolate`, `lockout`, …) rather than the bare word. Q06 answers correctly and the three genuine
refusals are unaffected. Pinned by `tests/test_query_category.py`.

Latency rose against the previous run (p50 8.3 s → 10.9 s, p95 37.3 s → 47.0 s), driven by NIM
failures falling through to the Gemini tier rather than by the ranking change.

## 3. `run_model_validation.py` — Layer-0 entity-extraction F1

```json
{
  "model_name": "meta/llama-3.2-11b-vision-instruct",
  "corpus_size": 13,
  "precision": 0.8,
  "recall": 0.9231,
  "f1": 0.8571,
  "by_entity_type": {
    "ASSET_TAG":    {"precision": 1.0, "recall": 1.0, "f1": 1.0,    "count": 9},
    "PERSON":       {"precision": 1.0, "recall": 1.0, "f1": 1.0,    "count": 2},
    "ORGANIZATION": {"precision": 1.0, "recall": 0.5, "f1": 0.6667, "count": 2}
  }
}
```

**The configured NER model was dead, and the gate was silently scoring its own regex fallback.**
`mistralai/ministral-14b-instruct-2512` has been deprecated by NVIDIA: the endpoint accepts the
request and then hangs until timeout (confirmed at 30 s, 60 s and 90 s, with a fresh client as well as
the pooled one — so not a client-pooling artefact). `NERService` caught the timeout and degraded to
its regex last resort, which only matches ASSET_TAG. That produced `ASSET_TAG 1.0 / PERSON 0.0 /
ORGANIZATION 0.0` and an F1 of 0.8182 that looked like a model score but was a regex score.

Replaced with `meta/llama-3.2-11b-vision-instruct` (verified responsive: 3.1 s, and it correctly
returns PERSON / ORGANIZATION / REGULATION / DATE). **PERSON recall went 0.0 → 1.0.**

**A second defect made the gate unable to compare models at all.** `NERService()` took no model
argument, so `--model-name` (and the Celery gate's `model_name`) only *labelled* the result — the call
always used `NVIDIA_NIM_NER_MODEL`. The gate reported an authoritative-looking F1 attributed to a
model it had never invoked. `NERService(model=…)` now overrides it, pinned by
`tests/test_model_validation.py`.

Precision 0.8 reflects the model extracting entity types the 13-item corpus does not label
(`MATERIAL`, `PROCESS_PARAMETER`, `ACTION_VERB` all show `count: 0`) — they are counted as false
positives. The corpus remains small (13 entities, `ORGANIZATION` at n=2), so a single miss swings a
per-type rate; F1 should not be quoted to four decimals off this sample.

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
```

**Zero false positives across 52 pairs** — the clause-scoped query never flags a gap the dataset
actually satisfies. This is the number the problem statement's "compliance gap detection accuracy"
criterion was missing entirely; the previous implementation could not produce one, because it reported
every (regulation × asset) pair as a gap unconditionally.

The single false negative was **traced to the ground truth, not the system**: `4.1.2 / EQ-103` is
declared with no documents in the loader's mapping, but the graph correctly links EQ-103 to an
`oem_manual` and an `inspection_report` that extraction found by asset tag in the document text. So
`unverified_evidence` was the right answer and the truth table was wrong. The truth table was
deliberately **not** amended to match — copying the system's output into its own ground truth would
destroy the independence that makes this measurement worth anything. The limitation is documented in
the harness instead.

Requires `scripts/seed_regulations.py` to have run at least once: the clause nodes need
`requires_document_type`. Before that seed this harness scored **precision 0.000 / recall 0.000**,
because the backwards-compatibility fallback (`NULL` = any document type counts) made every pair
report `unverified_evidence`. That is exactly what an independently-derived ground truth is for — it
caught a deployed-state/code mismatch that a self-consistent test would have passed.

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

**KAIROS loses the machine-time comparison by three orders of magnitude** (15.6 ms vs 15.7 s) and the
harness reports that unweighted. The claim is about time to a *trusted, cited* answer.

**Read the 25.6% honestly: it is a floor set by corpus size, not a ceiling.** BM25 finds the
answer-bearing document at mean rank 1.52 across ~20 documents — on a corpus this small, keyword
search is already good, so there is little room to improve on it. The problem statement's premise is
7–12 disconnected systems with thousands of documents, where rank degrades and the gap widens. This
number should not be extrapolated from 20 documents to a real plant.

The 120 s/document reading assumption is an input, not a measurement — `SECONDS_PER_DOCUMENT`
overrides it, and the conclusion moves with it.

## 6. `run_load_test.py` — concurrency sweep

```
    VU   reqs      rps    p50 ms    p95 ms    p99 ms    max ms    err
  ------------------------------------------------------------------------------
     1     20      4.7     151.7     939.0     939.0     939.0  0.0%
     5    100     21.4     150.1     431.0     873.8     873.8  0.0%
    10    200     45.8     195.4     386.0     705.0     824.8  0.0%
    25    500     72.7     277.3     809.1    1649.4    1670.1  0.0%

  p95 relative to single-user baseline: 1 VU 1.00x · 5 VU 0.46x · 10 VU 0.41x · 25 VU 0.86x
  p95 stayed within 3x baseline through 25 concurrent users.
```

**840 requests across 9 read endpoints, 0% errors at every level.** p50 rises 152 → 277 ms from 1 to
25 concurrent users; throughput scales 4.7 → 72.7 rps. The 1 VU p95 (939 ms) is cold-start, which is
why the mid-level ratios read below 1.0.

Two methodology fixes were needed before these numbers meant anything:

- An earlier pass counted **307 redirects as success** (`status < 400`), so it measured redirect
  latency instead of endpoint work. Now requires 2xx and follows redirects.
- The knee detector fired on a **single noisy sample**: with 6 requests per level it reported "no
  degradation through 25 VU" and "bottleneck at 5 VU" on consecutive runs of the same system. A knee
  must now be *sustained* across all higher levels, and the harness warns when the baseline has fewer
  than 20 requests.

Caveats: reads only — model-backed endpoints are excluded so a sweep cannot burn provider quota. This
is a load test, not a soak test: nothing here speaks to memory growth or connection leakage over
hours, and 25 VU against a demo-scale dataset is not evidence for 10k assets.

## What is and is not measured

| Criterion | Status |
|---|---|
| Retrieval / provenance | ✅ 25/25 both, deterministic, stable across all runs |
| Answer quality | ✅ measured — **22–24/25 (88–96%)**, ±2 run-to-run; quote the range |
| Entity-extraction F1 | ✅ measured — **0.857** on `llama-3.2-11b-vision` (13-entity corpus) |
| Compliance gap accuracy | ✅ measured — **precision 1.000 · recall 0.973 · F1 0.986**, 0 false positives |
| Time-to-answer vs keyword search | ✅ measured — 25.6% modelled reduction, assumption stated |
| Scalability under concurrency | ✅ measured — 840 requests, 0% errors to 25 VU, reads only |
| Validation-corpus size | ⚠️ 13 entities, `ORGANIZATION` at n=2 — too small for 4-decimal F1 |
| Soak / sustained load | ❌ not tested — no memory-growth or leak evidence |

**Scope, not a gap:** the corpus is synthetic by design. KAIROS has no connection to a live plant
(no historian, no EAM, no real document archive), so every figure above is measured against the
authored golden dataset in `dataset/`. That is the intended MVP boundary — see `status.md` §Headline —
not an unfinished task. Read the numbers as "correct on a known corpus", and note where corpus size
sets a floor (the time-to-answer §5 caveat is the clearest case).

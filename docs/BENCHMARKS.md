# KAIROS — Benchmarks & Evaluation

> Maps directly to the Problem Statement's **Evaluation Focus**. Every number here is
> **reproducible** against the loaded golden dataset — no hand-picked figures.
> Latest measured run (raw script output): [`../benchmark/RESULTS.md`](../benchmark/RESULTS.md).

## The harness

Self-contained evaluation harness + evidence, in `benchmark/` (mounted into the API container at
`/app/benchmark` — the scripts import the running app, so they execute inside it).

| File | What |
|------|------|
| `run_benchmark.py` | Retrieval · answer quality · provenance · per-category · latency percentiles · 95% CIs · KG-linkage |
| `verify_layers.py` | Per-layer smoke + latency (PASS/FAIL table) |
| `run_compliance_eval.py` | **Compliance gap-detection precision / recall / F1** vs ground truth derived from the dataset manifest |
| `run_time_to_answer.py` | **Time-to-answer vs BM25-only keyword search** — machine time, documents opened, modelled human time |
| `run_load_test.py` | **Concurrency sweep** — p50/p95/p99, throughput, error rate, first-bottleneck detection |
| `questions.json` | 25 domain-expert Q&A across 15 categories, grounded in `dataset/00_Reference/00_KAIROS_CANON.md` |
| `RESULTS.md` | Raw output of the scripts (results only — this file holds the interpretation) |
| `scripts/seed_validation_corpus.py` | Seeds the Layer-0 NER ground-truth set (`validation_corpus`) that `scripts/run_model_validation.py` scores. **40 labels** (was 13) as of 2026-08-15 — every one verified present in that document's *indexed* text before being added |

> **Sizes, and what limits them.** The question set was widened **25 → 37** on 2026-08-15 so no
> category sits at n=1 (eight did, where a single flip moved a category from 100% to 0%); retrieval
> holds at 37/37 and the interval tightened from [87–100%] to [91–100%]. The NER corpus went
> **13 → 40** labels, but `ORGANIZATION` only reaches n=3: the golden corpus contains exactly two
> unambiguous vendors. "Rajgarh Petrochemical Complex" appears in 13 documents and was deliberately
> **not** labelled — it reads equally well as ORGANIZATION or LOCATION, and a ground truth that
> punishes a defensible answer is worse than a smaller one. That n=3 is a property of the dataset,
> not of the labelling effort.

The last three harnesses cover evaluation criteria that previously had **no number attached** —
compliance gap accuracy and time-to-answer are named in the problem statement, and scalability
had only single-user sequential figures behind it. They are written and import-verified but
**have not yet been run against a loaded stack**; nothing in `RESULTS.md` comes from them.

## Methodology (fully deterministic — no LLM-as-judge)

Grading uses **no LLM**, so every number is reproducible. An LLM judge would be non-deterministic
(breaking that claim), circular (an LLM grading an LLM shares blind spots and rewards confident verbosity),
and slower — a poor fit for a platform whose pitch is reproducibility and provenance.

- **Per-question routing** — each question pulls context from the *right* source: hybrid `/search`,
  the asset's graph `/knowledge`, and/or `/aliases`. Not everything is forced through `/search`.
- **Retrieval** — keyword-in-context signal (does the fact actually reach the synthesis context?).
- **Answer quality** — the synthesized answer must **state the required fact(s) without negating them**:
  `must_all` = every token (exact / multi-part facts like part numbers, pressures, valve sets); `answer_any`
  = any correct-answer token (comparative questions whose correct keyword differs from the retrieval keyword);
  else `expect_any`. A required fact wrapped in a negator (*"not 16.2 bar"*) does **not** count. This kills the
  two failure modes of naive keyword scoring — false positives from negation and false negatives from strict
  wording — while staying deterministic.
- **Provenance** — every non-refused answer must cite `sources[]` (KAIROS rule: no claim without provenance).
  A refusal is a valid, correct outcome (the safety gate) and carries its own sources.
- **Per-category scoring** — every question carries a `category` (current-fact, temporal-supersession,
  safety-isolation, counterfactual, alias-resolution, regulatory, traceability, …); results break down by
  category so a regression in one capability is visible, not averaged away.
- **95% confidence intervals** — each headline rate reports a Wilson score interval (the correct CI for small-n
  proportions), so `25/25` reads honestly as "100%, 95% CI [87–100%]" rather than implying infinite precision.
- **Latency percentiles** — synthesis latency is reported p50 / p95 / avg, not just a mean a single slow
  question can distort.
- **Entity-extraction F1 (Layer-0 model gate)** — `run_model_validation.py` scores the NER model against a
  human-verified ground-truth set (`validation_corpus`, seeded from canon by `seed_validation_corpus.py`),
  reporting precision / recall / F1 per entity type. Matching is **partial (span-overlap)** — the NER standard —
  so a prediction of "FISCHER PUMPS LTD." correctly credits the entity "Fischer". Ground truth is anchored to
  clean-text documents so the score isolates NER quality from OCR noise.
- **KG linkage / time-to-answer** — deterministic Cypher + per-request latency.

The grader + stats logic has a stack-free self-check: `python benchmark/run_benchmark.py --selftest`.
Only the *answer text* and the *NER output* are non-deterministic (they come from the LLMs under test);
their grading/scoring is exact. Retrieval / provenance / KG / CIs are the fully reproducible headline figures;
answer-quality varies by ±1 question and entity-F1 by a few points run-to-run (both are stochastic-model
snapshots, not fixed constants).

## How to reproduce

```bash
make load-dataset                       # load the golden corpus (seeds aliases + family history)
make verify                             # per-layer smoke + latency (13/13)
make verify ARGS=--full                 # + P&ID-VLM + synthesize checks (hit NIM)
make benchmark                          # routing + synthesis + deterministic grading + retrieval + KG
make benchmark ARGS=--retrieval-only    # fast: retrieval + KG only, no synthesis
docker exec kairos-backend-api python benchmark/run_benchmark.py --selftest             # grader + stats self-check
docker exec kairos-backend-api python scripts/seed_validation_corpus.py                 # seed NER ground truth
docker exec kairos-backend-api python scripts/run_model_validation.py --model-name <m>  # entity-extraction F1
```

---

## Results

Measured 2026-07-14 (raw output → [`../benchmark/RESULTS.md`](../benchmark/RESULTS.md)).

| PS "Evaluation Focus" criterion | KAIROS metric | Result |
|---|---|---|
| **Time-to-answer** | Per-layer latency + synthesis percentiles | **13/13 layers PASS**; retrieval **~1.4 s**; synthesis **p50 8.3 s · p95 37 s** (NIM 70B) |
| **KG linkage completeness** | Assets linked into the graph + edge verification (Cypher) | **10/10 canonical assets linked (100%)**, **105 knowledge edges**; **0% auto-verified** — *by design* (see note) |
| **Query answer quality** | Golden Q&A (25): answer states the correct fact, not negated, with sources | **23/25 (92%)**, 95% CI [75–98%] (2 honest misses — see notes) |
| **Provenance** | Does every non-refused answer cite `sources[]`? | **25/25 (100%)**, 95% CI [87–100%] |
| **Retrieval quality** | Does the correct source surface for each question? | **25/25 (100%)**, 95% CI [87–100%] |
| **Entity-extraction accuracy** | Layer-0 model gate: precision / recall / F1 per entity type | **F1 ≈ 0.96** (P 1.0 / R 0.92); ASSET_TAG & PERSON 1.0; range 0.89–0.96 across runs |
| **Cross-functional discovery** | Cross-site advisories | 🟦 fixture (single-site MVP, by design) |

Per-category breakdown (15 categories) and per-question output: [`../benchmark/RESULTS.md`](../benchmark/RESULTS.md).

### Time-to-answer vs "traditional search"

> **This was previously an argument, not a measurement.** The paragraph below cited the problem
> statement's own industry figures against KAIROS's retrieval latency — which compares a measured
> number to a survey statistic, not a baseline on the same corpus. `run_time_to_answer.py` now
> measures both halves on the same question set. Run it before quoting any reduction figure.

Why a naive latency comparison would be dishonest: BM25 returns a document list in ~50 ms while
KAIROS returns a cited answer in ~8 s. On machine time alone, keyword search wins — the real cost
of keyword search is the human reading the list it hands back. So the harness reports three things
separately and never hides the one KAIROS loses:

| Measure | What it captures |
|---|---|
| **Machine time** | BM25-only ES latency vs KAIROS retrieval + synthesis. KAIROS is slower. |
| **Documents opened** | Rank of the first answer-bearing document in a BM25-only ranking — how many documents an engineer opens before finding the fact. KAIROS cites the source, so this is 1. |
| **Modelled human time** | `documents_opened × SECONDS_PER_DOCUMENT + machine time` |

`SECONDS_PER_DOCUMENT` (default 120 s, overridable) is an **explicit assumption, not a
measurement** — change it and the conclusion changes. Answer-bearing ground truth reuses the same
`expect_any` keyword sets `run_benchmark.py` already grades retrieval with, so no new labelling
judgement enters.

### Compliance gap-detection accuracy

`run_compliance_eval.py` scores the `gap` classification against ground truth built from the golden
dataset manifest (which document types are linked to which asset) crossed with each clause's
declared `requires_document_type`. That truth table is constructed **independently of the Cypher
under test**, so a disagreement means real breakage in ingestion → asset linking → equipment-class
applicability → the gap query. Verified to derive **52 applicable (clause × asset) pairs: 37
expected gaps, 15 with evidence** — a discriminating target, not an all-gaps one.

Two honest caveats: it scores whether the system finds the evidence it was *told* to look for, not
whether the clause → document-type mapping is the right reading of each regulation (that mapping is
a human judgement in the seed). And **vessel and compressor clauses apply to zero assets** in the
current dataset, so 4 of 12 clauses are never exercised.

### Scalability

`run_load_test.py` sweeps concurrency (default 1→50) over cheap read endpoints and flags the level
at which p95 exceeds 3× the single-user baseline — that number, not the single-user latency, is the
one to quote. Model-backed endpoints are **excluded by default** so a sweep cannot burn NIM/Jina
quota; `--include-models` opts in. It is a load test, not a soak test: it says nothing about memory
growth or connection leakage over hours.

---

## What the fixes did

| Fix | Effect |
|-----|--------|
| **Seed canonical aliases** — loader now writes `alias_table.csv` into `asset_alias_map` | Q08 retrieves (P-101 / Feed Pump A / "the old Fischer") |
| **Ingest family maintenance history** — loader ingests `work_orders_eq101_family.csv` (the EQ-102 counterfactual narrative that no event path indexed) | Q10 retrieves + answers |
| **Wider ES highlight** — `number_of_fragments` 3 → 8 so the snippet spans the doc | Q12 surfaces OISD/PESO regardless of query wording (helps real synthesis too) |
| **Stronger deterministic grader** — `must_all` / `answer_any` + negation guard + provenance gate | kills false positives (negated facts) and false negatives (strict wording), no LLM |

## Notes (honest reading of the numbers)

- **The 2 answer misses are honest, not benchmark bugs.** Q05 (Meridian OEM) and Q09 (EQ-101 failure count)
  both *retrieve* correctly but the synthesis LLM declines to commit — Q05 because the name arrives as a
  fragmented highlight and the model won't infer beyond sources; Q09 because EQ-101's full failure history
  lives in a family CSV scoped to EQ-102 (one `asset_id` per document). Left visible on purpose; gaming them
  to 25/25 would defeat a reproducible benchmark.
- **The `VIA` column records the answering provider per question.** NIM answers nearly all; Gemini is the
  automatic fallback (e.g. Q08 in the recorded run, when a NIM call was slow).
- **Entity-F1 uses partial-match on a canon-grounded set.** `ASSET_TAG` (safety-critical equipment tags) is
  consistently perfect; `ORGANIZATION` is canon-limited to 2 samples (Fischer, Meridian), so a single stochastic
  miss swings its per-type rate. The benchmark also surfaced a real code smell — `NERService` can drop a
  regex-added `ASSET_TAG` when the model labels the same token `MATERIAL` (dedup collision); noted for a
  follow-up, out of benchmark scope.
- **"0% verified" edges is a safety feature, not a gap.** Every edge is `unverified` until a human promotes
  it (quarantine one-way gate); 0% auto-verified proves the governance gate is enforced.
- **10/10 counts the canonical golden assets** (P-101, HE-301…); integration-test rows are excluded from the
  linkage figure.

## Functional validation (correctness, separate from accuracy)
- Backend test suite: **~175 passed · 3 skipped** (1 = transient NIM timeout in-sandbox).
- Contract tests (`test_contract.py`) pin the API response shapes that historically drift.
- Layer 3 P&ID vision extraction: live-validated on `pid_line3_isolation_boundary.png`.

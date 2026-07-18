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
| `questions.json` | 25 domain-expert Q&A across 15 categories, grounded in `dataset/00_Reference/00_KAIROS_CANON.md` |
| `RESULTS.md` | Raw output of the three scripts (results only — this file holds the interpretation) |
| `scripts/seed_validation_corpus.py` | Seeds the Layer-0 NER ground-truth set (`validation_corpus`) that `scripts/run_model_validation.py` scores |

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
KAIROS answers a **cross-document, source-cited** question with retrieval in **~1.4 s** (full synthesis in
seconds). The status quo the PS documents: professionals lose **35% of their time** searching across **7–12
disconnected systems** (McKinsey/NASSCOM-EY, cited in the PS) — minutes-to-hours per lookup, no citation.
That is the comparison: seconds-with-provenance vs. minutes-across-silos.

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

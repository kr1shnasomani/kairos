"""
KAIROS — Domain-expert benchmark (PS "Evaluation Focus").

Methodology (fully deterministic — no LLM judge, so every number is reproducible):
  • Per-question routing  — each question pulls context from the right source(s):
    hybrid `/search`, the asset's graph `/knowledge`, and/or `/aliases`.
  • Retrieval precision    — keyword-in-context signal (does the fact reach the context?).
  • Answer quality         — the synthesized answer must *state* the required fact(s) and not negate
    them: `must_all` = every token (exact/multi-part facts), `answer_any` = any correct-answer token
    (comparative questions), else `expect_any`. A fact wrapped in a negator ("not 16.2") fails.
  • Provenance             — every non-refused answer must cite sources[] (KAIROS: no claim w/o provenance).
  • KG linkage             — deterministic Cypher (assets linked, edges, verification).
  • Time-to-answer         — latency per question.
Entity-extraction F1 is the Layer-0 model gate: backend/scripts/run_model_validation.py.

Streams per question. Requires the golden dataset loaded (`make load-dataset`).
Run:
    docker exec kairos-backend-api python benchmark/run_benchmark.py                 # full (routing + synthesis + grading)
    docker exec kairos-backend-api python benchmark/run_benchmark.py --retrieval-only # fast, retrieval + KG only
"""

import argparse
import asyncio
import json
import math
import os
import time
from collections import defaultdict

import httpx

API = os.getenv("VERIFY_API_URL", "http://localhost:8000")
QUESTIONS = os.getenv("BENCHMARK_FILE", "/app/benchmark/questions.json")
SYNTH_TIMEOUT = float(os.getenv("BENCHMARK_SYNTH_TIMEOUT", "120"))




def _kw_hit(blob: str, terms: list[str]) -> bool:
    """Retrieval signal: does any expected term reach the (context) blob?"""
    low = blob.lower()
    return any(t.lower() in low for t in terms)


# A required fact wrapped in one of these is NOT a correct statement of it
# ("the limit is not 16.2 bar"). ponytail: 20-char lookbehind heuristic, not a parser —
# upgrade to dependency parsing only if a real answer defeats it.
_NEGATORS = ("not ", "no ", "n't ", "never ", "isn't", "wasn't", "aren't", "rather than", "instead of", "no longer")


def _stated(answer: str, token: str) -> bool:
    """True if `token` appears in `answer` in at least one non-negated position."""
    low, tok = answer.lower(), token.lower()
    i = low.find(tok)
    while i != -1:
        if not any(neg in low[max(0, i - 20):i] for neg in _NEGATORS):
            return True
        i = low.find(tok, i + 1)
    return False


def _grade_answer(answer: str, q: dict) -> bool:
    """Deterministic answer correctness — required facts stated and not negated.
    `must_all` → every token (exact/multi-part facts); `answer_any` → any token
    (comparative answers whose correct keyword differs from the retrieval keyword);
    else `expect_any` → any token."""
    if not answer:
        return False
    if q.get("must_all"):
        return all(_stated(answer, t) for t in q["must_all"])
    return any(_stated(answer, t) for t in (q.get("answer_any") or q["expect_any"]))


def _pct(vals: list[float], p: float) -> float:
    """p-th percentile (nearest-rank) — deterministic, no numpy."""
    if not vals:
        return 0.0
    s = sorted(vals)
    k = max(0, min(len(s) - 1, int(round((p / 100) * (len(s) - 1)))))
    return s[k]


def _wilson(k: int, n: int) -> tuple[float, float]:
    """95% Wilson score interval for a k/n success rate — the right CI for small-n proportions.
    Deterministic, stdlib only (no scipy)."""
    if n == 0:
        return (0.0, 0.0)
    z, phat = 1.96, k / n
    denom = 1 + z * z / n
    centre = (phat + z * z / (2 * n)) / denom
    half = z * math.sqrt(phat * (1 - phat) / n + z * z / (4 * n * n)) / denom
    return (max(0.0, centre - half), min(1.0, centre + half))


async def _gather_context(c: httpx.AsyncClient, h: dict, q: dict) -> list[dict]:
    """Route the question to its proper source(s) and return synthesis context items."""
    sources = q.get("context_sources", ["search"])
    aid = q.get("asset_id")
    ctx: list[dict] = []

    if "search" in sources:
        params = {"q": q["question"], "limit": 5}
        if aid:
            params["asset_id"] = aid
        r = await c.get(f"{API}/search", headers=h, params=params)
        if r.status_code == 200:
            ctx += r.json().get("results", [])

    if aid and "knowledge" in sources:
        r = await c.get(f"{API}/assets/{aid}/knowledge", headers=h)
        if r.status_code == 200:
            for f in r.json().get("facts", [])[:8]:
                edge = f.get("edge") or {}
                ctx.append({"text": json.dumps(f)[:400], "document_id": edge.get("document_id", "graph"), "authority_level": edge.get("authority_level", 3)})

    if aid and "aliases" in sources:
        r = await c.get(f"{API}/assets/{aid}/aliases", headers=h)
        if r.status_code == 200:
            aliases = [a.get("alias") for a in r.json() if a.get("alias")]
            if aliases:
                ctx.append({"text": f"Known aliases for {aid}: {', '.join(aliases)}", "document_id": "alias_map", "authority_level": 1})

    return ctx



def _selftest() -> None:
    """Assert the deterministic grader — the negation guard is the part that can silently rot."""
    # must_all: every token, non-negated
    assert _grade_answer("Use seal FSL-2240B for the pump.", {"must_all": ["FSL-2240B"]})
    assert not _grade_answer("Do not use FSL-2240B.", {"must_all": ["FSL-2240B"]})   # negated → wrong
    assert not _grade_answer("Isolation needs XV-203 and XV-204.", {"must_all": ["XV-203", "XV-204", "PG-18"]})  # missing PG-18
    assert _grade_answer("The limit is 16.2 bar now.", {"must_all": ["16.2"]})
    assert not _grade_answer("The limit is not 16.2 bar.", {"must_all": ["16.2"]})   # negated numeric
    # answer_any: any correct-answer token
    assert _grade_answer("No, it is a different failure family.", {"answer_any": ["different", "unrelated"]})
    assert not _grade_answer("It was a seal failure again.", {"answer_any": ["different", "unrelated"]})
    # expect_any fallback + empty answer
    assert _grade_answer("Thermal cycling precedes it.", {"expect_any": ["thermal"]})
    assert not _grade_answer("", {"must_all": ["x"]})
    # stats helpers
    lo, hi = _wilson(10, 12)
    assert 0.0 <= lo < 10 / 12 < hi <= 1.0          # CI brackets the point estimate
    assert _wilson(0, 0) == (0.0, 0.0)              # no divide-by-zero on empty
    assert _pct([1, 2, 3, 4], 50) == 3 and _pct([], 95) == 0.0
    print("selftest: OK")


async def main(retrieval_only: bool) -> None:
    with open(QUESTIONS) as f:
        questions = json.load(f)["questions"]
    n = len(questions)

    print("\n  KAIROS — Domain Benchmark  (%d questions)" % n)
    print("  " + "=" * 84)
    hdr = f"  {'ID':<5}{'QUESTION':<46}{'RETR':<6}"
    if not retrieval_only:
        hdr += f"  {'CORRECT':<8}{'SRC':<5}{'VIA':<9}{'ms':>6}"  # CORRECT = facts stated + not negated
    print(hdr)
    print("  " + "-" * 84, flush=True)

    retr_hits, correct_hits, prov_hits, syn_ms = 0, 0, 0, []
    # per-category tallies: cat -> {"n","retr","correct","prov"}
    cats: dict[str, dict[str, int]] = defaultdict(lambda: {"n": 0, "retr": 0, "correct": 0, "prov": 0})

    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as c:
        r = await c.post(f"{API}/auth/login", json={"email": "admin@kairos.local", "password": "KairosAdmin123!"})
        h = {"Authorization": f"Bearer {r.json()['access_token']}"}

        for q in questions:
            cat = q.get("category", "uncategorized")
            cats[cat]["n"] += 1
            ctx = await _gather_context(c, h, q)
            r_hit = _kw_hit(json.dumps(ctx), q["expect_any"])
            retr_hits += r_hit
            cats[cat]["retr"] += r_hit
            line = f"  {q['id']:<5}{q['question'][:44]:<46}{'HIT' if r_hit else 'miss':<6}"

            if not retrieval_only:
                correct, sourced, prov, ms = False, False, "-", 0.0
                t = time.perf_counter()
                try:
                    syn = await c.post(f"{API}/search/synthesize", headers=h, json={"query": q["question"], "context": ctx[:8]}, timeout=SYNTH_TIMEOUT)
                    ms = (time.perf_counter() - t) * 1000
                    body = syn.json() if syn.status_code == 200 else {}
                    refused = bool(body.get("refused"))
                    prov = body.get("model") or ("refused" if refused else "-")
                    # Correct = facts stated (not negated) AND provenance present. Refusal is a valid,
                    # correct outcome (safety gate) and carries its own sources.
                    sourced = refused or bool(body.get("sources"))
                    correct = (refused or _grade_answer(body.get("answer") or "", q)) and sourced
                except (httpx.TimeoutException, httpx.HTTPError):
                    ms, prov = (time.perf_counter() - t) * 1000, "timeout"
                syn_ms.append(ms)
                correct_hits += correct
                prov_hits += sourced
                cats[cat]["correct"] += correct
                cats[cat]["prov"] += sourced
                line += f"  {'YES' if correct else 'no':<8}{'✓' if sourced else '·':<5}{prov:<9}{ms:>6.0f}"

            print(line, flush=True)

    def _rate(k: int, tot: int) -> str:
        lo, hi = _wilson(k, tot)
        return f"{k}/{tot} ({100*k//tot if tot else 0}%)  95% CI [{100*lo:.0f}–{100*hi:.0f}%]"

    print("  " + "-" * 84)
    print(f"  Retrieval (fact reaches context):    {_rate(retr_hits, n)}")
    if not retrieval_only:
        print(f"  Answer quality (facts, not negated): {_rate(correct_hits, n)}")
        print(f"  Provenance (sources cited):          {_rate(prov_hits, n)}")
        print(f"  Synthesis latency:                   p50 {_pct(syn_ms,50):.0f} ms · p95 {_pct(syn_ms,95):.0f} ms · avg {sum(syn_ms)/len(syn_ms):.0f} ms")

    print("\n  By category" + (" (retrieval · answer · provenance)" if not retrieval_only else " (retrieval)"))
    for cat in sorted(cats):
        d = cats[cat]
        if retrieval_only:
            print(f"    {cat:<22} {d['retr']}/{d['n']}")
        else:
            print(f"    {cat:<22} {d['retr']}/{d['n']} · {d['correct']}/{d['n']} · {d['prov']}/{d['n']}")
    try:
        print(f"  KG linkage:                        {await _kg_completeness()}")
    except Exception as e:  # noqa: BLE001
        print(f"  KG linkage:                        (unavailable: {type(e).__name__})")
    print("  Entity-extraction F1: backend/scripts/run_model_validation.py (Layer-0 model gate)\n")


async def _kg_completeness() -> str:
    from neo4j import AsyncGraphDatabase

    from api.config import Settings

    s = Settings()
    driver = AsyncGraphDatabase.driver(s.NEO4J_URI, auth=(s.NEO4J_USERNAME, s.NEO4J_PASSWORD))
    try:
        async with driver.session(database=s.NEO4J_DATABASE) as sess:
            async def scalar(cypher: str, key: str) -> int:
                rec = await (await sess.run(cypher)).single()
                return int(rec[key]) if rec and rec[key] is not None else 0

            assets = await scalar("MATCH (a:Asset) RETURN count(a) AS n", "n")
            linked = await scalar("MATCH (a:Asset)-[:KNOWLEDGE_EDGE]-() RETURN count(DISTINCT a) AS n", "n")
            edges = await scalar("MATCH ()-[k:KNOWLEDGE_EDGE]->() RETURN count(k) AS n", "n")
            verified = await scalar("MATCH ()-[k:KNOWLEDGE_EDGE]->() WHERE k.verification_status='verified' RETURN count(k) AS n", "n")
    finally:
        await driver.close()
    return (f"{linked}/{assets} assets linked ({(100*linked//assets) if assets else 0}%) · "
            f"{edges} edges ({verified} verified)")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="KAIROS domain-expert benchmark")
    ap.add_argument("--retrieval-only", action="store_true", help="skip synthesis + grading (retrieval + KG only, fast)")
    ap.add_argument("--selftest", action="store_true", help="assert the grader logic and exit (no stack needed)")
    args = ap.parse_args()
    if args.selftest:
        _selftest()
    else:
        asyncio.run(main(args.retrieval_only))

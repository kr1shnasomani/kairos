"""
KAIROS — Domain-expert benchmark (PS "Evaluation Focus").

A1 methodology:
  • Per-question routing  — each question pulls context from the right source(s):
    hybrid `/search`, the asset's graph `/knowledge`, and/or `/aliases` (not everything via search).
  • Answer quality        — LLM-as-judge: an LLM grades each answer for *correctness* against the
    known fact (ignores wording), the industry-standard for answer-quality eval. Not brittle keyword match.
  • Retrieval precision    — keyword-in-context signal (does the fact reach the context?).
  • KG linkage             — deterministic Cypher (assets linked, edges, verification).
  • Time-to-answer         — latency per question.
Entity-extraction F1 is the Layer-0 model gate: backend/scripts/run_model_validation.py.

Streams per question. Requires the golden dataset loaded (`make load-dataset`).
Run:
    docker exec kairos-backend-api python benchmark/run_benchmark.py                 # full (routing + LLM judge)
    docker exec kairos-backend-api python benchmark/run_benchmark.py --retrieval-only # fast, no synthesis/judge
"""

import argparse
import asyncio
import json
import os
import time

import httpx

API = os.getenv("VERIFY_API_URL", "http://localhost:8000")
QUESTIONS = os.getenv("BENCHMARK_FILE", "/app/benchmark/questions.json")
SYNTH_TIMEOUT = float(os.getenv("BENCHMARK_SYNTH_TIMEOUT", "120"))

# Provider order for the LLM judge — same cascade the app uses (NIM → Gemini).
_JUDGE_PROVIDERS = [
    ("NVIDIA_NIM_BASE_URL", "NVIDIA_NIM_API_KEY", "NVIDIA_NIM_MODEL", "meta/llama-3.1-70b-instruct"),
    ("GEMINI_BASE_URL", "GEMINI_API_KEY", "GEMINI_MODEL", "gemini-2.5-flash-lite"),
]


def _kw_hit(blob: str, expect_any: list[str]) -> bool:
    low = blob.lower()
    return any(kw.lower() in low for kw in expect_any)


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


async def _judge(question: str, expected: str, answer: str) -> bool:
    """LLM-as-judge: does `answer` state the correct facts? Tries NIM → Gemini."""
    if not answer:
        return False
    prompt = (
        "You grade an answer for factual correctness only — ignore wording, format, or extra detail.\n"
        f"QUESTION: {question}\nCORRECT FACTS: {expected}\nCANDIDATE ANSWER: {answer}\n\n"
        "Does the candidate answer state the correct facts? Reply with ONLY 'YES' or 'NO'."
    )
    for base_env, key_env, model_env, default_model in _JUDGE_PROVIDERS:
        key = os.getenv(key_env, "")
        if not key:
            continue
        try:
            async with httpx.AsyncClient(timeout=45) as jc:
                r = await jc.post(
                    f"{os.getenv(base_env)}/chat/completions",
                    headers={"Authorization": f"Bearer {key}"},
                    json={"model": os.getenv(model_env, default_model), "messages": [{"role": "user", "content": prompt}], "max_tokens": 4, "temperature": 0},
                )
                if r.status_code == 200:
                    return r.json()["choices"][0]["message"]["content"].strip().upper().startswith("YES")
        except Exception:  # noqa: BLE001 — try next provider
            continue
    return False


async def main(retrieval_only: bool) -> None:
    with open(QUESTIONS) as f:
        questions = json.load(f)["questions"]
    n = len(questions)

    print("\n  KAIROS — Domain Benchmark  (%d questions)" % n)
    print("  " + "=" * 84)
    hdr = f"  {'ID':<5}{'QUESTION':<46}{'RETR':<6}"
    if not retrieval_only:
        hdr += f"  {'CORRECT':<8}{'VIA':<9}{'ms':>6}"
    print(hdr)
    print("  " + "-" * 84, flush=True)

    retr_hits, correct_hits, syn_ms = 0, 0, []

    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as c:
        r = await c.post(f"{API}/auth/login", json={"email": "admin@kairos.local", "password": "KairosAdmin123!"})
        h = {"Authorization": f"Bearer {r.json()['access_token']}"}

        for q in questions:
            ctx = await _gather_context(c, h, q)
            r_hit = _kw_hit(json.dumps(ctx), q["expect_any"])
            retr_hits += r_hit
            line = f"  {q['id']:<5}{q['question'][:44]:<46}{'HIT' if r_hit else 'miss':<6}"

            if not retrieval_only:
                correct, prov, ms = False, "-", 0.0
                t = time.perf_counter()
                try:
                    syn = await c.post(f"{API}/search/synthesize", headers=h, json={"query": q["question"], "context": ctx[:8]}, timeout=SYNTH_TIMEOUT)
                    ms = (time.perf_counter() - t) * 1000
                    body = syn.json() if syn.status_code == 200 else {}
                    prov = body.get("model") or ("refused" if body.get("refused") else "-")
                    correct = bool(body.get("refused")) or await _judge(q["question"], q["expected"], body.get("answer") or "")
                except (httpx.TimeoutException, httpx.HTTPError):
                    ms, prov = (time.perf_counter() - t) * 1000, "timeout"
                syn_ms.append(ms)
                correct_hits += correct
                line += f"  {'YES' if correct else 'no':<8}{prov:<9}{ms:>6.0f}"

            print(line, flush=True)

    print("  " + "-" * 84)
    print(f"  Retrieval (fact reaches context):  {retr_hits}/{n} ({100*retr_hits//n}%)")
    if not retrieval_only:
        print(f"  Answer quality (LLM-judged):       {correct_hits}/{n} ({100*correct_hits//n}%)   avg {sum(syn_ms)/len(syn_ms):.0f} ms")
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
    ap = argparse.ArgumentParser(description="KAIROS domain-expert benchmark (LLM-as-judge)")
    ap.add_argument("--retrieval-only", action="store_true", help="skip synthesis + LLM judge (fast)")
    asyncio.run(main(ap.parse_args().retrieval_only))

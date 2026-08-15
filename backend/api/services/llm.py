"""
LLM service — synthesis (Layer 11). Provider cascade: NVIDIA NIM → OpenRouter → Gemini → Ollama.
Implements the synthesis layer with mandatory source citation enforcement
and explicit refusal for safety-critical parameter queries.
"""

import re
from collections import OrderedDict
from typing import Any

import httpx
import structlog

from api.config import Settings
from api.services.http import shared_client

log = structlog.get_logger(__name__)


class _LRU:
    """
    Bounded in-process LRU for query embeddings.

    Every search embeds its query text before touching Qdrant, so a repeated or polled
    query paid a Jina round-trip each time — the copilot, the benchmark and the graph page
    all re-issue identical queries. Embeddings are deterministic per (task, text) for a
    fixed model, so caching is safe.

    ponytail: process-local and lost on restart, which is fine for a read cache. Move to
    Redis if hit rate across replicas starts mattering — the interface is the same.
    """

    def __init__(self, maxsize: int = 512) -> None:
        self._data: OrderedDict[tuple[str, str], list[float]] = OrderedDict()
        self._maxsize = maxsize
        self.hits = 0
        self.misses = 0

    def get(self, key: tuple[str, str]) -> list[float] | None:
        if key in self._data:
            self._data.move_to_end(key)
            self.hits += 1
            return self._data[key]
        self.misses += 1
        return None

    def put(self, key: tuple[str, str], value: list[float]) -> None:
        if not value:
            return  # never cache a failed embedding
        self._data[key] = value
        self._data.move_to_end(key)
        while len(self._data) > self._maxsize:
            self._data.popitem(last=False)

    def __len__(self) -> int:
        return len(self._data)


_EMBED_CACHE = _LRU()

# Safety-critical query categories that trigger explicit refusal behavior
SAFETY_CRITICAL_CATEGORIES = {
    "max_allowable_pressure",
    "isolation_interlock_sequence",
    "torque_specification",
    "electrical_rating",
    "pressure_relief_setting",
    "safety_shutdown_setpoint",
}

# Query → safety-critical category patterns, most specific first. Order matters:
# "pressure relief setting" must not be swallowed by the generic pressure rule.
# ponytail: keyword classifier, deterministic and testable. Swap for an LLM
# classifier only if real queries start missing — every miss here silently
# disables the safety gate, so a miss must be cheap to reproduce in a test.
_CATEGORY_PATTERNS: list[tuple[str, tuple[str, ...]]] = [
    ("pressure_relief_setting", (
        "relief valve", "relief setting", "relief set", "psv", " prv", "rupture disc",
        "safety valve", "set pressure", "popping pressure",
    )),
    ("safety_shutdown_setpoint", (
        "shutdown setpoint", "shutdown set point", "trip setpoint", "trip set point",
        "trip point", "emergency shutdown", "esd setpoint", "sis setpoint", "safety setpoint",
    )),
    # NOTE: bare "isolation" is deliberately absent. It matches the *equipment name* in
    # questions like "when was isolation valve XV-203 last inspected?", which is a date
    # lookup, not a safety-parameter query — refusing it is a false positive that hides a
    # fact the vault holds. Patterns must express isolation *intent*, not just the word.
    ("isolation_interlock_sequence", (
        "isolation boundary", "isolation point", "isolation sequence", "isolation procedure",
        "isolation requirement", "safety isolation", "isolate", "interlock", "lockout",
        "lock out", "tag-out", "tagout", "tag out", "double block", "blind list",
        "permit to work sequence",
    )),
    ("torque_specification", ("torque", "tightening spec", "bolt load", "preload")),
    ("electrical_rating", (
        "electrical rating", "voltage rating", "insulation class", "insulation rating",
        "amperage", "current rating", "kv rating", "motor rating", "hazardous area classification",
    )),
    ("max_allowable_pressure", (
        "max allowable pressure", "maximum allowable pressure", "mawp", "max working pressure",
        "maximum working pressure", "max operating pressure", "maximum operating pressure",
        "design pressure", "pressure limit", "pressure rating", "max pressure", "maximum pressure",
    )),
]

# Authority levels 1–3 are regulatory / engineering / OEM sources. A safety-critical
# parameter answered only from level 4–5 (site procedure, field observation) is exactly
# the case the refusal gate exists for.
AUTHORITATIVE_LEVEL = 3

# How many of the most-relevant context items may vouch for a safety-critical answer.
_AUTHORITY_TOP_K = 3


def _authority_candidates(context: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    The context items permitted to clear the safety gate.

    The gate used to take `min(authority_level)` over the **whole** retrieved context, making it a
    property of the context *set* rather than of the evidence supporting the answer: one unrelated
    authoritative document anywhere in the context cleared it, and in the live copilot that was the
    normal case, so the gate almost never fired.

    Two filters, both derived from measured behaviour on the real corpus
    (query: "Which valves make up the isolation boundary for V-247?"):

      1. **Most relevant only.** Ranked by `relevance_score` (the RRF fusion score), NOT by
         position — `SearchService` sorts by `(authority_level, -rrf)`, so the most authoritative
         document is always first and a top-K-by-position filter would be a no-op. This drops the
         generic L1 "Applicable Standards and Statutory Provisions" list, which measured as the
         *least* relevant hit (rrf 0.0156) yet was clearing every safety refusal.

      2. **Same asset as the best evidence.** Relevance alone was not enough: two Fischer OEM
         bulletins (L3, rrf ~0.031) about `EQ-101` centrifugal-pump seals still ranked inside the
         top 3 for a question about a `V-247` valve, and an OEM bulletin for different equipment
         cannot vouch for this one. The target asset is taken from the highest-relevance item.

    Deliberately conservative in both directions: a document with no `asset_id` never vouches when
    a target asset is known, and when nothing carries a `relevance_score` the whole context is
    returned — i.e. previous behaviour — because callers that assemble context by hand (graph
    facts, elicitation) never knew to send these fields, and silently re-scoping their refusals
    would change safety behaviour based on a field they do not set.
    """
    scored = [r for r in context if r.get("relevance_score") is not None]
    if not scored:
        return list(context)

    ranked = sorted(scored, key=lambda r: r.get("relevance_score") or 0.0, reverse=True)
    top = ranked[:_AUTHORITY_TOP_K]

    target_asset = ranked[0].get("asset_id")
    if not target_asset:
        return top
    return [r for r in top if r.get("asset_id") == target_asset] or [ranked[0]]


class LLMService:
    """
    Synthesis layer — assembles retrieved knowledge into provenance-backed answers.
    NEVER originates knowledge. Only assembles what exists in the vault/graph/quarantine.
    """

    def __init__(self, settings: Settings):
        self.settings = settings
        self._nim_client: httpx.AsyncClient | None = None
        self._ollama_client: httpx.AsyncClient | None = None

    @staticmethod
    def classify_query_category(query: str) -> str | None:
        """
        Maps a free-text query onto a safety-critical category key, or None.

        Callers may pass an explicit query_category; when they don't, the synthesis
        endpoint derives it here. Without this the safety-critical refusal gate is
        unreachable — no caller in the system was ever setting the category.
        """
        q = f" {query.lower()} "
        for category, patterns in _CATEGORY_PATTERNS:
            if any(p in q for p in patterns):
                return category
        return None

    @property
    def nim_available(self) -> bool:
        return bool(self.settings.NVIDIA_NIM_API_KEY)

    @property
    def ollama_available(self) -> bool:
        return bool(self.settings.OLLAMA_BASE_URL)

    @property
    def gemini_available(self) -> bool:
        return bool(self.settings.GEMINI_API_KEY)

    @property
    def openrouter_available(self) -> bool:
        return bool(self.settings.OPENROUTER_API_KEY)

    async def synthesize(
        self,
        query: str,
        retrieved_context: list[dict[str, Any]],
        query_category: str | None = None,
        confidence_threshold: float = 0.7,
    ) -> dict[str, Any]:
        """
        Synthesizes an answer from retrieved context with mandatory source citations.

        For safety-critical parameter categories, applies explicit refusal when
        evidence confidence is below threshold — returns source documents directly
        rather than a hedged partial answer.
        """
        # Safety-critical refusal check. Two independent ways to clear the gate:
        # an explicit per-source confidence at/above threshold, OR at least one
        # regulatory/engineering/OEM-authority source. Retrieval paths that carry
        # authority_level but no confidence (hybrid search, graph facts) would
        # otherwise read as confidence 0.0 and refuse every safety query.
        if query_category in SAFETY_CRITICAL_CATEGORIES:
            max_confidence = max((r.get("confidence") or 0.0 for r in retrieved_context), default=0.0)
            gate_context = _authority_candidates(retrieved_context)
            best_authority = min((r.get("authority_level") or 5 for r in gate_context), default=5)
            if max_confidence < confidence_threshold and best_authority > AUTHORITATIVE_LEVEL:
                log.info(
                    "synthesis.safety_critical_refusal",
                    query_category=query_category,
                    max_confidence=max_confidence,
                    best_authority=best_authority,
                )
                return {
                    "answer": None,
                    "refused": True,
                    "refusal_reason": (
                        f"Safety-critical parameter query for '{query_category}' — the retrieved evidence is "
                        f"neither high-confidence (best {max_confidence:.2f}, threshold {confidence_threshold}) "
                        f"nor from an authoritative source (best authority level {best_authority}; "
                        f"level {AUTHORITATIVE_LEVEL} or better required). "
                        "Verify directly against the source documents and consult the responsible engineering authority."
                    ),
                    "sources": retrieved_context,
                    "confidence": max_confidence,
                }

        if not retrieved_context:
            return {
                "answer": None,
                "sources": [],
                "confidence": 0.0,
                "uncertainty": "No relevant evidence found in the knowledge base.",
            }

        # Build synthesis prompt
        context_block = self._format_context(retrieved_context)
        prompt = self._build_synthesis_prompt(query, context_block)

        # Provider cascade: NIM → Gemini → Ollama
        return await self._synthesize_cascade(prompt, retrieved_context)

    def _format_context(self, context: list[dict[str, Any]]) -> str:
        """Formats retrieved chunks into a structured context block."""
        blocks = []
        for i, chunk in enumerate(context, 1):
            authority = chunk.get("authority_level", "unknown")
            doc_id = chunk.get("document_id", "unknown")
            text = chunk.get("text") or chunk.get("snippet", "")
            blocks.append(f"[Source {i} | Authority Level {authority} | Document: {doc_id}]\n{text}")
        return "\n\n---\n\n".join(blocks)

    def _build_synthesis_prompt(self, query: str, context: str) -> str:
        return f"""You are the KAIROS synthesis engine for an industrial operational intelligence platform.

Your task is to answer the following query using ONLY the provided source documents.
- NEVER invent or infer information not present in the sources.
- ALWAYS cite the specific source(s) you are drawing from.
- If evidence is incomplete or conflicting, explicitly state what is known and what is not known.
- Do NOT present a confident answer when the evidence is insufficient.

QUERY: {query}

SOURCE DOCUMENTS:
{context}

Provide your answer with mandatory source citations. Format:
ANSWER: [your answer, citing source numbers]
CONFIDENCE: [0.0-1.0]
UNCERTAINTY: [anything you are not certain about]
SOURCES_USED: [comma-separated source numbers]"""

    async def _synthesize_nim(self, prompt: str, context: list[dict[str, Any]]) -> dict[str, Any]:
        """Calls NVIDIA NIM (OpenAI-compatible API)."""
        try:
            client = shared_client(self.settings.NVIDIA_NIM_TIMEOUT)
            response = await client.post(
                f"{self.settings.NVIDIA_NIM_BASE_URL}/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.settings.NVIDIA_NIM_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": self.settings.NVIDIA_NIM_MODEL,
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": self.settings.NVIDIA_NIM_MAX_TOKENS,
                    "temperature": self.settings.NVIDIA_NIM_TEMPERATURE,
                },
                timeout=self.settings.NVIDIA_NIM_TIMEOUT,
            )
            response.raise_for_status()
            data = response.json()
            answer_text = data["choices"][0]["message"]["content"]
            return {"answer": answer_text, "sources": context, "model": "nim", "raw": data}
        except Exception as e:
            rate_limited = isinstance(e, httpx.HTTPStatusError) and e.response.status_code == 429
            log.error("nim.synthesis_failed", error=str(e), exc_type=type(e).__name__, rate_limited=rate_limited)
            return {"answer": None, "error": str(e), "sources": context, "rate_limited": rate_limited, "failed_provider": "nim"}

    async def _synthesize_ollama(self, prompt: str, context: list[dict[str, Any]]) -> dict[str, Any]:
        """Calls local Ollama (fallback for offline/air-gapped deployments)."""
        try:
            client = shared_client(60.0)
            response = await client.post(
                f"{self.settings.OLLAMA_BASE_URL}/api/generate",
                json={"model": self.settings.OLLAMA_MODEL, "prompt": prompt, "stream": False},
                timeout=60.0,
            )
            response.raise_for_status()
            data = response.json()
            return {"answer": data.get("response"), "sources": context, "model": "ollama"}
        except Exception as e:
            rate_limited = isinstance(e, httpx.HTTPStatusError) and e.response.status_code == 429
            log.error("ollama.synthesis_failed", error=str(e), rate_limited=rate_limited)
            return {"answer": None, "error": str(e), "sources": context, "rate_limited": rate_limited, "failed_provider": "ollama"}

    async def _synthesize_cascade(self, prompt: str, context: list[dict[str, Any]]) -> dict[str, Any]:
        """Provider cascade: NIM → OpenRouter → Gemini → Ollama. Each tier is tried only if
        configured; on failure (answer is None) it falls through to the next. With
        only NVIDIA_NIM_API_KEY set, this is NIM-only — same behaviour as before.

        OpenRouter sits ahead of Gemini deliberately: it serves the same llama-3.1-70b as tier 1,
        so falling through to it preserves *which model answered*, while Gemini is a different
        model family and makes a run's answer-quality figure a blend of two models."""
        result: dict[str, Any] | None = None
        attempts: dict[str, dict[str, Any]] = {}
        if self.nim_available:
            result = await self._synthesize_nim(prompt, context)
            attempts["nim"] = result
        if (result is None or result.get("answer") is None) and self.openrouter_available:
            result = await self._synthesize_openrouter(prompt, context)
            attempts["openrouter"] = result
        if (result is None or result.get("answer") is None) and self.gemini_available:
            result = await self._synthesize_gemini(prompt, context)
            attempts["gemini"] = result
        if (result is None or result.get("answer") is None) and self.ollama_available:
            result = await self._synthesize_ollama(prompt, context)
            attempts["ollama"] = result
        if result is None:
            return {
                "answer": None,
                "sources": context,
                "confidence": None,
                "message": ("No LLM configured. Set NVIDIA_NIM_API_KEY, OPENROUTER_API_KEY, "
                            "GEMINI_API_KEY, or OLLAMA_BASE_URL."),
            }

        # Every tier failed. Say *why* — a provider that returned 429 is an exhausted quota,
        # which is an operational problem with a fix, not the model being wrong. Left
        # unlabelled these are indistinguishable: the benchmark scores both as a miss and the
        # UI shows both as "no answer", so a dead free tier looks like poor answer quality.
        if result.get("answer") is None:
            limited = [p for p in ("nim", "openrouter", "gemini", "ollama")
                       if attempts.get(p, {}).get("rate_limited")]
            if limited:
                result["rate_limited"] = True
                result["message"] = (
                    f"Synthesis provider quota exhausted ({', '.join(limited)} returned HTTP 429). "
                    "This is a provider limit, not a knowledge gap — retry after the quota resets."
                )
                log.warning("synthesis.all_providers_rate_limited", providers=limited)
        return result

    async def _synthesize_openrouter(self, prompt: str, context: list[dict[str, Any]]) -> dict[str, Any]:
        """
        Calls OpenRouter — tier 2, tried before Gemini because it serves the same
        meta-llama/llama-3.1-70b-instruct as tier 1, so falling back here does not change which
        model the answer came from.
        """
        try:
            client = shared_client(self.settings.OPENROUTER_TIMEOUT)
            response = await client.post(
                f"{self.settings.OPENROUTER_BASE_URL}/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.settings.OPENROUTER_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": self.settings.OPENROUTER_MODEL,
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": self.settings.NVIDIA_NIM_MAX_TOKENS,
                    "temperature": self.settings.NVIDIA_NIM_TEMPERATURE,
                },
                timeout=self.settings.OPENROUTER_TIMEOUT,
            )
            response.raise_for_status()
            data = response.json()
            answer_text = data["choices"][0]["message"]["content"]
            return {"answer": answer_text, "sources": context, "model": "openrouter", "raw": data}
        except Exception as e:
            rate_limited = isinstance(e, httpx.HTTPStatusError) and e.response.status_code == 429
            log.error("openrouter.synthesis_failed", error=str(e), exc_type=type(e).__name__, rate_limited=rate_limited)
            return {"answer": None, "error": str(e), "sources": context, "rate_limited": rate_limited,
                    "failed_provider": "openrouter"}

    async def _synthesize_gemini(self, prompt: str, context: list[dict[str, Any]]) -> dict[str, Any]:
        """Calls Gemini via Google's OpenAI-compatible endpoint — fallback when NIM fails."""
        try:
            client = shared_client(90.0)
            response = await client.post(
                f"{self.settings.GEMINI_BASE_URL}/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.settings.GEMINI_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": self.settings.GEMINI_MODEL,
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": self.settings.NVIDIA_NIM_MAX_TOKENS,
                    "temperature": self.settings.NVIDIA_NIM_TEMPERATURE,
                },
                timeout=90.0,
            )
            response.raise_for_status()
            data = response.json()
            answer_text = data["choices"][0]["message"]["content"]
            return {"answer": answer_text, "sources": context, "model": "gemini", "raw": data}
        except Exception as e:
            rate_limited = isinstance(e, httpx.HTTPStatusError) and e.response.status_code == 429
            log.error("gemini.synthesis_failed", error=str(e), exc_type=type(e).__name__, rate_limited=rate_limited)
            return {"answer": None, "error": str(e), "sources": context, "rate_limited": rate_limited, "failed_provider": "gemini"}

    @staticmethod
    def parse_synthesis_response(text: str) -> dict[str, Any]:
        """
        Extracts structured fields from the synthesis prompt output.
        Expected format (from _build_synthesis_prompt):
          ANSWER: ...
          CONFIDENCE: 0.0-1.0
          UNCERTAINTY: ...
          SOURCES_USED: 1, 2, 3
        """
        out: dict[str, Any] = {"answer": None, "confidence": None, "uncertainty": None, "sources_used": []}
        for key, field in [
            ("ANSWER", "answer"),
            ("CONFIDENCE", "confidence"),
            ("UNCERTAINTY", "uncertainty"),
            ("SOURCES_USED", "sources_used"),
        ]:
            m = re.search(rf"^{key}:\s*(.+?)(?=\n[A-Z_]+:|$)", text, re.MULTILINE | re.DOTALL)
            if m:
                out[field] = m.group(1).strip()
        try:
            out["confidence"] = float(out["confidence"]) if out["confidence"] else None
        except (ValueError, TypeError):
            out["confidence"] = None
        raw_sources = out.get("sources_used") or ""
        out["sources_used"] = [int(x.strip()) for x in str(raw_sources).split(",") if x.strip().isdigit()]
        return out

    async def rca_synthesize(
        self,
        failure_code: str,
        timeline: list[dict[str, Any]],
        evidence: list[dict[str, Any]],
    ) -> dict[str, Any]:
        """
        Generates an RCA pack via NIM/Ollama.
        Returns raw LLM answer dict; caller parses hypotheses via parse_rca_response().
        Falls back gracefully when no LLM is configured.
        """
        timeline_text = "\n".join(
            f"- [{e.get('occurred_at', '')}] {e.get('event_type', 'event')}: {e.get('description', '')}"
            for e in timeline
        ) or "No events found in the 90-day window."

        evidence_text = self._format_context(evidence) if evidence else "No evidence documents found."

        prompt = f"""You are the KAIROS RCA engine for an industrial operational intelligence platform.

Generate a Root Cause Analysis (RCA) pack for failure code: {failure_code}

FAILURE TIMELINE (chronological):
{timeline_text}

EVIDENCE DOCUMENTS:
{evidence_text}

Instructions:
- Rank failure mode hypotheses by evidence weight (1.0 = fully supported, 0.0 = speculative).
- Cite every hypothesis to the specific source document_id(s) from the evidence above.
- NEVER invent information not present in the sources.

Respond in this exact format:
HYPOTHESES:
1. [hypothesis text] | evidence_weight: [0.0-1.0] | sources: [document_id, document_id]
2. [hypothesis text] | evidence_weight: [0.0-1.0] | sources: [document_id]

CONFIDENCE: [0.0-1.0]
UNCERTAINTY: [what is not yet known or requires further investigation]"""

        return await self._synthesize_cascade(prompt, evidence)

    @staticmethod
    def parse_rca_response(text: str) -> dict[str, Any]:
        """
        Parses LLM RCA output into structured hypotheses list.
        Expected format from rca_synthesize prompt:
          HYPOTHESES:
          1. text | evidence_weight: 0.8 | sources: DOC-A, DOC-B
          CONFIDENCE: 0.75
        """
        hypotheses: list[dict[str, Any]] = []

        hyp_match = re.search(r"HYPOTHESES:\n(.*?)(?=\n[A-Z]+:|$)", text, re.DOTALL)
        if hyp_match:
            for line in hyp_match.group(1).strip().splitlines():
                line = line.strip()
                if not line or not re.match(r"^\d+\.", line):
                    continue
                parts = [p.strip() for p in line.split("|")]
                hyp_text = re.sub(r"^\d+\.\s*", "", parts[0]).strip()
                weight = 0.5
                sources: list[str] = []
                for part in parts[1:]:
                    if "evidence_weight" in part:
                        m = re.search(r"[\d.]+", part.split(":", 1)[-1])
                        if m:
                            try:
                                weight = float(m.group())
                            except ValueError:
                                pass
                    elif "sources" in part:
                        raw = part.split(":", 1)[-1].strip()
                        sources = [s.strip() for s in raw.split(",") if s.strip()]
                if hyp_text:
                    hypotheses.append({"hypothesis": hyp_text, "evidence_weight": weight, "sources": sources})

        conf_match = re.search(r"CONFIDENCE:\s*([\d.]+)", text)
        confidence = float(conf_match.group(1)) if conf_match else None

        return {"hypotheses": hypotheses, "confidence": confidence}

    @property
    def jina_available(self) -> bool:
        return bool(self.settings.JINA_API_KEY)

    async def embed(self, text: str, task: str = "retrieval.passage") -> list[float]:
        """
        Generates text embeddings (1024-dim, jina-embeddings-v3).
        Primary: Jina AI — keeps NIM key reserved for LLM synthesis.
        Fallback: Ollama nomic-embed-text (local, air-gapped deployments).
        task: "retrieval.passage" for indexing, "retrieval.query" for search queries.
        """
        if self.jina_available:
            return await self._embed_jina(text, task)
        return await self._embed_ollama(text)

    async def _embed_jina(self, text: str, task: str) -> list[float]:
        cache_key = (task, text)
        cached = _EMBED_CACHE.get(cache_key)
        if cached is not None:
            return cached

        try:
            client = shared_client(30.0)
            response = await client.post(
                self.settings.JINA_EMBED_URL,
                headers={"Authorization": f"Bearer {self.settings.JINA_API_KEY}"},
                json={
                "model": self.settings.JINA_EMBED_MODEL,
                "input": [text],
                "task": task,
                "dimensions": self.settings.EMBEDDING_DIMENSION,
                "embedding_type": "float",
                },
                timeout=30.0,
            )
            response.raise_for_status()
            vector = response.json()["data"][0]["embedding"]
        except Exception as e:
            log.error("embed.jina_failed", error=str(e))
            return await self._embed_ollama(text)

        _EMBED_CACHE.put(cache_key, vector)
        return vector

    async def _embed_ollama(self, text: str) -> list[float]:
        try:
            client = shared_client(30.0)
            response = await client.post(
                f"{self.settings.OLLAMA_BASE_URL}/api/embeddings",
                json={"model": self.settings.OLLAMA_EMBED_MODEL, "prompt": text},
                timeout=30.0,
            )
            response.raise_for_status()
            return response.json()["embedding"]
        except Exception as e:
            log.error("embed.ollama_failed", error=str(e))
            return []

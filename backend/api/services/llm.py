"""
LLM service — NVIDIA NIM + Ollama synthesis (Layer 11).
Implements the synthesis layer with mandatory source citation enforcement
and explicit refusal for safety-critical parameter queries.
"""

import re
from typing import Any, Dict, List, Optional

import httpx
import structlog

from api.config import Settings

log = structlog.get_logger(__name__)

# Safety-critical query categories that trigger explicit refusal behavior
SAFETY_CRITICAL_CATEGORIES = {
    "max_allowable_pressure",
    "isolation_interlock_sequence",
    "torque_specification",
    "electrical_rating",
    "pressure_relief_setting",
    "safety_shutdown_setpoint",
}


class LLMService:
    """
    Synthesis layer — assembles retrieved knowledge into provenance-backed answers.
    NEVER originates knowledge. Only assembles what exists in the vault/graph/quarantine.
    """

    def __init__(self, settings: Settings):
        self.settings = settings
        self._nim_client: Optional[httpx.AsyncClient] = None
        self._ollama_client: Optional[httpx.AsyncClient] = None

    @property
    def nim_available(self) -> bool:
        return bool(self.settings.NVIDIA_NIM_API_KEY)

    @property
    def ollama_available(self) -> bool:
        return bool(self.settings.OLLAMA_BASE_URL)

    async def synthesize(
        self,
        query: str,
        retrieved_context: List[Dict[str, Any]],
        query_category: Optional[str] = None,
        confidence_threshold: float = 0.7,
    ) -> Dict[str, Any]:
        """
        Synthesizes an answer from retrieved context with mandatory source citations.

        For safety-critical parameter categories, applies explicit refusal when
        evidence confidence is below threshold — returns source documents directly
        rather than a hedged partial answer.
        """
        # Safety-critical refusal check
        if query_category in SAFETY_CRITICAL_CATEGORIES:
            max_confidence = max((r.get("confidence", 0) for r in retrieved_context), default=0)
            if max_confidence < confidence_threshold:
                log.info(
                    "synthesis.safety_critical_refusal",
                    query_category=query_category,
                    max_confidence=max_confidence,
                )
                return {
                    "answer": None,
                    "refused": True,
                    "refusal_reason": (
                        f"Safety-critical parameter query for '{query_category}' — "
                        f"evidence confidence ({max_confidence:.2f}) is below threshold ({confidence_threshold}). "
                        "Please verify directly with source documents and consult the appropriate engineering authority."
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

        # Try NIM first, fall back to Ollama
        if self.nim_available:
            return await self._synthesize_nim(prompt, retrieved_context)
        elif self.ollama_available:
            return await self._synthesize_ollama(prompt, retrieved_context)
        else:
            return {
                "answer": None,
                "sources": retrieved_context,
                "confidence": None,
                "message": "No LLM configured. Set NVIDIA_NIM_API_KEY or ensure Ollama is running.",
            }

    def _format_context(self, context: List[Dict[str, Any]]) -> str:
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

    async def _synthesize_nim(self, prompt: str, context: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Calls NVIDIA NIM (OpenAI-compatible API)."""
        try:
            async with httpx.AsyncClient(timeout=90.0) as client:
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
                )
                response.raise_for_status()
                data = response.json()
                answer_text = data["choices"][0]["message"]["content"]
                return {"answer": answer_text, "sources": context, "model": "nim", "raw": data}
        except Exception as e:
            log.error("nim.synthesis_failed", error=str(e), exc_type=type(e).__name__)
            return {"answer": None, "error": str(e), "sources": context}

    async def _synthesize_ollama(self, prompt: str, context: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Calls local Ollama (fallback for offline/air-gapped deployments)."""
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    f"{self.settings.OLLAMA_BASE_URL}/api/generate",
                    json={"model": self.settings.OLLAMA_MODEL, "prompt": prompt, "stream": False},
                )
                response.raise_for_status()
                data = response.json()
                return {"answer": data.get("response"), "sources": context, "model": "ollama"}
        except Exception as e:
            log.error("ollama.synthesis_failed", error=str(e))
            return {"answer": None, "error": str(e), "sources": context}

    @staticmethod
    def parse_synthesis_response(text: str) -> Dict[str, Any]:
        """
        Extracts structured fields from the synthesis prompt output.
        Expected format (from _build_synthesis_prompt):
          ANSWER: ...
          CONFIDENCE: 0.0-1.0
          UNCERTAINTY: ...
          SOURCES_USED: 1, 2, 3
        """
        out: Dict[str, Any] = {"answer": None, "confidence": None, "uncertainty": None, "sources_used": []}
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
        timeline: List[Dict[str, Any]],
        evidence: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
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

        if self.nim_available:
            return await self._synthesize_nim(prompt, evidence)
        elif self.ollama_available:
            return await self._synthesize_ollama(prompt, evidence)
        return {
            "answer": None,
            "sources": evidence,
            "confidence": None,
            "message": "No LLM configured. Set NVIDIA_NIM_API_KEY or ensure Ollama is running.",
        }

    @staticmethod
    def parse_rca_response(text: str) -> Dict[str, Any]:
        """
        Parses LLM RCA output into structured hypotheses list.
        Expected format from rca_synthesize prompt:
          HYPOTHESES:
          1. text | evidence_weight: 0.8 | sources: DOC-A, DOC-B
          CONFIDENCE: 0.75
        """
        hypotheses: List[Dict[str, Any]] = []

        hyp_match = re.search(r"HYPOTHESES:\n(.*?)(?=\n[A-Z]+:|$)", text, re.DOTALL)
        if hyp_match:
            for line in hyp_match.group(1).strip().splitlines():
                line = line.strip()
                if not line or not re.match(r"^\d+\.", line):
                    continue
                parts = [p.strip() for p in line.split("|")]
                hyp_text = re.sub(r"^\d+\.\s*", "", parts[0]).strip()
                weight = 0.5
                sources: List[str] = []
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

    async def embed(self, text: str, task: str = "retrieval.passage") -> List[float]:
        """
        Generates text embeddings (1024-dim, jina-embeddings-v3).
        Primary: Jina AI — keeps NIM key reserved for LLM synthesis.
        Fallback: Ollama nomic-embed-text (local, air-gapped deployments).
        task: "retrieval.passage" for indexing, "retrieval.query" for search queries.
        """
        if self.jina_available:
            return await self._embed_jina(text, task)
        return await self._embed_ollama(text)

    async def _embed_jina(self, text: str, task: str) -> List[float]:
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
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
                )
                response.raise_for_status()
                return response.json()["data"][0]["embedding"]
        except Exception as e:
            log.error("embed.jina_failed", error=str(e))
            return await self._embed_ollama(text)

    async def _embed_ollama(self, text: str) -> List[float]:
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{self.settings.OLLAMA_BASE_URL}/api/embeddings",
                    json={"model": self.settings.OLLAMA_EMBED_MODEL, "prompt": text},
                )
                response.raise_for_status()
                return response.json()["embedding"]
        except Exception as e:
            log.error("embed.ollama_failed", error=str(e))
            return []

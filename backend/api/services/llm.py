"""
LLM service — NVIDIA NIM + Ollama synthesis (Layer 11).
Implements the synthesis layer with mandatory source citation enforcement
and explicit refusal for safety-critical parameter queries.
"""

import json
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
            async with httpx.AsyncClient(timeout=30.0) as client:
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
            log.error("nim.synthesis_failed", error=str(e))
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

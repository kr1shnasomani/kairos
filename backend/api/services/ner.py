"""
NER service — Layer 3: Named Entity Recognition.
Primary: NVIDIA NIM mistral-14b via JSON prompt.
Fallback: Ollama llama3.1:8b (local).
"""

import json
import os
import re
from typing import Any, Dict, List, Optional

import httpx
import structlog

log = structlog.get_logger(__name__)

_NIM_URL = "https://integrate.api.nvidia.com/v1/chat/completions"

_ASSET_TAG_RE = re.compile(r'\b([A-Z]{1,4}-\d{2,4}[A-Z]?)\b')

_NER_PROMPT = """Extract named entities from the industrial text below. Return ONLY a valid JSON array, no other text.

Entity types:
- ASSET_TAG: Equipment tag numbers (P-101, V-247, FV-1234A, HX-301)
- PROCESS_PARAMETER: Measurements with values/units (pressure, temperature, flow rate)
- FAILURE_MODE: Failure descriptions (bearing wear, seal failure, corrosion)
- REGULATION: Standards and regulatory references (OISD-117, ISO 45001, CEA Reg 4.2)
- ACTION_VERB: Maintenance actions (replaced, inspected, calibrated)
- MATERIAL: Material grades or part numbers
- PERSON: Personnel names or roles
- LOCATION: Plant areas, sections, units
- DATE: Dates and time references
- ORGANIZATION: Vendors, contractors, regulatory bodies

Output format:
[{{"text": "P-101", "entity_type": "ASSET_TAG", "confidence": 0.95}}, ...]

Text: {text}"""


class NERService:
    def __init__(self):
        self._nim_key = os.getenv("NVIDIA_NIM_API_KEY", "")
        self._nim_model = os.getenv("NVIDIA_NIM_NER_MODEL", "mistralai/ministral-14b-instruct-2512")
        self._ollama_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
        self._ollama_ner_model = os.getenv("OLLAMA_NER_MODEL", "llama3.1:8b")

    async def extract_entities(
        self,
        text: str,
        language_hint: Optional[str] = None,
        confidence_threshold: float = 0.5,
    ) -> Dict[str, Any]:
        if self._nim_key:
            result = await self._extract_via_nim(text)
            if result is not None:
                return result

        result = await self._extract_via_ollama(text)
        if result is not None:
            return result

        return self._regex_fallback(text)

    async def _extract_via_nim(self, text: str) -> Optional[Dict[str, Any]]:
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    _NIM_URL,
                    headers={"Authorization": f"Bearer {self._nim_key}"},
                    json={
                        "model": self._nim_model,
                        "messages": [{"role": "user", "content": _NER_PROMPT.format(text=text[:2000])}],
                        "max_tokens": 1024,
                        "temperature": 0.0,
                    },
                )
                resp.raise_for_status()
                content = resp.json()["choices"][0]["message"]["content"].strip()
                return self._parse_response(content, source="nim")
        except Exception as exc:
            log.warning("ner.nim_failed", error=str(exc))
            return None

    async def _extract_via_ollama(self, text: str) -> Optional[Dict[str, Any]]:
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    f"{self._ollama_url}/api/chat",
                    json={
                        "model": self._ollama_ner_model,
                        "messages": [{"role": "user", "content": _NER_PROMPT.format(text=text[:2000])}],
                        "stream": False,
                        "options": {"temperature": 0.0},
                    },
                )
                resp.raise_for_status()
                content = resp.json()["message"]["content"].strip()
                return self._parse_response(content, source="ollama")
        except Exception as exc:
            log.warning("ner.ollama_failed", error=str(exc))
            return None

    def _parse_response(self, content: str, source: str) -> Optional[Dict[str, Any]]:
        try:
            # Strip markdown code fences if present
            content = re.sub(r"```(?:json)?|```", "", content).strip()
            raw = json.loads(content)
            if not isinstance(raw, list):
                return None

            entities = []
            low_confidence = []
            for item in raw:
                if not isinstance(item, dict) or "text" not in item or "entity_type" not in item:
                    continue
                confidence = float(item.get("confidence", 0.85))
                entity = {
                    "text": item["text"],
                    "entity_type": item["entity_type"],
                    "confidence": round(confidence, 4),
                    "start": None,
                    "end": None,
                    "requires_review": confidence < 0.7,
                }
                entities.append(entity)
                if confidence < 0.7:
                    low_confidence.append(entity)

            log.info("ner.complete", source=source, entity_count=len(entities))
            return {
                "entities": entities,
                "low_confidence_spans": low_confidence,
                "requires_annotation": len(low_confidence) > 0,
                "total_entities": len(entities),
                "model": source,
            }
        except (json.JSONDecodeError, ValueError) as exc:
            log.warning("ner.parse_failed", source=source, error=str(exc))
            return None

    def _regex_fallback(self, text: str) -> Dict[str, Any]:
        entities = []
        for match in _ASSET_TAG_RE.finditer(text.upper()):
            entities.append({
                "text": match.group(1),
                "entity_type": "ASSET_TAG",
                "confidence": 0.9,
                "start": match.start(),
                "end": match.end(),
                "requires_review": False,
            })
        log.info("ner.regex_fallback", entity_count=len(entities))
        return {
            "entities": entities,
            "low_confidence_spans": [],
            "requires_annotation": False,
            "total_entities": len(entities),
            "model": "regex",
        }

    def resolve_asset_tag(self, raw_tag: str, alias_map: Dict[str, str]) -> Optional[str]:
        normalized = raw_tag.strip().upper().replace(" ", "")
        return alias_map.get(normalized) or alias_map.get(raw_tag.strip())

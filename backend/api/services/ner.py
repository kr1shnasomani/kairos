"""
NER service — Layer 3: Named Entity Recognition.
Uses mXLM-RoBERTa fine-tuned for industrial entities across English, Hindi, and Hinglish.
"""

from typing import Any, Dict, List, Optional
import structlog

log = structlog.get_logger(__name__)

# Industrial entity types recognized by the NER model
INDUSTRIAL_ENTITY_TYPES = [
    "ASSET_TAG",          # Equipment tag numbers: P-101, V-247, EQ-101
    "PROCESS_PARAMETER",  # Temperatures, pressures, flow rates
    "MATERIAL",           # Material grades, part numbers
    "PERSON",             # Personnel names and roles
    "DATE",               # Dates and time references
    "REGULATION",         # Regulatory clauses (OISD-117, CEA Reg. 4.2)
    "FAILURE_MODE",       # Failure descriptions (seal failure, bearing wear)
    "ACTION_VERB",        # Maintenance actions (replaced, inspected, calibrated)
    "LOCATION",           # Plant areas, sections, units
    "ORGANIZATION",       # Vendors, regulatory bodies
]


class NERService:
    """
    Named entity recognition for industrial documents.
    Primary model: mXLM-RoBERTa (multilingual, handles Hinglish code-switching).
    Active learning loop: low-confidence extractions surface for inline correction by operators.
    """

    def __init__(self, model_name: str = "xlm-roberta-large", cache_dir: Optional[str] = None):
        self.model_name = model_name
        self.cache_dir = cache_dir
        self._pipeline = None

    def _get_pipeline(self):
        if self._pipeline is None:
            try:
                from transformers import pipeline
                self._pipeline = pipeline(
                    "token-classification",
                    model=self.model_name,
                    aggregation_strategy="simple",
                    device=-1,  # CPU; set to 0 for GPU
                )
                log.info("ner.initialized", model=self.model_name)
            except ImportError:
                log.warning("ner.transformers_not_installed", hint="pip install -r requirements-ml.txt")
                self._pipeline = "unavailable"
        return self._pipeline

    async def extract_entities(
        self,
        text: str,
        language_hint: Optional[str] = None,
        confidence_threshold: float = 0.7,
    ) -> Dict[str, Any]:
        """
        Extracts industrial entities from text.
        Returns entities with confidence scores; items below threshold flagged for active learning.
        """
        pipeline = self._get_pipeline()
        if pipeline == "unavailable":
            return {
                "entities": [],
                "low_confidence_spans": [],
                "requires_annotation": False,
                "error": "Transformers not installed — run: pip install -r requirements-ml.txt",
            }

        try:
            raw_entities = pipeline(text[:512])  # Model max length guard
            entities = []
            low_confidence_spans = []

            for ent in raw_entities:
                entity = {
                    "text": ent["word"],
                    "entity_type": ent.get("entity_group", "UNKNOWN"),
                    "confidence": float(ent["score"]),
                    "start": ent["start"],
                    "end": ent["end"],
                    "requires_review": ent["score"] < confidence_threshold,
                }
                entities.append(entity)
                if ent["score"] < confidence_threshold:
                    low_confidence_spans.append(entity)

            return {
                "entities": entities,
                "low_confidence_spans": low_confidence_spans,
                "requires_annotation": len(low_confidence_spans) > 0,
                "total_entities": len(entities),
            }
        except Exception as e:
            log.error("ner.extraction_failed", error=str(e))
            return {"entities": [], "low_confidence_spans": [], "requires_annotation": False, "error": str(e)}

    def resolve_asset_tag(self, raw_tag: str, alias_map: Dict[str, str]) -> Optional[str]:
        """
        Resolves a raw tag string to a canonical asset ID using the alias map.
        Returns None if no match found (routes to human review, not AI inference).
        """
        # Normalize: strip whitespace, uppercase
        normalized = raw_tag.strip().upper().replace(" ", "")
        return alias_map.get(normalized) or alias_map.get(raw_tag.strip())

"""
Model Validation Worker — Layer 0: Rolling validation corpus and model gate.
Evaluates NER model accuracy against human-verified ground truth entities.
"""

import asyncio
import sys

sys.path.insert(0, "/app")

from collections import defaultdict
from typing import Any

import structlog

from workers.celery_app import celery_app

log = structlog.get_logger(__name__)


@celery_app.task(
    queue="validation",
    name="workers.model_validation.run_model_gate",
    acks_late=True,
    time_limit=600,
    soft_time_limit=540,
)
def run_model_gate(model_name: str) -> dict[str, Any]:
    return asyncio.run(_run_gate(model_name))


async def _run_gate(model_name: str) -> dict[str, Any]:
    from elasticsearch import AsyncElasticsearch
    from supabase import create_client

    from api.config import Settings
    from api.services.ner import NERService

    settings = Settings()
    supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)

    es_kwargs: dict = {"hosts": [settings.ELASTICSEARCH_URL]}
    if settings.ELASTICSEARCH_USERNAME:
        es_kwargs["basic_auth"] = (settings.ELASTICSEARCH_USERNAME, settings.ELASTICSEARCH_PASSWORD)
    es = AsyncElasticsearch(**es_kwargs)

    ner = NERService(model=model_name)  # the gate must score the model it was asked about
    try:
        corpus_result = await asyncio.to_thread(
            lambda: supabase.table("validation_corpus").select("*").execute()
        )
        corpus = corpus_result.data or []

        if not corpus:
            return {
                "model_name": model_name,
                "corpus_size": 0,
                "precision": 0.0,
                "recall": 0.0,
                "f1": 0.0,
                "passed": False,
                "by_entity_type": {},
                "error": "empty corpus",
            }

        metrics = await evaluate(ner, es, corpus, settings)

        # Per-asset-class scoring (Layer 0). The architecture is explicit: a model that passes on
        # global metrics but fails on a specific class must be blocked *for that class*. A single
        # global F1 cannot express that, so partition the corpus and score each class.
        #
        # Partitioning costs no extra model calls — each document belongs to exactly one class,
        # so every document is still evaluated once.
        class_map = await _document_asset_classes(supabase, [row["document_id"] for row in corpus])
        partitions: dict[str, list[dict[str, Any]]] = {}
        for row in corpus:
            partitions.setdefault(class_map.get(row["document_id"], "unclassified"), []).append(row)

        by_asset_class: dict[str, Any] = {}
        for asset_class, subset in partitions.items():
            sub_metrics = await evaluate(ner, es, subset, settings)
            by_asset_class[asset_class] = {
                "precision": sub_metrics["precision"],
                "recall": sub_metrics["recall"],
                "f1": sub_metrics["f1"],
                "corpus_size": len(subset),
            }

        # Fetch incumbent baseline (last successful run) from audit_log
        baseline_result = await asyncio.to_thread(
            lambda: supabase.table("audit_log")
            .select("details")
            .eq("action", "model_gate_result")
            .order("timestamp", desc=True)
            .limit(1)
            .execute()
        )
        passed = True
        regressed_classes: list[str] = []
        if baseline_result.data:
            baseline_details = baseline_result.data[0].get("details", {}) or {}
            baseline_types = baseline_details.get("by_entity_type", {})
            for etype, scores in metrics["by_entity_type"].items():
                if scores["f1"] < baseline_types.get(etype, {}).get("f1", 0.0):
                    passed = False
                    break

            # A per-class regression blocks that class even when the global score holds.
            baseline_classes = baseline_details.get("by_asset_class", {})
            for asset_class, scores in by_asset_class.items():
                prior = baseline_classes.get(asset_class, {}).get("f1")
                if prior is not None and scores["f1"] < prior:
                    regressed_classes.append(asset_class)

        result: dict[str, Any] = {
            "model_name": model_name,
            "corpus_size": len(corpus),
            "precision": metrics["precision"],
            "recall": metrics["recall"],
            "f1": metrics["f1"],
            "passed": passed,
            "by_entity_type": metrics["by_entity_type"],
            "by_asset_class": by_asset_class,
            "regressed_asset_classes": regressed_classes,
            # Report-only unless explicitly enabled — see Settings.MODEL_GATE_ENFORCE.
            "enforcement": "enforced" if settings.MODEL_GATE_ENFORCE else "advisory_only",
            "blocked_asset_classes": regressed_classes if settings.MODEL_GATE_ENFORCE else [],
        }

        await asyncio.to_thread(
            lambda: supabase.table("audit_log").insert({
                "action": "model_gate_result",
                "entity_type": "model_gate",
                "entity_id": model_name,
                "performed_by": "system",
                "details": result,
            }).execute()
        )

        log.info("model_gate.complete", model_name=model_name, f1=result["f1"], passed=passed)
        return result
    finally:
        await es.close()


def _span_match(pred_text: str, gt_text_lower: str) -> bool:
    """Partial-match: predicted and ground-truth spans overlap (one contains the other),
    case-insensitive. Standard relaxed NER scoring; `gt_text_lower` is already lowercased.
    The contained side must be >=4 chars so a stray "18" can't match "PG-18"."""
    a = pred_text.strip().lower()
    if not a:
        return False
    if a == gt_text_lower:
        return True
    shorter, longer = (a, gt_text_lower) if len(a) <= len(gt_text_lower) else (gt_text_lower, a)
    return len(shorter) >= 4 and shorter in longer


async def evaluate(
    ner: Any,
    es: Any,
    corpus: list[dict[str, Any]],
    settings: Any,
) -> dict[str, Any]:
    """Run NER over corpus documents and compute precision/recall/F1 per entity type."""
    doc_ids = list({row["document_id"] for row in corpus})

    doc_texts: dict[str, str] = {}
    for doc_id in doc_ids:
        try:
            resp = await es.search(
                index=settings.ELASTICSEARCH_INDEX_DOCUMENTS,
                body={
                    "query": {"term": {"document_id": doc_id}},
                    "_source": ["content", "text"],
                    "size": 1,
                },
            )
            hits = resp["hits"]["hits"]
            if hits:
                src = hits[0]["_source"]
                doc_texts[doc_id] = src.get("content") or src.get("text") or ""
        except Exception as exc:
            log.warning("model_gate.doc_fetch_failed", doc_id=doc_id, error=str(exc))

    # Run NER once per unique document (not per corpus row) — fewer model calls and no intra-run
    # variance from re-extracting the same doc, so a single flaky call can't spuriously miss.
    doc_predictions: dict[str, list[dict[str, Any]]] = {}
    for doc_id in doc_ids:
        text = doc_texts.get(doc_id)
        if text is None:  # doc not indexed — score each row against its own entity text as a fallback
            continue
        try:
            ner_result = await ner.extract_entities(text)
            doc_predictions[doc_id] = ner_result.get("entities", []) if ner_result else []
        except Exception as exc:
            log.warning("model_gate.ner_failed", doc_id=doc_id, error=str(exc))
            doc_predictions[doc_id] = []

    by_type: dict[str, dict[str, int]] = defaultdict(lambda: {"tp": 0, "fp": 0, "fn": 0})

    for row in corpus:
        doc_id = row["document_id"]
        gt_text = row["entity_text"].strip().lower()
        gt_type = row["entity_type"]

        if doc_id in doc_predictions:
            predicted = doc_predictions[doc_id]
        else:  # unindexed doc: extract from the entity text itself
            try:
                ner_result = await ner.extract_entities(row["entity_text"])
                predicted = ner_result.get("entities", []) if ner_result else []
            except Exception as exc:
                log.warning("model_gate.ner_failed", doc_id=doc_id, error=str(exc))
                predicted = []

        # Partial (span-overlap) match — the standard for NER eval: a prediction of
        # "FISCHER PUMPS LTD." credits the ground-truth "Fischer". Exact whole-string equality
        # under-counts multi-word entities the model extracts with a broader span.
        predicted_types_for_text = {
            e["entity_type"]
            for e in predicted
            if _span_match(e.get("text", ""), gt_text)
        }

        if gt_type in predicted_types_for_text:
            by_type[gt_type]["tp"] += 1
        else:
            by_type[gt_type]["fn"] += 1

        for e in predicted:
            if _span_match(e.get("text", ""), gt_text) and e.get("entity_type") != gt_type:
                by_type[e["entity_type"]]["fp"] += 1

    entity_metrics: dict[str, dict[str, Any]] = {}
    total_tp = total_fp = total_fn = 0

    for etype, counts in by_type.items():
        tp, fp, fn = counts["tp"], counts["fp"], counts["fn"]
        total_tp += tp
        total_fp += fp
        total_fn += fn
        p = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        r = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        f1 = 2 * p * r / (p + r) if (p + r) > 0 else 0.0
        entity_metrics[etype] = {
            "precision": round(p, 4),
            "recall": round(r, 4),
            "f1": round(f1, 4),
            "count": tp + fn,
        }

    overall_p = total_tp / (total_tp + total_fp) if (total_tp + total_fp) > 0 else 0.0
    overall_r = total_tp / (total_tp + total_fn) if (total_tp + total_fn) > 0 else 0.0
    overall_f1 = 2 * overall_p * overall_r / (overall_p + overall_r) if (overall_p + overall_r) > 0 else 0.0

    return {
        "precision": round(overall_p, 4),
        "recall": round(overall_r, 4),
        "f1": round(overall_f1, 4),
        "by_entity_type": entity_metrics,
    }


async def _document_asset_classes(supabase, document_ids: list[str]) -> dict[str, str]:
    """
    Map each corpus document to the equipment class of the asset it is linked to.

    `documents -> document_asset_links -> assets.equipment_class`. Documents with no asset link
    fall into "unclassified" rather than being dropped: excluding them would quietly shrink the
    corpus a gate reports on, which is the kind of silent narrowing Layer 0 exists to prevent.
    """
    unique_ids = list({d for d in document_ids if d})
    if not unique_ids:
        return {}

    links = await asyncio.to_thread(
        lambda: supabase.table("document_asset_links")
        .select("document_id, asset_id")
        .in_("document_id", unique_ids)
        .execute()
    )
    doc_to_asset = {r["document_id"]: r["asset_id"] for r in (links.data or [])}
    if not doc_to_asset:
        return {}

    assets = await asyncio.to_thread(
        lambda: supabase.table("assets")
        .select("asset_id, equipment_class")
        .in_("asset_id", list(set(doc_to_asset.values())))
        .execute()
    )
    asset_to_class = {r["asset_id"]: r.get("equipment_class") or "unclassified" for r in (assets.data or [])}
    return {doc: asset_to_class.get(asset, "unclassified") for doc, asset in doc_to_asset.items()}

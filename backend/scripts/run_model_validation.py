"""
CLI: run NER model validation against the rolling validation corpus.

Usage (inside Docker):
    python scripts/run_model_validation.py --model-name mistralai/ministral-14b-instruct-2512

Outputs per-entity-type precision, recall, F1 and overall metrics to stdout.
"""

import argparse
import asyncio
import json
import sys

sys.path.insert(0, "/app")


def main() -> None:
    parser = argparse.ArgumentParser(description="Run NER model validation against validation_corpus")
    parser.add_argument("--model-name", required=True, help="Model identifier label for this run")
    args = parser.parse_args()

    result = asyncio.run(_run(args.model_name))
    print(json.dumps(result, indent=2))
    sys.exit(0 if result.get("passed") else 1)


async def _run(model_name: str) -> dict:
    from api.config import Settings
    from api.services.ner import NERService
    from elasticsearch import AsyncElasticsearch
    from supabase import create_client
    from workers.model_validation import evaluate

    settings = Settings()
    supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)

    es_kwargs: dict = {"hosts": [settings.ELASTICSEARCH_URL]}
    if settings.ELASTICSEARCH_USERNAME:
        es_kwargs["basic_auth"] = (settings.ELASTICSEARCH_USERNAME, settings.ELASTICSEARCH_PASSWORD)
    es = AsyncElasticsearch(**es_kwargs)

    ner = NERService()
    try:
        corpus_result = supabase.table("validation_corpus").select("*").execute()
        corpus = corpus_result.data or []

        if not corpus:
            print("WARNING: validation_corpus is empty — no metrics to compute", file=sys.stderr)
            return {"model_name": model_name, "corpus_size": 0, "passed": False}

        print(f"Evaluating {len(corpus)} corpus entries for model: {model_name}", file=sys.stderr)
        metrics = await evaluate(ner, es, corpus, settings)

        return {
            "model_name": model_name,
            "corpus_size": len(corpus),
            **metrics,
        }
    finally:
        await es.close()


if __name__ == "__main__":
    main()

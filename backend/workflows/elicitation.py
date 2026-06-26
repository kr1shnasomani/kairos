"""
Elicitation workflow — Temporal.io durable workflow for structured knowledge capture.
Manages multi-session off-boarding interviews and work order closeout micro-interviews.
"""

from datetime import timedelta
from typing import Any, Dict

import structlog
from temporalio import activity, workflow

log = structlog.get_logger(__name__)


@activity.defn
async def generate_interview_questions(asset_id: str, failure_code: str, work_order_id: str) -> Dict[str, Any]:
    """
    Generates context-specific micro-interview questions from graph gaps.
    NOT generic — questions are graph-derived, specific to this asset and failure mode.
    3-5 questions max, 2-minute completion target.
    """
    # TODO: query Neo4j for what is known / what is missing about this failure mode
    # TODO: call LLM to generate targeted questions based on graph gaps
    return {
        "work_order_id": work_order_id,
        "asset_id": asset_id,
        "questions": [],
        "context": {"known": [], "unknown": []},
    }


@activity.defn
async def store_elicitation_response(
    work_order_id: str,
    asset_id: str,
    questions: list,
    responses: list,
) -> Dict[str, Any]:
    """Stores elicitation responses in the quarantine layer with session context."""
    # TODO: write to quarantine_items table with linked work order and question context
    return {"stored": len(responses), "quarantine_item_ids": []}


@workflow.defn
class MicroInterviewWorkflow:
    """
    Triggered at work order closeout for:
    - Rare failure codes (< 3 occurrences in site history for this equipment class)
    - Unusually long resolution times (> 90th percentile)
    - Work orders marked as requiring novel troubleshooting

    2 minutes max. Delivered on mobile at shift closeout.
    """

    @workflow.run
    async def run(self, params: Dict[str, Any]) -> Dict[str, Any]:
        work_order_id = params["work_order_id"]
        asset_id = params["asset_id"]
        failure_code = params.get("failure_code", "")

        questions_result = await workflow.execute_activity(
            generate_interview_questions,
            args=[asset_id, failure_code, work_order_id],
            start_to_close_timeout=timedelta(seconds=30),
        )

        # Workflow waits for human response (timeout: 48 hours before expiry)
        # In production: signal-based — mobile app sends signal when user submits
        # For now: returns questions for delivery
        return {
            "work_order_id": work_order_id,
            "questions": questions_result["questions"],
            "delivery_target": "mobile_app",
            "status": "awaiting_response",
        }

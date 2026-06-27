"""
Elicitation Engine router — Layer 6: Tacit Knowledge Elicitation.
Triggers graph-derived micro-interviews at work order closeout and routes
operator responses into quarantine for human review and graph promotion.
"""

import asyncio
from typing import Any, Dict, List

import shortuuid
import structlog
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from api.dependencies import CurrentUserDep, SupabaseDep, TemporalDep

log = structlog.get_logger(__name__)
router = APIRouter()

_ELICITATION_QUEUE = "kairos-elicitation"


class ElicitationTriggerRequest(BaseModel):
    work_order_id: str
    asset_id: str
    failure_code: str
    equipment_class: str
    resolution_time_hours: float = 0.0
    novel_troubleshooting: bool = False
    triggered_by: str = "system"


class ElicitationResponseRequest(BaseModel):
    responses: List[Dict[str, str]]  # [{question, answer}, ...]
    submitted_by: str


@router.post("/trigger", summary="Trigger micro-interview if elicitation conditions are met")
async def trigger_elicitation(
    payload: ElicitationTriggerRequest,
    current_user: CurrentUserDep,
    supabase: SupabaseDep,
    temporal: TemporalDep,
) -> dict:
    reasons: List[str] = []

    # (a) Rare failure code — count occurrences in operational_events for this equipment class
    events_result = await asyncio.to_thread(
        lambda: supabase.table("operational_events")
        .select("event_id", count="exact")
        .filter("payload->>failure_code", "eq", payload.failure_code)
        .execute()
    )
    failure_count = events_result.count or 0
    if failure_count < 3:
        reasons.append(f"rare_failure_code (count={failure_count})")

    # (b) Resolution time above 90th percentile for this failure type
    times_result = await asyncio.to_thread(
        lambda: supabase.table("operational_events")
        .select("payload")
        .filter("payload->>failure_code", "eq", payload.failure_code)
        .execute()
    )
    times = [
        float(r["payload"]["resolution_time_hours"])
        for r in (times_result.data or [])
        if r.get("payload", {}).get("resolution_time_hours") is not None
    ]
    if times and payload.resolution_time_hours > 0:
        times_sorted = sorted(times)
        p90_idx = max(0, int(0.9 * len(times_sorted)) - 1)
        p90 = times_sorted[p90_idx]
        if payload.resolution_time_hours > p90:
            reasons.append(f"slow_resolution (hours={payload.resolution_time_hours:.1f}, p90={p90:.1f})")

    # (c) Novel troubleshooting flagged by the engineer
    if payload.novel_troubleshooting:
        reasons.append("novel_troubleshooting")

    if not reasons:
        return {"triggered": False, "reasons": [], "message": "No elicitation conditions met"}

    workflow_id = f"elicitation-{payload.work_order_id}-{shortuuid.uuid()[:6]}"
    await temporal.start_workflow(
        "MicroInterviewWorkflow",
        {
            "work_order_id": payload.work_order_id,
            "asset_id": payload.asset_id,
            "failure_code": payload.failure_code,
            "triggered_by": payload.triggered_by,
        },
        id=workflow_id,
        task_queue=_ELICITATION_QUEUE,
    )

    log.info("elicitation.triggered",
             work_order_id=payload.work_order_id,
             workflow_id=workflow_id,
             reasons=reasons)
    return {"triggered": True, "workflow_id": workflow_id, "reasons": reasons}


@router.get("/{work_order_id}/questions", summary="Return generated questions for mobile delivery")
async def get_questions(
    work_order_id: str,
    current_user: CurrentUserDep,
    supabase: SupabaseDep,
) -> dict:
    result = await asyncio.to_thread(
        lambda: supabase.table("elicitation_sessions")
        .select("session_id, work_order_id, asset_id, questions, status, created_at")
        .eq("work_order_id", work_order_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No elicitation session found for work order '{work_order_id}'",
        )
    session = result.data[0]
    return {
        "session_id": session["session_id"],
        "work_order_id": session["work_order_id"],
        "asset_id": session["asset_id"],
        "status": session["status"],
        "questions": session["questions"],
        "created_at": session["created_at"],
    }


@router.post("/{work_order_id}/responses", summary="Submit Q&A responses into quarantine")
async def submit_responses(
    work_order_id: str,
    payload: ElicitationResponseRequest,
    current_user: CurrentUserDep,
    supabase: SupabaseDep,
    temporal: TemporalDep,
) -> dict:
    # Fetch session to get asset_id and questions for session_context
    session_result = await asyncio.to_thread(
        lambda: supabase.table("elicitation_sessions")
        .select("session_id, asset_id, questions")
        .eq("work_order_id", work_order_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    session = session_result.data[0] if session_result.data else {}
    asset_id = session.get("asset_id") or ""
    questions = session.get("questions") or []

    workflow_id = f"elicitation-store-{work_order_id}-{shortuuid.uuid()[:6]}"
    result: Dict[str, Any] = await temporal.execute_workflow(
        "StoreElicitationResponseWorkflow",
        {
            "work_order_id": work_order_id,
            "asset_id": asset_id,
            "responses": payload.responses,
            "submitted_by": payload.submitted_by,
            "questions": questions,
        },
        id=workflow_id,
        task_queue=_ELICITATION_QUEUE,
    )

    log.info("elicitation.responses_submitted",
             work_order_id=work_order_id,
             item_id=result.get("item_id"))
    return result

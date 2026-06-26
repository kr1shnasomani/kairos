"""
Briefs router — Layer 8: Proactive brief delivery to field workers.
Manages brief retrieval, acknowledgment, feedback, and push governor state.
"""

from typing import Optional

from fastapi import APIRouter, Query

from api.dependencies import CurrentUserDep, RedisDep
from api.models.brief import Brief, BriefFeedback

router = APIRouter()


@router.get("/", summary="Get pending briefs for the current user")
async def get_my_briefs(
    current_user: CurrentUserDep,
    redis: RedisDep,
    unacknowledged_only: bool = Query(True),
    limit: int = Query(10, le=50),
) -> dict:
    """
    Returns pending briefs for the authenticated user.
    Applies EEMUA 191 push governor: max 6 per hour in normal operation.
    PTW safety briefs are always returned regardless of governor state.
    """
    # TODO: fetch from Redis brief queue filtered by user_id
    return {"briefs": [], "total_pending": 0, "governor_state": "normal"}


@router.get("/{brief_id}", summary="Get a specific brief")
async def get_brief(
    brief_id: str,
    current_user: CurrentUserDep,
) -> Brief:
    """Returns a single brief with full evidence lineage."""
    from fastapi import HTTPException, status
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Brief '{brief_id}' not found")


@router.post("/{brief_id}/ack", summary="Acknowledge a brief (required for PTW / safety-critical)")
async def ack_brief(
    brief_id: str,
    current_user: CurrentUserDep,
    redis: RedisDep,
) -> dict:
    """
    Cryptographically logs that the user acknowledged the brief content.
    For PTW briefs, also requires shift lead countersignature before the PTW can proceed.
    """
    # TODO: write signed ack to Supabase audit log
    return {"status": "acknowledged", "brief_id": brief_id}


@router.post("/{brief_id}/feedback", summary="Submit feedback on brief accuracy (Phase 2+)")
async def submit_feedback(
    brief_id: str,
    payload: BriefFeedback,
    current_user: CurrentUserDep,
) -> dict:
    """
    Mandatory feedback interface (Phase 2): Accurate / Missing Context / Incorrect.
    Feeds directly into Layer 0 validation and outcome attribution.
    Workers who provide feedback see the system visibly improve.
    """
    # TODO: persist feedback, route to Layer 0 validation pipeline
    return {"status": "received", "brief_id": brief_id, "rating": payload.rating}


@router.get("/governor/status", summary="Get push governor state for current user")
async def get_governor_status(
    current_user: CurrentUserDep,
    redis: RedisDep,
) -> dict:
    """
    Returns the current push governor state: rate count, ceiling, suppressed briefs.
    EEMUA 191 target: ≤6 push events per operator per hour in normal operation.
    """
    # TODO: query Redis for rolling rate counter
    return {
        "user_id": current_user.get("user_id"),
        "push_count_last_hour": 0,
        "ceiling": 6,
        "state": "normal",
        "suppressed_count": 0,
    }

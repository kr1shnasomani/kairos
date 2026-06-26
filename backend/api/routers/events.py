"""
Events router — Layer 8: Operational Event Subscription and Proactive Delivery.
Receives work orders, PTW events, shift handovers, alarms from operational systems.
Publishes to Redis Streams for async brief generation.
"""

from typing import Optional

from fastapi import APIRouter, BackgroundTasks, status

from api.dependencies import CurrentUserDep, RedisDep
from api.models.event import (
    AlarmEvent,
    EventAck,
    PTWEvent,
    ShiftHandoverEvent,
    WorkOrderEvent,
)

router = APIRouter()


@router.post("/work-order", summary="Ingest work order event", status_code=status.HTTP_202_ACCEPTED)
async def ingest_work_order(
    payload: WorkOrderEvent,
    current_user: CurrentUserDep,
    redis: RedisDep,
    background_tasks: BackgroundTasks,
) -> dict:
    """
    Receives a work order creation/update event (from CMMS/EAM integration).
    Normalizes, deduplicates, and publishes to the Redis Streams event bus.
    Triggers brief generation for the assigned technician.
    """
    # TODO: canonical event normalization → dedup → publish to REDIS_STREAM_WORK_ORDERS
    return {"status": "accepted", "event_id": payload.event_id, "stream": "kairos:events:work_orders"}


@router.post("/ptw", summary="Ingest Permit-to-Work event", status_code=status.HTTP_202_ACCEPTED)
async def ingest_ptw(
    payload: PTWEvent,
    current_user: CurrentUserDep,
    redis: RedisDep,
) -> dict:
    """
    PTW events always trigger a safety brief with mandatory engineer + shift lead sign-off.
    PTW briefs are never suppressed by the push governor.
    """
    # TODO: publish to REDIS_STREAM_PTW with priority=CRITICAL
    return {"status": "accepted", "event_id": payload.event_id, "priority": "critical"}


@router.post("/shift-handover", summary="Ingest shift handover event", status_code=status.HTTP_202_ACCEPTED)
async def ingest_shift_handover(
    payload: ShiftHandoverEvent,
    current_user: CurrentUserDep,
    redis: RedisDep,
) -> dict:
    """Triggers a shift handover brief for the incoming crew."""
    # TODO: publish to REDIS_STREAM_SHIFT_HANDOVER
    return {"status": "accepted", "event_id": payload.event_id}


@router.post("/alarm", summary="Ingest alarm acknowledgment event", status_code=status.HTTP_202_ACCEPTED)
async def ingest_alarm(
    payload: AlarmEvent,
    current_user: CurrentUserDep,
    redis: RedisDep,
) -> dict:
    """Received when an operator acknowledges a DCS process alarm."""
    # TODO: publish to REDIS_STREAM_ALARMS
    return {"status": "accepted", "event_id": payload.event_id}


@router.post("/{event_id}/ack", summary="Acknowledge receipt of a brief")
async def acknowledge_event(
    event_id: str,
    payload: EventAck,
    current_user: CurrentUserDep,
    redis: RedisDep,
) -> dict:
    """
    Records cryptographically signed acknowledgment of a proactive brief.
    Required for PTW and high-criticality safety briefs.
    Logged for audit trail: what knowledge was available, when delivered, confirmed by whom.
    """
    # TODO: write signed acknowledgment to audit log
    return {"status": "acknowledged", "event_id": event_id, "user_id": current_user.get("user_id")}

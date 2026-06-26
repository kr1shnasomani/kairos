"""
Pydantic models — Events (Layer 8: Operational Event Subscription)
"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field
import uuid


def _gen_event_id() -> str:
    return str(uuid.uuid4())


class BaseEvent(BaseModel):
    event_id: str = Field(default_factory=_gen_event_id)
    source_system: str = Field(..., description="SAP_PM, Maximo, DCS, PTW_system, manual")
    site_id: str
    occurred_at: datetime = Field(default_factory=datetime.utcnow)
    received_at: datetime = Field(default_factory=datetime.utcnow)


class WorkOrderEvent(BaseEvent):
    work_order_id: str
    asset_id: str
    failure_code: str
    description: str
    assigned_technician_id: Optional[str] = None
    priority: str = Field(default="normal", description="critical, high, normal, low")
    planned_start: Optional[datetime] = None
    event_type: str = "work_order_created"


class PTWEvent(BaseEvent):
    ptw_id: str
    work_area: str
    asset_ids: list[str] = Field(..., description="All assets within the isolation boundary")
    ptw_type: str = Field(..., description="isolation, hot_work, confined_space, high_pressure_line")
    issuing_engineer_id: str
    event_type: str = "ptw_generated"


class ShiftHandoverEvent(BaseEvent):
    outgoing_shift_lead_id: str
    incoming_shift_lead_id: str
    handover_time: datetime
    event_type: str = "shift_handover"


class AlarmEvent(BaseEvent):
    alarm_id: str
    asset_id: str
    alarm_tag: str
    alarm_description: str
    severity: str = Field(..., description="critical, high, medium, low")
    acknowledged_by: str
    event_type: str = "alarm_acknowledged"


class EventAck(BaseModel):
    user_id: str
    role: str
    acknowledged_at: datetime = Field(default_factory=datetime.utcnow)
    signature: Optional[str] = None  # Cryptographic signature for audit trail
    notes: Optional[str] = None

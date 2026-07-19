import type { OperationalEvent } from "./types";

const occurredAt = (now: number, minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString();

export function eventFixtures(now = Date.now()): OperationalEvent[] {
  return [
    {
      event_id: "EVT-ALM-2049",
      event_type: "alarm",
      event_subtype: "pressure_high_high",
      asset_id: "EQ-101",
      site_id: "SITE_001",
      occurred_at: occurredAt(now, 7),
      priority: "critical",
      payload: { alarm_tag: "PAHH-101", description: "Discharge pressure exceeded 14.2 bar", value: 14.8, unit: "bar" },
      brief_id: "BRF-2026-0714-01",
      correlated_event_ids: ["EVT-WO-88213"],
      acknowledged: false,
    },
    {
      event_id: "EVT-WO-88213",
      event_type: "work_order_created",
      event_subtype: "recurring",
      asset_id: "EQ-101",
      site_id: "SITE_001",
      occurred_at: occurredAt(now, 32),
      priority: "high",
      payload: { work_order_id: "WO-88213", summary: "Inspect mechanical seal after pressure excursion", maintenance_type: "corrective" },
      brief_id: "BRF-2026-0714-01",
      correlated_event_ids: ["EVT-ALM-2049"],
      acknowledged: true,
      acknowledged_by: "shift.lead",
      acknowledged_at: occurredAt(now, 24),
    },
    {
      event_id: "EVT-INSP-0441",
      event_type: "inspection_complete",
      event_subtype: "visual",
      asset_id: "HE-301",
      site_id: "SITE_001",
      occurred_at: occurredAt(now, 105),
      priority: "normal",
      payload: { inspection_id: "INSP-0441", result: "failed", findings: "Minor flange seepage observed on the north channel head" },
      correlated_event_ids: [],
      acknowledged: false,
    },
    {
      event_id: "EVT-TAG-0207",
      event_type: "tag_out",
      event_subtype: "electrical_isolation",
      asset_id: "EQ-102",
      site_id: "SITE_001",
      occurred_at: occurredAt(now, 188),
      priority: "high",
      payload: { tag_number: "LOTO-207-04", reason: "Motor coupling inspection", performed_by: "maintenance.team" },
      correlated_event_ids: [],
      acknowledged: true,
      acknowledged_by: "control.room",
      acknowledged_at: occurredAt(now, 180),
    },
    {
      event_id: "EVT-PTW-0118",
      event_type: "permit_to_work",
      event_subtype: "hot_work",
      asset_id: "V-247",
      site_id: "SITE_001",
      occurred_at: occurredAt(now, 305),
      priority: "normal",
      payload: { permit_id: "PTW-0118", scope: "Replace upstream impulse line support", valid_until: occurredAt(now, -175) },
      correlated_event_ids: [],
      acknowledged: true,
      acknowledged_by: "area.authority",
      acknowledged_at: occurredAt(now, 296),
    },
    {
      event_id: "EVT-HO-0714",
      event_type: "shift_handover",
      event_subtype: "day_to_night",
      asset_id: null,
      site_id: "SITE_001",
      occurred_at: occurredAt(now, 420),
      priority: "low",
      payload: { outgoing_shift: "Day A", incoming_shift: "Night B", open_actions: 4, watch_item: "Monitor EQ-101 discharge pressure trend" },
      correlated_event_ids: ["EVT-ALM-2049"],
      acknowledged: true,
      acknowledged_by: "night.shift.lead",
      acknowledged_at: occurredAt(now, 412),
    },
  ];
}

export function getEventFixture(eventId: string): OperationalEvent | null {
  return eventFixtures().find((event) => event.event_id === eventId) ?? null;
}

import type { AuthorityLevel } from "./types";

// Fixture assets — stand in for GET /assets, /assets/{id}, /knowledge while offline.

export interface KnowledgeEdge {
  claim: string;
  authority_level: AuthorityLevel;
  verification: "verified" | "unverified" | "disputed";
  source_doc: string;
}

export interface Asset {
  asset_id: string;
  name: string;
  equipment_class: string;
  criticality: "high" | "medium" | "low";
  aliases: string[];
  parent: string | null;
  open_work_orders: number;
  compliance_gaps: number;
  last_inspection: string;
  knowledge: KnowledgeEdge[];
}

export const assets: Asset[] = [
  {
    asset_id: "P-101",
    name: "Feed Pump A",
    equipment_class: "Centrifugal pump",
    criticality: "high",
    aliases: ["Pump 101", "Feed Pump A", "P101", "the old Fischer"],
    parent: "Production Line 3",
    open_work_orders: 12,
    compliance_gaps: 2,
    last_inspection: "2026-05-20",
    knowledge: [
      { claim: "Current seal variant is P/N MS-4471-B (supersedes MS-4470-A).", authority_level: 3, verification: "verified", source_doc: "OEM-BULL-MS44-r3" },
      { claim: "Four mechanical-seal failures 2018–2026; thermal cycling implicated.", authority_level: 2, verification: "verified", source_doc: "DOC-P101-FAILURE-HIST" },
      { claim: "Abnormal vibration reported before last failure.", authority_level: 5, verification: "unverified", source_doc: "QN-EQ101-VIB-0142" },
    ],
  },
  {
    asset_id: "EQ-101",
    name: "Reactor Feed Unit",
    equipment_class: "Rotating equipment",
    criticality: "high",
    aliases: ["EQ101", "Feed Unit 1"],
    parent: "Production Line 3",
    open_work_orders: 3,
    compliance_gaps: 1,
    last_inspection: "2026-06-01",
    knowledge: [
      { claim: "Seal replacement records required for OISD-117 §7.2.", authority_level: 1, verification: "verified", source_doc: "OISD-117-7.2" },
    ],
  },
  {
    asset_id: "V-247",
    name: "Line 3 Isolation Valve",
    equipment_class: "Control valve",
    criticality: "medium",
    aliases: ["V247", "XV-247"],
    parent: "Production Line 3 / Section 2",
    open_work_orders: 1,
    compliance_gaps: 2,
    last_inspection: "2026-04-11",
    knowledge: [
      { claim: "Double-block-and-bleed isolation via XV-203 / XV-204 / PG-18.", authority_level: 3, verification: "verified", source_doc: "TOPO-PL3-S2" },
      { claim: "PG-18 may not seat fully (field flag).", authority_level: 5, verification: "disputed", source_doc: "QN-PG18-SEAT-0210" },
    ],
  },
  {
    asset_id: "HX-301",
    name: "Interstage Heat Exchanger",
    equipment_class: "Shell-and-tube exchanger",
    criticality: "medium",
    aliases: ["HX301", "Exchanger 301"],
    parent: "Production Line 3",
    open_work_orders: 3,
    compliance_gaps: 1,
    last_inspection: "2026-06-15",
    knowledge: [
      { claim: "Recurrent tube fouling correlated with feed-water hardness.", authority_level: 2, verification: "verified", source_doc: "DOC-HX3-FOULING" },
    ],
  },
];

export function getAsset(id: string): Asset | null {
  return assets.find((a) => a.asset_id.toLowerCase() === id.toLowerCase()) ?? null;
}

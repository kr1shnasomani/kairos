# KAIROS — Build Status

> Snapshot against `docs/ARCHITECTURE.md`. Three sections: frontend completion, API wiring scope, and demo dataset coverage.

---

## 1. Frontend Completion

**vs. 34-task MVP scope: ~85/100**
**vs. full architectural vision (ARCHITECTURE.md): ~35/100**

The gap between these two numbers is real and intentional — the 34 tasks defined the backend and the data surfaces. The architecture describes a complete operational intelligence platform with workflow UIs, graph visualisation, offline field capability, and voice input that were never in scope for the MVP build.

### Pages — Live vs. Fixture

| Page | Route | Status | Backend calls |
|------|-------|--------|---------------|
| Login | `/login` | **Live** | `POST /auth/login` |
| Briefs inbox | `/briefs` | **Live** (fixture fallback) | `GET /briefs/`, `GET /briefs/{id}` |
| Brief ack + feedback | `/briefs/{id}` | **Live** | `POST /briefs/{id}/ack`, `POST /briefs/{id}/feedback` |
| Copilot / search | `/copilot` | **Live** (fixture fallback) | `GET /search/`, `POST /search/synthesize` |
| Assets list + detail | `/assets`, `/assets/{id}` | **Live** (fixture fallback) | `GET /assets/`, `GET /assets/{id}`, `GET /assets/{id}/knowledge` |
| RCA pack | `/rca` | **Live** (fixture fallback) | `POST /search/rca-pack` |
| Compliance | `/compliance` | **Live** (fixture fallback) | `GET /compliance/dashboard`, `/gaps`, `/frameworks` |
| Governance conflicts | `/governance` | **Live** (fixture fallback) | `GET /governance/conflicts`, `POST .../resolve` |
| Governance quarantine | `/governance` | **Live** (fixture fallback) | `GET /governance/quarantine`, `POST .../promote` |
| Documents list + detail | `/documents`, `/documents/{id}` | **Live** (fixture fallback) | `GET /documents/`, `GET /documents/{id}` |
| Management overview | `/management` | **Fixture only** | None wired |

### Missing vs. Architecture (the 65-point gap)

| Feature | Arch Layer | Notes |
|---------|-----------|-------|
| Temporal graph visualisation (Neovis.js / React Flow) | L4 / L12 | Asset knowledge page shows raw data — no graph renderer |
| P&ID topology viewer | L3 / L12 | Backend parses `pid_topology_mock.json`; no drawing renderer in frontend |
| Active learning annotation interface | L0 / L3 | `/annotations` endpoints exist; no frontend page |
| Elicitation response UI | L9 / L12 | No page to answer micro-interview questions |
| Offboarding interview UI | L9 / L12 | Entirely absent |
| Voice note recording / submission | L3 / L9 | Groq pipeline live; no browser recorder UI |
| PTW full dual sign-off flow | L8 / L12 | Brief ack exists; the countersignature step has no dedicated UI |
| Audit trail viewer | L7 / L12 | `GET /audit-log` endpoint live; no frontend page |
| SLA report page | L7 / L12 | `GET /governance/sla-report` live; no frontend page |
| MoC workflow UI | L7 / L12 | Listed in nav; no implementation |
| Management live wiring | L12 | Fixture health cards; needs `GET /health/detailed` + aggregate counts |
| Blast radius visualisation | L4 / L12 | API returns blast radius JSON; no UI |
| Offline mode + background sync | L12 | Architecture requires this for field use; not implemented |
| Voice search input | L12 | Architecture specifies hands-free querying; absent |
| Phase 1/2/3 deployment indicator | L12 | Phase status is invisible to users |
| Project / procurement workspace | L12 | Not started |

---

## 2. API Wiring Scope

What the frontend calls, where the data comes from, and what the fallback is for every surface.

### Auth & Session
| Call | Direction | Notes |
|------|-----------|-------|
| `POST /auth/login` | Browser → API | Stores `access_token` + `refresh_token` in `localStorage` |
| `POST /auth/refresh` | Browser → API | Called on 401; rotates token |
| `GET /auth/me` | Browser → API (SSR + client) | Resolves `role`, `site_id`, `user_id` for nav gating |

### SSR vs. Browser URL split
Server components (App Router, no `"use client"`) call `fetch()` inside the container. `API_BASE` in `frontend/src/lib/api.ts` switches on `typeof window === "undefined"`:
- **Server:** `API_INTERNAL_URL=http://kairos-backend-api:8000` (Docker DNS)
- **Browser:** `NEXT_PUBLIC_API_URL=http://localhost:8000` (host port-map)

All fetchers use a 1500 ms `AbortController` timeout + `try/catch` fixture fallback so pages never crash when the backend is unreachable.

### Wired endpoints per page

| Page | Endpoints called | Write actions |
|------|-----------------|---------------|
| `/briefs` | `GET /briefs/` | — |
| `/briefs/{id}` | `GET /briefs/{id}` | `POST /briefs/{id}/ack`, `POST /briefs/{id}/feedback` |
| `/copilot` | `GET /search/` | `POST /search/synthesize` |
| `/assets` | `GET /assets/` | — |
| `/assets/{id}` | `GET /assets/{id}`, `GET /assets/{id}/aliases`, `GET /assets/{id}/knowledge` | — |
| `/rca` | — | `POST /search/rca-pack` |
| `/compliance` | `GET /compliance/dashboard`, `GET /compliance/gaps`, `GET /compliance/frameworks` | — |
| `/governance` | `GET /governance/conflicts`, `GET /governance/quarantine` | `POST /governance/conflicts/{id}/resolve`, `POST /governance/quarantine/{id}/promote` |
| `/documents` | `GET /documents/` | — |
| `/documents/{id}` | `GET /documents/{id}` | — |
| `/management` | **None** — fixture only | — |

### Not yet wired (backend endpoints exist)
| Endpoint | What it does | Missing surface |
|----------|-------------|-----------------|
| `GET /governance/sla-report` | SLA escalation summary | No page |
| `GET /audit-log` | Immutable audit trail | No page |
| `GET /governance/moc` | MoC items list | No page |
| `GET /governance/circuit-breaker` | SPC circuit breaker state | No page |
| `GET /governance/model-gate/history` | NER model gate results | No page |
| `POST /annotations` | NER annotation submission | No page |
| `GET /annotations/stats` | Annotation corpus stats | No page |
| `POST /elicitation/trigger` | Micro-interview trigger | No UI |
| `GET /elicitation/{wo_id}/questions` | Fetch elicitation questions | No UI |
| `POST /elicitation/{wo_id}/responses` | Submit elicitation answers | No UI |
| `POST /elicitation/{wo_id}/voice` | Submit voice note | No UI |
| `GET /health/detailed` | Live service health | Management page fixture |
| `GET /events/governor-state/{user_id}` | EEMUA governor state | Not surfaced in UI |

---

## 3. Demo Dataset Coverage

**Location:** `dataset/` (32 files, all verified — see `dataset/00_Reference/VERIFICATION_REPORT.md`)

**Facility in-story:** Rajgarh Petrochemical Complex (RPC), Gujarat · Demo day: 15-Jul-2026

### Files Present

| Folder | File | Layer | Demo Flow | Status |
|--------|------|-------|-----------|--------|
| `01_Structured_Backbone` | `asset_registry.csv` | L1 MDM | General | ✅ |
| `01_Structured_Backbone` | `alias_table.csv` | L1 Alias | General | ✅ |
| `01_Structured_Backbone` | `work_orders_eq101_family.csv` | L4 / L10 | A, General | ✅ |
| `01_Structured_Backbone` | `telemetry_eq101.csv` | L5 OT | A, General | ✅ |
| `02_Document_Corpus` | `oem_manual_eq1xx_seal.pdf` | L3 (native PDF) | A | ✅ |
| `02_Document_Corpus` | `oem_bulletin_fp_sb_2025_04.pdf` | L3 / L4 auth-L3 | A | ✅ |
| `02_Document_Corpus` | `oem_bulletin_mht_pb_2026_11.pdf` | L3 / L7 governance | C | ✅ |
| `02_Document_Corpus` | `sop_he_301_04.pdf` | L4 auth-L4 / blast radius | C | ✅ |
| `02_Document_Corpus` | `sop_he_302_04.pdf` | L4 / blast radius | C | ✅ |
| `02_Document_Corpus` | `sop_he_303_04.pdf` | L4 / blast radius | C | ✅ |
| `02_Document_Corpus` | `sop_he_gen_11.pdf` | L4 / blast radius | C | ✅ |
| `02_Document_Corpus` | `insp_he301_2025_q4.pdf` | L4 / blast radius | C | ✅ |
| `02_Document_Corpus` | `insp_he302_2025_q4.pdf` | L4 / blast radius | C | ✅ |
| `02_Document_Corpus` | `mp_he_hydrotest_03.pdf` | L4 / blast radius | C | ✅ |
| `02_Document_Corpus` | `regulatory_clause_excerpts.pdf` | L4 auth-L1 (Regulatory) | General | ✅ |
| `02_Document_Corpus` | `ptw_v247.pdf` | L3 form parsing / L8 | B | ✅ |
| `02_Document_Corpus` | `work_order_closeout_form.pdf` | L3 / L10 | A | ✅ |
| `02_Document_Corpus` | `inspection_checklist.pdf` | L3 form parsing | B | ✅ |
| `02_Document_Corpus` | `pid_line3_isolation_boundary.png` | L3 (drawing topology — mocked) | B | ✅ |
| `03_Multiformat_Variants` | `scanned_oem_bulletin_degraded.png` | L3 (OCR path) | A | ✅ |
| `03_Multiformat_Variants` | `scanned_inspection_degraded.png` | L3 (OCR path) | C | ✅ |
| `03_Multiformat_Variants` | `handwritten_shift_log.png` | L3 (handwriting) | A | ✅ |
| `03_Multiformat_Variants` | `handwritten_inspection_note.png` | L3 (handwriting) | B | ✅ |
| `03_Multiformat_Variants` | `shift_log.txt` | L3 NLP (English) | A, B | ✅ |
| `04_Events_And_Quarantine` | `event_work_order_creation.json` | L8 event subscription | A | ✅ |
| `04_Events_And_Quarantine` | `event_ptw_generation.json` | L8 | B | ✅ |
| `04_Events_And_Quarantine` | `event_shift_handover.json` | L8 | General | ✅ |
| `04_Events_And_Quarantine` | `event_recurring_failure.json` | L8 / L10 | General | ✅ |
| `04_Events_And_Quarantine` | `quarantine_vibration_observation.json` | L6 / L9 | A | ✅ |
| `04_Events_And_Quarantine` | `quarantine_pg18_deviation.json` | L6 | B | ✅ |
| `04_Events_And_Quarantine` | `voice_note_transcript.txt` | L3 Whisper / L9 elicitation | A | ✅ |
| `04_Events_And_Quarantine` | `voice_note_eq101.mp3` | L3 Whisper | A | ✅ |

### Deliberate Scope Cuts (not bugs)

The dataset was built to "depth on one story, not breadth across every possibility." Every gap below was an explicit decision.

| What's absent | Arch Layer | Why it was cut |
|--------------|-----------|----------------|
| **3 missing event JSONs** (tag-out, alarm, inspection-complete) | L8 | Only events tied to Flow A/B were in scope: work order, PTW, handover, recurring-failure. Tag-out / alarm / inspection-complete weren't in the original 12-item plan. |
| **HE-3xx telemetry** | L5 | Flow C is a document / blast-radius story, not a live-monitoring story. Only EQ-101 needed telemetry for its narrative to work. |
| **Multilingual / Hinglish documents** | L3 | Explicit instruction — English-only for this test pass. Handwritten images contain some Hindi (`thodi alag lagi`). Full Devanagari corpus can be added on request. |
| **Priya Nair compliance-cockpit artifact** | L7 / L12 | No Flow A/B/C touches the compliance-cockpit persona directly. Flagged in the dataset verification report — add on request. |
| **Elicitation session JSON (Flow D)** | L9 | Elicitation was built as a supporting artifact for Flow A (the voice note), never scoped as its own standalone flow with a full Q&A session JSON. |
| **Authority Level 2 document** | L4 | L1 (regulatory), L3 (OEM), L4 (SOP) were built. L2 (internal engineering standards / site policy) was never requested — no document type was defined for it. |
| **Cross-site pattern scenario** | L10 / L12 | Single-site MVP by design. |

### Authority Level Coverage (L4 graph requirements)

| Level | What it is | Present |
|-------|-----------|---------|
| L1 — Regulatory | OISD-STD-105/128/134, PESO Rules, Factories Act | ✅ `regulatory_clause_excerpts.pdf` |
| L2 — Engineering standard / site policy | — | ⚠️ Not explicitly represented; SOPs partially fill this |
| L3 — OEM manual / spec | Fischer seal manual + bulletins, Meridian bulletin | ✅ |
| L4 — Site operating procedure | 4× SOPs, hydrotest procedure | ✅ |
| L5 — Field observation / unverified | Quarantine JSONs, handwritten images | ✅ |

### Demo Flows Covered

| Flow | Scenario | Dataset complete? |
|------|----------|------------------|
| **A** — Work order + proactive brief (EQ-101 seal failure, thermal cycling, P/N gap) | All 4 WO events, telemetry ramp, OEM bulletins, handwritten vibration note, voice note | ✅ Full |
| **B** — PTW issuance + safety brief (V-247 isolation, PG-18 deviation flag) | PTW form, P&ID drawing, inspection checklist, quarantine deviation JSON | ✅ Full |
| **C** — OEM bulletin supersession + blast radius (HE-3xx pressure limit revision) | New + old OEM bulletin, 4 SOPs, 2 inspection records, hydrotest procedure | ✅ Full |
| **D** — Expert elicitation / offboarding | Voice note + transcript only; no structured session | ⚠️ Partial |

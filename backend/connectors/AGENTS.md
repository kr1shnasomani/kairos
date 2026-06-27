# OT Connectors (Go) — Agent Reference

> For project overview and rules → read `../../AGENTS.md` first.

---

## Purpose
Layer 5 — Zero-Copy OT Virtualization. Ephemeral historian queries only. High-throughput OT federation is Go, never Python.

**Status:** Stub — wired in Task 17.

---

## Hard Rules
- Historian data is **never stored** in KAIROS infrastructure — query, reason in memory, discard.
- IEC 62443 zone/conduit design approval required before activating any live OT connection.
- SAP/EAM connectors target ODS replication stores only — never production ERP.
- Return a descriptive error when a connector is unconfigured — not silent empty data.
- When `PI_WEBAPI_BASE_URL` or `EAM_ODS_ENDPOINT` is empty, return configurable mock fixtures so the rest of the system can function for demo.

---

## Conventions
- Use stdlib `log` for logging (`go.uber.org/zap` is not in `go.mod`).
- New historian types implement the `HistorianClient` interface in `internal/ot/client.go`.
- Gin handlers in `cmd/connector/main.go` — keep thin, delegate to internal packages.
- Error wrapping: `fmt.Errorf("context: %w", err)` always.
- Current `go.mod` direct deps: `gin v1.10.0`, `redis/go-redis v9.5.3` — add new deps intentionally.

---

## Adding a New Historian Connector
1. Implement `HistorianClient` interface (`Query` and `Health` methods) in `internal/ot/`.
2. Register in connector map in `cmd/connector/main.go`.
3. Add env vars to root `.env.example`.
4. Write table-driven test with a mock historian response.

---

## API Surface (Task 17)
```
GET  /ot/query?asset_id=...&tag=...&from=...&to=...  → time-series data (ephemeral)
GET  /ot/coverage/{asset_id}                          → instrumentation coverage map
POST /eam/sync                                        → bulk asset sync from EAM ODS
POST /eam/work-order                                  → forward work order event to Python API
```
Service-to-service calls hit `http://kairos-backend-api:8000` — not localhost.

---

## Skills
`golang-code-style` · `golang-error-handling` · `golang-performance` · `golang-testing` · `neo4j-driver-go-skill` · `ponytail` · `ponytail-audit` · `ponytail-debt` · `ponytail-review`

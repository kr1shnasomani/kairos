# OT Connectors (Go) — Agent Instructions

## Purpose
Layer 5 — Zero-Copy OT Virtualization. Ephemeral historian queries only.
High-throughput OT federation is Go, never Python.

## Hard Rules
- Historian data is **never stored** in KAIROS infrastructure — query, reason in memory, discard
- IEC 62443 zone/conduit design approval required before activating any live OT connection
- SAP/EAM connectors target ODS replication stores only — never production ERP
- Return a descriptive error when a connector is unconfigured (not silent empty data)

## Conventions
- Use `go.uber.org/zap` for structured logging
- New historian types implement the `HistorianClient` interface in `internal/ot/client.go`
- Gin handlers in `cmd/connector/main.go` — keep thin, delegate to internal packages
- Error wrapping: `fmt.Errorf("context: %w", err)` always

## Adding a New Historian Connector
1. Implement `HistorianClient` interface (`Query`, `Health` methods)
2. Add to connector registry in `cmd/connector/main.go`
3. Add env vars to root `.env.example`
4. Write a table-driven test with a mock historian response

## Skills
`golang-code-style` · `golang-error-handling` · `golang-performance` · `golang-testing` · `neo4j-driver-go-skill`

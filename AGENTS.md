# KAIROS — Agent Context

## Token-Saving Workflow (default for all agents — read first)

Prefer the smallest effective context. Default loop:
**SymDex locate → minimal file read → small patch → RTK validate → Caveman summary.**

Active-lane note: `frontend/` (Next.js) is now an **active** work area. The "never touch `frontend/`"
guardrail lower down applies to *backend* agents only; backend rules remain authoritative for backend work.

### 1. RTK — for noisy terminal commands
Use RTK for build, test, lint, typecheck, Docker, `curl`, and `git diff/status/log`.
Do not paste full logs. Report only: command, result, cause, relevant files, next fix.

### 2. SymDex — before reading many files
Use SymDex to locate routes, components, symbols, API clients, styling/theme files, tests, and docs.
Do not scan the whole repo when SymDex can point to the files you need.

### 3. Caveman — for final summaries
Use Caveman-style output for final **implementation** summaries: changed files, validation results,
blockers only — short and factual. Do NOT use Caveman for architecture/product reasoning.

Other skills/tools may be used when clearly better for the task — but don't load extras unnecessarily;
if you use one, say briefly why.

### Rules
- Prefer the smallest effective context. Make the smallest safe change.
- Preserve existing architecture and style. Do not add dependencies unless necessary.
- Do not touch unrelated files. Do not commit unless explicitly asked.
- Use `docs/demo/LIVE_VERIFICATION.md` as the reference for current live backend/API verification status.
  Do NOT modify it unless explicitly asked for a new live-verification run.
- If RTK or SymDex is unavailable, fall back to normal commands/search but keep the same token-saving behavior.

---

## Essential Reading (load before anything else)
- `docs/PROBLEM_STATEMENT.md` — what this platform is for and why it matters. Every decision must trace back to this.
- `docs/IMPLEMENTATION.md` — full task specs. The contract for every build. Tasks 1–34 defined.
- `docs/ARCHITECTURE.md` — 13-layer design. Understand the layer a task lives in before touching it.
- `docs/MEMORY.md` — **current implementation state**: completed task table (tasks 1–34 verified ✅), known pitfalls, key architectural decisions. Read this before starting any task to avoid re-implementing completed work.

---

## Task Protocol (follow every time, no exceptions)

### 1 — Full Context Before Writing Anything
- Read the full task spec in `docs/IMPLEMENTATION.md`.
- Read every file you will touch, end-to-end. Trace the call chain: router → service → db/external.
- Check `docs/MEMORY.md` completed table — don't re-implement verified work.
- Identify which architecture layer the task lives in (`docs/ARCHITECTURE.md`).

### 2 — Plan
- State exactly which files change and what each change does.
- Invoke `/ponytail lite` (minimum) before planning. YAGNI applies. Reuse what exists. No abstractions for one use case.
- Check `.agents/SKILL_MANIFEST.md` for relevant skills and invoke any that apply — skills are mandatory, not optional. Search by domain keyword (e.g. "neo4j", "qdrant", "temporal", "fastapi") to find the right one quickly.

### 3 — Build
- Docker is the only runtime. No local `python`, no `pip install` outside containers.
- Hot-reload is active — edits apply immediately. Rebuild only if new pip deps added.
- After edits: AST parse check before waiting on Docker (`python3 -c "import ast; ast.parse(open('f').read())"`).
- Root-cause errors, don't patch symptoms. One fix in the shared function beats guards at every caller.
- Log with `structlog`. Never `print()`, never stdlib `logging`.
- Stay in scope. If something unrelated is broken, note it — don't fix it mid-task.

### 4 — Verify End-to-End (nothing is done until this passes)
- Run the exact test cases from `docs/IMPLEMENTATION.md` spec via live HTTP calls against the running stack.
- Read container logs: `docker logs kairos-backend-api 2>&1 | tail -30`. No silent errors allowed.
- Confirm writes in the actual database (Supabase/Neo4j/Qdrant/ES) — not just the HTTP response.
- Update `docs/MEMORY.md` completed table with a concrete "Verified By" entry.
- Delete any temp files, test scripts, or scratch PDFs created during the task.

---

## Stack
FastAPI (Python 3.12) · Neo4j 5.20 · Qdrant · Elasticsearch 8.13 · Redis 7.2 · Temporal.io · Celery · Go (Gin) · OPA · HashiCorp Vault · OpenTelemetry → Grafana · Supabase (Postgres + Storage + Auth)

## Dev Commands
```bash
make dev        # Build + start all services
make stop       # Stop all
make nuke       # Destroy all volumes — irreversible
make init-all   # First-time: Neo4j constraints + Qdrant collections
make logs       # Tail all service logs
make ps         # Container status
```
**Ports:** API `8000` · Neo4j `7474/7687` · Qdrant `6333` · ES `9200` · Redis `6379` · Temporal `7233` · Temporal UI `8088` · Grafana `3001`

---

## Non-Negotiable Rules

**Neo4j edges — all 6 properties on every write, no exceptions:**
`valid_from` · `valid_to` · `authority_level` · `document_id` · `confidence` · `verification_status`

**Vault is permanent.** Never delete. Never overwrite. Supersede by closing `valid_to`. Supabase Storage artifacts are immutable.

**Quarantine is a one-way gate.** `confidence < 0.7` or unresolved entity → `quarantine_items`. Human action only to promote. No auto-promotion ever.

**Asset nodes:** `MERGE (a:Asset {asset_id: $id}) SET a += $props` — never CREATE.

**Authority pre-filter before graph traversal:**
`WHERE r.authority_level <= $max_level AND r.valid_from <= $as_of`

**Safety-critical queries** (pressure limits, interlock sequences, torque specs): explicit refusal, never hedged answers. Sources returned directly.

**Phase discipline:** Phase 2 LLM synthesis lives only in `POST /search/synthesize` — never auto-triggered from routers or workers. Phase 3 proactive push is live — `GET /briefs` delivers event-triggered briefs via the EEMUA 191 governor.

**EEMUA 191 Governor:** call `EventBusService.check_governor(user_id)` before every brief delivery. Hard ceiling ≤6 push events/operator/hour. PTW briefs always exempt.

**Secrets:** never hardcode. All via `api/config.py` Settings → env vars.

**OT Connectors:** historian data is ephemeral — query, reason in memory, discard. Never store time-series in KAIROS.

---

## Code Style
- Routers thin — handler calls service, returns result. No business logic in routers.
- All service logic in `backend/api/services/`.
- Pydantic model for every request and response shape.
- `async/await` throughout. No blocking I/O in async handlers.
- Never `SELECT *`. Never wildcard CORS `"*"` in production.
- `frontend/` is a Next.js app owned by a separate team — don't touch it unless explicitly asked.

---

## Where Things Live
| Concern | Path |
|---------|------|
| FastAPI entrypoint | `backend/api/main.py` |
| Settings | `backend/api/config.py` |
| Dependency injection | `backend/api/dependencies.py` |
| Routers | `backend/api/routers/*.py` |
| Services | `backend/api/services/*.py` |
| Pydantic models | `backend/api/models/*.py` |
| Temporal workflow | `backend/workflows/document_pipeline.py` |
| Temporal activity worker | `backend/workers/temporal_worker.py` |
| Celery worker | `backend/workers/celery_app.py` |
| Go OT connectors | `backend/connectors/` |
| Neo4j schema | `db/neo4j/init_schema.cypher` |
| Supabase migrations | `db/migrations/` |

---

## Available Tooling
- **GitHub CLI (`gh`)** — available in terminal. Use for PR creation, issue management, CI status checks.
- **Supabase MCP** — direct Supabase access via MCP tools (`mcp__claude_ai_Supabase__*`). Use for running SQL, checking migrations, inspecting table state, and applying schema changes without going through the API. Prefer this over `docker exec` for Supabase-related diagnostics.

---

## Skills
**`/ponytail` is mandatory for every task.** Use `lite` by default, `full` for complex tasks, `ultra` when asked to cut scope.

All 59 skills are in `.claude/skills/` (symlinked from `.agents/skills/`). Full index: `.agents/SKILL_MANIFEST.md`.
Before starting any task, search `.agents/SKILL_MANIFEST.md` for skills matching your domain — don't guess, scan. Key domains: `neo4j`, `qdrant`, `temporal`, `fastapi`, `elasticsearch`, `redis`, `supabase`, `grafana`, `celery`, `golang`, `python`, `opentelemetry`, `docker`.
Invoke matching skills before writing code in that domain. Skills give current API patterns — don't rely on training data for library-specific calls.

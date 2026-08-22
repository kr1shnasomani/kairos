# KAIROS — Developer Makefile (100% Dockerized)
# Usage: make <target>

.PHONY: help dev prod stop nuke logs ps \
        api workers connectors \
        init-neo4j init-qdrant init-all \
        test test-api test-connectors \
        lint format

# Default target
help:
	@echo ""
	@echo "  KAIROS — Industrial Operational Intelligence Platform"
	@echo "  ======================================================="
	@echo ""
	@echo "  Infrastructure & Apps"
	@echo "    make dev          Start ALL services (Databases + API + Workers + Connectors)"
	@echo "    make stop         Stop all Docker services"
	@echo "    make nuke         Stop and delete all volumes (DESTROYS DATA)"
	@echo "    make logs         Tail logs for all services"
	@echo "    make ps           Show running service status"
	@echo ""
	@echo "  Initialisation"
	@echo "    make init-neo4j   Apply Neo4j schema (Cypher)"
	@echo "    make init-qdrant  Create Qdrant collections"
	@echo "    make init-all     Run all init scripts"
	@echo ""
	@echo "  Quality (Runs inside containers)"
	@echo "    make test         Run all tests"
	@echo "    make lint         Run linters (ruff + golangci-lint)"
	@echo "    make format       Auto-format code (ruff + gofmt)"
	@echo ""

# =============================================================================
# Infrastructure & Application
# =============================================================================

dev:
	docker compose up -d --build
	@echo ""
	@echo "  Services:"
	@echo "    API (FastAPI):   http://localhost:8000/docs"
	@echo "    Neo4j Browser:   http://localhost:7474"
	@echo "    Qdrant UI:       http://localhost:6333/dashboard"
	@echo "    Temporal UI:     http://localhost:8088"
	@echo "    Grafana:         http://localhost:3001  (admin / kairos_dev_password)"
	@echo ""

# Production / AWS: base only (no override) — no bind-mounts, no debug ports,
# non-root images, network isolation, resource limits. See docs/DOCKER.md.
prod:
	docker compose -f docker-compose.yml up -d --build
	@echo ""
	@echo "  KAIROS (production mode) — only ports 3000 (frontend) + 8000 (API) published."
	@echo ""

stop:
	docker compose down

nuke:
	@echo "WARNING: This will destroy all local data volumes. Press Ctrl+C to cancel."
	@sleep 3
	docker compose down -v

logs:
	docker compose logs -f

ps:
	docker compose ps

# =============================================================================
# Initialisation (Executes inside the API container)
# =============================================================================

init-neo4j:
	docker compose exec kairos-backend-api python scripts/init_neo4j.py

init-qdrant:
	docker compose exec kairos-backend-api python scripts/init_qdrant.py

init-all: init-neo4j init-qdrant
	@echo "All datastores initialized."

# =============================================================================
# Seeding & golden dataset (Executes inside the API container)
# =============================================================================

seed:
	docker compose exec kairos-backend-api python scripts/seed_regulations.py
	docker compose exec kairos-backend-api python scripts/seed_users.py

# Load the canonical demo corpus (dataset/) through the real ingestion pipeline.
# Append ARGS=--fast to skip the document pipeline (structured backbone + events only).
load-dataset:
	docker compose exec kairos-backend-api python scripts/load_demo_dataset.py $(ARGS)

# Delete integration-test residue (ASSET-TEST/DEDUP/EV/ACK-*, WO-*, DOC-*) from every store.
purge-test-data:
	docker compose exec kairos-backend-api python scripts/purge_test_data.py

# Empty the local stores (Neo4j + ES + Qdrant). Supabase is reset via db/maintenance/reset_all_data.sql.
wipe-local:
	docker compose exec kairos-backend-api python scripts/wipe_local_stores.py

# One-shot pristine reset of local stores + reload the golden dataset.
# (Truncate cloud Supabase first with db/maintenance/reset_all_data.sql — done separately.)
reset-local: wipe-local seed load-dataset
	@echo "Local stores wiped, reseeded, and reloaded from the golden dataset."

# =============================================================================
# Tests (Executes inside containers)
# =============================================================================

test: test-api test-connectors

test-api:
	docker compose exec kairos-backend-api pytest tests/ -v --tb=short

test-connectors:
	docker compose exec kairos-backend-go go test ./...

# Per-layer smoke + latency table (append ARGS=--full for the slow LLM/VLM checks)
verify:
	docker compose exec kairos-backend-api python benchmark/verify_layers.py $(ARGS)

# Domain-expert benchmark scorecard (append ARGS=--synthesize for answer quality; hits NIM)
benchmark:
	docker compose exec kairos-backend-api python benchmark/run_benchmark.py $(ARGS)

# Layer-0 deployment gate. Exits non-zero when the candidate model regresses against the
# incumbent baseline, so it can gate a release:  make model-gate MODEL=meta/llama-3.2-11b-vision-instruct
# Reports only — halting extraction per asset class additionally requires MODEL_GATE_ENFORCE=true.
model-gate:
	docker compose exec kairos-backend-api python scripts/run_model_validation.py --model-name $(MODEL) $(ARGS)

# ARCHITECTURE.md §7 — query-performance regression check for graph schema changes.
# Asserts plan SHAPE (anchored queries resolve through an index seek), not timings: the
# regression this catches is `asset_id_unique` going missing and the Layer 4 hot path
# silently degrading to a NodeByLabelScan, which returns correct rows and fails nothing.
# Run it after any change to db/neo4j/init_schema.cypher or a hot-path query.
.PHONY: graph-perf
graph-perf:
	docker compose run --rm --no-deps kairos-backend-api python scripts/verify_graph_perf.py

# =============================================================================
# Quality (Executes inside containers)
# =============================================================================

lint:
	docker compose exec kairos-backend-api ruff check .
	docker compose exec kairos-backend-go golangci-lint run

format:
	docker compose exec kairos-backend-api ruff format .
	docker compose exec kairos-backend-go gofmt -w .

# KAIROS — Developer Makefile (100% Dockerized)
# Usage: make <target>

.PHONY: help dev stop nuke logs ps \
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

# =============================================================================
# Quality (Executes inside containers)
# =============================================================================

lint:
	docker compose exec kairos-backend-api ruff check .
	docker compose exec kairos-backend-go golangci-lint run

format:
	docker compose exec kairos-backend-api ruff format .
	docker compose exec kairos-backend-go gofmt -w .

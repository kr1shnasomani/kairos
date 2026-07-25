#!/usr/bin/env bash
#
# Sets the GitHub Actions secrets the Tier-2 integration job needs.
#
# Run this yourself — the values never leave your machine except to GitHub, and they are
# never printed. `gh secret set` reads from stdin so nothing lands in your shell history.
#
#   bash setup-ci-secrets.sh            # dry run: shows what would be set
#   bash setup-ci-secrets.sh --apply    # actually sets them
#
# ---------------------------------------------------------------------------------------
# READ THIS FIRST
#
# Do NOT give CI your production Supabase project.
#
# The integration suite creates then purges test entities, `make init-all` reinitialises
# schema and Qdrant collections, and the teardown purge is unreliable against cloud
# Supabase. Pointing CI at production would corrupt the golden demo dataset on every push.
#
# Create a second, throwaway Supabase project for CI and pass its values in explicitly:
#
#   CI_SUPABASE_URL=https://xxxx.supabase.co \
#   CI_SUPABASE_ANON_KEY=... \
#   CI_SUPABASE_SERVICE_ROLE_KEY=... \
#   CI_SUPABASE_JWT_SECRET=... \
#   bash setup-ci-secrets.sh --apply
#
# Neo4j, Qdrant, Elasticsearch and Redis need no secrets — CI runs them as local
# containers via `docker compose --profile local-stores`.
#
# Tier 1 (unit tests) needs none of this and is already green.
# ---------------------------------------------------------------------------------------

set -euo pipefail

APPLY=false
[[ "${1:-}" == "--apply" ]] && APPLY=true

cd "$(dirname "$0")"

if ! command -v gh >/dev/null 2>&1; then
  echo "error: gh CLI not found. Install it: https://cli.github.com" >&2
  exit 1
fi
gh auth status >/dev/null 2>&1 || { echo "error: run 'gh auth login' first" >&2; exit 1; }

REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
echo "repository: $REPO"
echo "mode:       $([[ "$APPLY" == true ]] && echo APPLY || echo 'dry run (pass --apply to write)')"
echo

# Reads a key's value from .env without echoing it.
from_env() {
  [[ -f .env ]] || return 1
  sed -n "s/^$1=//p" .env | head -1
}

set_secret() {
  local name="$1" value="$2" source="$3"
  if [[ -z "$value" ]]; then
    printf '  %-32s SKIP  (no value: %s)\n' "$name" "$source"
    return
  fi
  if [[ "$APPLY" == true ]]; then
    printf '%s' "$value" | gh secret set "$name" --repo "$REPO" >/dev/null
    printf '  %-32s SET   (%d chars, from %s)\n' "$name" "${#value}" "$source"
  else
    printf '  %-32s would set (%d chars, from %s)\n' "$name" "${#value}" "$source"
  fi
}

# --- Model provider keys: reused from .env. These cost provider quota per CI run. -------
echo "Model provider keys (from .env — each CI run spends quota on these):"
for key in NVIDIA_NIM_API_KEY JINA_API_KEY GROQ_API_KEY; do
  set_secret "$key" "$(from_env "$key" || true)" ".env"
done

# --- Supabase: CI-only project, never read from .env. -----------------------------------
echo
echo "CI-only Supabase (must be a throwaway project — NOT read from .env):"
missing=0
for key in CI_SUPABASE_URL CI_SUPABASE_ANON_KEY CI_SUPABASE_SERVICE_ROLE_KEY CI_SUPABASE_JWT_SECRET; do
  value="${!key:-}"
  [[ -z "$value" ]] && missing=1
  set_secret "$key" "$value" "environment"
done

echo
if [[ "$missing" == 1 ]]; then
  cat <<'EOF'
The CI_SUPABASE_* values were not supplied, so the integration job will report
"skipped" and exit 0 — it will not fail the build. Tier-1 unit tests run regardless.

To enable the integration job, create a separate Supabase project and re-run with its
values exported (see the header of this script).
EOF
else
  echo "All integration secrets present. The integration job will run on the next push."
fi

if [[ "$APPLY" != true ]]; then
  echo
  echo "Nothing was written. Re-run with --apply to set the secrets above."
fi

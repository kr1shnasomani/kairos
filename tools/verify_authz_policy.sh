#!/usr/bin/env bash
# Verify infra/policies/kairos.rego decides the way the app expects.
#
# Runs against a THROWAWAY OPA container, so it never touches the running kairos-opa and can be
# run while the stack is live. The expected matrix below is derived from the frontend route table
# in frontend/src/components/use-role.ts — the two must agree, or a role can open a page whose
# API calls it cannot make.
#
# Usage: tools/verify_authz_policy.sh   (exits non-zero on any mismatch)

set -uo pipefail
cd "$(dirname "$0")/.."

OPA_IMAGE="openpolicyagent/opa:0.65.0"

# role:action:expected
CASES=(
  # --- sensitive reads: the field worker reaches none of them -----------------
  "field_worker:read_audit:false"
  "field_worker:read_compliance:false"
  "field_worker:read_governance:false"
  "field_worker:read_nonconformance:false"
  "field_worker:read_documents:false"
  "field_worker:read_events:false"
  # --- compliance auditor: cockpit + audit trail + non-conformance, nothing else
  "compliance:read_compliance:true"
  "compliance:read_audit:true"
  "compliance:read_nonconformance:true"   # /compliance/nonconformance reads conflicts+quarantine
  "compliance:read_events:true"           # ...and events, on the same page
  "compliance:read_governance:false"      # but NOT model gate / MoC / circuit breaker
  "compliance:read_documents:false"
  # --- staff -----------------------------------------------------------------
  "engineer:read_governance:true"
  "engineer:read_nonconformance:true"
  "engineer:read_compliance:true"
  "engineer:read_audit:true"
  "engineer:read_documents:true"
  "engineer:read_events:true"
  "reliability:read_governance:true"
  "reliability:read_documents:true"
  "admin:read_audit:true"
  "admin:read_documents:true"
  # --- writes: unchanged by the read work ------------------------------------
  "field_worker:write_api:true"           # deviation flags, brief acks, synthesize
  "field_worker:write_assets:false"
  "field_worker:ingest_document:false"
  "engineer:write_assets:true"
  "engineer:ingest_document:true"
  "engineer:promote_quarantine:false"     # engineers resolve conflicts, reliability promotes
  "reliability:promote_quarantine:true"
  "reliability:countersign_brief:true"
  "engineer:countersign_brief:false"      # the acknowledger's role cannot also countersign
  "admin:promote_quarantine:true"
  # --- the Postgres role on a raw Supabase token is not an app role -----------
  "authenticated:read_compliance:false"
  "authenticated:write_api:false"
  ""
)

fail=0
pass=0
for case in "${CASES[@]}"; do
  [ -z "$case" ] && continue
  role="${case%%:*}"; rest="${case#*:}"; action="${rest%%:*}"; want="${rest##*:}"
  got=$(echo "{\"user\":{\"role\":\"$role\"},\"action\":\"$action\"}" \
    | docker run --rm -i -v "$PWD/infra/policies:/policies:ro" "$OPA_IMAGE" \
        eval -d /policies -I 'data.kairos.authz.allow' 2>&1 \
    | grep -o '"value": [a-z]*' | head -1 | awk '{print $2}')
  if [ "$got" = "$want" ]; then
    pass=$((pass + 1))
  else
    fail=$((fail + 1))
    printf 'FAIL  %-14s %-22s want=%s got=%s\n' "$role" "$action" "$want" "${got:-<no decision>}"
  fi
done

echo "authz policy: $pass passed, $fail failed"
[ "$fail" -eq 0 ] || exit 1

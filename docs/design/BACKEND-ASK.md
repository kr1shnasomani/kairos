# Backend ask — `/assets` list serialiser

**Raised:** 2026-08-21 · **From:** frontend beautification (senior review item 8)
**Size:** small — two fields, one endpoint · **Blocking:** an `OPEN ISSUES` column on `/assets`

---

## What we need

`GET /assets/` should return `open_work_orders_count` and `compliance_gap_count` on **each list item**.

Both fields **already exist** on the detail endpoint `GET /assets/{asset_id}`. This is asking for the
same two values in the list response — no new computation is being invented.

## Why

The senior design review (item 8) calls `/assets` the worst page in the app: a single "Name" column
stretched full width, so rows read as duplicates — "Shell and Tube Heat Exchanger" appears three
times with nothing to tell them apart.

We are rebuilding it with real columns. Of the seven columns the reviewer's mockup shows, we verified
against the live API and are **dropping three**:

| Column | Decision | Reason |
|---|---|---|
| ASSET (name + tag) | build | `name`, `tag_number` present |
| CLASS | build | `equipment_class` present |
| CRITICALITY | build | `criticality` present |
| SITE | **drop** | `site_id` is `SITE_001` for all 10 assets — a single-value column is wasted width |
| STATUS | **drop** | not exposed by the API, and `assets.status` is `active` for all 10 rows in the DB |
| **OPEN ISSUES** | **blocked — this ask** | counts exist on the detail endpoint only |

Without this change the frontend has two options, both bad: fire one request per row (N+1), or drop
the column. **We are dropping the column for now** and shipping three columns instead of four. The
page still improves substantially; this makes it complete.

## Current behaviour

```bash
TOKEN=$(curl -s -X POST http://localhost:8000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@kairos.local","password":"KairosAdmin123!"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')

curl -sL -H "Authorization: Bearer $TOKEN" http://localhost:8000/assets/ | python3 -m json.tool
```

Returns per item:

```json
{
  "asset_id": "HE-303",
  "name": "Shell and Tube Heat Exchanger",
  "tag_number": "HE-303",
  "equipment_class": "he-3xx_series",
  "criticality": "critical",
  "site_id": "SITE_001",
  "facility_id": "RPC",
  "eam_source": "manual",
  "identity_confirmed": true,
  "created_at": "2026-08-21T15:56:31.394631+00:00"
}
```

The detail endpoint `GET /assets/HE-303` additionally returns:

```
compliance_gap_count
open_work_orders_count
identity_confirmed_at
identity_confirmed_by
last_inspection_date
```

## Requested behaviour

Each list item gains exactly two integer fields:

```json
{
  "asset_id": "HE-303",
  "…": "…",
  "open_work_orders_count": 2,
  "compliance_gap_count": 1
}
```

**Contract notes:**
- Both are non-null integers. Use `0`, never `null` — the UI renders `0` as a meaningful "no open
  issues", and `null` would be indistinguishable from "not computed".
- Field names must match the detail endpoint exactly, so the frontend types stay shared.
- No other field changes. Adding these must not remove or rename anything above.

## Performance — the part that matters

The list is small today (10 assets) but this must not become a per-row query. Please aggregate in a
single query rather than looping. Sketch:

```sql
SELECT a.*,
       COALESCE(wo.cnt, 0) AS open_work_orders_count,
       COALESCE(cg.cnt, 0) AS compliance_gap_count
FROM assets a
LEFT JOIN (
  SELECT asset_id, COUNT(*) AS cnt
  FROM operational_events
  WHERE event_type = 'work_order_created'
    AND <open condition>
  GROUP BY asset_id
) wo ON wo.asset_id = a.asset_id
LEFT JOIN (
  SELECT asset_id, COUNT(*) AS cnt
  FROM <compliance gap source>
  WHERE status = 'gap'
  GROUP BY asset_id
) cg ON cg.asset_id = a.asset_id;
```

Reuse whatever the detail endpoint already does for these two counts — **the definitions must match**
exactly. If the detail endpoint counts open work orders differently from the query above, the detail
endpoint is correct and this sketch is wrong.

## Definition of done

- [ ] `GET /assets/` returns both fields on every item
- [ ] Values match `GET /assets/{id}` for the same asset — verify on at least `EQ-101` (which has
      both a work order and a compliance gap) and `HE-303`
- [ ] Zero rather than null when there are none
- [ ] One aggregate query, not N+1 — confirm with query logging on a 10-asset list
- [ ] Existing `/assets` consumers unaffected

## Verification

```bash
# both fields present on every item, no nulls
curl -sL -H "Authorization: Bearer $TOKEN" http://localhost:8000/assets/ \
| python3 -c '
import sys, json
items = json.load(sys.stdin)
items = items.get("items", items) if isinstance(items, dict) else items
missing = [i["asset_id"] for i in items
           if i.get("open_work_orders_count") is None
           or i.get("compliance_gap_count") is None]
print("FAIL missing/null:", missing) if missing else print(f"PASS — {len(items)} items, both fields present")
'

# list value agrees with detail value
for A in EQ-101 HE-303; do
  L=$(curl -sL -H "Authorization: Bearer $TOKEN" http://localhost:8000/assets/ \
      | python3 -c "import sys,json;d=json.load(sys.stdin);d=d.get('items',d) if isinstance(d,dict) else d;print([x['open_work_orders_count'] for x in d if x['asset_id']=='$A'][0])")
  D=$(curl -sL -H "Authorization: Bearer $TOKEN" http://localhost:8000/assets/$A \
      | python3 -c "import sys,json;print(json.load(sys.stdin)['open_work_orders_count'])")
  [ "$L" = "$D" ] && echo "PASS $A list=$L detail=$D" || echo "FAIL $A list=$L detail=$D"
done
```

## Not urgent, and not blocking

The frontend ships `/assets` with three columns regardless. When this lands, adding the fourth column
is a few lines on our side. **Please do not rush it at the cost of the aggregate-query requirement** —
an N+1 here is worse than a missing column.

---

## Separately: a live 500 worth a look

Unrelated to the above, found during the same audit:

```
GET /elicitation/offboarding/sessions  →  HTTP 500 Internal Server Error
```

`GET /elicitation/offboarding` (without `/sessions`) works and returns one programme. This is not in
the known-bug list and no frontend surface currently depends on it — flagging it rather than
requesting it.

# Phase implementation report — Phase 4 Point Slice 3 (Rates SSOT · A)

**Date:** 2026-08-05  
**Scope:** Member Rates SSOT = `point_plans`; charge `applied_rate` / `rate_version` snapshots; Admin CRUD  
**Code/migration:** `supabase/migrations/20261018160000_member_point_rates_ssot_snapshot.sql` (live applied; created missing `point_plans`)  
**Verdict:** **PASS — Phase 4 Slice 3 CLOSED**

## What was implemented

1. **SSOT** — `point_plans` with `rate_version` (bump on payment/point/bonus/currency change via hub)
2. **Charge snapshot** — `point_charge_requests.applied_rate` + `rate_version` set at create; plan edits do not rewrite history
3. **Hub** — [`lib/points/member-point-plans.ts`](lib/points/member-point-plans.ts) list/create/update + version bump
4. **Admin** — `/admin/point-plans` + `/api/admin/point-plans` (point permission); menu leaf under 공통관리 Points
5. **Approve** — continues to use `v_req.point_amount` only (no plan re-read)

Store Point / `STORE_POINT_CHARGE_PAYMENT_RATIO` / Member↔Store transfer / CP menu MERGE = **not in this slice**.

## Runtime (Production)

**HEAD = origin/main = deploy SHA:** `698594aec8fc13a576de0048b5f2f44df639a1e9`  
**Alias:** `https://samarket.vercel.app`  
**Evidence:** `.qa-logs/phase4-slice3-runtime-698594aec/runtime-min.json`

| # | Item | Result |
|---|------|--------|
| 0 | Deploy SHA match | PASS |
| 1 | `point_plans` + rate columns exist | PASS |
| 2 | Admin CRUD → `rate_version` bump | PASS |
| 3 | Charge create → applied_rate + rate_version snapshot | PASS |
| 4 | Plan edit → existing request snapshot immutable | PASS |
| 5 | Approve uses request.point_amount only | PASS |
| 6 | Store untouched | PASS |
| 7 | Android / iOS smoke (prod alias) | PASS |

## Exit Gates

```
Phase: 4 Slice 3 (Member Rates SSOT · A)
Date: 2026-08-05
Product Gate: PASS — point_plans Rates SSOT; snapshots immutable
Authority Gate: PASS — no Store merge; no global rate_versions table
Runtime Gate: PASS — SHA 698594aec
Admin Gate: PASS — /admin/point-plans CRUD under existing Points tree
Regression Gate: PASS — unit/contract tests + Store untouched
Cleanup Tag Gate: PASS — Member rate_version REPLACE 완료; Store ratio still REPLACE예정
Next allowed: Phase 4 Slice 4 (Store Point boundary/verify) → Phase 4 Exit Gate
```

## Phase 1.5 tag note

| Asset | Was | Now |
|-------|-----|-----|
| Member `rate_version` / Rates SSOT | REPLACE예정 | **REPLACE 완료 (Member)** — `point_plans` + charge snapshots |
| Store / `STORE_POINT_CHARGE_PAYMENT_RATIO` | REPLACE예정 | **still REPLACE예정** (Slice 4) |

## PASS/FAIL

**Phase 4 Slice 3 CLOSED.** Next: **Slice 4 Store Point**. Phase 4 overall remains OPEN until Store + Exit Gate.

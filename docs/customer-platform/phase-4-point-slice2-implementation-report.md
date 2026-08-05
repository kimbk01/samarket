# Phase implementation report — Phase 4 Point Slice 2 (Member ledger-only)

**Date:** 2026-08-05  
**Scope:** Member Point SSOT = `point_ledger` SUM; `profiles.points` = project-only cache  
**Code/migration:** `supabase/migrations/20261018150000_member_point_ledger_only_project.sql` (live applied)  
**Verdict:** **PASS — Phase 4 Slice 2 CLOSED**

## What was implemented

1. **Hub** — `sumUserPointLedger`, `projectUserPointBalanceFromLedger`, `reconcileUserPointBalance` on [`lib/points/user-point-ledger.ts`](lib/points/user-point-ledger.ts)
2. **Mutations** — `spend` / `credit` / `expire` / `adjust` / audit: authority = ledger SUM; cache write **only** via project
3. **SQL** — `sum_user_point_ledger`, `project_user_point_balance_from_ledger`; `approve_user_point_charge_request` rewritten to sum → insert → project
4. **Admin** — GET exposes `ledgerSum` / `cacheMatchesLedger`; POST `{ reconcile: true }` repairs cache
5. **Tests** — hub unit + static orphan-writer contract

Rates / Store Point / Member↔Store transfer / Admin CP menu / dropping `profiles.points` column = **not in this slice**.

## Runtime (Production)

**HEAD = origin/main = deploy SHA:** `9356946f76807a18f21c253e11bdda9762414bdf`  
**Alias:** `https://samarket.vercel.app`  
**Evidence:** `.qa-logs/phase4-slice2-runtime-9356946f7/runtime-min.json`

| # | Item | Result |
|---|------|--------|
| 0 | Deploy SHA match | PASS |
| 1 | project / sum RPC exists | PASS |
| 2 | Orphan writer grep (TS `profiles.points` UPDATE = hub project only) | PASS |
| 3 | Admin adjust → ledger SUM == cache | PASS |
| 4 | Hub spend/credit (trade-ad shaped) → SUM == cache | PASS |
| 5 | Reconcile intentionally mismatched → repaired | PASS |
| 6 | Charge approve RPC present + project path | PASS |
| 7 | Store Point untouched | PASS |
| 8 | Android / iOS smoke (prod alias + devices) | PASS |

## Exit Gates

```
Phase: 4 Slice 2 (Member Point ledger-only)
Date: 2026-08-05
Product Gate: PASS — point_ledger SUM SSOT; profiles.points project cache only
Authority Gate: PASS — no Store merge; no Member↔Store transfer; Rates untouched
Runtime Gate: PASS — SHA 9356946f7
Admin Gate: PASS — reconcile + ledgerSum on admin points route
Regression Gate: PASS — unit/contract tests + Store untouched
Cleanup Tag Gate: PASS — Member dual-write REPLACE → ledger-only (cache projection retained)
Next allowed: Phase 4 Slice 3 (Rates SSOT) → Slice 4 Store → Phase 4 Exit Gate
```

## Phase 1.5 tag note

| Asset | Was | Now |
|-------|-----|-----|
| Member dual-write / cache-as-authority | REPLACE 진행 (Slice 1 hub) | **REPLACE 완료 (Member)** — ledger-only + project cache |
| `rate_version` / Rates SSOT | REPLACE예정 | **still REPLACE예정** (Slice 3) |
| Store Point / `STORE_POINT_CHARGE_PAYMENT_RATIO` | REPLACE예정 | **still REPLACE예정** (Slice 4) |

## PASS/FAIL

**Phase 4 Slice 2 CLOSED.** Next: **Slice 3 Rates SSOT**. Phase 4 overall remains OPEN until Rates + Store + Exit Gate.

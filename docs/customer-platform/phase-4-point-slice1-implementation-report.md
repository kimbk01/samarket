# Phase implementation report — Phase 4 Point Slice 1 (Writer Hub)

**Date:** 2026-08-05  
**Scope:** Member Point 이탈 writer → `user-point-ledger` 허브 단일화  
**Code/migration:** code only (no schema migration)  
**Verdict:** **PASS — Phase 4 Slice 1 CLOSED**

## What was implemented

1. **Hub** — `adjustUserPoints`, `appendUserPointLedgerAudit` on [`lib/points/user-point-ledger.ts`](lib/points/user-point-ledger.ts)
2. **Trade Ads** — hold / release / charge / finalize route through hub (no direct `profiles.points` UPDATE)
3. **Admin PATCH** — [`app/api/admin/users/[id]/points/route.ts`](app/api/admin/users/[id]/points/route.ts) → `adjustUserPoints` only
4. **Types/labels** — `ad_hold` / `ad_hold_release` / `ad_charge` / `admin_credit` / `admin_debit` + `trade_post_ad` related type; ko/en labels
5. **Bell** — `notify-user-points` `link_url: /mypage/points` confirmed (no code change required)

`profiles.points` remains **balance cache**. Ledger-only SUM SSOT, Store, Rates, Admin CP menu = **not in this slice**.

## Runtime (Production)

**HEAD = origin/main = deploy SHA:** `bfc1630942c80882a8b6636bdd93bd0bc5a81a9a`  
**Alias:** `https://samarket.vercel.app`  
**Evidence:** `.qa-logs/phase4-slice1-runtime-bfc163094/runtime-min.json`

| # | Item | Result |
|---|------|--------|
| 0 | Deploy SHA match | PASS |
| 1 | Orphan writer grep (trade-ads + admin PATCH) | PASS |
| 1b | Hub owns `profiles.points` writes | PASS |
| 2 | Admin adjust → ledger + balance | PASS |
| 3 | Trade-ad hold/release (hub-shaped related_id) | PASS |
| 4 | Bell → `/mypage/points` | PASS |
| 5 | Store Point untouched | PASS |
| 6 | Android / iOS smoke (prod alias + installed) | PASS |

## Exit Gates

```
Phase: 4 Slice 1 (Point Writer Hub)
Date: 2026-08-05
Product Gate: PASS — Member writer hub; profiles.points cache kept
Authority Gate: PASS — no Store merge; no ledger-only claim
Runtime Gate: PASS — SHA bfc163094
Admin Gate: PASS — Admin adjust via hub
Regression Gate: PASS — unit tests + Store untouched
Cleanup Tag Gate: PASS — dual-write orphan paths consolidated (REPLACE 진행; ledger-only 미완)
Next allowed: Phase 4 Slice 2 (ledger-only and/or Rates) or continue Point plan — Store/Rates still deferred
```

## Phase 1.5 tag note

| Asset | Was | Now |
|-------|-----|-----|
| Dual-write orphan writers (trade-ads, admin PATCH) | REPLACE예정 | **REPLACE 진행/부분완료** (hub 경유; `profiles.points` cache 유지) |
| Full ledger-only / `rate_version` / store ratio | REPLACE예정 | **still REPLACE예정** (next slices) |

## PASS/FAIL

**Phase 4 Slice 1 CLOSED.** Ledger-only / Store / Rates remain for later Point slices. Phase 5 not started.

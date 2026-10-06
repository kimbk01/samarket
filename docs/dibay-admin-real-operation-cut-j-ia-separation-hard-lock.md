# DIBAY Admin Real Operation — CUT J IA SEPARATION

**Status:** HARD LOCK (CUT J) + **J-AMD-1 implemented** (`members` after `dashboard`)  
**Companion:** `lib/admin/admin-real-operation-cut-j-ia-separation-hard-lock.ts`  
**IA amendment design:** `docs/admin/dibay-admin-ia-owner-approved-amendment.md`  
**Gate:** `npm run verify:admin-real-operation-cut-j-ia-separation-hard-lock`  
**Depends on:** CUT A–I (do not squash)

## Purpose

Separate Admin IA by operator work:

- **DOMAIN MANAGEMENT** — Delivery / Trade / Community / Messenger
- **COMMON OPERATION** — Finance / Ads·Exposure / Support / Notifications / System
- **CROSS-DOMAIN** — deep-links only (Store hub, Placement Map, Action Center)
- **MEMBERS** (J-AMD-1 target) — Users / global reports / sanction log / audit (URLs preserved)

## Invariants

1. Nav SSOT = `components/admin/admin-menu.ts`
2. Workspace routing = `lib/admin/admin-workspace-routing.ts`
3. No duplicate primary leaf for the same canonical path
4. HOME / Category config stay Delivery; delivery-ads ops entry is Ads
5. Placement Map is read orchestration — not a config writer
6. No ads-v2 / finance wallet / support inbox DB / new Admin shell
7. AST-002 store point charges and platform-inquiries are not primary nav
8. CUT I Production P0 carry remains NOT_PROVEN / PARTIAL / NOT_IMPLEMENTED
9. `ads` and `promotion` remain **sibling** workspaces (B-X1 rejected — no single parent)
10. Full workspace reorder (J-AMD-2) is **rejected**
11. CUT J must not be fully unlocked / rewritten as a new lock

## Live workspace order (enforced today)

`CUT_J_WORKSPACE_ORDER` — matches current `adminMenu` top-level keys:

`dashboard → members → delivery → trade → community → messenger → finance → ads → promotion → support → notifications → system`

## J-AMD-1 — Owner-approved limited amendment (IMPLEMENTED)

**Status:** `OWNER_APPROVED_IMPLEMENTED`

### Clause

1. Insert workspace **`members` immediately after `dashboard`**.
2. Keep the **relative order** of every other workspace unchanged.
3. Target order (`CUT_J_WORKSPACE_ORDER_J_AMD_1`):

`dashboard → members → delivery → trade → community → messenger → finance → ads → promotion → support → notifications → system`

4. **Members leaves (URL preserve only):**

| key | path |
|---|---|
| users | `/admin/users` |
| global-reports | `/admin/reports` |
| reports-logs | `/admin/reports/log` |
| audit-logs | `/admin/audit-logs` |

5. When menu implementation is separately authorized: move these leaves to `members`; do not leave duplicate primary leaves under `system` (invariant 3).
6. **Unchanged by J-AMD-1:** API gates, DB, RLS, writers, Domain independence, Ads/Promotion registry separation (CUT C), legacy primary forbidden, CUT I honesty, permission contracts.
7. **Rejected under this amendment:** J-AMD-2 full reorder · B-X1 single ads+promotion parent · CUT J full unlock.

### Related Owner-approved design (not menu code)

See `docs/admin/dibay-admin-ia-owner-approved-amendment.md`: M1 labels · M2 deep-links · M3 IA doc · M5 dashboard shortcut. M4 held.

## Gate

```bash
npm run verify:admin-real-operation-cut-j-ia-separation-hard-lock
npx vitest run lib/admin/__tests__/admin-real-operation-cut-j-ia-contract.test.ts
```

Live gate continues to enforce **current** `CUT_J_WORKSPACE_ORDER` vs `adminMenu` until a separate menu-implementation authorization updates both together.

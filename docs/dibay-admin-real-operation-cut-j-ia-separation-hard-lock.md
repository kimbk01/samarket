# DIBAY Admin Real Operation — CUT J IA SEPARATION

**Status:** HARD LOCK (CUT J)  
**Companion:** `lib/admin/admin-real-operation-cut-j-ia-separation-hard-lock.ts`  
**Gate:** `npm run verify:admin-real-operation-cut-j-ia-separation-hard-lock`  
**Depends on:** CUT A–I (do not squash)

## Purpose

Separate Admin IA by operator work:

- **DOMAIN MANAGEMENT** — Delivery / Trade / Community / Messenger
- **COMMON OPERATION** — Finance / Ads·Exposure / Support / Notifications / System
- **CROSS-DOMAIN** — deep-links only (Store hub, Placement Map, Action Center)

## Invariants

1. Nav SSOT = `components/admin/admin-menu.ts`
2. Workspace routing = `lib/admin/admin-workspace-routing.ts`
3. No duplicate primary leaf for the same canonical path
4. HOME / Category config stay Delivery; delivery-ads ops entry is Ads
5. Placement Map is read orchestration — not a config writer
6. No ads-v2 / finance wallet / support inbox DB / new Admin shell
7. AST-002 store point charges and platform-inquiries are not primary nav
8. CUT I Production P0 carry remains NOT_PROVEN / PARTIAL / NOT_IMPLEMENTED

## Gate

```bash
npm run verify:admin-real-operation-cut-j-ia-separation-hard-lock
npx vitest run lib/admin/__tests__/admin-real-operation-cut-j-ia-contract.test.ts
```

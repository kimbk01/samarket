# DIBAY Admin Real Operation — CUT E CONTROL PLANE

**Status:** HARD LOCK (CUT E)  
**Companion:** `lib/admin/admin-real-operation-cut-e-control-plane-hard-lock.ts`  
**Gate:** `npm run verify:admin-real-operation-cut-e-control-plane-hard-lock`  
**Depends on:** CUT A–D (do not squash)

## Purpose

Assemble A–D domain SSOTs into an **operation-centered** Admin experience:

- Action Center on `/admin` (needs-action first)
- Store operation hub deep-links on `/admin/business/{id}`
- Bell ↔ Action Center Finance semantic parity (**Cash ≠ AST-002**)
- Navigation memory via `view` / `tab` / `returnTo` query params

Control Plane is **not** a new domain: no unified DB, no mutation ownership.

## Bell semantic (CUT E fix)

| Key | Source | Role |
|---|---|---|
| `cash_charges` | `business_cash_charge_requests` PENDING | Actionable Cash |
| `store_charges` | `store_point_charge_requests` (AST-002) | Archive observability only; **excluded from Bell total** |
| `user_charges` | `point_charge_requests` | Member Point |

## Carry

Finance / Ads / Support / Partner live E2E and Tablet remain **NOT_PROVEN**.

## Gate

```bash
npm run verify:admin-real-operation-cut-e-control-plane-hard-lock
```

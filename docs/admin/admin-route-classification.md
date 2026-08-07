# Platform Admin — Route Classification (Phase A1)

**Date:** 2026-08-07  
**Evidence:** `docs/admin/_generated-route-inventory.json` + `components/admin/admin-menu.ts`  
**HEAD:** `b61feda45`

## Summary

Aligned with generated ledger:

| Classification | Count |
|----------------|------:|
| workspace_root | 11 |
| canonical | 127 |
| internal_detail | 36 |
| redirect_only | 16 |
| reexport_compat | 6 |
| orphan_candidate | **1** |
| **Total pages** | **197** |

## Decision key

| Label | Action |
|-------|--------|
| KEEP | Canonical / internal detail / workspace |
| DEPRECATE | Redirect or compatibility; keep until deep-link evidence zero |
| QUARANTINE | Reachability unclear |
| DELETE_PROVEN | **0** in Slice 1 |

## Orphan

| Route | Classification | Notes |
|-------|----------------|-------|
| `/admin/operations` | DEPRECATE (IA lock C4) | Not a menu leaf; delete forbidden |

`/admin/ops-runbooks/start` = **internal_detail** (under manage-runbooks).

## Menu missing page

| Menu path | Classification |
|-----------|----------------|
| `/admin/customer-platform/faq` (`pendingRoute`) | **ACCEPTED** pending — not dead |

## Redirect-only (16 in-page; no next.config `/admin` redirects)

| Legacy | Target |
|--------|--------|
| `/admin/delivery-orders/**` | `/admin/stores/orders/**` |
| `/admin/delivery/bottom-nav` | `/admin/stores/bottom-nav` |
| `/admin/posts` | `/admin/community/posts` |
| `/admin/menus` | `/admin/menus/main-bottom-nav` |
| `/admin/behavior-events` | `/admin/recommendation-analytics?tab=events` |
| `/admin/order-notifications/settings` | `/admin/settings/notifications` |
| `/admin/users/[id]` | `/admin/users?detail=` |

## Reexport / matchPaths

Philife `page.tsx` re-exports community; `matchPaths` on community + delivery leaves.

## Intentional dual pages

| Route | Role |
|-------|------|
| `/admin/stores/orders` | Operations Console |
| `/admin/store-orders` | Order Action Queue |

## Machine ledger

`docs/admin/_generated-route-inventory.json`

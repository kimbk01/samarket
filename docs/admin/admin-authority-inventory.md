# Platform Admin — Authority Inventory (Phase A + B)

**Date:** 2026-08-07  
**HEAD baseline:** `b61feda45` on `origin/main`  
**Mode:** Evidence inventory only — **NO delete / NO API / NO writer / NO IA change**  
**Scope:** `/admin/**` Platform Admin. Owner Admin (`/stores/owner/**`) isolation only.

---

## 0. Shell visual prerequisite

| Item | Status |
|------|--------|
| Visual re-audit Runtime | PASS |
| Commit | `b61feda45` on `origin/main` |
| Re-commit needed | **NO** |

---

## 1. Asset counts (static)

| Asset | Count | Source |
|-------|------:|--------|
| `app/admin/**/page.tsx` | 197 | `_generated-route-inventory.json` |
| `app/api/admin/**/route.ts` | 244 | same |
| `components/admin/**` (ts/tsx, excl. tests) | 551 | filesystem walk |
| Menu `path` entries (`adminMenu`) | 143 | `components/admin/admin-menu.ts` |
| Workspaces (top-level) | 11 | Phase 1 SSOT contract |

Machine ledger: `docs/admin/_generated-route-inventory.json`.

---

## 2. A1 Route classification summary

| Type | Count |
|------|------:|
| `workspace_root` | 11 |
| `canonical` | 127 |
| `internal_detail` | 36 |
| `redirect_only` | 16 |
| `reexport_compat` | 6 |
| `orphan_candidate` | 1 |

Detail: `docs/admin/admin-route-classification.md`.

### Menu path without page

| Menu path | Flag | Notes |
|-----------|------|-------|
| `/admin/customer-platform/faq` | `pendingRoute: true` | **ACCEPTED** pending — not dead |

### Orphan page

| Route | Notes |
|-------|-------|
| `/admin/operations` | IA lock C4 — not a menu leaf; delete forbidden |

---

## 3. A2 Component authority (shell / nav)

| Concern | Authority | Status |
|---------|-----------|--------|
| Workspace nav + sidebar tree | `components/admin/admin-menu.ts` → `adminMenu` | **KEEP / SSOT** |
| Workspace resolve / breadcrumb | `lib/admin/admin-workspace-routing.ts` | **KEEP** |
| Active leaf / query / hash | `components/admin/sidebar/admin-sidebar-active-path.ts` | **KEEP** |
| Shell layout | `components/admin/shell/AdminPlatformShell.tsx` | **KEEP** |
| Legacy `AdminShell` export | re-exports `AdminPlatformShell` | adapter OK |
| Legacy `AdminSidebar.tsx` | 0 import sites; divergent loading-role fallback | **DEPRECATE** candidate |
| `AdminQuickLinks.tsx` | 0 imports; parallel hardcoded map | **DEPRECATE** candidate |
| Dashboard / hub hardcoded hrefs | `DEV_LINKS` in `DashboardQuickLinksBySection.tsx`; TradeHub; OpsHub; DeliveryOrdersDashboardClient; CP dashboard; UrgentBlock | **SSOT CONFLICT (OPEN)** — first break |
| Owner Admin | `BusinessAdminShell` under `/stores/owner/**` | **ISOLATED** |

Dead candidates: `docs/admin/admin-dead-code-register.md` (`DELETE_PROVEN` = **0**).

---

## 4. A3 API inventory (summary)

| Bucket | Count / note |
|--------|--------------|
| Total `app/api/admin/**` handlers | **244** |
| Client string templates observed | ~98 unique in admin clients |
| Orphan API graph | **NOT_PROVEN** (needs dedicated Slice) |
| Writer stub | `mark-paid` `admin_console_stub` — see mock register **OPEN** |

---

## 5. Phase B — SSOT audit

### B1 Menu SSOT

| Check | Result |
|-------|--------|
| 11 workspaces single tree | **PASS** |
| One canonical path → one menu leaf | **PASS** |
| Redirect-only not in menu leaves | **PASS** |
| `admin-menu-config.ts` | Adapter + curated quick-link lists |
| `DEV_LINKS` + hub hardcoded maps | **FAIL / OPEN** — first break |
| Shell breadcrumb | **PASS** (`resolveAdminBreadcrumb`) |
| Dual `filterMenuByRole` / role enums | **OPEN** |

### B2 Route SSOT

| Check | Result |
|-------|--------|
| Delivery legacy redirects | **PASS** |
| Philife re-export + `matchPaths` | **PASS** |
| `/admin/stores/orders` vs `/admin/store-orders` | **KEEP both** |
| FAQ pending | **ACCEPTED** |
| Orphan | `/admin/operations` only |

### B3 Active state SSOT

| Check | Result |
|-------|--------|
| Active workspace ≤ 1 | **PASS** (Runtime visual Slice) |
| Active leaf ≤ 1 | **PASS** (query/hash-aware leaf helper) |
| Dual matcher | **OPEN** — leaf helper query/hash-aware; workspace/breadcrumb pathname-only |

---

## 6. First breaks (do not hide)

1. **Dashboard `DEV_LINKS`** — menu SSOT 밖 하드코딩 navigation  
2. **FAQ** — `pendingRoute` only — IA **ACCEPTED** pending  
3. **`mark-paid` `admin_console_stub`** — production writer stub **OPEN**  
4. **Runtime integration** — code chain 8 domains mapped; full runtime chain **0**

---

## 7. Admin ↔ App verdict (normalized)

```text
ADMIN ↔ APP CODE CHAIN: FULL — 8 sampled domains
ADMIN ↔ APP RUNTIME CHAIN: NOT_PROVEN — 0
ADMIN ↔ APP INTEGRATION FINAL: PARTIAL
```

---

## 8. Slice gate

```text
SLICE 1 (inventory): AUDIT DOCUMENTATION CLOSED
DELETE / QUARANTINE MOVE: NOT STARTED
PLATFORM ADMIN PRODUCT: OPEN
```

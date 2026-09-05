# ARO-OPS-UX-002-B8 — SHARED UI OWNER TRACE

Canonicalize existing Admin primitives; do not invent a second design system.

| Surface | OWNER | Geometry / notes |
|---|---|---|
| Shell | `AdminPlatformShell.tsx` | flex column; header measured → `--admin-shell-header-height` |
| Header | same | `sticky top-0 z-40` |
| Page chrome / breadcrumb | shell + `AdminShellBreadcrumb` | `data-admin-page-chrome` · `data-admin-breadcrumb` |
| Main content | shell main | `overflow-x-hidden` (tables own X via viewport) |
| Sidebar | `AdminWorkspaceSidebar` | mobile `top: var(--admin-shell-header-height)` z-50 |
| Page header | `AdminPageHeader` | `data-admin-page-header` |
| CTA | `AdminActionButton` / `AdminActionLink` | primary/secondary/neutral/danger/ghost |
| Status tone | `AdminToneBadge` | presentation only |
| CP section/empty | `AdminControlPlaneChrome` | B4/B5/B6 wired |
| Empty/error | `AdminConsoleState` | shared |
| Table X | `AdminManagementTableViewport` | body must not own X |
| Dialog | `dibay-overlay` | existing SSOT |

## FIRST DIVERGENCE

1. Breadcrumb probe miss → missing `data-admin-breadcrumb` (fixed)
2. Main `overflow-x-auto` competed with tables (fixed → hidden)
3. Drawer overlay z == header z (fixed → z-45)
4. System labels said “운영/CP” under System workspace (fixed labels only)
5. CP duplicate Section/Unavail/header grammar (shared chrome wired)

## B7 CANDIDATES

- Orders breadcrumb selector → shared attr
- System purpose → 시스템 허브 / System hub
- CP parity → shared chrome + title token

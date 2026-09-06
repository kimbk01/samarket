# BASELINE RESTORE DECISION — Owner Store OS (executed)

**Decision:** `SELECTIVE_SHELL_RESTORE`  
**Date:** 2026-09-06  
**Trigger:** User Production screenshot after `a48c78865` — double top clearance + BottomNav on Product CREATE (≥2 domains share shell geometry risk).

## SHAs

| Label | SHA |
|---|---|
| PRE_STORE_OS_BASELINE_SHA | `1771318be` |
| LAST_STABLE_OWNER_SHA (layout) | `d4f512232` |
| FIRST_COMPOSER_HEIGHT_BAD | `e41d44c73` |
| FIRST_STORE_OS_PRESENTATION_SHA | `7fd97bd07` |
| CURRENT_BEFORE_THIS_RECOVERY | `85480b40b` / post-`a48c78865` |

## What was wrong (root causes — not page patches)

1. **Double top offset** on Product composer `main`:  
   `.owner-compact-shell__main` (`--owner-shell-main-pt`) **plus**  
   `pt-[calc(var(--safe-top)+3.5rem+0.75rem)]` → huge white gap under header.
2. **BottomNav on Product CREATE/EDIT** after composer joined shared scroll host — Save/Register CTA obstruction.
3. **Missing canonical scroll host** on Product form — body scroll locked without `OwnerAdminPageScrollShell` (`__scroll`).

## Executed restore (this change)

| Action | KEEP/REVERT |
|---|---|
| Remove dual composer `pt-[calc…]` | REVERT compensating pad |
| Hide BottomNav on product composer paths | RESTORE CREATE/EDIT clearance |
| Wrap `OwnerProductForm` in `OwnerAdminPageScrollShell padForOwnerBottomNav={false}` | RESTORE shell scroll SSOT |
| Document-flow form (no nested 100dvh/`basis-0`) | KEEP from `a48c78865` |
| Business fixes (reviews JSON, ads greeting, finance, holidays, …) | KEEP |

## Forbidden until shell PASS

No new route-local: `h-full` / `basis-0` / `100dvh` / dual `pt-*` / per-page `pb-32` for Owner.

## Hard locks (source)

- No dual `pt-[calc(var(--safe-top)+3.5rem+0.75rem)]` on composer in `BusinessAdminShell`
- `isOwnerStoreFormBottomNavHiddenPath(products/new|edit)` === true
- Product form uses `OwnerAdminPageScrollShell` + document-flow body

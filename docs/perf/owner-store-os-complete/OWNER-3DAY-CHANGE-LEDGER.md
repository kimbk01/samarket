# OWNER 3-DAY CHANGE LEDGER

**Scope:** Owner Store OS work ≈ 2026-09-03 → CURRENT (`85480b40b` / post-`a48c78865`)  
**Authority:** User Production screenshots override automated PASS.  
**Decision input for:** SELECTIVE SHELL RESTORE (default when ≥2 domains share shell defects).

## Baseline SHAs (re-proven)

| Label | SHA | Evidence |
|---|---|---|
| PRE_STORE_OS_BASELINE_SHA | `1771318be` (`7fd97bd07^`) | Last commit before Owner P0 shell+IA |
| LAST_STABLE_OWNER_SHA (layout) | `d4f512232` | Product form = document flow; no nested composer `100dvh`/`flex-1` scroll |
| FIRST_STORE_OS_PRESENTATION_SHA | `7fd97bd07` | Owner Admin P0 shell + P1/P2 ops IA |
| FIRST_COMPOSER_HEIGHT_BAD | `e41d44c73` | Nested composer height ownership introduced |
| RECOVERED_PARTIAL | `ad7942be6` | Minimum height patch — compensating, not SSOT |
| SELECTIVE_RESTORE_1 | `a48c78865` | Shared scroll host + document-flow form |
| CURRENT | HEAD after restore follow-up | Still FAIL until header/bottom clearance PASS |

## Hard rule trigger (this turn)

User Production after `a48c78865`:

1. **Product** — top gap / top fields not at correct clearance; bottom-nav present on CREATE; SAVE CTA obstructed risk  
2. Same shell geometry (`OWNER_COMPACT_SHELL_MAIN` + route-local `pt-[calc]` + bottom-nav eligibility) will hit **Store Settings / other forms** the same way  

→ **≥2 critical domains share global shell defect** → **DO NOT PAGE-PATCH** → **SELECTIVE SHELL RESTORE**.

## Commit ledger (Owner-facing)

| COMMIT | CLASS | INTENT | ACTUAL USER EFFECT | KEEP/REVERT/REWORK |
|---|---|---|---|---|
| `7fd97bd07` | PRESENTATION_REWRITE + NAV_IMPROVEMENT | Owner P0 shell/IA | New shell ownership; later layout fragility | REWORK shell; KEEP nav IA ideas |
| `d252544dc` / `8a59baf8e` | UX_IMPROVEMENT + PRESENTATION_REWRITE | Real-world Owner UX / discovery | Mixed: discovery better; geometry less stable | KEEP business discovery; REWORK presentation |
| `6989d8de5` | BUSINESS_FIX | Continuity across product/ops | Domain continuity | KEEP if proven |
| `ad7942be6` | COMPENSATING_PATCH | Product New height-0 | Temporary mobile recover; desktop/user still FAIL | REVERT pattern (already superseded) |
| `a5f78fe24` | BUSINESS_FIX | Reviews/ads/finance/holidays/nav sound | Real reachability fixes | KEEP |
| `a48c78865` | PRESENTATION_REWRITE (partial restore) | Shared scroll + document-flow form | Form visible again BUT double top pad + bottom-nav on CREATE | REWORK (remove dual pad + hide CREATE bottom-nav) |

## File-level shell ownership (critical)

| FILE | BEFORE (stable idea) | AFTER (broken pattern) | CLASS | ACTION |
|---|---|---|---|---|
| `BusinessAdminShell.tsx` | One main top offset via compact shell CSS | Composer adds **second** `pt-[calc(safe-top+3.5rem+0.75rem)]` on top of `OWNER_COMPACT_SHELL_MAIN_CLASS` | COMPENSATING_PATCH / REGRESSION | **REVERT extra pt** — one `--owner-shell-main-pt` only |
| `BusinessAdminShell.tsx` | Product CREATE/EDIT without bottom nav | Product New shows BottomNav (composer not in hide path) | REGRESSION | **RESTORE** hide BottomNav on product composer paths |
| `OwnerProductForm.tsx` | Document-flow form | Nested `100dvh`+`flex-1` then restored | COMPENSATING then RESTORE | KEEP document-flow |
| `owner-stack-scroll-host-path.ts` | Composer excluded → private height owner | Included in shared scroll host | UX_IMPROVEMENT | KEEP shared host |
| `owner-basic-info-guard.ts` | Bottom-nav hide = basic-info/profile only | CREATE product not covered | REGRESSION | **EXTEND** hide to product composer |

## KEEP (business — do not throw away)

- Customer canonical hub / care routing  
- Reviews single-flight JSON parse  
- Ads greeting `t(key,{name})`  
- Holiday `note`↔`holidays` dual-write  
- Finance server summary + Cash debit sign  
- Notification settings route discovery  
- sold_out / product_status contracts (when already proven)  
- Drawer discovery completeness (IA)

## REVERT / REMOVE (presentation)

- Composer parallel `100dvh overflow-hidden` height owner  
- Composer `main` dual top padding (`pt-[calc(safe-top+…)]` on top of `--owner-shell-main-pt`)  
- Bottom-nav on Product CREATE/EDIT  
- Any further route-local `pb-*` / `pt-*` hacks  
- Product form without `OwnerAdminPageScrollShell` under body-lock (scroll owner missing)

## SELECTIVE_RESTORE executed (this recovery)

1. Drop dual composer top pad — ONE `--owner-shell-main-pt`  
2. Hide BottomNav on product composer paths  
3. Wrap Product form in `OwnerAdminPageScrollShell padForOwnerBottomNav={false}`  
4. Keep document-flow form body (no nested `100dvh` / `basis-0`)

## SHELL DECISION

**SELECTIVE_SHELL_RESTORE** (executed)

Canonical end state:

1. ONE content top clearance = `--owner-shell-main-pt` / `.owner-compact-shell__main`  
2. ONE bottom-nav rule = hidden on CREATE/EDIT form composers; visible on LIST/ROOT  
3. ONE scroll owner = `OwnerAdminPageScrollShell` / `.owner-compact-shell__scroll` under body lock  
4. Product form = document flow under that host  

No new `h-full` / `basis-0` / `100dvh` patches.


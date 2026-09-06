# BASELINE RESTORE DECISION — Owner Store OS

**Decision:** `SELECTIVE_SHELL_RESTORE`  
**Canonical restore SHA:** `6ca1b3d46`  
**Completion:** viewport height owned by ONE `.owner-stack-shell` CSS root (required under body lock; replaces broken `${TW}:h-[100dvh]` JIT that made `6ca1b3d46` incomplete)

## WHY THE 3-DAY LOOP HAPPENED (honest)

After `6ca1b3d46` selective restore shipped, follow-up commits stacked compensating height patches:

| SHA | What it was | Why it looped |
|---|---|---|
| `3a7ae6c51` | CSS 100dvh lock | Valid need, but applied as extra patch layer |
| `f7a9b8dc3` | header token 3.5rem | Needed for top clearance; shipped separately |
| then nested `data-owner-stack-shell` on inner | dual 100dvh | **Regression** — scroll dead again |
| `d2d6d5a91` | un-nest root | Another patch on the stack |

User symptom: fix → return → fix → return.

**Rule now:** no further Owner shell height/padding patches. This file is the freeze.

## Canonical end state (ONLY)

1. ONE top clearance = `--owner-shell-main-pt` (header `3.5rem` + border) — no dual `pt-[calc…]`
2. BottomNav hidden on Product CREATE/EDIT
3. Product form = document-flow under `OwnerAdminPageScrollShell`
4. ONE viewport root = `.owner-stack-shell` outermost only
5. ONE page scroll = `.owner-compact-shell__scroll`

## Forbidden

- Nested `data-owner-stack-shell` / second 100dvh root
- `${OWNER_COMPACT_SHELL_MAX_TW}:h-[100dvh]` dynamic Tailwind
- Route-local `h-full` / `basis-0` / product-form `100dvh` / dual `pt-*` / per-page `pb-32`
- Claiming CLOSED without user-runtime Product New scroll + register proof

## KEEP (business — do not throw away)

Reviews JSON · ads greeting · finance · holidays · customer hub · etc.

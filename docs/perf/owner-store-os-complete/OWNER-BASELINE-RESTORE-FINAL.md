# DIBAY OWNER ADMIN — FULL BASELINE RESTORE FINAL

**Authority:** User Production screenshots override automation.  
**Status at this write:** Shell selective restore **implemented in tree**; Production human re-proof **NOT_PROVEN** until deploy + merchant QA.

## SHAs

| Label | Value |
|---|---|
| LAST_STABLE_OWNER_SHA | `d4f512232` (layout: document-flow product; pre nested 100dvh) |
| PRE_STORE_OS_BASELINE_SHA | `1771318be` |
| FIRST_STORE_OS_PRESENTATION_SHA | `7fd97bd07` |
| CURRENT_BEFORE_RECOVERY | `85480b40b` (post-`a48c78865`) |
| RECOVERY_COMMIT | _(pending ship)_ |

## 3-DAY CHANGES

See `OWNER-3DAY-CHANGE-LEDGER.md`.

| Class | Action |
|---|---|
| KEEP | Reviews JSON single-flight, ads greeting vars, holidays dual-write, finance server summary + Cash debit sign, notification settings discovery, customer hub IA, sold_out/product_status when proven |
| REVERT | Dual composer `pt-[calc…]`, BottomNav on Product CREATE/EDIT, nested 100dvh/`basis-0` scroll owners |
| REWORK | Composer on shared scroll + `OwnerAdminPageScrollShell` |
| REMOVED_PATCHES | Route-local dual top pad on composer main |

## SHELL DECISION

**SELECTIVE_SHELL_RESTORE** (executed in working tree)

## Contract matrix (source / local)

| Contract | Result |
|---|---|
| HEADER SSOT | PASS (source) — one `--owner-shell-main-pt`; composer uses same main class |
| SCROLL SSOT | PASS (source) — Product under `OwnerAdminPageScrollShell` |
| BOTTOM NAV CLEARANCE | PASS (source) — composer paths hide BottomNav |
| CTA SSOT | PASS (source) — Register/Save in document flow; no BottomNav cover |
| PRODUCT | PASS (source/unit) — **USER VIEWPORT / PRODUCTION: NOT_PROVEN** |
| STORE / ORDERS / CUSTOMER / FINANCE / SETTLEMENT / PROMOTION / NOTIFICATION | KEEP business fixes; layout not re-patched page-by-page — **runtime NOT_PROVEN this turn** |
| 390 / 430 / 768 / 1024 / 1280 | NOT_PROVEN (await Production human QA) |
| PRODUCTION | NOT_PROVEN |
| ANDROID / IOS / PHYSICAL SOUND | NOT_PROVEN (native deferred) |

## Unit evidence (this turn)

`npx vitest run lib/business/__tests__/owner-admin-scroll-shell-contract.test.ts` → **25 passed**

## ADMIN ARO

**PRESERVED** (untouched by this recovery)

## UNRESOLVED

1. Production deploy + human viewport QA (header clearance, scroll, Save CTA, no BottomNav on Product New)  
2. Full domain merchant walk after shell stable on Production  
3. Native after web PASS

## FINAL

**OWNER ADMIN STORE OS = FAIL / NOT CLOSED**

Until Production human-usable Product + Settings + Orders clearance is proven.

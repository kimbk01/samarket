# Owner Product blank — baseline restore decision

**Updated:** 2026-09-06  
**Authority:** User Production screenshot overrides automated PASS.

## USER REPORTED PRODUCT BLANK

**CONFIRMED as FAIL for current Store OS judgment** (user runtime).

Automation on `https://samarket.vercel.app` with `?storeId=` present showed a usable form at 390/1024/1280/1440.  
The same route **without** `storeId` rendered header + need-store message / blank canvas — matching the user’s “header only, body blank” shape more closely than the previous height-0-with-category symptom.

Therefore:

- Claims of `PRODUCT NEW PRODUCTION = PASS` / `RECOVERED_GOOD sufficient` are **invalidated** for Store OS close.
- Additional `h-full` / `basis-0` compensating patches are **forbidden**.

## Timeline (re-checked)

| Label | SHA | Notes |
|---|---|---|
| PRE_STORE_OS_BASELINE | `1771318be` | Before Store OS P0 |
| LAST_GOOD_BEFORE_REGRESSION (layout) | `d4f512232` | Product form = document flow (`flex min-h-0 flex-col` + natural form) |
| FIRST_BAD (nested composer height) | `e41d44c73` | Introduced nested composer / overflow ownership split |
| RECOVERED_GOOD (partial) | `ad7942be6` | Temporary height patch — **not** stable SSOT |
| CURRENT | `a5f78fe24`+ | Still FAIL for close until human-usable Product New is locked |

## SHELL DECISION

**SELECTIVE_RESTORE**

Why:

1. Same Product New class of failure recurred after a minimum-forward height patch.
2. Nested owners (`100dvh` + `overflow-hidden` + `flex-1` scroll) are a patch stack, not a canonical contract.
3. `d4f512232` document-flow form is the last clear human-usable layout contract for registration content.
4. Preserve later business fixes (customer/ads/finance/etc.) — do not whole-repo rollback.

Executed:

- Product composer included in Owner stack scroll host again.
- Shell: remove parallel composer `h-[100dvh] overflow-hidden` + `main h-full overflow-hidden` special case.
- Form: restore document-flow root (no nested `100dvh` / flex-1 scroll body).
- `/products/new` without `storeId`: resolve first store and redirect (no blank composer dead-end).

## Status

OWNER ADMIN STORE OS = **FAIL / NOT CLOSED** until Production human-usability proof passes after this restore ships.

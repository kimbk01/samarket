# DIBAY Admin Real Operation — CUT F PLACEMENT MAP

**Status:** HARD LOCK (CUT F)  
**Companion:** `lib/admin/admin-real-operation-cut-f-placement-map-hard-lock.ts`  
**Gate:** `npm run verify:admin-real-operation-cut-f-placement-map-hard-lock`  
**Depends on:** CUT A–E (do not squash)

## Purpose

Admin **Full App Placement Map** = read-model adapter that normalizes:

- Delivery inventory (`delivery-ad-inventory`)
- Feed placement (`feed-ad-placement`)
- Platform popup surfaces
- HOME / CATEGORY composition (CROSS_LINK_ONLY)

into one **inspect** surface. Not a new placement SSOT / DB / mutation owner.

## Entry

`/admin/delivery-ads/inventory` → `#placement-map` (`AdminPlacementMapPanel`)

Forbidden: `/admin/placement-map-v2` and parallel consoles.

## Flag separation (mandatory)

| Flag | Meaning |
|---|---|
| DEFINED | In domain registry |
| SELLABLE | Launch commercial product |
| RUNTIME_SUPPORTED | Code consumer exists |
| PREVIEW_SUPPORTED | Preview contract covers key |

**SEARCH_TOP** may be DEFINED + RUNTIME without SELLABLE — never label as “운영 가능” solely because registry/runtime exists.

## Preview parity

Delivery preview keys ⊆ inventory registry. No fake counts / screenshot markers / duplicated ratio authority.

## Carry

Finance / Ads live / Popup Production / Support / Partner / Tablet remain as prior CUTs (**NOT_PROVEN** or **PARTIAL**). Do not write “Admin 운영 완료.”

## Gate

```bash
npm run verify:admin-real-operation-cut-f-placement-map-hard-lock
```

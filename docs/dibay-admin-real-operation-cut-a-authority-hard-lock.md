# DIBAY Admin Real Operation — CUT A AUTHORITY / LEGACY / DEAD ROUTE HARD LOCK

**Status:** HARD LOCK (CUT A)  
**Companion code:** `lib/admin/admin-real-operation-cut-a-authority-hard-lock.ts`  
**Gate:** `npm run verify:admin-real-operation-cut-a-authority-hard-lock`  
**Mode:** Freeze CURRENT REALITY. No UI shell, no menu move, no unified tables.

## 0. Non-goals (this CUT)

- Growth Hub / Control Plane UI / Placement Map / Reset UI
- DB / `*_campaigns` rename
- Finance large rewrite / Support inbox merge UI
- Production destructive mutation

## 1. Authority answers (single answer each)

| Question | CANONICAL OWNER |
|---|---|
| Admin Navigation | `components/admin/admin-menu.ts` (+ workspace derive / Platform shell). `lib/admin-menu-config.ts` = compat adapter only. |
| Member Point | `lib/points/user-point-ledger.ts` · `point_ledger` |
| Store Coin | `store_economic_point_accounts` / ledger · `lib/currency/*` |
| Store Cash | Product name **Cash** · `business_cash_*` · `canonical-business-cash-contract.ts` · UI “Business Cash” = alias only |
| Delivery Ad Product | `delivery-ad-product-registry.ts` · `delivery_ad_products` · keys: `store_sponsored`, `banner` |
| Delivery Ad Execution | `store_paid_ad_campaigns` / `store_banner_ad_campaigns` · lifecycle `delivery-ad-lifecycle.ts` · UI term: 광고 집행 |
| Delivery Ad Creative | `delivery-ad-creative.ts` · `delivery_ad_creatives` |
| Delivery Placement | `delivery-ad-inventory.ts` · `delivery_ad_inventories` |
| Delivery Admin transition | RPC `admin_delivery_ad_transition` |
| Delivery Admin CTA presentation | `delivery-ad-admin-required-decision.ts` + `delivery-ad-admin-action-queue-presentation.ts` |
| Delivery Eligibility | `store-sponsored-exposure-eligibility.ts` |
| Feed Ads | `lib/ads/*` · **not shared** with Delivery |
| Platform Popup | `lib/platform-popup/*` · **must not absorb** into Delivery ad tables |
| HOME composition | `/admin/stores-home-shelves` · `lib/stores/composition/*` · Ads = **CROSS_LINK_ONLY** |
| CATEGORY policy | `/admin/stores-category-policy` · Ads = **CROSS_LINK_ONLY** |
| Support | `lib/support/*` · `/admin/support` |
| Partner | Membership **≠** AdProduct · `delivery_ad_partner_*` · `R3_ADMIN_PARTNER_NOT_PRODUCT` |

### Explicit deferred (no schema change in CUT A)

`DELIVERY_AD_APPLICATION_ID_EQUALS_EXECUTION_ID = true` — Delivery BC `applicationId` often equals execution row UUID. Do not invent a second application table in later CUTs without a dedicated migration plan.

## 2. Support / Inquiry separation

| Kind | State | Merge? |
|---|---|---|
| A. Customer Support | `lib/support/*` CANONICAL | — |
| B. Delivery Ad ops thread | `delivery_ad_operations_*` | **NO** merge into support cases |
| C. Legacy platform inquiry | `platform_admin_inquiries` READ_ONLY_ARCHIVE · route REDIRECT · PATCH 410 | **NO** new write |

### Support reference capability (CURRENT)

| Ref | Supported? |
|---|---|
| DELIVERY_AD / AD_CAMPAIGN | YES |
| FEED_AD | NO |
| POPUP | NO |
| FINANCE ledger entry | NO |
| STORE_ORDER / GIFT / PRODUCT / SETTLEMENT | YES |

## 3. Popup DOC vs CODE

| Field | Value |
|---|---|
| DOCUMENT | `docs/dibay-global-popup-ad-product-contract-lock.md` claims `IMPLEMENTATION: BLOCKED` |
| CODE | `lib/platform-popup/*` + `/admin/platform-popup` present |
| RUNTIME Production PASS | **NOT_PROVEN** this CUT |
| VERDICT | **DOC_STALE_FOR_IMPLEMENTATION_STATUS** · code module is authority for writers · do not reopen Delivery absorption |

## 4. Placement systems

| System | Owner | Unify? |
|---|---|---|
| Delivery inventory | `delivery-ad-inventory.ts` | MUST REMAIN SEPARATE |
| Feed placement | `feed-ad-placement.ts` | MUST REMAIN SEPARATE |
| Popup surfaces | `lib/platform-popup/surfaces.ts` | MUST REMAIN SEPARATE |
| Legacy AdPlacement | `ad-application` adapter | LEGACY · NO_NEW_WRITE |
| Target App Placement Map | Adapter / read-model over separate registries | **Do not merge DB registries in CUT F** |

## 5. Legacy / Dead / NO_NEW_WRITE

See `LEGACY_DEAD_SURFACE_LOCKS` + `NO_NEW_WRITE_API_FILES` + `REDIRECT_ONLY_ADMIN_PAGES` in the companion TS module.

Forbidden new shells (later CUTs): `/admin/growth`, `/admin/ads-center`, `/admin/ads-v2`, resurrecting `/admin/operations` as a product hub.

## 6. Scenario A–R

See `SCENARIO_A_R_ENTRY_LOCK` in companion TS. TARGET routes are **not** invented here — only current entries + Control Plane role hints.

## 7. Forbidden new owners

| Domain | Forbidden new owner |
|---|---|
| Admin nav | Second menu tree outside `admin-menu.ts` |
| Cash | Reopening `delivery_ad_accounts` / `store_cash_*` product writers |
| Delivery ads | Writing via `/api/admin/store-paid-ads` or `store-banner-ads` mutators |
| Support | Writing via `/api/admin/platform-inquiries` mutators |
| Composition | Ads Control Plane writing HOME/CATEGORY composition |
| Partner | Treating Partner as `DeliveryAdProductKey` |
| Placement | Single unified placement table as SSOT |

## 8. Gate

```bash
npm run verify:admin-real-operation-cut-a-authority-hard-lock
```

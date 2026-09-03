# DIBAY Admin Real Operation — CUT C ADS OPERATION CLOSE

**Status:** HARD LOCK (CUT C)  
**Companion:** `lib/admin/admin-real-operation-cut-c-ads-operation-hard-lock.ts`  
**Gate:** `npm run verify:admin-real-operation-cut-c-ads-operation-hard-lock`  
**Depends on:** CUT A `479e07fff` · CUT B `00b7475c9` (do not squash)

## Domain model (UI terms)

| Term | Meaning | Delivery owner |
|---|---|---|
| AD PRODUCT | Sellable offering | `delivery-ad-product-registry` |
| AD APPLICATION | Owner submit request | Collapsed into execution row (**KEEP_CURRENT**) |
| AD EXECUTION | Review/schedule/active unit | `store_*_ad_campaigns` (DB name retained) |
| AD CREATIVE | Image/CTA | `delivery_ad_creatives` |
| AD PLACEMENT | Inventory key | `delivery-ad-inventory` |
| AD BILLING | Cash only | AST-005 |
| AD APPROVAL | Admin transition | `admin_delivery_ad_transition` |
| AD DELIVERY | Runtime eligibility | sponsored/banner eligibility |

Bare **Campaign** is not a new SSOT. DB `*_campaigns` are not renamed.

## Invariants

1. Payment ≠ ACTIVE (OWNER_PAID)
2. Feed / Popup / Delivery placement registries remain separate
3. HOME/CATEGORY composition = CROSS_LINK_ONLY
4. Partner ≠ AdProduct
5. `admin-bell` `store_charges` must **not** drive Ads or Cash queues (AST-002 legacy semantic)

## CUT B carry (Production blockers)

- FINANCE OPERATION UX: PARTIAL
- FINANCE PRODUCTION E2E: NOT_PROVEN
- COIN PRODUCTION EARN (`DIBAY_CURRENCY_SALE_RECOGNITION_LIVE`): NOT_PROVEN
- TABLET FINANCE: NOT_PROVEN

## Gate

```bash
npm run verify:admin-real-operation-cut-c-ads-operation-hard-lock
```

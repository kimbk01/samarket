# DIBAY Delivery Advertising SSOT

**CUT A** — Authority Cleanup — **IN FORCE** (`93341d675`)  
**CUT B** — Campaign / Inventory / Creative / Lifecycle / Audit — **IN FORCE** (this revision)

Code owner: `lib/stores/advertising/`  
Schema: `supabase/migrations/20261201120000_delivery_ads_cut_b_ssot.sql`

This document explains the code/DB contract. It does not invent runtime authority beyond what is implemented.

---

## 1. Product boundary

```
DELIVERY MONETIZATION
├── STORE_PAID_AD          (product: store_sponsored)
├── BANNER_AD              (product: banner)
├── COUPON                 [not an ad]
├── EDITORIAL_PROMOTION    [not an ad]
└── DELIVERY_FEE_PROMOTION [not an ad]
```

| Product key | creative_mode | Campaign authority table |
|-------------|---------------|--------------------------|
| `store_sponsored` | STORE | `store_paid_ad_campaigns` |
| `banner` | IMAGE | `store_banner_ad_campaigns` |

Registry table: `delivery_ad_products`. **Never merge** the two campaign tables.

**Isolated:** `store_banners` · `feed_ad_campaigns` · `my_page_banners` · coupons · editorial · fee promo.

---

## 2. Inventory registry

Table: `delivery_ad_inventories`

| Key | Product | runtime_status | is_active | ratio | ratio_source |
|-----|---------|----------------|-----------|-------|--------------|
| STORES_HOME_HERO | banner | ACTIVE | true | 39:16 | CURRENT_RUNTIME_MEASURED (`min-h-[140]`/`max-h-[180]` @ ~390→160) |
| STORES_HOME_FEED | store_sponsored | ACTIVE | true | 4:3 | CURRENT_RUNTIME_MEASURED |
| STORES_CATEGORY_FEED | store_sponsored | ACTIVE | true | 4:3 | CURRENT_RUNTIME_MEASURED |
| STORES_HOME_INLINE_1 | banner | FUTURE | false | 2:1 | FUTURE |
| STORES_CATEGORY_TOP | banner | FUTURE | false | 3:1 | FUTURE |
| STORES_CATEGORY_INLINE | banner | FUTURE | false | 2:1 | FUTURE |
| STORES_SEARCH_TOP | banner | FUTURE | false | — | FUTURE (CUT J) |
| STORE_DETAIL_RECOMMENDATION_BANNER | banner | FUTURE | false | — | FUTURE (CUT J) |

**Device principle:** one inventory ratio for iOS / Android APK / mobile web / tablet. Forbidden: `ios_ratio` / `android_ratio` / `tablet_ratio`. Parity proof = CUT E/K.

**Do not invent 16:9 for HOME HERO** — Production shell is measured.

---

## 3. Legacy mapping

| Legacy | Inventory |
|--------|-----------|
| `stores_home` | STORES_HOME_FEED |
| `stores_browse` | STORES_CATEGORY_FEED |
| `stores_home_hero` | STORES_HOME_HERO |

Junctions: `delivery_store_sponsored_campaign_inventories` · `delivery_banner_campaign_inventories`

### Surface gates (CUT B classification)

| Gate | Class |
|------|-------|
| `ad_integration` | **COMPATIBILITY** |
| `ad_enabled` | **COMPATIBILITY** |
| `homePaidAdInsertion` | **COMPATIBILITY** |

Inventory is CANONICAL for placement identity. Gates remain runtime surface policy until CUT D cutover. Dual authority forbidden.

---

## 4. Creative SSOT

Table: `delivery_ad_creatives`

- Banner: `asset_path` (canonical upload storage) — not free remote URL authority  
- CTA allowlist only: `store_detail` · `store_menu` · `store_promotion`  
- Existing `store_banner_ad_campaigns.image_url` backfilled → creative + `creative_id` link (image_url retained for runtime compat)

---

## 5. Lifecycle + review

Shared vocabulary on both campaign tables (`lifecycle_status`, `review_status`).  
`is_active` remains for **runtime compatibility** (synced conceptually with ACTIVE/SCHEDULED).

Lifecycle: DRAFT → … → ARCHIVED (see `delivery-ad-lifecycle.ts`).  
Review: NOT_SUBMITTED · PENDING · IN_REVIEW · CHANGES_REQUESTED · APPROVED · REJECTED.

Transition authority: `canTransitionDeliveryAdLifecycle` — Owner cannot Admin-approve.

---

## 6. Pricing (vocabulary only)

Models: CPC · CPA_ORDER · ORDER_PERCENT · FIXED_PERIOD  
**chargeExecution = false** (CUT H). Do not claim billing implemented.

---

## 7. Audit + delete

Table: `delivery_ad_audit_logs` (append-only intent).

Physical delete: DRAFT + zero impression/click/attribution/billing/audit history only.  
With history → ENDED / ARCHIVED / TERMINATED. Admin ops ≠ audit destruction.

---

## 8. Organic isolation

```
ORGANIC CANDIDATES → ORGANIC RANKING → ORGANIC RESULT
PAID ELIGIBILITY → SPONSORED INSERTION PLAN → INTERLEAVE
```

Forbidden: paid boost into ranking modules.

---

## 9. Eligibility

Final AND-list in `delivery-ad-eligibility-contract.ts`.  
Runtime fail-closed map = **CUT D**. Current `storeEligibleById: null → true` = **PARTIAL**.

---

## 10. Routes (foundation)

| Role | Path | UI |
|------|------|-----|
| Owner | `/stores/owner/ads` | Stub — CUT C |
| Admin | `/admin/delivery-ads` | Stub — CUT F |
| Admin legacy | `/admin/store-insertions`, `/admin/store-banner-ads` | Writers until CUT F |

Preview SSOT (Owner = Admin = Customer renderer) = CUT E.

---

## 11. CUT ownership

| CUT | Status |
|-----|--------|
| A | CLOSED |
| B | CLOSED when migration applied + gates pass |
| C–K | Locked roadmap — not started |

Billing/events/analytics/search/detail/device E2E: later CUTs only.

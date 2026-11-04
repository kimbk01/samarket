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
| STORES_HOME_INLINE_1 | banner | ACTIVE | true | 2:1 | ACTIVE (2026-11-03 정정: 코드·DB 와 일치, 어드민 직접 등록·운영 노출 중, 한 번에 1개) |
| STORES_CATEGORY_TOP | banner | ACTIVE | true | 2:1 | ACTIVE (2026-11-03 정정: 코드·DB 와 일치, 어드민 직접 등록, 한 번에 1개·회전 없음, 등록 수용량 3 = 예비 풀) |
| STORES_CATEGORY_INLINE | banner | FUTURE | false | 2:1 | FUTURE |
| STORES_SEARCH_TOP | banner | ACTIVE | true | 3:1 | PRODUCT_DESIGN_LOCK (CUT J) |
| STORE_DETAIL_RECOMMENDATION_BANNER | banner | FUTURE | false | 16:9 | FUTURE — CUT J BLOCKED (no canonical recommendation ad surface) |

**Device principle:** one inventory ratio for iOS / Android APK / mobile web / tablet. Forbidden: `ios_ratio` / `android_ratio` / `tablet_ratio`. Parity proof = CUT E/K.

**Do not invent 16:9 for HOME HERO** — Production shell is measured.

---

## 3. Legacy mapping

| Legacy | Inventory |
|--------|-----------|
| `stores_home` | STORES_HOME_FEED |
| `stores_browse` | STORES_CATEGORY_FEED |
| `stores_home_hero` | STORES_HOME_HERO |
| `stores_search` | STORES_SEARCH_TOP |

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
  - C-2 (Owner 「설계안대로」 2026-11-04 · DS-6): **매장이 연결된 배너**(사장님 배너 · 매장 있는 운영자 자체 배너)는 위 3종만이며, 연결 매장 id 의 실제 slug 와 `cta_href` 의 매장이 같아야 한다.
  - **매장 없는 운영자 자체 배너**(D-28)는 이벤트(`/events/:id`) 또는 배달 안 화면(`/stores` · `/stores/browse…` · `/stores/search…` · `/stores/gift-mall…` · `/delivery…`)만.
  - 외부 주소(`https://…`)는 어느 경우든 저장 때 거부한다. 단일 정의: `lib/destination/delivery-banner-destination.ts`.
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
| Owner | `/stores/owner/ads` | 운영 중 — 사장님 배달 광고 허브(`OwnerDeliveryAdsHubView`) · 상세 `[campaignId]` · 파트너 `partner` |
| Admin | `/admin/delivery-ads` | 허브는 `/admin/advertising`(전체 광고)로 이동. 운영 화면 = `manage` · `inventory` · `commercial-settings` · `cash-charges` · `partner` · `first-party/new` · `[campaignId]` · `[campaignId]/creative` |
| Admin legacy | `/admin/store-insertions`, `/admin/store-banner-ads` | 쓰기 없음 — 배달 광고 허브로 이동(redirect). `store-insertions?focus=coupons` 만 `/admin/store-coupon-control` |

> 2026-11-04 정정 (광고 표면 연동 I3): 이전 표의 「Stub — CUT C / CUT F」「Writers until CUT F」는 코드와 달랐다. 위 표는 `app/(main)/stores/owner/ads/**`·`app/admin/delivery-ads/**`·`app/admin/store-*/page.tsx` 실제 라우트 기준이다.

Preview SSOT (Owner = Admin = Customer renderer) = CUT E.

---

## 11. CUT ownership

| CUT | Status |
|-----|--------|
| A | CLOSED |
| B | CLOSED when migration applied + gates pass |
| C–K | Locked roadmap — not started |

Billing/events/analytics/search/detail/device E2E: later CUTs only.

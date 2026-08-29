# DIBAY Delivery Advertising SSOT

**CUT A — Authority Cleanup + Canonical Domain Contract**  
Status: **IN FORCE** (code contract owner: `lib/stores/advertising`)  
This document explains the code contract. It does not invent runtime authority.

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

| Kind | Table | DeliveryAdProductKind |
|------|-------|------------------------|
| store_paid_ad | `store_paid_ad_campaigns` | `store_sponsored` |
| banner_ad | `store_banner_ad_campaigns` | `banner` |
| coupon | `store_coupon_campaigns` | — |
| editorial_promotion | `store_discovery_campaigns` | — |
| delivery_fee_promotion | `store_fee_evidence` | — |

**Isolated (never Delivery Ad products):**

| Authority | Meaning |
|-----------|---------|
| `store_banners` | Owner store-detail decoration |
| `feed_ad_campaigns` | Trade / Community feed ads |
| `my_page_banners` | My-page CMS |

Generic UI copy must not collapse these into one “광고” authority.

---

## 2. Current authority (modules)

| Concern | Module |
|---------|--------|
| Canonical Delivery Ad Platform | `lib/stores/advertising/*` |
| Store sponsored campaign | `lib/stores/store-paid-ad-campaign-authority.ts` |
| Store sponsored exposure | `lib/stores/store-paid-ad-exposure.ts` |
| Insertion plan (interleave) | `lib/stores/composition/stores-composition-insertion-live.ts` |
| Banner campaign | `lib/stores/store-banner-ad-campaign-authority.ts` |
| Banner visibility | `lib/stores/store-banner-ad-exposure.ts` |
| HOME hero consumer | `/api/stores/home-hero-banners` → `StoresHomeHeroBanner` |
| Discovery SCREAMING aliases | `lib/stores/discovery-authority/monetization.ts` (bridge only) |

**Entity meaning (CUT A):**

- `store_paid_ad_campaigns` = STORE_PAID_AD = `store_sponsored` = paid **list** placement only.  
  Forbidden: banner, coupon, editorial, fee promo, organic ranking boost.
- `store_banner_ad_campaigns` = BANNER_AD = image creative Delivery banner.  
  **Current capability = Admin HOME hero CMS only** (no Owner product, billing, review, budget).

---

## 3. Organic ranking isolation

```
ORGANIC CANDIDATES → ORGANIC RANKING → ORGANIC RESULT
PAID ELIGIBILITY → SPONSORED INSERTION PLAN → INTERLEAVE → FINAL LIST
```

**FORBIDDEN:** `organicScore += paidBoost`, campaign weight/bid in recommended / popular / distance / rating / fast / candidate ranking.

Paid campaign types must not be imported by organic ranking modules. Contract tests: `lib/stores/advertising/__tests__/delivery-ad-domain-contract.test.ts`.

---

## 4. Current active placements

| ActiveDeliveryAdPlacement | DB value | Product |
|---------------------------|----------|---------|
| `stores_home_feed` | `stores_home` | store_sponsored |
| `stores_category_feed` | `stores_browse` | store_sponsored |
| `stores_home_hero` | `stores_home_hero` | banner |

DB enums are unchanged in CUT A (no migration).

---

## 5. Future placements (not runtime-valid)

| FutureDeliveryAdPlacement | CUT |
|---------------------------|-----|
| `stores_search` | J |
| `store_detail_recommendation` | J |

Do not accept Future values in validators/consumers until those CUTs.

---

## 6. Campaign ≠ exposure

```
CAMPAIGN        — row / is_active / schedule window
SURFACE_POLICY  — surface allows product (legacy: ad_integration, ad_enabled, homePaidAdInsertion)
ELIGIBILITY     — store / service / taxonomy factors
INSERTION_PLAN  — interleave slots (does not reorder organic ranking)
```

**HARD LOCK:** campaign exists ≠ exposure.

Legacy surface gates are `COMPATIBILITY_SURFACE_POLICY` → migrate to Inventory SSOT in **CUT B**.

`storeEligibleById: null → default true` at HOME/BROWSE callers is **PARTIAL**; wire organic/serviceability map in **CUT D** (no boolean patch in CUT A).

---

## 7. CUT ownership

| CUT | Scope |
|-----|--------|
| **A** | Authority cleanup + domain contract (this doc) |
| **B** | Campaign / placement / inventory SSOT + migrations |
| **C** | Owner STORE PAID AD lifecycle |
| **D** | HOME + CATEGORY sponsored consumer harden (eligibility) |
| **E** | Banner inventory + creative review + hero inventory |
| **F** | Admin advertising control plane |
| **G** | Impression / click / attribution events |
| **H** | Billing ledger + budget + refund |
| **I** | Owner analytics dashboard |
| **J** | SEARCH / DETAIL placements |
| **K** | Production E2E + hard lock |

CUT A does **not** implement billing, Owner ad UX, impressions, or new placements.

---

## 8. Admin IA (labels only in CUT A)

```
배달
└── 광고 관리
    ├── 매장 홍보 광고   (/admin/store-insertions)
    └── 배너 광고       (/admin/store-banner-ads)
```

Not under Delivery 광고 관리: editorial discovery, coupons, store detail banners, Trade/Community feed ads, mypage banners.  
Route consolidation = **CUT F**.

# DIBAY Point Paid Exposure / Member Feed Ad Request

**MASTER IMPLEMENTATION CONTRACT**
Status: **IN FORCE** (2026-08-08) — replaces prior “Feed Ad = Admin free CMS only” product surface lock.  
**Product B (Feed Banner):** **CLOSED / PASS** (2026-08-09) — HARD LOCK `docs/dibay-feed-banner-product-hard-lock.md` · commit `e04be170d` · prod `dpl_2cborGNhuh9A9tCn1SoUQyvLjMzB`.  
Currency authority: canonical Point ledger only. Retired Business Credit data is archive-only and must not appear as a product, writer, CTA, or navigation item.

## 0. Two revenue axes (+ admin ops)

| ID | Product | Member | Asset | Admin |
|----|---------|--------|-------|-------|
| **A** | Paid content exposure | Own Trade/Community post | Point | Trade: none · Community: approve |
| **B** | Member feed banner | Creative 1–3 mid-slot | Point HOLD→CAPTURE | Approve / Reject |
| **C** | Admin direct campaign | — | 0 | Create/activate |

## 1. Product A — PaidContentPromotion family

**Authority:** `purchase_member_content_promotion` + `point_promotion_orders` (extend domain).

| Domain | product_id | days | point_cost | Approval | Feed |
|--------|------------|-----:|----------:|----------|------|
| trade | `trade_promote_7` | 7 | 500 | none (active) | TRADE_HOME + category · page0 ≤3 |
| trade | `trade_promote_14` | 14 | 900 | none | same |
| community | `community_promote_3` | 3 | **10000** | **none (active)** — A2 immediate | Community feed TOP (pin) |
| community | `community_promote_7` | 7 | **20000** | **none (active)** — A2 immediate | same |

Community prices = existing `ad_products` plife `top_fixed` seed (NOT Trade price copy).

**CTA copy:** 「게시물 홍보」 / 「피드 상단 노출」 · badge 「홍보」
**DO NOT:** call Feed Ad 「광고」; guarantee #1 pin; dual-long-term writers (`post_ads` spend/refund vs promotion); reopen `post_ads` `top_fixed` NEW writes.

**Community A2 (2026-08-09):** Write-form / promote purchase → `applyCommunityPaidExposureImmediate` → ledger spend + `order_status=active` → `/api/ads/active`. **No admin approve on new purchases.** Legacy `pending_review` + HOLD path remains only for in-flight rows / `requiresAdminApproval` products.

## 2. Product B — Member Feed Ad Request

**Flow:** apply → **HOLD** → Admin approve → **draft campaign+creatives** → **CAPTURE** → **activate** (`source=MEMBER_REQUESTED`) → Feed · reject/cancel → **RELEASE** · campaign 0.

**PHASE 1 financial LOCK (2026-08-09):** Never CAPTURE before persist. Never leave ACTIVE without capture. On activation failure after CAPTURE → compensate credit + remove draft. Price/period runtime SSOT = **CODE** `lib/ads/feed-ad-products.ts` (DB seed mirror only).

**Tables (additive):**

- `feed_ad_requests` — request SSOT
- `feed_ad_point_holds` — hold rows (pattern from `trade_ad_point_holds`)
- `feed_ad_products` — banner price catalog (seeded from existing list/pin price points)
- `feed_ad_campaigns.source` ∈ `ADMIN_DIRECT` \| `MEMBER_REQUESTED`
- `feed_ad_campaigns.request_id` nullable FK

**Banner product seed (reuse proven point costs — no invented prices):**

| id | domain | days | cost | basis |
|----|--------|-----:|-----:|-------|
| `feed_banner_trade_3` | trade | 3 | 8000 | trade `list_top` 3d |
| `feed_banner_trade_7` | trade | 7 | 15000 | trade `premium_all` 7d |
| `feed_banner_community_3` | community | 3 | 10000 | plife top_fixed 3d |
| `feed_banner_community_7` | community | 7 | 20000 | plife top_fixed 7d |

**Placement:** TRADE_HOME / TRADE_CATEGORY / COMMUNITY_HOME / COMMUNITY_TOPIC + SSOT selectors.
**Creatives:** 1..3 required. **Destination:** canonical types only.

## 3. Product C — Admin Direct

`source=ADMIN_DIRECT` · debit 0 · separate create UI label 「관리자 직접 광고」.

## 4. Member Hub SSOT

`/mypage/ads` — 「내 홍보 / 광고」

1. 게시물 홍보 → Trade/Community own posts
2. 피드 광고 신청 → Product B
3. Status: 진행 중 / 심사 중 / 종료 / 거절

**Forbidden:** label that opens Trade promotion as “홈 배너”.

## 5. Admin IA SSOT

Workspace Growth → **광고 · 유료노출** primary leaves only:

1. `/admin/ad-applications` — 광고 신청 관리 (banner requests + legacy community pin until migrated)
2. `/admin/promoted-items` — 게시물 상위 노출
3. `/admin/feed-ads` — 피드 광고 캠페인 (source column)

Legacy (products, post-ads list, banners, home-feed, …) under **기타 광고 운영**.
Dashboard: QuickLinks / revenue strip must show the three primary paths **without URL memorization**.

## 6. Feed geometry

Prior 12:5 is **not** final LOCK. LOCK: outer width = host list item width; no hero; compact native ad; host-specific height tokens after DOM measure.

Slot: `FEED_AD_SLOT_AFTER_CONTENT_COUNT=4` — size ≠ slot; re-evaluate after geometry fix only.

## 7. Legacy disposition

| Authority | Disposition |
|-----------|-------------|
| point_ledger / Financial Surface | **KEEP** |
| purchase_member_content_promotion / point_promotion_orders | **KEEP** + community domain |
| post_ads / AdApply spend-refund | **MIGRATE** → Paid Exposure family |
| ad_products (plife top_fixed) | price SSOT reference → then deprecate apply path |
| trade_post_ads + trade_ad_point_holds | **KEEP** detail-only · not list hub CTA |
| feed_ad_campaigns/creatives | **KEEP** + source/request_id |
| mid_insert | stay **QUARANTINE** |

## 8. Implementation order (fixed)

A Contract → B Admin IA → C Member Hub → D Community normalize →
E–I Banner product/request/hold/queue/source → J–L Geometry/placement →
M Financial → N Runtime → O Cleanup → P Deploy → Q Lock

**No partial PASS** on menu-only or table-only.

## 9. Gate (all required)

TRADE/COMMUNITY PAID EXPOSURE · MEMBER FEED AD REQUEST · HOLD/CAPTURE/RELEASE ·
ADMIN IA DISCOVERABILITY · NATIVE AD · TARGET ISOLATION · FINANCIAL TRACE

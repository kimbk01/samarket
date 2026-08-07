# DIBAY Promotion / Advertisement — Phase E Product Contract

| Field | Value |
|-------|--------|
| Status | **LOCKED** (2026-08-07) |
| Mode | Red-team reconstruction |
| Asset boundary | **AST-001 D-Point ≠ AST-002 Business Credit** (unchanged) |

## PHASE E PRODUCT CONTRACT

### 1. 기존 Promotion 모델

**REPLACE (product UX + purchase path) / REPAIR (entitlement store)**

| Layer | Decision |
|-------|----------|
| User CTA / product codes (`home_top_7` 등) | **REPLACE** — 사용자에게 placement key 노출 금지 |
| `point_promotion_orders` | **REPAIR as entitlement** — 이력·ledger `related_id` 보존. dual-write 금지 |
| spend→insert→refund | **REPLACE with atomic RPC** |
| Feed 연결 | **NEW projection** (기존 없음) |

### 2. 최종 Member CTA

```text
Own Trade Post → 더 알리기 → 상품(기간+D-Point) → 구매 → 즉시 활성
```

- Primary entry: 게시물 상세 판매자 영역 (+ 기존 `/mypage/points/promotions`는 보조)
- 내부 placement key / shop 대상은 신규 CTA에서 제거 (shop+AST-001 AUTHORITY_NOTE 회피)
- Duplicate policy: **already active → 409, 연장 없음** (중첩 entitlement 금지)

### 3. 최종 Promotion Product

Code SSOT: `lib/points/promotion-products.ts` (`price_asset = D_POINT` only)

| product_id | domain | duration | point_cost | user label |
|------------|--------|----------|------------|------------|
| `trade_promote_7` | trade | 7d | 500 | 7일 더 알리기 |
| `trade_promote_14` | trade | 14d | 900 | 14일 더 알리기 |

Server price only. Client display must match server catalog.

### 4. 최종 Entitlement Authority

`point_promotion_orders` (canonical active row)

- `target_type = product`, `target_id = posts.id`
- `product_id`, `domain`, `idempotency_key` (new columns)
- `placement` retained as internal policy token `feed_boost` (compat)
- Feed reads **active entitlements**, not ledger

### 5. Point debit atomic strategy

RPC `purchase_member_content_promotion` (service_role):

validate ownership + eligibility → server product price → balance →
idempotency short-circuit → ledger debit → entitlement insert → project balance
**single transaction / ROLLBACK**

App API: `POST /api/me/points/promotion-orders` with `productId` + `Idempotency-Key`.

### 6. Advertisement Campaign Authority

Admin-operated Feed Banner (no AST-001/AST-002 debit in this scope).

Tables: `feed_ad_campaigns` + `feed_ad_creatives` (1..3 slides)

Placements: `TRADE_HOME` · `TRADE_CATEGORY` · `COMMUNITY_HOME` · `COMMUNITY_TOPIC`

Target: Trade category SSOT / Community topic SSOT (no admin copy lists).

### 7. Existing tables

| Table | Decision |
|-------|----------|
| `point_promotion_orders` | KEEP → Member Trade Promotion entitlement SSOT |
| `post_ads` / `ad_products` **top_fixed** | KEEP — Philife **member paid content pin** (distinct from Admin Feed Ads) |
| `post_ads` **mid_insert** | **QUARANTINE** — mid-slot purpose owned by `feed_ad_campaigns`; no new apply (API 410) |
| `trade_post_ads` | KEEP as Trade **detail** placement (not list feed boost) |
| `my_page_banners` | KEEP mypage CMS — Feed Ads는 **새** campaign tables |
| notification campaigns | OUT OF SCOPE |
| `TradePostAdApplySheet` | **REMOVED** (0 importers; Trade list promotion uses `MemberPostPromoteSheet`) |
| `useActivePointPromotionOrders` | **REMOVED** (0 importers; dead client hook) |

### 7b. Promotion feed projection LOCK

- Policy: **capped page-0 priority pins** (`MAX_PAGE0_PROMOTED_PINS = 3`), not unlimited dump
- Surfaces sold: **TRADE_HOME** + **matching TRADE_CATEGORY** (post’s category tree filter)
- Ordering among pins: entitlement `end_at` DESC
- Active duplicate purchase: **409 already_active** (no stack / no extend)
- Sold/hidden: not eligible for CTA purchase boost; not projected

### 7c. Admin targeting SSOT

- Trade categories: `queryTradeHomeRootCategories` (`/api/admin/feed-ads/targets`)
- Community topics: `loadPhilifeDefaultSectionTopics` (same targets API)
- Raw UUID/slug text input in Admin create UI: **FORBIDDEN**

### 8. Admin IA

| Menu | Sees |
|------|------|
| 게시물 홍보 (`/admin/promoted-items`) | Member `point_promotion_orders` entitlements |
| 피드 광고 (`/admin/feed-ads`) | Campaign / creatives / schedule |
| 배너 (`/admin/banners`) | mypage CMS (기존) |
| 거래 상세 광고 | `trade_post_ads` (기존 역할 유지) |

### 9. DB migration

**YES** (additive + RPC; no destructive drop of ledger/history)

- ALTER `point_promotion_orders` (+ product_id, domain, idempotency_key)
- RPC `purchase_member_content_promotion`
- CREATE `feed_ad_campaigns` / `feed_ad_creatives`

### 10. Projection order (LOCK)

```text
Content → Eligibility → Normal Ranking → Promotion Projection → Ad Injection → Final Feed
```

- sold / deleted / hidden / suspended: **not eligible** for promotion exposure
- Promotion ≠ Advertisement ≠ trade_post_ads detail ≠ bump
- itemType: `content` | `promoted_content` | `advertisement` (no shared `sponsored`)

### Asset isolation (LOCK)

| Action | D-Point | Business Credit |
|--------|---------|-----------------|
| Member post promote | debit | unchanged |
| Admin feed campaign activate | unchanged | unchanged |
| Store self-service ads | N/A this scope | future only |

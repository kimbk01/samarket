# DIBAY Promotion / Advertisement — Phase E Product Contract

> **SUPERSEDED for product surface (2026-08-08).**
> Master: [`docs/dibay-paid-exposure-feed-ad-master-contract.md`](./dibay-paid-exposure-feed-ad-master-contract.md)
> Feed Ad is **not** Admin-free-CMS-only. Member Feed Ad Request + HOLD/CAPTURE is in force.

| Field | Value |
|-------|--------|
| Status | **SUPERSEDED** (ledger KEEP; surface → master contract) |
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
- Duplicate policy (재감사 R2 · Owner 2026-11-03 「기간 이전에 추가 포인트를 결제하고 추가 신청하면 연장」 — 옛 「연장 없음」 대체): 내 글이 **광고 중(active)** 이면 다시 결제 = **같은 주문 연장**(끝나는 날 += 기간, 새 주문·중첩 없음). 심사 중·운영자 일시정지·남의 주문이면 **409 already_active**. 기간이 끝나면 새로 결제(새 주문)

### 3. 최종 Promotion Product

Price SSOT: **DB** `member_promotion_products` (어드민 「상위노출 가격」 저장, revision·변경 내역) — 2026-11-03 정정. `lib/points/promotion-products.ts` 는 배포 시드 참고용 (`price_asset = D_POINT` only)

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
| `post_ads` / `ad_products` **top_fixed** | KEEP — Philife **member paid top pin** (CTA 「상단에 올리기」; D-Point via legacy apply; **not** Feed「광고」) |
| `post_ads` **mid_insert** | **QUARANTINE** — mid-slot purpose owned by `feed_ad_campaigns`; no new apply (API 410) |
| `trade_post_ads` | KEEP as Trade **detail** placement (not list feed boost) |
| Feed Ad geometry | SSOT `lib/ads/feed-ad-geometry.ts` — **12:5** strip in host list sector (not 16:9 hero) |
| `my_page_banners` | KEEP mypage CMS — Feed Ads는 **새** campaign tables |
| notification campaigns | OUT OF SCOPE |
| `TradePostAdApplySheet` | **REMOVED** (0 importers; Trade list promotion uses `MemberPostPromoteSheet`) |
| `useActivePointPromotionOrders` | **REMOVED** (0 importers; dead client hook) |

### 7b. Promotion feed projection LOCK

- Policy: **capped page-0 priority pins** (`MAX_PAGE0_PROMOTED_PINS = 3`), not unlimited dump
- Surfaces sold: **TRADE_HOME** + **matching TRADE_CATEGORY** (post’s category tree filter)
- 고르기 (재감사 R2 · Owner 2026-11-03 「3명이 상위노출을 하면 최신순으로 올라가는 부분」 — 옛 「시간 단위 회전」 대체): 후보를 **결제 시각(start_at) 최근 순**으로 앞에서 최대 3개(`listActiveTradePromotionTargetIds` 정렬 · `selectPromotedListingIds`). 연장은 start_at 을 바꾸지 않으므로 자리 그대로(D-1). 자리: **1페이지 위쪽** — 첫 칸은 일반 글, 2~4번째 칸(Owner 승인 판매자 안내 「거래 목록 위쪽」)
- 4번째부터(D-2): 위쪽에 끼우지 않고 일반 자리에 **「광고」 표시**로 나온다(기간은 그대로 흐름). 뒤 페이지·지역 구간 밖으로 일반 자리에 나온 홍보 글도 같다. 예약중 글도 광고 중이면 「광고」 표시(D-3)
- 커뮤니티(D-4): 같은 규칙 — 최근 결제 순(`community-paid-exposure-feed` start_at 내림차순) · 광고 중 재결제 = 연장
- 원장: 연장 결제 = `point_ledger.entry_type='promotion_extend'`, related_type `promotion_order`, related_id = 주문 id, idempotency_key = 요청 키(같은 요청 재전송은 한 번만 차감). 주문 `duration_days`·`point_cost` 도 합계로 늘린다. 운영 종료 환급 = 그 주문 결제 합계(spend + promotion_extend) × 남은 비율
- 끼우기 조건: 판매완료 탭이면 끼우지 않음 · 가격 범위 안 · 1페이지 일반 글 중 가장 가까운 지역 구간 이내(목록 함수와 같은 구간 계산). 뽑히지 않은 홍보 글은 일반 글로 제자리. 검색어가 있으면 배지만(CUT F)
- Active duplicate purchase: 광고 중인 내 주문 → **연장** · 심사 중·일시정지·남의 주문 → **409 already_active** (중첩 주문 없음)
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

# 광고 프로세스별 결함 감사 · UI/UX/CTA/SSOT 개선 설계 (2026-11-26)

> Owner 지시(2026-11-26): 「각각의 광고 배너 팝업 당김 팝업 상위 노출 부분의 프로세스별 결함의 증거가 부족… 결함이 있다면 정확한 증거를 바탕으로 정확한 설계안이 필요… ui ux cta ssot 되는 명확한 결함에 대한 설계 구현이 필요」
> 짝 문서: `docs/audit/ad-pricing-notice-design-2026-11-26.md`(전체 목록·금액 권장안·요금 안내 화면) · 시안 `docs/audit/ad-pricing-notice-mockup-2026-11-26.html`
>
> **증거 표시**
> - ✔ = 작업자가 코드 또는 **운영 DB(읽기 전용)** 를 직접 다시 읽어 확인
> - ○ = 조사 에이전트가 코드 줄을 인용, 작업자 재확인 안 함(구현 첫 단계에서 재확인)
> - 실행 시험(운영 결제·변경)은 하지 않았다 → 운영·실기 판정은 모두 구현 후 §9 표로 받는다.
>
> **결함 ID**: TB 상위노출 · FB 회원 피드 배너 · SA 매장 배달 광고 · PP 전역 팝업 · PT 당김 후 광고 · X 공통

---

## 0. 한 장 요약 — 고객 돈·노출에 직접 닿는 결함 (먼저 고칠 것)

| ID | 광고 | 결함 | 증거 | 고객이 겪는 일 |
|---|---|---|---|---|
| **SA-01** | 매장 홍보(배달 홈) | **팔지만 노출 자리가 꺼져 있음** | ✔ 운영 DB `store_composition_policy_overrides` `rest_stores.ad_integration='off'` · ✔ `lib/stores/store-paid-ad-exposure.ts:176-181` off 면 삽입 안 함 · ✔ `owner-store-sponsored-writer.ts:392-426` 판매 차단은 **업종만** 있음 · ✔ 운영 `delivery_ad_packages` STORES_HOME_FEED 3개 enabled | ₱120~390 결제 → **0회 노출** |
| **SA-02** | 매장 배너·홍보 | 실패한 제출의 요금 기록이 남아 **영구 제출 불가** | ✔ `actions/route.ts:170-186` 기록 먼저 → ✔ 차감 RPC 나중 · ✔ `owner-delivery-ad-commercial-bind.ts:154-189` mismatch → `quote_stale` · ✔ 지우는 코드 0 | 「요금이 변경되었습니다」 무한 반복 |
| **SA-03** | 매장 홍보 | 자리 수 검사 없이 판매 + **종료일 빠른 순**으로 최대 5개만 | ✔ `store-paid-ad-campaign-authority.ts:67-78` · ✔ `stores-composition-insertion-live.ts:176` `capItems` · ✔ 운영 `homePaidAdInsertion.max_items=5` | 30일권 산 매장이 가장 늦게 끝나 **잘림** |
| **FB-01** | 회원 배너 | 신청 때 본 금액을 대조 안 함 | ✔ `app/api/me/feed-ad-requests/route.ts:296,489-490,544-548` | 본 적 없는 금액이 묶임 |
| **FB-02** | 회원 배너 | 광고하기 창에서 고른 기간이 신청 화면에서 바뀜 | ✔ `feed-request/page.tsx:94` 첫 값 community · ✔ `:166-171` 목록에 없으면 첫 상품으로 교체 · ✔ `:236-238` 주소 값은 나중에 덮음 | 7일 골랐는데 3일로 신청 |
| **FB-03** | 회원 배너 | 연결 글 숨김·삭제 → 배너 사라짐, 회원 화면은 「광고중」 | ✔ `feed-ad-exposure-filter.ts:78-86` 슬라이드 0 이면 제외 · ○ 회원 표시는 상태·기간만 | 돈·자리 쓰고 노출 0, 모름 |
| **TB-01** | 상위노출 | 결제 창 「거래 목록 첫 페이지 위쪽」 — 실제는 **1자리·최근 결제자만** | ✔ `trade.ts:229` 문구 · ✔ `TradeAdQuickSheet.tsx:327` · 계약 §7b `PROMOTED_TOP_PINS_MAX=1` | 뒤에 다른 사람이 결제하면 7일 내내 위쪽 아님, 결제 전 고지 없음 |
| **TB-02** | 상위노출 | 상품 이름에 기간 고정 | ✔ `promotion-products.ts:54,73,92,112` · ✔ `MemberPostPromoteSheet.tsx:392-396` | 기간 바꾸면 이름·결제 불일치 |

---

## 1. 공통 단일 정의(SSOT) 설계 — 결함이 반복되는 원인을 한 곳으로

| SSOT | 지금(증거) | 설계 | 쓰는 곳 |
|---|---|---|---|
| **X-1 가격·기간** | 표 4개(DB) ✔ — 단, 이름은 코드·DB 제목·DB 영문 3곳 ✔ | 금액·기간 = DB 표만. **상품 이름은 화면에서 `종류 키 + {days}` 로 만든다**. DB `title_ko/en`·`display_name`·코드 `fallbackTitle*` 화면 사용 0 | TB-02·FB-07·SA-05 |
| **X-2 신청 금액 대조** | 상위노출 ✔ 있음 · 매장 ✔ 있음 · 배너 ✔ 없음 · 파트너 ✔ 없음 | 모든 유료 신청 API: `expectedAmount`·`expectedDays` **필수**, 다르면 409 `price_changed`(새 값 포함). 화면은 공용 처리 1개 `handlePriceChanged()` → 목록 다시 읽고 「금액이 바뀌었어요. 새 금액을 확인해 주세요.」(기존 키 `promo_price_changed`) | TB-04·FB-01·SA-09 |
| **X-3 오류 문구** | 화면마다 일부만 매핑, 나머지 「실패」 ✔(TB·FB·SA·PP 모두) | 도메인별 `코드 → i18n 키` 표 1개씩: `lib/points/promotion-purchase-error.ts` · `lib/ads/feed-ad-error-copy.ts`(있음, 확장) · `lib/stores/advertising/owner-ad-error-copy.ts`(새) · `lib/platform-popup/owner-popup-error-copy.ts`(새). **서버는 코드만, 한국어 문장 금지** | TB-05·FB-04·SA-04·PP-03 |
| **X-4 상태 이름** | 같은 상태가 화면마다 다른 이름(「활성」/「광고중」, 「운영자가 잠시 멈춤」/숨김 정지) ✔ | 도메인별 상태→키 함수 1개(`myBoostOrderStatusKey` · `feedAdOpsStatusLabel` · 매장 `ownerAdStatusKey`)를 모든 화면이 사용 | TB-06·FB-08 |
| **X-5 기록 불변** | 연장이 처음 기록을 덮음 ✔(TB 운영 함수 · FB 운영 함수) | 처음 신청 행 = 불변. 연장은 **연장 기록 표**에 한 줄씩. 합계는 조회 함수 | TB-07·FB-06 |
| **X-6 판매 = 노출 자리** | 매장 홈 홍보: 판매 켜짐·자리 꺼짐 ✔ / 업종은 차단 있음 ✔ | 판매 가능 판정 함수 1개 `isDeliveryAdPlacementSellable(kind, inventory, scope)` = 「가격 켜짐 ∧ 지면 판매 ∧ 노출 정책 켜짐 ∧ 자리 남음」. 사장님 목록 API·제출·요금 안내 화면이 같이 씀 | SA-01·SA-03·NT |
| **X-7 알림** | 상위노출 자연 만료 알림 없음 ✔(운영 함수 2개 모두 상태만 바꿈) · 배너 승인/반려 알림 없음 ○ | 광고 알림 종류 1곳(`lib/ads/ad-notification-kinds.ts`): 승인·반려·자리 부족·운영 정지/종료·만료 1일 전·만료 | TB-09·FB-09 |

---

## 2. 거래·커뮤니티 상위노출 (TB)

### 2-1. 단계별 판정

| 단계 | 판정 | 근거 |
|---|---|---|
| P1 가격 SSOT | **결함 TB-02** | 금액·기간 DB ✔ / 이름 코드 고정 ✔ |
| P2 진입 CTA | **결함 TB-08** | 카드 `isPostEligibleForPromotionBoost` ○ OK / 포인트 화면은 판매완료 글도 목록 ✔ `hooks/usePromotionOrderTargets.ts:63` |
| P3 결제 화면 | **결함 TB-01·TB-08** | ✔ |
| P4 결제 처리 | **결함 TB-04·TB-05** | 가격 잠금 대조 ✔ 운영 `purchase_member_content_promotion_v2`·`purchase_member_community_promotion` |
| P5 노출 | 정상(규칙대로) | 1자리·최근 결제 순 ○ `select-trade-promoted-listings.ts:39-40` |
| P6 누르기 | 정상(거래) · 커뮤니티 확인 필요 | ○ |
| P7 내 광고 | **결함 TB-06·TB-07·TB-10** | ✔ |
| P8 연장 | **결함 TB-07** | ✔ 운영 함수 |
| P9 만료 | **결함 TB-09** | ✔ 운영 `expire_trade_promotion_orders`·`community_promotion_orders_expire` 알림 없음 |
| P10 환급 | 정상(금액) · 화면 결함 TB-10 | ✔ 운영 `admin_promotion_end` 원장 기준 |
| P11 어드민 | 정상 + 보완 X-8 | ✔ revision·이력·사유 |

### 2-2. 결함

**TB-01 · 높음 · 결제 전 고지가 사실과 다름**
- 증거 ✔ `lib/i18n/catalog/trade.ts:229` `trade_ad_where_boost: "거래 목록 첫 페이지 위쪽"` · ✔ `TradeAdQuickSheet.tsx:327` 이 키만 표시 · ✔ 커뮤니티 `ads-impl-1107-w1.ts:16` 「커뮤니티 홈·주제 피드 위쪽 · 1자리(가장 최근 결제)」(뒤 결제 시 어떻게 되는지 없음) · 계약 `dibay-promotion-advertisement-product-contract.md` §7b 「최근 순으로 앞에서 최대 1개 … 2번째 결제부터 … 일반 자리에 「광고」 표시」.
- 재현: A 10:00 결제 → B 10:05 결제 → A 는 남은 기간 내내 위쪽 자리 없음.
- 설계(UI·CTA): 결제 창 줄 아래 설명 1줄을 **노출 규칙 SSOT 키**로 바꾼다.
  - `trade_ad_where_boost` ko 「거래 목록 1페이지 위쪽 1자리 · 가장 최근에 결제한 글이 올라가요. 다른 글이 결제하면 제자리에 '광고'로 보여요」 / en 「Top spot on page 1 of the trade list · the most recent payment takes it. After a newer payment, your post shows in its usual place with an "Ad" label」
  - `promo_sheet_where_community` ko 「커뮤니티 위쪽 1자리 · 가장 최근에 결제한 글이 올라가요. 다른 글이 결제하면 제자리에 '포인트 노출'로 보여요」 / en 같은 뜻.
  - 결제 버튼 라벨은 그대로(「{points} 결제하고 시작」류 기존 키). 문구만 — DB 변경 없음.
  - 같은 문구를 요금 안내 화면 「나오는 곳」 칸이 쓴다(X-1).

**TB-02 · 높음 · 상품 이름에 기간 고정** — 짝 문서 D-04. 설계: 새 키 `promo_product_title_trade` 「거래 상위노출 {days}일」/「Trade top exposure · {days} days」, `promo_product_title_community` 「커뮤니티 상위노출 {days}일」. `fallbackTitle*·fallbackDesc*` 삭제. 고칠 곳 ✔ `MemberPostPromoteSheet.tsx:392-396` · ✔ `PointPromotionOrderForm.tsx:169` · ✔ `AdminMemberPromotionProductsPage.tsx:102` · ✔ `AdminUserPointsSection.tsx:422,526` · ✔ `AdminPointLedgerPage.tsx:138`. 안 쓰는 키 `promo_product_trade_7_title` 등 ○ 삭제.

**TB-04 · 중 · 본 금액을 안 보내면 대조 생략 + 상품 없이도 7일 결제**
- 증거 ✔ `member-promotion-products-server.ts:97-108` 「보내지 않았으면 확인하지 않는다」 · ✔ `route.ts:195-197` `trade_promote_7` 기본값 · ✔ `route.ts:509-514` v2 에 서버가 방금 읽은 값을 넘김(회원이 본 값 아님).
- 설계: POST 에 `productId`·`expectedPointCost`·`expectedDurationDays` 없으면 400 `invalid_product`. 기본 7일·`placement` 경로 삭제. v2 에 **회원이 보낸 값**을 넘김. 지금 화면 4곳은 모두 보냄 ✔ → 영향 없음.

**TB-05 · 중 · 실패 이유가 하나로 뭉개지고 DB 원문이 응답으로 나감**
- 증거 ✔ `route.ts:406` `{ ok:false, error: rpcErr.message }` · ✔ `points-ui.ts:89` `promo_sheet_purchase_failed` 「상위노출 결제에 실패했습니다.」 · ○ `TradeAdQuickSheet.tsx:284-290`·`MemberPostPromoteSheet.tsx:208-226` 가격·잔액·중복 외 전부 이 문구.
- 설계(X-3): `promotionPurchaseErrorKey(code)` — `target_unavailable` 「판매중인 글만 광고할 수 있어요」 · `forbidden` 「내 글만 광고할 수 있어요」 · `target_not_found` 「글을 찾을 수 없어요」 · `invalid_product` 「지금 신청할 수 없는 상품이에요」 (en 각각). `route.ts:406` → `purchase_failed`.

**TB-06 · 중 · 정지 이유가 틀리게 보임**
- 증거 ✔ `points-ui.ts:82` `promo_sheet_paused_existing` 「운영자가 잠시 멈춤」 · ✔ `MemberPostPromoteSheet.tsx:363-365` 정지면 무조건 이 문구 · ○ 회원이 글을 숨기면 `paused_by='system'`(`20271105100300…sql:83`).
- 설계(X-4): 정지 원인별 키 — 운영자 `promo_paused_by_staff` 「운영자가 잠시 멈췄어요」 / 글 숨김 `trade_ad_boost_paused_listing_detail`(있음) 「글이 숨겨져 광고가 멈췄어요 · 남은 기간 {days}일」. 결제 창·내 광고가 같은 함수.

**TB-07 · 중 · 연장이 처음 결제 기록을 덮음** — 짝 문서 D-07. ✔ 운영 `purchase_member_community_promotion` `duration_days = duration_days + …, point_cost = point_cost + …`. 설계: 새 표 `point_promotion_order_extensions(order_id, product_id, product_revision, days, points, ledger_id, created_at)`, 주문 행은 `end_at` 만 갱신. 내 광고 줄에 「연장 {count}회」(`mypage_oa_ads_boost_extended`). 환급은 지금처럼 원장 합계 ✔. **DB 변경**.

**TB-08 · 중 · 포인트 상위노출 화면이 「준비 중」이라면서 결제됨 + 판매완료 글도 선택**
- 증거 ✔ `mypage-hub.ts:207` 「노출 신청·내 상품 연결은 준비 중입니다.」 · ✔ `promotions/page.tsx:285-290` 이 안내 아래 결제 폼 · ✔ `usePromotionOrderTargets.ts:63` hidden·deleted 만 제외.
- 설계(CTA): 안내 박스 삭제 · 대상 목록은 카드와 같은 `isPostEligibleForPromotionBoost` · 상품 고르기는 `TradeAdQuickSheet` 를 재사용(연장·종료일·부족 포인트 충전 CTA 한 곳).

**TB-09 · 중 · 상위노출이 끝나도 알림 없음** — ✔ 운영 만료 함수 2개 본문에 알림 없음(상태·감사 기록만). 설계(X-7): 만료 1일 전 「상위노출이 내일 끝나요 · 연장하기」(CTA → 결제 창 연장), 만료 때 「상위노출이 끝났어요」.

**TB-10 · 낮음 · 운영 종료 환급이 회원 화면에 없음** — ○ `my-ad-tab.ts`·`advertising-statement.ts` `refund: null` 고정. 설계: 내 광고 줄 「{points} 환급」(`mypage_oa_ads_boost_refunded`), 미사용 `/api/me/ads/statements` 정리.

**TB-11 · 낮음 · 커뮤니티 주문 가격 버전 미기록** — ✔ 운영 커뮤니티 INSERT 에 `product_revision` 없음. DB 함수에 추가.

---

## 3. 회원 피드 배너 (FB)

### 3-1. 단계별 판정

| 단계 | 판정 | 근거 |
|---|---|---|
| P1 가격 SSOT | **결함 FB-07** | ✔ |
| P2 진입 CTA | **결함 FB-02** | ✔ |
| P3 신청 화면 | **결함 FB-02·FB-10·FB-11** | ✔ |
| P4 제출·보류 | **결함 FB-01·FB-04·FB-05** | ✔ |
| P5 심사 | **결함 FB-09·FB-12** | ✔ 운영 데이터 대기 0건 |
| P6 노출 | **결함 FB-03·FB-13** | ✔ |
| P7 누르기 | **결함 FB-05** | ✔ |
| P8 내 광고 | **결함 FB-03·FB-08·FB-14** | ✔ |
| P9 연장 | **결함 FB-06** | ✔ 운영 `member_feed_ad_renew` |
| P10 종료 | 정상(읽을 때 판정) | ○ |
| P11 환급 | 정상(금액) | ✔ 운영 `admin_feed_ad_end` 원장 기준 |
| P12 기록 | 정상 | ○ 50%·1초 |

### 3-2. 결함

**FB-01 · 높음 · 신청 금액 대조 없음** — ✔ 위 §0. 설계(X-2): POST 에 `expectedPointCost`·`expectedDurationDays` 필수, 다르면 409 `price_changed`. 신청 화면·거래 광고 창이 보낸 값 전송. 409 → 목록 다시 읽고 `promo_price_changed`.

**FB-02 · 높음 · 고른 기간이 바뀜**
- 증거 ✔ `feed-request/page.tsx:94` `useState<FeedAdDomain>("community")` · ✔ `:166-171` 이전 선택이 지금 목록에 없으면 `preferred`(첫 상품)로 교체 · ✔ `:233-238` 주소의 `domain=trade&productId` 는 첫 렌더 뒤 effect 에서 설정.
- 재현: 거래 글 「광고하기」 → 「배너 광고 7일」 → 신청 화면에서 커뮤니티 목록 로드 → 거래 7일 id 가 없으니 교체 → 거래 목록 로드 → 다시 첫 상품(3일).
- 설계: `domain`·`productId` 초기값을 주소에서 바로 읽음(`useSearchParams`) · `load()` 늦은 응답 버림(취소 표시) · 고른 상품은 같은 분야 목록에 있을 때만 유지. 파일 1개.

**FB-03 · 높음 · 연결 글이 숨김·삭제되면 배너는 빠지고 회원 화면은 「광고중」**
- 증거 ✔ `feed-ad-exposure-filter.ts:78-86` 목적지 닫힌 슬라이드 제외, 0장이면 캠페인 제외 · ○ 회원 표시 `projectFeedAdMemberPresentation` 상태·기간만 · ○ 자리 계산은 계속 점유.
- 권장 결정: **상위노출과 같은 규칙** — 연결 글이 숨김·삭제되면 시스템 일시정지(기간 멈춤), 글이 돌아오면 재개, 삭제면 종료(환급 없음, 거래와 같은 고지). 근거: 상위노출은 글 숨김 시 `paused_by='system'` 으로 멈춘다 ○.
- 설계: 회원 GET 에 `destinationUnavailable` 계산(같은 필터 함수) · 내 광고 줄 「연결한 글이 숨김·삭제되어 광고가 멈췄어요」(`feed_ad_dest_unavailable`) · 시스템 정지/재개 = DB 함수(관리자 정지와 같은 기간 멈춤 방식). **DB 변경**.

**FB-04 · 중 · 오류 이유 불명 + 서버 한국어 문장**
- 증거 ✔ `route.ts:466` 한국어 `message` · ○ `page.tsx:505-509` 화면 안 언어 삼항 · ○ `product_not_found`·`topic_not_targetable`·`creatives_required` 등 「신청 실패」.
- 설계(X-3): `feed-ad-error-copy.ts` 확장 — `feed_ad_req_product_gone` 「이 상품은 지금 신청할 수 없어요. 상품을 다시 골라 주세요.」 · `feed_ad_req_spot_full` 「이 자리가 찼어요. 신청되지 않았고 포인트는 그대로예요.」 등.

**FB-05 · 중 · http 주소가 화면을 통과 → 서버 거부 / 남의 글·없는 글 연결 허용**
- 증거 ✔ `page.tsx:442,554` `/^https?:\/\//i` · ✔ `feed-ad-destination.ts:86` `https_required` · ✔ `:112-125` 글 id 비었는지만 확인(존재·작성자 확인 없음).
- 설계: 화면 `/^https:\/\//` + 기존 키 `feed_ad_req_need_https` · 신청 POST·승인에서 `loadPopupEntityDestinationLookups` + 작성자 = 본인 확인, 오류 `feed_ad_req_dest_not_mine` 「내가 올린 공개 글만 연결할 수 있어요.」.

**FB-06 · 중 · 연장이 기간 대조 안 하고 처음 신청 기록을 덮음** — ✔ 운영 `member_feed_ad_renew` `p_expected_cost` 만 비교 · `update feed_ad_requests set duration_days=…, point_cost=…, product_id=…`. 설계(X-2·X-5): `p_expected_days` 추가 · 새 표 `feed_ad_request_renewals` · 신청 행 불변. **DB 변경**.

**FB-07 · 중 · 상품 제목에 기간, 어드민에서 못 고침** — ✔ `MyAdsPageClient.tsx:861` `titleKo` 표시 · 운영 `title_ko` 「거래 피드 광고 3일」 ✔. 설계(X-1): 「거래 배너 {days}일」(`feed_ad_product_title_trade`)·「커뮤니티 배너 {days}일」 키로.

**FB-08 · 낮음 · 신청 화면 상태 「활성」 vs 내 광고 「광고중」, 정지도 「활성」** — ○ `page.tsx:559-565`. 설계(X-4): `feedAdOpsStatusLabel` 하나.

**FB-09 · 중 · 승인·반려·자리 부족·운영 종료 알림 없음** — ○ `lib/ads/**` 알림 발송 0. 계약 hard-lock 「알림 Deferred」 → 지금 FAIL, 원인 = 계약 보류. 권장: X-7 알림 켬(승인 「배너 광고가 시작됐어요」, 반려 「배너 광고가 반려됐어요 · 포인트 돌려드렸어요」 CTA → 내 광고).

**FB-10 · 낮음 · 「권장 1200×400」인데 실제 필수** — ✔ `points-ui.ts:165`. ko 「3:1 비율 · 최소 1200 × 400 px」.

**FB-11 · 낮음 · 기간 시작 시점 고지 없음** — ✔ `feed_ad_req_hold_note`. 끝에 「광고 기간은 승인한 때부터 시작해요.」.

**FB-12 · 중 · 검토 중 신청이 포인트를 무기한 묶음 + 자리보다 많은 신청 허용** — ✔ cron 없음 · ○ 검토 중은 자리 미점유. 설계: 7일 지난 검토 중 자동 반려·보류 해제(하루 1회) + 신청 화면 「남은 자리 {n} · 검토 중 {m}」.

**FB-13 · 중 · 「2~3장 자동 슬라이드」 안내와 실제 다름** — ✔ `copy-shell.ts:66` · ✔ `FeedAdBannerCarousel.tsx:179-195` 다른 광고와 같은 자리면 첫 장만. 권장: 동작은 계약 유지, 문구 「장당 최대 2MB · 다른 광고와 함께 나오면 1번 이미지만 보여요」.

**FB-14 · 낮음 · 「게재 위치 보기」 업종 배너가 거래 홈으로 감** — ✔ `MyAdsPageClient.tsx:690-700` trade 면 `/market`. 설계: 이미 있는 `feedAdMemberViewHref` 사용.

**FB-15 · 낮음 · 승인 중 취소 경합** — ○ `cancel-feed-ad-request.ts` · `approve…:333-342`. 취소는 `reviewed_by is null` 일 때만, 되돌리기에 `.eq("status","pending_review")`.

---

## 4. 매장 배달 광고 (SA) — 상단 배너 · 매장 홍보 · 광고 파트너

### 4-1. 단계별 판정

| 단계 | 판정 | 근거 |
|---|---|---|
| P1 가격 SSOT | **결함 SA-05** | ✔ 운영 `display_name` 영어 |
| P2 진입 CTA | **결함 SA-06** | ○ `eligibleStoreCount` 미사용 |
| P3 신청 화면 | **결함 SA-05·SA-10** | ✔ |
| P4 제출·차감 | **결함 SA-02·SA-04** | ✔ |
| P5 심사·메시지 | 정상 | ○ 내부/사장님 사유 분리 |
| P6 노출 | **결함 SA-01·SA-03·SA-08** | ✔ 운영 정책 |
| P7 누르기 | 정상 | ○ |
| P8 상세 | **결함 SA-07·SA-11** | ○ |
| P9 연장 | 사장님 연장 없음(운영 정책 꺼짐 ✔) | — |
| P10 종료 | 정상(코드) | ○ |
| P11 환급 | 금액 정상 ✔ · 표시 결함 SA-11 | ✔ 운영 `admin_delivery_ad_end_with_refund` |
| P12 어드민 | **결함 SA-12·SA-13·SA-14** | ✔ |

### 4-2. 결함

**SA-01 · 높음 · 배달 홈 매장 홍보: 판매 중인데 노출 자리 꺼짐** — §0 증거 ✔.
- 업종 목록은 판매 차단 있음 ✔ `delivery-ad-category-policy-sell-gate.ts:44` (운영 업종 8개 중 `restaurant` 만 광고 켬 ✔ → 나머지 업종은 판매 거부 = 정상).
- 설계(X-6): `isDeliveryAdPlacementSellable` 에 「홈 = `rest_stores.ad_integration != off`」 조건을 넣고 ① 사장님 목록 API(`app/api/me/delivery-ads/commercial/route.ts:56-63` 거르기)에서 홈 홍보를 숨김 ② 작성·제출에서 `placement_not_sellable` 거부 ③ 요금 안내 화면에서 빠짐 ④ 어드민 가격 화면 그 줄에 「노출 자리 꺼짐 — 팔리지 않음」 표시 + 「노출 설정 열기」 CTA(→ `/admin/stores-home-shelves`). 
- 운영 결정 권장: **어드민 선반 「더 많은 매장」 광고 연동을 켤지** 는 Owner 운영 설정 → 켜기 전까지는 판매 중지가 맞다(돈 받고 노출 0 방지).
- 이미 판매된 건: 운영 데이터 매장 홍보 홈 ACTIVE 0건 ✔(모두 종료·초안 — 시험 데이터) → 지금 피해 0.

**SA-02 · 높음 · 실패한 제출 요금 기록 잔존** — §0. 설계: 요금 기록 INSERT 를 `owner_submit_delivery_ad_with_business_cash` 안으로(기록+차감+전이 한 트랜잭션). 기존 「차감 안 된 기록」은 제출 때 새 견적으로 교체. **DB 변경**.

**SA-03 · 높음 · 매장 홍보 자리 검사 없음 + 종료일 순 잘림** — §0. 설계: 제출에서 겹치는 기간 승인·심사 수 ≥ 정책 최대면 `capacity_full`(상단 배너 `assertDeliveryHeroCapacityAvailable` 과 같은 방식) · 노출 정렬을 **시작일 빠른 순 + 요청마다 순환**으로. 사장님 화면 「남은 자리 {n}」.

**SA-04 · 높음 · 실패 이유가 「요금이 변경되었습니다」/「처리에 실패했습니다」 둘로 뭉개짐**
- 증거 ✔ `OwnerBannerCreateView.tsx:549-560` `refreshQuote` 면 무조건 `quote_stale` · ○ `capacity_full`·`INSUFFICIENT_BUSINESS_CASH`·`period_ended` 문구 없음.
- 설계(X-3): `owner-ad-error-copy.ts` — `owner_ads_error_capacity_full` 「지금은 배달 홈 상단 배너 자리가 모두 찼어요. 캐시는 차감되지 않았어요.」 · `owner_ads_error_package_unavailable` 「선택한 기간은 지금 판매하지 않아요. 다른 기간을 골라 주세요.」 · 402 → 기존 `DeliveryAdOwnerInsufficientCashSubmitModal`(부족액) · `refreshQuote` 는 진짜 `quote_stale` 일 때만.

**SA-05 · 중 · DB 영문 이름 그대로** — ✔ `OwnerBannerCreateView.tsx:633`(없으면 코드 안 `${days}일` — i18n 위반) · `OwnerDeliveryAdDetailView.tsx:578` · ✔ `OwnerStoreSponsoredCreateView.tsx:322,696`. 설계(X-1): `owner_ads_period_duration_days {days}` · 상품 `owner_ads_product_banner`/`owner_ads_product_store_sponsored`.

**SA-06 · 중 · 신청 못 하는 매장에도 신청 버튼** — ○ `delivery-ads/route.ts:119` `eligibleStoreCount` 미사용. 설계(CTA): 0 이면 카드 버튼 끔 + 「매장 승인이 끝나고 공개 상태여야 광고를 신청할 수 있어요」 + 「매장 정보 보기」.

**SA-07 · 중 · 정지·종료 확인창이 기간·환불을 안 알림** — ✔ `OwnerDeliveryAdDetailView.tsx:410-413` 정지 `body: null`. 설계: 「멈춘 동안에도 광고 기간은 줄어들고 환불되지 않아요.」(`popup_note_ad_pause_period_runs`) · 종료 「남은 기간은 환불되지 않아요.」.

**SA-08 · 중 · 상단 배너 자리 확인이 조회 실패 시 통과** — ✔ `capacity-gate.ts:185-193` 상태 조건 없는 `.limit(500)` + 오류면 `return []`. 설계: 오류면 `capacity_check_failed` 로 판매 막음, 쿼리에 상태·기간 조건. (운영 배너 행 43개 ✔ — 지금은 500 미만)

**SA-09 · 중 · 광고 파트너: 금액 대조 없음 · 할인율·기간이 승인 때 결정** — ✔ 운영 `owner_apply_partner_membership`(할인 0 저장) · ✔ `admin_partner_membership_decide` 46-56행(승인 때 할인율·기간 1~366). 설계: 신청 때 회비·할인율·30일 기록, 승인은 그 값만. 가입 POST `expectedFeeMinor`. **DB 변경**.

**SA-10 · 낮음 · 판매 준비 카드 7·15·30 고정** — ✔ `DeliveryAdOwnerPackageCardGrid.tsx:44`. 카드 대신 「판매 준비 중이에요」 한 줄.

**SA-11 · 중 · 이력 영문 코드·UTC · 환불 금액 없음** — ○ `OwnerDeliveryAdDetailView.tsx:740-755,639-642`. 설계: 동작 키 매핑·PHT · 「환불됨 · ₱{amount} · {시각}」.

**SA-12 · 중 · 가격 저장 동시 덮어쓰기 · 판매 중 상품 기간 변경** — ✔ `delivery-ad-commercial-admin-writer.ts:99-119`. 설계: `expectedUpdatedAt` 409 · 판매 이력 있는 상품은 기간 변경 금지(새 상품).

**SA-13 · 낮음 · 검색 상단 「판매 가능」 체크 효과 없음** — ✔ 코드 제외 `commercial/route.ts:62`. 판매 가능 지면만 체크박스.

**SA-14 · 중 · 사용자 지정 기간 상품을 켤 수 없음** — ○ `AdminDeliveryAdCommercialSettingsView.tsx:794`. 목록·켜기 줄 추가.

---

## 5. 전역 팝업 (PP) — 운영자 직접 + 매장 유료(판매 꺼짐)

운영 현황 ✔: 노출 중 0건 · 매장 신청 approved 3·rejected 1(수정 요청·초안 0).

| 단계 | 판정 | 근거 |
|---|---|---|
| P1 소재 | **결함 PP-01** | ✔ |
| P2 등록·예약 | 정상 | ○ 캠페인 시간대 벽시계 |
| P3 대상 | 정상 | ○ |
| P4 표시 조건 | 정상 · 문서 충돌 PP-C1 | ○ 인트로·PTR·결제·통화·글쓰기 보류, 최대 1~3 |
| P5 「광고」·×44·CTA48 | 정상 | ○ |
| P6 CTA | 정상 | ○ 노출 전 목적지 확인·「열 수 없는 링크입니다」 |
| P7 빈도 | 정상 | ○ |
| P8 기록 | 문서 충돌 PP-C3 | ○ |
| P9 종료 | 정상 | ○ |
| P10 매장 유료 | **결함 PP-02·PP-03** | ✔ |

**PP-01 · 중 · 「바로 노출」 등록 경로는 이미지 최소 크기 검사 없음** — ✔ `admin-direct-complete-create.ts:107` sharp 만, `checkPopupCreativeSourceSize` 없음 · ✔ 상세 업로드 `creative/route.ts:134` 는 있음 · 위반 `dibay-ads-surface-master-ssot.md` §3 「업로드 때 서버가 비율·최소 크기를 검사」. 설계: 캠페인 만들기 **전에** 같은 검사, 실패 400(초안 안 남김) + 등록 화면 「최소 720 × 500px」.

**PP-02 · 높음(잠재) · 결제된 매장 신청에 「수정 요청」 → 재제출 403 → 캐시 묶임** — ✔ `owner-request-approve.ts:420-427` 환불 없이 `revision_required` · ✔ 어드민 버튼 `AdminPlatformPopupRequestDetailWorkspace.tsx:338` · ○ 재제출 판매 스위치 403. 운영 해당 0건 ✔. 설계: 판매 꺼짐 동안 `revision_required` 서버 거부(409) + 버튼 숨김 + 「신규 판매 종료로 수정 요청을 할 수 없어요. 반려하면 환불돼요.」.

**PP-03 · 중 · 판매 꺼짐인데 초안 신청 화면이 열리고 오류 코드 원문 표시 · 「Owner Popup」 용어** — ○ `OwnerPlatformPopupApplyView.tsx:399,480-493` · ✔ 서버 한국어 고정 `platform-popup-requests/route.ts:43-46` 「Owner Popup 신규 신청은 종료되었습니다…」. 설계: requestId 있어도 종료 안내 · PATCH·소재 업로드에도 스위치 · 문구 「팝업 광고 신규 신청이 끝났어요. 지난 신청은 계속 볼 수 있어요.」 · 서버는 코드만.

**PP-04 · 중 · 매장 팝업 가격 어드민 화면 없음** — ✔(짝 문서 D-17). 판매 꺼짐 유지. 다시 팔 때 선행 과제로 계약에 기록.

**문서 충돌 — 권장안**
- PP-C1 휴대폰 가로: 문서 「표시(폭 480)」 vs 코드 「짧은 변 600 미만은 보류」 ○ → **권장: 코드 유지(휴대폰 가로 보류), 문서 정정** — 휴대폰 가로는 화면 높이가 부족해 소재·× 가 가려짐.
- PP-C2 미리보기 예시 데이터: 계약 「가짜 데이터 금지」 vs 코드 「예시」 표시 ○ → **권장: 「예시」 표시 유지, 계약 정정**.
- PP-C3 close_only 닫힘 기록 0: Owner 승인 설계 PU-31·D-21 「요청 0」 ○ → **권장: 유지, 마스터 §4-2 에 예외 1줄**.

---

## 6. 당김 후 광고 (PT) — 운영자 전용

운영 현황 ✔: 노출 중 0 · 지정 회원 대상 5건 모두 종료.

| 단계 | 판정 | 근거 |
|---|---|---|
| P1 소재 | 정상 | ○ 4:1/8:1 화면·서버 검사 |
| P2 등록·대상 | **결함 PT-04** | ✔ |
| P3 표시 조건 | 정상 | ○ 58/106px·700/2200/3000ms·30초 |
| P4 표기·CTA | **결함 PT-05** | ✔ |
| P5 CTA 목적지 | 정상 | ○ |
| P6 빈도 | **결함 PT-01** | ✔ |
| P7 겹침 | 정상(당기는 중 팝업 보류 범위 확인 필요) | ○ |
| P8 기록 | 정상 | ○ |
| P9 캐시 | 계약대로(5분) · 문구 결함 PT-02 | ✔ |
| P10 어드민 | **결함 PT-02·PT-03** | ✔ |

**PT-01 · 중 · 「기록 없이 닫기만」 숨김이 화면을 떠나도 안 풀림**
- 증거 ✔ `ptr-reveal-client.ts:105-110` 영역(HOME 등) 키가 바뀔 때만 해제, 이 함수는 PTR 슬롯이 있는 화면에서만 불림 → `/home` 닫기 → `/mypage`(슬롯 없음) → `/home` 복귀해도 숨김 유지 · ✔ 어드민 안내 `admin-member-shared.ts:2129` 「…다른 화면으로 가면 다시 나옵니다」 · 마스터 §4-1 「PTR: 지금 화면에 있는 동안만」.
- 권장 결정: **마스터 SSOT(화면 기준)** — 마스터 문서가 「영역 문서와 다르면 이 문서가 우선」이라고 정해 둠.
- 설계: 숨김 키 = 정규화한 경로, 경로가 바뀌거나 슬롯이 사라지면 해제(`releasePtrRevealCloseOnlyHold`), PTR final SSOT §6 문구 정정. 파일 2개.

**PT-02 · 중 · 「중지」 확인 문구가 「곧바로 빠집니다」 — 실제 최대 5분** — ✔ `copy-admin-l25-ads.ts:158` vs ✔ `:100` 「반영까지 최대 5분」. ko 「노출을 중지할까요? 앱에는 최대 5분 안에 반영돼요.」 / en 「Stop exposure? Apps update within 5 minutes.」, 종료 확인도 같은 문장.

**PT-03 · 낮음 · 어드민 노출 순서 안내가 실제와 다름** — ✔ `copy-admin-l25-ads.ts:77` 「…우선순위 → 덜 본 것」 vs ✔ `popup-rotation.ts:24-41` 덜 본 것 → 우선순위. ko 「노출 순서: 영역 지정 > 전체 → 덜 본 것 → 우선순위(높을수록 먼저)」.

**PT-04 · 낮음 · 시작·종료 라벨에 (PHT) 없음** — ○ `copy-admin-l25-ads.ts:84,62` · 마스터 §4-3 「시작 (PHT)」「종료 (PHT)」. `admin_ptr_start_tz` 「시작 ({tz})」.

**PT-05 · 낮음 · 조금 당기면 「광고」 표기 없이 광고 그림만** — ✔ `DibayPtrRevealBand.tsx:13,66` 표기는 24px 이상 · ✔ `DibayPtrSlot.tsx:80,107` 그림은 0px 초과부터. 설계: 24px 미만이면 그림도 안 그림(기준 값 `ptr-reveal-contract.ts` 로 이동, 앱 슬롯·어드민 미리보기 같이).

---

## 7. 광고 요금 안내(NT) — 이 결함들과의 연결

- 요금 안내 표는 X-6 판매 판정 함수를 쓴다 → SA-01 이 고쳐지기 전에는 **배달 홈 매장 홍보 줄이 안내에서 빠진다**(돈 받고 노출 0 상품을 안내하지 않음).
- 「나오는 곳」 칸 = TB-01 노출 규칙 키, 상품 이름 = X-1 키 → 결제 창과 글자까지 같다.
- 「광고 문의하기」·FAB 「광고 금액 확인」 = 짝 문서 §7 그대로.

---

## 8. 구현 묶음 (도메인별 PR · 운영 DB 함수는 Owner 승인 후)

| PR | 범위 | DB |
|---|---|---|
| A 상위노출 | TB-01·02·04·05·06·08·10 (문구·화면·API) | 없음 |
| A-DB | TB-07·09·11 (연장 기록 표·알림·가격 버전) | 승인 필요 |
| B 회원 배너 | FB-01·02·04·05·07·08·10·11·13·14·15 | 없음 |
| B-DB | FB-03·06·12 (시스템 정지·연장 기록·검토 만료) + FB-09 알림 | 승인 필요 |
| C 매장 광고 | SA-01(판매 차단)·03(정렬·화면)·04·05·06·07·08·10·11·12·13·14 | 없음 |
| C-DB | SA-02·03(제출 자리 검사)·09 | 승인 필요 |
| D 팝업·PTR | PP-01·02·03 · PT-01~05 · 문서 정정 PP-C1~3 | 없음 |
| E 요금 안내 | 공지 고정 카드·안내 화면·FAB 줄(짝 문서 §7) | 없음 |
| 운영 데이터 | 시험 광고 데이터 정리(짝 문서 §8-1) · 금액 변경(짝 문서 §6) | 승인 필요 |

각 PR: 로컬 `typecheck`·관련 vitest·eslint·`check:i18n-quality` 1회 → PR → 자동 병합 등록.

## 9. 검증 표 (구현 후 · Owner 계정·휴대폰 · 실행 10회 상한 · 결과 PASS/FAIL/NOT_PROVEN)

| ID | 확인 방법 | 증거 |
|---|---|---|
| SA-01 | 홈 노출 꺼진 상태에서 사장님 신청 목록에 홈 홍보 없음 · 요금 안내에 없음 | 캡처 2 + API 응답 |
| SA-02 | 캐시 부족으로 제출 실패 → 기간 변경 → 재제출 성공 | 캡처 + DB 행 |
| SA-03·04 | 자리 가득 → 「자리가 모두 찼어요 · 캐시 차감 안 됨」 | 캡처 + 잔액 불변 |
| FB-01·TB-04 | 화면 연 채 어드민 금액 변경 → 「금액이 바뀌었어요」 | 캡처 + 409 |
| FB-02 | 광고하기 7일 → 신청 화면 7일 유지 | 캡처 |
| FB-03 | 연결 글 숨김 → 내 광고 「멈췄어요」 | 캡처 + DB |
| TB-01 | 결제 창 노출 규칙 문구 | 캡처 |
| TB-02·FB-07·SA-05 | 기간 변경 → 이름 새 기간 · 한국어 화면에 영어 없음 | 캡처 |
| PT-01 | 닫기 → 다른 화면 → 복귀 시 다시 나옴 | 캡처 |
| PP-01 | 300×200 「바로 노출」 → 거부 | 캡처 |
| 시험 뒤 | 바꾼 운영 금액·설정 원래대로 · 열 단위 대조 | DB |

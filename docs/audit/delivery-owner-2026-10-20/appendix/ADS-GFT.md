# 배달 오너 감사 — 광고 / 프로모션 / 쿠폰 / 상품권 (ADS- · GFT-)

- 감사 일자: 2026-10-20 (PHT) · 감사 전용 (저장소·DB 변경 없음)
- 근거 범위: 저장소 코드(HEAD `8c151baa`) + 운영 DB `ckdosyydvgzqwpbwuhon` 읽기 전용 조회(pg_proc 정의·인덱스·제약·RLS·집계 COUNT/SUM, 개인정보 컬럼 미조회)
- 런타임(오너/관리자 화면 로그인, 실기기)은 확인 불가 → 화면 동작 주장은 모두 코드 근거이며 런타임은 NOT_PROVEN.
- 범위 밖으로 판단해 결함 판정하지 않은 것: 회원 게시물 광고(`/api/ads/apply` post_ads, feed_ad_*, point_promotion_orders), 커미션(SALE_FEE) 계산 자체 — 관찰 사항만 §6 에 기록.

---

## 1. 범위 및 조사 대상 목록

### 1.1 문서 (8)
`docs/dibay-delivery-advertising-ssot.md`, `docs/dibay-delivery-ads-finance-approval-authority-design.md`(SUPERSEDED), `docs/dibay-promotion-advertisement-product-contract.md`(SUPERSEDED), `docs/dibay-paid-exposure-feed-ad-master-contract.md`, `docs/dibay-admin-real-operation-cut-c-ads-operation-hard-lock.md`, `docs/dibay-gift-certificate-hard-lock.md`, `docs/ads-schema.sql`, `docs/dibay-currency-ssot-hard-lock.md`(현행 재무 권한 문서로 위 SUPERSEDED 문서가 지정)

### 1.2 오너 UI 라우트 (12)
`app/(main)/stores/owner/ads/page.tsx`, `ads/new/banner`, `ads/new/store-sponsored`, `ads/new/platform-popup`, `ads/partner`, `ads/event-promotions`, `ads/event-promotions/[requestId]`, `ads/[campaignId]`, `ads/popup/[requestId]`, `owner/banners`, `owner/coupons`, `owner/gift-certificates` (+ 컴포넌트 `OwnerPlatformPopupApplyView`, `OwnerGiftCertificatesView`, `OwnerGiftMoneyOpsPanel`, `StoreCartGiftApplyPanel`)

### 1.3 API 라우트 (45)
- 오너 광고: `/api/me/stores/[storeId]/delivery-ads` (GET/POST), `…/[campaignId]` (GET/PATCH/DELETE), `…/[campaignId]/actions`, `…/[campaignId]/messages`, `…/messages/read`, `…/delivery-ads/banner`, `…/upload-banner-image`, `/api/me/delivery-ads/partner`, `/api/me/platform-popup-requests` (+`[requestId]`, `/submit`, `/creative`), `/api/me/platform-popup-packages`, `/api/me/event-promotion-requests` (+`[requestId]`, `/submit`, `/upload-image`), `/api/owner/ads/statements`, `/api/me/stores/[storeId]/banners` (+`[bannerId]`)
- 노출/이벤트: `/api/stores/ads/impression`, `/api/stores/ads/click`, `/api/platform-popup/{resolve,events,suppress,ptr-reveal}`, `/api/platform-events` (+`[eventId]`, `hero-banners`), `/api/platform-promotion/{content-visit,reconcile-guest}`, `/api/exposure/point-promotion-orders`, `/api/feed-ads/active`, `/api/ads/{active,apply,products}`
- 관리자 광고: `/api/admin/delivery-ads/*` 16개 route (actions, partner/memberships, business-cash, charge-requests, first-party, extend, commercial, performance …), `/api/admin/platform-popup-requests/*`(3), `/api/cron/delivery-ads-schedule-transitions`
- 쿠폰: `/api/me/store-coupons` (+`campaigns`, `claim`, `claimable`, `best-eligible`, `checkout-quote`), `/api/admin/store-coupons`, `/api/me/store-orders` (쿠폰·상품권 적용부)
- 상품권: `/api/me/stores/[storeId]/gift-certificates/{applications,products,redemptions,revenue,promo,conversions,cash-outs}`, `/api/me/gift-certificates/{purchase,wallet,checkout-eligible,instances/[id],mall,transfers/*}`, `/api/admin/gift-certificates/*` 19개 route

### 1.4 lib 모듈 (주요 34)
`lib/stores/advertising/{canonical-business-cash-writer, canonical-business-cash-contract, owner-store-sponsored-writer, owner-banner-writer, owner-delivery-ad-commercial-bind, delivery-ad-commercial-catalog, delivery-ad-partner-membership-writer, admin-delivery-ad-writer, delivery-ad-schedule-promoter, delivery-ad-lifecycle, delivery-ad-event-writer, delivery-ad-exposure-token, banner-home-hero-exposure, banner-physical-inventory-exposure, banner-search-top-exposure, store-sponsored-exposure-eligibility, delivery-ad-operations-messaging}`, `lib/stores/{load-store-banner-ad-campaigns, load-store-insertion-campaigns, store-paid-ad-exposure, owner-product-gate, apply-store-order-status-transition, confirmed-sale-revenue, store-coupon-ssot, store-coupon-funding-math, store-coupon-campaign-validation, resolve-store-coupon-checkout-discount}`, `lib/currency/{recognize-order-currency-on-completed, reconcile-order-currency}`, `lib/gift-certificate/{gift-certificate-domain-contract, gift-certificate-hard-lock}`, `lib/platform-popup/{owner-request-writer, owner-popup-new-sales-gate}`, `lib/platform-event-owner-requests/owner-writer`, `lib/admin/require-admin-api`

### 1.5 운영 DB 함수 (정의 직접 확인 22)
`owner_submit_delivery_ad_with_business_cash`, `business_cash_delivery_ad_spend`, `business_cash_delivery_ad_refund`, `admin_delivery_ad_reject_with_refund`, `admin_delivery_ad_transition`, `owner_delivery_ad_transition`, `delivery_ad_system_schedule_transition`, `delivery_ad_campaign_funding_allows_active`, `owner_delivery_sponsored_upsert`, `owner_delivery_banner_upsert`, `create_store_order_atomic`(쿠폰·상품권 구간), `claim_store_coupon`, `restore_store_coupon_entitlement`, `gift_certificate_purchase`, `gift_certificate_redemption_reverse`, `gift_certificate_cancel_order_restore`, `gift_certificate_refund_order_atomic`, `credit_coin_from_confirmed_sale` + ACL 목록 81개 함수(SECURITY DEFINER/EXECUTE 권한) 일괄 확인

### 1.6 테이블 (확인 30) · 트리거/제약/인덱스/RLS
`store_paid_ad_campaigns`, `store_banner_ad_campaigns`, `delivery_ad_canonical_bc_fundings`, `delivery_ad_campaign_commercial_snapshots`, `delivery_ad_partner_memberships`, `delivery_ad_impression_events`, `delivery_ad_click_events`, `delivery_ad_order_attributions`, `delivery_ad_charge_ledger`, `delivery_ad_store_cash_spends`, `delivery_ad_audit_logs`, `business_cash_accounts`, `business_cash_ledger`, `platform_popup_owner_requests`, `platform_popup_campaigns`, `platform_event_owner_requests`, `store_coupon_campaigns`, `coupon_user_entitlements`, `store_coupon_redemptions`, `coupon_audit_events`, `gift_certificate_{products,applications,instances,redemptions,ledger,revenue_ledger,transfers,ownership_events}`, `store_economic_point_ledger`, `store_orders`(관련 컬럼)

합계: 문서 8 · UI 12 · API 약 45 route 파일(관리자 포함 ~85) · lib 34 · DB 함수 22(정의) · 테이블 30

---

## 2. 기능별 현황표

| 기능 | UI | API | DB | 업무 | 운영 | 판정 | 근거 |
|---|---|---|---|---|---|---|---|
| 광고 신청(초안 생성·수정) | 있음 | 오너 게이트 O, 기간·인벤토리 자유 수정 | upsert RPC: DRAFT/CHANGES_REQUESTED만 수정 | 가격 스냅샷과 기간/인벤토리 불일치 허용 | 운영 악용 사례 없음 | FAIL (ADS-02) | `app/api/me/stores/[storeId]/delivery-ads/[campaignId]/route.ts:104-191`, `lib/stores/advertising/owner-store-sponsored-writer.ts:525-552` |
| 광고 제출 = Cash 차감 + 전이 원자성 | 있음 | 원자 RPC 없으면 503 | `owner_submit_delivery_ad_with_business_cash` 단일 TX, 펀딩 unique `(product_kind, application_id)` | 재제출 시 이중 차감 없음(idempotent) | 펀딩↔원장 금액 일치(총 2,259,400 / 환불 580,400 minor, 고아 0) | PASS | 라우트 `actions/route.ts:116-187`, DB 함수 정의, 인덱스 `delivery_ad_canonical_bc_fundings_app_uidx` |
| 반려 = 환불 원자성 | 관리자 | `adminTransitionDeliveryAdCampaign` reject→`admin_delivery_ad_reject_with_refund` | 전이+환불 한 TX, 환불 idempotent | 반려 7건 중 6건 환불, 1건 레거시 Store Cash 환불 | REJECTED+SECURED 0 | PASS | `lib/stores/advertising/admin-delivery-ad-writer.ts:252-283` |
| 승인/일시중지/재개/종료 | 관리자·오너 | 관리자 권한키 없음 | CAS(expected lifecycle/updated_at) + `FOR UPDATE` | 승인 시 기간 미조정, 종료일 지난 건 승인 가능 | 101시간 지연 활성 1건, 기간 만료 후 심사대기 4건 | FAIL (ADS-01, ADS-08, ADS-11) | `admin_delivery_ad_transition` 정의, SQL 결과 §3 |
| 종료 후 노출 차단 | — | 서빙 시 `isSponsoredScheduleActive` 재검사 + 5분 cron | `delivery_ad_system_schedule_transition` | 서빙 쿼리에서 end_at 강제(크론 의존 아님) | — | PASS | `store-sponsored-exposure-eligibility.ts:82-109`, `banner-home-hero-exposure.ts:43`, `vercel.json:37-38` |
| 노출 매장 자격(정지 매장 등) | — | 스폰서드: 오가닉 풀 fail-closed / 배너 홈히어로·물리 인벤토리: 미검사 | — | 정지 매장 배너 노출 가능 | NOT_PROVEN | FAIL (ADS-06) | `banner-home-hero-exposure.ts:65` `void c.storeId`, `banner-physical-inventory-exposure.ts:85` |
| 노출/클릭/주문 기여 | — | HMAC 토큰(30분 TTL), eventId 클라 지정 | RPC dedupe(event_id) | 클릭 0·기여 0 | impression 29, click 0, attribution 0, charge 0 | NOT_PROVEN (ADS-09, ADS-10) | `delivery-ad-exposure-token.ts:13`, `app/api/stores/ads/impression/route.ts:27-29`, `app/api/me/store-orders/route.ts:953` |
| 사용량 과금(CPC/CPA) | — | — | `delivery_ad_charge_ledger` 0행 | 문서상 chargeExecution=false | — | N/A(미출시) | SSOT §6 |
| 파트너 멤버십 | 있음 | insert→차감→실패시 delete (비원자) | 열린 멤버십 unique 없음 | 만료 자동 종료 없음, 반려 race | ACTIVE+만료 1건 | FAIL (ADS-03, ADS-04, ADS-05) | `delivery-ad-partner-membership-writer.ts:150-257, 386-441` |
| 플랫폼 팝업(오너 신청) | 신규 신청 차단 배너 | 신규 판매 403 | 기존 승인 3건 SECURED | 판매 종료 | draft 9 / approved 3 / rejected 1(환불) | PASS(판매중지) · 잠재 ADS-13 | `lib/platform-popup/owner-popup-new-sales-gate.ts:8` |
| 이벤트 프로모션 신청 | 있음 | 오너 게이트 + owner_user_id 조건 | RLS select 오너 | 무료(관리자 심사) | — | PASS | `lib/platform-event-owner-requests/owner-writer.ts:60-215` |
| 매장 자체 배너(store_banners) | 있음 | 오너 게이트, 링크대상 store_id 검증 | — | 광고 아님(격리) | — | PASS | `app/api/me/stores/[storeId]/banners/[bannerId]/route.ts:47-137` |
| 광고비 지갑/원장 | Finance 링크 | Cash(AST-005)만 | 잔액 CHECK ≥0, 원장 idempotency unique | 레거시 지갑 writer EXECUTE 회수(service_role 없음) | 음수 잔액 0 | PASS | ACL 조회(`store_cash_delivery_ad_spend` = postgres only) |
| 오너 권한/IDOR | — | `getStoreIfOwner` + campaign.store_id 비교 | RPC 내 owner_user_id 재검증 | 정지·반려 매장 차단 없음 | NOT_PROVEN | 부분 FAIL (ADS-07) | `lib/stores/owner-product-gate.ts getStoreIfOwner` |
| 관리자 권한 | 관리자 | `requireAdminApiUser`만(광고) / `requireAdminPermission("business")`(쿠폰·상품권) | 광고 RPC `is_platform_admin` | 권한 세분 불일치 | — | FAIL (ADS-08) | 라우트별 grep §3 |
| 쿠폰 발급(claim) | 있음 | RPC | 캠페인 `FOR UPDATE`, 발급한도·예산·1인1매 | 매장 정지 미검사 | — | PASS(경미 ADS-07) | `claim_store_coupon` 정의 |
| 쿠폰 결제 검증 | 장바구니 | TS 계산 후 RPC 전달 | advisory lock + entitlement `FOR UPDATE` + 할인 재계산·차이≥1 거절 + 1회 사용 | 중복/동시 사용 차단 | 할인≠redemption 0, 취소 후 미복원 0 | PASS (ADS-22 경미) | `create_store_order_atomic` L294-390, L731-763 |
| 쿠폰 비용 부담 | — | `splitCouponFunding` | DB는 payload 값 신뢰 | STORE=매장 / PLATFORM=Coin 보전 | 분할합≠할인 2건(08-24 레거시) | 부분 FAIL (ADS-22) | `lib/stores/store-coupon-funding-math.ts:23-38`, RPC L530-531 |
| 쿠폰 취소/환불 복원 | — | 상태전이 후 best-effort | `restore_store_coupon_entitlement` | 오류 무시·재처리 없음 | 불일치 0 | 부분 FAIL (ADS-21) | `apply-store-order-status-transition.ts:434-449` |
| 쿠폰 오너 상태변경 | 있음 | CAS·오류검사 없음 | — | 관리자 일시중지를 오너가 재개 가능 | — | FAIL (ADS-20) | `app/api/me/store-coupons/campaigns/route.ts:149-196` |
| 상품권 등록(신청→관리자 상품화) | 있음 | 오너는 신청만, 상품은 관리자 생성 | CHECK 다수(가격≤액면, 펀딩 합) | Gift≠Coupon 분리 | apps: approved 2 / submitted 1 | PASS | `…/gift-certificates/applications/route.ts`, 제약 조회 |
| 상품권 구매(발행) | 몰 | idempotencyKey 필수 | Point 원장 차감 + 인스턴스 + 원장, 상품 `FOR UPDATE`, max_issuance | 키가 전역(사용자 비스코프) | over_issued 0, issued_count 불일치 1 | PASS (GFT-07, GFT-08 경미) | `gift_certificate_purchase` 정의 |
| 상품권 사용(결제) | 장바구니 | instance id만 전달, 금액 서버 계산 | 주문 TX 내 `FOR UPDATE`, ACTIVE·소유자·매장범위·유효기간 검사, 1주문 1장 | 1회 전액 소멸(정책) — 결제화면 경고 없음 | 다중 live redemption 2건은 정책 이전 부분사용(합=액면) | PASS(동시성) / FAIL(GFT-04 고지) | RPC L394-480, L767-840 |
| 상품권 취소/환불 복원 | — | 환불=원자 RPC / 취소=사후 RPC | reverse 함수에 주문상태 가드 없음 | 미취소 주문에서 역처리된 건 존재 | 미취소 주문 reversed 7건 | FAIL (GFT-01, GFT-05) | `gift_certificate_redemption_reverse` 정의, SQL §3 |
| 상품권 매출 인식·정산(Coin) | Finance | 완료 시 `credit_coin_from_confirmed_sale` | `sale_coin:{orderId}` idempotent | 금액=gift gross(수수료 10% 미차감) | 결제금 포함 과다 발행 9건 8,750 Coin | FAIL (GFT-02, GFT-03) | `lib/currency/recognize-order-currency-on-completed.ts:37-73`, SQL §3 |
| 상품권 레거시 전환/현금화 | 링크만 | 410 | 레거시 함수 EXECUTE postgres only | 아카이브 | — | PASS (단 GFT-06) | `…/cash-outs/route.ts`, `…/conversions/route.ts:76` |
| 상품권 관리자 통제 | 관리자 | 권한키 business | suspend/resume/adjust_validity RPC | — | — | PASS | `app/api/admin/gift-certificates/instances/[id]/corrective/route.ts` |

---

## 3. 결함 목록

### ADS-01 · 심사 지연/기간 경과가 유료 노출 기간을 잠식하고, 만료된 미심사 신청은 영구히 자금 묶임
- 영역: 광고 승인·기간·환불
- 증상: (a) 승인 시 `start_at`/`end_at` 을 재설정하지 않아 심사가 늦을수록 노출일이 줄어든다. (b) 종료일이 지난 SUBMITTED/UNDER_REVIEW 신청도 승인 가능하며(즉시 ACTIVE→크론 ENDED), 자동 환불·자동 만료가 없다.
- 원인: `admin_delivery_ad_transition` approve 분기 — `start_at > now` 면 SCHEDULED, 아니면 ACTIVE; `end_at` 검사 없음. `delivery_ad_system_schedule_transition` end_due 는 ACTIVE/SCHEDULED만. 환불은 `admin_delivery_ad_reject_with_refund`(반려)에만 존재. 초안 생성 시 시작=now+60초(`owner-delivery-ad-commercial-bind.ts:40-52`).
- 운영 증거(SQL): 스폰서드 1건 activated_at−start_at = 101.3h → 7일 결제 중 2.78일 노출. SUBMITTED 2건·UNDER_REVIEW 2건(각 12,000 minor, 합 48,000 minor = ₱480) 이 2026-09-01 제출·09-08 종료일 경과 상태로 SECURED 유지(환불 없음). 펀딩 SECURED인데 노출 0.00일 1건.
- 영향: 매장 금전(지불한 기간 미제공·자금 장기 동결), 관리자 운영 부담.
- 심각도: **P1**
- 현행 동작: 승인 시 원래 기간 유지, 만료 신청은 큐에 무기한 잔류.
- 기대 동작: 승인 시 `start_at = max(now, 요청 시작)`, `end_at = start + snapshot.duration_days`; 종료일 경과 미승인 신청은 자동 만료+전액 환불.
- 수정 설계: `admin_delivery_ad_transition` approve 에서 `delivery_ad_campaign_commercial_snapshots.duration_days_snapshot` 기준 기간 재계산(OWNER_PAID만), `end_at <= now` 승인 거절(`period_expired`). 크론에 `expire_unreviewed`(SUBMITTED/UNDER_REVIEW/CHANGES_REQUESTED + end_at 경과) 액션 추가 → `business_cash_delivery_ad_refund` 를 같은 TX에서 호출, lifecycle `REJECTED`(review_notes='period_expired') 또는 신규 `EXPIRED` 결정(Owner 결정 §7).
- 연동 영향: 오너 상세 화면 기간 표시, 관리자 큐 버킷, 알림 fan-out, 재무 원장(AD_REFUND).
- 검증: SQL 단위테스트(승인 지연 시 end_at 재계산), 크론 dry-run 으로 위 4건 대상 확인, 원장 `bc_refund:*` 1회 생성 확인.
- Owner 승인: 기간 재계산 정책, 만료 상태명, 위 4건(₱480) 환불 집행(운영 DB 데이터 변경).
- 증명 상태: 코드·운영 데이터 PROVEN / 화면 NOT_PROVEN

### ADS-02 · 가격 스냅샷이 기간·인벤토리와 결합되지 않음 (저가 결제로 장기/복수 노출)
- 영역: 광고 상품·가격
- 증상: 7일 패키지로 초안 생성 후 PATCH 로 `endAt` 을 임의로 늘리거나 `inventoryKeys` 에 HOME_FEED+CATEGORY_FEED 를 함께 넣어도 제출 시 `inventoryKeys[0]`·패키지 가격만 차감된다. CHANGES_REQUESTED 상태에서도 동일(재제출 시 기존 SECURED 펀딩·스냅샷 재사용).
- 원인: `owner-store-sponsored-writer.ts:525-552`(기간·인벤토리 자유 수정), `actions/route.ts:145,202`(`inventoryKeys[0]` 만 견적), `owner-delivery-ad-commercial-bind.ts:92-118`(펀딩 존재 시 스냅샷 재사용), DB upsert 함수에 스냅샷 기간 검사 없음(정의 L33/L60 `end>start` 만), 승인 함수도 미검사.
- 운영 증거: 현재 스냅샷 대비 기간 초과 사례 0 (운영 23건 모두 ≤ duration) → 악용 미발생.
- 영향: 플랫폼 광고 매출 손실, 인벤토리 과점. 유일한 방어선은 관리자 육안 심사.
- 심각도: **P1** (금전, 직접 API로 재현 가능)
- 기대 동작: 기간은 패키지에서만 파생, 인벤토리 1개당 1 스냅샷.
- 수정 설계: OWNER_PAID 캠페인은 `start_at/end_at` PATCH 금지(패키지 선택 시 서버가 산출), 인벤토리 다중 선택 시 키별 견적 합산 또는 단일 키 강제; `owner_submit_delivery_ad_with_business_cash` 에서 `end_at - start_at <= duration_days_snapshot` 및 junction 인벤토리 = snapshot.inventory_key 검사 후 실패 시 `quote_stale`.
- 연동 영향: 오너 생성/수정 UI, 재제출 흐름, 관리자 연장(`/extend`) 경로.
- 검증: vitest(PATCH 거절), SQL(제출 RPC 불일치 거절), 운영 스냅샷 대조 쿼리 재실행.
- Owner 승인: 다중 인벤토리 판매 정책.
- 증명 상태: 코드 PROVEN / 운영 악용 없음

### ADS-03 · 파트너 반려가 "환불 → 상태변경" 2단계(비원자) — 승인과 경합 시 ACTIVE + 환불 완료
- 영역: 파트너 멤버십 · 금전
- 원인: `delivery-ad-partner-membership-writer.ts:386-441` 반려는 `business_cash_delivery_ad_refund` 를 먼저 커밋한 뒤 `.eq("status","PENDING_REVIEW")` 업데이트; 승인(`:301-379`)은 `hasCanonicalBcFundingSecured` 확인 후 별도 업데이트. 두 관리자가 동시에 처리하면 승인 UPDATE 성공 + 반려 환불 성공 + 반려 UPDATE 0행(db_error 반환)이 가능.
- 영향: 회비 환불된 ACTIVE 멤버십(광고 할인 혜택 무상 제공) — 플랫폼 금전.
- 심각도: **P1**
- 현행: 비원자 2단계. 기대: 반려/승인 각각 단일 SQL 함수(멤버십 `FOR UPDATE` → 상태 검사 → 환불/승인 → 감사).
- 수정 설계: `admin_partner_membership_decide(p_admin, p_id, p_action, p_reason)` SECURITY DEFINER, 멤버십 row lock + 펀딩 SECURED 재확인 + 환불 동일 TX.
- 연동: 관리자 파트너 화면, 오너 파트너 화면.
- 검증: 동시 호출 테스트(pgTAP/스크립트), 운영 `REJECTED`↔`REFUNDED`, `ACTIVE`↔`SECURED` 대조.
- Owner 승인: 운영 DB 함수 배포.
- 증명 상태: 코드 PROVEN / 운영 발생 NOT_PROVEN(현재 REJECTED 1 = REFUNDED 1 일치)

### ADS-04 · 파트너 신청 중복·고아 펀딩 가능 (DB 유일성 없음 + insert→차감→delete 보상)
- 원인: `delivery_ad_partner_memberships` 에 매장당 열린 멤버십 partial unique 인덱스 없음(인덱스 조회: pkey, store_status_idx 뿐). `ownerApplyPartnerMembership`(`:150-257`)는 비잠금 조회 후 insert, 차감 실패 시 delete. 차감 RPC 가 DB 커밋 후 네트워크 오류로 `rpc_failed` 를 받으면 멤버십 삭제 + 펀딩 SECURED 잔류(고아).
- 영향: 동시 2회 신청 시 회비 이중 차감 / 고아 펀딩. 매장 금전.
- 심각도: **P2** (관리자 반려로 회수 가능)
- 수정 설계: partial unique `(store_id) WHERE status IN ('PENDING_REVIEW','ACTIVE','CANCEL_PENDING')` + 신청을 단일 RPC(행 생성+차감)로. 고아 펀딩 탐지 쿼리를 관리자 큐에 추가.
- 검증: 동시 신청 테스트, 고아 펀딩 조회 `fundings f LEFT JOIN memberships m … WHERE m.id IS NULL`.
- Owner 승인: 인덱스·함수 운영 적용.
- 증명 상태: 코드·인덱스 PROVEN / 운영 발생 NOT_PROVEN

### ADS-05 · 파트너 멤버십 기간 만료 자동 처리 없음 → 만료 후에도 "이용 중"·재가입 불가
- 원인: 만료 전환 writer/크론 없음(`grep partner app/api/cron` 0건). `loadOpenPartnerMembershipForStore`(`:83-97`)가 기간 무관하게 ACTIVE 를 "열린" 상태로 보고 `canApply=false`, `already_open`. 할인만 읽기 시점에 기간 검사(`delivery-ad-commercial-catalog.ts:153-155`).
- 운영 증거: `status=ACTIVE AND period_end < now()` 1건.
- 영향: 매장이 갱신/재가입 불가, 화면 상태 오표시.
- 심각도: **P2**
- 수정 설계: 스케줄 크론에 `ACTIVE/CANCEL_PENDING AND period_end<=now → ENDED` 추가(감사 기록), 오너 GET 의 open 판정에 기간 조건 추가. 월 갱신 정책은 §7.
- 증명 상태: 코드·운영 PROVEN

### ADS-06 · 홈 히어로/물리 인벤토리 배너 노출이 매장 자격(정지·비노출·삭제)을 검사하지 않음
- 원인: `banner-home-hero-exposure.ts:65` `void c.storeId;`, `banner-physical-inventory-exposure.ts:85` 동일. 스폰서드(`store-sponsored-exposure-eligibility.ts:166`)·검색상단(`banner-search-top-exposure.ts:82-85`)은 오가닉 풀로 fail-closed.
- 영향: 정지/폐업 매장의 유료 배너가 계속 노출 → 주문 불가 매장으로 유입, 고객·관리자 혼란.
- 심각도: **P2**
- 수정 설계: 히어로/물리 배너 로더에서 `stores.approval_status='approved' AND is_visible` 맵을 만들어 게이트 사유 `store_eligible` 추가(검색상단과 동일 패턴). 매장 정지 시 진행 중 캠페인을 PAUSED_ADMIN 으로 전이하는 정책은 §7.
- 검증: vitest(정지 매장 배너 제외), 운영 노출 API 응답 확인.
- 증명 상태: 코드 PROVEN / 런타임 NOT_PROVEN

### ADS-07 · 오너 쓰기 게이트가 매장 상태(정지·반려·심사중)를 보지 않음
- 원인: `lib/stores/owner-product-gate.ts getStoreIfOwner` 는 `owner_user_id` 만 비교하고 `approval_status` 를 반환만 함. 광고 제출 RPC(`business_cash_delivery_ad_spend`)·쿠폰 생성(`/api/me/store-coupons/campaigns` POST)·`claim_store_coupon`·상품권 신청 모두 매장 상태 미검사.
- 영향: 정지 매장이 광고비 결제·쿠폰 발행 가능(정지 매장 + 직접 API 호출 시나리오).
- 심각도: **P2**
- 수정 설계: 금전/노출을 만드는 오너 쓰기 경로에 `assertStoreOperational`(approved & not suspended) 추가, DB 함수(제출/claim)에도 동일 조건.
- 증명 상태: 코드 PROVEN / 런타임 NOT_PROVEN

### ADS-08 · 배달 광고 관리자 금전·승인 API 에 권한키 검사 없음
- 원인: `/api/admin/delivery-ads/[campaignId]/actions`(approve/reject/pause/terminate), `/api/admin/delivery-ads/partner/memberships`(approve/reject/end), `/api/admin/platform-popup-requests/[requestId]/actions` 는 `requireAdminApiUser`(모든 관리자)만 사용. 같은 성격의 쿠폰(`app/api/admin/store-coupons/route.ts:92,126`)·상품권 route 는 `requireAdminPermission("business")`. 광고 actions 는 `refund_orphan_funding` 만 business 권한.
- 영향: 권한 분리된 스태프(예: CS)도 광고 승인·반려(환불) 가능 — 관리자 권한 경계.
- 심각도: **P2**
- 수정 설계: 위 라우트를 `requireAdminPermission("business")`(또는 ads 전용 키)로 통일.
- 증명 상태: 코드 PROVEN

### ADS-09 · 주문 광고 기여(attribution)가 응답 후 fire-and-forget
- 원인: `app/api/me/store-orders/route.ts:953` `void reconcileDeliveryAdAttributionForOrder(...)` — `after()` 미사용. 서버리스 종료 시 유실 가능.
- 운영: attribution 0건, click 0건(impression 29건). 실제 클릭이 없었는지 유실인지 구분 불가.
- 심각도: **P3** (과금 미출시, 성과 리포트 정확도)
- 수정 설계: `after()` 로 감싸거나 주문 이벤트 기반 비동기 처리. 클릭 0건은 실기기 확인 필요.
- 증명 상태: 코드 PROVEN / 유실 NOT_PROVEN

### ADS-10 · 노출 이벤트 eventId·sessionSeed 를 클라이언트가 지정
- 원인: `app/api/stores/ads/impression/route.ts:27-29` — 같은 토큰(30분 TTL)으로 eventId 만 바꿔 반복 POST 하면 노출 수 증가.
- 심각도: **P3** (현재 과금 없음, 성과 지표 왜곡). CPC/CPA 출시 전 필수 보완.
- 수정 설계: 토큰에 render_instance_id 고정·(token, viewer_session_hash) 단위 dedupe, IP/세션 rate-limit.
- 증명 상태: 코드 PROVEN

### ADS-11 · 일시중지 상태의 종료일 처리 누락 및 재개 시 end_at 미검사(배너·관리자 재개)
- 원인: `owner_delivery_ad_transition` 은 스폰서드 재개만 end_at 검사(배너 미검사). `admin_delivery_ad_transition` PAUSED_ADMIN→ACTIVE end_at 미검사. 크론 end_due 는 ACTIVE/SCHEDULED 만이라 PAUSED_* 캠페인은 종료일 후에도 PAUSED 로 잔류(`delivery_ad_system_schedule_transition` 정의).
- 영향: 노출은 서빙단에서 차단되므로 고객 영향 없음, 상태/통계·오너 화면 불일치.
- 심각도: **P3**
- 수정 설계: end_due 대상에 PAUSED_OWNER/PAUSED_ADMIN 포함, 모든 →ACTIVE 전이에 `end_at > now` 검사.
- 증명 상태: 코드 PROVEN

### ADS-12 · 미펀딩 레거시 신청이 관리자 심사 큐에 잔류
- 근거: UNDER_REVIEW 1건(2026-08-31) 이 canonical 펀딩·레거시 Store Cash 펀딩 모두 없음(SQL). 승인 시 `funding_required` 로만 막힘. 문서 finance-design §11.1 은 "펀딩 마크 없는 행은 펀딩된 심사 대상으로 노출 금지".
- 심각도: **P3** · 수정: 큐 쿼리에 펀딩 조인 필터 또는 해당 행 관리자 반려(환불 없음) 처리. Owner 승인: 데이터 정리.
- 증명 상태: 운영 PROVEN

### ADS-13 · (잠재) 오너 플랫폼 팝업 제출이 비원자(키 바인딩→차감→상태변경)
- 원인: `lib/platform-popup/owner-request-writer.ts submitPlatformPopupOwnerRequest` — 차감 성공 후 상태 UPDATE 실패 시 SECURED 펀딩 + draft 상태.
- 현재 `OWNER_PLATFORM_POPUP_NEW_SALES_ENABLED=false` 로 신규 판매 차단 → 재개 전 수정 필요.
- 심각도: **P3** · 증명: 코드 PROVEN

### ADS-20 · 오너 쿠폰 상태변경이 관리자 조치를 덮어씀 (CAS·오류검사 없음)
- 원인: `app/api/me/store-coupons/campaigns/route.ts:173-195` — `pause`/`end` 는 현재 상태 조건 없이 UPDATE, `resume` 은 `paused` 면 무조건 active. 관리자 일시중지(`app/api/admin/store-coupons/route.ts:153`)도 같은 `paused` 값이라 오너가 재개 가능. `end` 는 `revoked` 캠페인을 `ended` 로 바꿔 강제 회수 표식을 지움(엔타이틀먼트는 이미 revoked 라 재사용은 불가). UPDATE 오류 무시 후 `ok:true`. `validateActiveSession` 없음(다른 오너 라우트와 불일치).
- 영향: 관리자 통제 우회(어뷰징 쿠폰 재활성), 감사 흔적 훼손.
- 심각도: **P2**
- 수정 설계: 상태별 허용 전이표 + `.in("lifecycle_state", from)` CAS, `paused_by`(owner/admin) 컬럼 또는 `admin_paused` 상태 분리, revoked 는 오너 변경 불가, 오류 시 500, 세션 검증 추가, `coupon_audit_events` 기록.
- 증명 상태: 코드 PROVEN

### ADS-21 · 쿠폰 복원(취소·환불)이 상태 커밋 후 best-effort, 결과 미확인·재처리 없음
- 원인: `lib/stores/apply-store-order-status-transition.ts:434-437, 446-449` `await sb.rpc("restore_store_coupon_entitlement", …)` 결과 미검사. 상품권은 reconcile 크론이 있으나 쿠폰 복원 reconcile 없음(`lib/currency/reconcile-order-currency.ts` 쿠폰 항목 없음).
- 운영: 취소/환불 주문에 redeemed 상태 쿠폰 0건 → 현재 불일치 없음.
- 심각도: **P2** (실패 시 구매자 쿠폰 소실)
- 수정 설계: 취소 전이를 수행하는 DB 함수(또는 상태 UPDATE 트리거)에서 쿠폰 복원을 같은 TX로; 최소한 오류 로깅+재처리 큐.
- 증명 상태: 코드 PROVEN / 운영 영향 없음

### ADS-22 · 쿠폰 비용 분할(store/platform funded)을 DB 가 재계산하지 않음
- 원인: `create_store_order_atomic` L530-531 이 payload 의 `store_funded_amount`/`platform_funded_amount` 를 그대로 저장(할인액은 L360-388 에서 재계산하지만 분할은 미검증). Coin 보전액은 `gift_redemption_amount + platform_funded_amount`(`recognize-order-currency-on-completed.ts:37-41`)라 분할 오류가 그대로 Coin 발행에 반영.
- 운영: 분할합≠할인 2건(2026-08-24, STORE_FUNDED, 0+0 vs 50, pending 상태 레거시).
- 심각도: **P3** (현재 서버 계산값만 전달되나 방어 계층 부재)
- 수정 설계: RPC 내에서 캠페인 `funding_mode/store_funded_amount` 로 분할 재계산·불일치 거절, `CHECK (store_funded_amount + platform_funded_amount = discount_amount)`(쿠폰 주문 한정).
- 증명 상태: 코드·운영 PROVEN

### ADS-23 · 쿠폰 캠페인 상태 이중 권한·종료 미반영
- 근거(SQL): `lifecycle_state='active'` 이면서 `end_at < now()` 40건, `lifecycle_state='active' AND is_active=false` 13건. claim 은 두 값 모두 요구, 관리자 화면은 lifecycle 기준.
- 심각도: **P3** · 수정: 종료 크론(active→ended), `is_active` 를 lifecycle 파생 컬럼화.
- 증명 상태: 운영 PROVEN

### ADS-24 · (잠재) `max_uses_per_user > 1` 과 `store_coupon_redemptions (buyer_user_id, campaign_id)` unique 충돌
- 근거: 인덱스 `store_coupon_redemptions_buyer_campaign_unique`, `claim_store_coupon` 의 `max_uses_per_user` 사용. 현재 모든 캠페인 값=1 → 영향 없음.
- 심각도: **P3**

### ADS-25 · 쿠폰 복원 시 사용 이력 삭제 및 종료 캠페인 예산 재가산
- 원인: `restore_store_coupon_entitlement` 이 `DELETE FROM store_coupon_redemptions WHERE order_id=…`, 캠페인 상태와 무관하게 `reserved_spend_php` 가산, 상태는 `restored` 가 아닌 `available` 로 복귀(enum `restored` 미사용).
- 심각도: **P3** (감사 추적·예산 지표)
- 수정: redemption 행에 `reversed_at` 마킹, 상태 `restored` 사용.

### GFT-01 · 미취소 주문에서 상품권 사용이 역처리된 운영 데이터 (주문은 진행 상태, 결제액은 상품권 차감 상태)
- 근거(SQL): `gift_certificate_redemptions.reversed=true` 이면서 주문이 cancelled/refunded 가 아닌 7건.
  - 6건: 2026-09-17 14:22~14:23 생성 직후 1초 내 역처리, 주문 `pending`·`payment_status=paid`, `payment_amount` 0원 4건 / 260 2건, `gift_redemption_amount` 0 으로 갱신, 인스턴스는 ACTIVE(또는 GIFT_LOCKED)로 복원.
  - 1건: 2026-08-28 completed 주문이 2026-09-01 역처리(인스턴스는 다른 live 사용으로 FULLY_REDEEMED).
- 원인: `gift_certificate_redemption_reverse(p_order_id)` 에 주문 상태 가드 없음(래퍼 `cancel_order_restore`/`refund_order_atomic` 만 가드). service_role 로 직접 호출된 것으로 추정(QA 스크립트로 보이는 패턴) — 호출 주체 NOT_PROVEN.
- 영향: 매장이 해당 pending 주문을 처리하면 상품권 매출 없이 음식 제공(매장 금전), 구매자는 상품권과 음식 모두 획득. 주문 7건은 9/17 이후 pending 방치.
- 심각도: **P1** (주문·금전 정합성, 운영 데이터)
- 기대: reverse 는 주문이 cancelled/refunded(또는 결제실패)일 때만.
- 수정 설계: `gift_certificate_redemption_reverse` 첫 단계에 주문 `FOR UPDATE` + 상태 가드(`order_not_terminal` 반환), 7건은 Owner 확인 후 주문 취소 처리 또는 상품권 재차감(데이터 수정).
- 검증: 가드 단위 테스트, 위 SQL 재실행 0건.
- Owner 승인: 7건 데이터 정리 방법, 함수 운영 적용.
- 증명 상태: 운영 데이터 PROVEN / 원인 호출자 NOT_PROVEN

### GFT-02 · Coin 과다 발행: 구매자 직접결제액(payment_amount)이 sale_coin 에 포함된 9건
- 근거(SQL): `store_economic_point_ledger` `sale_coin:%` 9건(2026-09-01~09-15) 금액이 `gift_redemption_amount + platform_funded_amount` 를 초과, 초과 합계 **8,750 Coin**. 예: 총액 1,900 = 결제 900 + 상품권 1,000 → Coin 1,900 발행.
- 원인: 당시 코드가 결제액까지 발행(현 코드 `platformHeldSaleAmountPhp` 는 gift+platform_funded 만, `recognize-order-currency-on-completed.ts:37-41`). 문서 `dibay-currency-ssot-hard-lock.md` §COIN "Buyer payment_amount … never minted" 위반 데이터가 정정 없이 잔존.
- 영향: 플랫폼 금전(인출 가능한 Coin 과다), 정산·원장 불일치.
- 심각도: **P1** (금전, 히스토리 데이터)
- 수정 설계: 주문별 차액 정정 원장(`COIN_CORRECTION`, idempotency `coin_correction:sale:{orderId}`) — 기존 `reverse_coin_credits_for_order` 패턴, 음수 허용 정책 준수.
- Owner 승인: 정정 여부·대상 매장 고지(운영 DB 데이터 변경).
- 증명 상태: 운영 PROVEN (도메인: Coin/재무와 공동)

### GFT-03 · 상품권 플랫폼 수수료(상품 10%)가 Coin 발행에서 차감되지 않음 — 문서 간 충돌
- 근거: 상품 49/50개 `platform_fee_rate=10`, redemption 51건 `platform_fee_amount>0`, `gift_certificate_revenue_ledger` REVENUE_AVAILABLE = merchant_net(90%). 그러나 Coin 발행액은 `gift_redemption_amount`(gross, `recognize-order-currency-on-completed.ts:41`). 운영: 완료 상품권 주문 3건 revenue_available 2,700 vs gift gross 3,000.
- 영향: 수수료가 다른 곳(Cash SALE_FEE)에서 회수되지 않으면 플랫폼 수수료 10% 미수취, 회수된다면 revenue_ledger 수치가 오표시.
- 심각도: **P1 / NOT_PROVEN** (정책 결정 필요)
- 수정 설계: Owner 가 "상품권 수수료 = Coin 발행 시 차감" 또는 "커미션 일원화(platform_fee_rate 폐기)" 중 결정 → 한쪽 SSOT 로 정리(`platformHeldSaleAmountPhp` 를 merchant_net 기준으로, 또는 상품 fee_rate 0 고정 + revenue_ledger 표시 수정).
- 증명 상태: 코드·데이터 PROVEN, 의도 NOT_PROVEN

### GFT-04 · 1회 전액 소멸 정책인데 결제 화면에 잔액 소멸 고지 없음
- 원인: `create_store_order_atomic` L793 `v_gift_forfeited := remaining - used`, 인스턴스 FULLY_REDEEMED. 장바구니 패널(`components/stores/cart/StoreCartGiftApplyPanel.tsx:184-195`)은 "이번 주문 사용 ₱X" 만 표시, 소멸액 경고 없음(소멸 표기는 사용 후 상세 `OwnedGiftInstanceDetailView.tsx:262` 에만).
- 영향: 구매자 금전(₱1,000 상품권으로 ₱300 주문 시 ₱700 소멸)·분쟁.
- 심각도: **P2**
- 수정 설계: 적용 미리보기에 `computeCheckoutGiftApplyPreview` 로 소멸액 표시 + 소멸 발생 시 확인 모달(동의 후 적용).
- 증명 상태: 코드 PROVEN / 화면 NOT_PROVEN

### GFT-05 · 취소 시 상품권 복원이 상태 커밋 후 별도 호출 · 유효기간 경과 후 복원은 사용 불가 상태로 복원
- 원인: `apply-store-order-status-transition.ts:451-475` — cancelled 커밋 후 `gift_certificate_cancel_order_restore` 호출, 실패 시 로그만(재처리는 env 게이트 `DIBAY_CURRENCY_RECONCILE_APPLY_FROM` 의 크론). reverse 함수는 `valid_until` 경과 여부와 무관하게 ACTIVE 복원 → 이미 만료된 상품권은 결제 시 `gift_expired` 로 사용 불가(구매자 가치 상실).
- 운영: 취소/환불 주문의 미역처리 0건.
- 심각도: **P2**
- 수정 설계: 취소 전이를 DB 함수로 묶어 같은 TX 처리(환불과 동일 G10 원칙), 만료 후 복원 시 유효기간 연장(예: 복원일+N일) 또는 Point 환불 — 정책 §7.
- 증명 상태: 코드 PROVEN

### GFT-06 · 오너 상품권 revenue API 가 아카이브 지갑(store_cash_*)을 계속 조회
- 원인: `app/api/me/stores/[storeId]/gift-certificates/revenue/route.ts:41-50,95-110` — `storeCashAccounts`, `storeCashLedger`, recovery obligations 조회·반환. 현재 오너 UI 는 호출하지 않음(`OwnerGiftMoneyOpsPanel` 은 finance/redemptions/promo 만).
- 문서 위반: `dibay-gift-certificate-hard-lock.md` "archive-only … authorize no active reader", 통화 SSOT §Historical.
- 심각도: **P3** · 수정: 라우트 410 또는 Coin/revenue_ledger 만 반환.

### GFT-07 · 상품권 구매 idempotency 키가 사용자 비스코프(전역)
- 원인: `gift_certificate_purchase` unique_violation 처리에서 `related_id = v_key` 로 기존 인스턴스를 찾아 `instance_id`·`public_gift_number` 반환 — 다른 사용자 키와 충돌 시 그 사용자의 인스턴스 정보 반환 + 본인 미차감 "성공".
- 심각도: **P3** (키는 클라이언트 생성 UUID라 추측 난이도 높음) · 수정: 키를 `buyer_user_id || ':' || key` 로 스코프.

### GFT-08 · 상품 issued_count 와 실제 인스턴스 수 불일치 1건
- 근거(SQL) 1개 상품. max_issuance 초과는 0. **P3**, 원인 NOT_PROVEN(관리자 직접 발행·삭제 이력 추정).

---

## 4. 누락 기능 (배민/요기요/쿠팡이츠 대비 — 설계 제안, 결함 아님)

1. **광고 기간 보장/보상**: 승인 지연분 자동 연장 또는 일할 환불(ADS-01 과 연계), 관리자 조기 종료(terminate) 시 잔여 기간 환불 규칙 — 현재 terminate/end 시 환불 없음(`admin_delivery_ad_transition`).
2. **예산형·성과형 광고(CPC/주문당 과금)**: 테이블(`delivery_ad_charge_ledger`, budgets)만 존재, chargeExecution=false.
3. **광고 성과 리포트 신뢰도**: 클릭·주문기여 0건 — 실집계 검증 필요, 광고비 대비 주문/매출 ROAS 화면.
4. **파트너 멤버십 자동 갱신/해지 처리**(월 회비 자동 차감, 만료 알림).
5. **쿠폰**: 다운로드 쿠폰 외 즉시할인·배달비 쿠폰·중복 사용 규칙(현재 쿠폰 1장 + 상품권 1장만), 쿠폰 예산 소진 알림.
6. **상품권**: 미사용 상품권 구매 취소/Point 환불, 매장 폐업 시 STORE 상품권 처리(플랫폼 대체 사용·환불), 부분 사용(정책상 금지), 유효기간 만료 사전 알림, 오너용 발행·사용·미사용 부채 리포트.
7. **매장 정지 연동**: 정지 시 진행 중 광고·쿠폰 자동 일시중지 및 기간 보상.

---

## 5. SSOT 표

| 데이터 | 권한 소스 | 이탈 소비자 |
|---|---|---|
| 광고 결제/환불 | `business_cash_ledger` + `delivery_ad_canonical_bc_fundings` (`business_cash_delivery_ad_spend/refund`) | 파트너 신청/반려 TS 2단계(ADS-03/04), 팝업 제출 TS 2단계(ADS-13) |
| 광고 가격·기간 | `delivery_ad_campaign_commercial_snapshots` | 캠페인 `start_at/end_at`, junction 인벤토리(오너 PATCH 로 독립 변경, ADS-02) |
| 광고 상태 | `lifecycle_status` (`*_transition` RPC) | `is_active` 호환 컬럼, 배너 RLS 정책(`is_active`+기간만 검사) |
| 노출 자격 | eligibility 계약(`delivery-ad-eligibility-contract.ts`) | 배너 히어로/물리 인벤토리 store 자격 미적용(ADS-06) |
| 파트너 상태 | `delivery_ad_partner_memberships.status` | 할인 판정은 기간 검사, open 판정은 상태만(ADS-05) |
| 쿠폰 할인액 | `create_store_order_atomic` 재계산 | TS `resolveStoreCouponCheckoutDiscount`(사전 계산, DB 가 검증) — 일치 |
| 쿠폰 비용 분할 | (사실상) TS `splitCouponFunding` | DB 미검증(ADS-22) |
| 쿠폰 상태 | `lifecycle_state` | `is_active`(claim·노출 로더 사용, ADS-23) |
| 상품권 잔액 | `gift_certificate_instances.remaining_balance` + `gift_certificate_ledger` | — (CHECK 0≤잔액≤액면) |
| 상품권 매장 수익 | `gift_certificate_revenue_ledger`(merchant_net) | Coin 발행은 gross(GFT-03) |
| 매장 Coin | `store_economic_point_ledger` `sale_coin:{orderId}` | 과거 9건 결제액 포함(GFT-02) |
| 레거시 Store Cash | 아카이브 | 오너 revenue API 조회(GFT-06) |

---

## 6. 기존 문서와 구현 차이

1. `docs/dibay-delivery-advertising-ssot.md` §9 "storeEligibleById null→true = PARTIAL" — 스폰서드는 CUT D 로 fail-closed 완료(`store-paid-ad-exposure.ts:4,129`), 배너 히어로는 여전히 미적용 → 문서와 코드 모두 부분 상태.
2. 같은 문서 §10/§11 "Owner `/stores/owner/ads` Stub — CUT C", "C–K not started" — 실제로는 오너·관리자 화면, 결제, 이벤트, 크론까지 구현됨(문서 stale).
3. `docs/dibay-delivery-ads-finance-approval-authority-design.md` §8.1 "`REJECTED` does not exist" — 운영 `delivery_ad_partner_memberships` 에 REJECTED 1건, 코드도 사용(`:409-411`). (문서는 SUPERSEDED 표시)
4. 같은 문서 §8 "Partner apply → PENDING_REVIEW without fee secure" — 현재는 Cash 차감 후 PENDING_REVIEW(해결). 단 비원자(ADS-04).
5. §11.1 "펀딩 마크 없는 행은 심사 큐 노출 금지" — 미펀딩 UNDER_REVIEW 1건 잔류(ADS-12).
6. `docs/dibay-currency-ssot-hard-lock.md` §COIN "payment_amount never minted" — 과거 9건 위반 데이터 미정정(GFT-02).
7. `docs/dibay-gift-certificate-hard-lock.md` "legacy store cash … no active reader" — 오너 revenue API 가 조회(GFT-06).
8. 상품권 hard-lock "Owner revenue at sale = 0, recognition on redemption" — 구현 일치(구매 시 매장 원장 없음, 사용 시 REVENUE_CREATE). 수수료 처리(merchant_net vs Coin gross)는 문서 간 미정(GFT-03).
9. `docs/dibay-admin-real-operation-cut-c-ads-operation-hard-lock.md` "Payment ≠ ACTIVE" — 구현 일치(승인 필요, `delivery_ad_campaign_funding_allows_active`).
10. 관찰(범위 밖, 재무/커미션 감사로 이관): `business_cash_accounts` 1개 매장 잔액 0 vs 원장 순합 22,500 minor 불일치 — `balance_after_minor` 체인이 SALE_FEE / SALE_FEE_SETTLEMENT 행(2026-09-01~09-07)에서 끊김. 광고 행(AD_SPEND/AD_REFUND)은 펀딩과 1:1 일치.

---

## 7. Owner 정책 결정 필요 사항

1. 광고 승인 지연 시 기간 처리: 승인 시점 기준 재계산 vs 원 기간 유지+일할 환불 (ADS-01).
2. 종료일이 지난 미승인 유료 신청: 자동 반려+전액 환불 여부, 상태명(REJECTED vs EXPIRED), 현재 4건 ₱480 처리 (ADS-01).
3. 관리자 조기 종료(terminate)·오너 중도 종료(end) 시 잔여 기간 환불 규칙.
4. 스폰서드 다중 인벤토리 판매 허용 여부와 가격 산식 (ADS-02).
5. 파트너 회비: 자동 갱신 여부, 만료 처리, 반려 상태 표준화 (ADS-03~05).
6. 매장 정지 시 진행 중 광고·쿠폰·판매 중 상품권의 처리(자동 일시중지/환불/기간 보상) (ADS-06/07).
7. 상품권 플랫폼 수수료 10%를 Coin 발행에서 차감할지, 커미션으로 일원화할지 (GFT-03).
8. 과거 Coin 과다 발행 8,750 Coin 정정 여부 (GFT-02).
9. 운영 7개 주문의 상품권 역처리 데이터 정리 방법(주문 취소 vs 상품권 재차감) (GFT-01).
10. 상품권 1회 전액 소멸 시 사전 고지/동의 UI 및 소멸분 귀속(플랫폼 낙전 수익) 회계 처리 (GFT-04).
11. 만료 후 취소로 복원된 상품권의 유효기간 연장 또는 Point 환불 (GFT-05).
12. 관리자 일시중지 쿠폰을 오너가 재개할 수 있는지 (ADS-20).

---

### 심각도 집계
- P0: 0
- P1: 6 (ADS-01, ADS-02, ADS-03, GFT-01, GFT-02, GFT-03[NOT_PROVEN·정책])
- P2: 9 (ADS-04, ADS-05, ADS-06, ADS-07, ADS-08, ADS-20, ADS-21, GFT-04, GFT-05)
- P3: 12 (ADS-09, ADS-10, ADS-11, ADS-12, ADS-13, ADS-22, ADS-23, ADS-24, ADS-25, GFT-06, GFT-07, GFT-08 + 관찰 1건 §6-10 은 미집계)

# 주문·배달 상태·주문 채팅/알림 감사 (ORD / DLV / NTF)

- 감사일: 2026-10-20 (PHT) · 범위: 감사만 (저장소·DB 변경 없음)
- 운영 DB: `ckdosyydvgzqwpbwuhon` 읽기 전용 (pg_catalog / pg_policies / pg_trigger / pg_proc / 집계 COUNT만, 개인정보 컬럼 조회 없음)
- 증거 구분: **코드/DB 증거** = file:line·배포 함수 원문·집계 SQL. **런타임(화면·푸시 실수신)** = 로그인 불가 → NOT_PROVEN 으로 표기.

---

## 1. 범위 및 조사 대상 목록

### 1-1. 문서 (8)
`docs/store-order-process-single-source.md`, `docs/store-order-cancel-refund-decision-ssot.md`, `docs/admin-store-order-ops-ssot.md`, `docs/admin-store-orders-read-ssot.md`, `docs/r2-d1-owner-orders-analysis.md`, `docs/admin/dibay-admin-delivery-ops-audit-design.md`, `docs/store-commission-cash-settlement-ssot.md`(교차 확인), `docs/dibay-delivery-product-hard-lock.md`(교차 확인)

### 1-2. API 라우트 (27)
| 구분 | 경로 |
|---|---|
| 구매자 | `POST/GET /api/me/store-orders`, `GET/PATCH/DELETE /api/me/store-orders/[orderId]`, `GET …/[orderId]/events`, `POST …/[orderId]/ensure-chat` |
| 오너 | `GET /api/me/stores/[storeId]/orders`, `GET/PATCH …/orders/[orderId]`, `POST …/cancel-request`, `POST …/decide`, `…/delivery`, `…/ensure-chat`, `…/review`, `GET /api/me/owner-store-order-context` |
| 관리자 | `POST /api/admin/store-orders/[orderId]/intervene`, `PATCH /[orderId]`(410), `POST /approve-refund`(410), `PATCH /cancel-request`, `/mark-paid`(410), `/delivery`, `/detail`, `/history`, `/bulk-delete`(410), `/list`, `/export`, `/ops`, `/audit` |
| 라이더 | `/api/me/rider/orders`, `/api/me/rider/orders/[orderId]`, `…/pod-upload`, `/api/me/rider/location`, `/status`, `/bootstrap` |
| 크론·웹훅 | `/api/cron/store-orders-auto-complete`, `/api/cron/store-order-accept-reminders`, `/api/cron/commerce-notification-push-handoff`, `/api/webhooks/external-delivery`, `/api/webhooks/store-order-payment` |

### 1-3. 서버 모듈 (24)
`lib/stores/create-store-order-atomic.ts`, `validate-store-order-checkout.ts`, `store-order-client-key.ts`, `apply-store-order-status-transition.ts`, `order-status-transitions.ts`, `store-order-cancel-policy.ts`, `owner-store-order-decision.ts`, `admin-store-order-intervention.ts`, `apply-admin-store-order-operations.ts`, `apply-admin-store-order-refund.ts`, `store-order-delivery-service.ts`, `store-order-delivery-status.ts`, `delivery-proof-admin-view.ts`, `owner-product-gate.ts`, `owner-store-ownership-cache.ts`, `owner-order-payment-policy.ts`, `store-order-detail-snapshot.ts`, `store-order-detail-snapshot-assemble.ts`, `store-order-detail-snapshot-cache.ts`, `store-order-detail-snapshot-refresh.ts`, `buyer-store-order-money.ts`, `lib/delivery/owner/owner-store-orders-list-snapshot.ts`, `lib/community-messenger/store-order-chat-service.ts`, `lib/notifications/notify-store-commerce.ts`, `lib/business/owner-store-order-notification-href.ts`, `lib/business/load-owner-store-order-context.ts`, `lib/admin/store-orders/admin-store-order-intervention-contract.ts`
(참고: 과제에 적힌 `lib/order-chat` 디렉터리는 **존재하지 않음**. 주문 채팅 구현은 `lib/community-messenger/store-order-chat-service.ts` + `lib/shared-order-chat/chat-message-builder.ts`)

### 1-4. UI (8)
`components/stores/StoreCommerceCartPageClient.tsx`(체크아웃·멱등키), `components/business/owner/OwnerStoreOrdersView.tsx`(오너 목록·딥링크), `hooks/stores/useOwnerStoreOrdersRealtime.ts`, `hooks/useSupabaseBuyerStoreOrdersRealtime.ts`, `app/(main)/orders/store/[orderId]/chat/page.tsx`, `app/(main)/my/business/store-order-chat/[orderId]/page.tsx`(리다이렉트), `app/(main)/stores/owner/order-chats/page.tsx`, `app/admin/order-chats/page.tsx`

### 1-5. DB 객체 (운영 배포본 확인)
- 테이블 9: `store_orders`, `store_order_items`, `store_order_events`, `store_order_deliveries`, `store_order_cancel_requests`, `store_payments`, `delivery_riders`, `notification_events`, `store_sale_fee_obligations`(교차)
- 함수 12: `create_store_order_atomic`, `store_order_buyer_cancel_request_atomic`, `gift_certificate_refund_order_atomic`, `gift_certificate_cancel_order_restore`, `restore_store_order_stock_atomic`, `restore_store_coupon_entitlement`, `get_buyer_store_order_detail_snapshot`, `get_store_order_detail_snapshot`, `get_owner_store_order_detail_snapshot`, `get_owner_store_orders_list_snapshot`, `store_order_deliveries_pickup_requires_dispatch`, `scan_store_order_sla_warnings`
- 트리거 6: `trg_store_order_deliveries_pickup_requires_dispatch`(O), `trg_store_order_deliveries_updated_at`(O), `store_orders_updated_at`(O), `trg_store_orders_cash_order_gate`(O), **`trg_store_orders_commission_lifecycle`(D = 비활성)**, `trg_store_orders_gift_revenue_recognition`(O)
- Realtime 발행: `store_orders`, `store_order_deliveries`, `notification_events`, `community_messenger_*` 포함
- 스케줄러: `vercel.json` crons 12개 · 운영 DB `cron` 스키마 **없음**(pg_cron 미사용)

합계: 문서 8 · API 27 · 서버 모듈 27 · UI 8 · 테이블 9 · 함수 12 · 트리거 6 = **97 항목**

---

## 2. 기능별 현황표

| 기능 | UI | API | DB | 업무 | 운영 | 판정 | 근거 |
|---|---|---|---|---|---|---|---|
| 체크아웃→주문 생성 (원자적) | 장바구니 제출 | `POST /api/me/store-orders` 매장 승인·노출·영업·최소주문·서비스지역 검증 | `create_store_order_atomic` 재고·주문·라인·쿠폰·상품권 1 TX, 매장 상태 TX 내 재확인, `price_changed` | 정상 | 836건 생성 | PASS | `app/api/me/store-orders/route.ts:304-336,681-757`; 함수 원문(`approval_status`/`is_open`/`FOR UPDATE`) |
| 중복 주문 방지 (멱등) | `clientOrderKeyRef` + 단일 비행 | key 정규화 | `store_orders_buyer_client_order_key_uidx` UNIQUE | 실패 응답 시 키 폐기 → 재시도는 새 주문 | 60초 내 동일 구매자·매장·금액 쌍 158건(구매자 8명, 대부분 키 상이) | NOT_PROVEN (QA 데이터 추정) | `StoreCommerceCartPageClient.tsx:1581-1684`, `lib/stores/store-delivery-api-client.ts:1012-1040`, 인덱스 SQL |
| 오너 신규주문 실시간 수신 | 목록 INSERT 패치 | — | Realtime `store_orders` 발행 + `store_orders_owner_select` RLS | 소리는 `notification_events` 경로 | 실측 불가 | NOT_PROVEN (코드 PASS) | `hooks/stores/useOwnerStoreOrdersRealtime.ts:123-190`, `lib/business/delivery-order-alert-debounce.ts:18` |
| 신규주문 푸시·인앱 | 알림 → 주문 딥링크 | `notifyStoreOwnerNewOrder` dedupe `commerce:owner:new_order:<id>` | `notification_events` handoff (cron 2분 재시도) | 정상 | `handed_off` 행 존재(최근 10-17) | PASS(부분) | `lib/notifications/notify-store-commerce.ts:64-150`, `vercel.json` |
| 상태 전이 매트릭스 | 오너 CTA | TS `allowedOrderTransitionsForActor` | **DB 는 상태값 CHECK 만** — 전이 규칙 트리거 없음, 쓰기는 service_role 만(RLS UPDATE 정책 없음) | 경로가 모두 단일 writer 경유 | — | PASS(조건부) — DB 강제 아님 | `lib/stores/order-status-transitions.ts:365-453`, `store_orders_order_status_check`, pg_policies |
| 낙관적 잠금 (CAS) | — | `.eq("order_status", current)` + `expectedCurrentStatus` | 구매자 취소요청·환불은 DB 함수 `FOR UPDATE` | 관리자 개입은 기대상태를 CAS 에 전달하지 않음 (ORD-04) | — | FAIL(부분) | `apply-store-order-status-transition.ts:145-148,236-245`; `apply-admin-store-order-operations.ts:56-68` |
| 수락 + 조리시간(ETA) | 수락 시트 | 1~180분 필수, 서버 시각으로 `estimated_ready_at` | 컬럼 | 수락 후 시간 변경 불가 · 구매자 알림에 ETA 미포함 (NTF-03) | — | PASS(기본)/FAIL(알림) | `apply-store-order-status-transition.ts:169-186,684-692` |
| 이중 수락 | — | `current===next` → idempotent | CAS | 정상 | — | PASS | 동 파일 `:150-152` |
| 구매자 접수 전 취소 | 상세 | `PATCH {cancel}` pending 만 | CAS | 오너 수락과 경합 시 한쪽만 | — | PASS | `app/api/me/store-orders/[orderId]/route.ts:254-297` |
| 구매자 진행 중 취소 요청 | 사유 시트 | 사유 2~500자, 정책 확인 | `store_order_buyer_cancel_request_atomic` 원장+상태 1 TX, 배달 픽업 잠금 확인 | 매장 결정 | 배포 확인 | PASS | 동 `:194-252`; 함수 원문 |
| 오너 결정 (승인/반려) | `OwnerOrderRequestDecision` | `expected_status` 필수, 복원상태 서버 결정 | CAS | 원장 닫기는 상태 변경 후 별도 쓰기 | 53건 레거시 대기 | PASS(동시성)/FAIL(원장 원자성 ORD-06) | `lib/stores/owner-store-order-decision.ts:54-173` |
| 오너 직접 취소 | 취소 시트 | 사유 필수, 픽업 이후 차단(TS) | 원장 INSERT 가 상태 변경 **뒤** 별도, 실패 시 로그만 | 사유가 구매자에게 전달되지 않음 | 오너 원장 마지막 08-21 | FAIL | `app/api/me/stores/[storeId]/orders/[orderId]/cancel-request/route.ts:86-117` |
| 관리자 개입 + 사유 기록 | 상세 「관리자 개입」 | 사유 필수·`expected_status` 필수·감사로그 | 경로별 CAS (기대상태 미전달) | 오너 알림 | 10-17 관리자 취소 8건 | FAIL(부분, ORD-04) | `lib/stores/admin-store-order-intervention.ts:87-168` |
| 환불 승인 | 결정 버튼 | `gift_certificate_refund_order_atomic` | `FOR UPDATE` + `refund_requested` 확인 | 동시 승인 2회 시 RPC 가 idempotent ok → TS 부수효과 2회 실행(대부분 멱등) | — | PASS(경미 NTF/ORD-11) | 함수 원문; `apply-store-order-status-transition.ts:288-326,406-439` |
| 부분 취소·주문 수정 | 없음 | 없음 (`partialRefundSupported:false`) | — | — | — | 누락(설계) | `lib/stores/adjust-store-settlement-on-refund.ts:17-24,67-80` |
| 자동 구매확정 크론 | — | 라우트 존재 | — | **스케줄 미등록** | 10-01 만기 주문 1건 미완료, SYSTEM 완료 이벤트 1건(08-07)뿐 | FAIL (ORD-02) | `vercel.json` crons, `app/api/cron/store-orders-auto-complete/route.ts`, 집계 SQL |
| 접수 독촉 알림 크론 | — | 라우트 존재 | — | **스케줄 미등록** | `system_note` 이벤트 0건 | FAIL (ORD-02) | `app/api/cron/store-order-accept-reminders/route.ts:84`, 집계 SQL |
| 미접수 주문 타임아웃/자동취소 | — | 없음 | 없음 | pending 54건이 최장 3개월 방치 | 54건 | FAIL/누락 (ORD-03) | 집계 SQL |
| SLA 경고 스캔 | 관리자 큐 | — | `scan_store_order_sla_warnings` 존재, pg_cron 없음 | — | `sla_warning_level` 설정 0건 | FAIL (ORD-03) | 마이그레이션 `20260509131000`·`20260516120000` vs 운영 `cron` 스키마 부재 |
| 오너 주문 목록 검색·필터·페이지 | 탭(클라 필터) | `?fresh=1` 외 파라미터 없음, 최근 60건 고정 | RPC 는 cursor·status 지원 | **60번째 이후 진행 중 주문 65건 비노출** | 7개 매장 60건 초과 | FAIL (ORD-05) | `app/api/me/stores/[storeId]/orders/route.ts:211-215`, `lib/stores/fetch-store-orders-list-deduped.ts:38-40`, `owner-store-orders-list-snapshot-counter.ts:9` |
| 상세 품목·옵션·금액 일치 | 3화면 | 모두 `store_order_items` 스냅샷 | 동일 테이블 | 금액 불일치 26건은 기존 문서 표시만 | — | PASS(품목) | 함수 원문 3종; `docs/admin-store-order-ops-ssot.md` §3 |
| 구매자 상세 스냅샷 최신성 | 상세 | 행 캐시(TTL 8s) + 만료 행도 1회 반환 + 인스턴스 메모리 무효화 | `store_order_detail_snapshot` 행 | 상태 변경 직후 구 상태 노출 가능 | 실측 불가 | NOT_PROVEN (NTF-04) | `lib/stores/store-order-detail-snapshot.ts:90-91,260-275`, `store-order-detail-snapshot-cache.ts:7,27-45`, `store-order-detail-snapshot-refresh.ts:20-30` |
| 배달 주체 | — | 오너 상태 버튼 + 라이더 API(존재) + 외부배달 웹훅 | `delivery_riders` 0행, `store_order_deliveries` 2행 | **실질은 매장 자체배달(주문상태만)** | — | 판정: 라이더 기능 미운영 (DLV-01) | 집계 SQL |
| 배달 상태 ↔ 주문 상태 동기화 | — | 별도 상태기계, 서로 갱신 안 함 | delivery_status CHECK 없음 | 배달 `delivered` 인데 주문 미완료 1건 | 1건 | FAIL (DLV-02) | `store-order-delivery-service.ts:587-665`, 집계 SQL |
| 배달 증빙(POD) | 관리자 서명 URL | 라이더 응답만 경로 제거 | `delivery-proofs` 비공개 | 구매자·오너 응답엔 경로·`admin_note` 그대로 | 0건 | FAIL(경미, DLV-04) | `lib/stores/delivery-proof-admin-view.ts:11-20`, `store-order-detail-snapshot-assemble.ts:38-51` |
| 실시간 위치 추적 | 없음(구매자) | 라이더 위치 POST 만 | — | — | 라이더 0 | 누락 | `app/api/me/rider/location/route.ts` |
| 주문 채팅 생성·권한 | 구매자/오너 진입 | 구매자·오너 외 403, 주문 소유 확인 | 방 식별키 `store_order:<id>` | 취소 후 구매자 채팅 비활성 | 메시지 알림 이벤트 존재 | PASS | `store-order-chat-service.ts:445-470`, `app/api/me/store-orders/[orderId]/ensure-chat/route.ts:37-46` |
| 상태별 구매자 알림 | — | 상태마다 1회(dedupe) | `notification_events` | 자동완료·결제실패 문구가 「매장 처리」로 표시 | — | FAIL(경미, NTF-02) | `notify-store-commerce.ts:528-536,588-660,810` |
| 알림 딥링크 | — | 오너: `/stores/owner/orders?order_id=` + 목록 외 주문 단건 보강 · 구매자: `/orders?expand=` | — | 정상 | — | PASS | `owner-store-order-notification-href.ts`, `OwnerStoreOrdersView.tsx:669-737` |
| IDOR | — | 구매자 `buyer_user_id` 필터, 오너 `store_id`+소유 확인, 이벤트 소유 확인, 라이더 배정 확인 | RLS SELECT 정책 | 주문 존재 여부 노출(404/403) 1곳 | — | PASS (경미 ORD-10) | 각 라우트; `lib/business/load-owner-store-order-context.ts:24-40` |
| PII (구매자 주소·전화) | 오너 화면 | 완료·취소 후에도 무기한 반환 | RLS 로 오너가 직접 SELECT 가능 | — | 30일 경과 종료 주문 638건에 전화 보존 | 정책 결정 필요 (ORD-08) | `get_owner_store_orders_list_snapshot` 원문, pg_policies |
| 내부 필드 노출 | — | 오너 목록에 `admin_note`·`dispute_status` 포함 | RLS 컬럼 제한 없음 → 구매자도 Realtime/직접 SELECT 로 `commission_base_amount` 등 수신 | — | `admin_note` 현재 0건 | FAIL(잠재, ORD-07) | RPC 원문, `lib/stores/buyer-store-order-money.ts:15-33`, grants |
| 수수료 부과 (교차) | — | TS 는 트리거에 위임 | **트리거 비활성** | 조리 진입해도 수수료 미부과 | 09-21 주 조리 진입 2건 의무 0 | FAIL (ORD-01) | pg_trigger `tgenabled='D'`, `apply-store-order-status-transition.ts:441-442` |

판정 합계: PASS 13 · FAIL 14(부분 포함) · NOT_PROVEN 4 · 누락 3

---

## 3. 결함 목록

### ORD-01 · 수수료 부과 트리거 운영 비활성 (교차 도메인: 정산)
- **영역**: 주문 상태 전이 → 수수료(DB)
- **증상**: 주문이 조리 이후 상태로 넘어가도 `store_sale_fee_obligations` 가 생기지 않는다.
- **원인**: 운영 `pg_trigger` 조회 결과 `trg_store_orders_commission_lifecycle` 의 `tgenabled = 'D'`(비활성). 저장소 마이그레이션 `supabase/migrations/20270510120000_store_commission_cash_ssot.sql:657-660` 은 `CREATE TRIGGER` 만 하고, 이를 끄는 마이그레이션은 저장소에 없음(grep 0건) → 운영에서 수동으로 비활성화된 것으로 보임. TS 는 수수료를 트리거에 맡김(`lib/stores/apply-store-order-status-transition.ts:441-442`).
- **운영 증거**: `store_order_events` 기준 2026-09-21 주에 `preparing` 진입 2건·`ready_for_pickup` 1건 → 의무 행 0. 같은 기간 이전(08-31 주)에는 14건 중 8건 의무 존재.
- **영향**: 금전 — 플랫폼 수수료 미징수, 취소·환불 시 검토 플래그 미생성. 관리자 개입 확인 문구(「수수료 검토로 넘어갑니다」, `admin-store-order-intervention-contract.ts:69`)가 사실과 다름.
- **심각도**: **P0**
- **현행 동작**: 상태는 바뀌고 수수료는 기록되지 않음. 실패 알림도 없음.
- **기대 동작**: 조리 첫 진입 UPDATE 트랜잭션에서 1회 부과(`docs/store-commission-cash-settlement-ssot.md` §A).
- **수정 설계**: (1) 비활성화 시점·사유를 Owner 에게 확인. (2) 승인 시 `ALTER TABLE public.store_orders ENABLE TRIGGER trg_store_orders_commission_lifecycle;` 를 마이그레이션 파일로 남기고 운영 적용. (3) 비활성 기간 조리 진입 주문 목록은 SQL 로 만들고, 소급 부과 여부는 Owner 결정(자동 소급 금지). (4) `scripts/verify-schema-authority.mjs` 에 `tgenabled='O'` 확인 항목 추가.
- **연동 영향**: 매장 캐시 차감, 정산 원장, 현금 게이트(`trg_store_orders_cash_order_gate`). 정책 미설정 매장은 켠 직후 상태 변경이 409 로 거부될 수 있음(`STORE_COMMISSION_CHARGE_FAILED_ERROR`).
- **검증 방법**: `select tgenabled from pg_trigger where tgname='trg_store_orders_commission_lifecycle'` = 'O' · 다음 조리 진입 주문 1건의 의무 행 생성 확인.
- **Owner 승인 필요**: 운영 DB 트리거 활성화·소급 부과 여부.
- **증명 상태**: 비활성 상태는 DB 증거로 PROVEN. 비활성화한 사람·시점은 NOT_PROVEN(DB 감사 로그 필요). 정산 도메인 감사와 함께 처리할 것.

### ORD-02 · 자동 구매확정·접수 독촉 크론 미스케줄
- **영역**: 크론 / 주문 종료
- **증상**: 만기된 픽업·도착 주문이 자동 완료되지 않고, 미접수 주문 독촉 알림이 한 번도 나가지 않음.
- **원인**: `vercel.json` crons 12개에 `/api/cron/store-orders-auto-complete`·`/api/cron/store-order-accept-reminders` 없음. 운영 DB 에 `cron` 스키마 없음(pg_cron 미사용). GitHub Actions 등 다른 호출부 grep 0건(`scripts/verify-test-production-isolation-p0.mjs` 목록에만 등장). `docs/dibay-delivery-product-hard-lock.md:43` 도 크론 HTTP 경로를 「NOT_RUN」으로 기록.
- **운영 증거**: `auto_complete_at < now()` 인 `ready_for_pickup`(픽업) 1건, 만기 2026-10-01. SYSTEM 완료 이벤트는 전체 1건(2026-08-07). `system_note`(독촉) 이벤트 0건.
- **영향**: 주문자(완료·리뷰 지연), 매장(완료 매출 인식·통화 인식 지연), 관리자(진행 중 건수 과대).
- **심각도**: **P1**
- **기대 동작**: 만기 시 SYSTEM 이 `completed` 로 전이. 접수 지연 시 30/60초 독촉.
- **수정 설계**: `vercel.json` crons 에 `{"path":"/api/cron/store-orders-auto-complete","schedule":"*/10 * * * *"}`, `{"path":"/api/cron/store-order-accept-reminders","schedule":"* * * * *"}` 추가. 두 라우트는 이미 `CRON_SECRET` 인증과 SYSTEM CAS(`requireAutoCompleteDue`)를 가짐. 1분 독촉이 Vercel 요금제에서 불가하면 접수 독촉은 `notification_events` 발행 측 지연 큐로 옮김.
- **연동 영향**: 자동 완료 → `ensureStoreSettlementForCompletedOrder`, 통화 인식, 인기 투영, 구매자 알림. 만기 1건이 첫 실행에서 즉시 완료됨.
- **검증 방법**: 배포 후 감사 로그 `store_order.cron_auto_complete` 1건 이상, 만기 주문 0.
- **Owner 승인 필요**: 크론 등록(배포 설정 변경), 만기 주문 즉시 완료 허용.
- **증명 상태**: 미등록은 PROVEN. 실행 결과는 NOT_PROVEN.

### ORD-03 · 미접수 주문 자동 취소(타임아웃)·SLA 스캔 부재
- **영역**: 주문 수명주기
- **증상**: `pending` 54건이 1시간 이상 방치(최고 2026-07-07). `delivering` 10건(최근 갱신 08-21), `accepted` 11건(08-21) 등 장기 정체.
- **원인**: 대기 주문을 끝내는 SYSTEM 경로가 결제 실패(`payment_failure`) 외에 없음(`order-status-transitions.ts:433-449`). SLA 스캔 함수 `scan_store_order_sla_warnings` 은 pg_cron 으로 등록하도록 작성됐으나(`supabase/migrations/20260516120000_delivery_operations_recovery_center.sql:541-547`) 운영 DB 에 cron 확장이 없음 → `sla_warning_level` 이 설정된 주문 0건.
- **영향**: 주문자가 무기한 대기. 매장 대기 건수·관리자 지연 경보가 실제를 반영하지 못함.
- **심각도**: **P1**
- **기대 동작**: 접수 제한시간 경과 시 자동 취소(+구매자 알림·재고·쿠폰 복원), 단계별 SLA 경고.
- **수정 설계**: (1) `allowedOrderTransitionsForActor` SYSTEM 에 `systemPurpose:"accept_timeout"` (pending→cancelled) 추가. (2) 새 크론이 `created_at < now()-<Owner 정한 분>` 인 pending 을 `applyStoreOrderStatusTransition`(SYSTEM, CAS) 로 취소 — 기존 복원 체인 그대로 사용. (3) SLA 스캔은 Vercel 크론 라우트에서 RPC 호출. 기존 정체 54건은 자동 처리하지 않고 목록만 Owner 에게 제출.
- **연동 영향**: 재고·쿠폰·상품권 복원, 오너 배지·카운트, 관리자 큐.
- **검증 방법**: 단위테스트(전이 그래프) + 운영 적용 후 신규 pending 만 제한시간 뒤 취소되는지 확인.
- **Owner 승인 필요**: 제한시간 값, 기존 정체 주문 처리 방식.
- **증명 상태**: 기능 부재·정체 건수 PROVEN.

### ORD-04 · 관리자 개입: 기대 상태를 CAS 로 쓰지 않음 (경합 시 더 새로운 상태 위에 적용)
- **영역**: 관리자 개입 / 동시성
- **증상**: 관리자 「취소요청 승인」과 매장 「취소요청 반려」가 거의 동시에 들어오면 매장이 반려해 `accepted` 로 돌아간 주문이 관리자 경로에서 다시 `cancelled` 로 바뀔 수 있다. 「강제취소」도 확인 시점 이후 진행된 상태 위에서 실행된다.
- **원인**: `lib/stores/admin-store-order-intervention.ts:101-107` 은 읽은 값과 `expected_status` 만 비교. 이후 `adminForceCancelStoreOrder`(`apply-admin-store-order-operations.ts:41-68`)·`adminApproveStoreOrderCancelRequest`(`:125-168`)·`adminSetRefundRequestedStoreOrder`(`:80-122`)·`adminCompleteRefundStoreOrder`(`:382-428`)·`adminRejectRefundStoreOrder`(`:459-475`) 가 주문을 **다시 읽고** `applyStoreOrderStatusTransition` 을 `expectedCurrentStatus` 없이 호출 → CAS 대상이 새로 읽은 상태. ADMIN 그래프는 진행 중 거의 모든 상태에서 `cancelled` 허용(`order-status-transitions.ts:427-431`). 문서 `docs/admin-store-orders-read-ssot.md` §5-5 「주문 상태 CAS + expected_status 로 한 쪽만 성공」과 불일치.
- **영향**: 주문자(매장이 반려한 주문이 취소됨), 매장(조리 중 주문 취소·수수료 검토), 관리자 감사로그의 `before_json` 이 실제 직전 상태와 다를 수 있음.
- **심각도**: **P2** (경합 창은 수십 ms, 운영 재현 증거 없음)
- **기대 동작**: 관리자가 본 상태가 아닌 상태에서는 409 `status_changed`.
- **수정 설계**: `runAdminStoreOrderIntervention` 이 `expected` 를 각 ops 함수에 인자로 넘기고, ops 함수는 `applyStoreOrderStatusTransition({ ..., expectedCurrentStatus: expected })` 로 호출. `adminApproveStoreOrderCancelRequest` 는 `adminForceCancelStoreOrder` 대신 `cancel_requested` 기대값으로 직접 적용. 409 는 `status_changed` 로 매핑.
- **연동 영향**: 레거시 410 경로는 영향 없음. 관리자 화면 재조회 흐름은 이미 409 처리.
- **검증 방법**: `lib/admin/store-orders/__tests__/admin-store-order-intervention.test.ts` 에 「확인 후 상태 변경 → 409」 케이스 추가.
- **Owner 승인 필요**: 없음(구현 지시 시).
- **증명 상태**: 코드 경로 PROVEN, 운영 발생은 NOT_PROVEN.

### ORD-05 · 오너 주문 목록이 최근 60건 고정 — 처리 대기 주문 비노출
- **영역**: 오너 목록 / 검색·필터·페이지
- **증상**: 매장별 61번째 이후 주문은 목록·탭에서 보이지 않는다. 검색·기간·상태 조회·「더 보기」 없음.
- **원인**: API 가 `tryLoadOwnerStoreOrdersListFromSnapshot(sb, id, userId, { forceRpc })` 만 호출해 status·cursor 를 넘기지 않음(`app/api/me/stores/[storeId]/orders/route.ts:211-215`). 기본 한도 60(`lib/delivery/owner/owner-store-orders-list-snapshot-counter.ts:9`). 클라는 `?fresh=1` 외 파라미터 없음(`lib/stores/fetch-store-orders-list-deduped.ts:38-40`). RPC 자체는 status·cursor·`next_cursor` 를 지원(배포 원문)하나 응답에서 버림.
- **운영 증거**: 60건 초과 매장 7곳(최대 144건). 61번째 이후 종료되지 않은 주문 **65건**: `pending` 29, `cancel_requested` 18, `delivering` 6, `accepted` 6, `ready_for_pickup` 4, `preparing` 1, `refund_requested` 1. 문서(`docs/store-order-cancel-refund-decision-ssot.md` §1 D2)는 레거시 요청 53건을 매장이 「같은 화면에서」 결정한다고 하나 그중 18건은 목록에 안 나옴.
- **영향**: 매장이 결정해야 할 요청·진행 주문을 찾지 못함(알림 딥링크로만 접근 가능 — `OwnerStoreOrdersView.tsx:669-737` 단건 보강).
- **심각도**: **P1**
- **기대 동작**: 상태 탭별 서버 조회 + 커서 페이지네이션 + 주문번호·기간 검색. 처리 대기 상태는 기간과 무관하게 전부 노출.
- **수정 설계**: API 에 `status`, `cursor`, `q`(주문번호), `from/to` 쿼리 추가 → RPC `p_status`/`p_cursor` 전달, 응답에 `next_cursor` 포함. 모바일 탭 「신규」「취소」는 상태 목록을 서버 필터로 조회(배열 상태 필터는 RPC 인자 확장 필요). 클라 「더 보기」 버튼. 스냅샷 캐시 키에 이미 status·cursor 포함(`owner-store-orders-list-snapshot.ts:59,123`).
- **연동 영향**: 실시간 INSERT 패치·딥링크 보강·배지 카운트(별도 RPC)·r2-d1 성능 계약(`docs/r2-d1-owner-orders-analysis.md`) — 단일 비행 키 유지 필요.
- **검증 방법**: 61번째 이후 `cancel_requested` 주문이 「취소」 탭에서 보이는지, 페이지 경계 중복·누락 0.
- **Owner 승인 필요**: 없음(구현 지시 시). 성능 민감 변경이므로 `verify:parity-gates` 대상.
- **증명 상태**: PROVEN (코드 + 집계 SQL). 화면 확인은 NOT_PROVEN.

### ORD-06 · 오너 직접 취소·결정의 원장 쓰기가 상태 변경과 별도 트랜잭션
- **영역**: 취소 원장 / 사유 기록
- **증상**: 취소는 성공했는데 `store_order_cancel_requests` 원장 행(사유)이 없을 수 있다. 결정 시 원장 `pending` 행이 그대로 남을 수 있다.
- **원인**: 직접 취소는 상태 전이 후 INSERT, 실패 시 `console.error` 만(`app/api/me/stores/[storeId]/orders/[orderId]/cancel-request/route.ts:105-117`). 결정 승인·반려도 상태 전이 후 UPDATE, 실패 시 로그만(`lib/stores/owner-store-order-decision.ts:107-117,135-145`). 관리자 승인도 같음(`apply-admin-store-order-operations.ts:153-165`). 구매자 요청만 DB 함수로 원자화(문서 D1).
- **영향**: 매장 취소 사유 유실 → 분쟁 시 근거 없음. 원장에 `pending` 이 남으면 같은 주문의 다음 구매자 요청이 `idx_store_order_cancel_requests_one_pending` 유니크로 `cancel_request_pending` 409.
- **심각도**: **P2**
- **기대 동작**: 상태 전이와 원장 쓰기가 한 트랜잭션.
- **수정 설계**: `store_order_owner_cancel_atomic(p_order_id, p_store_id, p_owner_user_id, p_expected_status, p_reason, p_detail)` — 배달 행 `FOR SHARE` → 주문 `FOR UPDATE` → 픽업·잠금·기대상태 확인 → 원장 INSERT(approved) + 상태 UPDATE. 결정용 `store_order_cancel_request_decide_atomic` 도 같은 방식. TS 는 성공 후 기존 부수효과(재고·쿠폰·상품권·알림) 실행. 수수료 트리거는 같은 UPDATE 에서 동작.
- **연동 영향**: `applyStoreOrderStatusTransition` 의 CUSTOMER 분기와 같은 패턴. 수수료 트리거(ORD-01) 활성 후 함께 검증.
- **검증 방법**: 원장 INSERT 강제 실패(제약 위반) 시 상태도 롤백되는지 DB 테스트.
- **Owner 승인 필요**: 운영 DB 함수 적용.
- **증명 상태**: 코드 PROVEN. 운영 유실 건수는 NOT_PROVEN — 확인 SQL: 오너가 `preparing` 이후에서 취소한 이벤트 중 같은 주문의 `requested_role='owner'` 원장 없는 건 수.

### ORD-07 · 내부 필드(`admin_note` 등) 오너·구매자 노출 경로
- **영역**: 권한 / 정보 노출
- **증상**: (a) 오너 목록 RPC 응답에 `admin_note`, `admin_flagged`, `dispute_status`, `needs_admin_attention` 포함, 오너 상세 스냅샷은 `to_jsonb(o.*)` 전체. (b) 구매자 상세는 TS 에서 내부 필드를 제거하지만(`lib/stores/buyer-store-order-money.ts:15-33`) RLS `store_orders_buyer_select` 가 전체 컬럼 SELECT 를 허용하고 Realtime 발행 대상이라 구매자 세션으로 `commission_base_amount`, `store_funded_amount`, `admin_note` 를 직접 받을 수 있음. (c) 배달 행 `admin_note` 가 구매자(`sanitizeBuyerDeliveryPublic` 은 수령인 이름만 가림, `store-order-detail-snapshot-assemble.ts:38-51`)·오너에게 그대로 전달.
- **원인**: `get_owner_store_orders_list_snapshot` 원문(admin_note 선택), `get_owner_store_order_detail_snapshot`·`get_buyer_store_order_detail_snapshot` 의 `to_jsonb(o.*)`·`to_jsonb(d.*)`, 테이블 단위 SELECT 권한(`authenticated:SELECT`).
- **운영 증거**: `admin_note` 가 있는 주문 0건 → 현재는 잠재 결함.
- **영향**: 관리자 내부 메모·분쟁 상태·수수료 기준액이 매장/구매자에게 노출될 수 있음.
- **심각도**: **P2**
- **수정 설계**: (1) 오너 목록 RPC 에서 `admin_note` 제외(오너에게 필요한 `admin_locked` 만 유지). (2) 스냅샷 함수는 명시 컬럼 목록으로 변경. (3) 배달 행은 구매자·오너 응답에 `stripDeliveryProofStorageFromClientRow` + `admin_note`·실패좌표 제거. (4) 장기: 구매자·오너용 보안 뷰(필요 컬럼만)로 Realtime·직접 SELECT 대체, `store_orders` 직접 SELECT 정책은 내부 컬럼을 포함하지 않는 뷰로 이전(컬럼 권한 `REVOKE SELECT(admin_note, …)` 는 Realtime 동작 영향 검증 필요).
- **연동 영향**: Realtime 행 패치 매핑(`lib/business/owner-store-order-delivery-row-rt.ts:29`), 오너 목록 타입(`owner-store-order-list-row-bridge.ts:49,71`).
- **검증 방법**: 오너 세션 응답 JSON 에 `admin_note` 키 부재, 구매자 JWT 로 `select admin_note from store_orders` 가 거부되는지.
- **Owner 승인 필요**: RLS·권한 변경(운영 DB).
- **증명 상태**: 코드·정책 PROVEN, 실제 노출 데이터 0건.

### ORD-08 · 종료 주문의 구매자 전화·주소가 오너에게 무기한 노출
- **영역**: PII
- **증상**: 완료·취소·환불 후에도 오너 목록·상세·Realtime·직접 SELECT 로 `buyer_phone`, 배송 주소·좌표가 계속 보인다.
- **원인**: 오너 목록 RPC 가 상태와 무관하게 `buyer_phone`, `delivery_*`, `delivery_latitude/longitude` 반환(배포 원문). RLS `store_orders_owner_select` 가 전체 행·컬럼 허용.
- **운영 증거**: 생성 30일 경과 종료 주문 중 전화번호 보존 638건.
- **영향**: 구매자 개인정보 과다 보존·노출(필리핀 Data Privacy Act 최소 보존 원칙).
- **심각도**: **P2** (정책 결정 필요)
- **수정 설계**: 종료 후 N일(Owner 결정) 지나면 오너 응답에서 전화 마스킹(`09******12`)·주소는 시/구까지만. RPC·스냅샷 함수에서 `CASE WHEN order_status IN (종료) AND updated_at < now()-N THEN mask(...)`. 직접 SELECT 는 ORD-07 의 뷰 전환과 함께.
- **연동 영향**: 오너 리뷰 응답·재주문 CS(전화 필요 시 플랫폼 경유).
- **검증 방법**: 기준일 이전 종료 주문의 오너 응답이 마스킹 값인지.
- **Owner 승인 필요**: 보존 기간·마스킹 범위.
- **증명 상태**: 코드·집계 PROVEN.

### ORD-09 · 오너가 취소한 사유가 구매자에게 전달되지 않음
- **영역**: 알림 / 업무 일관성
- **증상**: 매장이 조리 중 직접 취소해도 구매자 알림·채팅·주문 이벤트에 사유가 없다.
- **원인**: 직접 취소는 사유를 원장에만 기록하고 `applyStoreOrderStatusTransition` 에 `eventMessage`/`eventMetadata` 로 넘기지 않음(`cancel-request/route.ts:87-100`). 구매자 알림 문구는 고정(`notify-store-commerce.ts:576-580`). 구매자 API 는 원장을 읽지 않음(`store_order_cancel_requests` 참조 파일 5개 중 구매자 경로 0).
- **영향**: 구매자 문의 증가, 분쟁.
- **심각도**: **P2**
- **수정 설계**: `eventMetadata: { source: "owner_direct_cancel", cancel_reason }` 전달 → `notifyBuyerStoreOrderOwnerStatus` 에 사유 인자 추가(반려 알림과 같은 방식). 구매자 이벤트 필터(`isStoreOrderEventVisibleToBuyer`)에서 노출 허용 키 지정.
- **검증 방법**: 오너 취소 후 구매자 알림 본문에 사유 포함.
- **Owner 승인 필요**: 매장 사유를 구매자에게 그대로 보여줄지(문구 정책).
- **증명 상태**: PROVEN.

### ORD-10 · 주문 존재 여부 노출 (오너 컨텍스트)
- **영역**: IDOR
- **증상**: `GET /api/me/owner-store-order-context?order_id=` 가 없는 주문 404, 남의 주문 403 → 주문 ID 존재 확인 가능.
- **원인**: `lib/business/load-owner-store-order-context.ts:24-40`, `app/api/me/owner-store-order-context/route.ts:27-29`.
- **영향**: UUID 추측이 사실상 불가해 실질 위험 낮음. 데이터 자체는 노출 없음.
- **심각도**: **P3**
- **수정 설계**: 둘 다 404 로 통일.
- **증명 상태**: PROVEN.

### ORD-11 · 멱등 재응답이 저장값이 아닌 이번 요청 계산값을 반환
- **영역**: 주문 생성 응답
- **원인**: `app/api/me/store-orders/route.ts:828-844` — `total_amount`, `discount_amount`, `amount_before_gift` 를 이번 요청 계산값으로 반환(주문 ID·결제액만 DB 값). 재시도 사이 가격·쿠폰이 바뀌면 화면 금액이 실제 주문과 다를 수 있음. 또 멱등 재응답에서도 쿠폰 표시 스냅샷 UPDATE 를 다시 실행(`:788-826`).
- **심각도**: **P3**
- **수정 설계**: RPC 멱등 응답에 저장된 금액 컬럼을 포함시켜 그대로 반환하고, 멱등 시 후처리 생략.
- **증명 상태**: 코드 PROVEN.

### DLV-01 · 라이더 배달 체계는 코드만 있고 운영되지 않음 (배달 주체 = 매장 자체배달)
- **영역**: 배달 주체
- **사실 확인**: 라이더 계정 테이블 `delivery_riders` **0행**, `store_order_deliveries` **2행**(모두 `delivered`). 배달 상태 6종(`waiting_rider → rider_assigned → pickup_in_progress → delivering → delivered / delivery_failed`, `lib/stores/store-order-delivery-status.ts:1-35`), 라이더 API·POD 업로드·위치 POST 존재. 구매자 실시간 위치 추적 UI 없음.
- **실제 운영**: 배달 주문 639건의 진행은 오너가 주문 상태(`ready_for_pickup→delivering→(arrived)→completed`)를 직접 바꾸는 방식. 외부배달 웹훅(`app/api/webhooks/external-delivery/route.ts`)은 시크릿 인증 + SYSTEM 전이.
- **문서 차이**: `docs/admin/dibay-admin-delivery-ops-audit-design.md:65` 는 라이더 메뉴를 「정상·유지」로 표기 — 운영 데이터 0.
- **심각도**: **P2** (기능 미운영 상태가 관리자 메뉴·문서에 「정상」으로 표시)
- **수정 설계**: 결정 전까지 관리자 라이더·배차 메뉴에 「미운영(라이더 0)」 표시. 라이더 도입 시 DLV-02 동기화 선행.
- **Owner 승인 필요**: 배달 주체 정책(매장 자체배달 단일 vs 플랫폼 라이더 도입).
- **증명 상태**: PROVEN.

### DLV-02 · 배달 상태와 주문 상태가 서로 동기화되지 않음
- **영역**: 배달 상태 ↔ 주문 상태
- **증상**: 배달 행이 `delivered` 인데 주문이 미완료인 건 1건(운영). 반대로 주문 취소 시 배달 행은 그대로.
- **원인**: 오너 배달 패치(`store-order-delivery-service.ts:587-665`)·라이더 패치(`:886-`)는 `store_order_deliveries` 만 갱신, 주문 상태 전이 없음. 주문 전이(`apply-store-order-status-transition.ts`)는 배달 행을 건드리지 않음. 오너는 POD 없이 `delivered` 설정 가능(`:621-623`). 오너 배달 UPDATE 는 직전 상태 CAS 없음(라이더는 `.eq("delivery_status", prev)` 있음). `store_order_deliveries.delivery_status` 에 CHECK 제약 없음(pg_constraint).
- **영향**: 구매자·오너·관리자 화면의 배달 진행 표시 불일치. 오너 직접 취소의 「픽업 이후 차단」은 TS 사전 조회뿐이라 픽업과 동시 실행 시 우회 가능(구매자 요청은 DB 함수로 막힘).
- **심각도**: **P2**
- **수정 설계**: (1) `delivered` 전이 시 주문을 `arrived`(배달) 로 SYSTEM 전이 → 자동완료 타이머 시작. (2) 주문 `cancelled/refunded` 시 열린 배달 행을 `delivery_failed`(사유 `order_cancelled`) 로 닫음. (3) `delivery_status` CHECK 추가. (4) 오너 직접 취소를 ORD-06 DB 함수로 옮겨 픽업 확인을 잠금 아래에서 수행.
- **검증 방법**: 상태 조합 불일치 SQL 0건.
- **Owner 승인 필요**: 운영 DB 제약 추가.
- **증명 상태**: PROVEN(코드 + 1건).

### DLV-03 · 배달 진행 중 주문의 장기 정체
- `delivering` 10건(최근 갱신 2026-08-21)·`ready_for_pickup` 7건이 종료되지 않음. 배달 완료 정책 A(`delivering → completed` 1탭)는 자동완료 타이머가 `arrived` 에서만 시작(`apply-store-order-status-transition.ts:227-231`)하므로 오너가 완료를 누르지 않으면 영구 정체. **P2**. 설계: ORD-02 크론 + `delivering` 상태 N시간 경과 시 오너 독촉/관리자 큐 편입(SLA 스캔).

### DLV-04 · 배달 증빙 저장 경로가 구매자·오너 응답에 포함
- 라이더 응답만 `stripDeliveryProofStorageFromClientRow` 적용(`app/api/me/rider/orders/route.ts:54`, `[orderId]/route.ts:82,148`). 구매자 상세(`sanitizeBuyerDeliveryPublic`)·오너 상세 스냅샷(`to_jsonb(d.*)`)은 `delivered_proof_image_path`, `failure_proof_*`, 증빙 좌표 포함. 버킷 `delivery-proofs` 는 비공개라 경로만으로 열람 불가. **P3**. 설계: 두 응답에 같은 strip 적용, 증빙 열람은 서명 URL API 로.

### NTF-01 · 접수 독촉 알림 미발송 — ORD-02 와 동일 원인 (P1 은 ORD-02 로 계산)

### NTF-02 · 시스템 처리 결과를 「매장이 처리」 문구로 알림
- 자동 구매확정(SYSTEM)·결제 실패 취소(SYSTEM)도 `notifyBuyerStoreOrderOwnerStatus` 로 전송되어 매장 처리 문구가 나간다. ADMIN 취소만 별도 문구(`notify-store-commerce.ts:612-618`). 전용 함수 `notifyBuyerStoreOrderAutoCompleted`(`:810`)는 호출부 0(사용되지 않음). 결제 실패는 `record-store-order-payment.ts:399-408` 의 실패 알림과 중복 가능. **P3**. 설계: `actor==="SYSTEM"` 이면 `systemPurpose` 별 전용 알림 함수로 분기.

### NTF-03 · 수락 알림에 조리 예상시간 미포함
- `notifyBuyerStoreOrderOwnerStatus` 는 `estimatedPrepMinutes` 를 받으면 ETA 를 붙이지만(`notify-store-commerce.ts:619-628`) 호출부가 넘기지 않음(`apply-store-order-status-transition.ts:684-702`). **P3**. 설계: `updatePayload.estimated_prep_minutes` 를 전달.

### NTF-04 · 구매자 상세 스냅샷이 상태 변경 직후 구 상태를 반환할 수 있음
- 무효화 표시는 인스턴스 메모리 `Set`(`store-order-detail-snapshot-cache.ts:7`), 재생성은 응답 후 대기 없는 비동기(`store-order-detail-snapshot-refresh.ts:20-30`, `after()` 미사용), 행 캐시가 만료돼도 1회는 구 페이로드를 반환(`store-order-detail-snapshot.ts:260-269`). 다른 인스턴스에서 들어온 요청은 최대 TTL(기본 8초) + 1회 구 상태를 볼 수 있음. 구매자 Realtime 이 재조회해도 같은 행을 받을 수 있음. **P2**, 증명 NOT_PROVEN(런타임 재현 필요). 설계: 상태 전이 직후 `store_order_detail_snapshot` 행을 동기 삭제(또는 `updated_at` 을 과거로)하고, 만료 행은 반환하지 않고 RPC 재조회.

### NTF-05 · 동시 환불 승인 시 부수효과 2회 실행
- 두 번째 호출에서 `gift_certificate_refund_order_atomic` 이 `idempotent:true` 로 성공을 반환하면 TS 가 이를 구분하지 않고 재고·결제·정산조정·코인 회수·쿠폰 복원·이벤트·알림을 다시 실행(`apply-store-order-status-transition.ts:307-316,406-439`). 재고(`store_order_stock_restore_claims`)·쿠폰(상태 확인)·이벤트(dedupe 유니크)·코인(멱등키)은 멱등이라 금전 중복은 확인되지 않음. **P3**. 설계: `refundRow.idempotent === true` 이면 `{ok:true, idempotent:true}` 로 즉시 반환.

---

## 4. 누락 기능 (배민·요기요·쿠팡이츠 대비 — 설계 제안, 결함 아님)

| # | 기능 | 현황 | 제안 |
|---|---|---|---|
| M1 | 접수 제한시간·자동 거절 | 없음 (ORD-03) | 매장별 3~10분 설정, SYSTEM 자동취소 + 매장 경고 누적 |
| M2 | 수락 후 조리시간 연장·지연 안내 | 수락 시 1회만 (`apply-store-order-status-transition.ts:180-186`) | `PATCH …/eta` (+분, 사유) → 구매자 알림 |
| M3 | 거절 사유 선택지 (재료 소진·영업 종료 등) | 자유 입력 | 사유 코드 + 자동 품절 처리 연동 |
| M4 | 부분 취소·품목 변경 | 정책상 미지원 (`partialRefundSupported:false`) | 품목 단위 취소 + 재계산 (정산·쿠폰 연동 설계 필요) |
| M5 | 주문 검색·기간 조회·엑셀 | 없음 (ORD-05) | 주문번호·전화 뒤 4자리·기간 검색, CSV |
| M6 | 주문서 출력(영수증 프린터) | 확인 안 됨 | 접수 시 자동 출력 옵션 |
| M7 | 직원(서브) 계정 | 오너 1인만 (`owner-product-gate.ts:26`) | 매장 직원 역할(주문 처리만) |
| M8 | 라이더 배차·실시간 위치 | 코드 있음, 운영 0 (DLV-01) | 정책 결정 후 활성 |
| M9 | 영업 일시정지(바쁨 모드) | `is_open` 토글만 | 30/60분 일시정지 + 예상 조리시간 일괄 상향 |
| M10 | 고객 전화 안심번호 | 실번호 노출 (ORD-08) | 중계번호 또는 앱 통화 |
| M11 | 신규주문 미확인 시 반복 알림음 | 독촉 크론 미가동 | ORD-02 해결 후 확인 |

---

## 5. SSOT 표

| 데이터 | 권위 원천 | 이탈 소비자 |
|---|---|---|
| 주문 상태 | `store_orders.order_status` (쓰기: `applyStoreOrderStatusTransition`, DB 함수 3종) | 전이 규칙은 TS 만(DB 미강제). 관리자 ops 가 기대상태 미전달(ORD-04) |
| 전이 규칙 | `lib/stores/order-status-transitions.ts` `allowedOrderTransitionsForActor` | `store_order_buyer_cancel_request_atomic` 이 허용 상태를 SQL 에 중복 기재(`accepted…arrived`) — 현재 일치 |
| 배달 상태 | `store_order_deliveries.delivery_status` | 주문 상태와 별도 진행(DLV-02). CHECK 없음 |
| 취소 사유·요청자 | `store_order_cancel_requests` | 오너 직접 취소·결정은 비원자(ORD-06). 구매자 화면 미사용(ORD-09) |
| 관리자 개입 사유 | `audit_logs` `store_order.admin_intervention` | 일치 |
| 품목·옵션·가격 | `store_order_items` 스냅샷 | 3화면 모두 같은 테이블 — 일치 |
| 금액 | `total_amount`/`payment_amount`/`discount_amount` + `gift_certificate_redemptions` | 멱등 재응답 계산값(ORD-11). 불일치 26건은 기존 문서 |
| 완료 시각 | `store_order_events.order_completed` | 완료 519 vs 이벤트 516(완료 기록 없음 10건 — 기존 문서) |
| 수수료 | DB 트리거 `trg_store_orders_commission_lifecycle` | **운영 비활성** (ORD-01) |
| 오너 대기 건수 | `get_owner_store_ops_dashboard_snapshot` | 목록은 최근 60건만 → 배지 숫자 ≠ 목록 행(ORD-05) |
| 구매자 상세 | `get_store_order_detail_snapshot` → 행 캐시 | 캐시 최신성(NTF-04) |
| 알림 | `notification_events` (dedupe 키) | 자동완료·결제실패 문구(NTF-02) |
| 주문 채팅 방 | `community_messenger_rooms.domain_identity_key = store_order:<id>` + `store_orders.community_messenger_room_id` | 일치 |

---

## 6. 기존 문서와 구현 차이

| 문서 | 문서 내용 | 구현/운영 |
|---|---|---|
| `docs/admin-store-orders-read-ssot.md` §5 레거시 행 | 레거시 `PATCH /[orderId]`·`POST /approve-refund` 는 개입 서비스로 **위임** | 410 Gone (`app/api/admin/store-orders/[orderId]/route.ts:8`, `approve-refund/route.ts:2`, `admin-legacy-order-write-gate.ts`) — 문서 갱신 필요 |
| 같은 문서 §5-5 | 「주문 상태 CAS + expected_status 로 한 쪽만 성공」 | 관리자 쪽 기대상태가 CAS 에 안 들어감 (ORD-04) |
| `docs/store-order-cancel-refund-decision-ssot.md` §1 D2 | 레거시 매장 요청 53건을 매장이 같은 화면에서 결정 | 18건은 60건 한도 밖이라 목록에 없음 (ORD-05) |
| 같은 문서 §2 | 직접 취소 시 「승인된 원장 행 기록」 | 원장 쓰기가 실패해도 취소 성공 (ORD-06) |
| `docs/store-commission-cash-settlement-ssot.md` §A·표 352행 | 부과·플래그 = 상태 UPDATE 트리거(런타임 권위) | 운영 트리거 비활성 (ORD-01) |
| `docs/admin/dibay-admin-delivery-ops-audit-design.md:65` | 라이더 메뉴 「정상·유지」 | `delivery_riders` 0행 (DLV-01) |
| `docs/admin/dibay-admin-delivery-ops-audit-design.md:126` | 수수료 트리거로 조리 진입 시 1회 부과 | 비활성 (ORD-01) |
| `docs/store-order-process-single-source.md` | 진실 원천 `order_status` + TS 전이 규칙 | 일치. 단 DB 강제 없음을 문서에 명시하지 않음 |
| `supabase/migrations/20260516120000_…recovery_center.sql:541-547` | SLA 스캔 pg_cron 등록 | 운영에 cron 스키마 없음 → 스캔 미실행 (ORD-03) |
| `docs/dibay-delivery-product-hard-lock.md:43` | 자동완료 크론 HTTP **NOT_RUN** | 현재도 스케줄 없음 — 문서는 정확, 후속 미처리 (ORD-02) |
| 과제 지시 | `lib/order-chat` | 디렉터리 없음 — 실제는 `lib/community-messenger/store-order-chat-service.ts` |

---

## 7. Owner 정책 결정 필요 사항

1. **수수료 트리거 재활성화와 비활성 기간 주문 소급 여부** (ORD-01) — 운영 DB 변경. 정책 미설정 매장은 활성 즉시 상태 변경이 409 로 막힐 수 있음.
2. **자동 구매확정·접수 독촉 크론 등록 주기** (ORD-02) — 만기 1건 즉시 완료 허용 여부.
3. **미접수 주문 제한시간과 기존 정체 주문(pending 54·delivering 10·accepted 11·cancel_requested 53) 처리** (ORD-03) — 자동 처리 금지 원칙 유지 시 목록 제출 후 개별 결정.
4. **종료 주문의 구매자 전화·주소 보존 기간·마스킹 범위** (ORD-08).
5. **매장 취소 사유를 구매자에게 원문 노출할지** (ORD-09).
6. **배달 주체 정책**: 매장 자체배달 단일 운영 확정(라이더 메뉴 숨김) vs 플랫폼 라이더 도입 (DLV-01). 도입 시 배달·주문 상태 동기화 규칙(DLV-02) 결정 — `delivered` 를 주문 `arrived` 로 볼지 `completed` 로 볼지.
7. **오너 목록 검색·페이지네이션 범위** (ORD-05) — 성능 계약(r2-d1) 재측정 필요.
8. **내부 필드 차단 방식** (ORD-07) — 보안 뷰 전환은 RLS·Realtime 구조 변경.
9. **QA 추정 단기 중복 주문 158쌍**(구매자 8명) 정리 여부 — 결함 판정 전 실제 사용자 여부 확인 필요(NOT_PROVEN).

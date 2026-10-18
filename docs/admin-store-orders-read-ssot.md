# 관리자 매장 주문 조회 SSOT (`/admin/store-orders`)

원칙: **매장 오너가 주문 처리의 주체**이고, 관리자는 전체 매장의 주문·완료·취소·환불·결제·수수료 정산 상태를 **조회·감독**한다. 이 화면은 주문을 대신 처리하는 도구가 아니다.

## 1. 단일 원천

| 표시 값 | 원천 | 비고 |
|---|---|---|
| 주문 상태 | `store_orders.order_status` | 오너가 쓰는 같은 컬럼. 라벨 = `admin_stores_orders_status_*` |
| 결제 상태 | `store_orders.payment_status` | 매장 직접 결제 모델 (`docs/store-commission-cash-settlement-ssot.md`) |
| 수수료 정산 상태 | `store_sale_fee_obligations` → `store_commission_row_state()` | 정산 원장(`store_commission_ledger_page`)과 **같은 SQL 함수** |
| 완료 일시 | `store_order_events.order_completed` | `store_orders` 에 `completed_at` 컬럼 없음 |
| 금액 | `total_amount`, `payment_amount` | 브라우저 계산 없음 |

- 조회 함수: `admin_store_orders_page` (`supabase/migrations/20270511120000_admin_store_orders_page.sql`) — 행 · 전체 건수 · 탭 건수를 **같은 WHERE** 로 한 번에 계산.
- 탭 상태 그룹·액션 큐 조건은 TS 계약(`lib/admin/store-orders/admin-store-orders-contract.ts`)에서 SQL 로 전달한다 (SQL 에 상태 목록을 다시 쓰지 않음, 테스트 고정).
- API: `GET /api/admin/store-orders/list` (no-store). CSV: `GET /api/admin/store-orders/export?view=list&…` (같은 함수, 같은 `as_of`).
- 기존 `GET /api/admin/store-orders` (limit 기반)는 배달 대시보드 등 기존 호출부용으로 유지.

## 2. 화면 계약

- 상단 현황 = 탭: 전체 / 진행 중(`pending`~`arrived`) / 주문 완료(`completed`) / 취소(`cancel_requested`,`cancelled`) / 환불 관련(`refund_requested`,`refunded`). 모든 상태는 정확히 한 탭에 속한다 → 탭 합 = 전체.
- 배송지도착(`arrived`)과 주문완료(`completed`)는 다른 상태로 표시.
- 검색: 매장명 · 주문번호 · 구매자(닉네임) · 기간(필리핀 시간 영업일, 정산 화면과 같은 `resolveStoreCommissionPeriod`) · 주문 상태 · 배달/픽업 · 결제 상태.
- 기존 딥링크 유지: `order_id`, `store_id`, `buyer_user_id`, `queue=admin_attention`, `order_status` → 해제 가능한 칩으로 표시.
- 목록: 주문번호 · 매장 · 주문 상품 요약 · 구매자 · 주문 금액(고객 결제액 병기) · 배달/픽업 · 주문 상태(+지연) · 결제 상태(+무결성 배지) · 수수료 정산 · 주문 일시 · 완료 일시 · 상세 보기. UUID·개발용 링크·체크박스·대량 삭제 없음.

## 3. CTA 계약

| CTA | 동작 |
|---|---|
| 조회 | 검색 조건 적용 → 1페이지, 새 스냅샷(`as_of`), 서버 재조회 |
| 새로고침 | 같은 조건·같은 페이지, 새 스냅샷, 서버 재조회 (클라이언트 캐시 없음) |
| 탭 | 해당 탭 1페이지, 새 스냅샷 |
| 페이지 이동 (처음/이전/번호/다음/끝) | 같은 `as_of` 유지 (보장 범위는 §3-1) |
| 조건 초기화 | 모든 조건·딥링크 해제 후 조회 |

- 진행 중에는 모든 조회 CTA 비활성(중복 요청 차단), 이전 요청은 abort.
- 실패 시 **직전 결과 유지** + 오류 표시 (0건으로 위장하지 않음). 함수 미배포는 별도 문구.
- 조회 시각(PHT) 표시. 자동 폴링 없음 (수동 새로고침 중심).
- 마지막 페이지를 넘는 페이지(그 사이 행이 줄어든 경우)는 마지막 페이지로 보정.

### 3-1. 페이지네이션 보장 범위와 한계 (정확한 정의)

`as_of` 는 **스냅샷이 아니다.** 함수는 매 요청마다 현재 테이블을 읽고, `created_at <= as_of` 로 **그 시각 이후 생성된 주문만** 제외한다. 상태·결제 상태 등 행 내용은 요청 시점 값이다.

정렬 키 `(created_at DESC, id DESC)` 는 코드·마이그레이션상 수정 경로가 없다 (DB 제약으로 강제되지는 않음). 주문 하드 삭제는 정책상 차단(410).

| 조건 | 페이지 간 중복·누락 |
|---|---|
| 신규 주문 유입 | **없음** (`as_of` 이후 생성분 제외) |
| 불변 필드만으로 거른 목록 — 전체 탭, 기간, 매장(`store_id`), 주문(`order_id`)·주문번호, 구매자(`buyer_user_id`), 배달/픽업 | **없음** (집합·순서가 요청 사이에 변하지 않음) |
| 가변 필드로 거른 목록 — 진행 중/완료/취소/환불 탭, 주문 상태, 결제 상태, 액션 큐(`needs_admin_attention`), 매장명·구매자 닉네임 검색(이름 변경 시) | **가능.** 예: 「진행 중」1페이지를 본 뒤 그 페이지의 주문 1건이 완료되면 2페이지 요청 시 행이 한 칸씩 당겨져 **1건 누락**. 반대로 앞 페이지 범위로 새로 들어온 행이 있으면 **1건 중복** |
| 탭 건수 | 각 요청 시점의 현재 값 (페이지를 넘길 때 바뀔 수 있음) |

화면 동작: 「조회」·「새로고침」·탭 클릭은 `as_of` 를 새로 받아 1페이지/현재 페이지를 다시 그린다. 가변 필터 목록에서 최신 상태를 정확히 보려면 새로고침한다.

완전한 일관성이 필요하면 (a) 이전/다음을 키셋(마지막 `(created_at,id)` 기준) 방식으로 바꿔 **밀림에 의한 중복·누락**을 없애거나 (상태가 바뀐 행 자체의 출입은 남음), (b) 조회 시점 ID 목록을 서버에 보관하는 스냅샷 방식이 필요하다 — 미구현, OWNER 결정 사항.

## 4. 무결성 표시 (보정하지 않음)

| 배지 | 조건 | 운영 현황 (2026-10-17 조회) |
|---|---|---|
| 결제 상태 불일치 | `cancelled` 인데 결제 `cancelled/failed` 아님, `refunded` 인데 결제 `refunded` 아님 | 88건 (`cancelled`+`paid`) |
| 완료 기록 없음 | `completed` 인데 `order_completed` 이벤트 없음 | 10건 (레거시 정산 행도 없음) |

자동 보정·삭제 금지. 보정은 OWNER 승인 후 별도 작업.

## 5. 관리자 개입 (2단계 — 주문 상세)

매장이 주문 처리의 주체이고 관리자 개입은 예외 경로다. 목록(`/admin/store-orders`)과 환불 큐(`/admin/stores/orders/refunds`)에는 결정 버튼이 없고 **주문 상세로 이동**한다.

| 구성 | 내용 |
|---|---|
| 계약 | `lib/admin/store-orders/admin-store-order-intervention-contract.ts` — 동작 6종, 현재 상태별 허용 동작 = ADMIN 전이 그래프(`allowedOrderTransitionsForActor`)에서 계산 |
| 서버 | `lib/stores/admin-store-order-intervention.ts` → `POST /api/admin/store-orders/[orderId]/intervene` `{ action, reason, expected_status }` |
| 레거시 | `PATCH /[orderId]`(force_cancel·complete_refund·reject_refund·set_order_status), `POST /approve-refund`, `PATCH /cancel-request` 도 같은 서비스로 위임 — 요청 본문에 `reason` 필수(없으면 400 `reason_required`), `restore_to_status` 는 무시, 이미 종료된 주문은 409 `action_not_allowed_for_status`(이전의 `already: true` 응답 대신). 저장소 QA 스크립트는 `reason` 을 보내도록 갱신 |
| 화면 | 주문 상세 「관리자 개입」 카드: 동작 버튼 → 사유 입력(필수) → 처리 중 표시 → 성공/실패 표시 → 주문·감사 로그·이력 재조회 |

처리 규칙:
1. **사유 필수** (2~500자). 관리자 사유는 **감사 로그(`store_order.admin_intervention`, 처리자·사유·전후 상태)에만** 저장 — 구매자 주문 이벤트 API 로 노출되지 않음. 반려 사유(취소요청 반려·환불 반려)는 기존대로 매장·구매자에게 전달.
2. **서버 재확인**: 관리자가 본 상태(`expected_status`)와 현재 상태가 다르면 409 `status_changed` → 화면 재조회. 상태 쓰기는 `applyStoreOrderStatusTransition`(ADMIN 그래프 + CAS).
3. **환불 반려 복원 상태는 서버가 결정**: 주문 상태 이벤트(`to_status` 가 주문 상태인 것만 — 배달 상태 제외) 최신순에서 ① 맨 앞이 `→ refund_requested` 이고 그 연속 구간이 정확히 1건(누락·중복 차단) ② 같은 시각의 다른 주문 상태 이벤트 없음(순서 모호 차단) ③ 바로 앞 이벤트의 결과 상태 = `from_status`(기록 일관성) ④ `from_status` 가 허용 복원 상태 — 모두 만족할 때만 복원, 아니면 409 `refund_restore_status_unknown` (반려 대신 취소/환불 승인으로 처리). 운영 열린 환불요청 2건은 `accepted` 로 판정. (이전 목록 UI 는 항상 `completed` 로 복원 → `accepted` 에서 들어온 요청을 반려하면 주문완료로 건너뛰는 결함이 있었음.)
4. 취소요청 원장(`store_order_cancel_requests`)은 주문 CAS 성공 후 **여전히 `pending` 인 행만** 승인/반려로 닫는다.
5. 매장 결정과의 동시성: 주문 상태 CAS + `expected_status` 로 한 쪽만 성공. (매장 쪽 결정 권한은 3단계.)

상세 보조 정보: `GET /api/admin/store-orders/[orderId]/history` — 주문 상태 이력(`store_order_events`), 배달 진행(`store_order_deliveries`), 수수료 정산 행(정산 원장과 같은 `store_commission_ledger_page`) + 정산 원장 딥링크.

관리자 Bell/Action Center 의 일반 주문 알림 제거는 매장 처리 권한 정비(3단계) 이후.

## 6. 검증

- 단위·정적: `lib/admin/store-orders/__tests__/admin-store-orders-read-ssot.test.ts`, `lib/admin/store-orders/__tests__/admin-store-order-intervention.test.ts`
- DB (dibay-test, 함수 적용 후): 10건 단위 페이지 순회 33/33 중복·누락 0 (순회 중 데이터 변동 없는 조건 — 변동 시 한계는 §3-1), 정렬 유지, 탭 합 = 전체, 필터별 RPC = 직접 집계, 수수료 상태 22/22 = 정산 원장, 원장 함수 출력 해시 적용 전후 동일.

## 7. 운영 반영 절차 (1단계 — 2026-10-18 운영 DB 적용·PR #59 병합 완료, 원장 9개 상태 해시 적용 전후 동일)

**순서: DB 마이그레이션 → 웹 배포.** 반대 순서면 새 화면이 "주문 조회 함수 미배포" 오류를 표시한다 (0건으로 위장하지 않음). 마이그레이션만 먼저 적용된 상태는 안전하다: 기존 웹은 새 함수를 쓰지 않고, 원장 함수는 결과가 같다.

| 확인 항목 | 운영 DB 현재 값 (2026-10-18 읽기 전용 조회) |
|---|---|
| 선행 객체 `store_commission_ledger_page` · `admin_store_orders_buyer_label` | 존재 |
| 원장 함수 본문 해시 (공백 정규화 md5) | `c6efb450…` = 저장소 `20270510120000` = dibay-test |
| 신규 객체 `store_commission_row_state` · `admin_store_orders_page` · `idx_store_orders_created_id_desc` | 없음 (이름 충돌 없음) |
| 원장 함수에 의존하는 DB 객체 | 0 |
| 원장 함수 권한 | `postgres`, `service_role` 만 — `CREATE OR REPLACE` 는 권한을 유지 (dibay-test 에서 확인) |
| `store_orders` 크기 | 1264 kB, 836행 — 인덱스 생성 잠금은 순간적 |

마이그레이션 내용: 순수 함수 1개 추가, 원장 함수 재정의(CASE → 같은 식의 함수 호출, 그 외 본문 동일 — 테스트로 고정), 읽기 전용 조회 함수 추가(`service_role` 만 실행), 인덱스 1개 추가. 데이터 변경 없음.

**원장 결과 동일성 확인 (적용 직전·직후 같은 쿼리를 연달아 실행해 비교):**

```sql
select st, md5(public.store_commission_ledger_page(null,null,null,st,null,500,0)::text) h,
       public.store_commission_ledger_page(null,null,null,st,null,500,0)->>'total' total
  from unnest(array['all','review_required','outstanding','charged','refunded','kept','decided','approved','rejected']) st;
```

- dibay-test: 적용 전후 `all`·`outstanding` 해시 동일, 공용 함수 = 기존 CASE 172개 조합(실데이터 + NULL·경계값) 불일치 0.
- 운영 기준값(2026-10-18, 데이터 변동 시 달라짐 — 반드시 적용 직전 재측정): all 13건 `8e0774d6…`, outstanding 1 `fa365696…`, charged 7 `6d65789d…`, refunded 5 `5aad2282…`, review_required·kept·rejected 0.
- 롤백: 원장 함수는 `20270510120000` 의 정의로 다시 `CREATE OR REPLACE`. 신규 함수·인덱스는 `DROP` 해도 기존 화면 영향 없음.

## 8. 운영 반영 후 화면 실측 체크리스트

관리자 계정(PC 1440 · 태블릿 1024 · 폰 390, 라이트/다크)으로 `/admin/store-orders`:

| # | 항목 | 방법 | 통과 기준 |
|---|---|---|---|
| 1 | 조회 — 같은 조건 재조회 | 조건 변경 없이 「조회」 2회, 개발자도구 Network | 매번 `/api/admin/store-orders/list` 요청 1건 (캐시 응답 아님), 1페이지 |
| 2 | 새로고침 — 최신 반영 | 오너 화면에서 주문 상태 변경(수락→준비 등) 후 「새로고침」 | 같은 페이지·조건에서 상태 배지·탭 건수 변경, 조회 시각 갱신 |
| 3 | 실패 시 목록 유지 | Network 오프라인 후 「새로고침」 | 기존 행 유지 + 오류 배너 "직전 조회 결과…", 0건 표시 없음 |
| 4 | 50건 페이지네이션 | 전체 탭: 처음/이전/번호 입력/다음/끝 | 페이지당 50행, 전체 건수 = 탭 「전체 주문」, 마지막 페이지 정상, 범위 밖 번호 입력 시 끝 페이지 |
| 5 | 상태 표시 | 주문 완료·취소·환불 탭 각각 | 탭 건수 = 목록 전체 건수, 배송지도착 ≠ 주문완료 배지 구분 |
| 6 | 매장별 검색 | 매장명 일부 입력 → 「조회」, 그리고 `?store_id=` 딥링크 | 해당 매장 주문만, 딥링크 칩 표시·해제 가능 |
| 7 | 정산 상태 | 같은 주문을 `/admin/store-settlements` 원장과 대조 | 「수수료 정산」 칩 = 원장 상태 (조리 전 취소 등은 "부과 없음") |
| 8 | 무결성 배지 | 취소 탭 | `cancelled`+`paid` 행에 "결제 상태 불일치" (보정 버튼 없음) |
| 9 | CSV | 필터 적용 후 「CSV 내려받기」 | 행 수 = 화면 전체 건수, 같은 필터 |
| 10 | 주문 상세 | 주문번호·「상세 보기」 | `/admin/stores/orders/{id}` 기존 상세 열림 |
| 11 | 관리자 개입 | 취소요청/환불요청 행 → 「상세에서 처리」 → 「관리자 개입」 | 사유 입력 필수, 처리 중 버튼 잠금, 성공 시 상태 전환 표시·재조회, 다른 탭에서 먼저 처리하면 409 안내 후 재조회, 환불 반려는 요청 직전 상태로 복원 |
| 12 | 기존 딥링크 | 액션센터 「주문 큐 열기」(`?queue=admin_attention`), `?order_id=` | 해당 조건 칩 + 결과 |
| 13 | UI/UX/CTA | 버튼 hover·눌림·비활성·로딩, 요청 중 연타 | 요청 중 모든 조회 CTA 비활성, 중복 요청 0, 가로 스크롤은 표 내부만 |

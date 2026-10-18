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
| 페이지 이동 (처음/이전/번호/다음/끝) | 같은 스냅샷 유지 → 페이지 간 중복·누락 없음 |
| 조건 초기화 | 모든 조건·딥링크 해제 후 조회 |

- 진행 중에는 모든 조회 CTA 비활성(중복 요청 차단), 이전 요청은 abort.
- 실패 시 **직전 결과 유지** + 오류 표시 (0건으로 위장하지 않음). 함수 미배포는 별도 문구.
- 조회 시각(PHT) 표시. 자동 폴링 없음 (수동 새로고침 중심).
- 마지막 페이지를 넘는 페이지(그 사이 행이 줄어든 경우)는 마지막 페이지로 보정.

## 4. 무결성 표시 (보정하지 않음)

| 배지 | 조건 | 운영 현황 (2026-10-17 조회) |
|---|---|---|
| 결제 상태 불일치 | `cancelled` 인데 결제 `cancelled/failed` 아님, `refunded` 인데 결제 `refunded` 아님 | 88건 (`cancelled`+`paid`) |
| 완료 기록 없음 | `completed` 인데 `order_completed` 이벤트 없음 | 10건 (레거시 정산 행도 없음) |

자동 보정·삭제 금지. 보정은 OWNER 승인 후 별도 작업.

## 5. 관리자 개입 (이번 단계 범위 밖)

취소요청·환불요청 승인/반려 버튼은 기존 API 그대로 목록의 상태 칸에 유지한다. 주문 상세「관리자 개입」영역으로 이관(사유 필수·서버 재확인)한 뒤 목록에서 제거한다. 관리자 Bell/Action Center 의 일반 주문 알림 제거는 매장 처리 권한 정비 이후 단계.

## 6. 검증

- 단위·정적: `lib/admin/store-orders/__tests__/admin-store-orders-read-ssot.test.ts`
- DB (dibay-test, 함수 적용 후): 10건 단위 페이지 순회 33/33 중복·누락 0, 정렬 유지, 탭 합 = 전체, 필터별 RPC = 직접 집계, 수수료 상태 22/22 = 정산 원장, 원장 함수 출력 해시 적용 전후 동일.

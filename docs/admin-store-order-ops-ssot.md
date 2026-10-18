# 관리자 매장 주문 운영 — 화면·데이터 SSOT

승인 설계 v3 (D1–D4 · D6 · D8 · D9). D5(레거시 결정 API `expected_status` 필수화)는 별도 보안 이슈, D7(지연 알림음)은 범위 밖.

## 1. 화면 (독립 페이지, 공통 데이터·CTA 로 연결)

| 메뉴 | 경로 | 컴포넌트 | 기준 시각 (D2, 마닐라 일자) |
|---|---|---|---|
| 주문 목록 | `/admin/stores/orders` (+ `by-store/[id]`, `by-buyer/[id]`) | `AdminOrderOpsScreen screen="list"` | 주문 생성 |
| 주문 액션 | `/admin/store-orders` | `AdminOrderOpsScreen screen="exceptions"` | 현재 (관리자 예외만) |
| 취소 요청 | `/admin/stores/orders/cancellations` | `screen="cancellations"` | 대기 = 요청 시각 · 완료 = 취소 이벤트 시각 |
| 환불 요청 | `/admin/stores/orders/refunds` | `screen="refunds"` | 대기 = 요청 시각 · 완료 = `refunded_at` |
| 감사 로그 | `/admin/stores/orders/logs` | `AdminOrderAuditLogsScreen` | 기록 시각 |
| 주문 채팅 | `/admin/order-chats` | `AdminOrderChatList` | 최근 메시지 |

- 주문번호는 어느 화면에서든 공통 상세 모달(`AdminOrderDetailModal`, URL `?order=<uuid>&section=<s>`)을 연다. 뒤로가기 = 모달 닫기, 목록 검색·페이지·스크롤 유지.
- 전체 화면 상세: `/admin/stores/orders/[orderId]` (`AdminOrderDetailPage`).
- D1: `/admin/store-orders` 에 목록 조건(`order_status`, `store_id`, `order_no`, …)이 붙은 예전 링크는 주문 목록으로 같은 조건 그대로 이동(`legacyStoreOrdersRedirectTarget`). 주문 액션 화면 자신의 필터 URL 은 `queue=admin_attention` 표식을 붙여 이동하지 않는다.
- 현황 카드는 카드마다 기준 시각을 표시한다. 「취소 요청 대기」→ 취소 요청 화면, 「환불 요청 대기」→ 환불 요청 화면.

## 2. 데이터

- 목록·집계: `admin_store_order_ops_page`, `admin_store_order_ops_summary`, `admin_store_order_ops_facts` (`supabase/migrations/20270513120000_admin_store_order_ops.sql`, 읽기 전용, service_role 만).
- 상세: `GET /api/admin/store-orders/[orderId]/detail` → `loadAdminStoreOrderDetail`.
- 감사 로그: `GET /api/admin/store-orders/audit` → `loadAdminOrderAuditPage` (서버 페이지네이션, 구분 필터).

## 3. 금액 (D3 · D6)

`lib/admin/store-orders/admin-store-order-detail-contract.ts` `buildAdminOrderMoney` 와 SQL `admin_store_order_ops_facts` 가 같은 규칙.

- 주문 금액 = `total_amount` (상품 합계 + 배달비), 쿠폰 할인 = `discount_amount` (플랫폼 + 매장 부담), 상품권 = `gift_certificate_redemptions.redeemed_amount` 우선, 고객 결제 = `payment_amount`.
- 「수수료 부과 기준액 / 부과 수수료」 = 결제 + 상품권 + 플랫폼 부담 쿠폰 (#58 SQL).
- 불일치는 **표시만** 한다 (데이터 보정 없음). 2026-10 운영 기준 26건: 환불 주문 상품권 미기록 10 · 진행 중 주문 상품권 회수 6 · 상품권 미차감 10.

## 4. 대표 상품 (D4)

소계가 가장 큰 상품(동률이면 상품명 순) + 「외 N개」(N = 나머지 품목 줄 수).

## 5. 감사 로그 (D8)

- 문구: `lib/admin/store-orders/admin-store-order-audit-labels.ts` — 코드가 쓰는 `store_order.*` 액션 전부(테스트 고정). 미등록 액션은 「기타 기록 (원래 이름)」으로 보이고 숨기지 않는다.
- QA 검증 기록(`fin_ssot_*`, `phase_d_*`)은 별도 구분, 기본 목록에서 제외, 삭제하지 않는다.

## 6. 주문 액션 예외 사유 (D9)

기존 기록만 사용: 라이더 실패 신고 → SLA 경고 사유 → 자동조치·복구 센터 표시 → 「사유 기록 없음」.

## 7. 처리 (HARD LOCK 유지)

상태 전이·결정 서비스·DB 트리거·수수료는 변경하지 않았다. 관리자 환불 승인·관리자 취소는 상세 모달 G 섹션에서 주문번호 재입력 후에만 실행된다. 자동 승인·거절·삭제 없음.

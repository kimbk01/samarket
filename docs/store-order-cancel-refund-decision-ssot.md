# 매장 주문 취소·환불 결정 SSOT (3단계)

원칙: **매장이 주문 처리의 주체**다. 매장은 자기 주문을 직접 취소하고, 고객 요청(취소·환불)을 승인·반려한다. 관리자는 예외 개입(주문 상세 「관리자 개입」, `docs/admin-store-orders-read-ssot.md` §5)만 한다.

## 1. 누가 무엇을 하는가

| 주문 단계 | 구매자 | 매장 | 관리자(예외) |
|---|---|---|---|
| `pending` | 즉시 취소 | 즉시 취소(사유) | 취소 · 환불요청 생성 |
| `accepted` | **취소 요청**(사유 필수) | 즉시 취소(사유) | 〃 |
| `preparing`~`arrived`, 배달 픽업 전 | **취소 요청**(사유 필수) | **즉시 취소**(사유) — 관리자 승인 단계 없음 | 〃 |
| 배달 픽업 이후 | 불가(고객센터) | 불가 | 취소 |
| `cancel_requested` | — | **승인 → `cancelled` / 반려 → 요청 직전 상태**(반려 사유 필수) | 승인 · 반려 |
| `refund_requested` | — | **승인 → `refunded` / 반려 → 요청 직전 상태**(반려 사유 필수) | 승인 · 반려 |

- 단일 정의: `lib/stores/order-status-transitions.ts` (`allowedOrderTransitionsForActor`), `lib/stores/store-order-cancel-policy.ts`.
- 구매자 진행 중 요청은 `refund_requested` 가 아니라 `cancel_requested` 이며 요청자는 `store_order_cancel_requests.requested_role = 'buyer'` (D1).
- 매장은 더 이상 `cancel_requested` 를 만들지 않는다. 3단계 이전 매장 요청(운영 53건)은 매장이 같은 화면에서 **승인(취소 확정) / 반려(요청 철회)** 한다 (D2). 자동 승인·반려·삭제 없음.

## 2. 서버 경로

| 경로 | 내용 |
|---|---|
| `PATCH /api/me/store-orders/[orderId]` `{ request_cancel, cancel_reason }` | 구매자 취소 요청. 사유 2~500자, 픽업 이후 차단, **원장 행 먼저 → 상태 전이**, 전이 실패 시 원장 행 삭제 (근거 없는 `cancel_requested` 방지). 이전 키 `request_refund`/`refund_reason` 은 별칭 |
| `POST /api/me/stores/[storeId]/orders/[orderId]/cancel-request` | 매장 즉시 취소 (사유 필수, 픽업 이후 차단). 승인된 원장 행 기록 |
| `POST /api/me/stores/[storeId]/orders/[orderId]/decide` `{ action, reason, expected_status }` | 매장 결정 (`lib/stores/owner-store-order-decision.ts`) |
| `PATCH /api/me/stores/[storeId]/orders/[orderId]` | 진행 단계 전이만. `cancel_requested` 설정·요청 상태에서의 전이·조리 이후 `cancelled` 는 각각 `/decide`·`/cancel-request` 로만 (우회 차단) |

상태 쓰기는 호출자가 판단한 상태로 CAS 한다(`expectedCurrentStatus`) — 그 사이 상태가 바뀌면 409 `transition_conflict` 이고 더 새로운 상태 위에서 적용되지 않는다 (원장 `previous_order_status` 와 실제 직전 상태가 어긋나지 않음).

구매자 취소 요청의 원장 행 기록과 상태 전이는 **한 트랜잭션이 아니다**. 동시 요청은 미결 1건 유니크 인덱스(409 `cancel_request_pending`), 동시 상태 변경은 위 CAS 로 막고, 전이 실패 시 원장 행을 지운다. 그러나 두 쓰기 사이에서 요청이 중단되거나 삭제가 실패하면 `pending` 원장 행이 상태 변경 없이 남을 수 있고, 그 주문은 다시 취소 요청할 때 409 가 된다. 이 창을 없애려면 두 쓰기를 하나의 DB 함수로 묶어야 한다(마이그레이션 필요 — 미적용).

매장 결정 규칙: 소유 확인 → `admin_locked` 이면 409 → 매장이 본 상태와 다르면 409 `status_changed` → 반려 사유 필수 → 복원 상태는 서버 기록만(취소 요청: 원장 `previous_order_status`, 환불 요청: 엄격한 이벤트 근거, 불명확하면 409) → `applyStoreOrderStatusTransition`(OWNER, CAS) → 원장은 여전히 `pending` 인 행만 닫음 → 감사 로그 `store_order.owner_decision`.

## 3. 돈·수수료

- 상태 쓰기는 `applyStoreOrderStatusTransition` 하나. 수수료는 #58 DB 트리거(조리 이후 취소·환불 → 같은 트랜잭션에서 검토 대기, 반려로 조리 단계 복귀 → 그때 1회 부과·정책 없으면 거부)만 다룬다. 결정 서비스는 수수료·캐시 원장에 쓰지 않는다.
- 환불 승인은 기존 원자적 환불 RPC(`gift_certificate_refund_order_atomic`, `refund_requested` 에서만, 행 잠금)를 그대로 쓴다.
- 구매자 요청은 관리자 주의 플래그(`needs_admin_attention`)를 켜지 않는다 (매장 업무).

## 4. 알림

| 사건 | 받는 사람 | 비고 |
|---|---|---|
| 구매자 취소 요청 | 매장 | `notifyStoreOwnerRefundRequested({ request: "cancel" })` — 기존 알림 종류(`store_order_refund_requested`) 재사용, 문구·`meta.request_type` 로 구분 (새 종류 등록은 알림 레지스트리 8곳+SQL 변경이 필요해 보류) |
| 요청 승인(취소·환불) | 구매자 | 기존 상태 알림(취소됨·환불 완료) |
| 요청 반려(매장·관리자) | 구매자 | `notifyBuyerStoreRefundRejected({ request })` — 반려 사유 포함 |

## 5. 화면

- 매장: 주문 카드·상세·채팅 툴바·드로어 공용 `components/business/owner/OwnerOrderRequestDecision.tsx` — 안내 + 「반려」(사유 시트) / 「취소 승인·환불 승인」(확인). 상태가 바뀌어 있으면 다시 불러온다. 요청 상태 주문은 모바일 「취소」 탭·주의 배지에 포함(기존).
- 구매자: 주문 상세·펼침 패널 「취소 요청」(사유 필수) · 「매장 확인 중」 안내.

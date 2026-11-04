# 매장·구매자 주문 프로세스 단일 원천 — 4단계 정본

Owner 2026-11-04 「주문 체팅창 부분, 오너 매장 시스템 부분의 용어와 프로세스를 정확히 통일화 한다」.
설계: `docs/audit/store-order-process-terms-unify-design-2026-11-04.md` §3 · 시안 `docs/audit/store-order-chat-owner-mockup-2026-11-04.html`.
(이전 배달 7단계·픽업 5단계·「Mock 카드 7칸」 정본은 폐기.)

## 진실의 원천

- DB: `store_orders.order_status` + `fulfillment_type` + `cancel_kind`(취소 구분 — 취소 이벤트로 DB 트리거가 채움)
- 전이: `lib/stores/order-status-transitions.ts` (`allowedOrderTransitions`)
- 이름·칸·버튼·사건 문장: `lib/stores/store-order-process-model.ts` (문구 키 `lib/i18n/catalog/store-order-stage-terms.ts`)
- **다른 파일에 주문 상태 → 이름 표를 만들지 않는다** — `lib/stores/__tests__/store-order-process-model-contract.test.ts` (b) 가 막는다.

## 단계 (모든 화면 같은 4칸)

| 칸 | 배달 | 포장(픽업) | DB 상태 |
|---|---|---|---|
| (칸 앞) | 접수 대기 | 접수 대기 | pending |
| 1 | 주문접수 | 주문접수 | accepted |
| 2 | 조리중 | 조리중 | preparing (+ 예전 배달 ready_for_pickup) |
| 3 | 배달중 | 픽업대기 | 배달 delivering·arrived / 픽업 ready_for_pickup |
| 4 | 배달완료 | 픽업완료 | completed |
| 1줄 | 주문 거절 · 주문 취소 · 취소 요청 · 환불 요청 · 환불 완료 | 같음 | cancelled(cancel_kind=rejected) · cancelled · cancel_requested · refund_requested · refunded |

## 사장님 버튼 (4번)

- 배달: 주문 접수 → 조리 시작 → 배달 출발 → 배달 완료 (`preparing → delivering`, 포장 완료 단계 없음)
- 픽업: 주문 접수 → 조리 시작 → 준비 완료 → 픽업 완료
- 「주문접수」와 「조리중」을 DB 상태로 나누는 이유: 수수료는 조리 이후 첫 진입 때 부과(트리거) · 접수 후 조리 전 취소는 무부과 (`docs/store-commission-cash-settlement-ssot.md`)

## 사건 문장 (채팅 줄 · 손님 푸시 · 알림함 — 같은 사건 = 같은 문장, 말투 「~했어요」)

`orderEventMessage(status, fulfillment, { prepMinutes, cancelKind, reason })` — 거절·취소는 사유 포함. 배달 「준비 완료」·「도착」 줄은 없음.

## 파생 API

| export | 용도 |
|---|---|
| `processSteps(fulfillment)` | 4칸 대표 상태 |
| `orderStagePosition` / `processFlowStepStates` | 칸 위치 · 칸 상태 |
| `orderStatusName` (`processStatusLabel` 호환) | 상태 이름 — 화면 구분 없음 |
| `ownerNextAction` · `ownerTransitionConfirmQuestion` | 사장님 버튼 · 확인창 |
| `orderEventMessage` (`chatMessageKey` 호환) | 사건 문장 |
| `ORDER_STATUS_NAME_KEYS_WITHOUT_FULFILLMENT` | 주문 방식을 모를 때(관리자 표) |

## 검증

```bash
npx vitest run lib/stores/__tests__/store-order-process-model-contract.test.ts
```

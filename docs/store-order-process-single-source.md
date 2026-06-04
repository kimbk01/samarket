# 매장·구매자 주문 프로세스 단일 원천

## 진실의 원천

- DB: `store_orders.order_status` + `fulfillment_type`
- 전이 규칙: `lib/stores/order-status-transitions.ts` (`allowedOrderTransitions`)

## 파생 API (신규 코드는 여기만)

`lib/stores/store-order-process-model.ts`

| export | 용도 |
|--------|------|
| `processSteps(fulfillment)` | 배달 7키 / 픽업 5키(완료 포함) 고정 순서 |
| `isStoreOrderTerminalStatus` | 취소·환불 등 — 진행바·요약 1칸 축약 |
| `processStepIndex(status, fulfillment)` | 진행바 current index |
| `processFlowStepStates` | 오너·채팅 요약 1:1 state |
| `processBuyerDetailStepStates` | 구매자 상세 6열 (`buyerDetailSixStepStates` 위임) |
| `processStatusLabel` / `processStepLabel` | audience: `owner` \| `buyer` \| `owner_badge` |
| `ownerNextAction` | CTA = 허용 전이 첫 forward |
| `chatMessageKey` / `chatMessageKeyWithPrep` | 채팅 system INSERT·표시 key |

## 배달 완료 정책 A

- `delivering` → `completed` 1탭
- 합성 `arrived` 채팅 줄 **INSERT 금지** (`appendStoreOrderMessengerStatusTransition`)

## 배달 `ready_for_pickup` 라벨

- 오너: `store_owner_ops_flow_delivery_ready`
- 구매자: `store_order_process_step_ready_dispatch` (픽업은 `mypage_comp_order_status_ready_for_pickup` 유지)

## 레거시 위임

- `store-order-process-criteria.ts` — 타임라인 index·6열 state (회귀 계약)
- `buyer-order-status-labels.ts` — 구매자 라벨 → model
- `owner-order-ui-labels.ts` — 오너 배지·전이 문구 → model

## 검증

```bash
npm run verify:store-order-process-model-contract
npx vitest run lib/stores/__tests__/store-order-process-model-contract.test.ts
```

## 의도적 미변경

- `store_order_events`: `arrived` → `order_delivering` 이벤트 축약
- 오너 4열 스테퍼 (`ownerOrderCardStepperModel`) — Mock 카드 7칸이 주 UI

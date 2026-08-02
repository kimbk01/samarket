# Slice 2-5 — C_store Action SSOT

**Status:** AUTHORITY CONTRACT LOCK  
**HEAD:** `c673ac444`  
**Source module:** `C_STORE_ACTION_SSOT` in `c-store-authority-contract.ts`

---

## Final Event SSOT table

| Action Type | Source state | Authority | Identity | Increase | Complete/Decrease | Surface | Status |
|-------------|--------------|-----------|----------|----------|-------------------|---------|--------|
| NEW_ORDER_PENDING | pending | C_store | store:{storeId} | 주문 생성→접수대기 | 접수/거절 | Owner Ops | **CONFIRMED** |
| REFUND_REQUESTED | refund_requested | C_store | store:{storeId} | 환불 요청 | 승인/거절/처리 | Owner Ops | **CONFIRMED** |
| CANCEL_REQUESTED | cancel_requested | C_store | store:{storeId} | 취소 요청(매장 Action 필요) | 승인/거절/처리 | Owner Ops | **GAP_ADD** |
| OPEN_STORE_INQUIRY | store_inquiries open | C_store | store:{storeId} | 문의 티켓 생성 | 답변/종료 | Owner Ops | **CONFIRMED** |
| OWNER_CHAT_UNREAD | chat unread | B_store | store:{storeId} | 메시지 수신 | 읽음 | Owner Chat | **EXCLUDED** |
| OWNER_INTAKE_NOTIFICATION | notification row | notification transport | current user writer | push/inbox 생성 | 읽음 | Inbox | **REWRITE** |
| COOKING_STAGE | order workflow | CTA only | store:{storeId} | 상태 전환 | 다음 상태 | Dashboard | **OUT_OF_BADGE** |
| DELIVERY_STAGE | order workflow | CTA only | store:{storeId} | 상태 전환 | 다음 상태 | Dashboard | **OUT_OF_BADGE** |
| REVIEW_ACTION | unknown | UNKNOWN_BLOCKED | unknown | unknown | unknown | FAB | **UNPROVEN / BLOCKED** |

---

## Action Required shape

```ts
type StoreOperationAction = {
  actionId: string; // store:{storeId}|actionType|sourceEntityId
  storeId: string;
  authority: "C_STORE_OPERATION";
  actionType: StoreOperationActionType;
  sourceDomain: string;
  sourceEntityId: string;
  openedAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
};
```

Count = `count(distinct actionId)` where active.

---

## Evidence notes

| Decision | Evidence |
|----------|----------|
| OPEN_STORE_INQUIRY = ticket | `lib/stores/count-open-store-inquiries.ts` — `status=open` count (“미답변 문의”) |
| CANCEL ∈ C | Product decision this Contract; Hub RPC omit → GAP_ADD |
| REVIEW blocked | Audit UNPROVEN writer; no auto-include |
| Cooking/delivery OUT | Hub RPC / process model — CTA only today |

---

## CANCEL exclusion rule

```text
INCLUDE when order_status=cancel_requested AND storeActionRequired=true
EXCLUDE when storeActionRequired=false (no owner decision needed)
```

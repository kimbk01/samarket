# Slice 2-5 — KEEP / ROUTE / REWRITE / DELETE

**Status:** AUDIT ONLY — classification for next Authority Contract / CODE  
**HEAD:** `c673ac444`  
**Legend:** KEEP · ROUTE · REWRITE · DELETE · NOT_FOUND · UNPROVEN

---

## 1. Writers

| ID | Symbol / path | Class | Note |
|----|---------------|-------|------|
| W1 | `notifyStoreOwnerNewOrder` | **REWRITE** | user_id intake; C must be store |
| W2 | `notifyStoreOwnerAcceptReminder` | **REWRITE** | same |
| W3 | `notifyStoreOwnerPaymentCompleted` | **REWRITE** | same |
| W4 | `notifyStoreOwnerBuyerCancelled` | **REWRITE** | same |
| W5 | `notifyStoreOwnerRefundRequested` | **REWRITE** | same (+ Hub state KEEP) |
| W6 | `notifyStoreOwnerProductSoldOutFromOrder` | **REWRITE** | same |
| W7 | `notifyStoreOwnerPoint*` / charge / account replied | **ROUTE** | fee lane vs C; A residual **UNPROVEN** |
| W8 | `appendUserNotification` | **ROUTE** | bridge; C kinds must not enter A |
| W9 | `resolveNotificationAttentionKey` → `owner_intake` / `owner_fee` | **REWRITE** | leave A formulas forever |
| W10 | `bumpNotificationTargetFromInboxRow` (owner_order) | **ROUTE** | dual source into FAB |
| W11 | review target bump for **owner** new review | **UNPROVEN** | buyer review POST → owner bump weak |
| W12 | DB `store_orders.pending` | **KEEP** | true C state |
| W13 | DB `refund_requested` | **KEEP** | true C state |
| W14 | DB `store_inquiries` open | **KEEP** | true C state |
| W15 | DB `cancel_requested` | **REWRITE** (into Hub C) | state exists; Hub RPC omits |

---

## 2. Readers / aggregators

| ID | Symbol / path | Class | Note |
|----|---------------|-------|------|
| R1 | `getOwnerHubStoreAttentionCounts` + SQL RPC | **KEEP** | store_id SSOT candidate |
| R2 | legacy pending/refund/inquiry counts | **KEEP** | fallback |
| R3 | `hub-store-attention-memory-cache` | **KEEP** | perf |
| R4 | `resolveOwnerHubBadgeStoreAttentionFromHubStore` | **KEEP** | state → Hub fields |
| R5 | `enrichStorePartialWithTargetBundle` (max with fab_*) | **ROUTE** | dual source |
| R6 | `/api/me/store-owner-hub-badge` | **KEEP** | Owner shell |
| R7 | `resolveFabOwnerOrdersBadgeCount` | **KEEP** | C presentation |
| R8 | `resolveFabOwnerStoreBadgeCount` | **KEEP** / review **UNPROVEN** | |
| R9 | `resolveFabOwnerOrderChatBadgeCount` | **KEEP as B_store** | boundary — not C |
| R10 | `resolveOwnerOperationsCenterAttentionCount` | **ROUTE** | strips chat out of C |
| R11 | Owner ops dashboard snapshot KPIs | **KEEP** | ops UI |
| R12 | `owner-orders-attention-bridge` / meta counts | **KEEP** | header from list |
| R13 | MyPage `storeAttention` | **KEEP** | pending+refund caption |
| R14 | Owner Tier1 `owner_commerce_inbox` | **ROUTE** | not A_member |
| R15 | Member A / Bell filters excluding owner_intake | **KEEP** | locked A_member |
| R16 | B_store store-communication projection | **KEEP** | locked B_store — do not open |

---

## 3. Named search results

| Term | Result | Class |
|------|--------|-------|
| `owner_inbox` | **NOT_FOUND** | use `owner_commerce_inbox` / `owner_intake` |
| `orderAttention` | live Hub C | **KEEP** |
| `inquiryAttention` | live Hub C | **KEEP** |
| `ownerReviewAttention` | target-derived | **UNPROVEN** writer |
| `owner_intake` | event attention prefix | **REWRITE** identity |
| `fab_owner_orders` | target merge | **ROUTE** |
| `fab_owner_store` | target merge | **UNPROVEN**/ROUTE |
| `storeOrderChatUnread` | B_store | **KEEP** B (exclude from C) |
| `store_sales` badge | **NOT_FOUND** as ops counter | eligibility only |

---

## 4. DELETE candidates

None proven safe to delete in audit-only. Event writers are **REWRITE**, not DELETE, until store-scoped C projection exists.

---

## 5. Do-not-touch (prior locks)

| Axis | Class for this slice |
|------|----------------------|
| A_member projection / Bell | **KEEP** — no edits |
| B_member rooms / missed | **KEEP** — no edits |
| B_store room-count Hub/FAB chat | **KEEP** — no edits |

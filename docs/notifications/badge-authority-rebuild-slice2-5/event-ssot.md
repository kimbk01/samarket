# Slice 2-5 — C_store Event SSOT (LOCK draft)

**Status:** AUDIT LOCK draft — not CODE/RUNTIME/PRODUCT/HARD LOCK  
**HEAD:** `c673ac444`  
**Clear rule for C_store:** Action Complete only (not open / not inbox-read / not refresh)

---

## 0. Authority labels (exclusive)

| Authority | Meaning | Clear |
|-----------|---------|-------|
| **C_store** | Store operation Action Required | Action Complete on that work item |
| **B_store** | Owner ↔ customer order **chat** unread rooms | Room read |
| **A_member** | Member Bell notices | Inbox read |
| **OUT** | Not a badge authority (dashboard KPI / ephemeral) | — |

---

## 1. Event SSOT table (product intent — LOCK this table first)

| Event | Identity (target) | Primary Surface | Clear condition (Action Complete) | Authority |
|-------|-------------------|-----------------|-----------------------------------|-----------|
| 신규 주문 (`pending`) | `store:{storeId}` | Owner Hub / FAB orders / Ops Dashboard | Accept **or** reject/cancel leave `pending` | **C_store** |
| 주문 승인 필요 (same as pending) | `store:{storeId}` | same | same | **C_store** |
| 주문 거절/취소 처리 (from pending) | `store:{storeId}` | same | transition complete → leave Action Required | **C_store** |
| 환불 요청 (`refund_requested`) | `store:{storeId}` | Owner Hub / FAB orders / Dashboard | Approve/deny → leave `refund_requested` | **C_store** |
| 주문 취소 요청 (`cancel_requested`) | `store:{storeId}` | **should** Owner Hub / FAB orders | Owner resolve cancel request | **C_store** (candidate — **GAP**: not in Hub RPC today) |
| 매장 문의 open (`store_inquiries`) | `store:{storeId}` | Owner Hub / FAB store | Close / resolve inquiry | **C_store** |
| 리뷰 답변 필요 | `store:{storeId}` | Dashboard (+ FAB store if wired) | Owner reply | **C_store** (candidate — FAB writer **UNPROVEN**) |
| 품절 / 재고 0 (ops notify) | `store:{storeId}` | Owner ops inbox / Hub if state exists | Restock or dismiss via ops policy | **C_store** (event today on `user_id` — **REWRITE**) |
| 결제 완료 / 수락 리마인더 (ops notify) | `store:{storeId}` | Owner commerce inbox (not Member Bell digit) | Same order Action Complete / supersede | **C_store** meta (parallel to state — **ROUTE/REWRITE**) |
| 포인트 차단·충전 승인/거절 등 fee | `store:{storeId}` or platform lane | Owner fee inbox | Fee Action Complete | **C_store** fee lane or **ROUTE** (**UNPROVEN** A residual) |
| 조리 시작 / 조리 완료 / 픽업 대기 / 배달 시작 / 배달 완료 | `store:{storeId}` | Ops Dashboard CTA / process model | Next status transition (ops UX) | **OUT** of Hub badge today (dashboard KPI only unless later product expands C) |
| 고객 주문 채팅 메시지 | `store:{storeId}` | Owner FAB chat / Hub chat | Room read | **B_store** (NOT C) |
| General / Group / Trade chat | `user:{memberId}` | Member B surfaces | Room read | **B_member** |
| Missed call | `user:{memberId}` | B_member / App Icon | Resolve / room tip | **B_member** |
| Bell 공지·시스템 (member) | `user:{memberId}` | Member Bell | Inbox read | **A_member** |
| Owner commerce Tier1 list | today `user:{ownerId}` | Owner Tier1 bell UI | mark-read (**read**, not Action Complete) | **ROUTE** → must not be A_member; identity → store |

---

## 2. Explicit exclusions (never C_store)

| Item | Why |
|------|-----|
| Customer chat / Owner chat unread | **B_store** |
| General / Group / Trade chat | **B_member** |
| Missed Call | **B_member** |
| Member Bell Notification digit | **A_member** |
| Member App Icon (web) | A + B_member only (PRODUCT LOCK) |
| Native Member App Icon | Slice 2-6; blocks C_store |
| Mere screen open / pull-to-refresh | Not Action Complete |

---

## 3. Current live Hub C formula (state — closest SSOT)

Source: `get_owner_hub_store_attention_counts(p_store_id)` + `build-owner-hub-badge-payload.ts`

```text
orderAttention   ≈ order_pending_count + refund_pending_count
                   (+ max with fab_owner_orders target unread — dual source)
inquiryAttention ≈ inquiry_pending_count  (open store_inquiries)
ownerReviewAttention ≈ fab_owner_store - inquiryAttention  (target-derived; writer weak)
```

**Identity of SQL counts:** `store_id` ✅  
**Identity of notify/target merge:** often `user_id` ❌ (see `identity-audit.md`)

---

## 4. Process statuses surveyed (not all → Hub badge)

From `store-order-process-model` / `order-status-transitions`:

| Status / step | Owner next action exists? | In Hub `orderAttention` today? |
|---------------|---------------------------|--------------------------------|
| `pending` | Accept / reject | **YES** |
| `accepted` → `preparing` → `ready_for_pickup` → `delivering` → `arrived` → `completed` | Process CTA | **NO** (dashboard timing KPIs only) |
| `cancel_requested` | Resolve | **NO** (**GAP**) |
| `refund_requested` | Resolve | **YES** |
| `cancelled` / `refunded` / `completed` | — | clears prior Action Required |

---

## 5. Lock statement

This table is the **Event SSOT draft** for Slice 2-5 Authority Contract.

- Next step may refine **candidate** rows (`cancel_requested`, review reply, post-accept cooking/delivery) into YES/NO product decisions.
- This audit **does not** implement those decisions.
- Cooking/delivery steps stay **OUT** of Hub C until an explicit product decision expands Action Required.

# Slice 2-5 — C_store Authority Map

**Status:** AUDIT ONLY  
**HEAD:** `c673ac444`

---

## 1. Target authority (product intent)

```text
C_store = OwnerOperationAttentionCount(storeId)
recipient_scope     = store
recipient_identity  = store:{storeId}
surfaces            = Owner ops Hub / FAB orders / FAB store / Ops Dashboard / (optional Owner Tier1 ops inbox)
NOT surfaces        = Member Bell · Member App Icon · Bottom Chat · Customer Hub · Native Member Icon · B_store chat digit
clear               = Action Complete only
```

Exclusive vs locked axes:

```text
C_store ∩ A_member  = ∅
C_store ∩ B_member  = ∅
C_store ∩ B_store   = ∅   (ops ≠ chat)
```

---

## 2. Live dual authority (conflict)

| Lane | Identity today | Count meaning | Clear |
|------|----------------|---------------|-------|
| **Hub store_attention (state)** | `store_id` | pending + refund_requested + open inquiries | Status / inquiry leave Action Required |
| **notification_events owner_intake** | `owner user_id` | commerce ops events (`owner_intake` / fee keys) | **Read** / supersede / `markOrderNotificationsRead` |
| **notification_targets** | `user_id` (+ optional `store_id`) | `fab_owner_orders` / `fab_owner_store` unread | Target clear on mark-read |

```text
                    ┌─────────────────────────────┐
   Order pending ──►│ Hub RPC (store_id)          │──► FAB orders / Hub  ✅ C-shaped
   Refund req   ──►│ orderAttention / inquiry…   │
   Open inquiry ──►└─────────────────────────────┘
                    ┌─────────────────────────────┐
   notifyStore* ──►│ notification_events(user_id) │──► Owner Tier1 list
                    │ attention owner_intake       │──► historically A risk
                    └─────────────────────────────┘     (Bell digit excluded 2-2)
                    ┌─────────────────────────────┐
   bump targets ──►│ fab_owner_orders (user)      │──► max() into orderAttention
                    └─────────────────────────────┘     dual source
```

---

## 3. Mixing map (must record)

| Mix path | Evidence | Severity |
|----------|----------|----------|
| `owner_intake` → Member Bell digit | Slice 2-2 excludes via A projection | **Mitigated for digit**; events still on `user_id` |
| `owner_intake` → Member App Icon | App Icon uses A + B_member; C blocked by PRODUCT LOCK | **Mitigated** if A path holds |
| Ops notify → B_store chat digit | Separate `storeOrderChatUnread` | **No write mix** |
| Ops + Chat → Header / FAB toggle sum | `resolveOwnerOperationsCenterAttentionCount` = orders+store+**chat** | **Presentation mix** — ROUTE |
| State C + target unread | `orderAttention = max(state, fab_owner_orders)` | **Dual source** — ROUTE |
| Cooking/delivery KPI → Hub badge | Not in RPC | **No** (OUT) |

---

## 4. Relation to classifier / Phase1 contract

Already documented in code (design, not full runtime rewrite):

- `badge-event-classifier.ts` — `owner_intake` / `OWNER_STORE_OPERATION_META_KINDS` → `C_STORE_OPERATION` + `store:{id}`; missing storeId → `UNKNOWN_BLOCKED` + rewrite target `notifyStoreOwnerNewOrder_user_id_writer`
- `phase1-authority-contract.ts` — `MEMBER_APP_ICON_EXCLUSIONS_LOCKED` includes `C_store`, `owner_intake`; `NATIVE_APP_ICON_BLOCKS_STORE_AXES = true`
- Documented Phase B violations still list historical `owner_intake_*` / `store_new_order_written_as_user_id_notification_event`

---

## 5. Authority decision for next Contract step (not implemented)

1. **Single C formula** = Action Required work items on `store:{storeId}` (at minimum: pending accept, refund, open inquiry; decide cancel_requested + review).
2. **Event writers** must not mint Member A eligibility; store identity required.
3. **Read-clear** paths apply only to Owner Tier1 **inbox UX**, never as Hub C clear.
4. **B_store** stays room-unread; strip from any “ops attention” sum presented as C.

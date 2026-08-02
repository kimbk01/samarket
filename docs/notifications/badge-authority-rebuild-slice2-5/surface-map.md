# Slice 2-5 — C_store Surface Map

**Status:** AUDIT ONLY  
**HEAD:** `c673ac444`

---

## 1. Surface reach matrix

| Event / count | Owner Dashboard | Owner Hub badge API | FAB orders | FAB store | FAB chat (B) | Owner Tier1 commerce | Header ops sum | MyPage storeAttention | Member Bell | Member App Icon | Native |
|---------------|-----------------|---------------------|------------|-----------|--------------|----------------------|----------------|-----------------------|-------------|-----------------|--------|
| `pending` / Hub orderAttention | KPI / Urgent | YES | YES | — | — | via notify/target | YES (mixed) | YES (pending+refund) | NO (digit) | NO | NO |
| `refund_requested` | KPI | YES | YES | — | — | YES | YES (mixed) | YES | NO | NO | NO |
| `cancel_requested` | process / tabs | **NO Hub count** | **NO** | — | — | UNPROVEN | NO | NO | NO | NO | NO |
| Open inquiry | KPI | YES inquiryAttention | — | YES | — | weak/target | YES (mixed) | NO | NO | NO | NO |
| Review need reply | `reviews_need_reply_count` | ownerReviewAttention **if** targets | — | YES if >0 | — | UNPROVEN | YES (mixed) | NO | NO | NO | NO |
| Cooking / delivery steps | process CTA / SLA | NO | NO | NO | — | reminders only | NO | NO | NO | NO | NO |
| `owner_intake` events | — | indirect via targets max | max() | — | — | YES list | — | — | excluded digit | excluded | blocked |
| Owner SO chat unread | — | storeOrderChatUnread | — | — | **YES B_store** | — | **mixed into sum** | — | NO | NO | NO |

---

## 2. Surface chains (as observed)

### Chain A — State C (correct shape)

```text
store_orders / store_inquiries (store_id)
  → get_owner_hub_store_attention_counts
  → /api/me/store-owner-hub-badge
  → FAB orders / FAB store
  → Owner ops Dashboard (cousin KPIs)
```

### Chain B — Event C written as member-scoped (rewrite debt)

```text
notifyStoreOwner* → appendUserNotification(user_id)
  → attention_key order_status:owner_intake:{orderId}
  → Owner commerce Tier1 list
  → bumpNotificationTarget → fab_owner_orders
  → max() into Hub orderAttention
  ↛ Member Bell digit (Slice 2-2 filter)
  ↛ Member App Icon A-axis (PRODUCT LOCK)
```

### Chain C — Presentation mix (ops + chat)

```text
orderAttention + inquiryAttention + ownerReviewAttention + storeOrderChatUnread
  → resolveOwnerOperationsCenterAttentionCount
  → Stores header / deprecated ops toggle
```

**Route out of C:** chat term is **B_store**, not Action Required.

---

## 3. Surfaces that must stay OUT of C (locked exclusions)

| Surface | Authority |
|---------|-----------|
| Member Bell | A_member |
| Member App Icon (web) | A + B_member |
| Bottom messenger tab | B_member |
| Customer order hub | B_member (buyer SO) |
| Owner FAB **chat** digit | B_store |
| Native / FCM member icon | Slice 2-6 echo of member App Icon |

---

## 4. Owner Tier1 commerce inbox

- **Not** Member Bell.
- Today identity: owner `user_id`.
- Clear: **read** (not Action Complete).
- Classification: **ROUTE** — presentation for ops inbox is allowed; must not feed A_member; long-term identity `store:{storeId}`.

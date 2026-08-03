# C_store — Store Operation Runtime Map (Phase 2A)

**HEAD:** `1e2a560c1` · Runtime edits: none

```text
C_store = OwnerOperationAttentionCount(store_id)
B_store ≠ C_store
C_store ∉ Member Bell / Member App Icon / Native App Icon (BLOCK)
```

---

## Writers (pollution path)

| File | Symbol | Event | Identity written | Target | Verdict |
|------|--------|-------|------------------|--------|---------|
| `notify-store-commerce.ts` | `notifyStoreOwnerNewOrder` | new order | `owner_user_id` via `appendUserNotification` | should be `store:{storeId}` | **REWRITE** |
| same | accept reminders / buyer cancel / sold_out / refund… | ops | owner user_id | C_store | **REWRITE** |
| `notification-attention-key.ts` | owner_intake key | compress | used in A digit | C only | **REWRITE** |
| Hub attention | `resolveOwnerHubBadgeStoreAttentionFromHubStore` | pending/refund/inquiry counts | **store_id** | C-like | **KEEP** as C source candidate |
| Targets bundle | `fab_owner_orders` / notification-targets | ops | store/hub | C | **KEEP**/ROUTE |

Evidence — new order writer always:

```text
stores.owner_user_id → appendUserNotification({ user_id: ownerId, meta.kind: store_order_created, meta.store_id })
→ attention order_status:owner_intake:{orderId}
→ loadBellExplainUnreadEventRows(user_id)
→ buildNotificationAttentionProjection (not excluded)
→ Bell + App Icon notification axis
```

---

## Surfaces

| Surface | Source today | Verdict |
|---------|--------------|---------|
| Owner FAB orders | `orderAttention` (hub) | **KEEP** as C projection |
| Delivery bottom / owner lite | `orderAttention` policies | **KEEP**/ROUTE |
| Member Bell | NotificationAttention incl. owner_intake | **DELETE** from A |
| Member App Icon | same attention total | **DELETE** from A |
| Native App Icon | via appIconTotal | **BLOCK** C |

---

## Decrease (action-complete)

| Trigger | Expected | Today | Verdict |
|---------|----------|-------|---------|
| Accept / reject order | C −1 | hub pending recompute + event supersede | **ROUTE** — define action-complete; **no** clear on mere open |
| Screen open only | no C clear | must verify | **BLOCK** open-as-read for C |

---

## FCM / deep link

| Item | Evidence | Verdict |
|------|----------|---------|
| Owner push badge | `badge_count=appIconTotal` (member contaminated) | **REWRITE** transport; C not in member badge |
| Target href | `buildOwnerStoreOrderNotificationHref` in notifyStoreOwnerNewOrder | **KEEP** direction; lock `/stores/owner/{storeId}/orders/{orderId}` + membership |

---

## Slice

**2-5 C_store** after B_store isolation so FAB chat vs ops stay separate.

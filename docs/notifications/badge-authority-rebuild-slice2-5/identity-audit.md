# Slice 2-5 — C_store Identity Audit

**Status:** AUDIT ONLY  
**HEAD:** `c673ac444`  
**Goal:** C_store identity = `store:{storeId}` **100%**

---

## 1. Identity summary

| Path | Identity used | Meets C goal? |
|------|---------------|---------------|
| `get_owner_hub_store_attention_counts(p_store_id)` | `store_id` | **YES** |
| Legacy `countPendingAcceptForStore` / refund / open inquiries | `store_id` | **YES** |
| Hub memory cache key for store attention | `store_id` | **YES** |
| Hub badge route resolves active hub store then counts | store-scoped counts under owner session | **YES** (count) / session is owner user |
| `notifyStoreOwnerNewOrder` et al. | `stores.owner_user_id` → `notification_events.user_id` | **NO** — `user:{ownerId}` |
| Attention key `order_status:owner_intake:{orderId}` | keyed on user events | **NO** as authority identity |
| `bumpNotificationTargetFromInboxRow` (`owner_order`) | `userId` + optional `storeId` meta | **PARTIAL** |
| `fab_owner_orders` / `fab_owner_store` aggregate | primarily `user_id` | **PARTIAL / NO** |
| Owner commerce Tier1 unread | `user_id` | **NO** |
| Classifier design `C_STORE_OPERATION` | requires `storeId` → `store:{id}` | **YES** (contract); writers violate |
| Points / fee notify | owner `user_id` | **NO** |

---

## 2. Per-event identity checklist

| Event | Live write identity | Target identity | Gap |
|-------|---------------------|-----------------|-----|
| New order pending (DB) | `store_id` on `store_orders` | `store:{storeId}` | none for Hub state |
| New order notify | `user:{ownerId}` | `store:{storeId}` | **REWRITE** |
| Accept reminder 30s/60s | `user:{ownerId}` | `store:{storeId}` | **REWRITE** |
| Payment completed notify | `user:{ownerId}` | `store:{storeId}` | **REWRITE** |
| Buyer cancelled notify | `user:{ownerId}` | `store:{storeId}` | **REWRITE** |
| Refund requested (DB) | `store_id` | `store:{storeId}` | none for Hub state |
| Refund requested notify | `user:{ownerId}` | `store:{storeId}` | **REWRITE** |
| Sold-out notify | `user:{ownerId}` | `store:{storeId}` | **REWRITE** |
| Open inquiry | `store_id` | `store:{storeId}` | none |
| Cancel requested (DB) | `store_id` | `store:{storeId}` | Hub count missing |
| Review need reply | weak / dashboard | `store:{storeId}` | **UNPROVEN** FAB |
| Fee / points owner | `user:{ownerId}` | store or platform lane | **ROUTE** |

---

## 3. Violations to fix later (CODE — not this step)

1. All `notifyStoreOwner*` must stop being the authority identity for C (either store-scoped projection or non-authority inbox).
2. Hub `max(state, fab_owner_orders)` must not reintroduce user-scoped unread as C truth without store key.
3. Owner Tier1 may remain a **presentation** surface but cannot define C identity.

---

## 4. Product note (1 account ↔ 1 store)

Current product: one active store per owner account → multi-store runtime **NOT_APPLICABLE** for identity collisions today.  
Contract still requires `store:{storeId}` so multi-store cannot silently reuse `user:{ownerId}`.

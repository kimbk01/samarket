# Slice 2-5 — Notification Inbox vs C_store Separation

**Status:** AUTHORITY CONTRACT LOCK  
**HEAD:** `c673ac444`

---

## 1. Two independent signals

| Signal | Channel | Clear |
|--------|---------|-------|
| Owner ops inbox / `owner_intake` row | notification transport | **read** / dismiss / supersede |
| C_store Action Required | store ops state / action ledger | **Action Complete** |

```text
notification read  →  inbox unread may ↓
operation complete →  C_store ↓

These are NOT the same decrease.
```

---

## 2. owner_intake contract

| Clause | Lock |
|--------|------|
| Classification (routing) | `C_STORE_OPERATION` when storeId present |
| Authority identity | must be `store:{storeId}` (REWRITE from `user:{ownerId}`) |
| Is C truth by itself? | **NO** (`ownerIntakeNotificationIsCTruth() === false`) |
| Member Bell | **forbidden** |
| Member App Icon | **forbidden** |
| Native Member App Icon | **blocked** (store axes) |

Writers (`notifyStoreOwner*`) remain **REWRITE** debt — not modified in Contract step.

---

## 3. Worked examples

### A. Read without accept

1. New order → `NEW_ORDER_PENDING` opens → C +1  
2. Owner reads Tier1 notification → inbox read  
3. Order still `pending` → **C unchanged**

### B. Accept without reading inbox

1. Owner accepts order → Action Complete  
2. C −1  
3. Inbox row may still exist → **inbox ≠ C**

### C. Chat message

1. Customer sends order-chat message → B_store +1  
2. C unchanged  
3. Owner reads chat → B_store −1 · C unchanged

---

## 4. Dual source ban (related)

`fab_owner_orders` unread targets often track inbox/notify state.  
Using `max(stateCount, fab_owner_orders)` as Hub C **re-imports read-authority into ops count** → **FORBIDDEN**.

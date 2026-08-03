# Member / Store Identity Contract (Gate 2)

---

## Keys

```text
member:{userId}   // UUID user
store:{storeId}   // UUID store
delivery_only     // no badge authority recipient
```

Same human may hold both; **authorities never merge**.

```text
user U owns store S1 and S2
→ C(S1) and C(S2) computed independently
→ UI shows only activeStoreId
→ A(U) never includes C(S1) or C(S2)
```

---

## Writer rules

| Event class | Must write recipient |
|-------------|----------------------|
| Member A events | `member:{buyerOrMemberUserId}` |
| Member B unread | participant user on room |
| Store ops | `store:{storeId}` only |
| Owner chat unread | store-scoped room participants; aggregate key `store:{storeId}` |

### Forbidden (Gate 1 proven violation — contract bans)

```text
notifyStoreOwner* writing order_status:owner_intake to owner user_id
  as Member A / Bell / Member App Icon authority
```

Cutover: ROUTE those writers to `store:{storeId}` operational facts (existing `store_orders` / inquiries already are C truth). User_id `owner_intake` events: stop new writes; drain/exclude from A.

---

## Reader rules

| Reader | Allowed identity |
|--------|------------------|
| Bell / A | current session member id only |
| B hubs | current member participant rooms |
| Owner UI | activeStoreId; verify membership/ownership |
| Owner push | `recipientStoreId` must match before switching active store |

---

## Multi-store isolation tests (contract)

```text
C(S1) change ↛ C(S2)
C(S1) change ↛ A(U)
C(S1) change ↛ Member App Icon
```

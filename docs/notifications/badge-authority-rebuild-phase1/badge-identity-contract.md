# Badge Identity Contract (Phase 1)

**Status:** CONTRACT LOCK  
**Baseline:** Phase 0 `badge-identity-scope-audit.md` (read-only)

---

## 1. Identity keys

| Scope | Key | Owns |
|-------|-----|------|
| Member notifications A | `user:{user_id}` | Persistent member inbox unread |
| Member communication B | `user:{user_id}` | GD / Group / Trade / customer SO rooms + member missed calls |
| Store communication B | `store:{store_id}` | Unread customer→store order chat rooms (+ store-scoped missed if any) |
| Store operations C | `store:{store_id}` | Action-required order work |

```text
user:{id}  ≠  store:{id}
```

Even when the raw UUID strings match, keys are not interchangeable.

---

## 2. Rules

1. Do not compute all badge digits from bare `user_id`.  
2. Store chat B is **not** owned by the logged-in member `user_id` as authority key.  
3. Multi-store owners: B and C computed **per store**; never force-sum into one member authority.  
4. Owner chat B and owner operation C are stored/API/projection **separate**; UI may sum only as `OwnerPresentationTotal` (non-authority).  
5. Member App Icon never includes store-scoped owner B or C.

---

## 3. Contamination (documented from Phase 0 — not fixed here)

| Path | Issue |
|------|-------|
| `notifyStoreOwnerNewOrder` → `appendUserNotification(ownerId)` | C written as member-scoped event |
| Bell digit from `eq(user_id)` attention keys | Pulls owner_intake into A/Bell |
| ChatAttention includes `ownerOrderRoomIds` | Store B folded into member App Icon |

Phase 2 KEEP/ROUTE/DELETE decisions depend on this contract — not applied in Phase 1.

# Badge Event Classification Contract (Phase 1)

**Status:** CONTRACT LOCK  
**Module:** `BADGE_EVENT_CLASSIFICATION_TABLE` in `phase1-authority-contract.ts`  
**Rule:** One event → at most one of A / B / C.

---

## Classification table

| Event | A | B | C | Bell | App Icon |
|-------|---|---|---|------|----------|
| General message | 0 | 1 | 0 | 0 | B |
| Group message | 0 | 1 | 0 | 0 | B |
| Trade counterpart message | 0 | 1 | 0 | 0 | B |
| Customer → store message | 0 | 1 | 0 | 0 | B |
| Store → customer message | 0 | 1 | 0 | 0 | B |
| Trade status change | 1 | 0 | 0 | A | A |
| Customer order status change | 1 | 0 | 0 | A | A |
| Store new order | 0 | 0 | 1 | 0 | 0 |
| Store action-required | 0 | 0 | 1 | 0 | 0 |
| Service notice | 1 | 0 | 0 | A | A |
| Security alert | 1 | 0 | 0 | A | A |
| Marketing ephemeral FCM | 0 | 0 | 0 | 0 | 0 |
| Real missed call | 0 | 1 | 0 | 0 | B |
| Completed call record | 0 | 0 | 0 | 0 | 0 |

---

## Explicit violations (live Phase B)

| Live behavior | Contract |
|---------------|----------|
| `order_status:owner_intake:*` in NotificationAttentionTotal | **Forbidden** — not A, not Bell |
| `store_order_created` (and related owner meta kinds) on owner `user_id` events counted in Bell | **Forbidden** — C only under `store:{store_id}` |
| Orphan missed_call counted as Bell/NotificationAttention | **Forbidden** — B only |
| Chat message types in Bell digit | **Forbidden** (Phase B already excludes from digit; must stay excluded from A) |

---

## B vs C at the same store

| Event | Axis | Identity |
|-------|------|----------|
| Customer sends order chat to store | **B** | `store:{store_id}` |
| New order / accept waiting / action required | **C** | `store:{store_id}` |

Same `store_id` scope does **not** merge authorities.

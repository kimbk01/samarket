# Slice 2-5 — C_store Increase / Decrease Contract

**Status:** AUTHORITY CONTRACT LOCK  
**HEAD:** `c673ac444`

---

## 1. Increase

C increases only when a **new** Action Required opens:

```text
new actionId → C_store +1
```

**Does not increase** (idempotent re-delivery):

- realtime re-receive
- FCM re-receive
- bootstrap / refresh / resume
- duplicate notification event
- Hub snapshot recompute of same actionId

**Unique identity:**

```text
actionId = store:{storeId} | actionType | sourceEntityId
```

---

## 2. Decrease (Action Complete only)

### Allowed complete triggers

| Trigger | Applies to |
|---------|------------|
| `ORDER_ACCEPT_COMPLETE` | NEW_ORDER_PENDING |
| `ORDER_REJECT_COMPLETE` | NEW_ORDER_PENDING |
| `REFUND_RESOLVE_COMPLETE` | REFUND_REQUESTED |
| `CANCEL_RESOLVE_COMPLETE` | CANCEL_REQUESTED |
| `INQUIRY_RESOLVE_COMPLETE` | OPEN_STORE_INQUIRY |
| `ACTION_CANCELLED_NO_LONGER_REQUIRED` | any (no longer actionable) |

### Forbidden decrease triggers

| Trigger | Why |
|---------|-----|
| OWNER_HUB_OPEN | screen open |
| ORDER_DETAIL_OPEN | screen open |
| NOTIFICATION_READ | inbox read ≠ work done |
| NOTIFICATION_INBOX_DELETE | dismiss ≠ work done |
| FCM_SELECT | transport |
| SCREEN_REFRESH | recompute only |
| TAB_SWITCH | navigation |
| CHAT_ROOM_READ | B_store clear |

Complete is **idempotent**: re-complete → delta 0.

---

## 3. Read ≠ Complete examples

| Scenario | Inbox | C_store |
|----------|-------|---------|
| Read new-order notification; order still `pending` | may clear | **unchanged** |
| Accept order; inbox row still present | may remain | **−1** |
| Open Owner Hub with 3 pending | — | **unchanged** |
| Read order chat room | B_store may −1 | **unchanged** |

---

## 4. Hub formula vs live code

**Contract:**

```text
C = pending + refund + cancel + openInquiry   (distinct actions)
```

**Live today (`get_owner_hub_store_attention_counts`):**

```text
pending + refund + openInquiry
# cancel_requested omitted → GAP_ADD
# then max(state, fab_owner_orders) → FORBIDDEN dual authority
```

CODE must close GAP and delete max-as-authority — **not in this Contract step**.

# Badge Read / Delete / Process Contract (Phase 1)

**Status:** CONTRACT LOCK  
**Pure helpers:** `applyMemberAMarkAllRead`, `applyCommunicationRoomRead`, `applyMissedCallSeen`, `applyOwnerOrderAccept`, `fcmContractForPushKind`

---

## 1. A increase

Only when a persistent member notification event is created:

```text
recipient_scope = member
recipient_identity_key = user:{user_id}
persists_in_inbox = true
read_at = null
deleted_at = null
```

FCM send/receive success alone must not increment A.

---

## 2. A decrease

### Item select / read

```text
read_at set → A −1 → Bell −1 → App Icon A component −1 → navigate target
```

Read before route success; keep read if navigation fails.

### Mark all read

```text
A → 0, Bell → 0, App Icon removes A only
B unchanged, C unchanged
```

### Delete

```text
deleted_at set
If was unread → immediate A exclusion
```

---

## 3. B message increase / read

Increase: new `message_id`, correct recipient identity, not self, after read cursor → room message +1; 0→1 room → unread room count +1. Dedup by `message_id`.

Read (room readable + cursor confirmed):

```text
row messages → 0
unread room count → −1
hub → −1 (domain hub)
Bottom Chat → −1 if GD/Group
App Icon B → −1
```

Never subtract message count from hub/App Icon.

---

## 4. B missed call

```text
call_id → at most one unresolved missed
seen_at → unresolved −1, App Icon B −1 once
```

Double decrement (stub + event) = contract failure.

---

## 5. C

Increase: `store:{store_id}` + action-required transition → C +1. Must not touch A/Bell.

Decrease: only on completed operational action (accept/reject/complete required handling). Mere screen open ≠ clear.

Owner accept: A and B unchanged; C −1.

---

## 6. FCM

Transport only (`isAuthority = false`).

| Kind | persists_in_inbox | badge_effect |
|------|-------------------|--------------|
| marketing_ephemeral | false | none |
| system_persistent / notice_persistent | true | A |
| store_operation | (store surface) | C_store |
| communication | false | B_snapshot (echo) |

Owner new-order open target:

```text
/stores/owner/{storeId}/orders/{orderId}
```

Require store membership + active store context before entry.

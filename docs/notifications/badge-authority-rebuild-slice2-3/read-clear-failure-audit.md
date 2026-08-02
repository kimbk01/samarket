# Slice 2-3 Read-Clear Failure Audit (Part A)

**Status:** ROOT CAUSE CONFIRMED  
**HEAD:** `06bab8001` · Production SHA match  
**Scope:** read cursor / unread room clear only  
**Not in scope:** B_store · C_store · Native · FCM · Bell · Slice 2-4

---

## B. Prior runtime reinterpretation

| Observation | Verdict |
|-------------|---------|
| Already-unread room + more messages → no Hub +1 | **NOT a failure** (room contribution stays 1; row should rise) |
| Bottom / App Icon formulas / owner exclusion / Bell flat / remount | **KEEP — still good** |
| Group/SO clean 0→1 then afterRead stays 1 with HTTP ok | **REAL failure** |

Evidence rooms:

- Group `b7671bc9-…` — xiaomi/samsung: before 0 → after1 1 → afterRead **1** (patch 200)
- SO buyer `817ca93c-…` — before 0 → recv 1 → afterRead **1** (`reads.buyer.ok=true`)
- Samsung GD — bump OK, afterRead stayed 1

---

## C. Read pipeline (summary)

### General / Group / Trade (CM)

`useMessengerRoomOpenMarkReadEffect` → optimistic zero (GD/Group Authority only) →  
`PATCH …/rooms/[id]` `mark_read` + `flushOpen` →  
`markCommunityMessengerRoomAsRead` → `dibay_mark_room_read_atomic`

Idempotency key today:

```text
cm_mark_read:{userId}:{roomId}:open
```

### Customer Store Order

`readOrderChat` → same RPC with:

```text
so_mark_read:{userId}:{roomId}:{role}:open_tail
```

---

## D. Confirmed disconnect stage

**Stage:** server mark-read RPC idempotency hit **before** cursor advance

SQL (`dibay_mark_room_read_atomic`):

```sql
IF FOUND THEN
  RETURN v_prev;  -- stale prior result, no re-mark
END IF;
```

Harness / product pattern:

1. First `flushOpen` / `open_tail` while unread=0 → stores `{ok:true, unreadCount:0}`
2. New messages arrive → participant `unread_count` > 0
3. Second mark with **same key** → returns cached ok/0 **without** moving cursor
4. Client/API treat as success → badge-count still lists the room

This is **not** UI-only zero. Server truth never advances on the second call.

Trade/SO App Icon not moving via optimistic room-fact remains by design (Authority GD/Group only); SO/Trade clear must succeed via participant Facts after a **live** mark-read.

---

## E. Fix applied (narrow)

Tip-scoped open/open_tail idempotency keys:

```text
cm_mark_read:{userId}:{roomId}:open:{tipMessageId|empty}
so_mark_read:{userId}:{roomId}:{role}:open_tail:{tipMessageId|empty}
```

Helpers: `resolveRoomReadableTipMessageId`, `buildCmMarkReadIdempotencyKey`, `buildSoMarkReadIdempotencyKey`  
Call sites: `markCommunityMessengerRoomAsRead` (atomic path), `readOrderChat`

Explicit through-message keys unchanged. No digit math · Native/FCM · Bell · owner exclusion rewrite.

---

## Verdict

**SLICE 2-3 READ-CLEAR ROOT CAUSE CONFIRMED**  
**SLICE 2-3 READ-CLEAR FIX CODE PASS** (`f3dd1bb5d`)  
**SLICE 2-3 REDEPLOYED** · Production SHA match YES  
**SLICE 2-3 B_MEMBER RUNTIME PASS** (Part B clean fixture)  
Slice 2-4 not started.

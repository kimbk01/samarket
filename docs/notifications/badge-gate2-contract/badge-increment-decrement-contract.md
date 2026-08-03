# Increment / Decrement Contract (Gate 2)

---

## Increase

### A

```text
WHEN canonical notification_events INSERT succeeds
 AND recipient_member_id = member
 AND dedupe_key is new (no prior live row)
 AND deleted_at IS NULL AND read_at IS NULL
 AND type ∈ A_INCLUDE
THEN A := A + 1
AND App Icon notification component := A
```

**Never:** FCM resend, app resume, projection rebuild, Cap echo.

### B

```text
WHEN roomUnreadMessages goes 0 → ≥1
THEN B_domain += 1; B += 1; parent hubs/Bottom/App Icon B update from same commit

WHEN roomUnreadMessages goes 1 → N
THEN row only; B_domain unchanged
```

Sender’s own message: no recipient unread increase.

### C

```text
WHEN store Action Required item becomes unresolved for storeId
THEN C_operational(storeId) += 1

WHEN owner chat roomUnread 0 → ≥1 for storeId
THEN C_chat room count += 1
```

Never touch member A/B/App Icon.

---

## Decrease

### Bell single read

```text
Source: user opens Bell item
→ set read_at on that event (canonical) SUCCESS
→ Authority: recompute A
→ Projection: Bell digit, App Icon A+B
→ Final Route: targetRoute
```

Policy:

```text
read mutation SUCCESS then navigate
if navigate fails: read_at stays set (idempotent; no A double-decrement)
```

### Bell mark-all

```text
Target set S =
  recipient_member_id = current
  AND read_at IS NULL
  AND deleted_at IS NULL
  AND type ∈ Bell display / A_INCLUDE
→ set read_at = server_now for all in S on CANONICAL ONLY
→ A = 0; Bell digit = 0; App Icon = B
→ list rows remain (read)
```

**Forbidden:** dual mark-all on legacy `notifications` + events.

### Bell single delete

```text
set deleted_at
if was unread: A -= 1; App Icon update
remove from list immediately
```

### Bell delete-all

```text
set deleted_at on all deletable Bell events for member
A = 0; App Icon = B; list empty (or archive-only rows per security policy)
```

Security/payment records: soft-hide / archive — no hard destroy of source order/trade rows.

### Chat room read

```text
Preconditions ALL true:
  canonical roomId
  user is participant
  timeline viewport mounted
  readable message range + last visible/received id known
  server read cursor ACK success
THEN roomUnreadMessages = 0
SAME authority commit projects:
  row clear
  domain hub room count -1
  Bottom if general/group
  B -1
  App Icon A+B
```

**Forbidden:** each UI independently `-1`.

### Owner C decrease

```text
C_operational: Action Complete (leave Action Required state) — NOT notification read
C_chat: owner room read cursor ACK — same as chat read contract for that room
```

---

## Idempotency

```text
Already read event → read again → A unchanged
Already unread=0 room → mark_read → B unchanged
```

# Unread Room Truth Runtime (Slice 2-3)

## Source of truth

```text
UnreadMessages(room, recipient) =
  messages after recipient read cursor
  excluding sender-self
  excluding deleted / non-readable

UnreadRoom = UnreadMessages > 0
```

Cached `participants.unread_count` is the RoomUnread projection SSOT for list rows.  
Hub / Bottom / App Icon B use **room set sizes**, never Σ message counts.

## Comparator (fixtures)

`lib/notifications/badge-authority-rebuild/unread-cursor-truth-plan.ts`

- `deriveUnreadTruthForRoom`
- `compareUnreadTruthToProjection`
- `auditUnreadProjectionForIdentity`

## Runtime compare checklist

Per room:

1. latestReadableMessageId  
2. recipientReadCursorId  
3. derivedUnreadMessageCount  
4. cachedUnreadMessageCount (`participants.unread_count`)  
5. unreadRoomSet membership  
6. hub / bottom / appIcon membership  

Fail on: alias+canonical dup · bootstrap+RT dup · customer+owner double · domain key + raw id double.

## Product surfaces

| Surface | Truth unit |
|---------|------------|
| List row | message count |
| Bottom / Trade Hub / Customer Hub | room count |
| Member App Icon B rooms | room count |
| Missed B | call_id unresolved count |

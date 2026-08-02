# Slice 2-2 — Member Notification A Runtime

**HEAD base:** `ca86a20c1` (Slice 2-1)  
**Scope:** Bell = A_member only. App Icon / FCM / Native / B / C writers **not** rewritten.

## A source

`deriveMemberUnreadNotificationCount` / `buildMemberNotificationAProjection`  
File: `lib/notifications/badge-authority-rebuild/member-notification-a-projection.ts`

Filters out: chat types, missed_call, owner_intake / owner commerce meta, marketing, dismissed/expired, unknown.

## Bell wire

```text
loadBellExplainUnreadEventRows
  → deriveMemberUnreadNotificationCount  → memberUnreadNotificationCount
  → buildNotificationBadgeProjection.bellTotal
  → HTTP total / projection.bellTotal
  → client Apply → Bell store
```

`notificationAttentionTotal` remains Phase B for **App Icon** axis until later slices.

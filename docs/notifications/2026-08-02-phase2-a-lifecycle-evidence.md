# Phase 2 — A Notification Lifecycle Evidence (2026-08-02)

**Status:** Phase 2 CODE + contract tests  
**NOT declared:** HARD LOCK · RUNTIME PASS · PRODUCT PASS

## Gaps closed

| Gap | Fix |
|-----|-----|
| G-MARK-01 legacy mark-all | Phase1: exclude chat/missed/owner on legacy `notifications` |
| Mark-all optimistic only cleared adminNotice | `member_notification_a_absolute=0` → full A digit 0; B rooms/orphan untouched |
| A create may leave stale badge cache | `createAndDispatchNotificationEvent` → `invalidateNotificationBadgeCache` |
| Delete-all Member A missing | `delete_all_member_a` API + `deleteAllMemberANotificationEvents` + Tier1/My UI |
| Push tap | KEEP: `PushRouteListener` → `postNotificationEventOpenedRead` + ACK/resync |

## Key files

- `lib/notifications/projection-authority.ts` — `member_notification_a_absolute`
- `lib/notifications/client/notification-events-read-resync.ts`
- `lib/notifications/pipeline/notification-event-dispatcher.ts`
- `lib/notifications/inbox-read-bridge.ts` — `deleteAllMemberANotificationEvents`
- `app/api/me/notifications/route.ts`
- `components/philife/PhilifeHeaderNotificationInbox.tsx`
- `components/my/MyNotificationsView.tsx`
- i18n: `notif_tier1_delete_all`, `notif_tier1_delete_all_confirm` (ko/en)

## Vitest

```
badge-axis-a-lifecycle-contract.test.ts
notification-events-read-resync.test.ts
projection-authority-p0-3-contract.test.ts (+ member A absolute)
badge-axis-taxonomy.test.ts
apply-badge-count-orphan-missed-wire.test.ts
ios-push-tap-route-contract.test.ts
→ 30 passed
```

## Next (no ask)

Phase 3 — B Communication chain (Row → Hub → Bottom → App Icon).

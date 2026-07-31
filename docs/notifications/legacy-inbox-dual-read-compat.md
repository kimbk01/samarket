# Legacy inbox dual-read — compatibility adapter

**Status:** Isolated (2026-07-31 Phase B)  
**Adapter:** `lib/notifications/legacy-inbox-compatibility-adapter.ts`

## Facts

- New product writes use `notification_events` via `createNotificationEvent` / `appendUserNotification`.
- Direct `notifications` INSERT is banned (`legacy-notification-write-ban.test.ts`).
- Inbox GET may still merge historical `notifications` rows for display.

## Policy

- Bell / badge **count authority** remains `notification_events` (+ domain room projection).
- Legacy table is **read compatibility only**.
- **Sunset review date:** 2026-09-01 — if Production has 0 unmatched legacy writers, remove dual-read.
- **DROP** of `notifications` is a separate approved migration (not this Phase).

## DO NOT

- Add new writers to `notifications`
- Sum Bell count from legacy message rows
- Convert `segment` campaigns or friend-request writers via legacy table

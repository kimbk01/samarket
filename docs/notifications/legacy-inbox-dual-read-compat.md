# Legacy inbox dual-read — compatibility adapter

**Status:** Runtime dual-read **REMOVED** from product Bell list (2026-07-31 Phase 2)  
**Adapter:** `lib/notifications/legacy-inbox-compatibility-adapter.ts` (history / PATCH only)

## Facts

- New product writes use `notification_events` via `createNotificationEvent` / `appendUserNotification`.
- Direct `notifications` INSERT is banned (`legacy-notification-write-ban.test.ts`).
- **GET `/api/me/notifications` list Authority = `notification_events` only** (`legacy_merge: false`).
- Bell digit and list unread set share `count_notification_events_badge` / event rows.
- Legacy `notifications` table is **not** merged into Bell list. PATCH mark-all may still clear legacy history rows.

## Measured (viewer asas55, 2026-07-31)

| Source | Unread count |
|--------|-------------:|
| Bell digit / `notification_events` | 63 |
| Legacy `notifications` is_read=false | 299 (31–90+ days; mostly chat "새 메시지" without dedupe) |
| Dedupe overlap with events | 0 |

Legacy 299 = historical compatibility backlog, **not** Bell digit Authority.

## Policy

- Bell / badge **count** = `notification_events` (Contract B).
- Bell **list** = `notification_events` presentation rows + `unread_total` from same badge RPC.
- Legacy table = history keep / quarantine — **DO NOT** reintroduce dual-read merge without explicit product approval.
- **DROP** of `notifications` is a separate approved migration (not this Phase).

## DO NOT

- Add new writers to `notifications`
- Sum Bell count from legacy message rows
- Merge legacy unread into product Bell list
- Convert `segment` campaigns or friend-request writers via legacy table

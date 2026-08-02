# Notification Inbox UI/UX (Slice 2-2)

## Surfaces

- Header popover: `PhilifeHeaderNotificationInbox`
  - list fetch: exclude chat + owner commerce
  - client filter: A_member only on `tier1_inbox_bell`
- Full page: `/my/notifications` via `MyNotificationsView`
  - same excludes + A filter
  - chips: 전체 / 배달 / 거래 / 공지 (chat·marketing tabs removed)

## Mark-all / dismiss

Existing header/my flows; mark-all body = A-only path.

## Not in this slice

Full popover chrome redesign, dedicated `/notices` member domain, server-side A-only list query rewrite.

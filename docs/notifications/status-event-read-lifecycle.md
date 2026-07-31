# Status event read lifecycle — LOCK (2026-07-31)

**Scope:** Bell `order_status` / `trade_status` (and `delivery_status`) unread attention.  
**Authority:** `notification_events` (Bell digit + Inbox list).  
**DO NOT:** bulk-mark all status events read; terminal-state-only auto-hide of unseen events.

## Confirmed UX (code + product)

| Trigger | Behavior | Code |
|---------|----------|------|
| Bell row tap (individual) | That event `read_at` / `unread=false` only | `markNotificationRead` / PATCH ids |
| Order destination opened | Status events for **that order** → read | `markOrderNotificationsRead` → `markOrderNotificationEventsRead` |
| Trade detail opened | Trade status events for **that product** → read | `markNotificationThreadRead` + `readReason: trade_detail_opened` → `markTradeStatusNotificationEventsReadByProductId` |
| Room chat read | Chat/message events for room; **not** status-only clear | `markRoomRead` / room cursor |
| Mass “mark all status read” | **Forbidden** as product heal | — |

## Explicit non-goals

- Do **not** mark `order_status` / `trade_status` read solely because order/trade is `completed` / `cancelled`.
- Do **not** remove chat room unread because a status Bell row was read.
- Do **not** compress Bell digit by deleting history rows; optional future attention projection is separate.

## Bell digit after heal (QA viewer, evidence)

```text
order_status 47 + trade_status 9 + admin_notice 6 + chat_message 1 = 63
```

These remain until individual Bell read or destination-entry read above.

Digit policy (**A** raw unread events) and Inbox digit/list/mark-all consistency:
`docs/notifications/bell-digit-and-inbox-product.md`.

## Related

- Bell list Authority: `docs/notifications/legacy-inbox-dual-read-compat.md` (events-only)
- Badge surface map: `docs/community-messenger/2026-07-31-badge-authority-map-lock.md` §5

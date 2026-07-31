# Status event read lifecycle — LOCK (updated 2026-08-01)

**Scope:** Bell `order_status` / `trade_status` (and `delivery_status`) unread attention.  
**Authority:** `notification_events` (Bell digit + Inbox list).  
**Parent SSOT:** `docs/notifications/notification-event-ssot.md`

## Confirmed UX (code + product)

| Trigger | Behavior | Code |
|---------|----------|------|
| Bell row tap (individual) | Thread plan → order/trade/room/single read | `markNotificationRead` / PATCH ids + `resolveInboxBellThreadRead` |
| Order destination opened | Status events for **that order** → read | `markOrderNotificationsRead` → `markOrderNotificationEventsRead` |
| Trade detail opened | Trade status for **that product** → read | `trade_detail_opened` → `markTradeStatusNotificationEventsReadByProductId` |
| Room chat read | Events with that `room_id`; **not** status-by-order payload | `markRoomRead` |
| Buyer **new** status notify | Prior unread status for **same order** → read, then insert latest | `markPriorBuyerOrderStatusNotificationsRead` before `notifyBuyerStoreOrderOwnerStatus` |
| Owner **status transition** | Owner unread status for **that order** → read | `applyStoreOrderStatusTransition` → `markOrderNotificationsRead` |
| Mass “mark all status read” as heal | **Forbidden** | — |

## Buyer order status: Attention = 1

For `accepted → preparing → … → completed`:

- Each transition **creates** a new event (history retained).
- Prior unread for that order are **read** before insert.
- Bell unread for that pipeline stays **≤ 1 per order**, not N.

## Explicit non-goals

- Do **not** delete history rows when superseding.
- Do **not** clear chat room unread because a status Bell row was read.
- Do **not** use `mark_all_owner_store_commerce_read` from a single-order Bell deep link.

## Related

- Bell digit: `docs/notifications/bell-digit-and-inbox-product.md`
- Events-only list: `docs/notifications/legacy-inbox-dual-read-compat.md`

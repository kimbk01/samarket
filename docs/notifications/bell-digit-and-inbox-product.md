# Bell digit · Inbox (aligned with Notification Event SSOT)

**Canonical product model:** [`notification-event-ssot.md`](./notification-event-ssot.md)

## Digit

```text
Bell digit = unread notification_events for the viewer
            AFTER create / dedupe / supersede / destination-end rules
```

This is **not** “naïve raw business transitions forever.”

| Pipeline | Bell unread meaning |
|----------|---------------------|
| Buyer order status chain | **Attention ≈ 1 / order** (prior status auto-read before next insert) |
| Owner new_order / intake | **1 / order** until destination open **or** status transition by owner |
| Owner fee / points | Separate attention |
| Chat messages | Unread events until room read (room may hold many events) |
| Admin notice | One per campaign dedupe |

Optional future: digit = distinct `attention_key` among unread rows. Only after every writer ends prior keys consistently — do not shrink the number in UI alone.

## Digit / list / mark-all

Full Header Bell + `/my/notifications` must include chat + owner commerce so list matches digit.  
「모두 읽음」 on full Inbox = `mark_all_read` → events only (not room cursors / App Icon rooms).

## Measurement note (asas55)

Snapshot Bell 63 → later 23; remaining order_status were **owner intake**, not buyer status stacks.

## Related

- Lifecycle: `status-event-read-lifecycle.md`
- Events-only list: `legacy-inbox-dual-read-compat.md`

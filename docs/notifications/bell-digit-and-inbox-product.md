# Bell digit · Inbox product authority (2026-08-01)

## Digit meaning — **A. unread raw event count**

```text
Bell digit = count of approved unread notification_events for the viewer
```

Not App Icon rooms. Not compressed “attention” projection.

### Measurement (QA viewer asas55)

| Moment | Bell | order_status | distinct orders | max / order | trade_status |
|--------|------|--------------|-----------------|-------------|--------------|
| Snapshot matrix | 63 | 47 | (many fee + new-order) | — | 9 |
| Product PASS step1 | 23 | 21 | 20 | 2 | 0 |

`max_per_order = 2` on remaining unread → **order-level attention compression would barely change the digit**. Keep **A**. Manageability comes from Inbox list + filters + role labels + mark-all, not digit rewrite.

DB history is retained. Optional future **B** (actionable attention) requires digit builder + Inbox grouping + tests + docs in one change — do not shrink the number alone.

## Digit / list / mark-all consistency

| Surface | Must include |
|---------|----------------|
| Bell digit | All approved unread `notification_events` |
| Header Bell + `/my/notifications` list | Same set (chat + owner commerce + status) |
| 「모두 읽음」 on full Inbox | `mark_all_read` → events only (not room cursors / App Icon rooms) |

**DO NOT** default `exclude_owner_store_commerce=1` on the full Bell list — that hid owner `order_status` while the digit still counted them.

Consumer-only delivery hub may still pass `excludeOwnerStoreCommerce: true`.

## Presentation

`bell_presentation_type` on mapped rows drives surface badges:

- `customer_order_*` vs `owner_order_*`
- `trade_message` vs `trade_status`
- general / group / system / missed_call

Owner status without `routeUrl` falls back to `/stores/owner/orders?…`, not customer mypage.

## Related

- Status read lifecycle: `docs/notifications/status-event-read-lifecycle.md`
- Events-only list: `docs/notifications/legacy-inbox-dual-read-compat.md`

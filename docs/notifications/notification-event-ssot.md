# Notification Event SSOT (LOCK candidate — 2026-08-01)

**Scope:** Canonical `notification_events` row lifecycle.  
**Above** Badge / App Icon / Bottom projections.  
**DO NOT** redefine App Icon as Bell digit. Surfaces project from events + room facts; they are not free-floating counters.

```text
Business Event
      ↓
Notification Event  (this SSOT)
      ↓
Bell digit / Inbox list
      ↓
FCM / APNS payload (badge_count = App Icon projection, not Bell)
      ↓
App Icon / Bottom / Trade / Order hubs  (domain room / role Facts)
```

---

## 1. Answers to product questions (evidence-backed)

### Q1 — When is a `notification_event` created?

| Domain | Business trigger | Writer | `type` | dedupe_key (examples) |
|--------|------------------|--------|--------|------------------------|
| Buyer order status | Owner/admin status transition | `notifyBuyerStoreOrderOwnerStatus` | `order_status` | `commerce:buyer:owner_status:{orderId}:{status}` |
| Owner new order | Buyer places order | `notifyStoreOwnerNewOrder` | `order_status` | `commerce:owner:new_order:{orderId}` |
| Owner cancel / payment / fee / reminder | commerce helpers | `appendUserNotification` | `order_status` | `commerce:owner:…` |
| Trade status | offer / complete flows | `appendUserNotification` | `trade_status` | trade meta kinds |
| Chat / group / trade / SO message | send pipeline | `notifyMessagePipeline` | `*_message` | `msg:{roomId}:{messageId}` |
| Missed call | call end | `notifyMissedCallPipeline` | `missed_call` | `missed:{sessionId}:{userId}` |
| Admin notice | campaign send | `sendCampaignToUser` | `admin_notice` | `admin_campaign:{id}:{userId}` |

**Insert SSOT:** only `createNotificationEvent` (`notification-event-repository.ts`).  
**`delivery_status`:** no live writer; buyer delivery-flavored pushes are stored as `order_status`.

### Q2 — When does an event end?

There is **no archive column**. End = soft:

| End mode | Columns / payload |
|----------|-------------------|
| Read | `unread=false`, `read_at` (± `opened_at`) |
| Inbox dismiss | same + `display_payload.inbox_dismissed_at` / `deleted_at` |
| History | row **retained** forever (unless hard-delete migration) |

**Read triggers (product):**

| Trigger | Scope |
|---------|--------|
| Bell row tap | Thread plan → order / trade / room / single id |
| Order destination opened | All unread `order_status`(+`delivery_status`) for **that `order_id`** |
| Trade detail opened | All unread `trade_status` for **that product** |
| Room visible | All unread events with that **`room_id`** (messages; not status-by-payload) |
| Bell mark-all | All unread `notification_events` for viewer (**not** room cursors) |
| **Buyer status supersede** | Before inserting next buyer status for same order → prior unread status for that order → read |
| **Owner order handled** | Owner/admin **status transition** on order → owner unread status for that order → read (see §3) |

**Explicit non-goal:** terminal `completed` alone without user/destination/supersede path does **not** invent a second mass-clear. Buyer `completed` notify already supersedes prior via `markPriorBuyerOrderStatusNotificationsRead`.

### Q3 — Is Bell digit “raw unread event count” the product definition?

**Partial truth only.**

```text
Bell digit = count(unread notification_events after writer supersede / destination end rules)
```

It is **not** “every historical business transition forever as separate unread.”  
Writers that forget to **end** prior attention for the same `attention_key` inflate Bell (this is how 63 became unmanageable).

### Q4 — Order status: Event or Attention?

| Pipeline | Unit | Behavior |
|----------|------|----------|
| **Buyer** `pending→…→completed` | **Attention (1 per order)** | Each transition inserts a new event; **prior unread for that order are read first**. History keeps N rows; **Bell unread ≤ 1** per order for this pipeline. |
| **Owner** `new_order` / cancel / fee | **Attention per business kind** | `new_order` = 1 attention per order until **opened or status-handled**. Fee deduct = separate attention (different kind). No status-chain supersede among owner kinds unless documented. |

So for buyer progression the product answer is **1 (attention)**, not **4**, and **code already does this**.  
Docs that implied “never auto-read status” without documenting supersede were **incomplete** (fixed in companion lifecycle doc).

### Q5 — Notification Event SSOT fields

Logical SSOT (computed today; DB column optional later):

| Field | Source |
|-------|--------|
| `event_id` | `notification_events.id` |
| `domain` | derived from `type` / payload |
| `identity` | `order_id` / `room_id` / `product_id` / `call_session_id` / campaign id |
| `attention_key` | `resolveNotificationAttentionKey` (see module) |
| `viewer` | `user_id` |
| `destination` | `display_payload.routeUrl` / resolved href |
| `state` | `unread` + `read_at` + dismiss flags |

---

## 2. QA viewer proof (asas55, 2026-08-01)

```text
Bell unread = 23
  chat_message = 2
  order_status = 21  → all OWNER (store_order_created×20, buyer_cancelled×1)
  buyer status unread = 0
  distinct owner orders = 20
  max buyer status chain unread = 0 (supersede works)
```

**Conclusion:** Bell 63/23 inflation here is **not** buyer status stacking. It is **owner intake attentions left open** after business handling without ending the Notification Event.

---

## 3. LOCK — Owner intake attention end

When `applyStoreOrderStatusTransition` succeeds for an order, end owner `order_status` attentions for that `order_id` for store `owner_user_id` (+ actor user if distinct).

Bell deep-link `ack_owner_notifications=1` must **not** call `mark_all_owner_store_commerce_read` (clears all stores’ owner events). Only **that order** via `order_detail_opened` / `markOrderNotificationsRead`.

---

## 4. Projection map (Phase 4)

| Surface | Unit | Source |
|---------|------|--------|
| Bell digit / list | Unread notification_events (post-lifecycle) | `countNotificationEventsBadge` / events list |
| App Icon / FCM badge | Distinct attention **rooms** + missed-call | Domain badge projection |
| Bottom Chat | General+group unread **rooms** | Participants |
| Trade / Order hubs | Domain unread **rooms** (role/store) | Participants |
| Row badge | Unread **messages** in room | Participants |

Same identity can contribute **different numbers** on different surfaces; attribution must stay traceable to `event_id` / `room_id` / `order_id`.

---

## 5. Phase status

| Phase | Status |
|-------|--------|
| 1 Business → Event create map | Documented here |
| 2 Lifecycle create/dedupe/end/read | Documented + owner end wired in `applyStoreOrderStatusTransition` |
| 3 attention_key SSOT helper | `lib/notifications/core/notification-attention-key.ts` |
| 4 Projection map | This §4 |
| 5 Runtime QA | After Production |
| 6 Legacy delete | After Phase 5 PASS |

### Historical backfill (not a digit hack)

`healStaleOwnerOrderIntakeNotificationEvents` ends owner intake unread rows whose `store_orders.order_status` is no longer `pending` — same rule as the forward writer. Run explicitly after deploy; do not hide unread by changing Bell math alone.

Evidence (asas55, pre-heal measure): **21/21** unread owner `order_status` pointed at orders already `completed` / `cancelled` / `cancel_requested` — **0 still pending**.

---

## Related

- `docs/notifications/status-event-read-lifecycle.md`
- `docs/notifications/bell-digit-and-inbox-product.md` (superseded digit wording → points here)
- `docs/notifications/legacy-inbox-dual-read-compat.md`

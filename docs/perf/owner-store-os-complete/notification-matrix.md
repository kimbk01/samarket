# Owner notification / badge / sound matrix

Authority: STORE OS COMPLETE AUDIT · implementation artifact (no new notification system).

| Event | Owner / source | Badge | In-app | Push | Sound | Deeplink |
|---|---|---|---|---|---|---|
| NEW ORDER | `delivery_order_created_owner` → notification_events → `playStoreOrderDeliveryAlertSound` | Orders = pending_accept + refund_requested (`OwnerHubRuntimeProvider`) | Hub / orders | Existing push path | **Operational order sound** (≠ generic notice) | `/stores/owner/orders` |
| ORDER CANCEL / PROBLEM | Order status / refund_requested in attention badge | Orders badge | Orders list | Existing | Order alert only if event emits order sound key | Orders |
| CHAT | Order chat unread (`useOwnerFabOrderChatBadgeCount`) | Customers tab | Customer hub | Existing | Generic / chat path — not order alert | `/stores/owner/order-chats` |
| INQUIRY | Open store inquiries count | Customer hub entry | Inquiries | Existing | Not order sound | `/stores/owner/inquiries` |
| REVIEW | `reviews_need_reply_count` snapshot | Customer hub | Reviews | Existing | Not order sound | `/stores/owner/reviews` |
| SUPPORT REPLY | admin-notes unread | Customer center entry | Customer center | Existing | Not order sound | customer-center |
| FINANCE / SETTLEMENT | Ledger / settlement status (no dedicated Owner badge invented) | Bell commerce inbox if event exists | Finance / Settlements | Existing | Not order sound | finance / settlements |
| AD / COUPON / GIFT APPROVAL | Existing growth events | Bell if registered | Ads / promo pages | Existing | Not order sound | respective routes |
| STORE WARNING | Admin / support | Bell | Support / ops-status | Existing | Not order sound | ops-status / support |

## Hard separations (PRESERVE)

1. Bell unread (`Tier1NotificationAnchor` / `owner_commerce_inbox`) ≠ order action-required badge  
2. Customers badge ≠ order attention  
3. NEW ORDER operational sound ≠ generic notice sound  

## Options domain

Product options remain form-owned (`OwnerProductOptionsTab` / `options_json`). No independent Drawer options item.

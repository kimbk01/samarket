# Store Order Badge Role Lock

**Status:** `PASS_STORE_ORDER_BADGE_ROLE_ALIGNED`  
**Commit:** `934ee3538`  
**Production:** `https://samarket.vercel.app` · deployment `dpl_9h2o2txgNhpWdZTAGLvf6Y5b32ck` · Ready  
**APK:** `docs/perf/dibay-store-order-badge-role-934ee3538.apk`  
**SHA-256:** `8e93eb2404286f21ae84a35ab4f04f1a9a455f07e769ba7b110479714a48a3bc`  
**QA evidence:** `docs/perf/store-order-badge-role-qa/`  
**Devices:** Xiaomi `8b37179f7d94` (aaaa) · Samsung `RFCY40PY2CA` (qqqq)

## Contract (locked)

| Surface | Role | Source | Unit | Route |
|--------|------|--------|------|-------|
| Bottom Chat | GD+Group | `communityMessengerUnread` | unread room count | — |
| Customer order pillar | customer | `buyerOrderAttention` **or** Domain customer list `unreadRoomCount` | unread room count | `/community-messenger/delivery-chats` |
| Customer order list | customer | `buyer_order` targets | room/row | `/community-messenger/delivery-chats` |
| Owner order FAB | owner | `storeOrderChatUnread` ← `owner_order_chat` / `storeOrderOwnerChatUnread` | unread room count | `/stores/owner/order-chats` |
| App Icon store-order | union | owner rooms + buyer rooms | room contribution | OS icon |

### Forbidden

- Customer pillar reading `storeOrderChatUnread` (owner FAB axis)
- Owner FAB including `buyer_order`
- Bottom Chat including trade / store_order
- Publishing buyer+owner **sum** into `storeOrderChatUnread` or customer pillar
- Showing combined `5` on customer pillar or owner FAB when buyer=2 and owner=3

## Writer meanings (post-fix)

| Field | Writer | Meaning |
|-------|--------|---------|
| `communityMessengerUnread` | Hub targets `bottom_nav_chat` · Projection `bottomChat` | GD+Group rooms |
| `buyerOrderAttention` | Hub `bottom_nav_delivery` · Projection `storeOrderCustomerUnread` | buyer_order rooms |
| `storeOrderChatUnread` | Hub `fab_owner_order_chat` · Projection `storeOrderHub` (owner-only) | owner_order_chat rooms |
| `storeOrderOwnerChatUnread` | badge-count HTTP Fact | owner_order_chat rooms |
| `storeOrderBuyerDeliveryUnread` | badge-count HTTP Fact | buyer_order rooms |
| App Icon `storeOrder` | Projection `owner + buyer` | union only |

## QA summary (seeded dual-role + 3 rounds)

| Device | Round | Bottom | Customer Pillar | Customer Rows | Owner FAB | Stable |
|--------|------:|-------:|----------------:|--------------:|----------:|--------|
| Xiaomi | 1–3 | 0 | 2 | 2 | 0 | yes |
| Samsung | 1–3 | 0 | 2 | 2 | 3 | yes |

UI CDP: pillar `data-messenger-pillar-unread=2` · list `data-domain-unread-rooms=2` · unread DOM rows=2 on both devices.

Read isolation (badge-count Facts): customer clear 2→1 owner unchanged; owner clear 3→2 buyer unchanged. See `read-sync-934ee3538.json`.

## Residual

- Hub API in-memory TTL can lag briefly after **direct** RPC clear/bump that skips `invalidateOwnerHubBadgeCache`. Product bump/clear paths invalidate. Pillar prefers Domain list unread when primed; badge-count Projection Apply republishes split fields.

## DO NOT

- Reintroduce combined `storeOrderHub` into Owner FAB / customer pillar
- Point customer pillar at owner routes or owner list
- Mix Phase J Bell / FCM / App Icon redesign into this lock

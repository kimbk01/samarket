# SSOT MATRIX — INDEPENDENT RECONSTRUCTION

Rebuilt from current code (not copied from repair SSOT-MATRIX.md).

| Entity | UI | READ | MUTATION | STATUS | PERMISSION | MONEY | DEEPLINK |
|---|---|---|---|---|---|---|---|
| Order | delivery-orders Admin | store_orders | applyStoreOrderStatusTransition | store_orders | business/admin | — | `/admin/stores/orders/{id}` |
| Store | AdminStores / business CC | stores | approval APIs | approval_status | business | — | `/admin/business/{id}` |
| Point charge | point-charges | point_charge_requests | point APIs | request_status | **point** | Member Point | `/admin/point-charges/{id}` |
| Coin withdraw | finance | coin_withdrawal_requests | coin-withdrawals | status | **business** | Store Coin | finance coin section |
| Cash top-up | cash-charges | business_cash_charge_requests | business-cash-charges | PENDING… | **business** | Store Cash | `?requestId=` |
| Legacy ads cash | — | delivery_ad_business_cash_charge_requests | **410** | historical | ApiUser | — | archive READ |
| AST-002 store_point | archive count | store_point_charge_requests | **410** | — | — | not Cash | excluded from AC total |
| Settlement | store-settlements | store_settlements | settlement APIs | settlement_status | business | fee snapshot fields | `?id=` |
| Sale fee | B3 statement | store_settlements.platform_fee_* | settlement owner | — | business | settlement | finance?storeId= |
| Ads Delivery | delivery-ads | campaigns/ops | ads APIs | product statuses | ads | **Cash** | detail routes |
| Ads Feed | feed-ad-requests | feed_ad_requests | feed APIs | pending_review… | ads | **Point** | `/admin/feed-ad-requests/{id}` |
| Support case | /admin/support | support_cases | reply/resolve | OPEN/WAITING… | admin | — | `/admin/support/{id}` |
| Notification | admin bell / events | notification_events | — | — | — | — | exact Support when payload has routeUrl |
| Trade post | posts-management | posts | soft/hard APIs | status | products | — | posts mgmt |
| Community post | community engine | community_posts | soft/hard | status | boards | — | `/admin/community/posts/{id}` |
| Chat GENERAL/GROUP | CM lists | community_messenger_rooms | CM/Reset | room_status | chats | — | messenger lists |
| Chat TRADE | AdminChatList trade | product_chats (+fallback) | bulk-delete | — | chats | — | `/admin/chats/trade` |
| Chat ORDER | order-chats | store_orders.cm_room | order process | order_status | business | — | order chat routes |
| Chat hide | list toolbar | — | session Set only | — | — | — | n/a |
| Prelaunch Reset | prelaunch-reset | — | reset scopes | — | master/dev | — | `?scopes=` |

## Compare vs prior SSOT-MATRIX.md

| Topic | Match? |
|---|---|
| Cash = business, no cash key | Yes |
| Legacy charge B/D | Yes |
| Chat hide session A | Yes |
| Order Admin Store | Yes |
| Messenger AC real count | Yes |

**ACTIVE duplicate mutation for Cash/Point/Coin:** none found.

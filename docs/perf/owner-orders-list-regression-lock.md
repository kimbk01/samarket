# Owner Orders List Regression Lock

Owner store orders list on `GET /api/me/stores/[storeId]/orders`.

**Purpose:** prevent re-introduction of request-time multi-wave order/profile/item aggregate bottlenecks.

## Removed bottlenecks (do not reintroduce)

| Bottleneck | Was | Fix |
|------------|-----|-----|
| 2-wave Promise.all aggregate | wave1 orders + wave2 buyer labels/items/reviews | **1 RTT:** `get_owner_store_orders_list_snapshot` or counter PK read |
| Repeated store ownership validation | per-request gate + redundant joins | RPC gate + `getCachedStoreIfOwner` |
| Request-time buyer label join | `mapBuyerUserIdsToPublicLabelsCached` on every cold miss | Precomputed in unified RPC |
| Request-time item summary | separate `store_order_items` fetch wave | Precomputed in unified RPC |
| Request-time review_status merge | separate `store_reviews` fetch wave | Precomputed in unified RPC |

## Forbidden patterns

- Multiple aggregate queries on cold snapshot path (max **1** DB round trip for list body)
- `query_wave_2_ms > 0` on snapshot path
- PostgREST embed inner join on owner orders list hot path
- Sequential `await` for independent orders/profile/items/reviews on snapshot path
- Request-time aggregate recompute when unified RPC exists
- Legacy 2-wave path as normal when RPC deployed
- Polling-only list refresh without snapshot invalidation

## Allowed query count (cold snapshot path)

| Path | Max PostgREST RTT | Notes |
|------|-------------------|-------|
| Snapshot counter hit | **1** PK select | `owner_store_orders_list_snapshots` |
| Snapshot counter miss / stale serve | **1** RPC | `get_owner_store_orders_list_snapshot` |
| Legacy fallback | **3+** | Only when unified RPC unavailable (temporary) |

## Cache layer map

| Layer | Key | TTL | Ownership |
|-------|-----|-----|-----------|
| Route memory | `storeId:ownerUserId` | 30s | `owner-store-orders-list-server-cache.ts` |
| DB snapshot | `(store_id, owner_user_id, list_scope, status_filter, list_limit, cursor_key)` | 30s fresh + event refresh | `owner-store-orders-list-snapshot.ts` |
| Client hub | `storeId` | session | `owner-store-orders-list-cache.ts` |

## Snapshot ownership

- **Write:** order lifecycle events → `invalidateOwnerStoreOrdersListCache` / `invalidateStoreOrderCountsCache` → `scheduleOwnerStoreOrdersListSnapshotRefresh`
- **Read:** `tryLoadOwnerStoreOrdersListFromSnapshot` → counter row → unified RPC → legacy fallback (temporary)
- **Semantics:** unchanged list row shape, `created_at DESC`, limit 60, no server-side status/cursor params on current API

## Pagination / filter semantics lock

- Default limit: **60**
- Sort: **`created_at DESC`, `id DESC`**
- Status filter param: reserved in RPC (`p_status` default `''` = all) — API does not expose filter yet
- Cursor: reserved in RPC (`p_cursor` default `''`) — API does not expose pagination yet
- Client re-sort: `sortOwnerStoreOrderListRowsDesc` unchanged

## Invalidation flow (required events)

1. Order create / accept / reject / preparing / delivering / complete / cancel
2. Refund request / approve / reject
3. Payment status update
4. Rider assign / delivery status change
5. Order chat unread change
6. Stale counter serve — background `scheduleOwnerStoreOrdersListSnapshotRefresh`

## Regression guards

Runtime: `lib/stores/owner-store-orders-list-snapshot-regression-guard.ts`

Log tags: `[owner-orders-list-regression-alert]`, `[owner-orders-list-hotpath-analysis]`, `[owner-orders-list-snapshot-rpc-design]`, `[owner-orders-list-snapshot-fallback]`

Verify: `npm run verify:owner-orders-list-snapshot-rpc`, `npm run verify:owner-orders-list-snapshot-e2e`

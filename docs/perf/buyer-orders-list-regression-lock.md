# Buyer Orders List Regression Lock

Buyer store orders list on `GET /api/me/store-orders`.

**Purpose:** prevent re-introduction of request-time buyer orders list monolith aggregate bottlenecks (SOL1).

## Removed bottlenecks (do not reintroduce)

| Bottleneck | Was | Fix |
|------------|-----|-----|
| Orders + hides + items + reviews wave 1 | 1 RTT | **1 RTT:** `get_buyer_store_orders_list_snapshot` or counter PK read |
| Stores + unread wave 2 | 1 RTT parallel | Precomputed in unified RPC bundle |
| Request-time sort/filter | Per-hit recompute | Snapshot bundle + deterministic assemble |
| Repeated store/profile/payment joins | Per-wave PostgREST | Precomputed in unified RPC |

## Forbidden patterns

- Multiple aggregate queries on cold snapshot path (max **1** DB round trip for list body)
- `query_wave_2_ms > 0` on snapshot path
- PostgREST embed inner join on buyer orders hot path
- Sequential `await` for independent orders/store/unread on snapshot path
- Request-time aggregate recompute when unified RPC exists
- Legacy multi-wave list as normal when RPC deployed
- Reconnect full list recompute (use snapshot refresh + MRC1 merge rules)

## Allowed query count (cold snapshot path)

| Path | Max PostgREST RTT | Notes |
|------|-------------------|-------|
| Snapshot counter hit | **1** PK select | `buyer_store_orders_list_snapshots` |
| Snapshot counter miss / stale serve | **1** RPC | `get_buyer_store_orders_list_snapshot` |
| Legacy fallback | **3** | Only when unified RPC unavailable (temporary) |

## Cache layer map

| Layer | Key | TTL | Ownership |
|-------|-----|-----|-----------|
| DB snapshot counter | `(buyer_user_id, list_scope, status_filter, list_limit, cursor_key)` | 8s fresh + event refresh | `buyer-store-orders-list-snapshot.ts` |
| Single-flight | `sol1-buyer-orders-list-snapshot:{buyerId}:{limit}:...` | in-flight only | `buyer-store-orders-list-snapshot.ts` |

## Snapshot ownership

- **Write:** order lifecycle events → `invalidateBuyerStoreOrdersListSnapshot` → `scheduleBuyerStoreOrdersListSnapshotRefresh`
- **Read:** `tryLoadBuyerStoreOrdersListFromSnapshot` → counter row → unified RPC → legacy fallback
- **Semantics:** unchanged `{ ok, orders: [...] }` — UI unchanged; `hub_summary=1` separate path unchanged

## Invalidation flow (required events)

1. Order create (`POST /api/me/store-orders`)
2. Order accept / reject / status change (`applyStoreOrderStatusTransition`)
3. Buyer cancel / refund / hide (`PATCH` / `DELETE` detail route)
4. Payment update (via `createStoreOrderEvent`)
5. Refund approve/reject
6. Rider assign/change
7. Chat unread change (bundled in RPC refresh)
8. Timeline append (`createStoreOrderEvent` + events read cache invalidate)

## Sorting semantics lock

- Sort by `created_at DESC`, tie-break `id DESC` (same as legacy GET)
- Buyer hides excluded (`store_order_buyer_hides`)
- `order_status` normalized via `normalizeStoreOrderStatusForBuyer` in CPU assemble only

## Pagination semantics lock

- `?limit=` 1–100, default **100** (unchanged)
- No cursor exposed in API response today; RPC supports `p_cursor` for counter key future use only

## Reconnect rules (MRC1 — do not break)

- `snapshot_version` monotonic merge on client realtime paths
- Stale reconnect discard
- Cross-tab consistency — no full list recompute on reconnect
- Duplicate realtime discard

## Regression guards

Runtime: `lib/stores/buyer-store-orders-list-snapshot-regression-guard.ts`

Log tags: `[buyer-orders-list-regression-alert]`, `[buyer-orders-list-monolith-analysis]`, `[buyer-orders-list-snapshot-rpc-design]`, `[buyer-orders-list-snapshot-fallback]`

Verify: `npm run verify:buyer-orders-list-snapshot-rpc`, `npm run verify:buyer-orders-list-snapshot-e2e`

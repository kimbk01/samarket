# Store Menus Regression Lock

Store public menus (`GET /api/stores/[slug]/menus`) performance and architecture constraints.
**Purpose:** prevent re-introduction of removed bottlenecks.

## Removed bottlenecks (do not reintroduce)

| Bottleneck | Was | Fix |
|------------|-----|-----|
| Multi-wave menu fetch | store gate → meta ∥ products embed ∥ popular RPC (5–6 RTT) | **1 RTT:** `get_store_menus_snapshot` or counter PK read |
| PostgREST section embed | `store_menu_sections` embed on products hot path | SQL LEFT JOIN inside unified RPC |
| Request-time aggregate | Every cold request recomputes products+popular+recommended ids | Precomputed `store_menus_snapshots.payload_json` + event refresh |
| Sequential meta after products | Wave 1 then wave 2 waterfall | Single snapshot read + CPU assemble only |

## Forbidden patterns

- Multiple small RPCs on cold snapshot path (max **1** DB round trip)
- `await getApprovedStoreBySlug` then `await fetchStoreProductsForMenus` sequential chain on snapshot path
- `query_wave_2_ms > 0` on snapshot path
- PostgREST embed inner join on menus hot path
- Aggregate recompute on every request when unified RPC exists
- Legacy multi-wave as normal path when RPC deployed

## Allowed query count (cold snapshot path)

| Path | Max PostgREST RTT | Notes |
|------|-------------------|-------|
| Snapshot counter hit | **1** PK select | `store_menus_snapshots` |
| Snapshot counter miss | **1** RPC | `get_store_menus_snapshot` |
| Legacy fallback | **5–6** | Only when unified RPC unavailable (temporary) |

## Cache layer map

| Layer | Key | TTL | Ownership |
|-------|-----|-----|-----------|
| Route JSON | slug lowercase | 45s | `store-menus-public-server-cache.ts` |
| DB snapshot | `(store_slug, viewer_user_id, menu_version)` | 5s fresh + event refresh | `store-menus-snapshot.ts` |
| Popular stats legacy | storeId | 60s | legacy fallback only |
| Client menus | slug | 15s | `store-delivery-api-client.ts` |

## Snapshot ownership

- **Write:** domain events → `invalidateStoreMenusSnapshotCache` → `scheduleStoreMenusSnapshotRefresh`
- **Read:** `tryLoadStoreMenusCatalogFromSnapshot` → counter row → unified RPC → legacy fallback
- **Semantics:** unchanged `StoreMenusCatalogBody` — client-side category grouping unchanged

## Invalidation flow (required events)

1. Product insert/update/delete — owner product routes
2. Menu section CRUD — menu-sections routes
3. Store public profile save — `invalidateStorePublicCachesForSlug`
4. Order stock change — (future: order checkout paths)

## Regression guards

Runtime: `lib/stores/store-menus-regression-guard.ts`

Log tags: `[store-menus-regression-alert]`, `[menus-hotpath-analysis]`, `[snapshot-rpc-design]`, `[store-menus-snapshot-fallback]`

Verify: `npm run verify:store-menus-snapshot-rpc`, `npm run verify:store-menus-snapshot-e2e`

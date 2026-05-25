# Stores Browse Regression Lock (SB1)

Store browse list (`GET /api/stores/browse`) performance and architecture constraints.
**Purpose:** prevent re-introduction of removed bottlenecks.

## Removed bottlenecks (do not reintroduce)

| Bottleneck | Was | Fix |
|------------|-----|-----|
| Multi-wave browse fetch | taxonomy → stores → products ∥ banners (3+ RTT) | **1 RTT:** `get_stores_browse_snapshot` or counter PK read |
| Repeated category joins | taxonomy cache + store category filter per request | Taxonomy embedded in unified RPC payload |
| Request-time aggregate | Every cold request recomputes store rows + previews | Precomputed `stores_browse_snapshots.payload_json` + event refresh |
| Wave-2 product/banner chain | Sequential store fetch then related previews | Single RPC CTE bundle |

## Forbidden patterns

- Multiple small RPCs on cold snapshot path (max **1** DB round trip)
- PostgREST embed inner join on browse hot path
- `query_wave_2_ms > 0` on snapshot path
- Sequential `await` chain: stores → products → banners on snapshot path
- Aggregate recompute on every request when unified RPC exists
- Legacy multi-wave as normal path when RPC deployed
- Warm memory cache-only PASS without snapshot headers / monolith analysis

## Allowed query count (cold snapshot path)

| Path | Max PostgREST RTT | Notes |
|------|-------------------|-------|
| Response memory hit | **0** DB | `stores-browse-response-cache.ts` (45s) |
| Snapshot counter hit | **1** PK select | `stores_browse_snapshots` bundle row |
| Snapshot counter miss | **1** RPC | `get_stores_browse_snapshot` |
| Legacy fallback | **3+** | Only when unified RPC unavailable (temporary) |

## Cache layer map

| Layer | Key | TTL | Ownership |
|-------|-----|-----|-----------|
| Route JSON | primary∥sub∥region∥city∥district∥geo∥page∥limit∥uiLang | 45s | `stores-browse-response-cache.ts` |
| DB snapshot bundle | `(primary_slug, sub_slug, bundle scope)` | 8s fresh + event refresh | `stores-browse-snapshot.ts` |
| Taxonomy legacy | primary+sub | 10m | legacy fallback only |

## Snapshot ownership

- **Write:** domain events → `invalidateStoresBrowseSnapshot` → `scheduleStoresBrowseSnapshotRefresh`
- **Read:** memory → counter row → unified RPC → legacy fallback (temporary)
- **Assemble:** CPU sort/geo/labels in TS — response shape unchanged

## Search / filter / sort semantics lock

- `primary` + `sub` filter semantics unchanged (RPC mirrors legacy SQL)
- `district`, `user_lat`/`user_lng` sort applied in TS assemble only
- `region`, `city`, `page` remain cache-key dimensions only (no DB filter change)
- No new search/sort query params on this track

## Invalidation flow (required events)

1. Store create/update/visibility — `invalidateStorePublicCachesForSlug` + browse memory purge
2. Menu/product/banner — `invalidateStoreMenusSnapshotCacheByStoreId` → browse by store id
3. Category/topic admin changes — `invalidateStoresBrowseSnapshot(primary)`
4. Open/close, soldout, delivery meta — store public slug invalidation

## Regression guards

Runtime: `lib/stores/stores-browse-snapshot-regression-guard.ts`

Log tags: `[stores-browse-regression-alert]`, `[stores-browse-monolith-analysis]`, `[stores-browse-snapshot-rpc-design]`, `[stores-browse-snapshot-fallback]`

Verify: `npm run verify:stores-browse-snapshot-rpc`, `npm run verify:stores-browse-snapshot-e2e`

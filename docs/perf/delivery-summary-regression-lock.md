# Delivery Summary Regression Lock

Owner delivery summary aggregate on `GET /api/me/stores/[storeId]/order-counts`.

**Purpose:** prevent re-introduction of request-time order/delivery/refund/rider aggregate bottlenecks.

## Removed bottlenecks (do not reintroduce)

| Bottleneck | Was | Fix |
|------------|-----|-----|
| Dashboard RPC on every cold miss | `get_owner_store_ops_dashboard_snapshot` per 5s memory miss | **1 RTT:** `get_delivery_summary_snapshot` or counter PK read |
| Two-hop counts + meta | `get_owner_store_ops_snapshot_counts` + `fetchStoreOpsMetaForOwner` | Unified delivery summary RPC |
| Legacy parallel counts | ~25 `Promise.all` count queries | Precomputed `delivery_summary_snapshots.payload_json` + event refresh |
| Request-time sales/status merge | today_sales + flow counts recomputed each cold | Event-driven snapshot refresh |

## Forbidden patterns

- Multiple aggregate RPCs on cold snapshot path (max **1** DB round trip)
- `query_wave_2_ms > 0` on snapshot path
- PostgREST embed inner join on delivery summary hot path
- Sequential `await` for independent order/status/sales queries on snapshot path
- Request-time aggregate recompute when unified RPC exists
- Legacy 25-count parallel path as normal when RPC deployed
- Polling-only dashboard refresh without snapshot invalidation

## Allowed query count (cold snapshot path)

| Path | Max PostgREST RTT | Notes |
|------|-------------------|-------|
| Snapshot counter hit | **1** PK select | `delivery_summary_snapshots` |
| Snapshot counter miss / stale serve | **1** RPC | `get_delivery_summary_snapshot` |
| Legacy fallback | **1–25+** | Only when unified RPC unavailable (temporary) |

## Cache layer map

| Layer | Key | TTL | Ownership |
|-------|-----|-----|-----------|
| Route memory | `storeId` | 5s | `store-order-counts-cache.ts` |
| DB snapshot | `(store_id, owner_user_id, summary_scope)` | 5s fresh + event refresh | `delivery-summary-snapshot.ts` |
| Client hub | `storeId` | 20s | `owner-hub-order-counts-cache.ts` |

## Snapshot ownership

- **Write:** order/refund/rider events → `invalidateStoreOrderCountsCache` → `scheduleDeliverySummarySnapshotRefresh`
- **Read:** `tryLoadDeliverySummarySnapshot` → counter row → unified RPC → dashboard RPC → legacy fallback
- **Semantics:** unchanged `StoreOrderCountsPayload` / `OwnerStoreOpsSnapshot` — UI unchanged

## Invalidation flow (required events)

1. Order create / accept / preparing / delivering / complete / cancel
2. Refund request / approve
3. Rider assign / delivery complete
4. Product/inquiry mutations affecting dashboard counts
5. Stale counter serve — background `scheduleDeliverySummarySnapshotRefresh`

## Regression guards

Runtime: `lib/stores/delivery-summary-snapshot-regression-guard.ts`

Log tags: `[delivery-summary-regression-alert]`, `[delivery-summary-hotpath-analysis]`, `[snapshot-rpc-design]`, `[delivery-summary-snapshot-fallback]`

Verify: `npm run verify:delivery-summary-snapshot-rpc`, `npm run verify:delivery-summary-snapshot-e2e`

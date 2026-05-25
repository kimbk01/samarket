# Owner Dashboard Notifications Regression Lock

Owner dashboard notification hot paths on `GET /api/me/notifications`:

- `?unread_count_only=1&owner_store_commerce_unread_only=1` (owner bell badge)
- `?owner_store_id={storeId}` (owner notification inbox list)

**Purpose:** prevent re-introduction of request-time aggregate and multi-wave fetch bottlenecks.

## Removed bottlenecks (do not reintroduce)

| Bottleneck | Was | Fix |
|------------|-----|-----|
| Segmented unread RPC on every cold badge | `count_notification_unread_segmented` + 20s memory cache | **1 RTT:** `get_owner_dashboard_notifications_snapshot` or counter PK read |
| Owner store list RPC chain | `get_owner_store_commerce_notifications` per request | Unified snapshot payload `notifications[]` |
| PostgREST 220-row fallback | Fetch 220 rows + client `meta.store_id` filter | Snapshot list only when RPC deployed; fallback temporary |
| Request-time merge/sort | Unread + list + filter on every request | Precomputed `owner_dashboard_notifications_snapshots.payload_json` + event refresh |

## Forbidden patterns

- Multiple small RPCs on cold snapshot path (max **1** DB round trip)
- `query_wave_2_ms > 0` on snapshot path
- PostgREST embed inner join on owner notifications hot path
- Sequential `await` for independent notification sources on snapshot path
- Request-time aggregate recompute when unified RPC exists
- Legacy segmented RPC / 220-row filter as normal path when RPC deployed
- Polling-only unread refresh without snapshot invalidation

## Allowed query count (cold snapshot path)

| Path | Max PostgREST RTT | Notes |
|------|-------------------|-------|
| Snapshot counter hit | **1** PK select | `owner_dashboard_notifications_snapshots` |
| Snapshot counter miss / stale serve | **1** RPC | `get_owner_dashboard_notifications_snapshot` |
| Legacy fallback | **1–2** | Only when unified RPC unavailable (temporary) |

## Cache layer map

| Layer | Key | TTL | Ownership |
|-------|-----|-----|-----------|
| Unread memory | `userId::owner_store_commerce` | 20s | `notification-unread-count-cache.ts` |
| DB snapshot | `(user_id, store_id, snapshot_kind, limit_n, cursor_token)` | 5s fresh + event refresh | `owner-dashboard-notifications-snapshot.ts` |
| Client owner list | `storeId` | 15s | `fetch-me-owner-store-notifications.ts` |

## Snapshot ownership

- **Write:** domain events → `invalidateNotificationUnreadCountCache` → `scheduleOwnerDashboardNotificationsSnapshotRefreshForUser`
- **Read:** `tryLoadOwnerStoreCommerceUnreadFromSnapshot` / `tryLoadOwnerStoreNotificationsFromSnapshot` → counter row → unified RPC → legacy fallback
- **Semantics:** unchanged `{ ok, unread_count }` and `{ ok, notifications }` — UI unchanged

## Invalidation flow (required events)

1. `appendUserNotification` (owner commerce) — `store_id` from meta when present
2. `PATCH` delete / mark read / mark-all-read / mark-all-owner-store-commerce-read
3. Stale counter serve — background `scheduleOwnerDashboardNotificationsSnapshotRefresh`
4. Realtime reconnect — client refetch uses snapshot path (no request-time recompute)

## Regression guards

Runtime: `lib/notifications/owner-dashboard-notifications-regression-guard.ts`

Log tags: `[owner-notifications-regression-alert]`, `[owner-notifications-hotpath-analysis]`, `[snapshot-rpc-design]`, `[owner-notifications-snapshot-fallback]`

Verify: `npm run verify:owner-dashboard-notifications-snapshot-rpc`, `npm run verify:owner-dashboard-notifications-snapshot-e2e`

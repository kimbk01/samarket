# Room Bootstrap Regression Lock

Community messenger room bootstrap (`GET /api/community-messenger/rooms/[roomId]/bootstrap?mode=instant`) performance and architecture constraints.
**Purpose:** prevent re-introduction of removed bottlenecks on the critical (instant) tier.

## Removed bottlenecks (do not reintroduce)

| Bottleneck | Was | Fix |
|------------|-----|-----|
| Multi-query wave A | room ∥ participants+embed ∥ messages (+ viewer participant fallback) — 3–4 RTT | **1 RTT:** `get_community_messenger_room_bootstrap_snapshot` or counter PK read |
| PostgREST profile embed | `profiles!community_messenger_participants_user_id_fkey` inner join on hot path | SQL LEFT JOIN inside unified RPC |
| Request-time room summary | Every cold critical request recomputes wave A from live tables | Precomputed `community_messenger_room_bootstrap_snapshots.payload_json` + event refresh |
| Sequential hydration chain | participants then viewer then messages waterfall | Single snapshot read + existing CPU normalize only |

## Forbidden patterns

- Multiple small RPCs on cold critical path (max **1** DB round trip via snapshot path)
- `await roomQuery` then `await participantsQuery` then `await messagesQuery` as separate waves on snapshot path
- `query_wave_2_ms > 0` on snapshot path
- PostgREST embed inner join on critical bootstrap wave A
- Aggregate recompute on every request when unified RPC exists
- Legacy multi-query wave A as normal path when RPC deployed
- Route/memory cache masking missing snapshot (warm-only PASS)

## Allowed query count (cold snapshot path)

| Path | Max PostgREST RTT | Notes |
|------|-------------------|-------|
| Snapshot counter hit | **1** PK select | `community_messenger_room_bootstrap_snapshots` |
| Snapshot counter miss | **1** RPC | `get_community_messenger_room_bootstrap_snapshot` |
| Legacy fallback | **3–4** | Only when unified RPC unavailable (temporary) |

## Cache layer map

| Layer | Key | TTL | Ownership |
|-------|-----|-----|-----------|
| Route JSON | `cm_room_bootstrap:{userId}:{roomId}:instant:…` | ~2.5s | `room-bootstrap-route-cache.ts` |
| DB snapshot | `(user_id, room_id, snapshot_tier, message_limit)` | 5s fresh + event refresh | `room-bootstrap-snapshot.ts` |
| Single-flight | `cm-room-bootstrap-snapshot:{userId}:{roomId}:{limit}` | in-flight only | `room-bootstrap-snapshot.ts` |

Process memory route cache is a **read-through accelerator** only. Cold path must not depend on it when snapshot RPC exists.

## Snapshot ownership

- **Write:** domain events → `invalidateRoomBootstrapSnapshotCache` → `scheduleRoomBootstrapSnapshotRefresh`
- **Read:** `tryLoadRoomBootstrapCriticalWaveAFromSnapshot` → counter row → unified RPC → legacy fallback (temporary)
- **Semantics:** unchanged bootstrap response shape, unread, realtime bump, mark-read paths

## Invalidation flow (required events)

1. CM message insert/update/delete — `invalidateOwnerHubBadgeForCommunityMessengerPeers` (+ room bootstrap cache)
2. Mark read — mark-read paths in `service.ts` (`invalidateRoomBootstrapSnapshotCacheForViewer`)
3. Mark-all-read — `app/api/me/chats/mark-all-read/route.ts`
4. Participant pin/mute/archive — same service write paths (hub badge + home-sync + room bootstrap)
5. Media/attachment upload — message mutation paths
6. Trade/order state change — trade bridge after mark-read (viewer snapshot refresh)

## Regression guards

Runtime: `lib/community-messenger/room-bootstrap-regression-guard.ts`

Warns when:
- `query_wave_2_ms > 0` (snapshot path)
- `db_round_trips > 1` (snapshot path)
- `transport_regression` on legacy aggregate path
- `sequential_await_detected`
- `participant_profile_embed_detected`
- `aggregate_recompute_detected` (legacy path)
- `legacy_fallback_used`

Log tags: `[room-bootstrap-regression-alert]`, `[bootstrap-hotpath-analysis]`, `[snapshot-rpc-design]`, `[room-bootstrap-snapshot-fallback]`

## Verification (real usage, not curl-only)

1. Room first entry (`mode=instant`) — timeline renders without multi-wave delay
2. Re-entry — counter hit, no duplicate hydrate
3. Multi-tab — no duplicate cold waves
4. New message — bump + snapshot refresh
5. Read ack — unread decreases; bootstrap snapshot refreshed
6. Mark-all-read — all viewer room snapshots refreshed
7. Realtime reconnect — no bootstrap flicker
8. Silent refresh — unchanged contract
9. TTL expire re-entry — stale serve + background refresh
10. Attachment room — messages in snapshot payload
11. Trade/order room — defer secondary unchanged on critical
12. Memory pressure — snapshot row remains source of truth

Each scenario: no bootstrap flicker, no unread stale, no duplicate hydrate, no fallback (when RPC deployed), no regression alert.

## PASS criteria (structural)

1. Snapshot-first structure on critical tier
2. Unified bootstrap RPC deployed
3. Event-driven aggregate refresh wired
4. `query_wave_2_ms = 0` on snapshot path
5. `rpc_removed = 1` (legacy wave A replaced)
6. Legacy fallback removed (final)
7. Realtime unread semantics unchanged
8. Response shape unchanged
9. Repeated bottleneck does not recur

Verify: `npm run verify:room-bootstrap-snapshot-rpc`, `npm run verify:room-bootstrap-snapshot-e2e`

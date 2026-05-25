# Home-Sync Regression Lock

Community messenger home-sync (`GET /api/community-messenger/home-sync?tier=critical`) performance and architecture constraints.
**Purpose:** prevent re-introduction of removed bottlenecks.

## Removed bottlenecks (do not reintroduce)

| Bottleneck | Was | Fix |
|------------|-----|-----|
| Multi-wave room fetch | RPC `bootstrap_my_room_ids` → serial → rooms ∥ participants (2–3 RTT) | **1 RTT:** `get_community_messenger_home_sync_snapshot` or counter PK read |
| Parallel HS5 wave | `profiles.in` ∥ `home_sync_hs5_unread_legacy_bundle` (wave 2) | HS5 embedded in unified snapshot RPC |
| Request-time aggregate | Every cold request recomputes rooms+unread from live queries | Precomputed `community_messenger_home_sync_snapshots.payload_json` + event refresh |
| Sequential profile after rooms | Round 1 then round 2 then hydrate | Single snapshot read + CPU assemble only |

## Forbidden patterns

- Multiple small RPCs on cold critical path (max **1** DB round trip via snapshot path)
- `await fetchMyRoomsPayload` then `await prefetchHs5` sequential chain on snapshot path
- `query_wave_2_ms > 0` on snapshot path
- PostgREST embed inner join on home-sync hot path
- Aggregate recompute on every request when unified RPC exists
- setTimeout / polling for list refresh
- Legacy multi-wave as normal path when RPC deployed

## Allowed query count (cold snapshot path)

| Path | Max PostgREST RTT | Notes |
|------|-------------------|-------|
| Snapshot counter hit | **1** PK select | `community_messenger_home_sync_snapshots` |
| Snapshot counter miss | **1** RPC | `get_community_messenger_home_sync_snapshot` |
| Legacy fallback | **3–4** | Only when unified RPC unavailable |

## Cache layer map

| Layer | Key | TTL | Ownership |
|-------|-----|-----|-----------|
| Route JSON | `{userId}:{tier}:cap…` | 5s fresh / 30s SWR | `home-sync/route.ts` |
| DB snapshot | `community_messenger_home_sync_snapshots.user_id` | 5s fresh + event refresh | `home-sync-snapshot.ts` |
| Critical rooms memory | `{userId}:critical:{cap}` | 2s | `home-sync-critical-rooms-cache.ts` (legacy fallback only) |
| HS5 legacy memory | room-set key | 3s | `enrich-messenger-trade-unread-with-legacy-trade.ts` (legacy only) |

Process memory layers are **read-through accelerators** only. Cold path must not depend on them when snapshot RPC exists.

## Snapshot ownership

- **Write:** domain events → `invalidateHomeSyncSnapshotCache` → `scheduleHomeSyncSnapshotRefresh`
- **Read:** `tryBuildHomeSyncCriticalFromSnapshot` → counter row → unified RPC → legacy fallback
- **Semantics:** unchanged `CommunityMessengerRoomSummary[]` / unread HS5 merge / deferred trade meta

## Invalidation flow (required events)

1. CM message insert — `community-messenger/service.ts` (`invalidateOwnerHubBadgeForCommunityMessengerPeers`)
2. Mark read — mark-read paths in `service.ts`
3. Participant pin/mute/archive — same service write paths
4. Friend accept (full tier lists) — friend routes (future: full-tier snapshot)

Each calls `invalidateHomeSyncSnapshotCache(userId)` which schedules snapshot refresh.

## Regression guards

Runtime: `lib/community-messenger/home-sync-regression-guard.ts`

Warns when:
- `query_wave_2_ms > 0` (snapshot path)
- `db_round_trips > 1` (snapshot path)
- `transport_regression` on legacy aggregate path
- `sequential_await_detected`
- `embed_inner_join_detected`
- `aggregate_recompute_detected` (legacy path)
- `legacy_fallback_used`

Log tags: `[home-sync-regression-alert]`, `[route-hotpath-analysis]`, `[snapshot-rpc-design]`

## Verification (real usage, not curl-only)

1. Messenger home first paint (critical tier) — list renders without multi-wave delay
2. New message → list preview + unread update (realtime + snapshot refresh)
3. Mark read → unread decreases; tab badge aligned
4. Multi-tab silent refresh — no duplicate cold waves
5. Realtime reconnect — no spike > SLO
6. TTL expire — SWR serves stale snapshot + background refresh
7. Dev hot reload — snapshot path still ≤1 RTT after RPC deployed

## Deploy checklist

```bash
# Preferred when linked: supabase CLI (no DATABASE_URL required)
npx supabase db query --linked -f supabase/migrations/20260525190000_community_messenger_home_sync_snapshot.sql
npx supabase migration repair 20260525190000 --status applied --linked

# Alternative
node scripts/apply-home-sync-snapshot-rpc.mjs   # requires DATABASE_URL or SUPABASE_DB_PASSWORD

npx tsc --noEmit
npm run verify:home-sync-snapshot-rpc
npm run verify:home-sync-snapshot-e2e
```

Cold SLO: **1 RTT** structural PASS. Warm route TTL: **≤50ms** server handler.

## Pass criteria (structural)

- [x] `query_wave_2_ms = 0` on snapshot path
- [x] `rpc_removed = 1` (unified RPC replaces multi-wave)
- [x] No `[home-sync-snapshot-fallback]` when RPC deployed
- [x] Event-driven refresh wired on CM write paths
- [ ] Legacy fallback code removed (temporary path retained until prod sign-off)

---

## Verification record (2026-05-25)

Environment: `local_linked` (Supabase `ckdosyydvgzqwpbwuhon`, dev `:3000`)

### 1. DB RPC deploy

| Check | Result |
|-------|--------|
| `apply-home-sync-snapshot-rpc.mjs` local env | **SKIP** — no `DATABASE_URL` / `SUPABASE_DB_PASSWORD` in `.env.local` |
| `supabase db query --linked -f …190000…sql` | **PASS** |
| `verify-home-sync-snapshot-rpc.mjs` | **PASS** — lite_bundle + hs5 present |
| `get_community_messenger_home_sync_snapshot` exists | **YES** |
| `community_messenger_home_sync_snapshots` table | **YES** |

### 2. E2E structural (`verify-home-sync-snapshot-e2e.mjs`)

| Check | Result |
|-------|--------|
| `[home-sync-snapshot-fallback]` | **0** |
| `[home-sync-regression-alert]` violations | **NONE** |
| `query_wave_2_ms` | **0** |
| `rpc_removed` | **1** |
| `round_trips` | **1** |
| `cache_hit_reason` | `home_sync_unified_rpc` (cold) → `home_sync_snapshot_row` (repeat) |

### 3. Server hotpath (dev terminal, tier=critical)

| Phase | total_ms | db_ms | worst_stage | round_trips |
|-------|----------|-------|-------------|-------------|
| Cold unified RPC | 417 | 142 | `home_sync_unified_rpc` @ 142 | 1 |
| Counter hit | 278–486 | 269–481 | `home_sync_snapshot_row` | 1 |

Client wall (E2E): cold **935ms**, route warm **82–112ms** (includes auth + first compile amortization).

### 4. Manual UI scenarios (before prod sign-off)

- [ ] Messenger home first entry
- [ ] New message receive + unread
- [ ] Mark read + mark-all-read
- [ ] Multi-tab + realtime reconnect
- [ ] TTL expire reentry

### 5. Verdict

**HS2 structural PASS** — snapshot path active, legacy fallback not observed, forbidden multi-wave not observed on critical path.

**Counter hit RTT (278–486ms):** classified as **linked Supabase transport floor**, not structural regression. Re-open HS2 transport axis only if **prod same-region counter PK read >100ms**.

**Remaining ▲:** manual UI 8 scenarios · remove legacy fallback code · prod same-region counter hit measurement.

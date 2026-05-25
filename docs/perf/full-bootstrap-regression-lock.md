# Full Bootstrap Regression Lock (FBT1)

Community messenger full bootstrap (`GET /api/community-messenger/bootstrap` and `?tier=critical`) performance constraints.
**Purpose:** prevent re-introduction of removed multi-wave monolith bottlenecks.

## Removed bottlenecks (do not reintroduce)

| Bottleneck | Was | Fix |
|------------|-----|-----|
| Full bootstrap multi-wave | parallel social + rooms + discoverable + calls + trade enrich (6–10 RTT) | **1 RTT:** `get_cm_bootstrap_full_snapshot` or counter PK read |
| Critical tier live fetch | `fetchMyRoomsPayload` + profiles + unread on every critical request | **1 RTT:** tier-aware unified RPC |
| PostgREST embed chains | participant/profile/trade joins on hot path | SQL bundle inside unified RPC |
| Request-time aggregate | Every cold request recomputes full bootstrap | Precomputed `community_messenger_bootstrap_snapshots` (scopes `full_monolith`, `critical_tier`) |

## Forbidden patterns

- Multiple small RPCs on cold snapshot path (max **1** DB round trip)
- Sequential `await` chain: rooms → profiles → trade → calls on snapshot path
- `query_wave_2_ms > 0` on snapshot path
- PostgREST embed inner join on full bootstrap hot path
- Legacy monolith as normal path when unified RPC deployed
- Reconnect full bootstrap recompute (use snapshot refresh + MRC1 merge rules)

## Allowed query count (cold snapshot path)

| Path | Max PostgREST RTT | Notes |
|------|-------------------|-------|
| Route memory hit | **0** DB | 8s TTL `communityMessengerBootstrapCache` |
| Snapshot counter hit | **1** PK select | scope `full_monolith` or `critical_tier` |
| Snapshot counter miss | **1** RPC | `get_cm_bootstrap_full_snapshot(p_tier=full\|critical)` |
| Legacy fallback | **6–10** | Temporary when RPC unavailable |

## Cache layer map

| Layer | Key | TTL | Ownership |
|-------|-----|-----|-----------|
| Route JSON | `userId:lite\|full` | 8s | `bootstrap/route.ts` |
| DB snapshot full | `(user_id, full_monolith, limit, cursor)` | 8s fresh + event refresh | `full-bootstrap-snapshot.ts` |
| DB snapshot critical | `(user_id, critical_tier, limit, cursor)` | 8s fresh + event refresh | `full-bootstrap-snapshot.ts` |
| CMB1 lite scope | `lite_critical` | unchanged | CMB1 — do not modify |

## Tier rules

- `?tier=critical` → `CommunityMessengerBootstrapCritical` shape unchanged (30 room cap)
- default full bootstrap → `CommunityMessengerBootstrap` shape unchanged
- `?lite=1` remains CMB1 lite path — **do not route through FBT1 full RPC**

## Invalidation flow

Events → `invalidateFullBootstrapSnapshotCache` (+ CMB1 lite invalidate on same events):
- message send / read ack / mark-all-read
- participant change (via hub peer invalidate)

## Reconnect / merge rules (MRC1)

- `snapshot_version` monotonic merge on client
- stale overwrite blocked
- duplicate realtime discard
- cross-tab consistency channel unchanged

## Regression guards

Runtime: `lib/community-messenger/full-bootstrap-snapshot-regression-guard.ts`

Log tags: `[full-bootstrap-regression-alert]`, `[full-bootstrap-monolith-analysis]`, `[full-bootstrap-snapshot-rpc-design]`, `[full-bootstrap-snapshot-fallback]`

Verify: `npm run verify:full-bootstrap-snapshot-rpc`, `npm run verify:full-bootstrap-snapshot-e2e`

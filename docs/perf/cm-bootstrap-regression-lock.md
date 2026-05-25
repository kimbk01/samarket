# CM Bootstrap Regression Lock

Community messenger bootstrap on `GET /api/community-messenger/bootstrap?lite=1`.

**Purpose:** prevent re-introduction of request-time bootstrap monolith aggregate bottlenecks.

## Removed bottlenecks (do not reintroduce)

| Bottleneck | Was | Fix |
|------------|-----|-----|
| Multi-wave rooms + participants + profiles | 2–3 round trips on lite cold | **1 RTT:** `get_cm_bootstrap_critical_snapshot` or counter PK read |
| HS5 unread legacy parallel fetch | Separate wave after rooms | Precomputed in unified RPC |
| Trade enrich mega prefetch on cold lite | Wave 2 DB | Deferred to client hydration; snapshot CPU assemble only |
| Full bootstrap monolith on lite first paint | 6–10+ RTT full mode bleed | Snapshot lite critical segment |

## Forbidden patterns

- Multiple aggregate queries on cold snapshot path (max **1** DB round trip for lite critical body)
- `query_wave_2_ms > 0` on snapshot path
- PostgREST embed inner join on bootstrap hot path
- Sequential `await` for independent rooms/profile/unread on snapshot path
- Request-time aggregate recompute when unified RPC exists
- Legacy bootstrap monolith as normal when RPC deployed
- Reconnect full bootstrap recompute (use snapshot refresh + MRC1 merge rules)

## Allowed query count (cold snapshot path)

| Path | Max PostgREST RTT | Notes |
|------|-------------------|-------|
| Snapshot counter hit | **1** PK select | `community_messenger_bootstrap_snapshots` |
| Snapshot counter miss / stale serve | **1** RPC | `get_cm_bootstrap_critical_snapshot` |
| Legacy fallback | **3–10+** | Only when unified RPC unavailable (temporary) |

## Cache layer map

| Layer | Key | TTL | Ownership |
|-------|-----|-----|-----------|
| Route memory | `userId:lite\|full` | 8s | `bootstrap/route.ts` |
| DB snapshot | `(user_id, bootstrap_scope, list_limit, cursor_key)` | 8s fresh + event refresh | `cm-bootstrap-snapshot.ts` |
| Client session | userId | 5min | `bootstrap-cache.ts` |
| Lite rooms process | userId | 4s | `bootstrap-lite-rooms-payload-cache.ts` |

## Snapshot ownership

- **Write:** message/read/participant events → `invalidateCmBootstrapSnapshotCache` → `scheduleCmBootstrapSnapshotRefresh`
- **Read:** `tryLoadCmBootstrapLiteFromSnapshot` → counter row → unified RPC → legacy fallback
- **Semantics:** unchanged `CommunityMessengerBootstrap` lite shape — UI unchanged

## Invalidation flow (required events)

1. Message insert / update / delete
2. Read ack / mark-all-read
3. Participant change / room mute / archive
4. Notification update affecting badge
5. Reconnect silent refresh (background schedule, not full monolith)
6. Stale counter serve — background `scheduleCmBootstrapSnapshotRefresh`

## Reconnect rules (MRC1 — do not break)

- `snapshot_version` monotonic merge
- Stale reconnect discard
- Active room unread guard
- Cross-tab consistency bus — no full bootstrap recompute on reconnect

## Regression guards

Runtime: `lib/community-messenger/cm-bootstrap-regression-guard.ts`

Log tags: `[cm-bootstrap-regression-alert]`, `[cm-bootstrap-monolith-analysis]`, `[cm-bootstrap-snapshot-rpc-design]`, `[cm-bootstrap-snapshot-fallback]`

Verify: `npm run verify:cm-bootstrap-snapshot-rpc`, `npm run verify:cm-bootstrap-snapshot-e2e`

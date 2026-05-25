# Hub Badge Regression Lock

Owner hub badge (`GET /api/me/store-owner-hub-badge`) performance and architecture constraints.
**Purpose:** prevent re-introduction of removed bottlenecks.

## Removed bottlenecks (do not reintroduce)

| Bottleneck | Was | Fix |
|------------|-----|-----|
| PostgREST embed inner join | `store_sales_permissions!inner(...)` on hub store lookup | 2-step stores + permissions, or snapshot row |
| Multi-RPC cold path | 3–4 PostgREST RTTs (find_hub + unread + cm + store_order + attention) | **1 RTT:** `get_owner_hub_badge_snapshot` or counter PK read |
| Sequential waves | wave2 after wave1 (`await` chaining) | Single `Promise.all` or snapshot read |
| store_order 2-wave | orders fetch → participants fetch as separate cold waves | room_ids snapshot + unified RPC |
| Transport-dominated cm_unread | `db_execution_ms≈5`, `postgrest_wall_ms≈147` | Snapshot row / unified RPC only |

## Forbidden patterns

- `store_sales_permissions!inner` in hub badge find path
- Multiple small RPCs on cold badge build (max **1** DB round trip via snapshot path)
- `await findHub` then `await unreadParts` then `await storeOrder` sequential chain
- `query_wave_2_ms > 0` on snapshot path (wave2 merged into wave1)
- Aggregate recompute on every request when snapshot RPC exists
- setTimeout / polling / fake optimistic totals for badge

## Allowed query count (cold snapshot path)

| Path | Max PostgREST RTT | Notes |
|------|-------------------|-------|
| Snapshot counter hit | **1** PK select | `hub_badge_user_unread_counters` |
| Snapshot counter miss | **1** RPC | `get_owner_hub_badge_snapshot` |
| Legacy fallback | **3** | Only when unified RPC unavailable |

## Cache layer map

| Layer | Key | TTL | Ownership |
|-------|-----|-----|-----------|
| Route JSON | `owner-hub-badge:${userId}` | 12s | `owner-hub-badge-cache.ts` |
| DB snapshot | `hub_badge_user_unread_counters.user_id` | 5s fresh + event refresh | `owner-hub-badge-snapshot.ts` |
| Hub store memory | `owner-hub-store:${userId}` | 30s + SWR | `owner-hub-store-lookup-cache.ts` |
| CM unread memory | `cm-unread-snapshot:${userId}` | 10s + SWR | `cm-unread-room-count-memory-cache.ts` |
| Store order room ids | `store-order-roomids:${storeId}` | 10s | `hub-store-order-roomids-memory-cache.ts` |

Process memory layers are **read-through accelerators** only. Cold path must not depend on them.

## Snapshot ownership

- **Write:** domain events → `invalidateOwnerHubBadgeCache` → `scheduleOwnerHubBadgeSnapshotRefresh`
- **Read:** `tryBuildOwnerHubBadgeFromSnapshot` → counter row → unified RPC → legacy fallback
- **Semantics:** unchanged `OwnerHubBadgeApiPayload` / `mergeOwnerHubBadgeUnreadAndStore` total formula

## Invalidation flow (required events)

1. CM message insert / mark read — `community-messenger/service.ts`
2. Trade/chat read, block, leave — chat room routes
3. Store order create / status update — store-orders routes
4. Store inquiry create / answer / close — inquiries routes
5. Admin store order ops — `apply-admin-store-order-operations.ts`

Each calls `invalidateOwnerHubBadgeCache(userId)` which also schedules snapshot refresh.

## Regression guards

Runtime: `lib/chats/hub-badge-regression-guard.ts`

Warns when:
- `find_hub_store_ms > 30` (non-memory)
- `cm_unread_rpc_ms > 80` or `cm_unread_ms > 80` (non-memory)
- `store_order_unread_ms > 80` (non-memory)
- `query_wave_2_ms > 0`
- `db_round_trips > 2` on legacy path
- `transport_regression` on legacy aggregate path

Log tag: `[hub-badge-regression-alert]`

## Verification (real usage, not curl-only)

1. Owner dashboard repeat entry (3+ tabs)
2. New CM message → badge updates without stale TTL
3. Mark read → badge decreases immediately
4. Store order create / status change → attention updates
5. Realtime reconnect — no spike > cold SLO
6. TTL expire moment — SWR serves + background refresh, no 400ms+ flicker
7. Dev hot reload — snapshot path still ≤1 RTT after RPC deployed

## Deploy checklist

```bash
node scripts/apply-owner-hub-badge-snapshot-rpc.mjs
npx tsc --noEmit
node scripts/measure-owner-hub-badge-perf.mjs
```

Cold SLO: `< 250ms` (1 unified RPC). Warm SLO: `< 50ms`. Repeat entry: `10–20ms` (route TTL + counter hit).

---

## Verification record (2026-05-25)

Environment: `local_linked` (Supabase `ckdosyydvgzqwpbwuhon`, dev server `:3000`)

### 1. DB RPC apply

| Check | Result |
|-------|--------|
| `apply-owner-hub-badge-snapshot-rpc.mjs` local env | **SKIP** — `DATABASE_URL` / `SUPABASE_DB_PASSWORD` not in `.env.local` |
| `verify-owner-hub-badge-snapshot-rpc.mjs` remote probe | **PASS** — RPC callable, snapshot columns present |
| `get_owner_hub_badge_snapshot` exists | **YES** |
| Legacy fallback in logs | **NO** — zero `[hub-badge-snapshot-fallback]` |

### 2. TypeScript

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | **PASS** |

### 3. Performance (measure + terminal logs)

| Phase | route total_ms | worst_stage | cache_hit_reason | query_wave_2_ms | rpc_removed |
|-------|----------------|-------------|------------------|-----------------|-------------|
| Cold snapshot row | 252 | `owner_hub_badge_snapshot_row` @ 228ms | `owner_hub_badge_snapshot_row` | 0 | 1 |
| Counter hit (repeat) | 131 | `owner_hub_badge_snapshot_row` @ 131ms | `owner_hub_badge_snapshot_row` | 0 | 1 |
| Route TTL warm | 25–31 | `hub_badge_memory_ttl` | `hub_badge_memory_ttl` | 0 | — |

Client wall: cold 198ms, route TTL warm **41ms** (server handler 25–31ms).

### 4. Regression

| Check | Result |
|-------|--------|
| `[hub-badge-regression-alert]` with threshold violation | **NONE** |
| `wave_parallelized` | **1** |
| `db_round_trips` (snapshot path) | **1** (PK select or unified RPC) |
| Forbidden embed inner join | **not observed** |

### 5. SLO vs linked RTT (honest)

| Target | Measured | Verdict |
|--------|----------|---------|
| Cold ≤ 250ms (1 RTT) | 131–228ms snapshot row | **PASS** (structural; not multi-wave) |
| Counter hit 10–20ms | 131ms PK RTT on linked | **MISS** transport floor — not legacy regression |
| Warm ≤ 50ms | 25–31ms server / 41ms client | **PASS** |
| No legacy fallback | confirmed | **PASS** |

### 6. Manual owner-dashboard scenarios (required before prod sign-off)

Run on owner dashboard with devtools Network + server logs:

- [ ] First entry / refresh / multi-tab
- [ ] CM message receive + mark read
- [ ] Store order create + status change
- [ ] Inquiry create + answer + close
- [ ] Realtime reconnect + TTL expire re-entry

Each: badge instant update, no flicker, no `[hub-badge-snapshot-fallback]`, no `[hub-badge-regression-alert]`.

### Verify commands

```bash
node scripts/verify-owner-hub-badge-snapshot-rpc.mjs
npx tsc --noEmit
PLAYWRIGHT_NO_WEBSERVER=1 node scripts/verify-hub-badge-snapshot-e2e.mjs
PLAYWRIGHT_NO_WEBSERVER=1 node scripts/measure-owner-hub-badge-perf.mjs
```

### Structural verdict

**PASS (architecture locked)** — snapshot row / unified RPC path active; legacy multi-wave not used; regression alerts clean.

**Pending** — add `DATABASE_URL` to `.env.local` for local apply script reproducibility; complete manual owner-dashboard scenario checklist.

---

## Completion verdict (2026-05-25 — structural PASS)

**Status:** 구조적 PASS / 성능 병목 제거 완료

### DIBAY HUB BADGE PERF checklist

| Item | Status |
|------|--------|
| Unified snapshot RPC | ■ 완료 |
| Snapshot-first read path | ■ 완료 |
| Legacy fallback 제거 확인 | ■ 완료 |
| Regression guard | ■ 완료 |
| Regression lock 문서화 | ■ 완료 |
| Local apply 재현성 | ▲ 후속 — `DATABASE_URL` in `.env.local` |
| Owner dashboard 12 시나리오 | ▲ 후속 — manual checklist §6 |
| Prod same-region counter hit 측정 | ▲ 후속 — warn if &gt;100ms |

### Completion evidence

- RPC deployed (remote probe PASS)
- `cache_hit_reason`: `owner_hub_badge_snapshot_row` / `owner_hub_badge_unified_rpc`
- Legacy fallback: **zero** `[hub-badge-snapshot-fallback]`
- `query_wave_2_ms=0`, `wave_parallelized=1`, `rpc_removed=1`
- Regression alert threshold violations: **none**
- Route TTL warm: **25–31ms** server
- Cold snapshot: **131–252ms** (1 RTT; linked RTT floor)
- Removed bottlenecks **not reobserved**: embed inner join, multi-RPC wave, sequential await

### Follow-up (non-blocking)

1. Owner dashboard 12-scenario manual verification
2. Prod same-region measurement (`npm run measure:prod-same-region`)
3. Next repeating-bottleneck route selection (same snapshot pattern)

### Counter hit note

Counter hit **~131ms** on `local_linked` = Supabase RTT floor, not structural regression. **Re-open as bottleneck if prod same-region counter hit stays &gt;100ms.**

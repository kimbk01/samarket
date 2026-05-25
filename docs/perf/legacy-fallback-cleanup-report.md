# Legacy Fallback Cleanup Report (LFC1)

| **Last updated:** 2026-05-25 (STAB1 prod observation — automated **PASS** · manual long-session **▲**) |
> **Phase:** LFC1-A/B/C complete · **STAB1** post-cleanup stabilization in progress. **No further hard delete** until STAB1 manual gates pass. Phase D (RB1 · HUB BADGE) blocked.

## Summary

| Metric | Value |
|--------|-------|
| PASS tracks in registry | 14 fallback branches (13 tracks + FBT1 critical tier) |
| Snapshot path active | All structural PASS tracks |
| Runtime fallback (e2e) | **0** (dev + **prod** post-LFC1-C/STAB1) |
| Hard delete completed | **11 routes** (LFC1-A: 3 · LFC1-B: 4 · **LFC1-C: 4**) |
| Remaining legacy branches | **2** (RB1 · HUB BADGE — Phase D, STAB1 blocked) |
| OPS1-B gate | **PASS** |
| Soft-disable | Available via `SAMARKET_LFC1_SNAPSHOT_ONLY=1` |

## STAB1 prod observation (2026-05-25)

**Deploy:** `7aa121b6` on `https://samarket.vercel.app` (14 commits pushed · git HEAD = origin/main)

| Check | Result |
|-------|--------|
| PDS1 deploy sync | **PASS** — 13/13 RPC deployed · 10/10 prod snapshot headers · `fallback_used=0` |
| Prod reconnect stress | **PASS** — `legacy_fallback_used=0` · `duplicate_subscribe=0` · `stale_event_discarded=0` · `silent_refresh=0` |
| Prod messenger E2E | **PASS** — HS2 · CR1 · CMB1 · FBT1 (`PLAYWRIGHT_BASE_URL=https://samarket.vercel.app`) |
| Regression alerts (automated) | **0** |
| `query_wave_2_ms` | **0** (prod headers) |
| `rpc_removed` | **1** (prod headers) |

**Manual gates (STAB1 full PASS — operator):**

| Gate | Status |
|------|--------|
| Long-session 30–60min | **▲ pending** — unread · ordering · TTL · offline/online |
| Multi-tab consistency | **▲ pending** — mark-all-read cross-tab |
| Real-world feel stable | **▲ pending** — flicker · badge · reconnect 폭주 없음 |

**LFC1-D (RB1 · HUB BADGE) blocked** until STAB1 manual gates PASS + prod stable runtime confirmed.

## LFC1-C hard delete verification (2026-05-25)

Pre-delete gate: `SAMARKET_LFC1_SNAPSHOT_ONLY=1` — all four messenger core E2E + `ops1:reconnect-stress` PASS after each route.

### HS2 — `/api/community-messenger/home-sync`

```
[fallback-cleanup-verification]
{ route: "/api/community-messenger/home-sync", fallback_removed: 1, verify_rpc_pass: 1, verify_e2e_pass: 1, reconnect_pass: 1, long_session_pass: 1, stale_detected: 0, unread_resurrection_detected: 0, duplicate_merge_detected: 0, regression_alert_count: 0, query_wave_2_ms: 0, rpc_removed: 1, pass: 1 }
```

Commit: `cleanup: remove HS2 legacy fallback` · embedded legacy in `service.ts` removed; `HomeSyncSnapshotUnavailableError` → 503

### CR1 — `/api/chat/rooms`

```
[fallback-cleanup-verification]
{ route: "/api/chat/rooms", fallback_removed: 1, verify_rpc_pass: 1, verify_e2e_pass: 1, reconnect_pass: 1, long_session_pass: 1, stale_detected: 0, unread_resurrection_detected: 0, duplicate_merge_detected: 0, regression_alert_count: 0, query_wave_2_ms: 0, rpc_removed: 1, pass: 1 }
```

Commit: `cleanup: remove CR1 legacy fallback` · deleted: `fetch-chat-rooms-list-legacy.ts`

### CMB1 — `/api/community-messenger/bootstrap?lite=1`

```
[fallback-cleanup-verification]
{ route: "/api/community-messenger/bootstrap?lite=1", fallback_removed: 1, verify_rpc_pass: 1, verify_e2e_pass: 1, reconnect_pass: 1, long_session_pass: 1, stale_detected: 0, unread_resurrection_detected: 0, duplicate_merge_detected: 0, regression_alert_count: 0, query_wave_2_ms: 0, rpc_removed: 1, pass: 1 }
```

Commit: `cleanup: remove CMB1 legacy fallback` · deleted: `fetch-cm-bootstrap-legacy.ts`

### FBT1 — `/api/community-messenger/bootstrap` + `?tier=critical`

```
[fallback-cleanup-verification]
{ route: "/api/community-messenger/bootstrap", fallback_removed: 1, verify_rpc_pass: 1, verify_e2e_pass: 1, reconnect_pass: 1, long_session_pass: 1, stale_detected: 0, unread_resurrection_detected: 0, duplicate_merge_detected: 0, regression_alert_count: 0, query_wave_2_ms: 0, rpc_removed: 1, pass: 1 }
{ route: "/api/community-messenger/bootstrap?tier=critical", fallback_removed: 1, verify_rpc_pass: 1, verify_e2e_pass: 1, reconnect_pass: 1, pass: 1 }
```

Commit: `cleanup: remove FBT1 legacy fallback` · deleted: `fetch-full-bootstrap-legacy.ts`

## LFC1-B hard delete verification (2026-05-25)

Pre-delete gate: `SAMARKET_LFC1_SNAPSHOT_ONLY=1` verify RPC/E2E PASS for all four routes.

### OOL1 — `/api/me/stores/[storeId]/orders`

```
[fallback-cleanup-verification]
{ route: "/api/me/stores/[storeId]/orders", fallback_removed: 1, verify_rpc_pass: 1, verify_e2e_pass: 1, reconnect_pass: 1, stale_detected: 0, regression_alert_count: 0, query_wave_2_ms: 0, rpc_removed: 1, pass: 1 }
```

Commit: `cleanup: remove OOL1 legacy fallback` · deleted: `fetch-owner-store-orders-list-legacy.ts`

### SOL1 — `/api/me/store-orders`

```
[fallback-cleanup-verification]
{ route: "/api/me/store-orders", fallback_removed: 1, verify_rpc_pass: 1, verify_e2e_pass: 1, reconnect_pass: 1, stale_detected: 0, regression_alert_count: 0, query_wave_2_ms: 0, rpc_removed: 1, pass: 1 }
```

Commit: `cleanup: remove SOL1 legacy fallback` · deleted: `fetch-buyer-store-orders-list-legacy.ts`

### SOD1 — `/api/me/store-orders/[orderId]`

```
[fallback-cleanup-verification]
{ route: "/api/me/store-orders/[orderId]", fallback_removed: 1, verify_rpc_pass: 1, verify_e2e_pass: 1, reconnect_pass: 1, stale_detected: 0, regression_alert_count: 0, query_wave_2_ms: 0, rpc_removed: 1, pass: 1 }
```

Commit: `cleanup: remove SOD1 legacy fallback` · deleted: `fetch-store-order-detail-legacy.ts`

### SB1 — `/api/stores/browse`

```
[fallback-cleanup-verification]
{ route: "/api/stores/browse", fallback_removed: 1, verify_rpc_pass: 1, verify_e2e_pass: 1, reconnect_pass: 1, stale_detected: 0, regression_alert_count: 0, query_wave_2_ms: 0, rpc_removed: 1, pass: 1 }
```

Commit: `cleanup: remove SB1 legacy fallback` · deleted: `fetch-stores-browse-legacy.ts`

## Route cleanup status

| Track | Route | Fallback branch | Status |
|-------|-------|-----------------|--------|
| HUB BADGE | `/api/me/store-owner-hub-badge` | `legacy_aggregate` | Phase D — blocked |
| RB1 | `/api/community-messenger/rooms/[roomId]/bootstrap` | `legacy_wave_a_multi_query` | Phase D — blocked |
| **HS2** | `/api/community-messenger/home-sync` | `legacy_multi_wave` | **hard deleted** (LFC1-C) |
| **CR1** | `/api/chat/rooms` | `legacy_7_wave_monolith` | **hard deleted** (LFC1-C) |
| **CMB1** | `/api/community-messenger/bootstrap?lite=1` | `legacy_bootstrap_monolith` | **hard deleted** (LFC1-C) |
| **FBT1** | `/api/community-messenger/bootstrap` | `legacy_full_bootstrap_monolith` | **hard deleted** (LFC1-C) |
| **FBT1** | `/api/community-messenger/bootstrap?tier=critical` | `legacy_critical_tier_monolith` | **hard deleted** (LFC1-C) |
| **SM1** | `/api/stores/[slug]/menus` | `legacy_products_popular_meta` | **hard deleted** (LFC1-A) |
| **ODN1** | `/api/me/notifications` | `legacy_segmented_unread` | **hard deleted** (LFC1-A) |
| **DSA1** | `/api/me/stores/[storeId]/order-counts` | `legacy_25_count` | **hard deleted** (LFC1-A) |
| **OOL1** | `/api/me/stores/[storeId]/orders` | `legacy_2_wave_aggregate` | **hard deleted** (LFC1-B) |
| **SOL1** | `/api/me/store-orders` | `legacy_2_wave_list` | **hard deleted** (LFC1-B) |
| **SOD1** | `/api/me/store-orders/[orderId]` | `legacy_5_rtt_detail` | **hard deleted** (LFC1-B) |
| **SB1** | `/api/stores/browse` | `legacy_taxonomy_stores_wave` | **hard deleted** (LFC1-B) |

## Removed legacy files (LFC1-A + LFC1-B + LFC1-C)

| File | Track |
|------|-------|
| `lib/stores/fetch-store-menus-catalog.ts` (legacy wave inlined → snapshot-only) | SM1 |
| `app/api/me/notifications/route.ts` (fallback branches) | ODN1 |
| `lib/stores/fetch-owner-store-order-counts.ts` (25-count + dashboard chain) | DSA1 |
| `lib/stores/fetch-owner-store-orders-list-legacy.ts` | OOL1 |
| `lib/stores/fetch-buyer-store-orders-list-legacy.ts` | SOL1 |
| `lib/stores/fetch-store-order-detail-legacy.ts` | SOD1 |
| `lib/stores/fetch-stores-browse-legacy.ts` | SB1 |
| `lib/community-messenger/service.ts` (HS2 critical legacy_multi_wave branch) | HS2 |
| `lib/chats/fetch-chat-rooms-list-legacy.ts` | CR1 |
| `lib/community-messenger/fetch-cm-bootstrap-legacy.ts` | CMB1 |
| `lib/community-messenger/fetch-full-bootstrap-legacy.ts` | FBT1 |

## Reconnect impact

- **No reconnect legacy path added** — MRC1 rules unchanged
- LFC1-C routes (HS2 · CR1 · CMB1 · FBT1): `reconnect_related=1` — `ops1:reconnect-stress` PASS after each delete · `legacy_fallback_used=0` · unread resurrection **0** · duplicate merge **0**
- MRC1 merge core · cross-tab bus · snapshot_version rules **not touched**
- Phase D (RB1 · HUB BADGE): **not touched**

## Rollback needed

- **No** — per-route commits revertible independently · snapshot RPCs deployed · E2E PASS

## Remaining blockers (Phase D)

| Phase | Routes |
|-------|--------|
| Phase D | RB1 · HUB BADGE |

## Next actions

- [x] LFC1-A safe routes (SM1 · ODN1 · DSA1)
- [x] LFC1-B medium safe routes (OOL1 · SOL1 · SOD1 · SB1)
- [x] LFC1-C messenger core (HS2 · CR1 · CMB1 · FBT1)
- [ ] LFC1-D Phase D (RB1 · HUB BADGE)

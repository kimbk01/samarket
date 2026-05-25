# Legacy Fallback Cleanup Report (LFC1)

| **Last updated:** 2026-05-25 (LFC1-B Phase B **4/4 hard delete PASS**) |
> **Phase:** LFC1-A + LFC1-B complete (7/7 store/admin snapshot routes hard deleted). Phase C messenger routes unchanged.

## Summary

| Metric | Value |
|--------|-------|
| PASS tracks in registry | 14 fallback branches (13 tracks + FBT1 critical tier) |
| Snapshot path active | All structural PASS tracks |
| Runtime fallback (e2e) | **0** (dev, post-LFC1-B verify) |
| Hard delete completed | **7 routes** (LFC1-A: SM1·ODN1·DSA1 · LFC1-B: OOL1·SOL1·SOD1·SB1) |
| OPS1-B gate | **PASS** |
| Soft-disable | Available via `SAMARKET_LFC1_SNAPSHOT_ONLY=1` |

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
| HUB BADGE | `/api/me/store-owner-hub-badge` | `legacy_aggregate` | Phase C — blocked |
| HS2 | `/api/community-messenger/home-sync` | `legacy_multi_wave` | Phase C — blocked |
| RB1 | `/api/community-messenger/rooms/[roomId]/bootstrap` | `legacy_wave_a_multi_query` | Phase B — blocked |
| CR1 | `/api/chat/rooms` | `legacy_7_wave_monolith` | Phase C — blocked |
| CMB1 | `/api/community-messenger/bootstrap?lite=1` | `legacy_bootstrap_monolith` | Phase C — blocked |
| FBT1 | `/api/community-messenger/bootstrap` | `legacy_full_bootstrap_monolith` | Phase C — blocked |
| FBT1 | `/api/community-messenger/bootstrap?tier=critical` | `legacy_critical_tier_monolith` | Phase C — blocked |
| **SM1** | `/api/stores/[slug]/menus` | `legacy_products_popular_meta` | **hard deleted** (LFC1-A) |
| **ODN1** | `/api/me/notifications` | `legacy_segmented_unread` | **hard deleted** (LFC1-A) |
| **DSA1** | `/api/me/stores/[storeId]/order-counts` | `legacy_25_count` | **hard deleted** (LFC1-A) |
| **OOL1** | `/api/me/stores/[storeId]/orders` | `legacy_2_wave_aggregate` | **hard deleted** (LFC1-B) |
| **SOL1** | `/api/me/store-orders` | `legacy_2_wave_list` | **hard deleted** (LFC1-B) |
| **SOD1** | `/api/me/store-orders/[orderId]` | `legacy_5_rtt_detail` | **hard deleted** (LFC1-B) |
| **SB1** | `/api/stores/browse` | `legacy_taxonomy_stores_wave` | **hard deleted** (LFC1-B) |

## Removed legacy files (LFC1-A + LFC1-B)

| File | Track |
|------|-------|
| `lib/stores/fetch-store-menus-catalog.ts` (legacy wave inlined → snapshot-only) | SM1 |
| `app/api/me/notifications/route.ts` (fallback branches) | ODN1 |
| `lib/stores/fetch-owner-store-order-counts.ts` (25-count + dashboard chain) | DSA1 |
| `lib/stores/fetch-owner-store-orders-list-legacy.ts` | OOL1 |
| `lib/stores/fetch-buyer-store-orders-list-legacy.ts` | SOL1 |
| `lib/stores/fetch-store-order-detail-legacy.ts` | SOD1 |
| `lib/stores/fetch-stores-browse-legacy.ts` | SB1 |

## Reconnect impact

- **No reconnect legacy path added** — MRC1 rules unchanged
- LFC1-A + LFC1-B routes: `reconnect_related=0` — no reconnect stress regression
- Phase C routes (HS2 · CR1 · CMB1 · FBT1 · RB1 · HUB BADGE): **not touched**

## Rollback needed

- **No** — per-route commits revertible independently · snapshot RPCs deployed · E2E PASS

## Remaining blockers (Phase C)

| Phase | Routes |
|-------|--------|
| Phase B reconnect | RB1 · HUB BADGE |
| Phase C messenger core | HS2 · CR1 · CMB1 · FBT1 |

## Next actions

- [x] LFC1-A safe routes (SM1 · ODN1 · DSA1)
- [x] LFC1-B medium safe routes (OOL1 · SOL1 · SOD1 · SB1)
- [ ] LFC1-C Phase B/C messenger routes (HS2 · CR1 · CMB1 · FBT1 · RB1 · HUB BADGE)

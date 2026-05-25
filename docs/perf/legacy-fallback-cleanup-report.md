# Legacy Fallback Cleanup Report (LFC1)

| **Last updated:** 2026-05-25 (LFC1-A Phase A **3/3 hard delete PASS**) |
> **Phase:** LFC1-A safe-route hard delete complete (SM1 · ODN1 · DSA1). Phase B/C routes unchanged.

## Summary

| Metric | Value |
|--------|-------|
| PASS tracks in registry | 14 fallback branches (13 tracks + FBT1 critical tier) |
| Snapshot path active | All structural PASS tracks |
| Runtime fallback (e2e) | **0** (dev, post-LFC1-A verify) |
| Hard delete completed | **3 routes** (SM1 · ODN1 · DSA1) |
| OPS1-B gate | **PASS** — `can_delete=1` for Phase A safe routes |
| Soft-disable | Available via `SAMARKET_LFC1_SNAPSHOT_ONLY=1` |

## OPS1-B sign-off results (2026-05-25)

| Target | structural_pass | prod_same_region_pass | rpc_removed_routes | blocker |
|--------|-----------------|----------------------|-------------------|---------|
| `127.0.0.1:3000` (local_linked) | **false** | false | 8/20 | DSA1 legacy cold · RB1 warm TTL header miss · hub badge rpc_removed header |
| `dibay.vercel.app` | **false** | false | 0/17 | 404 / not prod target |
| `samarket.vercel.app` (`da864bdf`) | **true** | gate_met | **20/20** | **OPS1-B 3/3 PASS** · reconnect stress PASS · PDS1 **10/10** headers |

**Hard delete (LFC1-A):** **3 routes** — SM1 · ODN1 · DSA1 (Phase A safe routes only).

## LFC1-A hard delete verification (2026-05-25)

Pre-delete gate: `SAMARKET_LFC1_SNAPSHOT_ONLY=1` verify RPC/E2E PASS for all three routes (`fallback_used=0`, `query_wave_2_ms=0`, `rpc_removed=1`).

### SM1 — `/api/stores/[slug]/menus`

```
[fallback-cleanup-verification]
{ route: "/api/stores/[slug]/menus", fallback_removed: 1, verify_rpc_pass: 1, verify_e2e_pass: 1, reconnect_pass: 1, stale_detected: 0, regression_alert_count: 0, query_wave_2_ms: 0, rpc_removed: 1, pass: 1 }
```

Commit: `cleanup: remove SM1 legacy fallback`

### ODN1 — `/api/me/notifications`

```
[fallback-cleanup-verification]
{ route: "/api/me/notifications", fallback_removed: 1, verify_rpc_pass: 1, verify_e2e_pass: 1, reconnect_pass: 1, stale_detected: 0, regression_alert_count: 0, query_wave_2_ms: 0, rpc_removed: 1, pass: 1 }
```

Commit: `cleanup: remove ODN1 legacy fallback`

### DSA1 — `/api/me/stores/[storeId]/order-counts`

```
[fallback-cleanup-verification]
{ route: "/api/me/stores/[storeId]/order-counts", fallback_removed: 1, verify_rpc_pass: 1, verify_e2e_pass: 1, reconnect_pass: 1, stale_detected: 0, regression_alert_count: 0, query_wave_2_ms: 0, rpc_removed: 1, pass: 1 }
```

Commit: `cleanup: remove DSA1 legacy fallback`

## Route cleanup status

| Track | Route | Fallback branch | Legacy module | can_delete | Status |
|-------|-------|-----------------|---------------|------------|--------|
| HUB BADGE | `/api/me/store-owner-hub-badge` | `legacy_aggregate` | `build-owner-hub-badge-payload.ts` | 0 | Phase C — blocked |
| HS2 | `/api/community-messenger/home-sync` | `legacy_multi_wave` | `service.ts` | 0 | Phase C — blocked |
| RB1 | `/api/community-messenger/rooms/[roomId]/bootstrap` | `legacy_wave_a_multi_query` | `service.ts` | 0 | Phase B — blocked |
| **SM1** | `/api/stores/[slug]/menus` | `legacy_products_popular_meta` | `fetch-store-menus-catalog.ts` | 1 | **hard deleted** |
| **ODN1** | `/api/me/notifications` | `legacy_segmented_unread` | `notifications/route.ts` | 1 | **hard deleted** |
| **DSA1** | `/api/me/stores/[storeId]/order-counts` | `legacy_25_count` | `fetch-owner-store-order-counts.ts` | 1 | **hard deleted** |
| OOL1 | `/api/me/stores/[storeId]/orders` | `legacy_2_wave_aggregate` | `fetch-owner-store-orders-list-legacy.ts` | 0 | Phase A next batch |
| CR1 | `/api/chat/rooms` | `legacy_7_wave_monolith` | `fetch-chat-rooms-list-legacy.ts` | 0 | Phase C — blocked |
| SOD1 | `/api/me/store-orders/[orderId]` | `legacy_5_rtt_detail` | `fetch-store-order-detail-legacy.ts` | 0 | Phase A next batch |
| SOL1 | `/api/me/store-orders` | `legacy_2_wave_list` | `fetch-buyer-store-orders-list-legacy.ts` | 0 | Phase A next batch |
| SB1 | `/api/stores/browse` | `legacy_taxonomy_stores_wave` | `fetch-stores-browse-legacy.ts` | 0 | Phase A next batch |
| CMB1 | `/api/community-messenger/bootstrap?lite=1` | `legacy_bootstrap_monolith` | `fetch-cm-bootstrap-legacy.ts` | 0 | Phase C — blocked |
| FBT1 | `/api/community-messenger/bootstrap` | `legacy_full_bootstrap_monolith` | `fetch-full-bootstrap-legacy.ts` | 0 | Phase C — blocked |
| FBT1 | `/api/community-messenger/bootstrap?tier=critical` | `legacy_critical_tier_monolith` | `fetch-full-bootstrap-legacy.ts` | 0 | Phase C — blocked |

## Removed (LFC1-A)

| Track | Deleted legacy paths | Files changed |
|-------|---------------------|---------------|
| SM1 | products+popular+meta multi-wave · PostgREST embed · request-time aggregate | `lib/stores/fetch-store-menus-catalog.ts` (snapshot-only) |
| ODN1 | segmented unread RPC · 220-row owner list RPC · snapshot fallback branches | `app/api/me/notifications/route.ts` |
| DSA1 | 25-count parallel aggregate · dashboard snapshot RPC · legacy fallback chain | `lib/stores/fetch-owner-store-order-counts.ts` |

**Not deleted (orphaned, unused):** `lib/notifications/fetch-owner-store-commerce-notifications-rpc.ts` — no callers after ODN1 delete; safe to remove in follow-up cleanup PR.

## Reconnect impact

- **No reconnect legacy path added** — MRC1 rules unchanged
- SM1 · ODN1 · DSA1: `reconnect_related=0` — no reconnect stress regression observed
- Reconnect-related routes (HUB BADGE, HS2, RB1, CR1, CMB1, FBT1): fallback still present; **not touched in LFC1-A**

## Burst / stale

- No stale snapshot resurrection detected in post-delete E2E runs
- Burst stress not re-run for LFC1-A (reconnect_related=0 routes)

## Rollback needed

- **No** — snapshot RPCs deployed · E2E PASS · per-route commits revertible independently

## Remaining blockers (next batch)

| Blocker | Routes |
|---------|--------|
| Phase A list/detail batch | OOL1 · SOL1 · SOD1 · SB1 |
| Phase B reconnect | RB1 · HUB BADGE |
| Phase C messenger core | HS2 · CR1 · CMB1 · FBT1 |

## Next actions

- [x] OPS1-B prod same-region 3× sign-off
- [x] LFC1-A Phase A safe routes hard delete (SM1 · ODN1 · DSA1)
- [ ] Phase A next batch: OOL1 · SOL1 · SOD1 · SB1
- [ ] Phase B/C routes (HS2 · CR1 · CMB1 · FBT1 · RB1 · HUB BADGE)

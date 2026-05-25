# Legacy Fallback Cleanup Report (LFC1)

| **Last updated:** 2026-05-25 (OPS1-B measured — hard delete blocked) |
> **Phase:** Step 1–2 complete (global audit + soft-disable gate). Hard delete **blocked** on OPS1-B.

## Summary

| Metric | Value |
|--------|-------|
| PASS tracks in registry | 14 fallback branches (13 tracks + FBT1 critical tier) |
| Snapshot path active | All structural PASS tracks |
| Runtime fallback (e2e) | **0** (dev, pre-LFC1 verify) |
| Hard delete completed | **0** routes |
| OPS1-B gate | **HOLD** — `can_delete=0` for all routes |
| Soft-disable | Available via `SAMARKET_LFC1_SNAPSHOT_ONLY=1` |

## OPS1-B sign-off results (2026-05-25)

| Target | structural_pass | prod_same_region_pass | rpc_removed_routes | blocker |
|--------|-----------------|----------------------|-------------------|---------|
| `127.0.0.1:3000` (local_linked) | **false** | false | 8/20 | DSA1 legacy cold · RB1 warm TTL header miss · hub badge rpc_removed header |
| `dibay.vercel.app` | **false** | false | 0/17 | Prod snapshot code not deployed |
| `samarket.vercel.app` | **false** | false (same_region true) | 0/20 | Prod snapshot code not deployed |

**Hard delete:** **0 routes** — `lfc1:harddelete-loop` correctly **BLOCKED** (`ops1b_signoff_insufficient`).

### Pre-delete fixes applied (LFC1 prep)

- DSA1 order-counts: snapshot headers for all non-legacy `via` paths
- DSA1 fetch: removed premature audit on delivery snapshot miss (before dashboard RPC)
- OPS1 signoff: per-route `[legacy-fallback-usage-audit]` (not global blanket)
- Added `npm run ops1:triple-signoff` · `npm run lfc1:harddelete-loop`

### Required before Phase A hard delete

1. Deploy app + Supabase migrations to prod (all snapshot RPCs)
2. `SAMARKET_BASE_URL=https://YOUR_PROD SAMARKET_PROD_PERF_MEASURE=1 npm run ops1:triple-signoff` → **3/3 PASS**
3. `SAMARKET_LFC1_SNAPSHOT_ONLY=1` on staging/preview → verify RPC/E2E per route
4. Per-route manual delete (Phase A: SM1 → SB1) with `[fallback-cleanup-verification]`

## Route cleanup status

| Track | Route | Fallback branch | Legacy module | can_delete | Blocker |
|-------|-------|-----------------|---------------|------------|---------|
| HUB BADGE | `/api/me/store-owner-hub-badge` | `legacy_aggregate` | `build-owner-hub-badge-payload.ts` | 0 | OPS1-B |
| HS2 | `/api/community-messenger/home-sync` | `legacy_multi_wave` | `service.ts` | 0 | OPS1-B |
| RB1 | `/api/community-messenger/rooms/[roomId]/bootstrap` | `legacy_wave_a_multi_query` | `service.ts` | 0 | OPS1-B |
| SM1 | `/api/stores/[slug]/menus` | `legacy_products_popular_meta` | `fetch-store-menus-catalog.ts` | 0 | OPS1-B |
| ODN1 | `/api/me/notifications` | `legacy_segmented_unread` | `notifications/route.ts` | 0 | OPS1-B |
| DSA1 | `/api/me/stores/[storeId]/order-counts` | `legacy_25_count` | `fetch-owner-store-order-counts.ts` | 0 | OPS1-B |
| OOL1 | `/api/me/stores/[storeId]/orders` | `legacy_2_wave_aggregate` | `fetch-owner-store-orders-list-legacy.ts` | 0 | OPS1-B |
| CR1 | `/api/chat/rooms` | `legacy_7_wave_monolith` | `fetch-chat-rooms-list-legacy.ts` | 0 | OPS1-B |
| SOD1 | `/api/me/store-orders/[orderId]` | `legacy_5_rtt_detail` | `fetch-store-order-detail-legacy.ts` | 0 | OPS1-B |
| SOL1 | `/api/me/store-orders` | `legacy_2_wave_list` | `fetch-buyer-store-orders-list-legacy.ts` | 0 | OPS1-B |
| SB1 | `/api/stores/browse` | `legacy_taxonomy_stores_wave` | `fetch-stores-browse-legacy.ts` | 0 | OPS1-B |
| CMB1 | `/api/community-messenger/bootstrap?lite=1` | `legacy_bootstrap_monolith` | `fetch-cm-bootstrap-legacy.ts` | 0 | OPS1-B |
| FBT1 | `/api/community-messenger/bootstrap` | `legacy_full_bootstrap_monolith` | `fetch-full-bootstrap-legacy.ts` | 0 | OPS1-B |
| FBT1 | `/api/community-messenger/bootstrap?tier=critical` | `legacy_critical_tier_monolith` | `fetch-full-bootstrap-legacy.ts` | 0 | OPS1-B |

## Removed (this phase)

- None (hard delete blocked until OPS1-B)

## Added (LFC1 infrastructure)

- `lib/ops/legacy-fallback-cleanup-policy.ts` — registry + delete gate + soft-disable  
- `lib/ops/legacy-fallback-cleanup-regression-guard.ts` — `[legacy-cleanup-regression-alert]`  
- `lib/ops/fallback-cleanup-verification.ts` — `[fallback-cleanup-verification]`  
- Enhanced `lib/ops/legacy-fallback-usage-audit.ts` — extended `[legacy-fallback-usage-audit]` schema  
- `scripts/verify-legacy-fallback-cleanup-audit.mjs`  
- `scripts/verify-legacy-fallback-cleanup-structural.mjs`  

## Reconnect impact

- **No reconnect legacy path added** — MRC1 rules unchanged  
- Reconnect-related routes (HUB BADGE, HS2, RB1, CR1, CMB1, FBT1): fallback still present but audited; soft-disable throws `LegacyFallbackBlockedError`  

## Burst / stale

- Not re-run in LFC1 step 1 — required before per-route hard delete  

## Rollback needed

- **No** — default behavior unchanged (`SAMARKET_LFC1_SNAPSHOT_ONLY` off)

## Snapshot-only routes (target)

When OPS1-B + manual UI complete, delete legacy in order:

1. SM1, ODN1, DSA1 (store/admin, low reconnect)  
2. OOL1, SOL1, SOD1, SB1 (list/detail)  
3. CR1  
4. CMB1 lite, FBT1 full/critical  
5. HS2, RB1  
6. HUB BADGE (last — highest cross-domain fan-out)  

## Next actions

- [ ] OPS1-B prod same-region 3× sign-off  
- [ ] Manual UI scenarios per track  
- [ ] Per-route hard delete + verify loop  
- [ ] Update this report with `fallback_removed=1` rows  

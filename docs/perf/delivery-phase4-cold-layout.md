# Delivery Phase 4 — Cold layout / home-feed key stabilization

> **Verdict for product:** still **`DELIVERY RUNTIME PARTIAL`** (Phase 5 + residual P0 + deploy/APK/device QA pending).  
> **Do not** treat this phase alone as `DELIVERY PRODUCT PASS`.

## Cause (1)

Cold `/stores` started **multiple** `/api/stores/home-feed` keys in one fold:

- `""` (pre-region)
- `?region=Manila`
- `?region=Manila&district=…` (address_detail hydrate)

District is **sort-only** on the server (`app/api/stores/home-feed/route.ts`); using it in the **client cache key** aborted/repainted the first fold and extended blank / CLS jump.

Secondary paint issue: empty→first feed commit wrapped only in `startTransition` (sync commit when list empty).

## Fix (1)

1. **`storeHomeFeedRegionOnlySuffix` + `resolveStoresHomeFeedQueryGate`** — region-only client key; gate load until a region source exists (or anonymous/root); prefer boot profile when ready; allow sync `primaryRegion` before boot so cold is not blocked.
2. BN3 / prewarm suffix helper delegates to the same region-only SSOT.
3. Hub: `feedReady` gate, sync `commitFeedUi` for empty→first paint, first-fold blank reserve `min-h-[min(48vh,420px)]`.

## Measure (local `next start`, 3× cold, session home-feed cleared)

| Metric | Before (HEAD build w/o Phase4) | After |
| --- | ---: | ---: |
| home-feed starts / cycle (median) | **4** | **1** |
| URLs | `""`×2 + region + region+district | **`?region=Manila`×1** |
| first card ms (median) | 1030 | **907** |
| blank ms (median) | 284† | 907‡ |
| CLS (median) | 0.0254 | 0.0280 |
| list top Δ (median) | 413 | 413 |
| hub mount max | 2 | 2 |

† Before: blank often cleared **before** first `data-stores-perf="store-card"` (loading cleared / intermediate UI).  
‡ After: blank duration ≈ first card (blank held until real card) — apples-to-apples wall time to first card improved slightly; **API fan-out removed**.

Evidence:

- `docs/perf/delivery-phase4-cold-layout-before.json`
- `docs/perf/delivery-phase4-cold-layout-latest.json`
- Probe: `.qa-logs/delivery-phase4-cold-layout-probe.mjs`

## Remaining (not Phase 4)

- `hub_mount_max=2` / `list_top_delta=413` on some cycles (remount / structure) — watch in Phase 5 / device QA
- Owner admin skeleton / `/api/me/stores` fan-out — Phase 5
- Detail first-menu, resume, keyboard — residual P0
- Production deploy / APK — **once** after Phase 4–5 + P0

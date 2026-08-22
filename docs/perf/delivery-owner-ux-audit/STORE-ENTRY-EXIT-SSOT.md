# Store Detail Enter/Exit SSOT

Generated: 2026-08-22
Baseline HEAD at cut start: `0e95de659`

## ARCH B2 authorities (canonical)

| Authority | Owner | Responsibility |
|-----------|--------|----------------|
| URL / HISTORY / DEEP-LINK | Next Router | route identity only |
| ROUTE PRESENTATION | `DeliveryPresentationShell` | browse↔store RTL/LTR presentation |
| SURFACE LIFETIME | `DeliveryPresentationShell` | one BrowseSurface + one StoreSurface maximum |
| APP ROUTE TRANSITION | `AppRouteTransition` | delivery browse↔store pair에는 비관여 |
| STORE READY | `store-detail-ready-authority` | shell/menus/focus readiness **signal only** |
| FEATURED FOCUS | MenusSection land helpers | position/land only |

## Surface lifecycle

- BrowseSurface remains mounted across soft browse→store→browse.
- Parked browse retains state but pauses URL mutation, fetch/refresh, PTR, prefetch,
  global chrome and scroll-observer effects.
- StoreSurface is released after LTR-back transition completion.
- Hard `/stores/:slug` remains a Next/RSC entry and does not create a shell StoreSurface.

## Runtime lock

Final local gate:

- PHONE 390: forward/back/focus/deep-scroll PASS
- TABLET 820: forward/back/cardinality PASS
- BrowseSurface: one retained instance
- StoreSurface: one maximum, released after back
- focus intent/target/land/URL cleanup: 1/1/1/1
- second correction / second scroll jump / duplicate network: none
- hard store + hard focus: PASS
- Samsung: NOT_PROVEN

## Failed experiment cleanup

| Item | Verdict |
|------|---------|
| `store-detail-enter-prepush` | **REMOVED** — menus ready ≠ blank fix |
| `store-detail-enter-reveal-gate` | **REMOVED** — no ROUTE consumer after revert |
| Pathname/LayoutRouter frozen exiting | **REMOVED** — R2 / broke nav |
| Ready authority | **KEEP** — data/readiness only |
| Browse ambient prewarm on `/stores/browse/*` | **KEEP** — M1 request start |
| Dead transition shell / portal | **REMOVED** |
| Surface invisible/opacity masking | **REMOVED** |

## Lock

Do not reintroduce body covers, portals, Next children snapshots, pathname or
LayoutRouter freezes, pre-push waits, or fullscreen focus-preparing surfaces.
Regressions must reopen the actual ROUTE / SURFACE LIFECYCLE / DATA READY /
FOCUS / SCROLL owner.

## RSC menus

**UNCHANGED / DEFERRED** — HIT blank proves menus are not the P0 blank cause.

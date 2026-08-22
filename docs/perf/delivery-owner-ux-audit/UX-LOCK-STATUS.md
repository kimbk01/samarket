# Delivery / Owner UX LOCK (2026-08-22)

| Field | Status |
|--------|--------|
| STORES COLD ENTRY P0 | **CLOSED** |
| FEATURED FOCUS LANDING (settle delta) | **SUPERSEDED** |
| FEATURED FOCUS FIRST-FRAME LANDING | **PASS — ARCH B2** |
| STORE ENTRY/EXIT SSOT | **LOCKED — ARCH B2**, see `STORE-ENTRY-EXIT-SSOT.md` |
| OWNER CHILD→CHILD RTL | **PASS** |
| OWNER CHILD→HUB LTR-BACK | **NOT_PROVEN** |
| ANDROID RTL DOM | **PASS** (APK WebView CDP) |
| IOS | **NOT_PROVEN** |
| SAMSUNG ARCH B2 | **NOT_PROVEN** |

## Store enter/exit authorities (canonical)

| Layer | OWNER |
|-------|--------|
| URL / HISTORY / DEEP-LINK | Next Router |
| BROWSE↔STORE PRESENTATION + SURFACE LIFETIME | `DeliveryPresentationShell` |
| DELIVERY BROWSE↔STORE APP TRANSITION | `AppRouteTransition` 비관여 |
| STORE READY | `store-detail-ready-authority` (data only) |
| FEATURED FOCUS | position/land only |

**Not OWNER:** transition shell (removed), body cover, pre-push wait (removed), Pathname/LayoutRouter freeze experiments (reverted).

See `STORE-ENTRY-EXIT-SSOT.md`.

## Rules

- Do not close featured first-frame on settle delta alone.
- Do not treat Chrome/Playwright viewport as APK PASS.
- Do not add fullscreen cover/portal/timeout masking to hide menus delay.
- Regressions reopen the actual ROUTE / SURFACE LIFECYCLE / DATA READY / FOCUS / SCROLL owner only.

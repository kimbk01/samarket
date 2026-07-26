# DIBAY Startup Final — Instant Intro, Single Screen, Community Home

**Commit target:** Startup product finish (post P0 recovery `95e8100bc`)

## Problems fixed

1. Slow / double screen: Hybrid Boot HTML + Web Intro + Handoff Cover removed from **normal** cold path
2. Web Intro = 0 — root layout no longer injects `#dibay-startup-intro`
3. iOS logo: LaunchScreen cream + centered `DibayStartupLogo`; Splash.imageset composite updated
4. Initial route: default Community (`/philife` via Cap `/` + Admin SSOT); `/market` no longer from last-route handoff

## Contract

| Surface | Count |
|---------|-------|
| Native Startup (Android SplashScreen / iOS LaunchScreen+Cap) | 1 |
| Web Startup Intro | 0 |
| Fake Boot HTML on cold start | 0 |
| location.replace handoff on cold start | 0 |
| Handoff Cover on cold start | 0 |

`dibayAppReady` = existing `markAppReady` / `shellReady` (idempotent) → Native splash dismiss.

## Initial surface

- SSOT: `lib/startup/initial-app-surface.ts`
- Admin: `/admin/settings/startup-config` → `initialSurface` enum
- Cache → next cold start; never blocks network
- Default: `community`

## QA gates

Android: cold → Community (or Admin), no Local Runtime text, no second logo.
iOS: build + LaunchScreen static evidence; runtime BLOCKED without device.

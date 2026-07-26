# DIBAY Local Runtime Cutover — P0 Recovery Lock

**Date:** 2026-07-27  
**Status:** PRODUCT PATH RESTORED (recovery commits on `main`)

## Failure

Commits `4c09b10b6` → `0694357c4` → `7d3b44914` made a **silhouette** `LocalRuntimeApp` (placeholder Header / empty body / temporary BottomNav, text `Local Runtime ready · sign in when online`) the **default Cap product Runtime**.

This is **not** Option A. Option A requires the real application client (ConditionalAppShell + routes + domains) bundled locally. Scaffold cutover = **PRODUCT UI REGRESSION P0**.

## Recovery

- **No** history rewrite / force push
- Reverted (newest → oldest):
  1. `7d3b44914`
  2. `0694357c4`
  3. `4c09b10b6`
- Experiment tip preserved: branch `archive/startup-local-runtime-experiment-7d3b44914`
- Scaffolding at `8b414490e` may remain in tree but **must stay off by default**

## Product contract after recovery

| Flag | Value |
|------|--------|
| `localRuntime` | `false` |
| `legacyRemoteRuntime` | `true` |
| Cap `server.url` | remote Next origin (e.g. `https://samarket.vercel.app`) |
| `DIBAY_LOCAL_RUNTIME` unset | **must not** enable Local Runtime |

Default path: Native → real Remote Next → ConditionalAppShell → Community / Trade / Food / Chat / My.

**Forbidden on default path:** `Local Runtime ready`, fixed Guest scaffold, temporary BottomNav, empty fake AppShell.

## Follow-up (not this P0)

Do **not** promote Local Runtime again until the **full** app client is local-bundled. Prefer: native first frame, remote first paint, bootstrap trim — without replacing the product Runtime with a silhouette.

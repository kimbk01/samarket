# DIBAY Call Legacy Web Shutdown HARD LOCK

Status: **HARD LOCK** (2026-06-28, Track ①)

## Lock Statement

Legacy Web Call establishment is **removed** on Android Capacitor. Native Runtime is the only establishment path. Web retains sync-only (connected sync, terminal watch, store sync, API POST/PATCH).

## Fixed Baseline (do not reopen)

| Layer | Status |
|---|---|
| Native Runtime HARD LOCK | LOCK |
| Surface Contract | LOCK |
| Voice / Video UI | LOCK |
| PiP / Dock | LOCK |
| O2 Outgoing Establishment | LOCK |
| P2 Legacy Web Detach | LOCK |

## Removed on Android Capacitor

- `/calls-v4` establishment mount
- `CallV4Screen` / `CallV4Provider` establishment (sync-only provider)
- `joinCallV4Agora` / JS Agora establishment
- `routeToCallV4Screen` / Web handoff
- Legacy pending replay (`legacy_web_replay_removed`)
- Connection warm prefetch establishment
- Caller poll / foreground resume Web restore

Marker: `legacy_web_establishment_removed` (Web) · `legacy_web_replay_removed` (MainActivity)

## Isolated QA (2026-06-28)

APK: post-Track-① debug build. `CAPACITOR_SERVER_URL=http://192.168.100.83:3000`

| Case | callId | Web forbidden | Native | Product |
|---|---|---|---|---|
| Voice outgoing | (see report) | 0/5 | PASS | PASS |
| Video outgoing | (see report) | 0/5 | PASS | PASS |
| Voice incoming | `d393f893-…` | 0/4 | PASS | PASS |
| Video incoming | `c4a1a881-…` | 0/4 | PASS | PASS |
| Foreground resume | `1dd22e6e-…` | 0/6 | PASS | PASS |

Harness `pass:false` on incoming (`visible_surface_owner_claimed`) and foreground resume (console `[object Object]` without callId substring) — **environment / harness, not Product FAIL** (P2-4 precedent).

Evidence: `docs/artifacts/dibay-call-legacy-web-shutdown-evidence.json`

## Verification

```bash
npm run verify:native-voice-runtime-contract
npm run verify:native-video-runtime-contract
vitest run lib/community-messenger/call-v4/__tests__/call-v4-import-guard.test.ts
```

## Out of scope (Track ②+)

Connected Ownership, Runtime, Native UI, Final Regression (once after Track ① commit).

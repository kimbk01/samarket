# DIBAY Call Native Runtime — Android COMPLETE HARD LOCK

Status: **HARD LOCK** (2026-06-28)

## Lock Statement

**Native Call Runtime Android COMPLETE HARD LOCK.** Voice and Video calls establish, connect, present UI, PiP, Dock, and end cleanup through **Native Runtime only**. WebView / CallV4Screen / JS Agora are not establishment requirements. Final Regression PASS (sequential gates + FCM-ready precondition) is the umbrella proof for this lock.

SSOT: `docs/dibay-call-native-runtime-ssot.md` · Cursor rule: `.cursor/rules/dibay-call-native-runtime-ssot.mdc`

## Final Regression Gates (all PASS required)

| Gate | Scope |
|---|---|
| `voiceOutgoing` | Native voice dialing surface, forbidden 0 |
| `voiceIncoming` | FCM-ready precondition → accept → connected chain |
| `videoOutgoing` | Native video dialing surface |
| `videoIncoming` | B accept → connected chain |
| `pip` | PiP enter + restore |
| `dock` | Dock show / resume |
| `endCleanup` | O4 tail chain |
| `forbiddenZero` | Web establishment markers 0 |
| `callV4ScreenZero` | CallV4Screen 0 |
| `singleNativeSurface` | Rollup of gates 1–4 |

Harness: `.qa-logs/native-call-final-regression.mjs`  
Report: `.qa-logs/native-call-final-regression/report.json`  
Machine-readable: `docs/artifacts/dibay-call-native-runtime-hard-lock-evidence.json`

## Locked CallIds (Final Regression PASS — 2026-06-28)

| Gate | callId | waitConnected (B) |
|---|---|---|
| voiceOutgoing | `d8046ddf-7e65-45f1-a7aa-ac955f82d753` | — |
| voiceIncoming | `03a1b0b1-c06a-4968-a8e4-71a51d84ec7a` | 2002 ms |
| videoOutgoing | `d3f9bc67-d43c-46a6-b993-ab201eb83798` | — |
| videoIncoming | `3b693a5f-4ff6-4812-b4aa-ea2230c225d3` | 2208 ms |
| pip / dock / endCleanup | `abf2f26f-d75a-4522-873c-9b1c892d9e08` | A+B connected |

Gate 2 FCM-ready precondition: `voiceIncomingFcmReady` PASS in 2110 ms (`hasSuccess: true`, `hasTimeout: false`).

## Required Runtime Path

```text
FCM → Native Runtime → Accept → Native Token → Native Agora SDK → Connected → End → Cleanup
```

Incoming accept chain (B, per locked voice/video incoming callIds):  
`accept_tapped` → `accept_patch_*` → `token_fetch_*` → `agora_native_join_*` → `state_connected` + `native_connected_emit` (each ≥ 1).

## Forbidden Web Establishment Markers (0 across all locked callIds)

- `route_to_screen`
- `CallV4Screen`
- `screen_mounted`
- `agora_join_success` (JS; native `agora_native_join_success` allowed)
- `visible_surface_owner_claimed` (forbidden rollup in final regression)

## Sub-Track HARD LOCKs (do not reopen without approval)

| Track | Document |
|---|---|
| O2 Outgoing | `docs/dibay-call-o2-outgoing-hard-lock.md` |
| O3 Connected | `docs/dibay-call-o3-connected-ownership-hard-lock.md` |
| O4 End / Cleanup | `docs/dibay-call-o4-end-ownership-hard-lock.md` |
| Legacy Web Shutdown (Track ①) | `docs/dibay-call-legacy-web-shutdown-lock.md` |
| Track ③ Dead Code Cleanup | `docs/dibay-call-track3-dead-code-cleanup-lock.md` |
| Voice UI | `docs/dibay-call-voice-ui-hard-lock.md` |
| Video UI | `docs/dibay-call-video-ui-hard-lock.md` |
| Video PiP | (lifecycle LOCK 2026-06-27 — `docs/dibay-call-native-video-runtime-qa.md`) |
| Video Dock | `docs/dibay-call-video-dock-hard-lock.md` |

## Deploy Baseline at Lock

| Item | Value |
|---|---|
| Guard completion commit | `8b81b44dd891f7c30a7b2734151f8240b818c2eb` |
| LOCK bundle commit | `99659d4e0b79549b6465b0885bbb10b53345e2ef` |
| Branch | `main` |
| Vercel | `https://samarket.vercel.app` |
| Devices | A=`8b37179f7d94` B=`RRGL4046NTW` |
| Room | `b19e2672-f26f-4a2e-8125-52575da4a62a` |
| APK | `android/app/build/outputs/apk/debug/app-debug.apk` rebuilt from Guard commit + A/B reinstall (2026-06-28) |

Final Regression PASS evidence predates Guard commit; runtime proof callIds unchanged. Deploy baseline for production alignment is **Guard commit APK**, not dirty-tree build.

## Harness QA Policy

| Outcome | Classification |
|---|---|
| `overallPass: true` | Runtime HARD LOCK evidence |
| `harness_fcm_ready_fail` | **QA environment FAIL** — not product Runtime FAIL |
| `productRuntimeFail: true` | Product regression — requires audit before reopening LOCK |

Harness-only changes (`.qa-logs/native-call-final-regression.mjs`): gate settle, telemetry, FCM-ready precondition — do not modify product scoring without red-team approval.

## Verification

```bash
node .qa-logs/native-call-final-regression.mjs   # once per unlock approval only
npm run verify:native-voice-runtime-contract
npm run verify:native-video-runtime-contract
npm run verify:call-v4-incoming-fsi-fallback-boundary
```

## Forbidden After Lock

Without explicit red-team approval:

- Reopen O2 / O3 / O4 / Guard / Voice UI / Video UI / PiP / Dock sub-tracks under “final regression” excuse
- Restore CallV4Screen / JS Agora / `/calls-v4` as establishment path
- Import `call-v4*` into Native Runtime
- Change Final Regression scoring to hide product regressions
- Repeat full device matrix without new evidence

## Legacy Web Call — Removed on Android (Track ① + Track ③)

**Status: REMOVED on Android Capacitor** (establishment). Desktop Web establishment retained.

| Track | Action | Status |
|---|---|---|
| Track ① | Android establishment shutdown — sync-only provider, `legacy_web_establishment_removed` | **LOCK** |
| Track ③ | Dead file physical delete — P2-3 guard, orphan barrels, unused verify | **LOCK** |
| Track ④ | Final Regression once post-commit → full project HARD LOCK end | **Next** |

Android removed: `/calls-v4` establishment mount, JS Agora establishment, Web handoff, P2-3 UI guard, foreground resume Web restore.

Desktop preserved: `CallV4Screen`, JS Agora, presentation stack, `/calls-v4` route.

Docs: `docs/dibay-call-legacy-web-shutdown-lock.md` · `docs/dibay-call-track3-dead-code-cleanup-lock.md` · evidence in `docs/artifacts/dibay-call-track3-dead-code-cleanup-evidence.json`

**Do not restore Android Legacy Web establishment without explicit red-team approval.**

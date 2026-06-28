# DIBAY Call O2 Outgoing Ownership HARD LOCK

Status: **HARD LOCK** (2026-06-28, post-P2-4 regression)

## Lock Statement

O2 Outgoing Ownership HARD LOCK. Voice/Video outgoing establishment ownership is Native Runtime only. Web CallV4Screen/JS Agora establishment markers are 0 for the locked callIds. O3/Connected/UI/End/Cleanup remain out of scope and require separate approval.

## Fixed Baseline (do not reopen)

| Layer | Status |
|---|---|
| Surface Contract | LOCK |
| P2-4 Legacy Web Detach (`23b9e30c`) | LOCK |

O2 lock refresh did **not** modify Runtime, MainActivity, Activity/UI, Connected, End, or Cleanup.

## Scope

| In scope (LOCKED) | Out of scope (separate approval) |
|---|---|
| Outgoing session create (Web POST allowed) | O3 Connected ownership |
| `native_outgoing_handoff` → Native token → Native Agora join | End / Cleanup ownership |
| Voice + Video outgoing establishment on Android | Native UI / PiP / Dock |
| Web establishment quarantine (`route_to_screen`, JS Agora join = 0) | Legacy deletion |
| | CallV4Screen restore |

## Locked CallIds (post-P2-4 Runtime QA Evidence)

APK baseline: `c1231b44` (includes P2-4 `23b9e30c`). Harness: `CAPACITOR_SERVER_URL=http://192.168.100.83:3000`.

| Media | callId | Evidence |
|---|---|---|
| Voice outgoing | `6208ee54-3767-4d21-ba41-89c3f5f63376` | `.qa-logs/native-call-voice-outgoing-isolated/logcat-filtered-6208ee54-3767-4d21-ba41-89c3f5f63376.txt` |
| Video outgoing | `53f96693-8e1b-4c60-b437-b8df7ca6c5c2` | `.qa-logs/native-call-video-outgoing-isolated/logcat-filtered-53f96693-8e1b-4c60-b437-b8df7ca6c5c2.txt` |

Reports: `.qa-logs/native-call-voice-outgoing-isolated/report.json`, `.qa-logs/native-call-video-outgoing-isolated/report.json`

Machine-readable bundle: `docs/artifacts/dibay-call-o2-outgoing-hard-lock-evidence.json`

Prior evidence (2026-06-27, pre-P2-4 baseline) remains in `.qa-logs/o2-outgoing-runtime-proof/` for history only.

## Required PASS Chain (per locked callId)

Each locked outgoing run must include exactly once:

- `caller_outgoing_start`
- `token_fetch_done`
- `agora_native_join_success`
- `state_connected`

## Forbidden Web Establishment Markers (0 per locked callId)

- `route_to_screen`
- `outgoing_ringing`
- `CallV4Screen` mount
- `agora_join_start` (JS)
- `agora_join_success` (JS)
- Web establishment fallback (`joinCallV4Agora`, caller poll establishment)

## Code Touch Boundary

O2 outgoing establishment Java/TS handoff only (already landed via prior O2 + P2-2).

Do not modify Surface Contract, P2-4 MainActivity detach, NativeVideoCallActivity, Notification/Surface UI, Connected/End/Cleanup, PiP/Dock, or restore Web CallV4Screen/JS Agora without explicit red-team approval.

## Verification

```bash
npm run verify:native-voice-runtime-contract
npm run verify:native-video-runtime-contract
```

Isolated outgoing regression (device QA):

```bash
CAPACITOR_SERVER_URL=http://192.168.100.83:3000 node .qa-logs/native-call-voice-outgoing-isolated.mjs
CAPACITOR_SERVER_URL=http://192.168.100.83:3000 node .qa-logs/native-call-voice-outgoing-isolated.mjs --video
```

Logcat filter:

```bash
adb logcat -s DIBAY_NATIVE_VOICE DIBAY_NATIVE_VIDEO DIBAY_CALL_V4 Capacitor/Console
```

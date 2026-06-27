# DIBAY Call O2 Outgoing Ownership HARD LOCK

Status: **HARD LOCK** (2026-06-27)

## Lock Statement

O2 Outgoing Ownership HARD LOCK. Voice/Video outgoing establishment ownership is Native Runtime only. Web CallV4Screen/JS Agora establishment markers are 0 for the locked callIds. O3/Connected/UI/End/Cleanup remain out of scope and require separate approval.

## Scope

| In scope (LOCKED) | Out of scope (separate approval) |
|---|---|
| Outgoing session create (Web POST allowed) | O3 |
| `native_outgoing_handoff` → Native token → Native Agora join | Connected / End / Cleanup changes |
| Voice + Video outgoing establishment on Android | UI / Activity / PiP / Dock |
| Web establishment quarantine (`route_to_screen`, JS Agora join = 0) | CallV4Screen restore |

## Locked CallIds (Runtime QA Evidence)

| Media | callId | APK commit | Evidence |
|---|---|---|---|
| Voice outgoing | `9dfc4910-eacc-45cc-83c4-5bc2bbabe1b4` | `38ec2bea` (O2 establishment) | `.qa-logs/o2-outgoing-runtime-proof/logcat-o2-voice-42c216d9-93b7-4254-85ad-70355f6bfc12.txt` |
| Video outgoing | `93714824-f375-4dce-947b-8afa11c25156` | `206f1141` (headless preview join fix) | `.qa-logs/o2-outgoing-runtime-proof/logcat-o2-video-headless-fix-93714824-f375-4dce-947b-8afa11c25156.txt` |

Machine-readable bundle: `docs/artifacts/dibay-call-o2-outgoing-hard-lock-evidence.json`

## Required PASS Chain (per locked callId)

Each locked outgoing run must include exactly once:

- `caller_outgoing_start`
- `token_fetch_done`
- `agora_native_join_success`
- `state_connected`

## Forbidden Web Establishment Markers (0 per locked callId)

- `route_to_screen`
- `outgoing_ringing`
- `screen_mounted`
- `caller_poll_start`
- `agora_join_success`

## Code Touch Boundary

O2 outgoing establishment Java/TS handoff only. Video `-17` fix is isolated to:

- `android/app/src/main/java/com/dibay/app/nativevideo/NativeVideoCallAgoraEngine.java` (`206f1141`)

Do not modify NativeVideoCallActivity, Notification/Surface, Runtime/API/Web handoff, Connected/End/Cleanup, PiP/Dock, or restore Web CallV4Screen/JS Agora without explicit red-team approval.

## Verification

```bash
npm run verify:native-voice-runtime-contract
npm run verify:native-video-runtime-contract
```

Logcat filter for outgoing regression:

```bash
adb logcat -s DIBAY_NATIVE_VOICE DIBAY_NATIVE_VIDEO DIBAY_CALL_V4 Capacitor/Console
```

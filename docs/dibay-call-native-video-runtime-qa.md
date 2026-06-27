# DIBAY Call Native Video Runtime QA

Status: Android Native Video lifecycle QA LOCK (scoped). Android first. PiP, Dock, group calls, iOS, and Windows remain out of scope.

## Logcat Filter

```bash
adb logcat -s DIBAY_NATIVE_VIDEO DIBAY_FCM DIBAY_INCOMING_CALL
```

For regression investigation only:

```bash
adb logcat -s DIBAY_NATIVE_VIDEO DIBAY_CALL_V4 DIBAY_FCM DIBAY_INCOMING_CALL DIBAY_PUSH_ROUTE Capacitor/Console
```

## Required Success Markers

Each successful accept-to-connected run must include:

- `incoming_fcm_received`
- `owner_claimed_native_video`
- `legacy_web_handoff_blocked`
- `incoming_activity_shown`
- `accept_tapped`
- `accept_patch_start`
- `accept_patch_done`
- `token_fetch_start`
- `token_fetch_done`
- `agora_native_video_join_start`
- `agora_native_video_join_success`
- `local_camera_publish_success`
- `remote_video_rendered`
- `state_connected`

Connected end must include:

- `end_tapped`
- `end_patch_start`
- `end_patch_done`
- `agora_native_disconnected`
- `cleanup_done`
- `owner_released`

Orientation hold must include:

- `video_activity_config_changed` (no Agora rejoin during rotation)

## Failure Markers

Any of the following is FAIL in a native video lifecycle run:

- `native_handoff target=main_activity`
- `web_call_v4_native_accept_received` before `state_connected`
- JS `token_fetch_start` before `state_connected`
- `call-v4-agora` join before `state_connected`
- `/community-messenger/calls-v4/` route opened as a condition for connection
- two incoming/call UIs for the same callId
- FGS still running after `owner_released`
- `NativeVideoCallActivity` still top-resumed after cleanup hold

## Lifecycle Fast QA (Voice LOCK parity)

Run on two real Android devices (A=caller, B=callee). One step per run; stop at first FAIL.

| Step | Scenario | PASS criteria |
|------|----------|---------------|
| 1 | Connected hold 45s | `state_connected` + `remote_video_rendered`; no premature `cleanup_done` / `owner_released` |
| 2 | Background HOME 30s | FGS kept; no terminal markers |
| 3 | Lock 35s | FGS kept; incoming UI reachable |
| 4 | Sleep screen-off 35s | FGS kept |
| 5 | Orientation | `video_activity_config_changed`; no Agora rejoin |
| 6 | End | full end chain + FGS stopped |
| 7 | Cleanup hold 30s | FGS off; no call UI; no rejoin; `topResumedActivity` not video activity |
| 8 | Redial | new callId; incoming + accept + connected after prior cleanup |
| 9 | Duplicate FCM | same callId HTTP v1 reinject (not a new dial) |

Duplicate FCM contract (same callId replay):

```text
incoming_fcm_received count=2
owner_claimed_native_video count=1
duplicate_runtime_blocked count=1
incoming_activity_shown count=1
```

## Android Video Lifecycle LOCK QA Result

Date: 2026-06-27

Flag state:

- Source default: `nativeVideoRuntime=true` in `dibay-call-lane.json`
- Device QA APK SHA256: `550ab16d79540e81c3b12eee067e97dc5225123dfd886893874033fecb5c43c4`

Devices:

- Caller: `8b37179f7d94` (aaaa)
- Callee: `RRGL4046NTW` (qqqq)
- Room: `b19e2672-f26f-4a2e-8125-52575da4a62a`

Passed lifecycle steps:

| Step | Result | Representative callId |
|------|--------|------------------------|
| 1 Connected | PASS | (lifecycle series) |
| 2 Background | PASS | |
| 3 Lock | PASS | |
| 4 Sleep | PASS | |
| 5 Orientation | PASS (product fix) | `c448dc80-…` |
| 6 End | PASS (product fix) | `a3c5c2a6-1087-4d8c-86ae-8d5466045b1c` |
| 7 Cleanup | PASS | `349c6148-5d17-489c-9109-ece5f0d68c65` |
| 8 Redial | PASS | `eb7f8d99-f9e5-463a-94f9-8dd078338191` |
| 9 Duplicate FCM | PASS | `4091eea9-cee7-4e24-87b1-17bb2dc3b498` |

Product fixes included in this LOCK (lifecycle only):

1. **Orientation** — `NativeVideoCallActivity` `configChanges` + `onConfigurationChanged` / `video_activity_config_changed` (no Agora rejoin).
2. **End with active remote video** — Agora teardown on main thread after clearing video surfaces (avoids patch-callback-thread deadlock).

Forbidden markers not observed across lifecycle QA:

- `native_handoff target=main_activity`
- `web_call_v4_native_accept_received`
- `/community-messenger/calls-v4/` as connection prerequisite
- duplicate owner claim on new callId after cleanup

LOCK conclusion: Android Native Video passes the scoped real-device lifecycle QA gates for connected hold, background/lock/sleep, orientation, end, cleanup, redial, and duplicate FCM. Do not expand this result to PiP, Dock, group calls, iOS, Windows, or Accept/Incoming surface changes without explicit reopen.

## Contract Verify

```bash
npm run verify:native-video-runtime-contract
```

## Out of Scope (explicit)

- PiP / Self PIP / Android OS PiP
- Call Dock
- Accept/Incoming UI redesign (CLOSED for this LOCK)
- Web/V4 handoff removal (quarantine remains until separate approval)

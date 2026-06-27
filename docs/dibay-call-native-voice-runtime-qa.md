# DIBAY Call Native Voice Runtime QA

Status: Android Native Voice MVP LOCK possible. Android first. iOS and Windows are contract-only until Android ships.

## Logcat Filter

```bash
adb logcat -s DIBAY_NATIVE_VOICE DIBAY_FCM DIBAY_INCOMING_CALL
```

For regression investigation only:

```bash
adb logcat -s DIBAY_NATIVE_VOICE DIBAY_CALL_V4 DIBAY_FCM DIBAY_INCOMING_CALL DIBAY_PUSH_ROUTE Capacitor/Console
```

## Required Success Markers

Each successful accept-to-end run must include:

- `native_voice_flag_enabled`
- `incoming_fcm_received`
- `owner_claimed_native_voice`
- `incoming_activity_shown`
- `accept_tapped`
- `accept_patch_start`
- `accept_patch_done`
- `token_fetch_start`
- `token_fetch_done`
- `agora_native_join_start`
- `agora_native_join_success`
- `state_connected`
- `audio_route_applied`
- `end_tapped`
- `end_patch_done`
- `cleanup_done`
- `owner_released`

Lock/sleep runs must also include:

- `lock_screen_visible`

Web sync is optional and only allowed after native connected:

- `web_sync_connected`

## Failure Markers

Any of the following is FAIL in a native voice run:

- `native_handoff target=main_activity`
- `lock_accept_hydration_cold`
- `main_activity_calls_v4_cold_legacy_start`
- `web_call_v4_native_accept_received` before `state_connected`
- JS `token_fetch_start` before `state_connected`
- `call-v4-agora` join before `state_connected`
- no incoming/call UI
- two incoming/call UIs
- Calls list shown after accept
- `/community-messenger/calls-v4/` route opened as a condition for connection
- forced keyguard dismiss before accept

## Required Scenarios

Run on two real Android devices.

### Receive / Accept

- app foreground
- app background
- app cold killed by `am kill`
- lock screen
- sleep / screen off
- AOD ON

### Terminal Actions

- accept
- reject
- missed timeout
- connected then end
- remote ended
- next call after cleanup

## PASS Criteria

All required scenarios pass only if:

- exactly one visible UI is shown
- lock accept works without unlocking
- accept does not navigate to Calls list or `/calls-v4`
- native token fetch starts and completes
- Agora Android SDK join starts and succeeds
- `state_connected` is reached
- real audio send/receive is verified
- end produces `cleanup_done` and `owner_released`
- the next call starts normally

## Android MVP LOCK QA Result

Date: 2026-06-27

Flag state:

- Source default: `nativeVoiceRuntime=false`
- Device QA APK: `nativeVoiceRuntime=true`

Devices:

- Caller: `8b37179f7d94`
- Callee: `RRGL4046NTW`

Passed scenarios:

- foreground incoming UI display
- background incoming UI display
- lock incoming UI display without forced unlock
- sleep/screen-off incoming UI display
- cold `am kill` incoming UI display
- accept to native token fetch
- native Agora Android SDK join to `state_connected`
- connected end to `end_patch_done`, `cleanup_done`, and `owner_released`
- reject terminal path
- missed timeout terminal path
- duplicate FCM same-callId replay
- redial after cleanup with a new callId

Duplicate FCM contract evidence:

```text
incoming_fcm_received count=2
owner_claimed_native_voice count=1
duplicate_runtime_blocked count=1
incoming_activity_shown count=1
ring_start count=1
```

Forbidden markers not observed:

- `Background activity launch blocked`
- `native_handoff target=main_activity`
- `lock_accept_hydration_cold`
- `web_call_v4_native_accept_received`
- `/community-messenger/calls-v4/` route as a condition for connection

LOCK conclusion: Android Native Voice MVP passes the scoped real-device QA gates for voice receive, accept, native join, terminal actions, duplicate FCM, and redial. Do not expand this result to video, PiP, Dock, group calls, iOS, Windows, or Telecom self-managed.

## Android QA Command Template

```bash
P4_DEVICE_B=<callee> P4_DEVICE_A=<caller> VARIANT=both \
  node .qa-logs/v4-native-voice-runtime-audit.mjs
```

The audit script must fail if any failure marker appears after `owner_claimed_native_voice`.

## iOS Contract

iOS implementation is not part of Android MVP. Future implementation must use:

- VoIP Push
- CallKit
- same server state machine
- same runtime states
- same required log semantics

## Windows Contract

Windows is Web/PWA unless a desktop native shell is created. It must share:

- call state machine
- server APIs
- token API
- logging vocabulary

It is not expected to provide Android/iOS-level system call UX in this phase.

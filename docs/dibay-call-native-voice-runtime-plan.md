# DIBAY Call Native Voice Runtime Plan

Status: Android Native Voice MVP LOCK possible. Android voice receive MVP passed real-device QA on 2026-06-27. Do not use this document to expand scope into video, PiP, Dock, group calls, or Telecom self-managed.

## Why We Are Changing Direction

The current product call path is V4 lane, but V4 is not a native call engine. It is a hybrid lane:

- Android native owns FCM receive, lock incoming UI, accept/reject actions, native PATCH, and MainActivity handoff.
- Web owns `/community-messenger/calls-v4/{callId}`, token fetch, Agora JS join, connected UI, and most call lifecycle rendering.

Seven days of QA narrowed the real fail to the seam after native accept:

```text
native accept/PATCH PASS
MainActivity/WebView handoff/bootstrap/token/Agora FAIL or delayed
```

Native receive and accept mostly pass. The repeating failures come from making WebView bootstrap a condition for the call to become connected. The Native Voice Runtime removes that condition.

## Current V4 Hybrid Problem

The following are product risks in the current V4 hybrid:

- App foreground/background/cold/lock/sleep need different WebView handoff paths.
- MainActivity route delivery is required before token fetch can start.
- Connected-before-WebView is impossible because Agora join is in JS.
- Native incoming/connecting surfaces can overlap with Web CallV4 screen ownership.
- Pending route replay, warm/cold hydration, route injection, and watchdog code add more states than the call itself.
- Fixing one lock path tends to regress another app-state path.

## WebView Bootstrap Dependency Points

These points must be isolated from the new lane:

- `lock_accept_hydration*`
- `native_handoff target=main_activity`
- MainActivity WebView accept route bootstrap
- pending route replay / persisted call route
- WebView cold/warm hydration
- connected-before-Web CallV4Screen dependency
- `call-v4-agora.ts` JS Agora join
- V4 native incoming owner bridge for Web sheet suppression
- V3 replay fallback into `/community-messenger/calls/{id}`

## Native Voice Runtime Goal

For Android voice incoming calls:

```text
FCM incoming_call
→ NativeVoiceCallRuntime
→ NativeVoiceCallActivity
→ accept PATCH
→ native token fetch
→ Agora Android SDK join
→ state_connected
→ end/cleanup
```

The call must not require:

- MainActivity
- WebView ready state
- `/calls-v4/{callId}?action=accept`
- JS token fetch
- JS Agora join

Web sync is allowed only after native connected and must never be a condition for call establishment.

## Reuse, Isolate, Delete Later

### Reuse

- Call session DB and server state machine
- accept/reject/end/missed/heartbeat/token APIs
- outgoing call creation and room/friend/permission checks
- notification and missed-call records
- existing Web V4 fallback lane
- existing iOS CallKit/VoIP skeleton as future reference only

### Isolate

- V4 Web accept hydration
- MainActivity V4 accept route handoff
- pending route replay
- Web CallV4 connected-before-native logic
- JS Agora audio join
- duplicate incoming owner bridge

### Delete Only After Android Native PASS

- lock accept hydration
- MainActivity call handoff
- pending route replay
- WebView accept bootstrap
- connected-before-Web CallV4Screen for voice
- JS Agora voice join path
- duplicate incoming owner bridge
- V4 FSI-only lock policy for voice

## Platform Scope

### Android

Phase 1 and Phase 2 implementation target. Native Voice Runtime MVP must pass on real devices before any deletion.

### iOS

Same contract later, based on VoIP Push + CallKit. Implementation starts only after Android PASS.

### Windows

Windows remains Web/PWA for now. It can share state machine, APIs, and log contract, but system-level call UX requires a separate desktop native shell project.

## Duplicate Runtime Rule

Only one runtime may own a callId.

- `nativeVoiceRuntime=true && mediaType=voice`: Native Voice Runtime owns the call.
- Web V4 fallback may own only when native voice runtime is disabled or the call is not voice.
- If Web V4 and Native Voice Runtime try to own the same callId, log `[DIBAY_NATIVE_VOICE] duplicate_runtime_blocked` and block the later owner.

## PASS Criteria

For foreground, background, cold, lock, sleep/screen-off, and AOD:

- exactly one visible incoming/call UI
- accept without unlocking
- no Calls list or `/calls-v4` route navigation after accept
- native `token_fetch_start` and `token_fetch_done`
- native `agora_native_join_start` and `agora_native_join_success`
- `state_connected`
- real audio send/receive
- end produces `cleanup_done` and `owner_released`
- next call works

## Android MVP LOCK Evidence

Real-device QA on 2026-06-27 passed the Android Native Voice MVP while keeping `nativeVoiceRuntime` default `false` in source and using a flag-on QA APK for device runs.

Confirmed PASS:

- foreground, background, lock, sleep, and cold incoming UI display
- accept without unlocking on lock/sleep
- native accept, native token fetch, native Agora Android SDK join, and `state_connected`
- end, reject, missed timeout, duplicate FCM, and redial
- `cleanup_done` and `owner_released` after terminal actions
- no `Background activity launch blocked`
- no `native_handoff target=main_activity`
- no `/community-messenger/calls-v4/` route as a condition for connection

Representative QA callIds:

- foreground connected/end: `3842ed0e-f494-4771-8551-aa521eedf06a`
- background connected/end: `12623d94-8d20-4908-9c0b-7c55c646d79b`
- lock connected/end: `52ed48d3-2e54-4357-914f-ccb4c552fa99`
- sleep connected/end: `63fa51ae-6adb-40ca-a9cf-bcf5d7bd5b29`
- cold connected/end: `6d9f8378-341c-4c12-8cf8-112197050d99`
- duplicate FCM same-payload replay: `91c355ab-36d1-4e40-84a4-d0f5756fb088`
- redial first/second: `0ee818d9-23c5-44d7-8efd-d3eaa7b87d15` / `2d1ac871-aa56-49df-a46f-7e6e202a2f87`

Android Native Voice MVP is therefore LOCK possible for the scoped Android voice receive path. iOS, Windows, video, PiP, Dock, group calls, and Telecom self-managed remain out of scope.

## FAIL Criteria

Any of these in Native Voice Runtime lane is FAIL:

- no UI
- two incoming/call UIs
- `native_handoff target=main_activity`
- `lock_accept_hydration_cold`
- `main_activity_calls_v4_cold_legacy_start`
- connected-before-native Web `web_call_v4_native_accept_received`
- JS `token_fetch_start` before native connected
- `call-v4-agora` join before native connected

## Required Logs

All native voice logs use `[DIBAY_NATIVE_VOICE]`.

Required markers:

- `native_voice_flag_enabled`
- `incoming_fcm_received`
- `owner_claimed_native_voice`
- `incoming_activity_shown`
- `lock_screen_visible`
- `accept_tapped`
- `accept_patch_start`
- `accept_patch_done`
- `token_fetch_start`
- `token_fetch_done`
- `agora_native_join_start`
- `agora_native_join_success`
- `state_connected`
- `audio_route_applied`
- `speaker_toggle`
- `end_tapped`
- `end_patch_done`
- `cleanup_done`
- `owner_released`
- `web_sync_connected`
- `legacy_web_handoff_blocked`
- `duplicate_runtime_blocked`
- `error_terminal`

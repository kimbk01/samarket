# DIBAY Call Native Voice Runtime Migration Map

Status: Android Native Voice MVP LOCK possible. Append-only until deletion phase is explicitly approved.

## Existing Runtime Areas

### Android Native Receive / Action

- `android/app/src/main/java/com/dibay/app/DibayFirebaseMessagingService.java`
- `android/app/src/main/java/com/dibay/app/IncomingCallPushDelivery.java`
- `android/app/src/main/java/com/dibay/app/IncomingCallBackgroundNotifier.java`
- `android/app/src/main/java/com/dibay/app/IncomingCallActivity.java`
- `android/app/src/main/java/com/dibay/app/IncomingCallActionCoordinator.java`
- `android/app/src/main/java/com/dibay/app/IncomingCallAcceptPatchHelper.java`
- `android/app/src/main/java/com/dibay/app/IncomingCallRejectPatchHelper.java`
- `android/app/src/main/java/com/dibay/app/IncomingCallTerminalHandler.java`
- `android/app/src/main/java/com/dibay/app/IncomingCallSessionCleanup.java`
- `android/app/src/main/java/com/dibay/app/call/CallForegroundService.java`
- `android/app/src/main/java/com/dibay/app/call/DibayActiveCallSessionManager.java`

### V4 Hybrid / Web Bootstrap

- `android/app/src/main/java/com/dibay/app/MainActivity.java`
- `android/app/src/main/java/com/dibay/app/callv4/CallV4Lane.java`
- `android/app/src/main/java/com/dibay/app/callv4/CallV4IntentHelper.java`
- `android/app/src/main/java/com/dibay/app/callv4/CallRuntimeV4.java`
- `components/community-messenger/call-v4/CallV4Provider.tsx`
- `components/community-messenger/call-v4/CallV4Screen.tsx`
- `components/community-messenger/call-v4/CallV4IncomingSheet.tsx`
- `lib/community-messenger/call-v4/call-v4-actions.ts`
- `lib/community-messenger/call-v4/call-v4-api.ts`
- `lib/community-messenger/call-v4/call-v4-agora.ts`
- `lib/community-messenger/call-v4/call-v4-agora-media.ts`
- `lib/community-messenger/call-v4/call-v4-native-accept-flight.ts`
- `lib/community-messenger/call-v4/call-v4-native-connecting-handoff.ts`
- `lib/community-messenger/call-v4/call-v4-incoming-surface.ts`
- `lib/community-messenger/call-v4/call-v4-telegram-incoming-surface.ts`

### Server / Shared Contracts To Preserve

- call session DB
- accept/reject/end/missed/heartbeat APIs
- token API
- outgoing call creation
- room/friend/permission checks
- notification and missed-call records
- Web V4 fallback lane
- video/PiP/Dock/group call code

## New Android Package

Approved package:

```text
android/app/src/main/java/com/dibay/app/nativevoice/
```

Files:

- `NativeVoiceCallRuntime.java`
- `NativeVoiceCallOwner.java`
- `NativeVoiceCallActivity.java`
- `NativeVoiceCallService.java`
- `NativeVoiceCallAgoraEngine.java`
- `NativeVoiceCallApi.java`
- `NativeVoiceCallBridge.java`
- `NativeVoiceCallLane.java`
- `NativeVoiceCallLog.java`

## Import Ban Rules

The `nativevoice/` package must not import or depend on:

- Web files
- `call-v4-agora`
- `CallV4Screen`
- `call-v4-native-accept-flight`
- `call-v4-native-connecting-handoff`
- MainActivity route accept bootstrap

Existing V4 fallback files must not start accept autostart for a callId already owned by Native Voice Runtime.

## Runtime Priority

Priority order for voice incoming calls:

1. `nativeVoiceRuntime=true` and `mediaType=voice`: Native Voice Runtime.
2. `v4TelegramLane=true`: existing V4 hybrid fallback.
3. legacy/V3 only when both are disabled or explicitly selected.

When Native Voice Runtime owns the call:

- log `owner_claimed_native_voice`
- block Web handoff with `legacy_web_handoff_blocked`
- block duplicate owner with `duplicate_runtime_blocked`
- do not open `/community-messenger/calls-v4/{callId}?action=accept`

## Phase Deletion Map

Android Native Voice MVP passed real-device QA on 2026-06-27. This unlocks planning for the deletion phase, but does not authorize deletion in the MVP commit. V4 fallback, server APIs, video/PiP/Dock/group code, and iOS skeleton remain preserved.

### Phase 1: No Deletion

- Add flag and owner lock.
- Add branch gates.
- Preserve all legacy and V4 code.

### Phase 2: Native MVP

- New native voice runtime code only.
- Existing V4 remains fallback.

### Phase 3: QA

- Mark dead code candidates only after real-device PASS.

### Phase 5: Delete Candidates

Delete or hard-isolate only after PASS:

- `lock_accept_hydration*`
- MainActivity V4 accept handoff
- pending route replay for voice accept
- connected-before-Web CallV4Screen for voice
- JS Agora voice join path
- duplicate incoming owner bridge for voice
- V4 FSI-only lock policy for voice

## Delete Ban

Do not delete:

- server API and DB
- outgoing call creation
- room/friend/permission checks
- Web V4 fallback lane
- video call code
- PiP/Dock/group call code
- iOS skeleton

## Verification

Add `verify:native-voice-runtime-contract` to ensure:

- nativevoice package has no banned imports
- native voice flag exists in Android lane asset
- voice+native runtime branch blocks MainActivity handoff
- QA logs do not contain banned markers for native voice runs

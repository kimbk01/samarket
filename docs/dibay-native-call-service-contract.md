# DIBAY NativeCallService contract

JS bridge: `lib/call/native/native-call-service.ts`  
Capacitor plugin id: **`NativeCallService`**

CallKit (iOS) and Android FGS are the **system** live-call SSOT on native.  
JS `activeCallSession` (`lib/call/active-call-session.ts`) is auxiliary UI + lock coordination.

## Methods (TS ↔ Android ↔ iOS)

| Method | TS export | Android (`NativeCallServicePlugin.java`) | iOS (`NativeCallServicePlugin.swift`) |
|--------|-----------|------------------------------------------|---------------------------------------|
| prepareAccept | `prepareNativeCallAccept` | `prepareAccept` → FGS prep | stub `{ ok: true }` |
| startCall | `startNativeCallService` | `startCall` → `CallForegroundService` | stub `{ ok: true }` |
| endCall | `endNativeCallService` | `endCall` → stop FGS | `endCall` → `CallKitProvider.reportCallEnded` |
| getActiveCallId | `readNativeActiveCallId` / **`getActiveCall`** alias | `getActiveCallId` → FGS map | `getActiveCallId` → CallKit in-memory map |
| heartbeat | `pingNativeCallHeartbeat` | `heartbeat` → FGS watchdog | stub `{ ok: true }` |

## Cold start recovery (JS)

1. `readNativeActiveCallId()` (or `getActiveCall()`)
2. `GET /api/community-messenger/calls/sessions/{callId}`
3. live (`ringing|active`) → `router.replace(/calls/{id}?source=native_resume)` + SSOT sync
4. terminal → `hardClearActiveCallSession`

Implemented in `CallActiveSessionRecoveryHost.tsx`.

## VoIP / FCM payload alignment

| Field | FCM incoming | VoIP PushKit |
|-------|--------------|--------------|
| session id | `callId` / `sessionId` | `sessionId` |
| kind | `callKind` voice/video | `hasVideo` bool |
| action | notification accept intent | CallKit answer → `dibay:voip-call-action` accept |

JS listener: `lib/push/native/dibay-voip-call-bridge.ts`  
Native emitter: `ios/App/App/Push/DibayPushTokenBridge.swift`

## iOS stub scope (P0)

- Full outgoing CallKit parity is **out of scope** (2nd phase).
- Stub ensures JS methods never crash; accept/end route through existing accept gateway + `hardClear`.

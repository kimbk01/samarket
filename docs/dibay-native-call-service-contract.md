# DIBAY NativeCallService contract

JS bridge: `lib/call/native/native-call-service.ts`  
Capacitor plugin id: **`NativeCallService`**

CallKit (iOS) and Android FGS + `DibayActiveCallSessionManager` are the **system** live-call SSOT on native.  
JS `activeCallSession` + `active-call-session-machine.ts` are auxiliary UI + cleanup reason coordination.

See also: `docs/community-messenger-active-call-lifecycle.md`

## Methods (TS ↔ Android ↔ iOS)

| Method | TS export | Android | iOS |
|--------|-----------|---------|-----|
| prepareAccept | `prepareNativeCallAccept` | FGS prep + screen receiver | Manager ACCEPTED + AVAudioSession |
| startCall | `startNativeCallService` | Manager CONNECTED + FGS | Manager CONNECTED + CallKit start |
| endCall | `endNativeCallService` | Manager cleanup guard + FGS stop | Manager cleanup guard + CallKit end |
| getActiveCallId | `readNativeActiveCallId` | Manager / FGS | Manager / CallKit map |
| heartbeat | `pingNativeCallHeartbeat` | FGS watchdog | Manager persist |
| reportAppState | `reportNativeCallAppState` | BACKGROUNDED / SCREEN_OFF / foreground | Same phases |
| getActiveCallSnapshot | `readNativeActiveCallSnapshot` | `{ callId, phase, mediaType, connected }` | Same |

## Cleanup reasons

Forbidden (native + JS reject): `activity_destroyed`, `webview_reload`, `notification_dismissed`, `screen_off`, `backgrounded`, `app_swipe`, `unknown`.

Allowed: `local_ended`, `remote_ended`, `heartbeat_timeout`, `media_failed_after_connected`, …

## Cold start recovery (JS)

1. `readNativeActiveCallId()` or `readNativeActiveCallSnapshot()`
2. `GET /api/community-messenger/calls/sessions/{callId}`
3. live (`ringing|active`) → route + SSOT sync; **no incoming UI**
4. terminal → `hardClearActiveCallSession("remote_ended")`

Implemented in `CallActiveSessionRecoveryHost.tsx`.

## Server heartbeat

Client: `patchCallSessionHeartbeat` every 10s with native ping.  
PATCH `action=heartbeat` on `active` sessions. Stale cleanup: `POST .../calls/sessions/stale-cleanup`.

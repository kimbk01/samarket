# Community Messenger — Active Call Lifecycle (P4)

Active Call Session SSOT: **native session manager owns lifecycle**; call UI is presenter only.

## SSOT layers

| Layer | Owner | Role |
|-------|--------|------|
| Machine contract | `lib/call/active-call-session-machine.ts` | Phases, transitions, allowed/forbidden cleanup |
| JS coordinator | `lib/call/active-call-session.ts` | UI phase mirror, `hardClear` with reason guard |
| Android | `DibayActiveCallSessionManager` + `CallForegroundService` | FGS keep-alive, PiP, screen-off |
| iOS | `DibayActiveCallSessionManager` + CallKit + AVAudioSession | Background audio, CallKit active |
| Server | `call-session-heartbeat.ts` | Peer heartbeat, stale `active` cleanup |

## Machine phases

`IDLE` → `ACCEPTED` → `JOINING_MEDIA` → `CONNECTED` → (`BACKGROUNDED` | `SCREEN_OFF_ACTIVE` | `PIP_ACTIVE` | `RECONNECTING`) → `LOCAL_ENDING` | `REMOTE_ENDED` → `CLEANED`

## Forbidden cleanup reasons

- `activity_destroyed`, `webview_reload`, `notification_dismissed`, `screen_off`, `backgrounded`, `unknown`, `app_swipe`

## Allowed cleanup reasons

- `local_ended`, `remote_ended`, `media_failed_after_connected`, `heartbeat_timeout`, `permission_revoked_after_accept`, …

## Android

- **FGS**: starts on CONNECTED; survives `onTaskRemoved`; notification dismiss does not end call (`setDeleteIntent(null)`).
- **PiP**: video call → `MainActivity.tryEnterVideoCallPip()` on home; failure keeps call.
- **Screen off**: `CallScreenStateReceiver` → `SCREEN_OFF_ACTIVE` (no Agora leave).

## iOS (P4 scope)

- **CallKit**: incoming + outgoing active; end only on local/remote allowed cleanup.
- **AVAudioSession**: `.playAndRecord` + `.voiceChat` / `.videoChat`; interruption resume; `audio` background mode.
- **PiP (P4)**: in-app minimize only (`use-call-video-pip-gesture.ts`).
- **Remote ended**: JS `reportRemoteEnded` → `DibayActiveCallSessionManager.onRemoteEnded`.

## P5 backlog (out of P4)

- iOS **system PiP**: `AVPictureInPictureController` + native video renderer + Agora WebView hook + bridge.
- Dynamic Island / Live Activity (CallKit-derived, no custom implementation).

## Voice + video background (P4)

- **Both** voice and video: `visibilitychange` → `BACKGROUNDED` / `REENTERING` + native `reportAppState`.
- **Video only**: `videoTrack.setEnabled(false)` on background (camera pause ≠ call ended).
- **Voice**: mic + audio route maintained via FGS (Android) / AVAudioSession (iOS).

## RECONNECTING

- Agora `connection-state-change` → machine `RECONNECTING` + PATCH heartbeat `reconnecting: true`.
- Recovery to `CONNECTED` → `reconnecting: false`. **No** call end during reconnect window.

## Server heartbeat

- PATCH `action=heartbeat` every 10s (native ping + server PATCH).
- **Accept seed**: both `caller_last_heartbeat_at` / `callee_last_heartbeat_at` set on transition to `active`.
- **One-sided stale (90s)**: after 30s post-`answered_at`, if **either** peer heartbeat is stale → `end` + hangup/FCM (TS cron API) or DB `ended` (pg_cron SQL fallback).
- **Cron**: `pg_cron` `*/2 * * * *` → `cleanup_stale_community_messenger_call_sessions()`; or `POST /api/.../stale-cleanup` with `CRON_SECRET` for full peer notify.

| Event | Voice | Video |
|-------|-------|-------|
| Screen off | Call + mic keep | Call + mic keep; camera pause OK |
| Background | Call keep | Call keep; PiP if available |
| App resume | Restore call screen | Restore + camera resume |
| Local end | PATCH end → peer remote ended | Same |
| Remote end | Cleanup once (idempotent) | Same |

## Remote / local ended

1. Local: user end → PATCH `end` → hangup signal + FCM → peer `hardClear("remote_ended")`.
2. Remote: Realtime session terminal + hangup INSERT → CallClient → `hardClear("remote_ended")`.
3. WebView reload: **no** PATCH end (forbidden cleanup).

## Device QA checklist

### Android (2 devices)

1. Voice connected → B screen off → call continues
2. Video connected → B screen off → call continues, camera may pause
3. A home during call → call continues (FGS / PiP)
4. B lock during call → call continues
5. A end → B ends immediately
6. B app swipe (FGS alive) → call continues
7. Network blip → RECONNECTING, not ended
8. Peer ended → re-entry cleanup only

### iOS (2 devices or iOS + Android)

1. Voice + lock → audio continues
2. Video + background → call continues
3. CallKit end → both sides terminal
4. Cross-platform remote ended
5. App resume → call screen restore

## Verification

```bash
npm run verify:active-call-lifecycle-contract
npx vitest run lib/call/__tests__/ lib/community-messenger/__tests__/call-session-heartbeat.test.ts
npx tsc --noEmit
```

Android unit: `./gradlew :app:testDebugUnitTest --tests com.dibay.app.call.DibayActiveCallSessionManagerTest`

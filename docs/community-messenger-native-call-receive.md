# Community Messenger Native Incoming Call

## Goal
Provide native lock-screen/background incoming call UX for DIBAY calls. Web call screens remain the in-app call surface; **foreground** receive uses `IncomingCallBanner` only. **Lock/background** receive uses Android system call notification actions (accept/decline).

## Web FCM bridge (foreground)

When the app is foreground and WebView is alive, `MainActivity` injects:

- `dibay:call-event` — `{ type: "incoming_call" | "call_canceled", sessionId, callKind?, ... }`
- `dibay:call-route` — pending path for accept deep link (`dibay_call_pending_route` in sessionStorage)

Handled by `lib/community-messenger/dibay-fcm-call-bridge.ts` → `GlobalCommunityMessengerIncomingCall`.

**DO NOT** mix `dibay_call_pending_route` with OAuth/chat `pending_route` keys.

## Layers
- Android FCM layer: `DibayFirebaseMessagingService` treats `type=incoming_call` separately from chat messages.
- Android native UI: `IncomingCallNotificationBuilder` posts CALL-category notification with **accept/decline action buttons** only (no default full-screen Activity).
- Android native action layer: `IncomingCallActionCoordinator` single-flights `accept`, `reject`, and `missed` by callId and routes accepted calls to `/community-messenger/calls/{callId}?action=accept`.
- Web layer: `GlobalCommunityMessengerIncomingCall` + `IncomingCallBanner` for **foreground in-app** receive only.
- iOS layer: `VoIPPushRegistry` + `CallKitProvider` skeleton. `DibayVoipCallPlugin` exposes registration and explicit CallKit end hooks to JS.

## UX policy

| State | UI |
|-------|-----|
| App foreground (unlocked) | `IncomingCallBanner` top-banner via web — **not** native full-screen Activity |
| Lock / screen off / app background | System call notification with **수락/거절** actions; **lock/screen-off** also posts full-screen intent bridge (`IncomingCallActivity` wake UI) |
| After accept (any entry) | `/community-messenger/calls/{callId}?action=accept` → connecting/call screen (skip bell UI) |

## DO NOT (regression guards)

1. **Do not** add `windowShowWhenLocked`, `showWhenLocked`, `turnScreenOn`, etc. to `styles.xml` or `AndroidManifest` — AppCompat linking fails. Use `IncomingCallActivity.applyWakeFlags()` only when Activity is explicitly launched (fallback).
2. **Do not** set notification `contentIntent` to `IncomingCallActivity` — content tap opens app (`MainActivity` launcher) for banner; accept uses broadcast action only. Full-screen intent to `IncomingCallActivity` is **lock/screen-off bridge only**.
3. **Do not** call `startActivity(IncomingCallActivity)` from FCM when app is **foreground+unlocked** (web banner). Lock/screen-off: notification + FSI; **FSI denied(API 34+)** 시에만 `incoming_activity_direct_launch` fallback.
4. **Do not** use React `IncomingCallBanner` as lock-screen UI — WebView is unavailable when app is background/killed.

## Payload
Android incoming FCM payload must include:

```ts
type IncomingCallFcmPayload = {
  type: "incoming_call";
  callId: string; // or sessionId/session_id
  roomId: string;
  callerId: string;
  callerName: string;
  callerAvatarUrl?: string;
  callType: "audio" | "video";
  expiresAt?: string;
};
```

Invalid payloads are logged as `[call-push] payload_invalid` and are not downgraded to a chat notification.

## Routes

- Incoming answer: `/community-messenger/calls/{callId}?action=accept`
- Missed call notification: `/community-messenger/rooms/{roomId}?focus=call-history&callId={callId}`
- Chat message notification: `/community-messenger/rooms/{roomId}`

These routes must not be mixed.

## Server State Machine

Native and web actions use the same server state machine via:

- `POST /api/community-messenger/calls/{id}/accept`
- `POST /api/community-messenger/calls/{id}/reject`
- `POST /api/community-messenger/calls/{id}/missed`
- `POST /api/community-messenger/calls/{id}/end`
- Existing compatibility: `PATCH /api/community-messenger/calls/sessions/{id}`

Rules:

- `ringing -> active` only for recipient accept.
- `ringing -> rejected` only for recipient reject.
- `ringing -> missed` only while still ringing.
- `active -> missed` is never allowed.
- Duplicate native actions are single-flighted by callId before reaching the server.
- **Reject must not trigger missed** — `COMPLETED_ACTIONS` blocks missed timeout after reject/accept.

## iOS Skeleton

Current files:

- `ios/App/App/Push/VoIPPushRegistry.swift`
- `ios/App/App/Push/CallKitProvider.swift`
- `ios/App/App/Push/DibayPushTokenBridge.swift`
- `ios/App/App/Plugins/DibayVoipCallPlugin.swift`

Production work still required:

- Apple VoIP services certificate/token auth setup.
- Server-side VoIP APNs sender for `incoming_call` and cancellation.
- CallKit answer/reject/end callbacks must POST accept/reject/end before or alongside WebView routing.
- Timeout/missed sync must mirror Android `missed` state.

## QA logcat

```bash
adb logcat -s DIBAY_FCM DIBAY_INCOMING_CALL DIBAY_PUSH_ROUTE
```

Expected on accept: `[call-state] accept_start` → `accept_success` → `[call-route] incoming_accept_opened`

Must not appear on lock receive: `incoming_activity_direct_launch` (FCM duplicate launch).

May appear on lock/screen-off via FSI bridge: `[call-ui] incoming_activity_shown`, `[call-notification] fsi_attached`.

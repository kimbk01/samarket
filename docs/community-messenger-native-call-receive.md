# Community Messenger Native Incoming Call

## Goal
Provide native lock-screen/background incoming call UX for DIBAY calls. Web call screens remain the in-app call surface, but Android/iOS native call UI owns the first receive affordance when the app is outside foreground.

## Layers
- Android FCM layer: `DibayFirebaseMessagingService` treats `type=incoming_call` separately from chat messages.
- Android native UI: `IncomingCallNotificationBuilder` + `IncomingCallActivity` show CALL-category full-screen / heads-up UI with answer and reject actions.
- Android native action layer: `IncomingCallActionCoordinator` single-flights `accept`, `reject`, and `missed` by callId and routes accepted calls to `/community-messenger/calls/{callId}?action=accept`.
- Web layer: `GlobalCommunityMessengerIncomingCall` remains foreground in-app receive UI and consumes the same call session state.
- iOS layer: `VoIPPushRegistry` + `CallKitProvider` are the PushKit/CallKit skeleton. `DibayVoipCallPlugin` exposes registration and explicit CallKit end hooks to JS.

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

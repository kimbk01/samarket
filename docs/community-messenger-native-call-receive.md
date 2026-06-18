# Community Messenger Native Incoming Call

## Goal
Provide native lock-screen/background incoming call UX for DIBAY calls. Web call screens remain the in-app call surface; **foreground** receive uses `IncomingCallBanner` only. **Lock/background** receive uses Android system call notification actions (accept/decline).

## Web FCM bridge (foreground)

When the app is foreground and WebView is alive, `MainActivity` injects:

- `dibay:call-event` — `{ type: "incoming_call" | "call_canceled" | "call_terminal", sessionId, callKind?, callerId?, status?, ... }`
- `dibay:call-route` — pending path for accept deep link (`dibay_call_pending_route` in sessionStorage)

Handled by `lib/community-messenger/dibay-fcm-call-bridge.ts` → `GlobalCommunityMessengerIncomingCall`.

**DO NOT** mix `dibay_call_pending_route` with OAuth/chat `pending_route` keys.

## Layers
- Android FCM layer: `DibayFirebaseMessagingService` treats `type=incoming_call` separately from chat messages.
- Android native UI: `IncomingCallNotificationBuilder` posts CALL-category notification. **Accept** uses an Activity trampoline to bypass Android background `startActivity` restrictions.
- Android native action layer: `IncomingCallActionCoordinator` single-flights `accept`, `reject`, and `missed` by callId. **Accept** runs native `PATCH accept` on a background thread, then routes to `/community-messenger/calls/{callId}?action=accept&nativeAccept=1` (`accept_route_direct`). Web skips duplicate PATCH when `nativeAccept=1`.
- Android terminal layer: `IncomingCallTerminalHandler` is the **single** entry for `call_canceled` / `call_ended` / `call_rejected` / `call_missed` (FCM or local). Always: dismiss notification, `DibayCallConsumedStore.mark`, ring stop, coordinator `complete`, clear pending routes, broadcast-finish `IncomingCallActivity`, inject `call_terminal` to WebView if alive.
- Web layer: `GlobalCommunityMessengerIncomingCall` + `IncomingCallBanner` for **foreground in-app** receive only.
- iOS layer: `VoIPPushRegistry` + `CallKitProvider` skeleton. `DibayVoipCallPlugin` exposes registration and explicit CallKit end hooks to JS.

## UX policy

| State | UI | Ring |
|-------|-----|------|
| App foreground (unlocked) | **`ForegroundIncomingCallActivity`** native pill + Web session sync | `IncomingCallPushDelivery` → `IncomingCallRingOwner` (not WebAudio) |
| Lock / screen off / app background | System call notification (silent channel) + **수락/거절**; lock also `IncomingCallActivity` via FSI/direct launch | RingOwner only (no channel sound) |
| After accept (any entry) | `/community-messenger/calls/{callId}?action=accept&nativeAccept=1` | native `ring_stop` on accept/terminal |

## Push delivery SSOT (Android)

All `incoming_call` FCM and debug adb paths must call **`IncomingCallPushDelivery.deliver()`** after store/route persistence.

Do **not** duplicate routing in `DibayFirebaseMessagingService` or debug receiver. Do **not** start ring in `MainActivity` or `IncomingCallBackgroundNotifier`.

See `.cursor/rules/incoming-call-push-delivery-contract.mdc` for confirmed root causes and DO NOT list.

## DO NOT (regression guards)

1. **Do not** add `windowShowWhenLocked`, `showWhenLocked`, `turnScreenOn`, etc. to `styles.xml` or `AndroidManifest` — AppCompat linking fails. Use `IncomingCallActivity.applyWakeFlags()` only when Activity is explicitly launched (fallback).
2. **Do not** set notification `contentIntent` to launcher or accept route — content tap opens **preview** only (`incomingPreview=1`). Accept must follow: native PATCH accept → `/calls/:id?action=accept&nativeAccept=1`.
3. **Do not** call `startActivity(IncomingCallActivity)` from FCM when app is **foreground+unlocked** — use `ForegroundIncomingCallActivity` pill via `IncomingCallPushDelivery`.
4. **Do not** use React `IncomingCallBanner` as lock-screen UI — WebView is unavailable when app is background/killed.
5. **Do not** start ring in `MainActivity`, notification channel, or `DEFAULT_ALL` — **`IncomingCallPushDelivery` + silent channel** only.
6. **Do not** Web `syncIncomingCallRing(null)` blind-stop native on Android before sessions hydrate.

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

- Incoming answer: `/community-messenger/calls/{callId}?action=accept&nativeAccept=1`
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
adb logcat -s DIBAY_CALL DIBAY_FCM DIBAY_INCOMING_CALL DIBAY_PUSH_ROUTE
```

Key `[DIBAY_CALL]` tags: `incoming_received`, `incoming_ignored_consumed`, `terminal_received`, `ring_stop`, `activity_finish_by_terminal`, `call_canceled_native_handled`, `accept_route_direct`, `terminal_tombstone_mark`.

Web (`logDibayCall`): `stale_ringing_blocked`, `reject_patch_*`, `incoming_consumed`, `terminal_event_received` (console).

Expected on accept: `accept_route_direct` → Web `active_route_replace` (no home flash).

Expected on caller cancel (lock): `call_canceled_native_handled` → `ring_stop` → `activity_finish_by_terminal`.

Must not appear on lock receive: `incoming_activity_direct_launch` (FCM duplicate launch).

May appear on lock/screen-off via FSI bridge: `[call-ui] incoming_activity_shown`, `[call-notification] fsi_attached`.

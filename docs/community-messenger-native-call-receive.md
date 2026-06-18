# Community Messenger Native Incoming Call

## DIBAY 통화 수신 SSOT 원칙 (P2 frozen)

1. **단일 session owner** — `IncomingCallSessionMachine` owns `callId` state. `activeCallId` is singular.
2. **Presenter 분리** — Web banner, CallStyle, `IncomingCallActivity`, notification, and `IncomingCallRingOwner` **follow** session phase; they do not own it.
3. **Cleanup SSOT** — `IncomingCallCleanupReason` enum only. `IncomingCallTerminalHandler` (+ coordinator user actions) perform ring + notification + FGS + activity cleanup together.
4. **Audio / video 공통** — identical incoming lifecycle until `ACCEPTED`; media bootstrap (Agora, camera) is post-accept only.
5. **Fail-closed server probe** — `caller_cancelled`, `missed_timeout`, `remote_ended` defer cleanup when server status cannot be confirmed (`server_probe_failed_deferred`).

## Goal
Provide native lock-screen/background incoming call UX for DIBAY calls. Web call screens remain the in-app call surface; **foreground** receive uses `IncomingCallBanner` only. **Lock/background** receive uses a single native primary surface per state.

## Web FCM bridge (foreground)

When the app is foreground and WebView is alive, `MainActivity` injects:

- `dibay:call-event` — `{ type: "incoming_call" | "call_canceled" | "call_terminal", sessionId, callKind?, callerId?, status?, ... }`
- `dibay:call-route` — pending path for accept deep link (`dibay_call_pending_route` in sessionStorage)

Handled by `lib/community-messenger/dibay-fcm-call-bridge.ts` → `GlobalCommunityMessengerIncomingCall`.

**DO NOT** mix `dibay_call_pending_route` with OAuth/chat `pending_route` keys.

Web terminal inject (`injectCallTerminalEvent`) delivers **WebView events only** — it does not native-cleanup an active session.

## Layers
- Android FCM layer: `DibayFirebaseMessagingService` treats `type=incoming_call` separately from chat messages. Surface selection: `IncomingCallRouteDecision`.
- Android session layer: `IncomingCallSessionMachine` — phases, duplicate FCM merge, stale guard, busy reject.
- Android ring SSOT: `IncomingCallRingOwner` / `DibayForegroundRingtone` only — incoming notification channel `dibay_calls_incoming_v4` is **silent** (no notification sound).
- Android native UI: `IncomingCallNotificationBuilder` posts CALL-category notification. **Accept** uses an Activity trampoline to bypass Android background `startActivity` restrictions.
- Android native action layer: `IncomingCallActionCoordinator` single-flights `accept`, `reject`, and `missed` by callId. **Accept** runs native `PATCH accept` on a background thread, then routes to `/community-messenger/calls/{callId}?action=accept&nativeAccept=1` (`accept_route_direct`). Web skips duplicate PATCH when `nativeAccept=1`.
- Android terminal layer: `IncomingCallTerminalHandler` is the **single** entry for `call_canceled` / `call_ended` / `call_rejected` / `call_missed` (FCM or local). Web `markCallConsumed` routes through `handleWebConsumed`. Always (when terminal confirmed): dismiss notification, `DibayCallConsumedStore.mark`, ring stop, FGS stop, coordinator `complete`, clear pending routes, broadcast-finish `IncomingCallActivity`, inject `call_terminal` to WebView if alive.
- Web layer: `GlobalCommunityMessengerIncomingCall` + `IncomingCallBanner` for **foreground in-app** receive only (Android APK included).
- iOS layer: `VoIPPushRegistry` + `CallKitProvider` skeleton. `DibayVoipCallPlugin` exposes registration and explicit CallKit end hooks to JS.

## UX policy (SSOT matrix)

| State | Primary UI | Ring | Notification | Session end triggers |
|-------|------------|------|--------------|-------------------|
| **Foreground + unlocked** | APK: `ForegroundIncomingCallActivity` native pill; PWA: Web `IncomingCallBanner` | RingOwner ×1 | None | accept / reject / confirmed terminal reason |
| **Background + screen on** | CallStyle heads-up (+ FSI to `IncomingCallActivity` when allowed) | RingOwner ×1 | Silent CallStyle | same (dismiss ≠ end) |
| **Lock / sleep + FSI allowed** | `IncomingCallActivity` (+ direct Activity launch; UI before async FGS) | RingOwner ×1 | Silent carrier (no CallStyle primary) | same (Activity lifecycle ≠ end) |
| **Lock / sleep + FSI denied** | `CallStyle` fallback (+ direct Activity if needed, not dual primary) | RingOwner ×1 | Silent CallStyle | same |

### Matrix prohibitions (frozen)

- Foreground APK: **native pill** via `IncomingCallForegroundUiLauncher` + Web `dibay:call-event` sync only; **no** FSI, **no** CallStyle primary.
- Foreground PWA/browser: Web `IncomingCallBanner` only.
- Lock+FSI: **no** CallStyle primary on same notification.
- All states: **no** notification channel sound (`dibay_calls_incoming_v4` silent).

## Audio / video common incoming lifecycle

Shared through `ACCEPTED`:

- `IncomingCallSessionMachine` (same phases for `audio` and `video`)
- `IncomingCallRouteDecision`, `IncomingCallRingOwner`, `IncomingCallActionCoordinator`, `IncomingCallTerminalHandler`
- `IncomingCallCleanupReason`, notification / activity / web presenters

Post-accept only (may diverge):

- Agora audio vs video join
- Camera preview, camera permission, video track bootstrap
- `media_failed_after_accept` cleanup reason (does **not** retroactively stop a completed accept ring path incorrectly)

**Forbidden:** video camera / media failure during **ringing** ending the incoming session.

## Cleanup reason enum (allowed)

| Wire | Use |
|------|-----|
| `accepted` | User accepted; ring + incoming UI dismissed |
| `rejected` | User declined |
| `caller_cancelled` | Server-confirmed caller cancel |
| `missed_timeout` | Server-confirmed or local timeout after probe |
| `remote_ended` | Remote party ended |
| `stale_duplicate_ignored` | Stale callId / duplicate terminal ignored |
| `app_shutdown_safe_clear` | Process shutdown only |
| `permission_denied` | Post-accept permission denial |
| `media_failed_after_accept` | Agora / camera failure after accept |

## Forbidden cleanup reasons

Never pass to `RingOwner.stopWithReason` or `incoming_cleanup`:

- `unknown`
- `generic_cleanup`
- `activity_destroyed`
- `notification_dismissed`

## Server probe policy (fail-closed)

`IncomingCallSessionStatusProbe.probe()` returns `ProbeResult`:

- **ok** — status string from `GET /api/community-messenger/calls/sessions/{id}`
- **deferred** — logs `server_probe_failed_deferred`, **does not** stop ringing

Applied before terminal cleanup for `caller_cancelled`, `missed_timeout`, `remote_ended`.

`missed_timeout` retries probe up to 3× (5s interval) before giving up — still without fail-open ring stop.

## Regression guards (ring-without-UI)

CI / pre-push:

```bash
npm run verify:incoming-call-ui-matrix-contract
npm run test -- lib/community-messenger/__tests__/incoming-call-incoming-ui-regression.test.ts
```

Connected Android device (debug APK):

```bash
CAPACITOR_SERVER_URL=http://<LAN-IP>:3000 npm run cap:sync:android
# assembleDebug + install, then:
npm run test:incoming-call-device-smoke
```

Frozen invariants:

- Background unlocked: `IncomingCallRingingCoordinator` → ringing FGS `startForeground` **then** CallStyle post (API 34+ contract)
- Lock: UI delivered **before** FGS (screen-off `startForegroundService` must not block Activity)
- Lock: `IncomingCallLockUiLauncher` direct Activity + FSI
- Background: CallStyle with `callstyle_build_failed` fallback
- Outgoing→incoming: FCM payload includes `roomId`, `callerId`, `callKind`

## DO NOT (regression guards)

1. **Do not** add `windowShowWhenLocked`, `showWhenLocked`, `turnScreenOn`, etc. to `styles.xml` or `AndroidManifest` — AppCompat linking fails. Use `IncomingCallActivity.applyWakeFlags()` only when Activity is explicitly launched (fallback).
2. **Do not** set notification `contentIntent` to launcher or accept route — content tap opens **preview** only (`incomingPreview=1`). Accept must follow: native PATCH accept → `/calls/:id?action=accept&nativeAccept=1`.
3. **Do not** post incoming notification sound — ring is `IncomingCallRingOwner` only (`dibay_calls_incoming_v4` silent channel).
4. **Do not** attach `CallStyle` and FSI as dual primary UI on the same lock receive — FSI primary ⇒ CallStyle suppressed.
5. **Do not** call `onPresented(..., "web_banner")` from native before Web actually renders — APK foreground UI is `ForegroundIncomingCallActivity`.
6. **Do not** call `startActivity(IncomingCallActivity)` from FCM when **foreground+unlocked** (use native pill). Lock+`lockBridge`: `IncomingCallLockUiLauncher` direct Activity allowed; **FSI denied (API 34+)** ⇒ `shouldLaunchDirectIncomingActivity` fallback.
7. **Do not** use React `IncomingCallBanner` as lock-screen UI — WebView is unavailable when app is background/killed.
8. **Do not** end a call session from `Activity.onDestroy`, notification dismiss, or Web terminal inject alone.
9. **Do not** restart ring on duplicate FCM for the same `callId` — merge notification only.
10. **Do not** use Web `IncomingCallBanner` as APK foreground primary UI — WebView session gates are async; native pill is SSOT on Capacitor.

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
adb logcat -s DIBAY_CALL DIBAY_FCM DIBAY_INCOMING_CALL DIBAY_PUSH_ROUTE DIBAY_CALL_PUSH
```

Key `[DIBAY_CALL]` tags:

- `incoming_route_decision` — `selectedSurface=foreground_banner|incoming_activity|callstyle_fallback`
- `ring_owner_decision` — `notificationSound=disabled`, `ringOwnerStart=true/false`
- `incoming_ui_surface` — `duplicateSuppressed=true` when FSI suppresses CallStyle
- `incoming_action_guard` / `incoming_cleanup`
- `terminal_received`, `ring_stop`, `activity_finish_by_terminal`, `accept_route_direct`

Web (`logDibayCall`): `stale_ringing_blocked`, `reject_patch_*`, `incoming_consumed`, `terminal_event_received` (console).

Expected on accept: `accept_route_direct` → Web `active_route_replace` (no home flash).

Expected on caller cancel (lock): `call_canceled_native_handled` → `ring_stop` → `activity_finish_by_terminal`.

Must not appear on lock+FSI receive: `callstyle_attached` on same callId as `fsi_attached` with `callstyle_suppressed=false`.

May appear on lock/screen-off via FSI bridge: `[call-ui] incoming_activity_shown`, `[call-notification] fsi_attached callstyle_suppressed=true`.

May appear on FSI denied: `[call-ui] incoming_activity_lock_launch` with `surface=callstyle_fallback`.

## Real-device QA checklist (Samsung SM-M156S)

Rebuild APK after native changes (`npx cap sync android`).

```bash
adb logcat -s DIBAY_CALL DIBAY_FCM DIBAY_INCOMING_CALL DIBAY_PUSH_ROUTE DIBAY_CALL_PUSH
```

### Scenarios

1. App foreground receive
2. App background receive
3. Screen-on background receive
4. Lock screen receive
5. Screen-off / sleep receive
6. Caller cancel during ring
7. Callee reject
8. Callee accept (audio)
9. Callee accept (video)
10. Video camera permission denied **after** accept
11. Duplicate FCM (same callId)
12. Stale callId terminal push
13. Accept from outside app → call screen entry speed

### Success criteria

- Single incoming UI surface per state
- Single ringtone (`ring_start` once per callId)
- No `ring_stop` without valid `reason`
- No `ring_stop_early_failure` except accept/reject/caller_cancel within 1s
- Accept/reject PATCH once
- Call screen within 1–2s after accept
- No UI/ring reappearance after terminal
- Audio and video share same incoming log sequence through `PRESENTED` → `ACCEPTING` → `ACCEPTED`

### Failure log patterns (must not appear)

- `ring_stop reason=unknown`
- `incoming_cleanup reason=activity_destroyed`
- `incoming_cleanup reason=notification_dismissed`
- Same `callId` `ring_start` twice (except new call after terminal)
- `duplicate FCM` followed by second `ring_start`
- Stale `callId` cleaning active call
- `incoming_ui_surface` after `ACCEPTED`
- `missed_timeout` cleanup while `ACCEPTING`
- `server_probe_failed_deferred` immediately followed by `ring_stop` / `incoming_cleanup` for same callId

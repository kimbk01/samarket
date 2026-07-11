# DIBAY Notification Permission SSOT LOCK

**Status:** LOCK (2026-06-29, tier split finalized)  
**Scope:** Notification / POST_NOTIFICATIONS / Push Register / Incoming Call Receive gate  
**Out of scope:** Mic/Camera PermissionManager (separate LOCK)

## Fixed goal

1. After login success: **no** auto OS notification prompt. `DiBaYDevicePermissionOnboardingGate` runs `syncNotificationState` only. OS `requestNotificationFromGuide()` on **explicit user gesture** (`settings_retry` / settings register) when `canRequestOsNotificationPrompt`.
2. **No** OS `POST_NOTIFICATIONS` / `PushNotifications.requestPermissions` / `Notification.requestPermission` outside `notification-permission-manager` adapters.
3. When `!receiveReady`: block Push Register, block Native Incoming Runtime delivery (FCM gate before Runtime).
4. Samsung / One UI: `POST_NOTIFICATIONS granted` alone is **not** PASS — composite `receiveReady` required.
5. **Tier split (product LOCK):** FSI is **never** part of `receiveReady`. FSI OFF does **not** block Push/FCM when `receiveReady=true`. Lock-screen FSI / Activity / fallback require `lockScreenIncomingReady`.

## Do not modify (explicit ban)

- `android/app/src/main/java/com/dibay/app/nativevoice/NativeVoiceCallRuntime.java`
- `android/app/src/main/java/com/dibay/app/nativevideo/NativeVideoCallRuntime.java`

Incoming **receive** block: `NotificationReceiveGate` + `IncomingCallPushDelivery`.  
Lock-screen **presentation** block: `NotificationReceiveGate` + `IncomingCallNotificationBuilder` (FSI attach, Activity fallback).

## Composite tiers (final)

### `receiveReady` — Push Register + FCM Runtime entry

```
receiveReady =
  POST_NOTIFICATIONS granted (API 33+; pre-33 treated as granted)
  AND appNotificationsEnabled (NotificationManagerCompat.areNotificationsEnabled)
  AND incomingCallChannelEnabled (v7 OR native_voice OR native_video — any one not blocked)
  AND NOT appBlocked (JS localStorage notification_required_blocked only)
```

**Explicitly excluded from receiveReady:** FSI, battery, samsungSleepRisk.

### `lockScreenIncomingReady` — lock-screen FSI / Activity / fallback

```
lockScreenIncomingReady =
  receiveReady
  AND fullScreenIntentAllowed (canUseFullScreenIntent API 34+)
  AND batteryOptimizationIgnored (NOT battery restricted)
```

When `receiveReady=true` but `lockScreenIncomingReady=false`:

- Push Register: **allowed**
- FCM → Native Runtime `handleIncoming`: **allowed** (ring / session)
- Lock-screen full-screen incoming, FSI attach, `launchActivityFallback`: **blocked**
- Fallback: notification-only + settings guide (`lock_screen_incoming_blocked`, `incoming_activity_fallback_blocked`)

## PermissionState (6)

| State | Meaning |
|-------|---------|
| `UNKNOWN` | Not synced / prompt eligible |
| `GRANTED` | `receiveReady` composite PASS |
| `DENIED` | Runtime denied, may re-prompt once via Guide |
| `PERMANENT_DENIED` | Don't ask again — Settings CTA only |
| `SYSTEM_DISABLED` | App notifications OFF, channel OFF, etc. |
| `NOT_SUPPORTED` | No API / insecure context |

## NotificationReceiveSnapshot fields

- `notificationRuntimePermission`
- `appNotificationsEnabled`
- `incomingCallChannelEnabled` (v7 OR native_voice OR native_video)
- `fullScreenIntentEnabled` — recorded; **not** in `receiveReady`
- `batteryUnrestrictedOrUnknown`: `unrestricted` | `restricted` | `unknown` — **not** in `receiveReady`
- `samsungSleepRisk`: always `unknown` (no OEM API)
- `receiveReady`
- `lockScreenIncomingReady`

## Related docs

- **Legacy Receive Policy (3-tier SSOT):** `docs/permissions/dibay-legacy-call-receive-policy.md`
  - Runtime / Lock Screen / Media 계층 분리 — **고정**
  - DIBAY에서 Runtime 차단 게이트 = `receiveReady` only (레거시 앱 일반 원칙으로 단정 금지)
  - Permission UX 변경 시에도 LOCK Runtime/FCM/Gate 수정 금지

## Flows

### First login

```
Login Success → syncNotificationState()
  → if !receiveReady && canRequestOsNotificationPrompt → requestNotificationFromGuide() (OS modal only)
  → if !receiveReady && !canRequestOsNotificationPrompt → declined (no passive app modal)
  → syncNotificationState()
  → if receiveReady → Push Register
  → else → notification_required_blocked
  → (Android) runPostLoginFullScreenIntentCheck() — FSI off → openFullScreenIntentSettings() direct, no app modal
```

### Settings retry (explicit user gesture)

```
settings_retry && !canRequestOsNotificationPrompt → settings-only fallback modal → Open Settings
settings_retry && canRequestOsNotificationPrompt → requestNotificationFromGuide() direct
```

### FCM incoming (Android)

```
IncomingCallPushDelivery.deliver
  → NotificationReceiveGate.snapshot()
  → if !receiveReady → log incoming_blocked_notification_permission, return (Runtime NOT called)
  → if !lockScreenIncomingReady → log incoming_push_lock_screen_tier_blocked, continue to Runtime
  → NativeVoice/VideoCallRuntime.handleIncoming (unchanged)
```

### Lock-screen presentation (NotificationBuilder boundary)

```
IncomingCallNotificationBuilder.showIncomingCall*
  → if !lockScreenIncomingReady → notification-only (no FSI attach, no launchActivityFallback)
  → log lock_screen_incoming_blocked | incoming_activity_fallback_blocked
```

## Log markers (QA)

| Marker | When |
|--------|------|
| `incoming_blocked_notification_permission` | `!receiveReady` — Runtime blocked |
| `incoming_push_lock_screen_tier_blocked` | `receiveReady` but `!lockScreenIncomingReady` — Runtime allowed, lock tier blocked |
| `lock_screen_incoming_blocked` | NotificationBuilder — notification-only |
| `incoming_activity_fallback_blocked` | FSI/battery tier — Activity fallback denied |

## Absolute FAIL

1. Guide skipped → direct OS notification request outside PermissionManager
2. Push Register success when `!receiveReady`
3. Incoming Runtime start when `!receiveReady`
4. `receiveReady` when incoming channel blocked
5. `receiveReady` formula includes FSI or battery
6. `launchActivityFallback` when `!lockScreenIncomingReady`
7. OS popup on PERMANENT_DENIED / SYSTEM_DISABLED
8. Native Voice/Video Runtime file changes without explicit user approval

## Verify

```bash
npm run verify:notification-permission-ssot-contract
```

ADB QA (receiveReady=false → Runtime blocked):

```bash
node scripts/qa/notification-receive-gate-adb-qa.mjs
```

Manifest: `scripts/notification-permission-ssot-manifest.json`

# Push Native Register — Phase A Contract

**Status:** Phase A (contract only — **no implementation**)  
**Last updated:** 2026-06-28  
**Related:** Step B revert `54a4bf6c` (removed `f372056a` JS retry; kept `4560d62f` proof logs)

---

## 1. Problem statement (confirmed)

| Fact | Source |
|---|---|
| 6/15 server dispatch uses `user_devices` FCM as call-ringing SSOT | `9ac0ae14`, `3d60b5b5` |
| 6/15 client register is WebView JS `fetch` only | `register-native-push-client.ts` since `9ac0ae14` |
| Android native HTTP register was never added | `DibayFirebaseMessagingService.onNewToken` logs only |
| Run 1 QA: authenticated + `api_post_started`, Vercel hit 0 | WebView fetch dispatch hang — not auth/FCM/API |
| JS retry/timeout increase is **stopped** | Step B revert `54a4bf6c` |

**This is not a Call Runtime bug.** Incoming call accept/ring/routing LOCK files are out of scope.

---

## 2. Phase map

| Phase | Scope | Status |
|---|---|---|
| **A** | This document — SSOT contract | **Current** |
| **B** | Android native register/deactivate HTTP + device_id bridge | Not started |
| **C** | JS demote (`webview_legacy` → off on Android) | After B QA |

Phase A defines contracts only. **No code changes** until Phase B is explicitly approved.

---

## 3. `device_id` SSOT

### 3.1 Canonical identifier

| Field | SSOT |
|---|---|
| Key | `dibay:client_instance_id` (`DIBAY_CLIENT_INSTANCE_ID_KEY`) |
| Generator | `ensureClientInstanceId()` in `lib/auth/client-instance-id.ts` |
| Format | UUID (or fallback random string) |
| Persistence | Survives explicit logout wipe (`CLIENT_INSTANCE_PERSISTENT_KEYS`) |

### 3.2 Native mirror (Phase B requirement)

| Item | Contract |
|---|---|
| Native store | Android `SharedPreferences` — key TBD in Phase B impl (e.g. `dibay_client_instance_id`) |
| Sync trigger | JS → native **once** when: authenticated boot, login success, before first native register |
| Sync direction | JS is writer; native is reader for register/deactivate POST body |
| **Forbidden** | `Settings.Secure.ANDROID_ID` as `user_devices.device_id` |

**Note:** `IncomingCallPushAckHelper` uses `ANDROID_ID` for push-ack only. That path must **not** become `user_devices.device_id` SSOT.

### 3.3 Server contract (unchanged)

- Register: `POST /api/me/devices/register` — body `{ device_id, push_token, push_provider, platform, ... }`
- Deactivate: `POST /api/me/devices/deactivate` — body `{ device_id }` or `{ device_id, scope: "device_all_users" }`
- Auth: cookie session via `requireAuthenticatedUserId()` — no bearer-token register API in Phase B

---

## 4. Register owner

### 4.1 Current owner (until Phase C)

| Platform | Owner | Path |
|---|---|---|
| Android Capacitor | **WebView JS** | `NativePushRegistration` → `registerNativePushFromClient()` → `fetch("/api/me/devices/register")` |
| iOS Capacitor | WebView JS (same) | + VoIP token via `attachVoipPushTokenListener()` |
| Web / PWA | Web Push VAPID | `register-web-push-subscription-client.ts` → `/api/me/push/subscribe` |

### 4.2 Target owner (Phase B → C)

| Platform | Target owner | Mechanism |
|---|---|---|
| **Android** | **Native HTTP** | `HttpURLConnection` + `CookieManager.getCookie(origin)` + `DibayServerOrigin.resolve()` |
| iOS | Unchanged in Phase B | Separate track after Android QA |
| Web / PWA | Unchanged | VAPID path stays |

### 4.3 Owner flag (Phase B introduces, Phase C enforces)

```ts
type PushRegisterOwner = "native" | "webview_legacy";
```

| Value | Meaning |
|---|---|
| `webview_legacy` | Current behavior — JS `fetch` register (Android pre-Phase-C) |
| `native` | Android native owns POST; JS `postDeviceRegistration` **must not run** |

Phase B ships with flag defaulting to controlled rollout (document in Phase B PR). Phase C sets Android to `native` permanently.

### 4.4 Register preconditions (all phases)

Register POST **must not** run when:

- Session phase is `recovering`, `terminal_guest`, `guest`, or `corrupt`
- Cookie session is empty (native: `CookieManager.getCookie(origin)` empty)
- Notification permission is not `granted` (existing JS behavior)
- User explicitly logged out (terminal guest)

Register **may** run when:

- Session phase is `authenticated`
- Valid cookie session exists
- FCM/APNS token is non-empty

**Forbidden:** fake success, guest register, register after cookie wipe.

### 4.5 Trigger matrix (Phase B)

| Event | Actor | Action |
|---|---|---|
| `authenticated` phase + Android | JS `NativePushRegistration` | Sync `device_id` → native, signal `registerNow()` |
| FCM `onNewToken` | Native helper | POST register **if** cookie + synced `device_id` present |
| Capacitor `registration` listener | JS | Phase C: log-only or skip POST when owner=`native` |
| Token refresh while authenticated | Native | Idempotent upsert (server `onConflict: push_provider,push_token`) |

### 4.6 HTTP reference pattern (read-only)

Native register/deactivate must follow existing call-adjacent HTTP patterns:

- `DibayServerOrigin.java` — origin SSOT
- `IncomingCallPushAckHelper.java` — cookie + POST ( **do not modify** — reference only )
- `NativeVoiceCallApi.java` — cookie + PATCH/GET ( **LOCK — do not modify** )

---

## 5. Logout deactivate owner

### 5.1 Current sequence (fixed — do not reorder)

From `lib/auth/explicit-logout-flow.ts`:

```
explicit_logout_start
  → disconnectWebPushSubscriptionsForLogout()     [JS, best-effort]
  → clearNativeBadgeCount()                       [JS]
  → disconnectNativeDevicesForLogout()            [JS fetch — hang-vulnerable]
  → reportServerLogout(/api/auth/logout*)          [JS fetch, cookie retained]
  → supabase.auth.signOut()
  → wipeClientSessionState("user_logout")
  → terminal_guest
```

**Invariant:** deactivate runs **before** cookie wipe and **before** `signOut`.

### 5.2 Target deactivate owner (Phase B)

| Step | Phase B owner |
|---|---|
| Native device deactivate POST | **Native HTTP** (same cookie + `device_id` SSOT) |
| Web push unsubscribe | JS (unchanged) |
| Server logout API | JS (unchanged) |
| signOut + wipe | JS (unchanged) |

Phase B adds native deactivate in parallel to (then replacing) `disconnectNativeDevicesForLogout()` WebView fetch on Android.

### 5.3 Account switch

`disconnectNativeDevicesOnAccountSwitch()` — `{ device_id, scope: "device_all_users" }`  
Phase B: same native HTTP owner as logout deactivate.

---

## 6. JS / native duplicate prevention

### 6.1 Server layer (already idempotent)

- Upsert: `onConflict: push_provider, push_token` in `/api/me/devices/register`
- Duplicate POST with same token: safe at DB level

### 6.2 Client layer (Phase B → C)

| Rule | Detail |
|---|---|
| Single active register path | When owner=`native`, only native POST runs |
| JS demotion | `register-native-push-client.ts` — Android + owner=`native` → skip `fetch` register |
| `onNewToken` vs JS listener | Not both POSTing — native owns token→server on Android after Phase C |
| Success signal | Native → JS bridge event → `push_register_success_authenticated` marker |
| Failure signal | Native → JS bridge error → `logPushRegisterFail` — **no fake ok** |

### 6.3 Dispatch layer (unchanged)

- `dispatchPushForUser` + `loadActivePushTargets` remain server SSOT
- Call ringing prefers FCM over web_push when both exist (`native_call_preferred` skip)
- Phase B/C does **not** change dispatch or incoming-call push senders

---

## 7. Session / auth interaction (keep — do not revert)

Auth recovering patches (`08aebc5a`, `fc5a5f83`) are **not** the Run 1 hang cause. Phase B register must respect:

| Phase | Register behavior |
|---|---|
| `recovering` | Defer register; keep existing `user_devices` row active |
| `authenticated` | Allow register |
| `terminal_guest` / `corrupt` | Skip register; clear attempted user ref |

Source: `NativePushRegistration.tsx`, `dibay-session-policy.ts` (`allowsPushRegistration`).

---

## 8. Observability (proof markers — keep)

Step B state: `4560d62f` proof logs retained; `f372056a` retry logs removed.

### 8.1 Register proof markers (JS — until Phase C)

| Marker | Purpose |
|---|---|
| `api_post_started` | Fetch invoked |
| `api_fetch_resolved` | Response received (absence = dispatch hang) |
| `registration_timeout_before_api_response` | Outer timeout vs API hang |
| `listener_invocation` | Listener re-entry check |
| `push_register_success_authenticated` | Cold-start QA gate (3/3) |

### 8.2 Phase B native markers (to add in Phase B only)

| Marker | Purpose |
|---|---|
| `native_register_post_started` | Native HTTP began |
| `native_register_post_done` | HTTP status + ok |
| `native_register_skipped_no_cookie` | Preconditions not met |
| `native_deactivate_post_done` | Logout path |

---

## 9. Native Call LOCK — non-touch guarantee

### 9.1 Absolute modify/import/call ban (Phase B/C)

```
android/.../IncomingCallPushDelivery.java
android/.../IncomingCallRingOwner.java
android/.../IncomingCallBackgroundNotifier.java
android/.../IncomingCallNotificationBuilder.java
android/.../IncomingCallActivity.java
android/.../IncomingCallActionCoordinator.java
android/.../IncomingCallTerminalHandler.java
android/.../IncomingCallSessionCleanup.java
android/.../IncomingCallWakeLock.java
android/.../PendingIncomingPresentation.java
android/.../NativeIncomingCallPlugin.java
android/.../nativevoice/NativeVoiceCall*.java
android/.../nativevideo/NativeVideoCall*.java
android/.../callv4/CallRuntimeV4.java
lib/community-messenger/call-v4/**
lib/community-messenger/service.ts  (call push dispatch — no change)
```

Also: no changes to accept / ring / routing / FSI / FCM **delivery** branching.

### 9.2 Allowed touch (Phase B only — push/register)

| File | Allowed change |
|---|---|
| **New** `android/.../nativepush/NativePushRegisterHelper.java` | Register + deactivate HTTP |
| **New** `android/.../nativepush/NativePushRegisterPlugin.java` | Capacitor bridge (optional) |
| `DibayFirebaseMessagingService.java` | `onNewToken` → call register helper **only** — **no delivery logic** |
| `MainActivity.java` | Register push plugin **one line** — no call plugin changes |
| `lib/push/native/register-native-push-client.ts` | Owner gate + native delegate |
| `components/push/NativePushRegistration.tsx` | Native result listen; phase gate unchanged |
| `lib/push/disconnect-native-devices-for-logout-client.ts` | Native deactivate bridge |
| **New** `lib/push/native/sync-client-instance-id-bridge.ts` | device_id sync |
| **New** `lib/push/native/native-push-register-owner.ts` | Owner flag |

### 9.3 Read-only reference (never modify)

- `IncomingCallPushAckHelper.java` — HTTP+cookie POST pattern
- `NativeVoiceCallApi.java` — cookie session pattern
- `DibayServerOrigin.java` — origin SSOT

### 9.4 `DibayFirebaseMessagingService` boundary

Per `incoming-call-push-delivery-contract.mdc`:

- **Allowed:** `onNewToken(String)` → register helper POST
- **Forbidden:** duplicate FCM message handling, incoming-call delivery branching, changes to `onMessageReceived` routing

---

## 10. Expected files (Phase B implementation preview)

> **Not approved for implementation yet.** Listed for contract completeness.

### 10.1 New files

| Path | Role |
|---|---|
| `android/.../nativepush/NativePushRegisterHelper.java` | Native register/deactivate HTTP |
| `android/.../nativepush/NativePushRegisterPlugin.java` | Capacitor: `syncDeviceId`, `registerNow`, `deactivateDevice` |
| `lib/push/native/sync-client-instance-id-bridge.ts` | JS UUID → native SharedPreferences |
| `lib/push/native/native-push-register-owner.ts` | Owner flag + platform gate |

### 10.2 Modified files (push/register only)

| Path | Change |
|---|---|
| `lib/push/native/register-native-push-client.ts` | Native delegate; demote JS fetch on Android |
| `components/push/NativePushRegistration.tsx` | Bridge trigger + native success/fail listen |
| `lib/push/disconnect-native-devices-for-logout-client.ts` | Native deactivate on Android |
| `android/.../DibayFirebaseMessagingService.java` | `onNewToken` → helper |
| `android/.../MainActivity.java` | Plugin registration |
| `android/app/capacitor.build.gradle` | Plugin wiring |

### 10.3 Unchanged

| Path | Reason |
|---|---|
| `app/api/me/devices/register/route.ts` | API contract stable |
| `app/api/me/devices/deactivate/route.ts` | API contract stable |
| `lib/push/dispatch/**` | Server dispatch SSOT |
| `lib/auth/explicit-logout-flow.ts` | Sequence unchanged; callee swap only in Phase B |
| Auth recovering files | Keep — independent of register hang |

---

## 11. Phase B QA gate (definition only)

Before Phase C (JS demote permanent):

| # | Case | Pass criteria |
|---|---|---|
| 1 | Cold start × 3 | `push_register_success_authenticated` 3/3 |
| 2 | Run 1 class hang | `native_register_post_done` or Vercel hit — no dispatch hang |
| 3 | Idle → incoming call | FCM row active in `user_devices` |
| 4 | Explicit logout | `native_deactivate_post_done`; no push after logout |
| 5 | LOCK audit | Zero diff in §9.1 files |

---

## 12. Explicit non-goals

- JS fetch retry / timeout increase / infinite retry
- Call Runtime / accept / ring / routing changes
- Guest-state register or fake success
- iOS native register in Phase B (Android first)
- Changes to `IncomingCallPushDelivery` or FCM delivery SSOT

---

## 13. Change history

| Date | Change |
|---|---|
| 2026-06-28 | Phase A contract created (Step C). Step B revert `54a4bf6c` applied. |

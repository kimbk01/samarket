# Push Device Identity SSOT — LOCK

**Status:** LOCK (2026-06-30)  
**Scope:** Android Capacitor FCM `user_devices` identity — register · active target · dispatch  
**Out of scope:** Native Call Runtime LOCK, Android Java call paths, APNS, notification sound SSOT, P3-2

**QA evidence (PASS):**

| Artifact | Result |
|----------|--------|
| `.qa-logs/device-register-ssot-qa/report-2026-06-30T08-11-13.json` | register PASS (`native_register_post_done` 200) |
| `.qa-logs/p0-2-bg-chat-e2e.json` | FCM receive + `channelId=dibay_chat_messages_v1` PASS |
| `.qa-logs/p0-2-final-chat-e2e.json` | `notification_deliveries` sent + correct `tokenPrefix` PASS |

**Commits (LOCK baseline):**

| Commit | Summary |
|--------|---------|
| `1391f353` | P0-1 — decouple register from onboarding gate |
| `1821b4a8` · `1ec5de10` | P0-2 — active FCM token SSOT (register deactivate + dispatch single target + legacy `dibay-*` guard) |

**Related contracts (do not contradict):**

- `docs/push-native-register-phase-a-contract.md` — `device_id` / register API shape
- `docs/permissions/dibay-notification-permission-ssot.lock.md` — `receiveReady` before register
- `.cursor/rules/dibay-call-native-runtime-ssot.mdc` — Call establishment ≠ push device identity

---

## 1. Fixed goal (do not regress)

1. **Chat / non-call:** One active FCM target per user at dispatch (`filterUserDevicePushTargets` `single_fcm`).
2. **Call push kinds (2026-07-29 multi-device LOCK):** fan-out one FCM **per `device_id`** for `incoming_call` / terminal dismiss / `call_answered_elsewhere`. See `docs/dibay-call-multi-device-policy.md`.
3. **Register is not blocked by notification onboarding UI** — authenticated + permission ready → register may proceed (P0-1).
4. **Register must not wipe other devices' FCM** on success (multi-device login). Same-device stale tokens still deactivated by `device_id` + token.
5. **Legacy `dibay-*` client_instance_id cannot steal active slot** from a fresher UUID row (30-day window) via `shouldActivateFcmDeviceRegister`.
6. **No Android Java / DB migration changes for chat identity alone** — call `answered_device_id` migration is owned by multi-device call policy.

---

## 2. SSOT tables & keys

| Layer | SSOT |
|-------|------|
| Physical device identity (client) | `dibay:client_instance_id` → `ensureClientInstanceId()` (`lib/auth/client-instance-id.ts`) |
| Server row | `public.user_devices` (`supabase/migrations/20260915100000_user_devices_notification_deliveries.sql`) |
| Upsert unique key | `(push_provider, push_token, environment)` — **not** `(user_id, device_id)` |
| Token ownership invariant | At most one row per `(push_provider, push_token, environment)`; that row’s `user_id` is the sole owner |
| Multi-device invariant | One `user_id` MAY have multiple active rows for different `device_id` values (call fan-out). Chat dispatch may still apply `single_fcm` filter at read time. |
| Register authority | `public.register_user_device` RPC (service_role) — atomic upsert + deactivate + cap-inactive; **no physical DELETE** |
| Dispatch read path | `loadActivePushTargets()` → `filterUserDevicePushTargets()` |

**Phase A (2026-08-02):** Token recycle must **not** `DELETE` `user_devices` rows (Campaign FK / UNIQUE collision). Ownership moves in place via `ON CONFLICT` upsert inside the RPC.

---

## 3. Active FCM token — one per user

### 3.1 Server invariant

After any **successful** FCM register where `activateRow === true`:

1. The upserted `(push_provider, push_token, environment)` row has `user_id = auth` AND `is_active = true` AND fresh `last_seen_at`.
2. No other row shares that token key.
3. Other users’ rows for the same physical `device_id` + `environment` are `is_active = false`.
4. Same user + device + provider rows with a different `push_token` are `is_active = false`.
5. Other `device_id` rows for the same user may remain active (multi-device).

### 3.2 Dispatch invariant

`loadActivePushTargets` loads active rows ordered by `last_seen_at DESC`, `updated_at DESC`, then `filterUserDevicePushTargets`:

- **FCM (chat / default):** first row only (latest wins).
- **FCM (call multi-device kinds):** one row per `device_id` (`fcmMode: multi_device_fcm`).
- **Other providers (apns / voip_apns):** dedupe by `(push_provider, device_id)` — same physical iOS device may expose **both** alert APNs and VoIP.
- **web_push_subscriptions:** legacy path unchanged.

### 3.3 Defense in depth

Even if DB temporarily has >1 active FCM row (race / manual ops), dispatch sends to **one** FCM target only.

---

## 4. Register — stale FCM token handling

**Route:** `POST /api/me/devices/register` (`app/api/me/devices/register/route.ts`)

### 4.1 Register authority (Phase A — no physical DELETE)

**Authority:** `POST /api/me/devices/register` validates session, then calls `register_user_device` RPC with **session `auth.userId` only** (body `user_id` never trusted). RPC is `service_role` only and uses `pg_advisory_xact_lock` on token then device keys.

| Step | Rule |
|------|------|
| Token bind | `UPSERT` on `(push_provider, push_token, environment)` setting `user_id=auth`, `device_id`, `is_active=activateRow`, `last_seen_at=now`. **Do not DELETE** token rows for recycle; ownership moves in place. |
| Cross-user device | After bind: `device_id` + `environment` + `user_id ≠ auth` → `is_active = false` (all providers on that device for prior users). |
| Same device, new token | After bind: same `user_id` + `device_id` + **same `push_provider`** + different `push_token` → old token row `is_active = false`. **Do not** deactivate `apns` when registering `voip_apns` (or the reverse). |
| Cap | If active row count for `user_id`+`environment` exceeds max: set oldest active rows `is_active=false` (**never DELETE**). |
| Failure | Any error before RPC commit → full rollback; prior bindings unchanged. |
| Result check | Route verifies returned `user_id`, `device_id`, `environment`, `is_active`, `last_seen_at`. |
| Campaign | Register MUST NOT depend on deleting `user_devices` rows referenced by `notification_campaign_deliveries`. |

### 4.2 Activation decision (P0-2)

`shouldActivateFcmDeviceRegister()` (`lib/push/device-register/should-activate-fcm-device-register.ts`):

| Register `device_id` | `is_active` on upsert |
|----------------------|------------------------|
| UUID format | `true` (normal) |
| Legacy `dibay-*` | `false` if **any** FCM peer has UUID `device_id` with `last_seen_at` within **30 days** |
| Legacy `dibay-*` (no fresh UUID peer) | `true` |
| Non-FCM providers | always `true` |

Upsert still returns `{ ok: true }` when `activateRow === false` (token recorded but not promoted).

### 4.3 Post-bind stale sweep (Phase A)

Do **not** deactivate other `device_id` FCM rows for the same user after register (multi-device).  
Stale cleanup is limited to RPC steps in §4.1: other users on the same physical `device_id`, and same user + same `device_id` + same `push_provider` with a different `push_token`.

### 4.4 Client register gate (P0-1 — do not regress)

| Mechanism | Contract |
|-----------|----------|
| `registerDeviceOnce` | Same identity TTL 24h; inflight single-flight; failure backoff |
| `prepareDeviceRegisterAfterLogin(userId)` | Clears gate + **one** forced register bypass (login / account switch) |
| `NativePushRegistration` | Register when `authenticated` + permission ready — **not** blocked on `waitForNotificationOnboardingSettled()` |
| Onboarding gate | May still run for UX; must not be hard prerequisite for register POST |

---

## 5. Dispatch — single active FCM target

**Files:**

- `lib/push/dispatch/load-active-push-targets.ts`
- `lib/push/dispatch/filter-user-device-push-targets.ts`
- Consumers: `lib/push/dispatch/dispatch-push-for-user.ts`, admin campaign send, etc.

**Selection rule:**

```
active FCM target(user) =
  first row in sort(last_seen_at desc, updated_at desc)
  where is_active and push_provider = 'fcm'
```

FCM HTTP v1 send uses that row’s `push_token` only.

**OS notification policy (separate, not device identity):** `notify-message-pipeline` may skip FCM when recipient `app_visibility = foreground` (policy profile). Device identity LOCK does not change this; QA must background the app or set presence `background` for receive E2E.

---

## 6. Login / Logout / Account switch / Token rotation

### 6.1 Login

```
Login success
  → bindAuthUserId (client_instance_id persists)
  → prepareDeviceRegisterAfterLogin(userId)   // gate clear + 1× TTL bypass
  → NativePushRegistration: register when authenticated + receiveReady + token
  → POST /api/me/devices/register
  → server: single active FCM row (§4)
```

### 6.2 Logout

```
Client: disconnectNativeDevicesForLogout()
  → clearDeviceRegisterGateForUser()
  → POST /api/me/devices/deactivate { device_id }

Server logout route:
  → deactivateAllUserDevicesForLogout(userId, deviceId)
```

### 6.3 Account switch

```
Client: disconnectNativeDevicesOnAccountSwitch()
  → clearDeviceRegisterGateForUser()
  → POST /api/me/devices/deactivate { device_id, scope: "device_all_users" }

New account login:
  → prepareDeviceRegisterAfterLogin(newUserId)
  → register (§6.1)
```

### 6.4 Token rotation (FCM `onNewToken`)

```
New FCM token on device
  → register POST with same device_id + new push_token
  → RPC register authority (§4.1): upsert new token bind, then deactivate
    same-device previous tokens only (not other devices)
```

**Identity key for client dedupe:** `userId|deviceId|platform|pushProvider|pushToken` (`deviceRegisterIdentityKey`).

---

## 7. QA PASS conditions (LOCK gate)

Re-run before any LOCK-touching PR merge.

### 7.1 Device register (aaaa QA device `RRGL4046NTW`)

```bash
DEVICE_SERIAL=RRGL4046NTW E2E_TEST_LOGIN=aaaa LOGIN=aaaa \
  node .qa-logs/device-register-ssot-qa.mjs
```

| Check | PASS |
|-------|------|
| `native_register_post_done` + `http_status: 200` | required |
| `device_register_success` | required |
| `device_register_loop_guard_blocked` | must be 0 |
| Estimated register POSTs per session | 1–2 |

### 7.2 DB active token

```sql
-- service role: exactly one active FCM row for QA user aaaa
SELECT device_id, left(push_token, 8), is_active, updated_at
FROM user_devices
WHERE user_id = '11111111-1111-1111-1111-111111111111'
  AND push_provider = 'fcm'
  AND is_active = true;
-- expect: 1 row, UUID device_id preferred over dibay-*
```

### 7.3 Prod chat_message E2E (qqqq → aaaa)

 Preconditions:

- Recipient app **background** (HOME, not force-stop-only if testing receive UI).
- Presence `app_visibility = background` for aaaa (POST `/api/community-messenger/presence` if stale foreground).

| Check | PASS |
|-------|------|
| `notification_events` row `type=chat_message` | required |
| `notification_deliveries.status = sent` | required |
| `provider_response.tokenPrefix` matches active row | required |
| Logcat `[fcm] message_received` | required |
| Logcat `native_notification_posted channelId=dibay_chat_messages_v1` | required |

Reference run: `.qa-logs/p0-2-bg-chat-e2e.json`

### 7.4 Unit tests

```bash
vitest run lib/push/device-register/__tests__/device-register-gate.test.ts
vitest run lib/push/device-register/__tests__/should-activate-fcm-device-register.test.ts
vitest run lib/push/dispatch/__tests__/filter-user-device-push-targets.test.ts
npm run verify:push-dispatch-contract
```

---

## 8. LOCK layer map

| Layer | Paths |
|-------|--------|
| Register API | `app/api/me/devices/register/route.ts` |
| Deactivate API | `app/api/me/devices/deactivate/route.ts` |
| Legacy guard | `lib/push/device-register/should-activate-fcm-device-register.ts` |
| Client gate | `lib/push/device-register/register-device-once.ts`, `device-register-gate.ts` |
| Client wiring | `components/push/NativePushRegistration.tsx` |
| Onboarding gate (non-blocking) | `lib/permissions/dibay-post-login-onboarding-gate.ts`, `components/permissions/DiBaYDevicePermissionOnboardingGate.tsx` |
| Dispatch filter | `lib/push/dispatch/load-active-push-targets.ts`, `filter-user-device-push-targets.ts` |
| Logout / switch | `lib/push/disconnect-native-devices-for-logout-client.ts`, `app/api/auth/logout/route.ts` |
| Tests | `lib/push/device-register/__tests__/*`, `lib/push/dispatch/__tests__/filter-user-device-push-targets.test.ts` |

---

## 9. DO NOT (without explicit user approval)

### 9.1 This LOCK

1. Revert to **multiple active FCM rows per user** as acceptable state.
2. Remove post-register stale FCM deactivate or single-target dispatch filter.
3. Re-bind register to `waitForNotificationOnboardingSettled()` as hard gate (P0-1 regression).
4. Allow legacy `dibay-*` register to set `is_active = true` when fresh UUID peer exists.
5. Change `(push_provider, push_token)` upsert semantics without QA + LOCK doc update.

### 9.2 Adjacent forbidden tracks

| Track | Rule |
|-------|------|
| **Native Call LOCK** | No edits to incoming call runtime, FSI, CallV4, native voice/video LOCK files |
| **Android Java** | No edits to `DibayFirebaseMessagingService`, `NativePushRegisterHelper`, etc. for identity SSOT |
| **DB migration** | No new `user_devices` unique index / schema change under this LOCK |
| **P3-2** | **Not started.** No MissedCallNotificationHelper, APNS, admin push UI, or P3-2 scope until user re-opens after this LOCK |
| **Notification Sound SSOT** | Separate LOCK (`docs/notifications/notification-sound-ssot-phase1-lock.md`) |

### 9.3 Agent rule

Cursor: `.cursor/rules/push-device-identity-ssot-lock.mdc`

---

## 10. Regression gate (any touch to §8 paths)

```bash
npx tsc --noEmit
vitest run lib/push/device-register/__tests__/device-register-gate.test.ts \
  lib/push/device-register/__tests__/should-activate-fcm-device-register.test.ts \
  lib/push/dispatch/__tests__/filter-user-device-push-targets.test.ts
npm run verify:push-dispatch-contract
```

Device QA (prod): §7.1–7.3 on `RRGL4046NTW` before marking LOCK sustained.

---

## 11. Next phase gate (P3-2)

**P3-2 is blocked until:**

1. This document is ratified LOCK (this revision, 2026-06-30).
2. User explicitly approves P3-2 scope in a separate instruction.

Do not implement P3-2 artifacts, MissedCallNotificationHelper, APNS, or cross-track refactors while executing P3-2-prep work without approval.

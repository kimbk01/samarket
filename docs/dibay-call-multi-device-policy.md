# DIBAY Call Multi-Device Policy — LOCK

**Status:** LOCK (2026-07-29)  
**Baseline HEAD:** `061da5008`  
**Scope:** Same `userId` on multiple mobile devices — fan-out, first-answer-wins, account-level missed.

## Fixed product sentence

```text
DIBAY 통화는 userId가 아닌 deviceId 단위로 각 기기에 배달한다.
동일 계정의 통화 가능 기기는 함께 울릴 수 있지만,
서버 atomic claim을 최초 성공한 한 기기만 통화를 소유한다.
수락·거절·취소가 확정되면 나머지 기기는 즉시 종료한다.
부재중·통화 이력·Bell·App icon은 device별이 아니라
callSession과 recipient user 계정당 정확히 한 번만 생성한다.
```

## Identifier separation (do not conflate)

| Concept | Meaning |
|---------|---------|
| `userId` | Account / person |
| `authSessionId` | Login session — not call device identity |
| `deviceId` | App install / register identity (`user_devices.device_id`) |
| `pushEndpoint` | Token row (`user_devices` per provider) — tokens rotate |
| `callSessionId` | One outbound attempt (`community_messenger_call_sessions.id`) |
| `callDeliveryId` | Ideal: `(callSessionId, deviceId)` — **Phase follow-up if table added** |

## Audit snapshot (pre-fix vs contract)

| Topic | Pre-fix reality | Contract |
|-------|-------------------|----------|
| Device registry | `user_devices` + `dibay:client_instance_id` | Keep; do not use FCM token as device id |
| Active FCM | **One FCM per user** (register deactivate + filter) | **Call** fan-out: one FCM **per device**; chat stays single-FCM filter |
| VoIP | Multiple devices allowed (dedupe by `device_id`) | Keep |
| `call_deliveries` | Missing | Optional later; delivery audited via `notification_deliveries` |
| Accept authority | CAS `ringing`→`active` only; no `answered_device_id` | Atomic claim + `answered_device_id` |
| Late accept | Idempotent `ok: true` → dual Agora risk | `answered_elsewhere` |
| Dismiss other callee devices on accept | Missing | `call_answered_elsewhere` terminal push |
| Missed | Callee account once; no delivery evidence | Skip Bell when no sent/nativeAck evidence |
| Primary-only ring | Not used | Forbidden |

## LOCK overrides

This document **explicitly overrides** `docs/push/push-device-identity-ssot-lock.md` §1 “One active FCM target per user” **for call push kinds only**:

- `incoming_call`, `call_canceled`, `call_rejected`, `call_ended`, `call_answered_elsewhere` → multi-device FCM (one row per `device_id`)
- Chat / non-call dispatch → still single FCM (latest wins)

Register **must not** deactivate other users’ FCM rows on successful FCM register (multi-device login allowed).

## Device identity for accept / answered_elsewhere

Canonical id is `user_devices.device_id` (= Web `dibay:client_instance_id`).

| Layer | Source |
|-------|--------|
| Register | `device_id` posted to `/api/me/devices/register` |
| Android Native | `DibayCanonicalDeviceIdStore` (NativePushRegister + `persistCanonicalDeviceId`) |
| iOS Native | `DibayCanonicalDeviceIdStore` (UserDefaults + WebView localStorage fallback) |
| Accept PATCH | `deviceId` body = canonical store |
| answered_elsewhere | payload `answeredDeviceId` compared to canonical store |

**Forbidden as primary claim id after register:** raw ANDROID_ID / IDFV.

## Out of scope (this phase)

- Call waiting / handoff between devices mid-call
- Full `call_deliveries` table
- Web/Desktop as ringing targets
- Speculative Web fallback timers
- Complex presence / mute / primary-device preference

## Incoming push durable claim

`incoming_push_claimed_at` CAS on `community_messenger_call_sessions` — one serverless instance wins fan-out.


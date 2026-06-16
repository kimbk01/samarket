# Community Messenger Incoming Call SSOT

**Status:** structural contract (phase 1)  
**Scope:** 1:1 direct incoming call — ring, terminal, FCM wake, GET/Realtime merge  
**Out of scope:** group call media, Agora active-call UI, unrelated push types

This document is the single authority for **which `callId` may ring, show incoming UI, or be revived**.  
Implementation must converge on the APIs and rules below. Do not add ad-hoc guards in `GlobalCommunityMessengerIncomingCall.tsx`.

---

## 1. Ownership model (3 layers)

Every call is identified by **`callId` = `sessionId`** (UUID). Same room, new dial = **new callId**.

| Layer | SSOT | Owner module (target) | Rule |
|-------|------|------------------------|------|
| **Session** | DB `community_messenger_call_sessions.status` | Server + client session fetch | Authoritative server state, but **cannot override terminal latch** |
| **Terminal latch** | Web consumed + `hardClearedAt` + Native `DibayCallConsumedStore` | `call-state/call-terminal-tombstone.ts` | After terminal, same `callId` **never** returns to ringing |
| **Ring** | Android: `IncomingCallRingOwner` · Browser: `call-ring/call-ring-owner.ts` | Platform ring owner only | UI/FCM/GET **must not** start ring directly |

### Priority (conflict resolution)

```
terminal latch  >  session.status ringing  >  FCM wake  >  optimistic preview
```

If DB still says `ringing` but latch says terminal → **blocked** (`stale_ringing_blocked` / `incoming_ignored_consumed`).

---

## 2. FCM is a signal, not state

FCM types are **events**. They do not own call state.

| FCM `type` / `call_push_kind` | Meaning | Allowed client action |
|-----------------------------|---------|------------------------|
| `incoming_call` | Possible incoming — wake UI/refresh | Normalize → if not terminal → session insert / ring sync |
| `call_canceled` | Terminal: cancelled | `sealIncomingCallTerminal` / native terminal handler |
| `call_ended` | Terminal: ended | same |
| `call_rejected` | Terminal: rejected | same |
| `call_missed` / `missed_call` | Terminal: missed | same (+ optional missed notification) |

**Forbidden:** FCM handler directly calling WebAudio or `DibayForegroundRingtone` without ring owner + tombstone check.

Normalizer: `lib/community-messenger/call-events/fcm-call-event-normalizer.ts`

---

## 3. Allowed APIs (only two)

All incoming/terminal side effects must flow through:

### Incoming

```ts
syncIncomingCallRing(candidate: { sessionId, callKind, hardClearedAt, source } | null)
```

- Checks `canIncomingCallRing` / tombstone
- Android APK: **no WebAudio** (`ring_start_skipped_native_owner`)
- Browser: WebAudio via `call-ringtone-controller`

### Terminal

```ts
sealIncomingCallTerminal(callId, reason, hardClearedAt, source)
```

- Stops ring (Web + Native)
- Latches tombstone (Web + sync to Native)
- Does **not** navigate or render UI

Legacy wrappers (`dibayIncomingLaneStartRing`, `incoming-call/tombstone.ts`) delegate here until phase 2 removal.

---

## 4. Terminal rules

**Terminal reasons:** `cancelled`, `rejected`, `missed`, `ended`, `accepted` (consumed), `declined`

After terminal latch for `callId`:

| Action | Allowed |
|--------|---------|
| `ring_start` / WebAudio / native ring | **No** |
| Incoming banner / overlay | **No** |
| FCM `incoming_call` wake | **No** — normalize to `ignored` |
| GET `ringing` row merge | **No** — `stale_ringing_blocked` |
| Realtime INSERT/UPDATE ringing | **No** — filter via tombstone |
| New dial with **new** `callId` | **Yes** |

TTL: **120 seconds** (Web consumed, `hardClearedAt`, Native `DibayCallConsumedStore`).

---

## 5. Redial contract

- Redial **always** creates a **new** `sessionId` / `callId` on the server.
- Previous `callId` tombstone **must not** block a different `callId` in the same `roomId`.
- Recovery/routing guards (`shouldSkipActiveCallRecoveryRouting`, local terminal pin) must key on **`callId`**, not `roomId` alone.

---

## 6. Platform ring ownership

| Platform | Ring owner | Forbidden |
|----------|------------|-----------|
| Android APK (Capacitor) | `IncomingCallRingOwner` → `DibayForegroundRingtone` | WebAudio `playIncomingCallRingtone` |
| Browser / PWA | `call-ring-owner` → `call-ringtone-controller` | `stopNativeIncomingRingtone` / `markCallConsumed` for ring only |

---

## 7. File roles (target layout)

| Path | Role |
|------|------|
| `call-state/call-terminal-tombstone.ts` | Terminal latch SSOT API |
| `call-events/fcm-call-event-normalizer.ts` | FCM → incoming \| terminal \| ignored |
| `call-events/session-merge-guard.ts` | Block stale `ringing` rows after terminal |
| `call-ring/ring-owner.ts` | Ring start/stop (move from `incoming-call/`) |
| `call-bridge/native-consumed-bridge.ts` | Web ↔ Native tombstone hydrate |
| `GlobalCommunityMessengerIncomingCall.tsx` | Subscribe + render + delegate (no policy) |
| `CommunityMessengerCallClient.tsx` | Active call screen only (no incoming bell) |
| `DibayFirebaseMessagingService.java` | FCM receive → normalizer/handler |
| `IncomingCallTerminalHandler.java` | Native terminal SSOT |
| `IncomingCallRingOwner.java` | Native ring SSOT |
| `public/sw.js` | Web push adapter (chat + call wake); no ring |

---

## 8. Real-device QA matrix (A–G)

Run on **2 devices** after Vercel deploy + APK reinstall.  
Log filter: `DIBAY_CALL DIBAY_FCM DIBAY_INCOMING_CALL`

| ID | Scenario | PASS criteria |
|----|----------|---------------|
| **A** | Foreground receive → caller cancel | `ring_stop` then **no** same-`callId` `ring_start` |
| **B** | Foreground receive → callee accept | `accept_click` → **immediate** native `ring_stop` → active transition |
| **C** | Lock screen receive → caller cancel | `fcm:call_canceled` or terminal handler → `terminal_tombstone_mark` → `ring_stop` → activity finish |
| **D** | Cancel → wait 10s (no redial) | Same `callId`: no banner, no bell, no `incoming_received` |
| **E** | Redial (new call) | New `callId` `incoming_call` OK; old `callId` → `incoming_ignored_consumed` if replayed |
| **F** | End active call → redial | Previous `callId` recovery does not block new `callId` ringing |
| **G** | App resume after terminal | `native_consumed_hydrate` / `terminal_drained`; no banner/bell revival |

### Fail signatures (do not ship)

- Same `callId`: `ring_stop` then `ring_start`
- `incoming_received` after `terminal_tombstone_mark` for same `callId`
- Android log: WebAudio `ring_start` without `ring_start_skipped_native_owner`
- Redial blocked with **new** `callId` while old `callId` only is tombstoned

---

## 9. Phase plan

| Phase | Work |
|-------|------|
| **1 (current)** | This doc + contract tests + normalizers (no Global surgery) |
| **2** | Wire normalizers into Global/FCM/merge; shrink Global |
| **3** | Move modules to `call-state/`, `call-ring/`, `call-events/`; delete legacy wrappers |
| **4** | A–G PASS on 2 devices; changelog append |

---

## 10. Change log

| Date | Change |
|------|--------|
| 2026-06-17 | Initial SSOT — phase 1 structural contract |

# DIBAY Notification Sound — Silent Unlock HARD LOCK

**Status:** LOCK (2026-08-12)  
**Scope:** Audio unlock vs alert event playback boundary only. GATE 2 occurrence SSOT unchanged.

## Baseline

- **GATE 2 occurrence decision:** UNCHANGED — `notification-sound-decision.ts`
- **Alert-asset prime:** REMOVED — unlock uses dedicated silent source only
- **Route `/mypage` → unlock coupling:** REMOVED — unlock at `NotificationSoundLeaderBootstrap`
- **iOS Cap audible runtime:** NOT_PROVEN until device log confirms prime=0 on mypage entry

## NOTIFICATION SOUND HARD LOCK

1. **Route mount must never generate audible notification sound.**
2. **Audio unlock must be silent.**
3. **Unlock must not use alert assets.**
4. **Unlock is not a notification occurrence.**
5. **Unlock bypasses neither GATE 2 nor event authority** — it has no alert playback authority.
6. **Unread/badge state must not trigger sound.**
7. **Hydrate/poll must not trigger occurrence sound.**
8. **Only a canonical new event occurrence may request alert playback.**

## Authority

| Concern | Owner |
|---|---|
| Silent unlock (gesture, app lifetime) | `lib/notifications/notification-sound-unlock.ts` + `NotificationSoundLeaderBootstrap` |
| SSOT hydrate (route-gated, no audio) | `NotificationSoundPrime` |
| Occurrence PLAY/SKIP | `notification-sound-decision.ts` (GATE 2) |
| Alert playback | `notification-sound-engine.ts` (`[sound-event]`) |
| Tab leader / session horizon | `NotificationSoundLeaderBootstrap` + `ensureNotificationSoundRuntimeStarted` |

## Call graph (post-fix)

```text
APP BOOT (app/layout.tsx)
  -> NotificationSoundLeaderBootstrap
       -> ensureNotificationSoundRuntimeStarted()
       -> first user gesture -> unlockNotificationSoundAudio()
            -> AudioContext.resume() (silent)
            -> HTMLAudio silent data URI (muted, volume=0, discard)
            -> [sound-unlock] log (no eventId)

ROUTE /mypage (ConditionalAppShell)
  -> MessagingGlobalChrome
       -> NotificationSoundPrime (hydrate only, NO unlock, NO alert play)
       -> NotificationsBadgeRealtimeBridge (RT -> GATE 2 decision)

NEW RT EVENT
  -> ingestCanonicalNotificationSound / ingestNotificationEventRowSound
       -> decideNotificationSound (GATE 2)
       -> playEventNotificationSound
            -> [sound-event] log (eventKey, asset)
            -> new Audio(alert asset) — occurrence path only
```

## DO NOT (without reopen)

- Use `system_default`, `notification.wav`, or `resolveNotificationSound` in unlock path
- Restore route-gated alert-asset prime on `/mypage` or `startsWith("/my")`
- Mypage unread consume / mark-read / poll suppress to hide audible prime
- Tie unlock reset to logout unless full WebView recreation requires it
- `muted=false` or volume restore after silent unlock play
- iOS-only mute workaround branches for this defect

## Gate

```bash
vitest run lib/notifications/__tests__/notification-sound-silent-unlock-contract.test.ts \
  lib/notifications/__tests__/notification-sound-unlock.test.ts \
  lib/notifications/__tests__/notification-sound-hard-lock-contract.test.ts \
  lib/notifications/__tests__/notification-sound-decision.gate2.test.ts
```

## Observability

| Tag | Meaning |
|---|---|
| `[sound-unlock]` | Silent unlock only — no eventId |
| `[sound-event]` | Canonical alert playback — includes eventKey |

## iOS runtime proof (required for audible CLOSED)

```text
Scenario: unread exists -> home -> /mypage + first gesture
Expected: [sound-unlock] may appear; [sound-event] = 0; audible = 0

Scenario: new RT notification after unlock
Expected: [sound-event] eventKey=<new>; audible = 1

Scenario: duplicate same eventId
Expected: audible additional = 0
```

Until proven on Cap iOS: **iOS AUDIBLE RUNTIME = NOT_PROVEN**

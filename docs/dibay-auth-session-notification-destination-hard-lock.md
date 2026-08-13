# DIBAY Auth Session Persistence + Notification Destination HARD LOCK

**HARD LOCK DECLARED (2026-08-13).** Baseline incident: PHT 2026-08-13 15:57 community_comment.

## CONTRACT A — LOGIN SESSION

```
AUTHENTICATED USER MUST NOT BECOME GUEST
WITHOUT EXPLICIT LOGOUT OR PROVEN SERVER SESSION INVALIDATION.

AUTH LOADING / INITIALIZING / RECOVERING
MUST NEVER BE INTERPRETED AS UNAUTHENTICATED.
```

| Product phase | Meaning |
|---|---|
| `loading` | UNKNOWN / INITIALIZING — not guest |
| `recovering` | temporary recovery — not guest |
| `authenticated` | confirmed session |
| `terminal_guest` | explicit logout / confirmed guest |
| `corrupt` | proven terminal auth invalidation |

### Auth resolution gate (push / deep-link)

Owner: `components/push/PushRouteListener.tsx` → `resolvePushAuthGate`

| Phase | Auth-required destination |
|---|---|
| `authenticated` | navigate |
| `loading` / `recovering` | **hold** + `writePendingPushRoute` — **no login modal** |
| `terminal_guest` / `corrupt` | login sheet + pending path |

Replay: `subscribeSessionPhase` → `authenticated` → pending navigate (skip tap dedupe).

CTA surface: `requireAuthAction` calls `ensureSessionHealthy` when recovering before opening login.

## CONTRACT B — NOTIFICATION

```
ONE NOTIFICATION EVENT
HAS ONE CANONICAL DOMAIN,
ONE CANONICAL CATEGORY,
ONE CANONICAL DESTINATION.

BELL / INBOX / PUSH / DEEP LINK
MUST NOT INVENT THEIR OWN DESTINATIONS.

NOTIFICATION TAP
MUST ENTER THE REAL TARGET DIRECTLY.

WRONG ROUTE MUST NEVER BE MASKED
AS DELETED CONTENT OR AUTH FAILURE.
```

### Community comment / like

| Concern | Owner |
|---|---|
| Writer destination | `buildCommunityPostNotificationPath` → `/community/posts/:id` |
| Legacy heal | `canonicalizeLegacyCommunityPostNotificationPath` via `resolveSafeNotificationInternalRoute` |
| Bell presentation | `community_activity` (not `system_important`) |
| Surface badge | `notif_surface_community` |
| Push type | `community_comment` (not `system`) |
| Deep link | `dibay://community/post/:id` → `/community/posts/:id` |

### DO NOT (without reopen)

- Treat `loading` / `recovering` as guest for push/CTA
- Open AuthModal on push tap without terminal guest/corrupt
- Invent `/philife/posts/:id` (no app page — 404)
- Map `community_activity` → System badge / `system_important`
- Writer-local URL strings outside `buildCommunityPostNotificationPath`
- `setTimeout` / sleep auth “fixes”
- Alias-only page for `/philife/posts` while leaving writers poisoned

### Gates

```bash
npx vitest run lib/notifications/__tests__/auth-notif-root-fix-contract.test.ts lib/push/__tests__/ios-push-tap-route-contract.test.ts
```

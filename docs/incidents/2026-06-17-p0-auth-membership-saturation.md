# P0: Auth / Membership Saturation — Production Outage (2026-06-17)

**Status:** Production recovery **complete** (verified 2026-06-17)  
**Golden commit:** `eed6cbe7` — `fix: restore last known stable production state`  
**Golden tag:** `stable-20260617-11am` → `eed6cbe7`  
**Production URL:** `https://samarket.vercel.app`

---

## 1. Incident summary

On 2026-06-17 afternoon (local), DIBAY production entered a global degraded state: app shell rendered but primary surfaces (login, market, stores, community messenger, mypage) failed to load body content. Supabase and Vercel function saturation were observed.

**Primary root cause:** auth / membership / bootstrap path changes — not presence API logic alone.

**Secondary symptom:** `/api/community-messenger/presence` 504 errors appeared after Vercel function/memory saturation (downstream effect, not the initiating failure).

---

## 2. Failure chain

```
useClientMembershipState / SupabaseAuthSync / AuthSessionBoundary / guest-auth-state changes
  → duplicate session resolution on cold start
  → repeated /api/auth/session calls
  → repeated /api/me/profile?lite=1 calls
  → Vercel Function invocation / memory / timeout increase
  → Supabase timeouts
  → login auth UI not shown
  → trade / delivery / messenger / mypage body blocked
  → app shell only (global outage)
```

---

## 3. Recovery

### Recovery commit

Full tree restore to last known stable production state:

| Item | Value |
|------|-------|
| Commit | `eed6cbe7` |
| Tag | `stable-20260617-11am` |
| Branch | `main` |

### Recovery verification (Production)

**Infrastructure / API (confirmed):**

- `/api/auth/session` (no cookie): **401**, fast JSON (~200ms target), no Vercel timeout wait
- `/api/me/profile?lite=1` (no cookie): **401**, no timeout
- Android `server.url`: `https://samarket.vercel.app`
- No Vercel SSO login screen in app WebView
- DIBAY app home loads immediately

**Real-device checklist (confirmed PASS):**

1. Login screen displays
2. Trade (market) screen displays
3. Delivery (stores) screen displays
4. Messenger screen displays
5. Mypage screen displays
6. No Supabase timeout
7. No Vercel login screen

---

## 4. Do not restore (Auth / Membership hotfix series)

These commits and patterns must **not** be cherry-picked or restored as-is. Redesign under **Auth V2** on a separate branch.

| Banned restore targets |
|------------------------|
| `18b5ea8e` |
| `c36a922` |
| `1f766111` |
| `44e49a8e` |
| `auth-bootstrap-state` |
| `client-membership-viewer` |
| `guest bootstrap guard` |
| `optimistic member` |
| `login redirect loop guard` |
| `membership bootstrap retry` |

---

## 5. Recurrence prevention

### Branch policy

- **No direct work on `main`.** `main` holds only stable, deployable baseline.
- All changes on feature branches, e.g.:
  - `feature/recovery-phase1` (presence)
  - `feature/recovery-friendship`
  - `feature/recovery-call`
  - `feature/auth-v2`

### Cherry-pick recovery order (one commit at a time)

| Step | Domain |
|------|--------|
| 1 | Presence |
| 2 | Friendship |
| 3 | Call |
| 4 | Chat |
| 5 | UI |
| 6 | Market |
| 7 | Stores |
| 8 | Admin |
| 9 | Auth V2 (new design) |

**Per step gate:**

1. Cherry-pick **one** commit
2. `npx tsc --noEmit`
3. `npm run build`
4. Relevant tests
5. Vercel Preview deploy
6. Observability (route-level)
7. Android verification (when applicable)
8. **PASS → merge to `main`** | **FAIL → `git revert` on feature branch only**

### In-flight work (not merged at recovery time)

- `feature/recovery-phase1` @ `735aeee8` — presence hot path fix; **not merged** until Preview/automation gates pass.

---

## 6. API contracts (mandatory)

### `/api/auth/session`

- No auth cookie → **no Supabase call**; immediate **401**
- Target: **≤200ms**
- Must not wait until Vercel function timeout

### `/api/me/profile?lite=1`

- No auth cookie → immediate **401** or guest fallback
- Cookie fast-check **before** Supabase

### `/api/community-messenger/presence`

- Heartbeat **singleton**
- Interval **≥28s**
- `inFlight` guard
- 5xx/504 **backoff**
- Server soft timeout **2.5s** (avoid 504 at platform limit)

---

## 7. Deploy stop criteria (Observability)

**Halt deploy / rollback if any:**

| Signal |
|--------|
| `/api/auth/session` timeout |
| `/api/me/profile?lite=1` timeout |
| `/api/community-messenger/presence` **504** |
| Function timeout rate **≥1%** |
| Sudden Function **invocation spike** |
| Supabase timeout errors in client or logs |

---

## 8. Production complete criteria

All must hold on Production (`main` = Golden):

- Login UI visible
- Trade / delivery / messenger / mypage **body** visible
- No Supabase timeout
- No Vercel login screen in native app
- `/api/auth/session` healthy (fast 401 without cookie)
- Function timeout trend decreasing / stable

When satisfied: keep `eed6cbe7` Golden; continue **commit-by-commit** recovery on feature branches.

---

## 9. Change log

| Date | Event |
|------|-------|
| 2026-06-17 | P0 outage; restore to `eed6cbe7`; tag `stable-20260617-11am` |
| 2026-06-17 | Production real-device recovery verified; this document added |

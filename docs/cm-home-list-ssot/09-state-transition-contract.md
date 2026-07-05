# 09 — State Transition Contract

> **Version:** 2026-07-05 · Prevents entanglement of create / leave / refresh / realtime / bootstrap.

## State layers

| State | Layer | Meaning |
|-------|-------|---------|
| **MEMBER** | Membership (Server) | `left_at IS NULL`, `blocked_hidden_at IS NULL` |
| **LEFT** | Membership | leave / kick / block — **must not appear in list** |
| **NONE** | List presence | row ∉ chats ∪ groups |
| **ACTIVE** | List presence | row exists; server authoritative set includes id |
| **HIDDEN** | List policy (derive) | commerce 7d rule — `chat-room-list-lifecycle-policy.ts` |

## Invariant

```text
membership(LEFT)  ⇒  list(id) ∈ {NONE, HIDDEN*}
ACTIVE(list)      ⇒  MEMBER at last authoritative REPLACE
NONE              ⇒  PATCH intent cannot transition to ACTIVE
```

## List transition table

| Current (list) | Event | Next (list) | Allowed | Reducer intent |
|----------------|-------|-------------|---------|----------------|
| NONE | CREATE (server) | ACTIVE | ✔ | REPLACE / server ADD |
| NONE | CRITICAL_PATCH | NONE | ✔ | DROP unknown |
| NONE | ROOM_SUMMARY | NONE | ✔ | no-op (M1b) |
| NONE | RT_MESSAGE | NONE | ✔ | DROP |
| NONE | CACHE_RESTORE | NONE† | ✔ | DROP non-member |
| ACTIVE | MESSAGE | ACTIVE | ✔ | PATCH |
| ACTIVE | SUMMARY | ACTIVE | ✔ | PATCH |
| ACTIVE | CRITICAL_PATCH | ACTIVE | ✔ | PATCH existing only |
| ACTIVE | LEAVE (server) | NONE | ✔ | REMOVE / REPLACE |
| ACTIVE | BOOTSTRAP full | ACTIVE/NONE | ✔ | REPLACE |
| LEFT‡ | SUMMARY | NONE | ✔ | DROP |
| LEFT | MESSAGE | NONE | ✔ | DROP |
| **LEFT** | **CRITICAL_PATCH** | **NONE** | ✔ | **DROP — not ACTIVE** |
| LEFT | ROOM_SUMMARY | NONE | ✔ | DROP |
| LEFT | CACHE_RESTORE | NONE | ✔ | DROP |
| LEFT | BOOTSTRAP full | NONE | ✔ | REPLACE (server excludes) |
| LEFT | BOOTSTRAP full | ACTIVE | ✔ | only if server membership restored |

‡ LEFT = membership LEFT; list may still show ACTIVE briefly (bug window).  
† After membership filter on restore.

## Forbidden transitions (contract violations)

```text
LEFT  + CRITICAL_PATCH  →  ACTIVE     ❌  P0 (M1a target)
LEFT  + ROOM_SUMMARY     →  ACTIVE     ❌  P2 (M1b)
LEFT  + CACHE_RESTORE    →  ACTIVE     ❌  P4
ACTIVE + CLIENT_REMOVE   →  NONE       ⚠️  before server leave (To-Be forbid)
```

## Swipe-leave reappear sequence

```text
[ACTIVE, MEMBER]
  → LEAVE API → [LEFT, MEMBER→LEFT]
  → target [NONE, LEFT]

  → refresh(silent) → CRITICAL_PATCH (incoming id, base missing)
  → As-Is: newRooms → [ACTIVE, LEFT]   ← invariant break
  → To-Be: DROP      → [NONE, LEFT]   ← M1a
```

## Membership × list matrix

| Membership | List ACTIVE allowed? | How ACTIVE |
|------------|----------------------|------------|
| MEMBER | ✔ | server CREATE / REPLACE |
| LEFT | ❌ | — |
| NEVER | ❌ | server CREATE only |

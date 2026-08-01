# Phase 3-3 — Bell Lifecycle + Transition Matrix

**Status:** PASS (2026-08-01)  
**Authority:** `bell_transition_v1`  
**Code:** `lib/notifications/bell-lifecycle-transition-matrix.ts`  
**Runtime:** `.qa-logs/badge-ssot-phase3/bell-lifecycle-transition-runtime.json`

## Locked chain (once per event)

```text
Event create
  → Projection (bellTotal + Explain)
  → Writer (applyBellBadgeProjection)
  → Bell digit
  → Inbox unread
  → Destination (DeepLink)
  → Read
  → Event close
  → Bell −1
  → Explain == bellTotal
```

## Transition Matrix (Runtime-proven)

| Event | Bell | Inbox/Unread | Kind |
|-------|-----:|-------------:|------|
| General / Group / Trade / Customer / Owner message create | +1 | +1 | +1 kind |
| Trade Status / Order Status create | +1 | +1 | +1 kind |
| Missed Call create | +1 | +1 | missedCall +1 |
| System / Admin create | +1 | +1 | systemAdmin +1 |
| Mark-read / Missed clear | −1 | −1 | kind −1 |
| Poll / Reconnect / Realtime rebuild (no fact Δ) | 0 | 0 | 0 |

Missed Call: Bell row clears on read; call log retention is separate (documented).

## Coverage (26/26 PASS)

General · Group · Trade · Customer Order · Owner Order · Trade Status · Order Status · Missed create/clear · System · Admin · Mark-read aggregate · Poll · Reconnect · Realtime · Logout · Login

## Forbidden (held)

Badge · RoomUnread · create-policy change · Heal · Legacy delete · digit hacks · Product PASS / LOCK

## Next

Phase 3-4 Runtime Identity (Bell Digit ≡ Inbox ≡ Event ≡ Destination) — explicit start only

# Phase 2-3 — Badge Lifecycle + Transition Matrix

**Status:** PASS (2026-08-01) — Runtime `.qa-logs/badge-ssot-phase2/lifecycle-transition-runtime.json`  
**Authority:** `domain_badge_transition_v1`  
**Code:** `lib/notifications/badge-lifecycle-transition-matrix.ts`  
**Runtime:** `scripts/badge-lifecycle-transition-runtime.ts`

## Locked chain

```
Event
  → RoomUnread / orphan fact change
  → Projection (Domain Badge Authority rebuild)
  → Writer (applyNotificationBadgeProjection — Phase 2-2 THE commit)
  → Surface stores
  → User-visible digits
  → Explain Matrix == Projection (always)
```

Each lifecycle event must cause **one** Authority rebuild identity after the fact change — not a second competing Writer.

## Badge Transition Matrix (room units)

| Event | AppIcon | Bottom | Trade | Customer | Owner | Missed |
|-------|---------|--------|-------|----------|-------|--------|
| General first unread | +1 | +1 | 0 | 0 | 0 | 0 |
| Group first unread | +1 | +1 | 0 | 0 | 0 | 0 |
| Trade first unread | +1 | 0 | +1 | 0 | 0 | 0 |
| Customer order first unread | +1 | 0 | 0 | +1 | 0 | 0 |
| Owner order first unread | +1 | 0 | 0 | 0 | +1 | 0 |
| Additional msg same unread room | 0 | 0 | 0 | 0 | 0 | 0 |
| Mark-read clears room | −1 | −1 /0 | −1/0 | −1/0 | −1/0 | 0 |
| Leave (active unread group) | −1 | −1 | 0 | 0 | 0 | 0 |
| Orphan missed create | +1 | 0 | 0 | 0 | 0 | +1 |
| Orphan missed clear | −1 | 0 | 0 | 0 | 0 | −1 |
| Poll / reconnect / cold / FG / BG / RT rebuild (no fact Δ) | 0 | 0 | 0 | 0 | 0 | 0 |

## Lifecycle event coverage

| Event | How measured |
|-------|----------------|
| 신규 메시지 | first-unread append × domain |
| 읽음 | mark_read_atomic × domain |
| 메시지 삭제 | soft-delete appended msg; room set Δ0 (unread not auto-heal) |
| 방 삭제 | SKIP unsafe on shared prod; Fact loaders exclude `deleted_at` |
| Leave | participant `left_at` + leave-interval Case 2 |
| Trade 완료 | badge-visible ≡ mark_read_trade |
| Order 완료 | badge-visible ≡ mark_read customer/owner |
| Owner 변경 | role maps in Fact loaders (no separate Writer) |
| Missed Call 생성/종료 | orphan `notification_events` insert / clear |
| Logout / Login | client wipe → 0; boot rebuild Explain==Projection |
| Cold Start / FG / BG / Reconnect / Realtime / Poll | Authority rebuild noop |

## PASS criteria

| Criterion | Required |
|-----------|----------|
| Transition Matrix Runtime | each domain first-unread + additional + mark-read + leave + missed |
| Chain Explain == Projection after every event | always |
| Writer Authority still 1 | unchanged from 2-2 |
| No Heal / Bell / Native impl / Legacy delete | enforced |

## Explicitly not done

- Phase 2-4 Native Runtime identity
- Phase 3 Bell
- Phase 4 Legacy delete / Product PASS / LOCK

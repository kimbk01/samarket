# Phase 3-2 — Bell Writer Authority SSOT

**Status:** PASS (2026-08-01)  
**Authority:** `bell_writer_ssot_v1`  
**Code:** `lib/notifications/bell-writer-authority.ts`  
**Runtime:** `.qa-logs/badge-ssot-phase3/bell-writer-authority-runtime.json`

## Locked pipeline

```text
notification_events (eligible unread)
  → count + Bell Explain Matrix
  → Domain Projection.bell / bellTotal
  → commitCompleteProjectionSnapshot / applyNotificationBadgeProjection
  → patchNotificationBadgeCountSnapshot
  → applyBellBadgeProjection          ← THE Bell Commit Point (= 1)
  → notification-badge-count-store
  → Header Bell (resolveTier1HeaderBellBadgeTotal)
  → Inbox digit consumer
```

**Event insert SSOT:** `createNotificationEvent` only (pipelines are insert paths, not digit writers).

## Trigger audit (rebuild ≠ Authority)

| Trigger | Role |
|---------|------|
| Bootstrap | rebuild → same Apply |
| Realtime | rebuild → same Apply |
| Poll | dirty rebuild → same Apply |
| Read | ACK Apply → same Apply |
| Status | event insert + supersede → next Projection |
| Missed Call | event insert → next Projection |
| System/Admin | event insert → next Projection |
| Legacy | banned (Phase 4) |
| Fallback | logout clear → 0 only |

## Surface Writer Inventory

| Surface | Authority Writers | Commit |
|---------|------------------:|--------|
| event_insert | **1** | `createNotificationEvent` |
| bell_store | **1** | `applyBellBadgeProjection` |
| header_bell | **1** | store.total → Header |
| inbox_digit_consumer | **1** | same store / events Authority |

## PASS criteria (met)

| Criterion | Result |
|-----------|--------|
| Bell Commit Point = 1 | PASS (`applyBellBadgeProjection`) |
| Projection bypass 0 (product call-site) | PASS |
| Explain == bellTotal (×3 × triggers) | PASS |
| Badge / RoomUnread untouched | PASS |

## Explicitly not done

- Lifecycle / DeepLink / Role Runtime (Phase 3-3)
- Digit ↔ Inbox ↔ Destination identity (Phase 3-4)
- Legacy delete / Heal / Product PASS / LOCK

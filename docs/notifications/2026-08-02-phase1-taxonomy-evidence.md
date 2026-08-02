# Phase 1 — A/B/Owner Taxonomy Evidence (2026-08-02)

**Status:** Phase 1 COMPLETE (code + contract tests)  
**NOT declared:** HARD LOCK · RUNTIME PASS · PRODUCT PASS

## Dirty-25 reclassify

See `.qa-logs/badge-authority-rebuild/phase1/dirty-25-reclassify.md`

| Verdict | Count (tracked dirty focus) |
|---------|------------------------------|
| KEEP | A/B projection, orphan→AppIcon B, Tier1 A list, inbox missed skip, explain/writer |
| FIX (this phase) | `route.ts` legacy `mark_all_read` — exclude chat + missed + owner |
| Phase 4/5 | Hub multi-identity · Native multi-writer (out of dirty-25 wire) |

## Taxonomy SSOT

- `lib/notifications/badge-axis-taxonomy.ts` (`badge_axis_taxonomy_v1`)
- Tests: `lib/notifications/__tests__/badge-axis-taxonomy.test.ts`

## Formulas locked in tests

```
memberBellTotal = A
memberAppIconTotal = A + B_rooms(GD+Group+Trade+Customer) + orphan_missed
bottomChat = GD + Group unread rooms
owner ∉ member A/B/App Icon
```

## Phase 1 wire FIX

`app/api/me/notifications/route.ts` `mark_all_read` legacy `notifications` path now filters:
- owner store commerce
- in-app chat message rows
- missed_call (meta.kind / notification_type)

Events path already used `markNonChatNonOwnerNotificationEventsRead`.

## Vitest (Phase 1 bundle)

```
badge-axis-taxonomy.test.ts
chat-notification-attention-projection.test.ts
apply-badge-count-orphan-missed-wire.test.ts
resolve-tier1-bell-surface.test.ts
inbox-events-merge-regression.test.ts
store-order-badge-role-surface-contract.test.ts
→ 58 passed
```

## Next (no ask)

Phase 2 — A Notification Lifecycle (create · read · delete · mark-all · delete-all · push tap).

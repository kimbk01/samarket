# Phase 4-2 Batch A — Proven-zero-impact Cleanup

**Declared:** 2026-08-01  
**Principle:** Delete only after product impact = 0 proven. Not “can delete → delete.”

## Gates (all required)

| Gate | Pre | Post |
|------|-----|------|
| Caller = 0 | PASS | PASS |
| Import = 0 | PASS | PASS |
| Runtime reachability = 0 (`.next` JS + APK assets) | PASS | PASS |
| Xiaomi / Samsung / Web regression = 0 | PASS | PASS |

## Deleted

| ID | Item |
|----|------|
| A1 | `lib/notifications/heal-messenger-badge-derived-from-participants.ts` |
| A2 | `lib/notifications/heal-trade-store-order-badge-derived-from-participants.ts` |
| A3 | `lib/notifications/heal-stale-owner-order-intake-notification-events.ts` |
| — | `lib/notifications/__tests__/heal-trade-store-order-badge-contract.test.ts` |
| — | owner-attention test case that required A3 file |
| A5 | `isLegacyInboxCompatActive` (+ sunset const) — adapter `legacyNotificationsSelect` **kept** |
| A6 | `lib/chat-domain/ports/domain-bootstrap-shadow-bridge.ts` (entire orphan file) |

## Forbidden (untouched)

- `notification_targets`
- `countNotificationUnreadSegmentedLegacy` / LIVE fallbacks
- Engine shadow
- Phase8/9
- RoomUnread / Badge / Bell Authority adapters

## Runtime evidence

| Artifact | Result |
|----------|--------|
| `.qa-logs/badge-ssot-phase4/batch-a-web-authority-pre.json` | appIcon=32 · bell=2 |
| `.qa-logs/badge-ssot-phase4/batch-a-web-authority-post.json` | appIcon=32 · bell=2 (delta 0) |
| `.qa-logs/badge-ssot-phase4/batch-a-device-identity-pre.log` | Xiaomi+Samsung PASS |
| `.qa-logs/badge-ssot-phase4/batch-a-device-identity-post.log` | Xiaomi+Samsung PASS · appIcon=32 |
| `.qa-logs/badge-ssot-phase4/batch-a-bell-identity-pre.log` | Bell identity 28/28 PASS |
| `.qa-logs/badge-ssot-phase4/batch-a-vitest-post.log` | 25/25 PASS |

## Status

| Step | Status |
|------|--------|
| 4-2 Batch A | **PASS — DELETED** |
| 4-2 Batch B+ | WAIT (after this Runtime PASS) |
| 4-3 Final Product Validation | NOT STARTED |
| PRODUCT PASS | NOT DECLARED |

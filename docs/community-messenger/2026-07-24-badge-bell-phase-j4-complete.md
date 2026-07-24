# Phase J4 — Unused Badge Path Removal

**Status:** `PASS — PHASE J4 UNUSED BADGE PATH REMOVAL VERIFIED` (승인)  
**Inventory:** `2026-07-24-badge-bell-phase-j4-inventory.md`  
**Residual review:** `2026-07-24-badge-bell-phase-j-residual-review.md`  
**Date:** 2026-07-24

## Deleted (no replacement stubs)

| Item |
|------|
| `hooks/useMyNotificationUnreadCount.ts` |
| `hooks/useOwnerCommerceNotificationUnreadCount.ts` |
| `hooks/useNotificationBadgeCount.ts` |
| `resolveTier1InboxBellLegacyUnreadUrl` |
| `getRoomMissedCallBadgeCount` / `clearRoomMissedCallBadge` |
| `scheduleDomainBadgeSurfaceResync` |
| `resyncNotificationBadgeAuthorityFromBadgeCount` (+ dead inflight state) |

## Preserved (D / B)

- `applyNotificationBadgeProjection` · surface publish · NativeBadgeSync · 45s Domain apply
- `resolveTier1BellUnreadFetchUrl` (API contract tests)
- room missedCall publish/subscribe/snapshot

## Explicit non-goals

- No new compatibility hooks
- No formula / poll / Push-sound / list changes
- **No automatic Phase J LOCK** — residual inventory review required

## Gates

| Gate | Result |
|------|--------|
| verify:badge-import-ban | PASS |
| Bell / Bottom / App Icon / shell tests | PASS (64) |
| npx tsc --noEmit | PASS |
| npm run lint | PASS |
| npm run build | PASS |

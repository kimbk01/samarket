# Phase J2a — Legacy surface badge poll removal

**Status:** `PASS — PHASE J2A LEGACY SURFACE BADGE POLL REMOVAL VERIFIED`  
**Parent:** J2 inventory `2026-07-24-badge-bell-phase-j2-poll-inventory.md`  
**Date:** 2026-07-24

## Scope done

| Change | Result |
|--------|--------|
| Stores home placeholder | digit 제거 (skeleton only) — Domain Bell은 Anchor 로드 후 |
| Philife | surface store subscribe / refresh / `refreshActiveSurface…` 제거 |
| Realtime bridge / MessagingGlobalChrome | surface poll reconcile·refresh 제거 · `KASAMA` list 유지 |
| `notification-unread-badge-store.ts` | **실삭제** |
| Hooks | J4 stub (poll 없음 · 제품 호출 0 유지) |

## Explicitly untouched

- Notification **list** 75s (`MyNotificationsView`, `OwnerNotificationList`, admin lists) + `NOTIFICATION_SYNC_POLL_MS` 상수
- Domain **45s** badge-count poll
- Hub **180s** room-count poll
- Bell / Bottom / App Icon formulas · Target writer · Push/Sound

## Call-0 / import-ban

```bash
npm run verify:badge-import-ban
# bans: notification-unread-badge-store, getSurfaceNotificationUnreadStore,
#       refreshActiveSurfaceNotificationUnreadStores, reconcileTier1BellSurfacePolling, …
```

Product scan for deleted APIs: **0 matches**.

## Gate results

| Gate | Result |
|------|--------|
| verify:badge-import-ban | PASS |
| npx tsc --noEmit | PASS |
| npm run lint | PASS |
| npm run build | PASS |
| Bell / Bottom / App Icon tests | PASS (44) |
| list `NOTIFICATION_SYNC_POLL_MS` still wired | PASS |

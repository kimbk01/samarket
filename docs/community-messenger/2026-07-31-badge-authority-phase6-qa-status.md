# Badge Authority — Phase 6 Runtime QA Status (2026-07-31)

**Start HEAD:** `90e7725a64e66c396ab9a2eab824839b146eb6e9`  
**Product decision:** LOCK 유지 (숫자 강제 동등 금지).

## Verdict (this slice)

| Gate | Result |
|------|--------|
| CODE PASS | **PASS** — unit/contract tests for atomic App Icon, surface writers, deep-link alignment |
| RUNTIME PARTIAL | **YES** — device scenarios not executed in this agent session |
| PLATFORM BLOCKED | Android APK / iOS build / Production SHA install parity **not run** here |
| NOTIFICATION / BADGE AUTHORITY PRODUCT PASS — LOCK | **NOT DECLARED** |

## Required before Product PASS

Per user runbook — each platform ×3:

- General / Group / Trade / Order / Bell / Push-Native matrices
- cold / warm / resume / kill / multi-device
- App Icon = FCM `badge_count` = APNS `aps.badge` = `Badge.set(appIconTotal)`
- flicker log: EMPTY→cache→bootstrap→RT→ACK with generation metadata

## Static evidence already green

```bash
npx vitest run \
  lib/notifications/__tests__/app-icon-runtime-authority.test.ts \
  lib/notifications/__tests__/badge-authority-surface-writer-contract.test.ts \
  lib/notifications/__tests__/app-icon-domain-authority-j3.test.ts \
  lib/notifications/__tests__/bell-app-icon-separation.test.ts \
  lib/push/__tests__/resolve-push-route-from-fcm-data.test.ts
```

## Code fixes covered without device

1. Atomic App Icon complete snapshot (no shell/missedCall double emit)
2. Auth epoch + stale factsVersion reject
3. NativeBadgeSync duplicate same-total skip
4. Logout resets App Icon surface epoch
5. Bell trade href → CM room (align FCM)
6. FCM group → `/group-chat/:id` (align Bell registry)

# Phase J3 — App Icon Legacy Authority Removal

**Status:** `PASS — PHASE J3 APP ICON LEGACY AUTHORITY REMOVAL VERIFIED` (gates below)  
**Inventory:** `2026-07-24-badge-bell-phase-j3-app-icon-inventory.md`  
**Date:** 2026-07-24

## Done

| Item | Result |
|------|--------|
| Push `badge_count` | Domain `appIconTotal` |
| Campaign push badge | Domain `appIconTotal` |
| order-chat `nativeBadgeTotal` | Domain `appIconTotal` (`nextBadgeTotal` = bellTotal) |
| notify-read warm | Domain `fetchDomainBadgeAuthorityPayload` |
| `fetchNotificationBadgeCount` | **deleted** |
| half-publish Nav/AppIcon | **deleted** |
| `applyNotificationBadgeCountFromReadResponse` | **deleted** |
| NativeBadgeSync | unchanged — Domain surface only |
| logout clear 0 | unchanged |

## Untouched (forbidden)

- appIconTotal / Bell / Bottom formulas · Target writer · Domain loader  
- list 75s · Domain 45s · Hub 180s · Push sound/banner · J4 hooks  

## Gates

| Gate | Result |
|------|--------|
| verify:badge-import-ban | PASS |
| app-icon-domain-authority-j3 + related | PASS (53 tests in suite) |
| Bell / Bottom / App Icon separation | PASS |
| npx tsc --noEmit | PASS |
| npm run lint | PASS |
| npm run build | PASS |

# Phase 5 — Native Single Writer + Device Evidence (2026-08-02)

**Status:** CODE PASS · DEVICE BASELINE ONLY  
**NOT declared:** HARD LOCK · RUNTIME PASS · PRODUCT PASS

## Native writer contract (code)

Authority digit = Domain `appIconTotal` only.

| Echo path | Role |
|-----------|------|
| `NativeBadgeSync` → `syncNativeBadgeCount` | Capawesome Badge.set/clear (cache echo) |
| `DibayAppIconDelivery.apply` | Android summary `setNumber` / iOS `setBadgeCount` |
| FCM/APNs `badge_count` | Payload echo of same projection total |
| Domain tray children | `setNumber(0)` — no launcher authority |

Tests: `badge-native-runtime-identity`, `android-app-icon-summary-carrier-contract`, `native-badge-sync-after-projection-commit`, `badge-writer-authority`.

## Device baseline

Path: `.qa-logs/badge-authority-rebuild/phase5/native-1785651295/`

| Device | ID | Cap badge prefs |
|--------|-----|-----------------|
| Xiaomi | `8b37179f7d94` | 22 |
| Samsung | `RFCY40PY2CA` | 16 |
| iPhone | `00008120-000025C826F3C01E` (connected) | SpringBoard digit not dumped this run |

## Gap to HARD LOCK candidate

3-device **increase and decrease** lifecycle (A notify/read/delete · B room read) still **NOT COMPLETE**.  
Per product rule: do not declare BADGE AUTHORITY HARD LOCK until that evidence exists.

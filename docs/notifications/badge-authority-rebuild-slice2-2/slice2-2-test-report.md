# Slice 2-2 Test Report

**Date:** 2026-08-03  
**Base HEAD:** `ca86a20c1` (Slice 2-1)  
**origin/main:** `1e2a560c1`

## Suites

| Suite | Result |
|-------|--------|
| Phase 1 + Slice 2-1 + A projection + tier1 bell | **80 PASS** (6 files) |
| `verify:badge-authority-rebuild-isolation` | **PASS** |

## Contract coverage (unit)

- owner_intake / chat / missed / marketing / unknown ∉ Bell A
- trade_status / order_status / admin_notice / security_alert ∈ A when eligible
- individual read ↓ ; re-read idempotent
- mark-all A → 0 ; B/C rows not counted
- dismiss unread A ↓ ; dismiss read A no change
- inbox list filter keeps read A, drops chat/owner/unknown
- `bellTotal` = `memberUnreadNotificationCount`; App Icon keeps `notificationAttentionTotal`

## Gates

| Gate | Result |
|------|--------|
| vitest (badge-authority-rebuild + tier1 bell) | **80 PASS** |
| `npx tsc --noEmit` | **PASS** |
| eslint (touched files) | **PASS** |
| `npm run build` | **PASS** (prior run exit 0) |

## Not claimed

- Device RUNTIME PASS
- PRODUCT PASS / HARD LOCK
- App Icon formula change

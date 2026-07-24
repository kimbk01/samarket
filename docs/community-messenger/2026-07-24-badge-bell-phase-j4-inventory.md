# Phase J4 — Unused Badge Path Classification

**Date:** 2026-07-24  
**Rule:** 이름 말고 호출 그래프 + 입력 Authority로 판정. stub 신규 금지.

## A. 제품 호출 0 + inert → 삭제

| Symbol / path | Evidence |
|---------------|----------|
| `hooks/useMyNotificationUnreadCount.ts` | J2a inert stub · import 0 |
| `hooks/useOwnerCommerceNotificationUnreadCount.ts` | J2a inert stub · import 0 |
| `hooks/useNotificationBadgeCount.ts` (+ Total) | product import 0 |
| `resolveTier1InboxBellLegacyUnreadUrl` | product/test call 0 |
| `getRoomMissedCallBadgeCount` / `clearRoomMissedCallBadge` | export only · canary uses publish/subscribe/snapshot |
| `scheduleDomainBadgeSurfaceResync` | product call 0 |
| `resyncNotificationBadgeAuthorityFromBadgeCount` | only called by schedule… (dead chain) |

## B. 호출 0 · 테스트/API 계약 → 유지 (삭제 금지)

| Symbol | Why |
|--------|-----|
| `resolveTier1BellUnreadFetchUrl` | API `unread_count_only&badge_surface` 계약 테스트 |
| `countNotificationEventsBadge` | Domain HTTP `categoryCounts` 입력 (App Icon SSOT 아님) |

## C. 제품 호출 있음 → J4 삭제 금지

| Symbol | Role |
|--------|------|
| `inbox-read-bridge` dual-write | PATCH notifications (non-App Icon) — Phase J residual, not J4 |
| list 75s / Domain 45s / Hub 180s | poll keepers |

## D. Active Domain 전달 → 유지

| Symbol | Authority in |
|--------|--------------|
| `applyNotificationBadgeProjection` | Projection |
| `publishDomainBadgeShellToSurfaceStore` / missedCall publish | Domain shell → App Icon surface |
| `NativeBadgeSync` | surface.appIconTotal |
| `applyAuthorityJsonAsProjection` + badge-count store 45s | Domain HTTP → Apply |
| `publishRoomMissedCallBadgeByRoom` + subscribe/snapshot | canary room map (not App Icon formula) |
| `requestNotificationBadgeCountResync` | Domain badge-count force |

## Out of scope

Bell/Bottom/App Icon formulas · Target writer · Push/Sound/list · atomic read · new compatibility hooks

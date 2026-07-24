# Phase J3 — App Icon Legacy Authority Inventory

**Status:** INVENTORY → implementation in same slice (approved)  
**Date:** 2026-07-24  
**Parent LOCK:** Badge/Bell Domain Authority LOCKED · J2a PASS

## Authority split (must hold)

| Path | Role | Verdict |
|------|------|---------|
| `projection.appIconTotal` / `resolveDomainAppIconBadgeCount` | **sole product number** | KEEP |
| `NativeBadgeSync` → `syncNativeBadgeCount(n)` | bridge; input = Domain surface `appIconTotal` | KEEP |
| `clearNativeBadgeCount` on logout | set 0 | KEEP |
| Foreground / resume / session | re-deliver same Authority (subscribe Domain surface) | KEEP (not new formula) |
| FCM/APNs `badge_count` via `fetchNotificationBadgeCount` (events SUM) | **competing OS icon writer** | **REPLACE → Domain appIconTotal** |
| `order-chat` `nativeBadgeTotal: badge.total` (events) | competing API field | **REPLACE → Domain** |
| `notify-read-service` await events SUM (return unused) | wrong warm after invalidate | **REPLACE → Domain warm** |
| `publishDomainBadgeShellToAppIcon` / `…ToNav` | half-publish | call-0 → **DELETE** |
| `applyNotificationBadgeCountFromReadResponse` | legacy events patch | tests only → **DELETE** |
| `fetchNotificationBadgeCount` | events SUM helper | product → 0 then **DELETE** |
| `countNotificationEventsBadge` | Domain HTTP payload categoryCounts input | KEEP (Bell non-chat / diagnostics inside Domain builder — not App Icon SSOT) |
| J4 inert hooks | out of scope | leave |

## Triggers → same input

```
Push dispatch badge_count  ──┐
NativeBadgeSync subscribe  ──┼──► Domain appIconTotal only
room-read / read-thread    ──┤
order-chat nativeBadge     ──┤
logout clear               ──┘──► 0
```

DO NOT: events SUM, Bell `total`, path-local recount.

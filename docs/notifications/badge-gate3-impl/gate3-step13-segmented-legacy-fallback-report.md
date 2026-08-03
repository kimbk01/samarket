# Gate 3 Step 13 — Segmented Legacy Fallback 제거 + 최종 정적 검증

**판정 목표:** `SEGMENTED LEGACY FALLBACK CODE PASS` + static gates PASS  
**선언 금지 유지:** Badge Authority 전체 CODE PASS · Runtime · Product · Hard Lock · Live Production Cutover READY

## 목표

Canonical Authority가 legacy segmented `public.notifications` COUNT fallback 없이  
A / B / C / App Icon / Notification Center / Push 를 유지한다.

## DELETE

| 경로 | 조치 |
|------|------|
| `countNotificationUnreadSegmentedLegacy` | **DELETE** |
| RPC-miss → `notifications` head COUNT | **DELETE** (throw) |
| Nested deprecated helpers (`countOwnerStoreCommerceUnreadServer` 등) | **DELETE** (file-local only callers) |

## KEEP (non-authority / measure)

| 경로 | 역할 |
|------|------|
| `count_notification_unread_segmented` RPC | measure / compat `unread_count_only` without `badge_surface` — fail closed if missing |
| `badge_surface` → notification_targets | Tier1 surface unread |
| Owner snapshot | owner commerce unread |
| `/api/me/notifications/badge-count` | Product A+B App Icon / Bell |

## Product independence proof

- `build-domain-badge-authority-http.ts` — no segmented import
- `notification-badge-count-store.ts` — badge-count only
- Tier1 unread URL — `badge_surface` only

## Static gate results (this step)

| Gate | Result |
|------|--------|
| Step13 + authority vitest (127) | PASS |
| `verify:badge-authority-rebuild-isolation` | PASS |
| `verify:badge-target-policy` | PASS |
| `verify:badge-domain-authority` | PASS |
| `verify:badge-import-ban` | PASS |
| `npx tsc --noEmit` | PASS |
| `npm run lint` | PASS |

## 판정

**SEGMENTED LEGACY FALLBACK CODE PASS**  
**AUTHORITY REBUILD STATIC GATES PASS** (badge-scoped)

**Not declared:** Badge Authority CODE PASS · Runtime · Product · Hard Lock · Live Production Cutover READY

## Next (order locked)

Live Production Dry-run → Backfill → Deploy → Native builds → 3-device Runtime → HARD LOCK

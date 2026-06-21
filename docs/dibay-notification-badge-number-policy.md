# DIBAY 알림·배지 숫자 정책 (P0.1)

P0 구조 SSOT는 `notification_events` + `notification_targets` 이중 축을 유지한다.  
**표면마다 숫자가 다를 수 있으며, 그것이 정상**이다.

## 1. App icon badge (네이티브)

| 항목 | 정의 |
|------|------|
| 소스 | `GET /api/me/notifications/badge-count` → `notification_events` unread (`read_at IS NULL`) |
| 합산 | `total` — chat/group/trade/order/delivery/community_activity/**admin_notice**/missed_call |
| 제외 | `admin_marketing_banner` (`badgeEnabled: false`) |
| 동기화 | `NativeBadgeSync` — Capacitor native only |

## 2. BottomNav 탭 badge

| 탭 (`icon`) | `notification_events` 슬라이스 |
|-------------|----------------------------------|
| `chat` (메신저) | `chat_message` + `group_message` |
| `community` (Philife) | **`community_activity` only** (P0.1 — `admin_notice` 제외) |
| `trade` | 항상 **0** (`notif-0002`) |
| `stores` | `order_status` + `delivery_status` (+ owner policy) |

- Primary: `notification_events` 스냅샷
- Fallback: owner-hub breakdown (events 스냅샷이 **한 번이라도 있으면** hub가 primary를 덮지 않음)

## 3. Tier1 bell (헤더 종)

| surface | 소스 |
|---------|------|
| `tier1_inbox_bell` (기본·마이 등) | `notification_targets` surface count **+** `notification_events.admin_notice` 보조 (P0.1) |
| `bottom_nav_chat` | `notification_targets` — 메신저 탭과 동일 축 |
| `bottom_nav_community` | `notification_targets` — Philife 커뮤니티 활동만 (admin_notice 미포함) |
| `bottom_nav_delivery` / `bottom_nav_my` | 각 surface별 `notification_targets` |
| `owner_commerce_inbox` | 매장 오너 commerce targets |

- surface 간 **합산 금지** — pathname 기준 단일 surface만 표시
- 인박스 목록 fetch 옵션은 surface별 `resolveTier1BellListFetchOpts` 따름

## 4. Admin banner (foreground)

| 항목 | 정의 |
|------|------|
| feed | `GET /api/me/notifications/admin-banner-feed` — unread `admin_marketing_banner` / `admin_notice` |
| dismiss truth | **서버 `read_at`** — `postNotificationEventOpenedRead` 성공 후에만 UI 제거 |
| cooldown | localStorage display throttle (5분) — read truth 아님 |
| 통화 중 | `DibayBottomNotificationBanner` suppress |

## 5. 숫자가 달라도 되는 경우 (의도)

| 예시 | 이유 |
|------|------|
| App icon > Tier1 bell | app icon은 `notification_events.total`; bell은 targets + admin_notice 보조만 |
| App icon > community 탭 | community 탭은 `community_activity`만 |
| Tier1 bell ≠ BottomNav chat | bell surface가 `tier1_inbox_bell`일 때 targets 집계가 chat 탭 slice와 다름 |
| marketing 배너 | foreground 배너만, tab/app badge total 제외 |

## 6. 변경 금지 (P0 CLOSE)

- `notification_events` badge/read SSOT
- room visible read / same-room foreground suppress
- incoming_call_signal ↔ missed_call 분리
- order_status/delivery_status read
- BottomNav chat = chat_message + group_message
- owner-hub fallback 격리
- Admin campaign → `createAndDispatchNotificationEvent` 단일 경로

## 7. P0.1 변경 이력

- **2026-06-22**: `admin_notice`를 Philife 하단탭 배지에서 제거 → Tier1 `tier1_inbox_bell` 보조 합산
- **2026-06-22**: Admin banner dismiss — read 성공 후에만 숨김 (세션 dismiss truth 제거)

## 관련 코드

- BottomNav: `lib/chats/use-owner-hub-badge-total.ts`
- Tier1 bell supplement: `lib/notifications/tier1-admin-notice-bell-supplement.ts`
- App icon: `components/push/NativeBadgeSync.tsx`
- 규정: `lib/notifications/samarket-messenger-notification-regulations.ts` (`notif-0002`)
- badge targets: `lib/notifications/badge-target-policy.ts` (`badge-target-0001`)

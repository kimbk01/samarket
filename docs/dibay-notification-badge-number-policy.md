# DIBAY 알림·배지 숫자 정책 (Rebuild Authority)

P0 구조 SSOT는 `notification_events` + `notification_targets` 이중 축을 유지한다.  
**표면마다 숫자가 다를 수 있으며, 그것이 정상**이다.

> **폐기:** Chat 탭 = `chat_message`+`group_message` event SUM · Trade 탭 항상 0 (`notif-0002` 구 조항).  
> Rebuild와 혼용 금지.

## 1. App icon badge (네이티브)

| 항목 | 정의 |
|------|------|
| 소스 | `GET /api/me/notifications/badge-count` → `notification_events` unread (`read_at IS NULL`) |
| 합산 | `total` — chat/group/trade/order/delivery/community_activity/**admin_notice**/missed_call (**event 건수 SUM**) |
| 제외 | `admin_marketing_banner` (`badgeEnabled: false`) |
| 동기화 | `NativeBadgeSync` — Capacitor native only |
| 비고 | **BottomNav Chat과 단위가 다를 수 있음** (Chat=room count, App icon=event total) |

## 2. BottomNav 탭 badge (Rebuild)

| 탭 (`icon`) | Authority | 단위 |
|-------------|-----------|------|
| `chat` (메신저) | owner-hub / `bottom_nav_chat` (`communityMessengerUnread`) | 일반 1:1 + 그룹 **unread room** count |
| `trade` | `notification_events` `trade_message` + `trade_status` | Trade에서 볼 수 있는 unread **원인 수** |
| `community` (Philife) | `community_activity` only (`admin_notice` 제외) | Community 원인 수 |
| `stores` | `order_status` + `delivery_status` (+ owner policy) | Delivery/주문 원인 수 |

- Chat **금지**: `notification_events` chat/group message SUM을 Chat 탭에 사용
- Chat list `kind=all`: trade / delivery room 제외 (일반 1:1 + 그룹만)
- Trade / Delivery / Community unread를 Chat 탭·리스트에 **혼합 금지**
- Primary(Chat): hub room/target count — events 스냅샷으로 Chat 숫자를 덮지 않음

## 3. Tier1 bell (헤더 종)

| surface | 소스 |
|---------|------|
| `tier1_inbox_bell` (기본·마이 등) | `notification_targets` surface count **+** `notification_events.admin_notice` 보조 |
| `bottom_nav_chat` | `notification_targets` — Chat 탭과 동일 **room/target** 축 |
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
| App icon ≠ BottomNav Chat | App icon = event total; Chat = unread room count |
| App icon > community 탭 | community 탭은 `community_activity`만 |
| Chat row ≠ Chat 탭 | row = room message unread; 탭 = unread room 수 |
| marketing 배너 | foreground 배너만, tab/app badge total 제외 |

## 6. 변경 금지 / Rebuild 락

- `notification_events` badge/read SSOT (App icon total)
- room visible read / same-room foreground suppress
- incoming_call_signal ↔ missed_call 분리
- order_status/delivery_status read
- **BottomNav chat = unread room count** (event SUM 복귀 금지)
- **Trade tab badge = trade causes** (항상 0 복귀 금지)
- Sound SSOT registry/resolver 본체 · Admin sound 설정 임의 수정 금지
- Admin campaign → `createAndDispatchNotificationEvent` 단일 경로

## 7. 변경 이력

- **2026-06-22**: `admin_notice`를 Philife 하단탭 배지에서 제거 → Tier1 `tier1_inbox_bell` 보조 합산
- **2026-06-22**: Admin banner dismiss — read 성공 후에만 숨김 (세션 dismiss truth 제거)
- **2026-07-08**: Rebuild Authority — Chat = room count; Trade badge 재도입; Chat event SUM 폐기

## 관련 코드

- BottomNav: `lib/chats/use-owner-hub-badge-total.ts`
- Chat tab: `lib/notifications/messenger-chat-tab-badge.ts`
- 규정: `lib/notifications/samarket-messenger-notification-regulations.ts` (`notif-0002` Rebuild)
- Tier1 bell supplement: `lib/notifications/tier1-admin-notice-bell-supplement.ts`
- App icon: `components/push/NativeBadgeSync.tsx`
- badge targets: `lib/notifications/badge-target-policy.ts` (`badge-target-0001`)

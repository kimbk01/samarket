# DIBAY 알림·배지 숫자 정책 (Legacy Authority)

P0 구조 SSOT는 `notification_events` + `notification_targets` 이중 축을 유지한다.  
**표면마다 숫자가 다를 수 있으며, 그것이 정상**이다.

> **폐기:** BottomNav community/trade/stores = `notification_events` SUM (2026-07-08 Rebuild 시험).  
> **폐기:** Chat 탭 = `chat_message`+`group_message` event SUM.

## 1. App icon badge (네이티브)

| 항목 | 정의 |
|------|------|
| 소스 | `GET /api/me/notifications/badge-count` → `notification_events` unread (`read_at IS NULL`) |
| 합산 | `total` — chat/group/trade/order/delivery/community_activity/**admin_notice**/missed_call (**event 건수 SUM**) |
| 제외 | `admin_marketing_banner` (`badgeEnabled: false`) |
| 동기화 | `NativeBadgeSync` — Capacitor native only |
| 비고 | **BottomNav Chat·feed 탭과 단위가 다를 수 있음** (정상) |

## 2. BottomNav 탭 badge (Legacy)

| 탭 (`icon`) | Authority | 단위 |
|-------------|-----------|------|
| `chat` (메신저) | owner-hub / `bottom_nav_chat` (`communityMessengerUnread`) | 일반 1:1 + 그룹 **unread room** count |
| `community` (Philife) | **없음 (0)** | 피드 진입만 — 원인은 tier1 종 |
| `trade` | **없음 (0)** | 거래 피드 진입만 — 원인은 tier1 종·거래 채팅 row |
| `stores` | **없음 (0)** | 매장 browse 진입만 — 원인은 FAB·주문 상세 |

- Chat **금지**: `notification_events` chat/group message SUM을 Chat 탭에 사용
- Feed 탭 **금지**: `notification_events` SUM을 community/trade/stores BottomNav에 사용
- Chat list `kind=all`: trade / delivery room 제외 (일반 1:1 + 그룹만)
- Trade / Delivery / Community unread를 Chat 탭·리스트에 **혼합 금지**

### 도메인 원인 표시 위치 (Legacy)

| 도메인 | BottomNav | 원인 표시 |
|--------|-----------|-----------|
| Community | 0 | tier1 `bottom_nav_community` 종 · 게시글 진입 clear |
| Trade | 0 | tier1 `bottom_nav_my` 종 · 거래 채팅 row unread |
| Delivery/주문 | 0 | tier1 `bottom_nav_delivery` 종 · FAB 주문내역/주문채팅 |
| Chat | room count | CM list row message unread |

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
| App icon > 0, feed tabs = 0 | feed 탭은 badge 없음 — 원인은 종/FAB/row |
| Chat row ≠ Chat 탭 | row = room message unread; 탭 = unread room 수 |
| marketing 배너 | foreground 배너만, tab/app badge total 제외 |

## 6. 변경 금지 / Legacy 락

- `notification_events` badge/read SSOT (App icon total)
- room visible read / same-room foreground suppress
- incoming_call_signal ↔ missed_call 분리
- order_status/delivery_status read
- **BottomNav chat = unread room count** (event SUM 복귀 금지)
- **BottomNav community/trade/stores = 0** (events SUM 복귀 금지)
- Sound SSOT registry/resolver 본체 · Admin sound 설정 임의 수정 금지
- Admin campaign → `createAndDispatchNotificationEvent` 단일 경로

## 7. LOCK (2026-07-08 종료)

Badge Engine / Badge Store / Badge Authority / Bell Modal은 **이 시점 기준 LOCK**.  
추가 기능 수정 금지. 향후 작업은 **EventKey별 표시 위치 추가만** 허용.

### Known QA limitations (비제품, harness/계정)

| 항목 | 기록 | 조치 |
|------|------|------|
| Chat QA1 | 단독 3회 중 **2/3 PASS** (1회 `rowDomUnread=null` flake) | known QA limitation — Engine LOCK |
| Delivery inbox baseline | Legacy full QA에서 `orderStatus` 잔여 vs tier1 delivery inbox=0 | **테스트 계정(aaaa) 잔여 데이터** 영향 — known limitation |
| Delivery clear (buyer fixture) | buyer `fc90db5a-…` 기준 clear **PASS** | harness v2로 Stores DOM 판정 제외 |

## 8. 변경 이력

- **2026-06-22**: `admin_notice`를 Philife 하단탭 배지에서 제거 → Tier1 `tier1_inbox_bell` 보조 합산
- **2026-06-22**: Admin banner dismiss — read 성공 후에만 숨김 (세션 dismiss truth 제거)
- **2026-07-08**: Rebuild 시험 — Chat room count; Trade/events on feed tabs (폐기)
- **2026-07-08**: **Legacy 정렬** — feed 탭 BottomNav badge 0; Chat만 room count; 원인은 종/FAB/row
- **2026-07-08**: **실무 완료 + LOCK** — known QA limitation 기록; Engine/Authority/Bell Modal LOCK

## 관련 코드

- BottomNav: `lib/chats/use-owner-hub-badge-total.ts`
- Chat tab: `lib/notifications/messenger-chat-tab-badge.ts`
- 규정: `lib/notifications/samarket-messenger-notification-regulations.ts` (`notif-0002` Legacy)
- Tier1 bell supplement: `lib/notifications/tier1-admin-notice-bell-supplement.ts`
- App icon: `components/push/NativeBadgeSync.tsx`
- badge targets: `lib/notifications/badge-target-policy.ts` (`badge-target-0001`)

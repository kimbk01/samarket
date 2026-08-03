# Gate 1 — Event Writer Map

**Mode:** AUDIT ONLY · HEAD `f438f37e2` · origin/main 동일  
**제품 A/B/C:** 명령서 §1 기준 (이번 문서의 “올바른” 열)  
**등급:** PROVEN = 코드 경로 확인 · UNPROVEN = 호출/실트래픽 미확인

Insert SSOT: `createNotificationEvent` (`notification-event-repository.ts`) via `appendUserNotification` / `createAndDispatchNotificationEvent`.

---

## 1. Member Notification (제품 A)

| Writer | 생성 이벤트 | recipient identity | 증가 대상(현재) | 중복 가능성 | 유지/폐기 |
|--------|-------------|-------------------|-----------------|-------------|-----------|
| `appendUserNotification` | 다수 → `notification_events` | `user_id` | Bell/AppIcon (타입별) + FCM | HIGH vs 직접 create | **KEEP** funnel |
| `createAndDispatchNotificationEvent` | insert + push | `user_id` | 동일 | MEDIUM dedupe_key | **KEEP** |
| `notifyBuyerStore*` (`notify-store-commerce.ts`) | buyer `order_status` | buyer `user_id` | A + AppIcon + FCM | MEDIUM supersede | **KEEP** (제품 A) |
| Trade offer/status (`price-offers.server.ts`, trade-flow routes) | `trade_status` 등 | counterparty `user_id` | A + AppIcon + FCM | LOW | **KEEP** |
| `community-social-inapp-notify` | `community_activity` | author `user_id` | A + AppIcon + FCM | LOW | **KEEP** (제품 A 여부 정책 확인) |
| Meetings / review reply append | activity/notice | `user_id` | A + AppIcon + FCM | LOW | **KEEP** |
| Campaign `admin_notice` | 보존형 공지 | `user_id` | A + AppIcon + FCM | MEDIUM | **KEEP** |
| Campaign `admin_marketing_banner` | marketing | `user_id` | digit 제외 의도 · FCM 가능 | MEDIUM | **KEEP ephemeral** / 제품: push-only vs 보존형 정책 |
| `notifyUserPoint*` | points | `user_id` | A + AppIcon + FCM | LOW | **KEEP** |

---

## 2. Conversation (제품 B) — 메시지 + 부가

| Writer | 생성 이벤트 | recipient | 증가 대상(현재) | 중복 가능성 | 유지/폐기 |
|--------|-------------|-----------|-----------------|-------------|-----------|
| `dibay_append_room_message_atomic` / typed atomic (`room-unread-authority-rpc.ts`) | participant unread | participant `user_id` | **B rooms** → hubs/AppIcon | MEDIUM vs chat events | **KEEP** (B SSOT 후보) |
| `notifyMessagePipeline` | `chat_message` / `group_message` / `trade_message` / `store_order_message` | recipient `user_id` | Bell digit **제외** 의도 · FCM · inbox 가능 | **HIGH** vs participant unread | **KEEP** push/inbox · **digit에 합산 금지** |
| Legacy `bumpUnreadForChatRoomRecipients` | `chat_room_participants.unread_count+1` | `user_id` | legacy trade | HIGH vs CM | **KEEP legacy** / 정렬 필요 |
| `community_messenger_apply_unread_for_text_message` (잔존 호출) | unread +1 | `user_id` | B | HIGH vs atomic | **DELETE/cutover** 후보 |
| `notifyMissedCallPipeline` | `missed_call` | callee `user_id` | orphan→AppIcon/B축 · Bell 제외 의도 | MEDIUM | **KEEP** · 제품: B(방) 또는 missed 집합 |
| List optimistic `unreadCount+1` (CM bootstrap patch) | client only | local | row | MEDIUM | **KEEP** optimistic · AppIcon 권위 아님 |

---

## 3. Store Owner (제품 C / 명령서: ops + owner chat)

| Writer | 생성 | recipient | 증가 대상(현재) | 중복 | 유지/폐기 |
|--------|------|-----------|-----------------|------|-----------|
| `store_orders` status → pending/refund/cancel_requested | Action Required row | **`store_id`** | C Hub `orderAttention` | HIGH vs owner_intake | **KEEP** (C 진실) |
| `store_inquiries` open | inquiry | **`store_id`** | C inquiry | LOW | **KEEP** |
| `notifyStoreOwnerNewOrder` 등 `notifyStoreOwner*` | `order_status:owner_intake:*` | owner **`user_id`** | **현재 Bell/AppIcon 축에 들어갈 수 있는 이벤트 생성** · A filter로 digit 제외 시도 | **HIGH** vs C rows | **ROUTE** → store identity (제품 C) · user_id writer **오염원 PROVEN** |
| `notifyStoreOwnerPoint*` / fee | owner fee events | owner `user_id` | A 경로 가능 | MEDIUM | **ROUTE/정책** |
| Owner SO participant unread (atomic store_order) | room unread | owner participant | Owner chat hub rooms | MEDIUM | **KEEP** (제품 Owner Chat) · **Member App Icon 합산 금지** |

---

## 4. FCM / Native (전송 · 권위 아님)

| Writer | 사실 | recipient | 표면 | 중복 | 유지/폐기 |
|--------|------|-----------|------|------|-----------|
| `notify-push-dispatcher` + `resolveMemberAppIconTotalForNativeFcm` | `badge_count` absolute | device | FCM/APNs | MEDIUM Domain stale | **KEEP echo** · 권위 아님 |
| `fcm-data-payload-contract` always-send 0 (`e2cb00ec8`) | badge 필드 항상 | device | FCM | — | **재검토** (Bell FAIL 원인 아님 PROVEN) |
| `NativeBadgeSync` → `syncNativeBadgeCount` | Cap Badge.set absolute | device | App Icon | LOW | **KEEP absolute** |
| `DibayAppIconDeliveryAdapter` | setNumber / setBadgeCount | device | launcher | MEDIUM Cap race | **KEEP** |
| `applyFromCapBadgeCache` (AppDelegate / MainActivity resume) | Cap prefs 재적용 | device | launcher | **stale 권위화** | **폐기 대상(권위로서)** · 도입 `5e7c46f9f` ≠ e2cb |
| Admin push test `badge_count: 0` | test | device | FCM | N/A | **quarantine** |

---

## 5. 명령서 대비 핵심 위반 (writers)

| 명령서 | 코드 |
|--------|------|
| 한 domain event → 한 notification event | 메시지: **participant unread + notifyMessagePipeline event + targets** 병행 PROVEN |
| Owner 신규주문 → store C only · member Bell 금지 | `notifyStoreOwner*` → **owner user_id 이벤트** PROVEN (digit 필터로 막는 중) |
| FCM이 이벤트 재생성 금지 | 재생성 writer는 주경로에서 미발견 · **UNPROVEN** 전부 |
| Native ±1 금지 | 주경로 absolute · list optimistic +1만 별도 |

---

## 6. 이번 감사에서 하지 않은 것

- 실계정 writer 호출 트레이스 100%  
- DB trigger 전수  
- “모든 notify* 파일 라인” 완전 목록 (대표 경로 + commerce/CM/trade 중심)

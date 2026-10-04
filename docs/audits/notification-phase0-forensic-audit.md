# DIBAY Notification / Push / Sound / Event — PHASE 0 Read-Only Forensic Audit

- 감사일: 2026-10-04
- 범위: repository + Production(Vercel) + Production DB(Supabase `ckdosyydvgzqwpbwuhon`) + Android/iOS native 소스
- **제품 코드 수정 없음.** 이 문서만 추가.
- 표기: `CONFIRMED` = 코드+DB 직접 확인 · `CODE` = 코드 근거만 · `NOT_PROVEN` = 증명 불가

---

## 1. CURRENT AUTHORITY

| 항목 | 값 | 근거 |
|---|---|---|
| HEAD | `9d5ac23a1e69ccc5a622ce4e68c6fb04b1cb57a8` | `git rev-parse HEAD` |
| origin/main | `9d5ac23a…` | `git fetch origin main` |
| ahead / behind | 0 / 0 | `git rev-list --left-right --count` |
| worktree | clean (branch `claude/dibay-notification-full-audit-0i9s5m`) | `git status` |
| Production deployment | `dpl_7xBe2CdxeMH1rsMbYAbzgJkDzrMA` READY (project `samarket`) | Vercel API |
| Production SHA | `9d5ac23a…` = HEAD | 배포 meta `githubCommitSha` |
| DB | Postgres 17.6, ap-south-1, ACTIVE_HEALTHY | Supabase |
| Notification env | 이름만 확인(값 미열람): `PUSH_DISPATCH_ENABLED`, `WEB_PUSH_ENABLED`, `FCM_*`, `APNS_*`(+`APNS_VOIP_*`), `VAPID_*`, `CRON_SECRET` | 코드 참조. **실제 설정값 NOT_PROVEN** |
| Android native | `DibayFirebaseMessagingService` 커스텀, 채널 레지스트리 존재, `google-services.json` 저장소에 없음(gitignore) | 소스 |
| iOS native | APNs 직접(FCM 미사용), PushKit VoIP + CallKit, NSE(이미지), `App.entitlements` `aps-environment=development` | 소스 |

### Authority 불일치 (먼저 기록)

| ID | 불일치 | 영향 |
|---|---|---|
| AUTH-01 | Repo 마이그레이션 `20270414200000_wp8_new08_call_log_user_hides.sql`/`…210000_bootstrap_exclude_call_log_hides.sql` → **Prod DB 에 `community_messenger_call_log_user_hides` 테이블 없음**. 해당 코드는 이미 Prod 배포됨(`lib/community-messenger/service.ts`) | 통화기록 「나에게서 삭제」 기능이 Prod 에서 실패할 가능성 (알림 범위 밖, 기록만) |
| AUTH-02 | Repo `20270414*` 마이그레이션들이 Prod 에 다른 version(`20261002*`)으로 적용됨 (`wp4_db01`, `wp7_new24` 등). 이름·스키마는 반영 확인(`notification_events_message_domain_required_check` 존재) | 기능 영향 없음, 이력 추적 혼동 |
| AUTH-03 | iOS entitlement `aps-environment=development` 이 저장소 기본값. Release 빌드에서 production 으로 바뀌는지 **NOT_PROVEN** | dev 서명 빌드 + `APNS_PRODUCTION` 서버 → BadDeviceToken → 토큰 비활성 |

---

## 2. CURRENT ARCHITECTURE MAP (코드 기준 실제 흐름)

### 2.1 일반 알림 (In-App + Push)
```
PRODUCT EVENT (API route / service)
 ├─ A appendUserNotification()            lib/notifications/append-user-notification.ts   (레거시 형태 → 타입 매핑)
 ├─ B createAndDispatchNotificationEvent() lib/notifications/pipeline/notification-event-dispatcher.ts
 └─ C notifyMessagePipeline()             lib/notifications/pipeline/notify-message-pipeline.ts (block/mute/presence/domain pair)
      ↓
 notification_events INSERT  (UNIQUE user_id+dedupe_key)   ← 유일한 In-App 레코드 SSOT
      ↓ (inline push | deferred → push_handoff_status=pending)
 notify-push-dispatcher.ts → resolveNotificationDestination(registry.deepLinkResolverKey, routeUrl)
      ↓
 dispatchPushForUser()  lib/push/dispatch/dispatch-push-for-user.ts
   gates: env → event safety → user settings → load user_devices/web_push_subscriptions → dedupe → call provider policy
   notification_deliveries INSERT (UNIQUE event_id+device_id) → provider send → status update → invalid token deactivate
      ├─ FCM HTTP v1 (data-only)          fcm-sender-impl.ts
      ├─ APNs alert (sound:"default")     apns-sender-impl.ts
      ├─ APNs VoIP (call only)            apns-sender-impl.ts
      └─ Web Push (VAPID)                 web-push-sender.ts → public/sw.js
      ↓
 Android: DibayFirebaseMessagingService → (FG chat 계열 OS 표시 생략) → NotificationCompat(channel) → tap
          → MainActivity.handleNotificationLaunchIntent → queueNavigateWebViewToAppPath → JS dibay:push-route
 iOS:     OS 가 aps.alert 직접 표시 → tap → Capacitor pushNotificationActionPerformed
 Web:     sw.js notificationclick → data.url
      ↓
 components/push/PushRouteListener.tsx → resolvePushRouteFromFcmData → auth gate(hold/login/allow, pending route) → router.push
      ↓
 destination page (자체 권한 가드) → read/open 상태 (opened_at/read_at)
```

### 2.2 In-App 목록
```
notification_events → GET /api/me/notifications (session user_id 필터, created_at desc, offset/limit)
  → resolveEventInboxLinkUrl() (inbox-events-merge.ts) → MyNotificationsView (/notifications)
  → tap: resolveNotificationDestination → activateNotificationDestination (+ PATCH read)
Badge: /api/me/notifications/badge-count (45s poll) + Realtime INSERT(notification_events) + 75s 목록 poll
```

### 2.3 Push 복구 경로 (cron)
| cron | 주기 | 역할 |
|---|---|---|
| `/api/cron/notification-push-handoff` | 1분 | chat 계열 deferred push claim/send (`claim_notification_push_handoff`) |
| `/api/cron/commerce-notification-push-handoff` | 2분 | commerce reconcile(50건, 180분) + claim 20 |
| `/api/cron/notification-campaigns-dispatch-scheduled` | 5분 | 예약/반복 캠페인 |
| `/api/community-messenger/calls/sessions/stale-cleanup` | 2분 | ringing → missed → `missed_call` |

### 2.4 Admin Event / Notice / Campaign
```
platform_events (이벤트 SSOT) ─ platform_promotion_distributions(popup/banner/push/bell)
   ├─ popup  → platform_popup_campaigns(cta_type=event_detail)
   ├─ banner → feed_ad_campaigns | hero config
   └─ push/bell → admin_notification_campaigns(draft, target_payload.platform_event_id)
app_notices (공지 SSOT) → campaign target_payload.appNoticeId
admin_notification_campaigns → send route / cron → campaign-send-user.ts
   → notification_events(notice_published | admin_marketing_banner) + dispatchPushForUser
User: /events/[eventId] (상세만) · /mypage/customer-center/notice(/[id])
```
게시(publish) 시 자동 발송 없음(설계).

---

## 3. COMPLETE EVENT INVENTORY

`notification_events.type` 허용값: chat_message, group_message, mention_message, pin_message, trade_message, store_order_message, trade_status, order_status, delivery_status, community_activity, admin_marketing_banner, admin_notice, notice_published, inquiry_answered, inbox_message_received, admin_test, missed_call, incoming_call, incoming_call_signal, support_case_created/assigned/resolved/reopened, support_admin_replied, support_customer_replied.

Prod 최근 30일 발생 (DB 실측): chat_message 226 · trade_message 136 · order_status 85 · group_message 72 · pin_message 12 · support_* 33 · store_order_message 8 · admin_notice 4 · community_activity 4 · admin_marketing_banner 3 · notice_published 1 · missed_call 1 · mention_message 1 · trade_status 1.

| Event | Producer | Recipient | DB Record | In-App | Push | FCM/APNs | Sound | CTA | Destination | Read State | Runtime |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CM 1:1 텍스트 | `community-messenger-send-post-ack-effects.ts` → C(defer) | 참여자-발신자 | Y `chat_message` | 목록 기본 제외(채팅탭) | Y inline+cron | FCM data / APNs alert | 채널 기본 / iOS default | `chat_room` | `/community-messenger/rooms/{id}` | read_at | Prod 실발생 226, sent 65 |
| CM 그룹/거래/주문/멘션 텍스트 | 동일 | 동일 | Y group/trade/store_order/mention | 동일 | Y | 동일 | 동일 | domain resolver | 방 | read_at | 실발생 |
| CM 이미지·스티커·파일·음성·공유 | `service.ts:12585` → C (roomKind 없음) | 참여자 | Y **항상 `chat_message`** | 동일 | inline only(void), handoff 없음 | 동일 | 잘못된 버킷 | `chat_room` | 방 | | **NOTIF-03** |
| 레거시 거래채팅 메시지 | `app/api/chat/rooms/[roomId]/messages`, `/chat/room/[roomId]/send` | 상대 | **N (domain pair 누락 → skip)** | N | N | — | — | — | — | — | **NOTIF-02** |
| 레거시 group-chat 메시지 | `app/api/group-chat/rooms/[roomId]/messages` | 멤버 | Y | | Y | | | CM room route + group_rooms id | 잘못된 방 | | **CTA-06** |
| 그룹 pin/unpin | `group-room-pin-notify.ts` | 참여자-actor | Y `pin_message` | | Y | | | `group_room` | 방 | | 실발생 12 (block/mute 미검사) |
| 그룹 초대 | `community-messenger-group-inapp-notify.ts` → A | 초대받은 사람 | **N (CHECK 위반)** | N | N | | | | | | **NOTIF-02** |
| Missed call | `service.ts notifyRoomBoundMissedCallBestEffort` / stale-cleanup | callee | Y `missed_call` | Y | Y | FCM / APNs / VoIP | Android `dibay_calls_missed` | `missed_call` | 방 | | 실발생 1 |
| Incoming call | `send-community-messenger-incoming-call-push.ts` | callee | N (push only, 설계) | — | Y HIGH | FCM HIGH / **APNs alert + VoIP 둘 다** | incoming 채널 / CallKit | — | `/community-messenger/calls/{sid}` | — | **PUSH-01** |
| Call cancel/reject/end | `send-community-messenger-call-canceled-push.ts` | 상대 기기 | N | — | Y | FCM HIGH / **APNs 빈 alert "통화"+sound** / VoIP | | | | | **PUSH-01** |
| Call answered elsewhere | `…answered-elsewhere-push.ts` | callee 타기기 | N | — | Y | FCM **NORMAL** / APNs alert / web 빈 알림 | | | | | **PUSH-01/04/05** |
| 거래 확정/완료 (buyer/seller/admin) | trade-flow routes → A | 상대 | Y `trade_status` | Y | Y | | | display_route | 거래채팅 | | dedupe 과잉(**NOTIF-05**) |
| 가격 제안 생성/수락/거절 | `price-offers.server.ts` → A | 판매자/구매자 | Y `trade_status` | Y | Y | | | display_route | `/post/{id}?…` / 채팅 | | |
| 거래 분쟁 | `buyer-issue/route.ts` → A | 판매자 | Y `community_activity`(오분류) | | Y | | | | 거래채팅 | | **NOTIF-07** |
| 커뮤니티 댓글/답글/좋아요 | `community-social-inapp-notify.ts` | 글/댓글 작성자 | Y `community_activity` | Y | Y | FCM NORMAL | | display_route | `/community/posts/{id}` | | 실발생 |
| 모임 가입요청/승인/거절/강퇴/차단 | meetings routes → A | 호스트/대상 | Y `community_activity` | Y | Y | | | | 방/open_chat/`/philife` | | dedupe 과잉(**NOTIF-05**) |
| 주문: 신규/품절/결제/취소/환불요청 (owner) | `notify-store-commerce.ts` → A | 사장님 | Y `order_status` | owner 목록 | Y cron(≤2분) | FCM NORMAL | | display_route | `/stores/owner/orders?…order_id=` | | 실발생 |
| 주문: 결제완료/상태변경/결제실패/환불승인·거절 (buyer) | 동일 | 구매자 | Y `order_status` | Y | Y cron | FCM NORMAL | | display_route | **`/my/store-orders` (목록, 주문 ID 소실)** | | **CTA-01** Prod 323건 |
| 주문 접수 리마인더 / 자동완료 | `store-order-accept-reminders`, `store-orders-auto-complete` cron | 사장님/구매자 | — | | | | | | | | **cron 미스케줄 NOTIF-09** |
| 리뷰 답글 | `reviews/[reviewId]/reply` → A | **구매자** | Y `order_status` | | Y | | | | **`/stores/owner/reviews` (사장님 전용)** | | **CTA-04** Prod 1건 |
| 포인트 충전 승인/보류/거절 | `notify-user-points.ts` → A | 회원 | Y `order_status`(오분류) | | Y | | | | `/mypage/points` | | NOTIF-07 |
| 선물 제안/수락/거절/취소 | `notify-gift-transfer.ts` → A | 상대 | Y `community_activity` | | Y | | | | 방 `?giftTransferId=` | | 실발생 |
| 배달광고 운영/비즈캐시 충전 | `delivery-ad-*-notify.ts` → A | 사장님 | Y `admin_marketing_banner`(오분류) | badge 제외 | 마케팅 동의 필요 | | | | owner ads | | **NOTIF-06** |
| Admin 매장 운영 공지 | `admin/stores/[id]/notify` → A | 사장님 | Y `admin_notice` | | Y | | | | admin deeplink | | Date.now key |
| Support 생성/배정/답변/해결/재오픈 | `support-case-service.ts` → B | 요청자 | Y `support_*` | Y | Y | FCM NORMAL | | display_route | `/support/cases/{id}` | | 실발생 33 (본인에게 created 발송 **NOTIF-08**) |
| Support 고객 답장 | 동일 | 담당 admin | Y | | Y | | | | `/admin/support/{id}` | | |
| 1:1 문의/인박스 메시지 | `member-admin-notes-service.ts` | 회원 | Y `inquiry_answered`/`inbox_message_received` | Y | Y | | | | `/mypage/inquiries/{id}` | | Date.now key |
| Admin 캠페인 (공지/시스템) | `campaign-send-user.ts` | 대상군 | Y `notice_published` | Y | Y (settings gate 우회) | | | | `/mypage/customer-center/{type}/{id}` | | 실발생 |
| Admin 캠페인 (마케팅/이벤트) | 동일 | 대상군 | Y `admin_marketing_banner` | Y | Y (marketing gate) | | | | 이벤트/랜딩 | | |
| Admin push 테스트 | `app/api/admin/push/test` | 지정 | Y `admin_test` (unread=false) | | Y force | | | | `/my/notifications` | | |

Dead/shadow producer (호출부 없음): `publishNotificationSideEffect`, `sendWebPushNotificationsForUser`, `trySendWebPushForNotification`, engine `executePersistencePlan`(shadow only), `notifyBuyerStoreOrderAutoCompleted`, `notifyStoreOwnerPlatformInquiryReplied`, `buildMissedCallDedupeKey`, `notification_logs`(queued 소비자 없음), `notification_room_overrides`(미사용), legacy `notifications` 테이블(6,582행, 마지막 2026-08-12 — 쓰기 없음).

---

## 4. FCM / APNs STRUCTURE

| 단계 | 구현 | 상태 |
|---|---|---|
| Token 등록 | `register-native-push-client.ts` → `/api/me/devices/register` → RPC `register_user_device` (provider+token+env upsert, 기기 소유권 이전, 20개 cap) | CODE |
| Token 갱신 Android | `onNewToken` → **로컬 저장만, 서버 업로드 없음** | **PUSH-03** CONFIRMED (code) |
| Token 갱신 iOS | register flow 안에서만 캡처 / VoIP invalidate → provider 단위 전체 비활성 | PUSH-07 |
| Logout | 캐시 토큰 1개를 proof 로 deactivate; 세션 없으면 마지막 등록(voip) 행만 비활성 → apns alert 행 잔존 가능 | PUSH-08 |
| Account switch | `scope: device_all_users` | CODE |
| 탈퇴/purge | `deactivateAllUserPushTokensForAccountRemoval` (WP-13) | CODE |
| Multi-device / dup token | Prod: 2명 이상 사용자에 active 인 토큰 0건 | CONFIRMED |
| Stale/invalid | NOT_FOUND/UNREGISTERED/410/BadDeviceToken → `is_active=false` | CONFIRMED (Prod 비활성 Android 260, iOS 7) |
| Payload | FCM **data-only**(channelId/collapse 없음), APNs alert `sound:"default"`, VoIP `apns-expiration:0`, Web TTL 24h | CODE |
| Idempotency | `notification_deliveries (event_id, device_id)` UNIQUE, incoming call claim | CODE |
| Retry | **실패 후 cron 재시도가 duplicate_delivery 로 skip → noop → handed_off** | **PUSH-02** CONFIRMED (code) |
| 실패 로깅 | `notification_deliveries.provider_response` | CONFIRMED |
| 권한 상태 | `user_devices.notification_permission_status` **Prod 전 행 NULL** (쓰기 경로 없음, campaign gate 는 읽음) | **PUSH-09** CONFIRMED |

### Prod 실측 (최근 30일 notification_deliveries)
- fcm sent ≈ 1,450 / failed 11; apns sent 324 / failed 35; voip_apns sent 317 / failed 39.
- **call 이벤트에서 apns ≈ voip_apns 건수 동일** (ringing 154/155, cancel 50/50, answered_elsewhere 66/69) → iOS 는 통화마다 VoIP + 일반 alert 이중 발송 = **PUSH-01 Prod 증거**.
- skipped: `no_active_targets` 대다수, `voip_reserved_for_call_push`(정상 차단), `user_settings_gate`, `destination_deleted`.
- **`pending` 113건이 2026-06 ~ 09 부터 정체** (call_* 위주) → 상태 미종결 행 (**PUSH-10**).
- APNs 실패 원인 상위: `The pending stream has been canceled`(HTTP/2), `InvalidProviderToken`(8월), `DECODER unsupported`(키 포맷, 8월).
- Active 기기: Android 17명 / iOS 1명(apns 2 + voip 1).

---

## 5. SOUND STRUCTURE

| 구성 | 실제 |
|---|---|
| SSOT 레지스트리 | `lib/notifications/notification-sound-registry.ts` + resolver (event → channel base, ios_sound_name) |
| In-app 재생 | `notification-sound-engine.ts`, `play-notification-sound.ts`, leader-tab/visible 결정, store order alert, call feedback |
| 사운드 파일 | `public/sounds/notification.wav` 만. Android `res/raw` **없음**. iOS `CallKitSilentRingtone.caf` 만 |
| Android 채널 | `dibay_chat_messages_v1`, `dibay_trade_v1`, `dibay_orders_v1`, `dibay_delivery_v1`, `dibay_community_v1`, `dibay_admin_notice_v1`, legacy `dibay_messages` — 모두 HIGH, vibration, **setSound 없음(시스템 기본음)**; call `dibay_calls_incoming_v7`(sound null), missed `dibay_calls_missed`(DEFAULT) |
| iOS | `aps.sound = "default"` 하드코딩, presentationOptions 미설정 |
| Android FG | chat/group/trade/delivery_order/community_comment 는 OS 표시 생략(in-app 처리) |

| Event | FG Sound | BG Sound | Killed Sound | Android Channel | iOS Sound | Expected(SSOT) | Actual |
|---|---|---|---|---|---|---|---|
| chat/group/trade message | in-app sound (leader tab) | 시스템 기본 | 시스템 기본 | chat/trade 채널 | default | registry 별 | 채널 기본음 — 커스텀/무음 SSOT 미반영 (**SOUND-01**) |
| order_status | in-app + Android OS 표시 가능 | 기본 | 기본 | orders | default | registry | 동일. FG 이중음 가능성 NOT_PROVEN (**SOUND-03**) |
| admin/notice/marketing | Android FG envelope 시 OS(DEFAULT_ALL) + in-app 가능 | 기본 | 기본 | admin_notice | default | silent 가능 정책 | silent 지정이어도 iOS 울림 (**SOUND-01**) |
| incoming call | ringtone/CallKit | 동일 | 동일 | calls_incoming_v7 | CallKit + **추가 alert default** | CallKit 만 | iOS 이중음 (**PUSH-01**) |
| call terminal | 없음 | 없음 | 없음 | — | **빈 alert + default** | 무음 dismiss | iOS 울림 (**PUSH-01**) |
| missed call | FG 생략 | 기본 | 기본 | native `dibay_calls_missed` vs 서버 `dibay_calls_missed_v1` | default | | 채널 ID 불일치 (**SOUND-02**, native 가 서버값 무시하여 현재 기능 영향 없음) |

실기기 소리 검증: **전부 NOT_PROVEN**.

---

## 6. CTA / DEEP-LINK STRUCTURE

Resolver 4종: 서버 inbox `resolveEventInboxLinkUrl` · 목록 tap `resolveNotificationDestination` · push 발송 `notify-push-dispatcher`(routeUrl) · push tap `resolvePushRouteFromFcmData`. 안전 필터 `resolveSafeNotificationInternalRoute` (prefix allowlist, 외부 URL → path 축소, `//` 거부). Fallback = `/notifications?fallback=origin_unavailable` (Home 아님; sw.js 만 `/`).

| Event | Payload | Resolver | Expected | Actual | Result |
|---|---|---|---|---|---|
| chat/group/trade/store_order message | room_id | `*_room` | 정확한 방 | `/community-messenger/rooms/{id}` | PASS(code) |
| missed_call | room_id | `missed_call` | 통화 방 | 방 | PASS(code) |
| incoming call | sessionId | push type | 통화 flow | `/community-messenger/calls/{sid}` | PASS(code) |
| buyer order_status | `routeUrl=/my/store-orders` | display_route | 해당 주문 상세 | **주문 목록** | **FAIL CTA-01** (Prod 323건) |
| owner order_status | owner href + order_id | display_route | 주문 | `/stores/owner/orders?…order_id=` | PASS(code). 단 다수 Prod 행이 `?storeId=` 만 (order_id 없음) — 구 데이터 |
| review reply (buyer) | `/stores/owner/reviews` | display_route | 내 리뷰/주문 | 사장님 전용 페이지 | **FAIL CTA-04** |
| community_activity | post href | display_route | 게시글 | `/community/posts/{id}` (legacy `/philife/posts` 읽기 시 보정) | PASS(code) |
| trade_status | `/post/{id}` / 채팅 | display_route | 상품/거래 | 동일 | PASS(code); meta.post_id 우선순위 잠재결함 |
| support_* | `/support/cases/{id}` | display_route + deliverSupportOpen | 케이스 | 케이스 (list tap 시 notificationId/`storeId` 소실) | PARTIAL |
| notice_published | customer-center route | board | 공지 상세 | 상세 / 존재·노출 검증 없음 | PARTIAL (EVENT-06) |
| admin_notice (campaign) | routeUrl | display_route | 지정 CTA | Prod 에 **`/https://samarket.vercel.app/mypage/notices/…`** 저장 | **FAIL CTA-03** |
| admin_marketing_banner | routeUrl | display_route | 이벤트/랜딩 | 9건이 `/notifications` (CTA 미지정) | PARTIAL |
| event push/bell | `/events/{id}` | allowlist | 이벤트 상세 | 동일 (종료 시 410 안내) | PASS(code) |
| 레거시 group-chat | group_rooms id | CM room route | 그룹방 | 존재하지 않는 CM 방 | **FAIL CTA-06** |

| 앱 상태 | 구현 | 증명 |
|---|---|---|
| Android FG/BG/killed tap | MainActivity extras → persisted route → JS replay | CODE / 실기기 NOT_PROVEN |
| iOS cold start tap | Capacitor `pushNotificationActionPerformed` 보존 의존 | NOT_PROVEN |
| 미로그인 native | pending route + login sheet `next` | CODE; recipientUserId 미저장 경로 존재 (**CTA-05**) |
| 미로그인 web | `proxy.ts` → `/login?reason=auth_required` **next 없음** | **FAIL CTA-02** |

---

## 7. ADMIN EVENT STRUCTURE

| 기능 | 상태 |
|---|---|
| 이벤트 목록/생성/수정/상세/게시/중지 | 존재 (`/admin/platform-events`, `requireAdminApiUser`) |
| 삭제 | 없음 (정책 결정 필요) |
| 필드(제목/부제/이미지/섹션/약관/기간/TZ/CTA) | 존재 |
| Preview | 존재 (사용자 렌더러 재사용) |
| CTA 검증 | 상위 CTA 구조 검증만 / 섹션 CTA 미검증, 대상 존재 미검증 |
| 노출 채널(popup/banner/push/bell) | 존재 (`distribution`) |
| Push 발송 | **draft 캠페인 생성 → 상세 화면에 발송 버튼 없음 → dead end** (**EVENT-01**) |
| 캠페인 반영 | 고정 request id 로 최초 내용 동결 (**EVENT-02**) |
| 공지(app_notices) CRUD/미리보기/발송 링크 | 존재 (삭제/보관 UI 없음) |
| 캠페인 생성/대상/예약/반복/테스트/결과/중복방지 | 존재 (draft 재발송 UI 없음, PATCH UI 없음) |
| Prod 데이터 | platform_events 13 (published 1), campaigns draft 75 / sent 21 / partially_failed 2 / active 1, app_notices 32 |

## 8. USER EVENT STRUCTURE

| 기능 | 상태 |
|---|---|
| 이벤트 목록 | **없음** (`/events` 페이지·API 없음, `buildPlatformEventDetailPath("")` → `/events` 404) (**EVENT-05**) |
| 이벤트 상세 | 존재, 비게시/만료 404/410 안내 |
| 이미지/CTA/Back | 존재 (Back → `/market`, 기간 표기 Manila 고정) |
| 홈 히어로 배너 | **종료/비게시 이벤트도 노출** (**EVENT-03**) |
| 공지 목록/상세 | 존재 (로그인 필수, 최신 50 후 기간 필터) |

## 9. DUPLICATE SSOT / DEAD PATH

- Event identity: `platform_events.id` 가 Admin → User → Campaign(`target_payload.platform_event_id`) → `/events/{id}` 까지 일관. **SSOT 유지**. 단 campaign title/body/image 는 동결 사본(EVENT-02) → 표시 분산.
- Notice identity: `app_notices.id` 일관. 캠페인 발송 시 존재/노출 검증 없음.
- Notification record: `notification_events` 단일. legacy `notifications` 쓰기 없음(읽기 merge 잔존 여부만 확인 필요).
- Resolver 4중 구현(inbox/list/push-send/push-tap) — 동일 결과 보장 계약 없음 (CTA-01, B-10 계열 원인).
- Push 타입 분류 2중: `notification_events.type` vs push `notification_type`(chat/system/marketing/community_comment/notification) → 설정 gate·Android priority·채널이 다른 축을 봄 (NOTIF-07, PUSH-06).
- Dead: §3 말미 목록.

---

## 10. DEFECT CANDIDATES

Severity: P1 = 사용자 대면 오동작/핵심 경로 불능, P2 = 부분 오동작/운영 위험, P3 = 품질/잠재.

| ID | Domain | Sev | Symptom / Root cause (요약) | Evidence | 상태 |
|---|---|---|---|---|---|
| PUSH-01 | Push/iOS/Call | P1 | iOS 통화마다 VoIP + 일반 APNs alert 동시 발송 → CallKit 위에 "음성 통화" 알림+소리, 종료/취소/타기기응답에 빈 "통화" 알림+소리. `resolveCallPushProviderPolicy` 가 apns 항상 allow | `push-payload-types.ts:163-193`, `apns-sender-impl.ts:209`; Prod apns≈voip 건수 | CONFIRMED |
| PUSH-02 | Push/Retry | P1 | 실패 push 재시도가 `(event,device)` UNIQUE 로 duplicate_delivery skip → noop → handed_off. 재시도 설계 무효 | `dispatch-push-for-user.ts:392-405`, migration `20261012130000:40-42` | CONFIRMED (code) |
| PUSH-03 | Push/Token | P1 | Android `onNewToken` 서버 미업로드 → 다음 인증 실행 전까지 push 유실, 로그아웃 proof 불일치 | `DibayFirebaseMessagingService.java onNewToken` | CONFIRMED (code) |
| CTA-01 | CTA/Order | P1 | 구매자 주문 알림 전부 `/my/store-orders` 목록 → 주문 상세 아님 (in-app·push 동일) | `notify-store-commerce.ts:323,625,674,718…`; Prod 323건 | CONFIRMED |
| CTA-02 | CTA/Auth | P1 | Web 비로그인 진입 시 `/login` 에 `next` 없음 → 로그인 후 목적지 소실 | `proxy.ts:94-99` | CODE |
| NOTIF-01 | In-App | P1 | 목록 API DB 오류를 `ok:true, []` 로 반환 → 「알림 없음」 위장 | `inbox-events-merge.ts:706-712` | CONFIRMED (code) |
| NOTIF-02 | Producer | P1 | 그룹 초대 알림 / 레거시 거래채팅 메시지 알림이 domain pair 누락으로 INSERT 실패·skip — 레코드·push 없음, 로그 없음 | `append-user-notification.ts:56` (chatDomain 미전달), `notify-message-pipeline.ts:303-310`, CHECK `…message_domain_required_check` (Prod 존재) | CONFIRMED (code+schema) |
| NOTIF-03 | Producer | P1 | CM 이미지/스티커/파일/음성/공유 메시지가 항상 `chat_message`, mention 없음, handoff 미적용(void 전송) | `service.ts:12585-12603` | CODE |
| EVENT-01 | Admin Event | P1 | 이벤트 Push/Bell 및 저장된 draft 캠페인을 UI 에서 발송 불가 | `AdminNotificationCampaignDetailPage.tsx:453-545`, `distribution/push/send/route.ts:28-48` | CODE |
| EVENT-02 | Admin Event | P1 | 이벤트 push/bell 캠페인 최초 저장 내용 동결 → 미리보기 ≠ 발송, 재발송 불가 | `campaign-create-service.ts:73-90` | CODE |
| EVENT-03 | User Event | P1 | 종료/비게시 이벤트 히어로 배너 계속 노출 → 탭 시 종료 페이지 | `load-active-event-hero-banners.ts:25-53` | CODE |
| CTA-03 | CTA/Campaign | P1 | 캠페인 외부/절대 URL 이 `/https://…` 등 깨진 경로로 저장 → fallback | `campaign-types.ts:74-84`; Prod 행 존재 | CONFIRMED |
| EVENT-04 | Campaign | P2 | 반복 캠페인 2회차부터 in-app 레코드 중복키로 누락(push 만 감), selected_users 2회차 0건 발송 | `campaign-send-user.ts:138-140`, `run-campaign-send-batch.ts:31-39` | CODE |
| PUSH-04 | Push/Call | P2 | `call_answered_elsewhere` FCM NORMAL priority → Doze 기기 계속 울림 가능 | `fcm-sender-impl.ts:113-156` | CODE |
| PUSH-05 | Push/Web | P2 | web push answered_elsewhere 를 sw.js 가 terminal 로 처리 안 함 → 빈 "통화" 알림 | `public/sw.js:49-50` | CODE |
| PUSH-06 | Push/Priority | P2 | order/trade/support/notice push 가 NORMAL priority (우선순위 판정이 존재하지 않는 타입명 검사) | `fcm-sender-impl.ts:109-127` | CODE |
| PUSH-07 | Push/Token | P2 | iOS VoIP 토큰 invalidate 가 해당 사용자의 모든 iOS 기기 VoIP 비활성 | `devices/deactivate/route.ts:113-119` | CODE |
| PUSH-08 | Push/Logout | P2 | 세션 없는 로그아웃 시 apns alert 행 잔존 → 로그아웃 기기에 알림 | `device-unbind-token-cache.ts:38-43` | CODE |
| PUSH-09 | Push/Permission | P2 | `notification_permission_status` 미기록(Prod 전부 NULL) → 권한 거부 기기 식별 불가 | Prod DB | CONFIRMED |
| PUSH-10 | Push/Audit | P3 | `notification_deliveries` pending 113건 수개월 정체 | Prod DB | CONFIRMED |
| PUSH-11 | Push/Config | P2 | `APNS_VOIP_KEY_P8` 설정 검사만 하고 서명에 미사용 | `apns-sender.ts:51-55` vs `apns-sender-impl.ts:14-18` | CODE |
| PUSH-12 | Push/iOS | P2 | iOS FG 표시 정책(presentationOptions) 미설정 — FG 에서 공지/마케팅 미표시 가능 | `capacitor.config.ts` | NOT_PROVEN |
| SOUND-01 | Sound | P2 | Sound SSOT(커스텀/무음)가 native 에 미전달: 채널 setSound 없음, res/raw 없음, aps.sound 고정 | 위 §5 | CONFIRMED (code) |
| SOUND-02 | Sound | P3 | missed call 채널 ID 서버 `dibay_calls_missed_v1` ≠ native `dibay_calls_missed` | `MissedCallNotificationHelper.java:16` | CODE |
| SOUND-03 | Sound/Dup | P3 | Android FG envelope 알림 OS 소리 + in-app 소리 이중 가능 | `DibayFirebaseMessagingService.java:117` | NOT_PROVEN |
| CTA-04 | CTA | P2 | 리뷰 답글 알림이 구매자를 `/stores/owner/reviews` 로 보냄, owner 표시로 분류 | `reviews/[reviewId]/reply/route.ts:130` | CONFIRMED (Prod 1건) |
| CTA-05 | CTA/Security | P2 | pending push route 를 recipient 없이 저장 → 다른 계정 로그인 후 이전 계정 목적지로 이동 (API 가 데이터는 거부) | `PushRouteListener.tsx:312-337` | CODE |
| CTA-06 | CTA | P2 | 레거시 group-chat 알림이 group_rooms id 로 CM 방 링크 생성 | `group-chat/rooms/[roomId]/messages/route.ts:153-160` | CODE |
| CTA-07 | CTA | P3 | 상세 페이지 `router.push` 자동 이동으로 Back 루프 | `notifications/[notificationId]/page.tsx:166-189` | CODE |
| CTA-08 | CTA/UX | P3 | `fallback=origin_unavailable` 안내 UI 없음 | grep | CODE |
| NOTIF-04 | In-App | P2 | 「모두 읽음」 실패해도 `ok:true` / 헤더 벨 패널 오류·401 을 empty 로 표시 | `inbox-read-bridge.ts:553`, `PhilifeHeaderNotificationInbox.tsx:576-602` | CODE |
| NOTIF-05 | Dedupe | P2 | 명시 key 없는 producer 가 title/body/link 기반 key → 반복 이벤트 영구 억제 (모임 승인·강퇴, 거래 확정 같은 방) | `append-user-notification.ts:67-84` | CODE |
| NOTIF-06 | Classification | P2 | 배달광고·비즈캐시 거래성 알림이 marketing 분류 → 마케팅 동의(기본 off) 없으면 push 안 감, badge 제외 | `delivery-ad-*-notify.ts` | CODE |
| NOTIF-07 | Classification | P2 | push gate 분류 불일치(community_comment/notification → order 도메인, 분쟁·선물 → community, 포인트 → order) | `web-push-user-settings-gate.ts`, `notify-push-dispatcher.ts:58-73` | CODE |
| NOTIF-08 | Producer | P3 | support_case_created/reopened 본인에게 발송 | `support-case-service.ts:359-371,882-895` | CODE (Prod actor_user_id 미기록으로 DB 확인 불가) |
| NOTIF-09 | Cron | P2 | 주문 접수 리마인더·자동완료 cron 미스케줄 | `vercel.json` | CONFIRMED |
| NOTIF-10 | Dedupe | P3 | `Date.now()` 기반 key (문의/매장공지/support resolved·reopened) → 재시도 중복 | 각 파일 | CODE |
| NOTIF-11 | Badge | P3 | commerce reconcile 이 duplicate 에도 target unread 재마킹 (최대 3시간) | `append-user-notification.ts:191-208` | CODE (추론) |
| NOTIF-12 | In-App | P3 | 목록 >100 행 로드 후 poll 시 잘림, offset 중복/누락, 상세는 최근 100건만 탐색, delete-all 500 제한 | `MyNotificationsView.tsx`, detail page | CODE |
| NOTIF-13 | Dup | P3 | chat fast path + cron 경합 시 web push 중복 (web 대상 device_id null) | `dispatch-push-for-user.ts:71-73` | CODE |
| EVENT-05 | User Event | P2 | 사용자 이벤트 목록 화면 없음 (제품 정책 결정 필요) | 라우트 부재 | CONFIRMED |
| EVENT-06 | Campaign | P2 | 공지 캠페인이 app_notices 존재/노출 검증 없이 발송 | `customer-center-campaign-bind.ts:9-29` | CODE |
| EVENT-07 | Admin Event | P2 | 이벤트 비게시 시 popup/banner 자동 중지 안 됨 | `[eventId]/route.ts:263-272` | CODE |
| EVENT-08 | Admin UX | P3 | 하단 알림 배너 feed 가 `notice_published` 미포함(컴포넌트 미마운트), 캠페인 재시도 시 중복 캠페인, 공개 API 내부 필드 노출, 기간 TZ 고정, published_at 재설정, 삭제 UI 부재 | admin 감사 D5,D7,D10-D13 | CODE |
| AUTH-01 | DB drift | P2 (범위 밖) | call_log_user_hides 테이블 Prod 미적용 | §1 | CONFIRMED |

---

## 11. NOT_PROVEN ITEMS

- 실기기 수신 전부 (Android phone/tablet, iPhone × FG/BG/Killed × tap × sound) — 이 환경에 실기기 없음.
- iOS cold-start tap 라우팅, iOS FG 표시 기본값, CallKit 미보고 VoIP 경로 안전성.
- Android 매니페스트 병합 후 Capacitor 기본 MessagingService 와 커스텀 서비스 중 어느 쪽이 활성인지 (node_modules 미설치).
- Prod env 실제 값 (`PUSH_DISPATCH_ENABLED`, `APNS_PRODUCTION`, VoIP key 등) — 값 미열람. 단 Prod 실측 sent 건수로 FCM/APNs/VoIP 발송 경로는 동작 중.
- Release iOS 빌드 aps-environment.
- T4~T7 (device received / presented / tap / usable) latency.
- 로그아웃 시 전체 페이지 리로드 여부(목록 rows 잔존).
- Badge 수치 vs 목록 일치(support_* 의 unsupported 처리, NOTIF-19 추론).
- Web push 구독 존재 여부 및 실제 수신.

### 측정된 latency (T1→T3, Prod 30일, notification_events.created_at → 첫 sent delivery)
| type | p50 | p95 |
|---|---|---|
| chat_message | 1.0s | 13.8s |
| trade_message | 0.46s | 2.8s |
| group_message | 0.61s | 4.4s |
| order_status | 0.31s | **106s** (cron 경로) |
| store_order_message | 0.50s | **77s** |
| support_* | ~0.3–0.4s | <0.75s |
| notice / admin_notice | ~0.3–0.5s | <0.5s |
T0(제품 이벤트)→T1, T4~T7 은 계측 없음.

---

## 12. 다음 Repair 순서 (제안, Owner 승인 후)

1. **R1 — 전달 신뢰성**: PUSH-02(재시도 무효) · PUSH-03(Android 토큰 갱신 업로드) · NOTIF-02(그룹초대/레거시 거래채팅 domain pair) · NOTIF-03(CM 비텍스트 메시지 타입·handoff).
2. **R2 — iOS 통화 중복**: PUSH-01 (통화 계열은 VoIP 가 있으면 apns alert 차단) + PUSH-04/05.
3. **R3 — CTA 정확성**: CTA-01(구매자 주문 상세) · CTA-04 · CTA-03(캠페인 URL 정규화) · CTA-02(web login next) · CTA-05/06.
4. **R4 — In-App 정직성**: NOTIF-01 · NOTIF-04 (ERROR/EMPTY 분리, 실패 응답 정직화).
5. **R5 — Admin Event 운영 경로**: EVENT-01 · EVENT-02 · EVENT-03 · EVENT-07 · EVENT-04 · EVENT-06.
6. **R6 — 분류·우선순위·사운드**: PUSH-06 · NOTIF-06/07 · SOUND-01/02 · NOTIF-09 cron 스케줄(제품 확인 필요).
7. **R7 — 정리**: PUSH-07/08/09/10/11, NOTIF-05/08/10/11/12/13, CTA-07/08, dead path 정리(삭제는 별도 승인).
8. **실기기 Matrix**: R1~R3 이후 Android/iPhone 실기기 FG/BG/Killed × 대표 이벤트.

Owner 결정 필요: EVENT-05(이벤트 목록 화면 신설 여부), 이벤트/공지 삭제 정책, NOTIF-09(리마인더·자동완료 cron 활성화 여부), SOUND-01(커스텀 사운드를 native 에 실제 반영할지 vs 시스템 기본음 유지를 정책으로 확정할지).

## FINAL VERDICT (Phase 0)

`FAIL` — P1 결함 다수 확인, 실기기 runtime 미증명.

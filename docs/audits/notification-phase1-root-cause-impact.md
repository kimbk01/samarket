# DIBAY Notification — PHASE 1 Root Cause & Impact Assessment (Approval Gate)

- 작성일: 2026-10-04 · 기준: HEAD = origin/main = Production `9d5ac23a` (변동 없음)
- **READ ONLY.** 제품 코드·DB·Native·배포 변경 없음. 이 문서만 추가.
- 근거 원칙: subagent 보고는 증거로 채택하지 않음. 아래 판정은 **직접 읽은 코드 라인 + Production DB 직접 조회 + (해당 시) 순수 함수 실행 결과**만 사용.
- 판정: `CONFIRMED` / `PARTIALLY_PROVEN` / `NOT_PROVEN` / `FALSE_POSITIVE`
- 증거 접근 한계: Vercel runtime logs **403 (권한 없음)**, 실기기 없음, iOS/Android 빌드 불가(node_modules 미설치, Xcode 없음).

---

## 1. Phase 0 허위·과장·추측 검증 (정정 사항 먼저)

| Phase 0 항목 | Phase 0 주장 | 재검증 결과 | 판정 |
|---|---|---|---|
| **PUSH-01** iOS 통화 중복 | "Prod 에서 apns≈voip 건수 동일 = 이중 발송 증거" | **허위 상관.** 통화별·**물리 device_id 별**로 조인하면 동일 기기에 apns+voip 가 같은 통화로 나간 사례 **0건** (ringing 280 / cancel 108 / answered_elsewhere 102 / end 57 / reject 19 통화 전수). apns 는 `device_id=be9c8444…`(apns 행만 존재), voip 는 `device_id=85977e86…`(voip 행만 존재) 로 **서로 다른 설치**에 나갔음. | 중복 주장 **FALSE (과거 데이터)**, 잠재 위험은 §3 PUSH-01 |
| PUSH-06 order/support NORMAL priority | "order_status 등 NORMAL 로 나감" | Prod `notification_deliveries.provider_response.priority`: **order_status = high (27/27)**, chat/group/trade/store_order = high. NORMAL 은 support_*, admin_notice, notice, community_activity, trade_status — `resolveAndroidPriorityForData` 의 명시 정책 | **FALSE_POSITIVE** (order) / 정책 (나머지) |
| CTA-02 web 로그인 next 소실 | "목적지 소실 = 결함" | `lib/auth/auth-route-classification.ts` `FRESH_LOGIN_DENIED_PREFIXES` / `sanitizeLoginNextPath`: **계정 의존 경로(방·주문·알림)는 로그인 후 복원 금지** 가 명시된 보안 정책 | **FALSE_POSITIVE** (정책) |
| CTA-03 캠페인 `/https://…` | "현재 코드 결함" | Prod 해당 행 **1건, 2026-08-05 test-send** (`dedupe_key …:1785925214788`). 현행 `toInternalCampaignPath` 는 `https://…` → pathname 으로 정상 변환. 현행 코드 재현 불가 | **FALSE_POSITIVE** (과거 데이터 1건) |
| NOTIF-02 레거시 거래채팅 알림 누락 | "레거시 route 가 알림을 못 만듦 → 사용자 누락" | 코드상 skip 은 사실. 그러나 Prod `chat_messages` 30일 136건 = CM `trade_message` 136건, 마지막 시각 차 0.2s → **CM 미러 쓰기**. message 알림 전체(2,787건)가 CM room 대상, legacy room 대상 0건. 레거시 route 실사용 **미관측** | 레거시 부분 **NOT_PROVEN (트래픽 미관측)** |
| CTA-06 레거시 group-chat 링크 | "잘못된 방 링크" | Prod `group_messages` **0행 (전 기간)** — 경로 미사용 | **NOT_PROVEN (도달 불가)** |
| PUSH-05 / NOTIF-13 / B-4 web push | 중복/빈 알림 | Prod `web_push_subscriptions` **0행**, web_push delivery **0건** | **NOT_PROVEN (노출 없음)** |
| PUSH-04 answered_elsewhere NORMAL | "Doze 로 계속 울림" | priority NORMAL 은 **CONFIRMED** (Prod 250/250). 그러나 울리는 중인 기기는 화면 on(FSI) 상태 → Doze 아님. 실제 계속 울림 증거 없음 | **PARTIALLY_PROVEN** (사실만, 영향 미증명) |
| PUSH-14 Capacitor 기본 서비스가 FCM 을 가로챌 수 있음 | 불확실 | Prod FCM incoming call **native ack 95%+** (`IncomingCallPushAckHelper.java` → `/push-ack`, 최근 8주 매주) → **커스텀 `DibayFirebaseMessagingService` 가 수신함** | **FALSE_POSITIVE** |
| PUSH-11 `APNS_VOIP_KEY_P8` 반쪽 | 결함 | 코드상 사실이나 Prod VoIP 발송 성공 다수 → `APNS_KEY_P8` 설정됨, 현재 영향 0 | **NOT_PROVEN (잠재 설정 위험)** |
| 지연 p95 106s (order) | 결함처럼 기술 | commerce 는 설계상 cron(2분) 경로 — 결함 아님 | 정책 |

**Phase 0 에서 과장/허위였던 핵심 1건(PUSH-01 Prod 증거)과 오분류 4건(PUSH-06, CTA-02, CTA-03, PUSH-14)을 공식 정정한다.**

---

## 2. 확정 결함 (CONFIRMED) — 원인 증거 포함

### EVENT-09 (신규) — 반복(recurring) 캠페인이 2회차부터 영구 정지 · **CONFIRMED**
- **증상**: Prod 유일 반복 캠페인 `88db384a…`(daily 09:00 KST, 08-13~08-19) — occurrence **1건만** 존재, 기간 종료 후에도 `status=active`. 2~7회차 미생성.
- **증거**:
  - Prod occurrence #1: `scheduled_for=2026-08-14T00:00Z`, `status=sent`, `completed_at=2026-08-12T10:56:56Z` (예정보다 **먼저** 완료).
  - `claim-scheduled-campaign.ts:242-247` `after = lastOcc.completed_at ?? scheduled_for …` → `after=08-12`.
  - `campaign-recurrence.ts computeNextRecurrenceScheduledFor` 를 Prod 값으로 **실행**: seq 2 → `2026-08-14T00:00Z` (= #1 과 동일).
  - `ensure_admin_notification_campaign_occurrence` (migration `20261029120000:426-436`): 같은 `scheduled_for` 의 `sent` 행이 있으면 **기존 행 반환** → 신규 생성 없음. `!next` 분기에도 도달 못 해 `ended` 전환도 없음. 매 5분 tick 반복.
- **First divergence**: occurrence #1 이 `scheduled_for` 이전에 실행됨 + 다음 회차 계산 기준이 `completed_at`.
- **확정 Root Cause**: 다음 회차 기준 시각을 `max(scheduled_for, completed_at)` 이 아닌 `completed_at` 우선으로 잡음 → 조기 실행된 회차와 동일 슬롯 재계산 → RPC 멱등 분기가 기존 행 반환.
- **미확정 부분**: #1 이 왜 08-12 에 즉시 실행됐는지(생성 플로우가 recurring 첫 회차를 즉시 drain 하는지) — 별도 추적 필요(**NOT_PROVEN**).

### EVENT-01 — 저장된 draft 캠페인(이벤트 Push/Bell 포함)을 Admin UI 에서 발송할 수 없음 · **CONFIRMED**
- 코드: `/api/admin/notification-campaigns/{id}/send` 호출 UI 는 `AdminNotificationCampaignCreatePage.tsx:287` **1곳뿐**. `AdminNotificationCampaignDetailPage.tsx` 의 fetch 는 조회·이벤트/공지 조회·occurrence cancel 만 (114/147/192/230). 이벤트 패널 `requestPushSend` 는 `distribution/push/send`(발송 안 함, `sendPath` 반환) → 상세로 이동하며 "실제 발송은 캠페인의 Push 보내기에서만" 안내(`AdminPlatformEventDistributionPanel.tsx:519-529`) — 그 버튼이 없음.
- Prod: `create_request_id like 'event-dist-%'` 캠페인 **7건 전부 draft, 발송 0**.
- Root Cause: 상세 화면에 기존 `/send` 계약을 호출하는 진입점이 구현되지 않음 (서버 send API·claim·멱등은 존재).

### NOTIF-03 — CM 이미지/스티커/파일/음성/공유 메시지 알림의 type 오분류 · **CONFIRMED**
- Prod: image @ private_group → `type=chat_message, chat_domain=group` **13건**; image @ store_order → `type=chat_message, chat_domain=store_order` **4건**. (텍스트는 group_message/store_order_message 정상.)
- 코드: `service.ts:12585-12603 notifyCommunityMessengerMessageRecipients` 가 `roomKind` 미전달 → `notify-message-pipeline.ts:60-63 resolveEventType` → `resolveMessageEventTypeFromDirectKey(undefined)` → `chat_message`. 텍스트 경로는 `community-messenger-send-post-ack-effects.ts:143-147 resolveNotificationMessageRoomKind({chatDomain, roomType, directKey})` 사용.
- 실제 영향(registry `notification-event-registry.ts:91-197`): store_order/trade 이미지가 `preferenceKey: chat`(원래 delivery/trade), `soundEventKey`·`androidChannelKey`(원래 delivery/trade 채널) 오적용, deepLinkResolverKey `chat_room`. 그룹 이미지는 mention 미처리. `deferPush`/handoff 미적용(void, `after()` 미사용).
- Root Cause: 비텍스트 5개 호출부(`service.ts:16731,16902,17074,17235,17979`)가 roomKind 분류 계약을 우회.

### CTA-01 — 구매자 주문 알림이 주문 상세가 아닌 주문 목록으로 이동 · **CONFIRMED**
- Prod: buyer `order_status` routeUrl `/my/store-orders` **323건**.
- 코드: `notify-store-commerce.ts:30` 상수 → 323/625/674/718/770/815 `link_url`; `append-user-notification.ts:178` → `display_payload.routeUrl`; `inbox-events-merge.ts:367-375` routeUrl 이 order_id 분기(418-431, `/mypage/store-orders/{id}`)보다 **먼저** 반환. push 도 같은 routeUrl (`notify-push-dispatcher.ts`).
- 의도 근거: `resolve-notification-inbox-href.ts:196` 주석 "구매자 매장 주문 알림: 주문 상세로 직행", 도달 불가능한 detail 분기 존재. 상세 페이지 `app/(main)/mypage/store-orders/[orderId]` 존재.
- 정책 충돌 없음(로그인 상태 탭; FRESH_LOGIN 정책은 로그인 후 복원에만 적용).

### NOTIF-01 — 알림 목록 DB 오류를 "알림 없음"으로 반환 · **CONFIRMED (코드 결정적)**
- `inbox-events-merge.ts:706-712` error → `console.warn` 후 `return filled`(대개 `[]`); `app/api/me/notifications/route.ts:401-463` 은 `ok:true` 로 응답. 클라이언트 EMPTY/ERROR 분기는 존재하나 서버가 오류를 숨김.
- Prod 발생 빈도: **NOT_PROVEN** (runtime log 403).

### NOTIF-04 — "모두 읽음" DB 실패도 성공 응답 · **CONFIRMED (코드)**
- `inbox-read-bridge.ts:553 if (uErr) return 0;` → route `ok:true`. 발생 빈도 NOT_PROVEN.

### CTA-04 — 리뷰 답글 알림이 구매자를 사장님 전용 페이지로 보냄 · **CONFIRMED**
- `app/api/me/stores/[storeId]/reviews/[reviewId]/reply/route.ts:130` `link_url: "/stores/owner/reviews"` (수신자 = buyerUserId). `push_kind:"delivery"` → `order_status`. Prod 1건.
- 올바른 목적지(구매자 리뷰/주문 화면)의 **제품 정의는 미확정** → Owner 결정 필요.

### CTA-05 — 보관된 push route 가 다른 계정 로그인 후 재생될 수 있음 · **CONFIRMED (코드)**
- `PushRouteListener.tsx:312-337` hold/login 시 `writePendingPushRoute` 에 `recipientUserId` 미저장; `:228-245` 재생 시 recipient 있을 때만 계정 비교. → 계정 의존 경로를 신규 계정에 열어줌 = `FRESH_LOGIN_DENIED_PREFIXES` 정책과 **모순**. 데이터는 목적지 API 가 거부(방 `messengerRoomCanonicalOrJsonError`, 주문 buyer 필터) → 노출은 route id 수준.

### CTA-07 — 알림 상세 페이지 Back 루프 · **CONFIRMED (코드)**, 런타임 NOT_PROVEN
- `notifications/[notificationId]/page.tsx:166-189` canonical 목적지면 자동 `activateNotificationDestination` → `navigate-notification-destination.ts:29 router.push`. 가드 `canonicalRedirectedRef` 는 mount 단위 → Back 으로 재마운트 시 다시 push.

### PUSH-02 — 실패 push 의 cron 재시도가 동일 기기에 재전송하지 못함 · **CONFIRMED (코드)**, Prod 영향 **미관측**
- `dispatch-push-for-user.ts:380-405` 1차 시도에서 `(notification_event_id, device_id)` 행 생성 → 실패 시 status=failed 로 update. 재시도 시 UNIQUE(`20261012130000:40-42`) 충돌 → `duplicate_delivery` skip → outcome `noop`(:494) → handoff `handed_off`(`commerce-notification-push-handoff.ts:181-188`, chat 동일).
- Prod: handoff 대상 이벤트 중 실패 delivery 2건은 모두 **영구 오류(NotRegistered)** — 재시도 대상 아님. 일시 오류("pending stream canceled") 실패는 handoff 비대상 타입(support/community/notice)에서만 관측 → 이 경로들은 **애초에 재시도 자체가 없음**.
- 결론: 재시도 설계가 무효인 것은 코드로 확정, 실제 손실 사례는 관측되지 않음. 심각도 P2.

### PUSH-07 — iOS VoIP 토큰 invalidate 가 사용자 전체 iOS VoIP 행 비활성 · **CONFIRMED (코드)**
- `register-native-push-client.ts:549-555` body `{push_provider:"voip_apns"}` 만 전송 → `devices/deactivate/route.ts:113-119` user+provider+env 전체 update. Prod 영향: 활성 VoIP 사용자 1명·1행 → 관측 불가.

### NOTIF-02 (그룹 초대) — 그룹 초대 알림 INSERT 가 DB CHECK 로 실패 · **CONFIRMED (코드+스키마, 결정적)**
- `community-messenger-group-inapp-notify.ts:27-44` → `appendUserNotification` (meta.kind `community_group_invite` → `group_message`, `append-user-notification.ts:56`) → `createAndDispatchNotificationEvent` 에 `chatDomain/domainIdentityKey` **미전달**(:167-190) → Prod CHECK `notification_events_message_domain_required_check` 위반 → `createNotificationEvent` 가 `{ok:false}` 반환(throw 아님, 로그 없음).
- Prod: 초대 알림 2026-07 12건 후 0건. 제약 도입 = WP-4(2026-10-02) 이후 그룹 생성 0건 → **런타임 미관측, 결정적 실패 경로**.
- 7~9월 0건은 별도 원인 가능(9월 그룹 25개 생성됐으나 다른 생성 경로일 수 있음) — **NOT_PROVEN**.

### NOTIF-09 — 주문 접수 리마인더 / 자동완료 cron 미스케줄 · **CONFIRMED**
- `vercel.json` 미등록, pg_cron/pg_net 미설치, Prod `commerce:owner:accept_reminder:*` **0건(전 기간)**. `docs/dibay-delivery-product-hard-lock.md:43` 에 "NOT_RUN" 기록 → **알려진 상태**. 활성화는 제품 결정.

### SOUND-01 — 관리자 지정 커스텀 알림음이 BG/Killed 메시지 push 에 반영되지 않음 · **CONFIRMED (사실)**, 결함 여부는 **정책 결정**
- Prod `notification_sound_mappings` 36건 전부 `use_device_default=false`, 원격 URL(`dibay_custom`) 자산.
- Android 메시지 채널 `DibayNotificationChannelRegistry.java:105-111` setSound 없음, `res/raw` 없음 → 시스템 기본음. iOS `apns-sender-impl.ts:209 sound:"default"`.
- 통화 벨소리는 `DibayForegroundRingtone` 이 `ringtoneUrl` 로 커스텀 재생(정상). In-app(FG) 재생은 URL 사용.
- 플랫폼 제약: OS 알림음은 앱 번들 자산(Android res/raw·iOS bundle)만 사용 가능 → 원격 URL 을 그대로 쓸 수 없음. **수정 = 신규 기능(자산 번들/다운로드·채널 버전업)** → 신규 요구로 분리.

### EVENT-02 — 이벤트 Push/Bell 캠페인 내용 동결 · **PARTIALLY_PROVEN**
- 코드: 고정 `create_request_id` 재사용 시 `campaign-create-service.ts:73-90` 기존 행 그대로 반환(수정 없음) — CONFIRMED.
- Prod: distribution config 와 campaign 본문 불일치 행 존재(`QA bell — open Event A` vs `QA-DEVICE-CLOSE-… open Event A`)하나 campaign 쪽이 **나중에** 수정됨 → 동결 메커니즘의 직접 증거는 아님.

### EVENT-03 — 종료/비게시 이벤트 히어로 배너 노출 가능 · **PARTIALLY_PROVEN**
- 코드: `load-active-event-hero-banners.ts:25-53` 이벤트 status/기간 미검사, API route 도 미검사 — CONFIRMED.
- Prod: banner distribution **전부 disabled** → 현재 노출 0. 운영자가 끄지 않으면 노출되는 잠재 결함.

### EVENT-06 — 공지 캠페인이 app_notices 존재/노출 미검증 · **CONFIRMED (코드)**, Prod: 삭제된 공지에 묶인 **draft 2건**(발송 0).

### PUSH-03 — Android `onNewToken` 미업로드 · **PARTIALLY_PROVEN**
- 코드 사실 CONFIRMED (`DibayFirebaseMessagingService.java onNewToken` 로컬 저장만).
- 완화 경로: `NativePushRegistration.tsx:200` 인증 세션마다(SIGNED_IN/INITIAL_SESSION) 재등록 → 갱신 토큰은 **다음 앱 실행 시 업로드**. 손실 창 = 토큰 회전 후 앱 미실행 기간. Prod FCM NotRegistered 실패 30일 ~4건 → 영향 소규모. 심각도 P3.

### PUSH-01 (재정의) — iOS 통화 종료/취소 시 일반 APNs alert("통화", 빈 본문, sound default) 발송 · **PARTIALLY_PROVEN**
- 코드 CONFIRMED: `resolveCallPushProviderPolicy` 가 apns 를 항상 allow(`push-payload-types.ts:163-193`, 테스트 "Jul 11 CallKit dismiss PASS restore" 로 **의도적 고정**), `send-community-messenger-call-canceled-push.ts:38-39` title "통화" body "", `apns-sender-impl.ts:209` sound default, push-type alert.
- Prod CONFIRMED: apns-only 설치(`be9c8444`)에 call_cancel/end/answered_elsewhere alert HTTP 200 다수.
- **미증명**: iOS 가 실제 배너+소리를 표시하는지(실기기 필요), 동일 기기 CallKit 과의 중복(0건 관측). 2026-10-01 부터 `85977e86` 에 apns 행이 추가되어 **이후 통화부터는 동일 기기 이중 발송 경로가 열림**(아직 통화 없음).
- **apns-only 설치에서는 apns alert 가 유일한 착신 수단** → apns 차단은 정상 착신 파괴 위험. 증명 전 수정안 확정 금지.

---

## 3. 미확정 결함 (NOT_PROVEN / PARTIALLY_PROVEN 유지) — 수정 계획 확정 항목에서 제외

| ID | 내용 | 현재 판정 | 증명에 필요한 것 |
|---|---|---|---|
| EVENT-10 (신규) | immediate occurrence 41건 `queued` 영구 잔류, `sent` occurrence 13건의 campaign 이 `draft` 유지 | 증상 CONFIRMED / 원인 NOT_PROVEN | 생성→send 흐름 실패 지점 추적, runtime log |
| EVENT-09-b | recurring #1 이 예정 전 즉시 실행된 원인 | NOT_PROVEN | 생성 플로우 코드 추적 |
| PUSH-10 | `notification_deliveries` pending 113건(6~9월, call 위주) 정체 | 증상 CONFIRMED / 원인 NOT_PROVEN (함수 타임아웃·프로세스 종료 추정 금지) | runtime log |
| PUSH-08 | 세션 없는 로그아웃 시 apns 행 잔존 | 코드 정황만 | 실기기 로그아웃 시나리오 |
| PUSH-09 | `notification_permission_status` 전 행 NULL | 사실 CONFIRMED / 결함 여부(쓰기 경로 미구현 의도?) NOT_PROVEN | 설계 문서 확인 |
| PUSH-12 | iOS FG presentationOptions 미설정 → FG 미표시 | NOT_PROVEN | 실기기 |
| SOUND-02 | missed call 채널 ID 서버 `_v1` ≠ native | 코드 사실, native 가 서버값 무시 → 영향 0 | — |
| SOUND-03 | Android FG 알림 OS음 + in-app음 이중 | NOT_PROVEN | 실기기 |
| NOTIF-05 | 명시 key 없는 producer 의 title/body/link 기반 dedupe → 반복 이벤트 억제 | 패턴 CONFIRMED (`append-user-notification.ts:66-84`), producer 별 실제 억제 NOT_PROVEN | producer 별 ref_id 사용 여부 전수 확인 |
| NOTIF-06 | 배달광고·비즈캐시 거래성 알림 `push_kind:"marketing"` | 코드 CONFIRMED (4곳) / 결함 여부 = 분류 정책 결정 | Owner 정책 |
| NOTIF-07/08/10/11/12 | 분류 불일치·self 알림·Date.now key·reconcile unread 재마킹·목록 페이징 | subagent 보고, 직접 검증 미완 | 개별 재검증 |
| A-2/A-5/A-6/A-8/A-9/A-10/A-12/B-5/B-8/B-11 | In-app/CTA 세부 | 직접 검증 미완 | 개별 재검증 |
| AUTH-01 | `community_messenger_call_log_user_hides` Prod 미적용 | CONFIRMED (알림 범위 밖) | 별도 트랙 |

---

## 4. 수정 시 영향 범위 (호출자·소비자 추적)

| 후보 | 공유 함수/계약 | 호출자·소비자 (직접 확인) | 영향받으면 안 되는 기능 |
|---|---|---|---|
| EVENT-09 | `scheduleNextRecurringOccurrence`, `ensure_admin_notification_campaign_occurrence` RPC | 호출: scheduled cron 2곳(`route.ts` drain 후 + active recurring 순회). RPC 는 scheduled/recurring 생성 공용 | immediate/test/scheduled 발송, 멱등(중복 회차 방지) |
| EVENT-01 | 기존 `/send` API (claim·idempotency) | 신규 UI 진입점만 추가. 서버 send route·`run-campaign-send-batch`·`campaign-send-user` 무변경 | 생성 페이지 즉시 발송, 중복발송 방지(claim) |
| NOTIF-03 | `notifyMessagePipeline` (공용), `resolveNotificationMessageRoomKind` | 비텍스트 호출부 5곳만 수정 시 텍스트 경로·레거시 route·pin·group-chat 무영향. pipeline 내부 수정 시 **모든 메시지 알림 영향** → 호출부 수정 권장 | 텍스트 알림, unread/room bump(별도 RPC), CM Realtime 계약 |
| CTA-01 | `notify-store-commerce.ts` buyer link_url | 소비자: inbox merge(routeUrl), list tap resolver, push 발송 routeUrl, `isOwnerOrderSide`(owner 판정 `/stores/owner` 포함 여부 — buyer 상세 경로는 무관), group-inbox-by-thread(주문 키 그룹핑), PushRouteListener auth gate(`isAuthRequiredPushRoute`) | owner 주문 알림, 기존 323행(목록 링크 유지 = 하위호환), commerce handoff·dedupe key 불변 |
| NOTIF-01 | `fetchNotificationEventsForInbox` | 호출 1곳(`/api/me/notifications` GET). 응답 소비자 12곳: `MyNotificationsView`, `PhilifeHeaderNotificationInbox`, `OwnerNotificationList`, `AdminNotificationList`, `fetch-me-notifications-deduped`(503 캐시), `shared-notification-store`, `resolve-tier1-bell-surface`, `owner-dashboard-notifications-snapshot`, 상세 페이지 등 | 정상 응답 형식, owner 목록, badge count(별도 API) |
| NOTIF-04 | `markCanonicalMemberANotificationEventsRead` | PATCH 2개 분기 | 정상 read-all, unread cache invalidation |
| CTA-05 | `writePendingPushRoute` / replay | PushRouteListener 내부 | Native cold start 탭, support modal 재생 |
| CTA-07 | 상세 페이지 자동 이동 | 상세 페이지만 (`activateNotificationDestination` 은 목록 tap 도 공유 → 공유 함수는 수정 금지, 상세 페이지 호출만 replace) | 목록 tap Back 동작 |
| PUSH-02 | `insertNotificationDelivery` + UNIQUE | 호출 8곳(§caller list). UNIQUE 는 **chat fast path ↔ cron 동시 발송의 유일한 native 중복 방지 장치** | 중복 방지(sent/pending 행 재발송 금지) |
| NOTIF-02 | `appendUserNotification` 타입 매핑 | 그룹 초대 외에 `notification_type:"chat"`·meta.kind `group_chat/trade_chat/community_chat` 사용 producer 동일 경로 | 초대를 chat unread/badge 로 셀지 = 정책 |

---

## 5. 결함별 수정 설계 (Root Cause 확정 항목만)

### EVENT-09
- 수정 대상: `lib/admin/notification-campaigns/claim-scheduled-campaign.ts` (`after` 계산 1곳).
- DB 변경: 없음.
- 변경: `after = max(lastOcc.scheduled_for, lastOcc.completed_at)` (둘 다 없으면 기존 fallback).
- 전후 차이: 조기 실행된 회차가 있어도 다음 슬롯으로 진행. 기간 종료 시 `ended` 로 전환.
- 대안/위험: (a) RPC 의 `sent` 동일 슬롯 반환 분기 제거 → 중복 회차 위험(기각). (b) 현안(코드 1곳) — 최소.
- 기존 정지 캠페인 `88db384a…`(QA, 종료일 경과): 수정 배포 후 다음 tick 에서 `!next` → `ended` 로 전환될 것으로 예상(소급 발송 없음 — `after > endAt`). **이 데이터 변화도 승인 대상.**
- 회귀: recurrence 단위 테스트(조기 완료 케이스 추가), scheduled/immediate 기존 테스트.
- 검증: Prod 에 신규 테스트 recurring 캠페인(selected_users=QA 계정) 생성 → 2회차 생성·발송 확인.
- Rollback: 단일 커밋 revert.
- 불확실성: EVENT-09-b(조기 실행 원인) 미해결 — 이것만 고치면 증상은 해소되나 "1회차 조기 발송" 자체는 남음.

### EVENT-01
- 수정 대상: `components/admin/notifications/AdminNotificationCampaignDetailPage.tsx` (발송 확인 다이얼로그 + 기존 `/send` 호출, create page 와 동일 idempotency 규약).
- DB/서버 변경: 없음.
- 위험: 중복 발송 → 서버 claim(`send/route.ts:116-160`)이 방어. 버튼은 status=draft/queued 에서만 노출.
- 회귀: 생성 즉시발송, 테스트 발송, occurrence cancel.
- 검증: Prod QA 계정 대상 draft → 상세에서 발송 → `notification_events`·delivery·실기기 수신.
- 연계: EVENT-02(동결) 는 별개 승인 — 발송 가능해지면 동결된 내용이 발송되므로 **EVENT-01 단독 배포 시 이벤트 캠페인은 최초 저장 문구로 나감**을 Owner 가 인지해야 함.

### NOTIF-03
- 수정 대상: `lib/community-messenger/service.ts` `notifyCommunityMessengerMessageRecipients` 및 5개 호출부 — 텍스트 경로와 같은 `resolveNotificationMessageRoomKind({chatDomain, roomType, directKey})` 로 roomKind 전달.
- DB 변경: 없음. 기존 오분류 행 소급 수정 안 함.
- 전후: 그룹/거래/주문방 비텍스트 알림이 각 도메인 type·preference·sound·channel 로 분류.
- 위험: 사용자 설정(거래 채팅 off 등)에 따라 **이전엔 오던 push 가 안 올 수 있음**(올바른 동작이지만 체감 변화). roomType/chatDomain 조회 1회 추가(성능 미미, 측정 필요).
- 분리: deferPush/handoff 적용은 별도 항목(성능 민감 경로 — 본 승인과 분리).
- 회귀: 텍스트 알림 타입, mention, 1:1 이미지, unread bump, Realtime bump(무변경 확인).
- 검증: Prod QA 방(1:1/그룹/거래/주문)에 이미지 전송 → `notification_events.type` 확인 + 실기기 채널/소리.

### CTA-01
- 수정 대상: `lib/notifications/notify-store-commerce.ts` buyer 알림 6곳 `link_url` → `/mypage/store-orders/{orderId}` (상세 경로는 inbox resolver 가 이미 생성하는 경로와 동일).
- DB 변경 없음. 기존 323행은 목록 유지(하위호환).
- 확인 필요 사항(승인 전 질문): 주문 상세 정본이 `/mypage/store-orders/[orderId]` 인지 `/my/store-orders/[orderId]` 인지 (둘 다 존재). resolver 는 `/mypage/…` 사용.
- 위험: 삭제/숨김 주문 → 상세 페이지 not-found 처리 확인 필요. 구버전 앱: routeUrl 문자열만 바뀌므로 영향 없음.
- 검증: QA 주문 상태 변경 → in-app tap·push tap(FG/BG/Killed) → 해당 주문 상세 도착, Back.

### NOTIF-01 / NOTIF-04
- 수정: 서버가 DB 오류 시 `ok:false` + 5xx 반환(빈 배열 위장 제거). 12개 소비자의 오류 처리 경로를 **먼저 전수 확인** 후 진행(특히 `fetch-me-notifications-deduped` 503 캐시 20s, 헤더 벨 `if (!j?.ok) return;`).
- 위험: 일시 오류 시 사용자에게 오류 문구 노출 증가(정직한 동작).
- 이 항목은 소비자 감사가 끝나기 전 **설계 확정 보류**.

### CTA-05 / CTA-07
- CTA-05: pending route 기록 시 현재 bound user 를 함께 저장, 재생 시 불일치·미기록이면 계정 의존 경로를 폐기(기존 FRESH_LOGIN 정책과 동일 기준 사용).
- CTA-07: 상세 페이지의 자동 이동만 `router.replace` 사용(공유 `activateNotificationDestination` 시그니처에 옵션 추가, 기본값 불변).
- 둘 다 Native cold start·support modal 회귀 필요.

### PUSH-02 (설계 초안 — 승인 시 별도 심층 검증 후 확정)
- 원칙: 중복 방지는 유지, **failed 행만** 재사용. insert 충돌 시 기존 행이 `failed`(일시 오류) 일 때만 조건부 update(`status failed→pending`, compare-and-set) 후 재전송; `sent/pending` 이면 기존처럼 skip.
- DB: 컬럼/인덱스 변경 불필요(조건부 UPDATE). RLS 무관(service role).
- 위험: chat fast path 와 cron 경합 — CAS 로 1개만 재전송. 영구 오류(bad token) 는 재시도 금지 유지.
- 현재 실손 사례 0 → 우선순위 중간.

### SOUND-01, NOTIF-09, CTA-04, EVENT-05, NOTIF-06, PUSH-01
- **수정 설계 보류 — Owner 정책 결정 선행** (§8).

---

## 6. 전역 영향 Matrix

| Domain | Current Behavior | Proposed Change | Dependency | Regression Risk | Verification |
|---|---|---|---|---|---|
| Chat | 비텍스트 메시지 알림 type=chat_message | NOTIF-03 호출부 roomKind 전달 | `notifyMessagePipeline`, display context | 중 (설정별 push 수신 변화) | Prod QA 방 4종 + 실기기 |
| Call | iOS terminal apns alert 발송(의도 고정) | **변경 없음** (증명 전) | call provider policy | — | 실기기 선행 |
| Order | buyer 알림 → 목록 | CTA-01 상세 경로 | inbox resolver, push route | 낮음 | QA 주문 상태 변경 + tap |
| Delivery | 리마인더 cron 미가동 | 변경 없음(결정 대기) | vercel.json | — | — |
| Trade | 비텍스트 거래방 알림 chat 분류 | NOTIF-03 에 포함 | 동일 | 중 | 동일 |
| Community | 변경 없음 | — | — | — | 회귀만 |
| Event | draft 발송 불가, recurring 정지 | EVENT-01 UI, EVENT-09 after 계산 | 기존 send API, RPC | 낮음 (서버 무변경 / 1줄) | QA 캠페인 |
| Admin | 상세에 발송 없음 | EVENT-01 | claim/idempotency | 중복 발송(서버 방어) | 이중 클릭·재시도 테스트 |
| Android | 커스텀 서비스 정상 수신(ack 95%) | 변경 없음 | — | — | 실기기 |
| iOS | apns+voip 등록 | 변경 없음 | — | — | 실기기 |
| DB/Cloud | 스키마 변경 없음 | 없음 (EVENT-09 로 QA 캠페인 1건 `ended` 전환 예상) | RPC | 낮음 | 쿼리 확인 |

---

## 7. 위험도별 작업 순서 (재결정)

Phase 0 R1~R7 폐기. 원인 확정 + 영향 국소 + 롤백 용이 순:

| 순서 | 단위 | 근거 | 위험 |
|---|---|---|---|
| U1 | **EVENT-09** | 원인 실행 증명 완료, 1곳 수정, 서버 cron 전용 | 낮음 |
| U2 | **EVENT-01** | UI 만, 서버 계약 재사용 | 낮음 (EVENT-02 인지 조건) |
| U3 | **CTA-01** | 문자열 6곳, 하위호환 | 낮음 (정본 경로 결정 필요) |
| U4 | **NOTIF-03** | 5 호출부, 핫패스 인접 → 성능 측정 동반 | 중 |
| U5 | **CTA-07 / CTA-05** | 클라이언트 라우팅, Native 회귀 필요 | 중 |
| U6 | **NOTIF-01 / NOTIF-04** | 소비자 12곳 감사 후 설계 확정 | 중 |
| U7 | **PUSH-02** | 중복 방지 장치와 결합 — 별도 심층 검증 후 | 중~높음 |
| 보류 | PUSH-01, SOUND-01, NOTIF-09, CTA-04, NOTIF-06, EVENT-02/03/05/06/10, PUSH-03/07 | 정책 결정 또는 추가 증명 필요 | — |

통화(Call)·주문 상태 전이·채팅 send/unread RPC 는 **이번 계획에서 수정 대상 아님.**

---

## 8. 회귀 테스트 계획

| 층 | 내용 | 이 환경 가능 여부 |
|---|---|---|
| Unit | recurrence(조기 완료), roomKind 해석, buyer href, pending route 계정 검사 | 가능 (`npm ci` 후 vitest) |
| Integration | send route claim 멱등, pipeline type 분류 | 가능 (mock) |
| DB Contract | occurrence RPC 동작 — Supabase **branch** 에서 확인 | 가능(승인 시 branch 생성 비용 발생) |
| API Runtime | Prod QA 계정으로 이벤트 생성 후 DB 결과 확인 | 가능(Owner 승인 시, QA 대상만) |
| Production | 배포 SHA·cron 결과·delivery 행 확인 | 가능 |
| Android phone/tablet, iPhone × FG/BG/Killed | 수신·소리·tap·목적지·Back | **불가 → NOT_PROVEN 으로 남김**, Owner/QA 실기기 수행 필요 |
| 성능 | NOTIF-03 send 경로 T5 trace 전후 비교 | 부분 가능(Prod 측정 로그 필요) |
| 기존 기능 회귀 | 텍스트 채팅 알림, 통화 push, owner 주문 알림, 캠페인 즉시발송, 목록/배지 | 단위+Prod 관측 |

---

## 9. Owner 승인 요청 목록

**A. 수정 승인 요청 (Root Cause 확정)**
1. U1 EVENT-09 (recurring after 계산) — QA 캠페인 1건 `ended` 전환 포함
2. U2 EVENT-01 (캠페인 상세 발송 버튼) — EVENT-02 미수정 상태 발송 인지
3. U3 CTA-01 (구매자 주문 → 상세) — 정본 경로 `/mypage/store-orders/{id}` 확인 요청
4. U4 NOTIF-03 (비텍스트 메시지 type) — 설정별 push 수신 변화 인지
5. U5 CTA-07 / CTA-05
6. U6 NOTIF-01 / NOTIF-04 — 소비자 감사 후 설계 재보고 조건
7. U7 PUSH-02 — 심층 설계 재보고 조건

**B. 정책 결정 요청**
1. PUSH-01: iOS 통화 terminal/incoming 에 일반 APNs alert 를 유지할지 (apns-only 설치의 유일한 착신 수단 vs CallKit 기기 중복) — **실기기 확인 후 결정 권장**
2. SOUND-01: 커스텀 알림음을 BG/Killed 에도 적용(신규 기능: 자산 번들·채널 버전업) vs 시스템 기본음을 정책으로 확정
3. NOTIF-09: 주문 접수 리마인더·자동완료 cron 활성화 여부
4. CTA-04: 리뷰 답글 알림의 구매자 목적지
5. NOTIF-06: 배달광고·비즈캐시 알림을 marketing 이 아닌 거래성으로 분류할지
6. EVENT-05: 사용자 이벤트 목록 화면 — 신규 요구로 분리할지
7. 그룹 초대(NOTIF-02): 초대를 group 도메인 알림(채팅 unread 계열)으로 볼지 일반 알림으로 볼지

**C. 추가 증명 허가 요청**
1. Vercel runtime log 접근(현재 403) — PUSH-10, EVENT-10, NOTIF-01 빈도 확인용
2. Prod QA 계정 대상 테스트 이벤트 생성(캠페인·주문·메시지) 허가
3. 실기기(Android phone/tablet, iPhone) 검증 담당 지정

---

## STOP

이 보고서로 Phase 1 을 종료한다. Owner 승인 전 U1~U7 구현에 착수하지 않는다.

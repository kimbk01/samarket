# DIBAY 알림 시스템 — 전체 구조 재정립·HARD LOCK 재감사 (2026-11-01 PHT · 읽기 전용 감사 · Owner 승인 전)

> 이 문서는 감사·설계만 담는다. 코드·DB·네이티브 수정, 실기기 시험, Production 배포는 하지 않았다.
> 기준 코드: `main` = `393882913` (A·B·N5 반영본). 운영 DB `ckdosyydvgzqwpbwuhon` 읽기 전용 SELECT. 테스트 DB 미사용.
> 판정: **PASS(코드)** = 코드로 확인, 실기 미확인 · **FAIL** = 코드·DB 증거로 결함 · **RISK** = 결함 가능, 증거 부족 · **NOT_PROVEN** = 확인 못 함.
> 2,215건 테스트 통과는 바뀐 코드의 테스트 통과일 뿐, 알림 시스템 전체 정상이나 HARD LOCK 유효성의 증거가 아니다.

## 0. 결론

1. **반복 원인은 「목적지·읽음·숫자·소리를 정하는 곳이 여러 개이고, 그 사이의 일치를 검사하는 장치가 없다」는 구조다.** HARD LOCK 은 대부분 문서 문장이다. 테스트가 붙은 곳은 웹 배지·웹 경로·웹 소리뿐이다. Android 네이티브 해석기는 어느 LOCK 에도 들어 있지 않다.
2. **결정적 시점은 2026-08-15 `e329d494b`(「unify destination SSOT」)다.** 이 커밋이 웹의 공지 목적지만 「목록 → 상세」로 바꿨고, Android 파일은 0개 바꿨다. 그 뒤 Android 단위 테스트는 「목록」을, 웹 테스트는 「상세」를 각자 정답으로 고정했다. Android 테스트는 CI 에서 돌지 않는다.
3. **2026-10-30 알림 발송 v3(`3b40fad30`)은 「알림 상세는 기존 읽기 경로」라고 전제했다.** Android 를 확인하지 않아, Owner 가 본 「푸시 → 종 목록」이 생겼다.
4. **11-01 수정 A(`393882913`)는 근본 수정이 아니다.** 서버가 Android 의 「승인 경로 우선」 분기를 이용해 피해 가는 **호환 계층**이다. 유지는 하되, 근본은 아래 3절 「목적지 계약」이다.
5. 개선 원칙은 **「목적지는 서버가 이벤트 생성 시 한 번 정하고, 모든 표면(푸시·배너·종·전체 목록)과 모든 플랫폼은 그 값을 검증만 해서 그대로 쓴다」**이다. 이를 **양 플랫폼이 같은 기준표(fixture)로 검사하는 테스트**와 **CI 실행**으로 잠근다.

---

## 1. 현 상태 전수 감사표

### 1-1. 공통 동작 (모든 일반 알림에 적용 · 통화 제외)

| 항목 | 현재 동작 | 근거 | 판정 |
|---|---|---|---|
| 저장 | `notification_events` 단일. 옛 `notifications` 테이블에 쓰는 코드 0건(Realtime 구독은 남아 있음) | `append-user-notification.ts:121-177`, `useSupabaseNotificationsRealtime.ts:151-195` | PASS(코드) |
| 발송 | 일반 알림은 FCM data-only(앱 종료 중에도 `onMessageReceived` 실행), APNs alert | `fcm-sender-impl.ts:243-250`, `apns-sender-impl.ts:218-240` | PASS(코드) |
| Android 앱 실행 중 | 표준 5종(chat·group·trade·delivery_order·community_comment)과 `notification` 종류는 시스템 알림 생략 → 웹이 배너·소리. **봉투(관리자 캠페인)만 시스템 알림도 띄움** | `DibayFirebaseMessagingService.java:104-118` | 캠페인 FAIL(이중) |
| Android 백그라운드·종료 | 앱이 직접 그린 시스템 알림 + 채널 소리(무음·무진동 채널은 서버 `soundMode`) | 같은 파일 :333-420, `DibayNotificationChannelRegistry.java:81-165` | PASS(코드) |
| iOS 앱 실행 중 | Capacitor `presentationOptions` 미설정 → OS 배너·소리 없음 → 웹만 | `PushNotificationsHandler.swift:20-56`, `capacitor.config.ts` | PASS(코드) |
| iOS 백그라운드 | `aps.sound="default"`(silent 일 때만 생략). 관리자 지정 음원 미적용(번들 소리 파일 0개) | `apns-sender-impl.ts:226-227` | 기능 미구현 |
| 앱 안(웹) 소리 | Realtime INSERT → `routeNotificationInsertSound`. 창 포커스·클라이언트 Supabase 세션·Realtime 연결이 모두 있어야 울림 | `NotificationsBadgeRealtimeBridge.tsx:59-81`, `notification-sound-decision.ts:171-183` | 앱 WebView 세션 유무 NOT_PROVEN |
| 정렬 | 서버 `created_at desc`, 묶음은 최신 행 시간·제목으로 맨 위 | `inbox-events-merge.ts:790`, `group-inbox-by-thread.ts:180-288` | PASS(코드) |
| 삭제 | 행 삭제 없음. `display_payload.inbox_dismissed_at` 만 찍고 목록·숫자에서 제외 | `inbox-read-bridge.ts:276-303` | PASS(코드) |
| 보존·만료 | 삭제 cron 없음. `expires_at` 지나면 기록에서도 사라지는 규칙이 있으나 운영 0건 | 운영 DB: `expires_at` 0/8,000행 | PASS(코드) · 정책 Owner 결정 |

### 1-2. 종류별 표

열 약어 — **운영**: 최근 30일 생성 건수(운영 DB, 2026-11-01 07시 PHT 기준) · **FCM type**: 서버가 싣는 `type` · **푸시 탭**: Android build 24 / iOS·웹 · **종·전체 탭**: 목록 행을 눌렀을 때 · **읽음**: 무엇이 읽음 처리하는가 · **종 숫자**: 종 배지 포함 여부 · **묶음**: 목록 한 줄로 합쳐지는 단위.

| 종류 (event type · kind) | 운영 | 생성 경로 | FCM type | 푸시 탭 | 종·전체 탭 | 읽음 | 종 숫자 | 묶음 | 판정 |
|---|---|---|---|---|---|---|---|---|---|
| 메신저 1:1 `chat_message` | 429 | `notify-message-pipeline.ts:314` | chat_message | 대화방 / 대화방 | 종에 안 나옴(채팅 탭) | 방 읽음 | 제외(채팅 탭 = 방 수) | 방 | PASS(코드) |
| 그룹·멘션·고정 `group_message`·`mention_message`·`pin_message` | 24 | 같음, `group-room-pin-notify.ts:42` | group_message | 대화방 | 채팅 탭 | 방 읽음 | 제외 | 방 | PASS(코드) |
| 그룹 초대 `group_message`·community_group_invite | 0 (마지막 07-21) | `community-messenger-group-inapp-notify.ts:28` | group_message (11-01 N5 수정, 이전 chat_message) | 대화방 | 제외 | — | 제외 | — | PASS(코드) |
| 거래 채팅 `trade_message` | 36 | 같은 파이프라인 | trade_message | 메신저 방(운영 172건 모두 실재 방) | 채팅 탭 | 방 읽음 | 제외 | 방 | PASS(코드·DB) |
| 매장 주문 채팅 `store_order_message` | 1 | 같음 | delivery_order | 메신저 방 | 채팅 탭 | 방 읽음 | 제외 | 방 | PASS(코드) |
| 부재중 `missed_call` | 125 | `community-messenger/service.ts:1289` | missed_call | 대화방(통화 기록) | 제외 | 방 읽음 | 제외 | 방 | 통화 영역 — 이번 범위 밖 |
| 댓글 `community_activity`·community_comment | 4 | `community-social-inapp-notify.ts:92` | community_comment | 게시글 `/community/posts/{id}` | 게시글 | 푸시 탭 = 그 1건 / 목록 탭 = 그 글 전체 | 포함(행) | 글 | **FAIL** 읽음 범위 불일치(3-3) · 대상 글 제목 없음(U1) |
| 좋아요 community_like | 1 | 같은 파일 :137 | notification | 게시글 | 게시글 | 같음 | 포함 | 글 | 같음 |
| 친구 요청·수락 friend_request·friend_accepted | 52 | `community-messenger-friend-inapp-notify.ts:50,82` | notification | `/community-messenger?section=friends` | 같음 | 1건 | 포함 | 개별 | PASS(코드) |
| 상품권 선물 gift_transfer_* | 4 | `notify-gift-transfer.ts` | notification | 메신저 방 `?giftTransferId=` | 같음 | 1건 | 포함 | 개별 | PASS(코드) |
| 가격 제안 trade_status·trade_offer | 2 | `price-offers.server.ts:507-576` | notification | 상품·방 | 같음(보정 규칙 별도) | 상품 단위 | 포함 | 상품 | PASS(코드) |
| 거래 완료·분쟁 trade_status·trade_completed | 5 | `confirm-buyer/route.ts:111`, `buyer-issue/route.ts:87` | notification | 메신저 방 | 같음 | 상품 단위 | 포함 | 상품 | PASS(코드) (10-28 이전 2건은 옛 거래방 id, 방 화면이 정규화) |
| 구매자 주문 상태 order_status·store_order_owner_status 등 | 26 (kind 이름 기준) | `notify-store-commerce.ts` | delivery_order | `/orders?expand={id}` | 같음 | 주문 단위 | 포함 | 주문 | PASS(코드) |
| 오너 신규주문·리마인더·시간초과·품절 order_status·store_order_created·accept_reminder·timeout·sold_out | 24 (kind 이름 기준, 수신자 역할 미대조) | `notify-store-commerce.ts:131-578` | delivery_order (봉투 `owner_operation` 미사용) | `/stores/owner/orders?…` | 오너 알림함 | 주문 단위 | 회원 숫자 제외, 오너 종은 받은 목록에서 셈 | 주문 | **RISK** 오너 종 숫자 서버 권위 아님 |
| 포인트 충전 order_status·user_point_* | 6 | `notify-user-points.ts` | notification | `/mypage/points` | 같음 | 1건 | 포함 | 개별 | PASS(코드) |
| 고객센터 support_* | 35 | `support-case-service.ts:167` | notification | 문의 상세(모달) | 같음 | 1건 | 포함 | 개별 | PASS(코드) |
| 관리자 쪽지·문의 inbox_message_received·inquiry_answered | 0 | `member-admin-notes-service.ts:89` | notification | `/mypage/inbox/{id}` 등 | 같음 | 1건 | 포함 | 개별 | PASS(코드) |
| 매장 심사·운영 공지 admin_notice·admin_store_* | 2 | `admin-store-decision.ts:75` 등 | notification | `/stores/owner?storeId=` | 같음 | 1건 | 회원 제외(매장 id 있음) | 개별 | PASS(코드) |
| 신고 결과·제재 admin_notice·chat_report_* | 0 (코드만) | `notify-chat-report-result.ts:41-68` | notification | 알림 상세 (11-01 B 수정, 이전 목록) | 알림 상세 | 1건 | 포함 | 개별 | PASS(코드) |
| 옛 관리자 공지(목적지 없음) admin_notice | 0 (마지막 08-05, 누적 702) | 옛 경로 | — | — | 알림 상세 (11-01 B, 이전 목록) | 1건 | 포함 | 개별 | PASS(코드) |
| 공지 캠페인 notice_published | 399 | `campaign-send-user.ts:134,332` | notice + 봉투 admin_notice | **Android: 상세(11-01 A 서버 우회) / iOS·웹: 상세** | 공지 상세 | 1건 | 포함 | 개별 | PASS(코드) · Android 앱 실행 중 **소리 2번 FAIL** |
| 시스템 캠페인 admin_system | 0 (마지막 08-15) | 같음 | system + 봉투 admin_system | **Android: 항상 목록 / iOS·웹: 상세·지정 경로** | 상세 | 1건 | 포함 | 개별 | **FAIL** (네이티브 필요) |
| 마케팅 캠페인 admin_marketing_banner | 12 | 같음 | marketing + 봉투 admin_marketing | 상세·지정 경로(11-01 A) | 같음 | 탭으로 읽음 안 함(delivery_only) | 포함 | 개별 | PASS(코드) · 앱 실행 중 이중 소리 RISK |
| push_only 캠페인 | 0 (마지막 10-19) | 같음 | 봉투 | `/notifications`(11-01 A, 이전 없는 상세) | 행 없음 | — | — | — | PASS(코드) |

코드에는 있지만 운영 30일 0건: 시스템 캠페인, 그룹 초대, 신고 결과·제재, 관리자 쪽지·문의, 옛 관리자 공지. 거래 예약·후기 알림은 생성 코드가 없다(방 시스템 메시지로 처리되는지 NOT_PROVEN).

### 1-3. 설치 바이너리 분포 (호환성 조건)

최근 14일 접속 기기(`user_devices`): Android `1.2.5 (24)` 7대, `1.2.5 (20)` 14대, `1.0` 65대, `1.0 (1)` 6대, `1.2.4 (11)` 5대, `1.2.1 (4)` 6대 등 **10종 이상**. iOS `1.2 (20)` 2대, `(16)` 2대, `(7)` 6대.
- 봉투 해석기는 2026-08-03 `9be7b5842` 부터 들어 있다. 그 이전 바이너리는 `url` 만 쓴다.
- `1.0` 65대의 갱신 시각이 모두 10-30 18:07 근처로 몰려 있다. 실제 사용 기기인지, 일괄 갱신된 기록인지는 NOT_PROVEN.
- **결론: 어떤 바이너리에서도 같은 곳으로 가려면 서버가 `url`·`routeUrl`·`targetApprovedRoute` 를 모두 「같은 최종 목적지」로 채워야 한다.**

---

## 2. HARD LOCK 회귀 원인 보고

### 2-1. LOCK 별 보호 대상과 실제 강제 수단

| LOCK 문서 | 보호 대상 | 강제 수단 | Android 포함 |
|---|---|---|---|
| `dibay-global-notification-ssot-hard-lock.md` (08-12) | 배지·목록 API·RPC, 관리자 실시간 | vitest 6개(CI 실행). 금지 규칙(§4)은 문장 | 없음. 푸시 경로는 웹 해석기만 지정(:63) |
| `dibay-auth-session-notification-destination-hard-lock.md` (08-13) | 「ONE CANONICAL DESTINATION」「BELL/INBOX/PUSH MUST NOT INVENT」(:40-51) | vitest 2개(웹·iOS) | **없음(grep 0건)** |
| read-badge·badge-number·p0 정책 | 읽음·숫자 규칙 | 지정 테스트 없음(문장) | — |
| sound-silent-unlock | 소리 잠금 해제 | vitest 4개 | 앱 실행 중 캠페인 시스템 알림 미포함 |
| preference-fail-closed·order-durability | 설정 게이트·주문 큐 | 문장. 두 문서 모두 스스로 「reopen 없이 수정됨(절차 누락)」 기록 | — |
| presentation-ssot (10-29) | 표시값 | 문장 | 목적지 대상 아님 |
| `.claude/hooks/guard.sh` | — | 알림 관련 0건 | — |
| `verify:push-dispatch-contract`·`verify:notification-*` | — | `npm run ci` 에 없음 | — |

### 2-2. 언제·무엇이 달라졌나 (커밋 증거)

| 날짜 (PHT) | 커밋 | 변경 | 결과 |
|---|---|---|---|
| 08-03 13:50 | `c6bc178f1` | 웹 봉투 해석기 생성 — 공지 → 목록(`?tab=system&notificationId=`) | 웹·Android 같은 규칙 |
| 08-03 14:03 | `9be7b5842` | Android 같은 규칙 추가 + 「앱 실행 중에도 봉투면 시스템 알림」 | 이중 소리 구조 시작 |
| 08-04 | `7598e0fa5` | 서버가 시스템 캠페인에 `admin_system` 전송 | Android 분기 없음 → 목록 |
| **08-15** | **`e329d494b`** | 웹만 공지 → 상세(android 0파일) | **플랫폼 분기 시작** |
| 08-15 | `55e4080e3` | 웹만 `admin_system` 분기 추가 | 분기 확대 |
| 10-30 | `3b40fad30` | 발송 v3 「목적지 = 알림 상세」를 기본으로, 커밋 메시지 「네이티브 무변경(알림 상세는 기존 읽기 경로)」 | Android 미확인 전제 → Owner 화면 결함 |
| 11-01 | `393882913` | 서버가 승인 경로를 실어 Android 우회 | 증상 완화(호환 계층), 구조 그대로 |

원래 승인 규칙은 2026-08-04(`docs/notifications/admin-push-bell-notes-design.md:13,33`)부터 10-30 v3(`dibay-customer-communication-ssot.md:32`)까지 일관되게 「공지·시스템 → 알림 상세」였다. Android 의 「목록」은 승인 문서에 근거가 없다.

### 2-3. 테스트가 못 잡은 이유

1. **Android 테스트가 어긋난 동작을 정답으로 고정** — `FcmPayloadResolverTest.java:59-68` 공지 → `/notifications?tab=system&notificationId=evt-notice-1`, `:76-82` 마케팅 → 목록, `:52` 금지된 `/philife/posts/post-1` 경로를 정답으로 둠.
2. **웹 테스트는 반대를 고정** — `resolve-push-route-from-fcm-data.test.ts:118` 공지 → `/notifications/n-notice-1`.
3. **두 해석기를 비교하는 테스트 0개.** 웹 주석 「mirrors Android FcmPayloadResolver」(`resolve-push-route-from-fcm-data.ts:2`)는 08-15 이후 사실이 아니다.
4. **Android JVM 테스트는 CI 에서 실행되지 않음** — `.github/workflows/*` 에 `testDebugUnitTest` 0건(직접 확인).
5. **승인 설계 문서가 git 밖에 있음** — `admin-push-send-process-v3-design`, `admin-notification-create-defect-and-redesign`, `notification-redo-audit` 는 기본 체크아웃의 미추적 파일(직접 확인: `git ls-files` 0건). 다음 작업자·세션이 볼 수 없다.

### 2-4. 기존 경로를 고치지 않고 경로를 더한 사례

관리자 공지 하나의 목적지를 **최소 4곳**이 따로 정한다: 캠페인 `resolveCampaignRouteUrl`(`campaign-types.ts:85`) · 웹 봉투 `resolveRouteFromPushEnvelopeV1`(`push-envelope-v1.ts:225`) · Android `resolveEnvelopeRoute`(`FcmPayloadResolver.java:238`) · 목록 `resolveEventInboxLinkUrl`(`inbox-events-merge.ts:378`). 여기에 `resolveNotificationDestination`·`resolveNotificationInboxHref`·`resolvePushRouteFromFcmData`·오너 `resolveOwnerNotificationHref` 와 Android 오너 경로가 더 있다. 안전 경로 검사도 웹 `resolveSafeNotificationInternalRoute`(7개 파일)와 Android `safeInternalRoute` 로 두 벌이다. 11-01 B 도 `inbox-events-merge` 에 예외를 하나 더 붙였다(정리 대상에 포함).

### 2-5. 플랫폼 분기가 불가피했나

불가피하지 않았다(코드 근거, 실기 NOT_PROVEN). Android 는 탭 시 경로 문자열만 계산해 WebView 대기열에 넣는다(`MainActivity.java:2255-2268`). 서버는 이미 완성된 `url` 을 보낸다(`fcm-data-payload-contract.ts:223-230`). 그런데도 Android 는 봉투가 있으면 `url` 을 버리고 다시 계산한다(`FcmPayloadResolver.java:129-131`). 실제 제약은 「설치된 구버전은 옛 규칙을 계속 쓴다」는 점이다. 그래서 웹만 고치는 쪽으로 기울었고, 규칙이 갈라졌다.

---

## 3. 개선 SSOT 설계 — 발송부터 탭·읽음·숫자·소리까지 하나의 기준

### 3-0. Owner 원칙 → 계약 대응

| Owner 원칙 | 계약 |
|---|---|
| FCM 탭 = 해당 상세 직접 진입 | C2 목적지 |
| 종 = 최근 알림 빠른 확인 / 전체 = 분류·이력 | C3 표면 역할 |
| 알림음 1회 | C5 소리 |
| 최신순(묶음도 최신 활동) | C3 |
| 읽음 → 미읽음·배지 제외, 이력 유지 | C4 읽음 |
| 배지 = 서버 미읽음 원본 | C4 숫자 |
| 목적지 없음 → 안전한 상세·안내 | C2 |

### C1. 이벤트 종류 계약

- 기준은 이미 있는 `lib/notifications/core/notification-event-registry.ts` **한 곳**이다. 종류마다 아래 항목을 이 표에 둔다(새 표를 만들지 않는다).
  - 분류(탭)
  - **목적지 규칙**: 아래 C2 의 7가지 중 하나
  - 읽음 범위: 1건 / 글 / 주문 / 상품 / 방
  - 종 숫자 포함 여부
  - 묶음 키
  - 소리 키
  - 앱 실행 중 표시 주체: 웹 / 네이티브
- 서버의 `append`, 푸시 payload, 목록 변환은 이 표만 읽는다. 지금처럼 `toNotificationEventType`(`append-user-notification.ts:46`)이 `push_kind` 로 종류를 추측하는 규칙은 표의 입력 검사로 바꾼다. 예: 광고·비즈캐시 알림이 10-17 까지 `admin_marketing_banner`(마케팅)로 저장된 행이 운영 DB 에 남아 있고, 현재 코드는 `push_kind:"notice"` → `admin_notice` 로 저장한다. 같은 알림이 시기에 따라 다른 종류로 저장돼 읽는 쪽이 옛 모양을 계속 처리해야 한다.

### C2. 목적지 계약 (핵심)

1. **이벤트 생성 시 서버가 최종 목적지 1개를 정해 `display_payload.routeUrl` 에 저장한다.** 「`/notifications`(목록 자체)」는 저장 금지다. 목적지가 없으면 `/notifications/{eventId}`(알림 상세)를 저장한다.
2. **푸시는 그 값을 `url`·`routeUrl`·`targetApprovedRoute`(봉투) 세 곳에 똑같이 싣는다.** 1.0~build 24 모든 바이너리가 같은 곳으로 간다(1-3).
3. **모든 소비자는 「검증 후 그대로 사용」만 한다.** 소비자 = 웹·iOS 탭(`PushRouteListener`), Android 탭(`MainActivity`→`FcmPayloadResolver`), 종·전체·배너(`activateNotificationDestination`).
   - 다시 계산하지 않는다.
   - 검증은 허용 경로 목록 하나다. 웹 `notification-internal-route` 와 Android `DibayAppRouteGuard` 를 같은 목록으로 맞춘다. 이미 `android-route-guard-sync.test.ts` 가 Java 소스를 읽어 대조하는 방식을 쓰고 있으므로 이를 확장한다.
4. **종류별 최종 목적지**

| 종류 | 목적지 | 예외 시 |
|---|---|---|
| 공지·시스템·마케팅 캠페인 | 지정 화면 또는 고객센터 원본 글. 없으면 알림 상세 | push_only(행 없음) → 알림센터 + 안내 |
| 댓글·좋아요 | 해당 글 | 글 삭제 → 알림 상세(「원본 없음」) |
| 메신저·거래 채팅·주문 채팅 | 해당 방 | 방 없음 → 알림 상세 |
| 거래 상태·가격 제안 | 메신저 방 또는 상품 | 상품 삭제 → 알림 상세 |
| 주문(구매자) | 주문 상세 | — |
| 주문(오너) | 오너 주문 화면(해당 주문·탭) | 매장 권한 없음 → 기존 보안 정책 |
| 고객센터·쪽지 | 해당 문의 상세 | — |
| 신고·제재·운영 공지 | 알림 상세 | — |

5. 원본이 삭제됐거나 권한이 없으면 **목록으로 돌려보내지 않고 알림 상세의 「원본 없음」 안내**를 보여 준다(11-01 B 와 같은 결과를 계약으로 고정).

### C3. 표면 역할

| | 종 팝업 | 전체 알림 |
|---|---|---|
| 목적 | 최근 알림 빠른 확인 | 분류·이력·관리(편집·삭제) |
| 범위 | 최근 N행. 읽음 포함, 미읽음 강조. N 과 「더 보기 = 전체」를 화면에 명시 | 전체 기록(2,000행 상한 해소는 4절 W6) |
| 정렬 | 최신 활동순(묶음은 최신 행 시간) | 같음 + 날짜 묶음 |
| 머리 숫자 | **종 배지와 같은 값(C4)** | 탭 숫자 = 같은 정의의 분류별 값 |
| 묶음 | 같은 글·주문·방 = 1줄 + 「새 N건」 | 같음 |
| 탭 | C2 목적지 | C2 목적지 |
| 미읽음 필터 | Owner 결정 시에만 둔다. 필터를 켜면 읽은 행 제외가 맞다 | 필터 탭 있음 |

### C4. 읽음·숫자 계약

- **읽음 판정 1개**: `read_at IS NULL` = 미읽음.
  - 지금은 종 숫자가 `unread=true AND read_at IS NULL`, 분류 탭이 `read_at IS NULL` 로 두 가지다.
  - 운영 624행이 `unread=false·read_at=null` 인데 전부 채팅 계열이라 화면 영향은 아직 없다. 하나로 맞춘다.
- **읽음 범위는 종류 표(C1)의 값 하나**. 푸시 탭, 목록 탭, 배너 탭이 같은 범위를 쓴다.
  - 지금은 댓글 푸시 탭 = 1건(`read/route.ts:60`), 목록 탭 = 글 전체(`notify-read-service.ts:134`)라 **FAIL** 이다.
- 읽음은 기록을 지우지 않는다(현행 유지). 삭제는 `inbox_dismissed_at` 표시만 한다(현행 유지).
- **숫자**
  - 종 배지 = 서버 A 미읽음 **행 수**. 종 팝업 머리 숫자·전체 「전체」 탭과 같은 값이다.
  - 화면 순번(04…01)은 폐지한다. 묶음 줄에는 「새 N건」을 표시한다.
  - 앱 아이콘 = A 행 + B 미읽음 방 수(현행). 오너 종 숫자도 서버 권위값으로 바꾼다(지금은 받은 목록에서 셈).
- **복구**: Realtime 재연결 RESYNC(현행) + **앱 복귀(resume) 시 배지 1회 재조회**(현재 코드 없음).
- **OS 런처 한계는 별도 표기**
  - Android 백그라운드 런처는 다른 기기에서 읽어도 줄지 않는다(0 이하 무시, 감소 푸시 없음).
  - 샤오미는 트레이 알림 수만큼 더해 보인다(b7 문서, OS 동작).
  - 이 둘을 고치려면 무음 감소 푸시라는 신규 기능이 필요하다 → Owner 결정.

### C5. 소리 계약 — 이벤트 1개 = 소리 최대 1회

| 앱 상태 | 소리 주체 | 다른 쪽 |
|---|---|---|
| 백그라운드·종료 (Android·iOS) | OS(채널음 / APNs) | 웹 없음 |
| 실행 중 · 앱 안 알림 행 있음 | **웹 하나** | Android 네이티브는 시스템 알림 생략(캠페인 포함) — **E 필요** |
| 실행 중 · 행 없음(push_only) | 네이티브 시스템 알림 | 웹 없음 |
| 통화 | 통화 벨(별도 계약, 이번 범위 밖) | — |

추가 확인 항목:
- 앱 WebView 의 클라이언트 Supabase 세션 유무(NOT_PROVEN). 없으면 앱 실행 중 일반 알림 소리가 0이 된다. 실기에서 Realtime 구독 로그로 확인한다.
- 브라우저 서비스워커가 `soundMode`·포커스를 무시한다(`public/sw.js:96-103`) — 웹 브라우저 전용 RISK.

### C6. 플랫폼 호환 계약

- 기준표 1개: `lib/notifications/contracts/notification-route-fixtures.json` (예정). 열 = 입력 FCM data → 기대 목적지(Android 해석·웹 해석 모두).
- TS 테스트와 Android JVM 테스트가 **같은 파일**을 읽어 검사한다. 구버전 호환 행은 「`url` 만 있는 payload」「봉투만 있는 payload」를 모두 넣는다.

---

## 4. HARD LOCK 강화안 (계약을 지키는 장치)

| 계약 | 자동 회귀 테스트 | 실패 차단 |
|---|---|---|
| C1 종류 | 모든 writer 의 (type, kind) 가 registry 에 있고 7개 속성이 비어 있지 않은지 검사(writer 소스 스캔 + registry) | `npm run ci` |
| C2 목적지 | fixture 기반 TS 테스트 + **Android `FcmPayloadResolverTest` 를 같은 fixture 로** + 저장 `routeUrl` 이 bare `/notifications` 가 아닌지 검사 | `npm run ci` + **CI 에 `./gradlew testDebugUnitTest` 추가** |
| C3·C4 읽음·숫자 | 같은 입력 행 → 종 숫자·팝업 머리 숫자·전체 탭 숫자·아이콘 숫자 일치 / 푸시 탭·목록 탭 읽음 범위 일치 | `npm run ci` |
| C5 소리 | 상태×종류 표 테스트(웹 게이트) + Android 「앱 실행 중 시스템 알림 생략」 JVM 테스트 | 같음 |
| C6 호환 | fixture 의 구버전 행(url 만, 봉투만) 통과 | 같음 |
| 문서 | LOCK 문서·승인 설계는 **git 에 커밋된 것만 유효**. LOCK 문서마다 「보호 테스트 목록」 칸 필수. 테스트 없는 LOCK 은 LOCK 으로 보지 않음 | 리뷰 규칙(AGENTS.md 1줄 추가 — Owner 승인 사항) |

---

## 5. 수정 실행표

배포 구분: W = 웹(main 반영 1회 → 앱 재시작) · N = 네이티브(재빌드·재설치) · CI = 워크플로 파일 변경 · DB = 운영 DB 변경. 이 표는 **실행 순서 제안**이며, 각 줄은 Owner 승인 후에만 진행한다.

| # | 항목 | 기존 수정 | 구분 | 영향 화면·경로 | 검증 |
|---|---|---|---|---|---|
| W0 | 미추적 승인 설계 3개 + 이 문서·E 계획·시안을 git 에 커밋 | — | 문서 | 없음(빌드 생략) | `git ls-files` |
| W1 | C6 fixture + TS 계약 테스트(현재 동작 그대로 기록 → Android·웹 차이 표시) | — | W(테스트만, 빌드 생략) | 없음 | vitest |
| CI1 | CI 에 Android JVM 테스트 실행 추가 | — | CI | GitHub Actions 시간 증가 | CI 1회(Owner 알림으로만 확인) |
| W2 | C2 서버: 목적지 저장 1곳(`routeUrl` 최종값), 푸시 3필드 동일 — A(캠페인 승인 경로)·B(content-only)를 이 규칙의 일부로 **흡수·정리**. 캠페인 `resolveCampaignRouteUrl` 의 `/notifications` 반환 제거 | A·B **교체(같은 결과, 한 곳으로)** | W | 캠페인 발송·미리보기·시험 발송, 모든 append writer, 목록 링크 | fixture 테스트, 운영 새 이벤트 `routeUrl` 조회 |
| W3 | C4 읽음: 판정 1개, 푸시 탭 읽음 범위 = 목록 탭 범위 | — | W | `read/route.ts`, `PushRouteListener`, 배지 | 같은 글 댓글 3개 시나리오 테스트 |
| W4 | C4 숫자: 종 팝업 머리 숫자 = 종 배지, 순번 폐지, 「새 N건」, resume 재조회, 오너 종 서버 권위값 | — | W | 종 팝업·전체·오너 종 | 숫자 일치 테스트 |
| W5 | C3 종 팝업 범위(읽음 포함·최근 N) + 전체 「더 보기」 후 재조회 시 목록이 100행으로 줄어드는 결함 수정(`MyNotificationsView.tsx:275-283`) | — | W | 종 팝업·전체 | 테스트 |
| W6 | 전체 기록 2,000행 상한 정책(현재 최다 사용자도 2,000 미만 — 운영 DB) | — | W·Owner 결정 | 전체 | — |
| N1 | **E**: Android 해석기 = 「검증 후 그대로」(C2-3), `admin_system`, 앱 실행 중 시스템 알림 생략(C5), 댓글 예비 경로 | — | N(통화 파일 동거 → 단독 커밋·통화 최소 행렬) | Android 탭·수신 | JVM fixture 테스트 + 실기 V-E1~E7 |
| C | 목록 UI 시안 재검토 → 구현 | 시안 보류 | W | 종·전체·오너 | Owner 화면 확인 |

순서는 **W0 → W1·CI1 → W2 → W3 → W4·W5 → (Owner 승인) N1 → C** 다. W2~W5 는 한 브랜치에서 묶어 main 1회 반영한다(Vercel 빌드 1회).

### 기존 11-01 수정의 처리

- **A**(`campaign-notification-presentation.ts` 승인 경로): 유지하다가 W2 에서 「서버 단일 목적지」의 일부로 흡수한다. 동작 결과는 같다.
- **B**(`admin-notice-content-only.ts`, `inbox-events-merge` 예외, `notify-push-dispatcher` 예외, `navigate` 상세 대체): W2 에서 저장 시점 규칙으로 옮기고 읽기 시점 예외는 제거한다. `navigate` 의 「원본 없음 → 상세」는 C2-5 로 유지한다.
- **N5**(그룹 초대 type): 유지. C1 종류 표로 옮긴다.

### Owner 결정 필요 (설계로 정할 수 없는 것)

1. 종 팝업에 「미읽음만」 필터를 둘지(기본은 읽음 포함 최근 N).
2. 알림 기록 보존 기간·`expires_at` 정책(지금은 무기한, 만료 0건).
3. Android 런처의 「다른 기기에서 읽음」 감소 — 무음 감소 푸시(신규 기능) 여부.
4. iOS 관리자 지정 알림음 — 소리 파일·번들 추가(신규 기능) 여부.
5. 시스템 캠페인을 다시 쓸 계획이 있는지(없으면 N1 의 `admin_system` 은 우선순위 낮음).
6. 「레거시 어플」 노출 시간 비교 기준(이전 DIBAY 버전인지, 다른 앱인지).

### 실기 검증 (승인 후 · Owner 사용 상태: 로그인 계정·저장 주소·휴대폰)

- 각 종류 × (앱 실행 중 / 백그라운드 / 종료) × (삼성 / 샤오미 / iPhone)마다 아래를 확인한다.
  - 푸시 탭 목적지
  - 소리 횟수
  - 종·전체 숫자와 배지
  - 읽음 반영
- 앱 WebView 의 Realtime 구독 여부(로그 `notifications-rt`).
- 통화 최소 행렬(N1 시).
- 기록 항목: 매 시험마다 Production SHA, PHT 시각, 운영 DB `notification_events.read_at/opened_at`.

---

## 6. Owner 승인 기록 (2026-11-01)

- 승인: W0, W1, CI1, W2, W3, W4, W5. W2~W5 는 통합 검증 후 main 1회 반영. N1·C 는 보류(별도 승인).
- Owner 정책 확정
  1. 종 팝업 = 최근 전체 알림 기본 + 미읽음 필터 제공.
  2. 알림 기록 무기한 보존. 임의 삭제·과거 데이터 정리 금지.
  3. Android 다른 기기 읽음 동기화는 목표 유지, 무음 푸시 신규 구현은 별도 승인.
  4. iOS 종류별 관리자 알림음은 별도 과제, 기존 소리 유지.
  5. 시스템 캠페인 계속 지원, Android 에서도 정상 목적지.
  6. 레거시 UX 비교 기준 = 카카오톡·배민·당근. 실제 확인 안 한 동작을 같다고 보고하지 않음.
- 읽음 계약 보완: 기본 = 개별 1건. 메신저는 방 단위 유지. 댓글·좋아요·주문·거래 상태는 개별 기본, 기존 묶음 읽음과 충돌하는 부분은 영향 분석 후 계약 테스트로 고정. 같은 이벤트를 푸시·종·전체·배너에서 선택하면 같은 읽음 결과.
- 목적지 계약 보완: 구버전 Android 의 봉투 우선·`url` 무시 분기를 build 별로 검증. 세 필드가 같다는 것만으로 호환 PASS 금지. 상세 경로 존재·권한·원본 삭제 대체를 함께 검증. `push_only` 는 알림센터 이동 예외를 계약에 명시하고 사용자에게 이유 안내.
- 숫자 계약 보완: 회원 종·채팅 탭·오너 종·앱 아이콘 단위를 분리 정의, 각각 서버 권위 원본. 종 팝업·전체 알림은 같은 회원 알림 집계. 묶음 줄 수 ≠ 미읽음 이벤트 수. 재집계 조건 명시. 삼성·샤오미 런처는 앱 내부 집계와 구분 검증.
- HARD LOCK: C1~C6 자동 테스트, Android JVM 테스트 CI 포함, Android·TS 같은 fixture, 잘못된 정답을 고정한 기존 테스트 정정, 미추적 문서는 승인 상태 확인 후 git 반영(`notification-docs-status-index-2026-11-01.md`).

---

## 7. 실행 결과 (W0·W1·CI1·W2~W5 · 2026-11-01 · 브랜치 `fix/notif-ssot-w0-w5`)

### 7-1. Android 빌드별 탭 목적지 해석 (소스 이력으로 확인 · 실기 NOT_PROVEN)

| 설치 빌드 | 소스 기준 | 봉투 있을 때 | 봉투 없을 때 |
|---|---|---|---|
| `1.0`(versionCode 1) 중 2026-08-03 이전 빌드 | `aefa36554` 시점 `resolveRouteUrl` | 봉투를 모름 → `url` | `url`(`/` 로 시작하면 그대로) |
| `1.0` 중 08-03 이후 · `1.1`(2) · `1.2`(3) | `9be7b5842` | **봉투 우선(url 무시)** — `admin_system` 분기 없음 → `/notifications` | `url`/`routeUrl` |
| `1.2.2`(5) ~ `1.2.5`(24) | `1f950e85a` 이후 현재 | 같음 | `DibayAppRouteGuard.safeAppPath(url)` |

`1.0` 65대가 08-03 전·후 어느 빌드인지는 기록이 없다(versionCode 1 고정) → 두 경우 모두 아래 결과가 같도록 만들었다.

**W2 결론**: 앱 안 알림 행이 있는 캠페인(운영 캠페인 대부분)은 봉투를 싣지 않고 `url` = 저장된 최종 목적지만 보낸다 → 위 3구간 모두 `url` 로 이동. 시스템 캠페인(Owner 정책 5)도 Android 네이티브 수정 없이 정상 목적지.
- 앱 실행 중 Android 시스템 알림 + 웹 배너 이중 소리(D)도 같은 이유로 없어진다: 봉투가 없으면 Android 는 다른 일반 알림처럼 앱 실행 중 시스템 알림을 그리지 않는다(`DibayFirebaseMessagingService.java:114-118`).
- 예외: 앱 안 행이 없는 push_only 는 앱 실행 중 알릴 곳이 시스템 알림뿐이라 봉투를 유지한다. push_only **시스템** 캠페인(목적지 없음)만 build ≤24 에서 `/notifications`(안내 문구 없이 목록)로 가며 N1 대기다(운영 발송 0건).

### 7-2. 계약별 구현

| 계약 | 구현 | 잠금(자동 테스트) |
|---|---|---|
| C2 목적지 | 모든 알림이 거치는 단일 저장 함수 `createNotificationEvent` 에서 `finalizeNotificationEventRoute` 가 목록 경로 함수(`resolveEventInboxLinkUrl`)로 최종 목적지를 1회 저장. 알림센터 자체는 저장 안 함. 메신저·통화 종류는 파이프라인 경로 유지(통화 무변경). 푸시는 저장값을 그대로 씀(디스패처의 B 예외 제거). 캠페인은 저장값 → `url`. push_only 예외 = `/notifications?fallback=push_only` + 안내 문구 | `notification-route-contract.test.ts`(서버 빌더 → 기준표 일치·웹 해석) + **Android `NotificationRouteContractTest`**(같은 기준표, current 13행 일치·N1 대기 3행 고정) |
| C4 읽음 판정 | `unread = true AND read_at IS NULL` 하나(`notification-unread-predicate.ts`). 미읽음 목록·분류 탭·행 표시가 종 숫자와 같은 정의 | `notification-read-count-contract.test.ts` |
| C4 읽음 범위 | 푸시 탭(열기)도 종·전체·배너와 같은 `patchInboxNotificationIdsRead` 사용. 마케팅 알림(행 있음) 푸시 탭 읽음이 iOS·웹에서 빠지던 플랫폼 차이 수정 | F2 테스트(갱신)·`campaign-push-destination-inbox-detail.test.ts` |
| C4 숫자 | 회원 종 = 서버 A 권위(기존). 오너 종 = 서버가 그 매장 오너 알림 미읽음 전체를 셈(이전: 받은 목록에서 셈). 묶음 줄 = 「새 알림 N건/알림 N건」, 화면 순번 폐지. 앱 복귀 시 배지 1회 재집계 추가 | `notification-read-count-contract.test.ts`, UI 계약 테스트 갱신 |
| C3 종 팝업 | 최근 알림(읽음 포함) 기본 + 「안읽음」 필터(Owner 정책 1). 범위 = 서버 최근 80행, 전체 기록은 「알림 전체보기」 | 같음 |
| W5 전체 목록 | 「더 보기」로 펼친 뒤 조용한 갱신이 목록을 100행으로 줄이던 결함 수정(앞부분만 갱신, 뒷부분 유지) | 같음 |
| CI1 | `.github/workflows/ci.yml` 에 `android-notification-contract` 작업(목적지 관련 JVM 테스트 4종) | CI |

### 7-3. 기존 승인 계약과 Owner 지시의 충돌 (규정 「충돌을 그대로 보고」)

- Owner 2026-11-01 지시: 「알림 이벤트는 기본적으로 개별 1건 읽음」.
- 기존 승인 계약(read-badge 정책 §1·§5): 「글·주문·상품 화면을 열면 그 글·주문·상품의 알림 전체 읽음」. 실제로 글 화면(`CommunityDetail.tsx:95`)과 주문 상세(`MyStoreOrderDetailView.tsx:414`), 오너 주문(`OwnerStoreOrdersView.tsx:480,629`)이 화면을 열 때 그렇게 하고, 목록 탭도 같은 단위로 읽음 처리한다(`inbox-read-bridge.ts resolveInboxBellThreadRead`).
- 이번 반영: 범위 **값**은 바꾸지 않았다. 대신 범위를 정하는 곳을 한 함수로 모아, 같은 이벤트면 푸시·종·전체·배너 어디서 눌러도 결과가 같게 했다(Owner 요구 「동일 이벤트 → 동일 결과」 충족).
- 「개별 1건」으로 바꾸려면 위 화면 3곳의 「열면 전체 읽음」과 `resolveInboxBellThreadRead` 를 함께 바꿔야 한다 → **Owner 결정 필요**.

### 7-4. 확인한 기존 결함 (이번 범위 밖 · 보고만)

- Android JVM 테스트 `IncomingCallNotificationOwnerPolicyTest` 3건이 main 에서 실패 중(통화 영역 — 통화 규정상 별도 승인). CI1 은 알림 목적지 테스트만 돌린다.
- 기본 체크아웃(`/Users/bkkim/projects/samarket`)에는 W0 로 커밋한 문서들이 미추적 파일로 그대로 남아 있다. 기본 체크아웃을 main 으로 갱신(pull)하면 「untracked 파일이 덮어써짐」 오류가 날 수 있다. 내용이 같으므로 갱신 전에 그 파일들을 지워도 된다(작업자는 다른 세션 파일이라 지우지 않음).

---

## 8. 최종 확인 (Owner 읽음 계약 결정 2026-11-01 반영)

**읽음 계약 — 해결.** Owner 결정: 개별 1건으로 바꾸지 않고 글·주문·상품·방 단위 유지, 네 진입점은 같은 함수.
- 대조 결과(운영 행 모양 그대로 테스트 `notification-read-scope-contract.test.ts`)
  - 댓글·좋아요 → 그 글 전체.
  - 주문 상태 → 그 주문.
  - 거래 상태 → 그 상품(채팅은 방 읽음 ACK 그대로).
  - 글 상세·주문 상세·오너 주문 화면은 열 때 같은 단위로 읽음.
  - 알림 목록·종 팝업을 여는 것만으로는 읽지 않음(「모두 읽음」 버튼만).
- **결함 1건 발견·수정**: 앱 안 배너를 누르면 읽음 처리를 하지 않았다(`InAppNotificationBannerHost`). 글·주문은 도착 화면이 읽어 결과가 같았지만, 공지 상세·포인트·거래 상태 등은 배너로 열면 미읽음으로 남았다. → 종 팝업과 같은 PATCH(같은 서버 함수)로 연결.
- 메신저는 방 단위 읽음 ACK 그대로(이번 변경 없음).

**봉투 제거 영향 (코드 대조)**
| 항목 | 결과 |
|---|---|
| 공지·시스템·마케팅 분류 | 유지 — 분류는 저장 행의 `campaignType`·이벤트 종류로 정해지고 봉투와 무관 |
| 관리자 알림음·무음·진동 | 유지 — Android 채널(`androidChannelId`)·`soundMode` 는 봉투와 별개 필드, Android 에서 `eventClass` 를 읽는 곳은 해석기와 로그뿐 |
| Android 실행 중 | 캠페인도 다른 알림처럼 시스템 알림 생략 → 웹 배너·소리 1회. 마케팅은 웹 소리 키 `admin_notice_received`(이전 Android 만 채널음) |
| iOS·웹 | 변화 없음(탭은 웹 해석기, iOS 실행 중 OS 표시 없음) |
| 발송·실패·열람 기록 | 발송 기록은 서버 발송 결과로 무변경. 열람 기록은 푸시 탭 읽음 경로에서 그대로 기록되고, 행 있는 마케팅은 이전에 iOS·웹에서 빠지던 열람 기록이 이제 남는다 |
| 기존 설치 바이너리 | §7-1 표 — 1.0~build 24 모두 `url` 사용 |
| push_only | 봉투 유지, 알림센터 + 안내 |
| **RISK** | Android 앱 실행 중 캠페인 알림은 이제 웹 Realtime(`notifications-rt`) 하나에 달려 있다. 메신저와 같은 클라이언트·같은 비공개 채널 방식이지만, 알림 채널 자체의 앱 실기 기록은 없다 → **NOT_PROVEN**. 실기에서 안 뜨면 원인은 클라이언트 세션/Realtime 이며, 그때는 봉투를 되돌리는 대신 Realtime 쪽을 고친다(iOS 도 같은 경로에 의존) |

**C 시안 ↔ 동작 계약 차이 (최종 시안 전에 고칠 것)**
1. 시안의 「읽은 알림」 구획 → 확정 정책은 「최근 전체 + 안읽음 필터」(구현됨). 시안을 필터 방식으로 바꿔야 한다.
2. 묶음 표시 문구: 시안 「새 댓글 3」, 구현 「새 알림 3건」. 종류별 문구로 할지 결정이 필요하다.
3. 대상 줄(글 제목 등)·목적지 CTA 문구는 미구현이다. 댓글 알림은 저장 데이터에 글 제목이 없어(`meta.post_id` 만) 저장 데이터 추가가 선행돼야 한다.

**인계**: Android 통화 JVM 테스트 3건(`IncomingCallNotificationOwnerPolicyTest`) 실패는 알림 작업에서 제외 → 별도 통화 작업.

---

## 9. 실기 검증 (2026-11-01 08:05~08:22 PHT · Production `e811822cd` READY 확인 후)

조건: S = 삼성 · q테스트1 · Android 1.2.5 (24) · adb / X = 샤오미 · zxzx11 · Android 1.2.5 (20) · adb + WebView 디버깅 / I = 아이폰 14 Pro Max · w테스트1 · iOS 1.2 (20) · iPhone 미러링. 발송 = 관리자 「테스트 발송」(시험 계정 3개만). 판정 증거 = adb logcat·화면 녹화·WebView 주소·운영 DB(읽기)·Vercel 로그.

| # | 시험 | 결과 | 증거 |
|---|---|---|---|
| 1 | 공지 캠페인 저장 목적지 | **PASS** — 새 알림 전부 `routeUrl=/notifications/{자기 id}` | 운영 DB 「실기1 공지」 4행 |
| 2 | S 앱 실행 중 공지 | **PASS** — 시스템 알림 없음(`unknown_type_fallback`, 알림창 5→5), 웹 소리 1번(`admin_notice_received` 관리자 음원), 앱 안 배너 약 4초, 종 +1 | logcat 08:06:18~19, 화면 녹화 08:09 |
| 3 | X 백그라운드 공지 탭 | **1차 FAIL / 2차 PASS** — 1차: 네이티브는 `/notifications/5708a74d…` 로 넘겼으나 문서가 새로 로드되며 `[dibay-lifecycle] doc_reset same_epoch_reload_restore` 가 직전 메신저 방으로 되돌림(새 배포 직후). 2차(새 버전 로드 후): 공지 상세 | logcat 08:07:18~23, WebView 주소, 화면 |
| 4 | S 앱 안 배너 탭 (이번 수정) | **PASS** — 공지 상세 + `read_at` 08:10:33.842(생성 1.8초 뒤) | 녹화·운영 DB |
| 5 | 시스템 캠페인(고객센터 시스템 글) S·X 백그라운드 탭 | **PASS** — 두 빌드(24·20) 모두 그 시스템 글로 이동, `eventClass=null`, 읽음 기록 | logcat `pending_intent_extras`, 화면, 운영 DB |
| 6 | 종 숫자 대조 | **PASS** — S 4 → 공지 4건 −읽음 2건 = 6 (운영 DB 미읽음과 일치) | 화면·운영 DB |
| 7 | 댓글 푸시 탭 (글 단위 읽음) | **PASS** — 댓글 A 푸시 하나로 그 글의 미읽음 3건(A·B·10-28 것) 같은 시각 읽음, 종 8→5 | 운영 DB 08:14:48.018 |
| 8 | 앱 실행 중 댓글 3건 연속 | **PASS** — 소리 3번(1건당 1번), 배너 3번, 시스템 알림 0, 종 5→6→7→8 | logcat `foreground_skip`, 녹화 |
| 9 | 종 팝업 | **PASS** — 머리 숫자 = 종 배지(8), 최신순, 읽은 알림도 표시, 「안읽음」 필터, 순번 없음. **단 같은 글 댓글이 묶이지 않음(결함 F-2)** | 화면 |
| 10 | 종 팝업 목록 탭 (글 단위) | **PASS** — D 한 줄 탭 → 글 이동, C·D·E 같은 시각 읽음, 종 8→5 (푸시 탭과 같은 결과) | 운영 DB 08:16:58.5 |
| 11 | 아이폰 발송·저장 | **PASS** — APNs 200, 저장 목적지 상세 | notification_deliveries |
| 12 | 아이폰 앱 실행 중 | **PASS** — 앱 안 배너 1개 | 미러링 화면 |
| 13 | 아이폰 종 팝업 | **PASS(부분)** — 최신순·필터 확인. 머리 숫자 28 은 운영 DB 와 대조 못 함 → NOT_PROVEN | 미러링 화면 |
| 14 | 아이폰 푸시 탭 목적지 | **NOT_PROVEN** — 미러링 중 아이폰 알림 센터를 열 수 없음. 08:18:03 푸시 탭 읽음 요청(`/api/me/notifications/read`)과 앱 기동은 있었으나 도착 화면 미확인(뒤 화면은 커뮤니티 홈) | Vercel 로그 |
| 15 | 아이폰 배너 탭 읽음 | **NOT_PROVEN** — 배너 4초 안에 누르지 못함(Android 는 #4 PASS) | 운영 DB |

**새로 확인된 결함**

- **F-1 (FAIL · 푸시 목적지 유실)**
  - 현상: 앱이 떠 있는 동안 푸시 탭 이동이 문서 재로드로 이어지면, 앱 진입 판정이 지금 연 주소를 무시하고 직전 화면으로 되돌린다. 이번 실기에서는 새 배포 직후 X 에서 재현됐다.
  - 원인 코드: `lib/lifecycle/app-entry-kind.ts:97-106`. `doc_reset` 이면 저장된 복원 경로로 무조건 이동한다.
  - 수정안: `doc_reset` 에서 지금 문서 주소가 앱 진입점(`/`·부팅 경로)이 아닌 실제 앱 화면이면 복원하지 않고 그 주소를 유지한다.
  - 승인: 앱 진입·복원 전반(알림 밖)에 영향 → 별도 승인 필요.
  - 아이폰 #14 의 커뮤니티 홈 도착도 같은 원인일 가능성이 있다(미확인).
- **F-2 (구현 의도 불일치)**
  - 현상: 같은 글 댓글 알림이 한 줄로 묶이지 않는다.
  - 원인: 묶음 키(`group-inbox-by-thread.ts:122-125`)는 `domain === "community"` 를 기대하지만 댓글 알림 저장값은 `community_chat`(운영 DB)이다.
  - 결정 필요: 묶을지 여부는 C 디자인에서 결정.
- **관리자 화면(범위 밖 · 보고만)**: 「고객센터 글 고르기」 창 제목이 세로로 한 글자씩 깨져 보인다(1280px 폭).

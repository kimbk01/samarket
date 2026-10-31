# 알림 재감사 — 푸시 탭 진입·종류별 목적지·정렬/알림음·목록 UI/CTA·노출 시간 (2026-11-01 PHT)

> 순서: **감사 → 결함 확인 → 결함 설계안 → (Owner 승인) → 구현**. 이 문서는 승인 전 단계다. 코드·운영 DB 변경 없음.
> 기능 제거·신규 기능 없음. 기존 기능의 결함만 다룬다.

## 0. 확인 조건·증거 범위

| 항목 | 값 |
|---|---|
| 코드 기준 | 로컬 `main` HEAD `3d462fb05` |
| 운영 DB | `ckdosyydvgzqwpbwuhon` 읽기 전용 SELECT (테스트 DB 미사용) |
| Owner 화면(캡처) | Android, 계정 q테스트1(`9259ab7d…`), 설치 `1.2.5 (24)` (`user_devices` 2026-11-01 06:23 PHT) |
| 실기기 탭·소리 시험 | **하지 않음 → 실기 판정은 전부 NOT_PROVEN** |

판정 표기: **FAIL**(코드·DB 증거로 결함 확인) / **RISK**(코드상 결함 가능, 실기 미확인) / **OK(코드)**(코드 PASS, 실기 NOT_PROVEN).

---

## 1. 감사 ① — 푸시를 누르면 해당 내용이 아니라 알림(종) 목록으로 간다

### 1-1. 원인 (FAIL · 코드+운영 DB 증거)

Android 푸시는 앱이 직접 그린 알림이고, 누르면 **네이티브 `FcmPayloadResolver.resolveRouteUrl`** 이 정한 주소로 간다 (`MainActivity.java:2386` → `queueNavigateWebViewToAppPath`). 웹/iOS 는 `lib/push/push-envelope-v1.ts` 가 정한다. 두 해석기가 관리자 캠페인(공지·시스템·마케팅)에서 **서로 다른 곳**을 정한다.

| 캠페인 | 서버가 보내는 값 (`campaign-notification-presentation.ts:145-205`) | Android 탭 결과 (`FcmPayloadResolver.java:269-297`) | iOS/웹 탭 결과 (`push-envelope-v1.ts:236-275`) |
|---|---|---|---|
| 공지 · 목적지 없음 | eventClass=`admin_notice`, targetKind=`notification`, targetNotificationId | `/notifications?tab=system&notificationId=…` → **알림 목록** (행 강조만, `MyNotificationsView` :540-571). 공지인데 「system」 탭 | `/notifications/{id}` → 공지 상세 |
| 시스템 · 목적지 유무 무관 | eventClass=`admin_system` | **처리 분기 없음** → `/notifications` **목록 첫 화면** (딥링크가 있어도 무시) | 상세 또는 지정 경로 |
| 마케팅 · 목적지 없음 | eventClass=`admin_marketing` | `/notifications?tab=marketing&notificationId=…` → 목록 | `/notifications/{id}` 상세 |
| push_only 공지·시스템 | 앱 안 알림을 안 만들어 `notificationEventId=null` → `preview:{campaignId}` 가 대상 id 로 들어감 (`campaign-send-user.ts:188` · presentation :121,201) | 목록 | 없는 상세 `/notifications/preview:…` |

운영 DB 증거: Owner 화면의 「디바이 알림」(캠페인 `9bc8fd4d…`, 2026-10-31 09:02~09:05 PHT 발송) 이벤트 `display_payload.routeUrl = "/notifications"`, `deeplinkUrl = null` → 서버가 목적지 없는 공지로 보냄 → Android 에서 위 1행대로 **목록으로 감**. 캡처 4건 중 공지 3건이 모두 이 경우.

### 1-2. 일반 알림(댓글·메신저·거래·주문·고객센터)은?

서버가 봉투(eventClass) 없이 `url` 을 실어 보내므로 Android·iOS 모두 `url` 로 간다 → **해당 화면으로 감 (OK(코드))**. 운영 DB 최근 10일 종류별 `routeUrl` 확인:

| 종류 | 운영 routeUrl 예 | 판정 |
|---|---|---|
| chat_message / group_message / missed_call | `/community-messenger/rooms/{roomId}` | OK(코드) |
| trade_message / trade_status | `/community-messenger/rooms/{roomId}(?source=product_chat)` | OK(코드) |
| community_activity (댓글) | `/community/posts/{postId}` (라우트 `app/(main)/community/posts/[postId]` 존재) | OK(코드) |
| community_activity (친구 수락) | `/community-messenger?section=friends` | OK(코드) |
| order_status | `/orders?expand={orderId}` | OK(코드) |
| support_* | `/support/cases/{id}` | OK(코드) |
| admin_notice (매장 결정) | `/stores/owner?storeId=…` | OK(코드) |
| notice_published (공지 캠페인) | `/notifications` | **FAIL** (1-1) |

---

## 2. 감사 ② — 종류별 알림 구현 결함 (발송·목적지)

| # | 판정 | 결함 | 증거 |
|---|---|---|---|
| N1 | FAIL | 1-1 전체 (Android 캠페인 탭 → 목록) | 위 |
| N2 | FAIL | 채팅 신고 결과·제재 알림에 목적지가 없다. 앱 안 행·푸시 모두 `/notifications?fallback=origin_unavailable` → 종 팝업에서 누르면 **목록으로 이동**, 전체 화면에서는 「원본 없음」 안내. 알림 자체가 내용인데 상세로 안 간다 | `lib/admin-chat-reports/notify-chat-report-result.ts:41-68` (link_url 없음) |
| N3 | FAIL | campaignType 없는 `admin_notice`·`admin_system` 행은 link 가 fallback 으로 굳어 상세 분기(`resolve-notification-inbox-href.ts:126-135`)에 도달 못 함 | `inbox-events-merge.ts:488-490`, `resolve-notification-inbox-href.ts:245-247` |
| N4 | RISK | 옛 거래 채팅(`roomKind: trade_legacy`)은 roomId 가 거래방 id 인데 `/community-messenger/rooms/{그 id}` 로 링크 → 다른 방/없는 방 가능. 구매확정 알림도 CM 방 id 없으면 거래방 id 사용 | `fcm-data-payload-contract.ts:356`, `resolve-notification-destination.ts:111`, `confirm-buyer/route.ts:118-123` (운영 발생 여부 NOT_PROVEN) |
| N5 | 작음 | 그룹 초대 푸시 FCM type 이 `chat_message` → 그룹 묶음 tag·`?type=group` 빠짐 | `fcm-data-payload-contract.ts:93` |
| N6 | 잠재 | Android 예비 경로 `community_comment → /philife/posts/{id}` 는 없는 라우트(404). 지금은 서버가 항상 url 을 보내 실제 미사용 | `FcmPayloadResolver.java:191-193` |

참고(결함 아님, 기록): 거래 **예약·후기** 알림은 알림 생성 코드가 없다(방 시스템 메시지 여부 NOT_PROVEN). 계약상 있어야 하는지는 `docs/trade-chat-buyer-seller-process.md` 확인 대상 — 이번 범위에서는 「기능 신규 금지」라 손대지 않는다.

---

## 3. 감사 ③④ — 새 알림 순서·알림음·푸시

### 3-1. 정렬

- 서버: `notification_events` `created_at desc` (`inbox-events-merge.ts:785`), 클라이언트도 created_at 내림차순 (`group-inbox-by-thread.ts:178`). 고정(pin) 없음 → **최신순 OK(코드)**.
- 새 알림은 앞에 끼워 넣지 않고 **목록 전체를 다시 받아 교체** → 서버 순서 그대로 맨 위.

| # | 판정 | 결함 |
|---|---|---|
| S1 | FAIL | 같은 글·주문·방 알림은 한 줄로 합쳐지는데 **「+N건」 표시가 없다** → 새 댓글이 와도 줄 수·순번이 그대로라 「새 알림이 안 올라온다」로 보인다 (`groupKeyForInboxRow` :105-148, `InboxGroupCardList`) |
| S2 | FAIL | 종 팝업 번호(04…01) = **안 읽은 그룹 수**, 종 배지 = **안 읽은 행 수**, 그리고 팝업은 최근 **80행** 안에서만 고른다 → 배지 4 / 팝업 3줄 같은 불일치 발생 가능 (`bell-unread-sequence-label.ts`, `member-notification-a-authority.ts:69`, `route.ts:405`). 주석 「≈200」은 낡음(:617) |
| S3 | RISK | 종 팝업이 **닫혀 있을 때는** 갱신 안 함(열 때 1회), 앱 안 실시간 반영은 Supabase Realtime 하나뿐 (JS `pushNotificationReceived` 리스너 0건). Realtime 끊기면 전체 화면은 75초 폴링뿐 |

### 3-2. 알림음

| 상황 | 현재 동작 (코드) | 판정 |
|---|---|---|
| 앱 밖(백그라운드·종료) Android | 앱이 그린 알림, 채널 `IMPORTANCE_HIGH`, 서버 soundMode(무음·무진동 채널) 반영 | OK(코드) |
| 앱 밖 iOS | `aps.sound` 항상 `"default"` (silent 일 때만 뺌) — 종류별 맞춤 알림음 아님 (`apns-sender-impl.ts:227`) | RISK (관리자 알림음 매핑이 iOS 에 안 먹음, 실기 NOT_PROVEN) |
| 앱 안 Android · 일반 알림 | 시스템 알림 안 그림(`DibayFirebaseMessagingService` :104-117) → Realtime INSERT → 앱 안 배너 + `routeNotificationInsertSound` (`/sounds/notification.wav` 또는 관리자 매핑) | OK(코드) |
| 앱 안 Android · **관리자 캠페인** | 봉투가 있으면 앱이 보이는 중에도 **시스템 알림을 그림**(:116) + Realtime 배너·소리도 남 | **S4 RISK: 소리 2번·알림 2개** |
| 앱 안 · `/notifications` 화면 | 배너 안 띄움(`member-in-app-notification-banner.ts:103`), 1.2초 묶음 후 목록만 교체 | 기록 |
| 앱 안 · 창 포커스 없음 | 소리 무음 처리(`notification-sound-gate.ts:54-56,129-133`) | 기록 |

---

## 4. 감사 ⑤ — 알림 목록·전체 목록 UI/UX/CTA

캡처 기준 한 줄 구성: 순번(04) · 원형 분류 아이콘 · 분류 칩(공지/커뮤니티) · 시간 · 안 읽음 점 · 제목 · 본문 1줄 · 화살표.

| # | 판정 | 결함 | 증거 |
|---|---|---|---|
| U1 | FAIL | **무엇에 대한 알림인지(대상)가 줄에 없다.** 댓글 알림: 제목 「zxzx11님이 댓글을 남겼어요」, 본문 = 댓글 내용(운영 DB: 댓글 `9c10bd32…` 내용이 실제로 `u4claude2015`) → **어느 글**인지 안 보임. 공지: 「디바이 알림」+본문만, 누르면 어디로 가는지 표시 없음 | `community-social-inapp-notify.ts:79-91` (meta 에 post_id 만), `InboxGroupCardList.tsx` |
| U2 | FAIL | 화살표(›) 하나로 모든 줄의 CTA 가 같다 → 「글 보기 / 대화방 열기 / 주문 보기 / 공지 읽기」 구분 없음 | `InboxGroupCardList.tsx` |
| U3 | FAIL | 순번 04→01 은 내용 정보가 아니고, 하나 읽으면 다시 매겨지며 배지 숫자와도 다르다(S2) | `bell-unread-sequence-label.ts`, 팝업 :1108 |
| U4 | FAIL | 종 팝업과 전체 화면의 탭 동작이 다르다 — 원본 없는 행: 팝업은 **목록으로 이동**, 전체 화면은 안내 | 팝업 `onActivate` :841-867 vs `MyNotificationsView` :697-701 |
| U5 | FAIL | 종 팝업은 **안 읽은 것만** 보여 줘서, 누르고 돌아오면 그 줄이 사라진다(방금 본 알림을 다시 찾을 수 없음) | 팝업 :370-373 |
| U6 | 기록 | 오너 알림 목록은 공통 목적지 판정을 거치지 않고 `router.push(item.href)` | `OwnerNotificationList.tsx:244-255` |

---

## 5. 감사 ⑥ — 앱 안·앱 밖 알림이 머무는 시간

| 위치 | 현재 값 (코드) |
|---|---|
| 앱 안 배너 (메신저·회원 알림 공통) | **4초** 후 자동 사라짐 (`IN_APP_NOTIFICATION_BANNER_AUTO_DISMISS_MS = 4_000`) |
| 메신저 배너 표시 대상 | 2분 넘은 메시지는 배너 안 띄움 (`BANNER_MESSAGE_MAX_AGE_MS = 120_000`) |
| Android 헤드업(화면 위 팝업) | 채널 IMPORTANCE_HIGH → 노출 시간은 **OS 가 정함**(앱이 지정하는 값 없음, `setTimeoutAfter` 미사용) |
| Android 알림창 보관 | 누르거나 그 방을 읽을 때 그 건만 지움, 전체 지우기는 로그아웃 때만 → 사용자가 지울 때까지 남음 |
| iOS 배너 | OS 가 정함 |

**확인 못 함:** 「레거시 어플」이 무엇을 말하는지(이전 DIBAY 버전인지, 카카오톡·당근 같은 기존 앱인지)와 그 앱의 노출 시간. 비교 기준이 없어 차이를 판정하지 않았다. → 보고 끝의 질문 1개.

---

## 6. 결함별 설계안 (승인 대상)

배포 구분: **A·B·C·D = 웹(서버·화면)만 → main 반영 후 앱 재시작**. **E = 네이티브(Android)** → 다음 설치 빌드에 포함, versionCode 1 증가. 통화 경로는 건드리지 않는다(통화 변경 규정 적용 대상 아님 — `call*`·`lib/push` 통화 발송 무변경).

### A. 캠페인 푸시 탭 → 해당 공지 상세로 (N1) — 웹(서버)

- 바꿀 곳: `lib/admin/notification-campaigns/campaign-notification-presentation.ts`
  1. 목적지 없는 공지·시스템·마케팅 캠페인(앱 안 알림 있음)은 `targetKind="approved_internal_route"`, `targetApprovedRoute="/notifications/{이벤트 id}"` 로 보낸다. → 지금 설치된 Android build 24 도 `admin_notice`·`admin_marketing` 에서 approvedRoute 를 그대로 쓰므로 **재설치 없이 상세로 감**. iOS/웹 해석 결과(상세)는 지금과 같다.
  2. 시스템 캠페인은 build 24 Android 에 `admin_system` 분기가 없어 1번만으로는 안 된다 → 서버가 시스템 캠페인도 `eventClass="admin_notice"` + `targetTab="system"` 으로 보낸다(웹 해석기는 두 값을 같은 분기로 처리 — `push-envelope-v1.ts:236`, 결과 동일).
  3. push_only(앱 안 알림 없음) 공지·시스템: `preview:{campaignId}` 를 대상 id 로 쓰지 않는다. 지정 목적지가 있으면 그곳, 없으면 기존 안전 경로 `/notifications` 로 명시(없는 상세로 가지 않게).
- 영향 화면·호출처: 관리자 「알림 보내기」 미리보기·시험 발송·본 발송(같은 함수), Android/iOS 탭, 종 팝업·전체 화면 행(행 경로는 `display_payload.routeUrl` 로 별도라 무변경).
- 깨질 수 있는 것: 관리자 미리보기 화면의 「이동 경로」 표기 — 같은 단계에서 새 값으로 표시 확인. 기존 테스트 `lib/push/__tests__/*envelope*`·캠페인 presentation 테스트 갱신.

### B. 목적지 없는 「알림 자체가 내용」 행 → 상세로 (N2·N3·U4) — 웹

- 채팅 신고 결과·제재(`notify-chat-report-result.ts`): 생성 시 link 를 비우지 않고 상세 경로를 쓰도록 `resolve-notification-inbox-href.ts` 의 「알림 자체가 내용」 판정에 `chat_report_result`·`chat_report_sanction`·campaignType 없는 `admin_notice`/`admin_system` 을 넣고, `inbox-events-merge.ts:488-490` 의 fallback 고정보다 이 판정을 먼저 한다.
- 종 팝업 `onActivate` 를 전체 화면과 같은 동작으로: 원본이 없으면 목록으로 이동하지 않고 같은 안내를 띄운다.
- 영향: 종 팝업, 전체 화면, 앱 안 배너(같은 `activateNotificationDestination` 사용), 푸시 탭(`resolve-push-route-from-fcm-data.ts:202-206` 이미 상세로 변환 — 무변경).

### C. 목록 한 줄에 「무엇에 대한·어디로 가는」 표시 (U1·U2·U3·S1·S2·U5) — 웹

- 대상 줄 추가: 서버 행 변환(`inbox-events-merge.ts`)에서 이미 있는 id 로 대상 이름을 붙인다 — 댓글/좋아요 = 글 제목, 메신저·거래 = 방 이름/상품명(`display_payload.contextLabel`·`roomName` 이미 있음), 주문 = 매장명·주문번호(기존 주문 줄), 공지 = 「공지」. 댓글 생성 시 meta 에 `post_title` 도 저장(`community-social-inapp-notify.ts`).
- CTA 문구: 화살표 대신 줄 오른쪽에 목적지 이름 — 「글 보기」「대화 열기」「주문 보기」「공지 보기」「문의 보기」. 판정은 기존 목적지 판정(`resolveNotificationInboxHref`) 결과의 경로 종류로만 정한다(새 경로 만들지 않음).
- 합쳐진 줄: 「새 댓글 3」처럼 건수 표시(기존 unreadCount 사용).
- 순번(04…01) 제거하고, 종 팝업 머리글 숫자 = 종 배지와 같은 값(행 수)으로 맞춘다. 팝업 조회 범위 80행 주석 정정.
- 종 팝업: 안 읽은 것만 → **최근 알림(읽음 포함) 최신순, 안 읽은 것은 점·굵기로 구분**. 방금 본 알림이 사라지지 않게.
- 디자인: 공통 카드가 아니라 분류별 아이콘 색·칩을 유지하고, 대상 줄·CTA 를 더한 **시안을 먼저 Owner 확인**(HTML 시안 1장) 후 구현. 반경·색은 `--sam-*`·`rounded-ui-rect` 규칙.
- 영향: 종 팝업, 전체 화면 7탭, 오너 알림 목록(같은 행 컴포넌트 `InboxGroupCardList` 사용 여부 확인 후 같은 단계에서 맞춤), UI 래칫 테스트(IA-19) 갱신.

### D. 앱 안 중복 알림음 (S4) · 실시간 반영 보강 (S3) — 웹/네이티브 판단 필요

- S4: 관리자 캠페인이 앱 실행 중 Android 시스템 알림 + 앱 안 배너·소리로 **두 번** 알리는지 실기에서 먼저 확인(로그 `[fcm] unknown_type_fallback`·배너). 확인되면 앱 실행 중에는 앱 안 배너 하나만(다른 종류와 같은 규칙) — 이 경우 네이티브 1줄(:116) 변경이라 E 에 포함.
- S3: 종 팝업이 닫혀 있어도 Realtime INSERT 를 받으면 다음 열 때 바로 최신이 보이도록 기존 「다시 받기 필요」 표시를 유지하되, Realtime 끊김 시 재구독 여부를 실기 로그로 먼저 확인. 확인 전에는 폴링 간격만 줄이는 임시 조치 하지 않음(근본 수정 규칙).

### E. Android 네이티브 정렬 (N1 근본·N6·S4) — 네이티브, 다음 설치 빌드

- `FcmPayloadResolver.resolveEnvelopeRoute` 를 웹 `push-envelope-v1.ts` 와 같은 규칙으로: `admin_system` 분기 추가, 목적지 없는 공지·마케팅은 `/notifications/{id}` 상세. `community_comment` 예비 경로 `/community/posts/{id}`.
- 구 바이너리(build 24 이하) 호환: A 의 서버 값이 approvedRoute 로 이미 상세를 주므로 구·신 바이너리 모두 같은 결과.
- 검증: JVM 단위 테스트(기존 `FcmPayloadResolver` 테스트) + 실기.

### 범위 밖으로 기록만 (고치지 않음)

N4(옛 거래방 id 링크 — 운영 발생 여부 조회 후 별도 보고), N5(그룹 초대 type), iOS 종류별 알림음(`aps.sound` 항상 default), 오너 목록 공통 판정 미사용(U6), 거래 예약·후기 알림 생성 코드 없음.

---

## 7. 실기 검증 항목 (구현 후 · Owner 사용 상태: q테스트1 로그인 · Android build 24 · 저장 주소)

| # | 시험 | PASS 기준 |
|---|---|---|
| V1 | 앱 종료 상태에서 목적지 없는 공지 푸시 탭 | 공지 **상세** 화면(제목·본문·이미지)이 열림 |
| V2 | 같은 시험 — 시스템·마케팅 캠페인, 목적지 지정 캠페인 | 상세 / 지정 화면 |
| V3 | 백그라운드 상태 댓글·메신저·거래·주문·고객센터 푸시 탭 | 각 글·방·주문·문의 화면 |
| V4 | 앱 실행 중 새 알림 3건 연속 | 종 배지·팝업 숫자 같음, 맨 위 최신, 소리 1번씩, 배너 4초 |
| V5 | 종 팝업·전체 화면 각 줄 | 대상 이름·CTA 문구가 실제 목적지와 일치, 누르면 그 화면 |
| V6 | 채팅 신고 결과 알림 탭 | 알림 상세(목록 아님) |
| V7 | iPhone 에서 V1·V3 | Android 와 같은 목적지 |

각 시험마다 Production SHA·PHT 시각·운영 DB `notification_events.opened_at` 대조를 기록한다.

---

## 8. 처리 결과 (Owner 실행 지시 2026-11-01 후 · 브랜치 `fix/notif-reaudit-1101`)

| ID | 처리 | 근거 |
|---|---|---|
| N1 공지·마케팅 | **수정(웹)** — 목적지 없는 캠페인은 `targetApprovedRoute=/notifications/{이벤트 id}` → Android build ≤24·iOS·웹 모두 상세 | `campaign-notification-presentation.ts`, 테스트 `campaign-push-destination-inbox-detail.test.ts` |
| N1 push_only | **수정(웹)** — 없는 상세(`preview:`·발송 tag) 대신 `/notifications` 명시 | 같은 테스트 |
| N1 시스템 캠페인(Android) | **미수정 → E 승인 대기**. `admin_system→admin_notice` 변환은 `push-routing-transport.ts:169` 운송 분류가 바뀌어 적용 안 함. 운영 시스템 캠페인 최근 발송 2026-08-12 | `notification-android-native-e-plan-2026-11-01.md` |
| N2·N3·U4 | **수정(웹)** — 원본 없는 관리자 알림(신고 결과·제재·옛 운영 공지 298건)은 종 행·푸시 모두 `/notifications/{id}`. 원본을 못 찾은 행 탭은 종 팝업·알림센터·앱 안 배너 모두 알림 상세(공통 `activateNotificationDestination`) | `admin-notice-content-only.ts`, `inbox-events-merge.ts`, `notify-push-dispatcher.ts`, `navigate-notification-destination.ts`, 테스트 `reaudit-1101-content-only-detail.test.ts` |
| N4 | **정상(현행 코드)** — 운영 trade_message 172건 전부 실제 메신저 방. 방이 아닌 링크 2건은 B-08 수정 커밋(10-28 08:32 PHT) 이전 06:49 생성분이고, 방 화면이 product_chats id 를 실제 방 id 로 바꿔 줌(`use-messenger-room-url-sync-effects.ts:45`) | 운영 DB |
| N5 | **수정(웹)** — 그룹 초대 FCM type `chat_message`→`group_message` (통화 분기 앞쪽 무변경) | `fcm-data-payload-contract.ts`, 같은 테스트 |
| N6 | **E 대기**(네이티브 예비 경로, 현재 미사용) | E 계획 |
| S1·S2·U1·U2·U3·U5 | **시안 제출 → Owner 확인 대기** | `notification-list-cta-mockup-2026-11-01.html` |
| S3 | **코드 정상** — Realtime 재연결 시 `RESYNC` 따라잡기(`useSupabaseNotificationsRealtime.ts`), 18초 무신호 재시도. 클라이언트 Supabase 세션 유무는 실기 NOT_PROVEN | 코드 |
| S4(D) | **원인 확인(코드)** — 앱 실행 중 Android 는 봉투 있는 캠페인에 시스템 알림+채널 소리(`DibayFirebaseMessagingService.java:114-117`), 웹은 Realtime 배너+소리 → 2번. iOS 는 foreground 표시 옵션 없음 → 1번. 수정은 네이티브 → E | 코드 (실기 NOT_PROVEN) |
| iOS 알림음 | **범위 밖(미구현 기능)** — iOS 번들 알림 소리 파일 0개, 운영 `ios_sound_name` 전부 null(2026-10-27 재감사 기록) → 소리 파일·DB 자산·번들 추가가 필요한 신규 작업 | `notification-full-reaudit-2026-10-27.md:188` |
| U6 오너 목록 | **정상** — 오너 주문 전용 경로 함수(`resolveOwnerNotificationHref`)와 서버가 안전 경로로 정규화한 링크 사용, 회원 공통 판정에는 오너 storeId·탭 규칙이 없음 | 코드 |

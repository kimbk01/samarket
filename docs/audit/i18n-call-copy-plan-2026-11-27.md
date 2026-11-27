# 통화 문구 한국어·영어 결함 수정 계획 (2026-11-27 · 통화 변경 규정 §3 계획서)

> 근거: Owner 「d7 통화도 승인, 진행해」(2026-11-27) · 언어 SSOT `docs/i18n-ssot.md` §3 · 재감사 결함 목록(통화 행 28건 + 추가 4묶음).
> 기준 트리: `origin/main` `8443adca4` · 브랜치 `fix/i18n-call-copy`.
> 바꾸는 것은 **사용자에게 보이는 글자(언어)** 뿐이다. 통화 연결·세션 생성·상태 전이·VoIP/FCM 발송 대상·발송 순서·데이터 키·CallKit·네이티브 코드·DB 열은 바꾸지 않는다.
> 네이티브(`android/**`·`ios/**`) 변경 없음 → **웹만** (새 빌드·버전 증가 없음).

---

## 0. 기존 설계와의 충돌 (허위 보고 금지 §7 — 먼저 적는다)

- `docs/audit/i18n-s8-native-plan-2026-11-08.md` §1 원칙 2·S8-6 표(442~443줄)와 `lib/notifications/notification-user-language.ts` 주석은 「**통화 푸시(VoIP/FCM) 제목·본문은 바꾸지 않는다** — 설치된 구 앱(Android 37 등)이 「님의 전화」·「영상」 판정에 의존」으로 승인돼 있다.
- 이번 Owner 지시(재감사 d7 통화 승인)는 수신 통화·부재중·종료 푸시 제목·본문을 **받는 사람 언어**로 바꾸라는 것이다 → 두 설계가 충돌한다.
- **결정 기록 — S8 원칙 2 를 뒤집는다.** `i18n-s8-native-plan-2026-11-08.md` §1-2(원칙 2)·S8-6 의 「통화 푸시 제목·본문 형식 유지」를 이 변경으로 폐기한다. 승인: Owner D7 (2026-11-27 「d7 통화도 승인, 진행해」). 근거(코드 이력, §2-1):
  - Android 가장 오래된 설치 빌드 39(`e75b7cdff`, 2026-11-10)·54(`43b7960d3`) 의 `FcmPayloadResolver.java:53-54` 가 이름을 `callerName`→`caller_name`→`title` 순으로 읽고, `IncomingCallUiCopy.callerDisplayName` 은 이름 값이 있으면 본문을 보지 않는다(이 우선순위는 `34ad162fe`, 2026-06-17 부터).
  - iOS 가장 오래된 설치 빌드 21(`5d97a3a18`, 2026-11-02) 의 `IncomingCallCallerIdentity.resolveDisplayName` 이 `callerName`/`caller_name`/`displayName`/`display_name` 을 먼저 읽는다(`85e467cb6`, 2026-08-02 부터). 영어 「video call」「voice call」 은 이미 종류 이름으로 걸러진다.
  - 서버는 `caller_name`·`callerName` 을 항상 비어 있지 않게 싣는다(`profileLabel()` 대체값 포함) → 「님의 전화」 파싱·「영상」 판정은 지금 설치된 어떤 빌드에서도 수신 이름·종류를 정하지 않는다.
  - S8 문서가 말한 「Android 37 등」 은 30일 활성 설치 목록에 없다(최저 39).
- 이 계획은 아래 §2 의 **설치 바이너리 실측(코드 이력)** 으로 「현재 설치된 구 앱은 발신자 이름을 데이터 필드 `callerName`/`caller_name` 에서 먼저 읽고, 본문 「님의 전화」 파싱은 이름 필드가 비었을 때만 쓰는 대체 경로」임을 확인하고, **한국어 받는 사람의 제목·본문 글자는 지금과 한 글자도 같게** 두는 조건으로 Owner 지시를 따른다. 원칙 2 를 뒤집는 결정이므로 보고 맨 앞에 적는다.

## 1. 결함 목록과 처리

| # | 위치 | 지금 | 바꾼 뒤 |
|---|---|---|---|
| A | `lib/push/send-community-messenger-incoming-call-push.ts:66-67` 수신 통화 푸시 제목·본문 | 「영상 통화/음성 통화」「{이름}님의 전화」 고정 | 받는 사람 언어: ko 그대로 · en 「Video call/Voice call」「{name} is calling」. 데이터 필드(`caller_name`·`callerName`·`kind`·`call_kind`·`callType`·`media_type` …) **전부 그대로** |
| B | `send-community-messenger-call-canceled-push.ts:47` · `…answered-elsewhere-push.ts:33` 종료 신호 제목 | 「통화」 | 받는 사람 언어 `cm_ui_call_label` (ko 「통화」 그대로 · en 「Call」). 본문 "" 그대로 |
| C | `call-missed-notification-authority.ts:177-199` 부재중 알림 행 제목·본문·이름 대체값 | 「부재중 전화」「{이름} · 부재중 음성/영상 통화」「상대방」 저장 | 받는 사람 언어로 만들어 저장(ko 글자 그대로). `display_payload` 에 `title_key`·`body_key`·`caller_name`·`callKind` 저장(인박스 재렌더용) |
| D | `notifications/missed-call-event-banner.ts:128` 앱 안 부재중 배너 | 행의 저장 문장(`row.title`/`row.body`) 표시 | 행 `display_payload`(callKind·caller_name)로 **지금 앱 언어 키**에서 제목·본문 생성 |
| E | `lib/call/call-notification.ts:40-41` 웹 브라우저 OS 수신 알림 | 한국어 고정 | `getRuntimeAppLanguage()` + 키 |
| F | `rooms/[roomId]/calls/route.ts:38` · `calls/sessions/incoming/route.ts:20` 429 문장 | 한국어 문장을 `error` 로 보냄 | `error` = 코드(`community_messenger_room_call_start_rate_limited` / `…incoming_call_rate_limited`) |
| G | `call-in-app-notice-store.ts:37` 문장 override · `call-v4-actions.ts:812` · `call-v3-actions.ts:134` | 서버 `error` 문장을 그대로 화면에 | 서버 `error` 는 **코드일 때만** 사건 판정에 쓰고 문장은 버림. 429·`*_rate_limited` 코드 → 새 키 「요청이 너무 많습니다」. 클라이언트가 키로 만든 문장 override 는 기존대로 허용(호출처 30곳이 키 문장을 넘김) |
| H | `call-session-navigation-seed.ts:172,495,511,524,568,601,605,611,616,619,622,628` (레거시 발신 레인) | 한국어 문장 | 키. 511 은 서버 `error` 를 쓰지 않음(429→새 키, 거부 코드→기존 deny 문구, 그 외→새 키 「대화방을 만들지 못했습니다」) |
| I | `GlobalCommunityMessengerIncomingCall.tsx:554-557` 수신 목록 오류 배너 | `incomingListFailed (서버 error)` | 429 → 새 키, 그 외 → `incomingListFailed` 만 |
| J | `incoming-call-realtime-preview.ts:20` | 「회원 xxxxxx」 | `cm_svc_member_fallback` (런타임 앱 언어) |
| K | `use-messenger-room-phase2-room-presentation.ts:309-316` 그룹 통화 상태 5개 | 한국어 고정 | 키 (같은 파일의 다른 줄은 건드리지 않음) |
| M | 통화 기록 목록 미리보기 토큰 「통화」 (`room-list-semantic-preview.ts` `ROOM_LIST_PREVIEW_CALL_TOKEN` · `home/patch-bootstrap-room-list-from-realtime-message.ts` `\|\| "통화"`) | 영어 화면에도 「통화」 (`cm-home-list-copy.ts` 의 레거시 통화 판정이 원문 그대로 돌려줌) | 저장 값은 그대로(「통화」 = 카탈로그 ko `cm_home_preview_call` 값으로 정의 · 실시간 패치도 같은 상수). 홈 목록 `getRoomPreviewText` 가 이 토큰이면 `cm_home_preview_call`(보는 사람 언어) |
| N | `lib/store-order-chat/messenger-delivery-room-header.ts:240` `resolveStoreOrderBuyerVoicePeerLabel` 대체 이름 「매장」 (매장 주문 구매자의 발신 확인·발신 화면 이름) | 한국어 고정 | `common_store` (보는 사람 언어, 기본 = 앱 실행 언어) |
| O | 통화 route 요청 제한(429) 한국어 문장 12곳: `calls/attempts/[attemptId]/cancel` · `calls/ice-servers` · `calls/logs/[callLogId]` · `calls/realtime-credentials` · `calls` · `calls/sessions/[sessionId]`(GET·PATCH) · `calls/sessions/[sessionId]/signals`(GET·POST) · `calls/sessions/[sessionId]/token` · `calls/sessions/active` · `calls/stub-message` | `error` = 한국어 문장 | `error` = 기존 `code` 값 그대로. 이 브랜치의 `enforceRateLimit`(`lib/http/api-route.ts:190·232`)는 `message` 를 지우면 한국어 기본 문장으로 떨어지므로 `message` 를 지우지 않고 **코드 값으로** 둔다(공용 헬퍼는 범위 밖 — 다른 브랜치가 코드+retryAfterSec 로 바꿈). 클라이언트 확인: 이 경로들의 `error` 글자를 화면에 쓰거나 한국어 문장과 비교하는 곳 없음(통화 기록 삭제는 `cm_ui_call_log_delete_failed` 키, 세션 PATCH·토큰·시그널은 개발 로그·`Error` 사유로만, 네이티브 Android·iOS 는 상태 코드 429 로만 판정 — `NativeOutgoingWebGoneWatchPolicy.java:69`·`NativeVoiceCallApi.swift:279,547`) |
| L | `calls/redial-room/route.ts:34` 429 문장 · `call-history-redial-room-client.ts:56` | 한국어 문장 · 429 도 「이 대화방 상태에서는 통화를 시작할 수 없습니다」(`cm_call_deny_room_mismatch`) 로 표시 | `error` = 코드(`community_messenger_call_redial_room_rate_limited`) · 클라이언트는 429·요청 제한 코드면 「요청이 너무 많습니다」 키 |

범위 밖(보고만, 고치지 않음): `enforceRateLimit` 기본 문장(`lib/http/api-route.ts:232`, 통화 외 공용) · 같은 계열 단어 판정(`inferCallInAppNoticeEventFromFailureMessage` 의 한국어 단어 목록, 동작 판정이라 유지).

새 키는 `lib/i18n/catalog/reaudit-call.ts` (`reauditCallMessages`, ko·en) 한 파일. 기존 키를 쓸 수 있으면 기존 키(`nav_voice_call_label`·`nav_video_call_label`·`cm_ui_call_label`·`common_login_required`·`cm_ui_trade_post_calls_disabled`·`cm_ui_trade_post_voice_only`·`cm_svc_member_fallback`·`cm_ui_other_party`).
새 키 이름은 다른 브랜치와 겹치지 않게 `reaudit_call_*` 접두.

## 2. 설치된 구 바이너리 호환 (통화 변경 규정 §3)

설치 현황(운영 `user_devices`, 최근 30일 활성, 2026-11-27 · 작업 지시서 기재값): Android 1.2.6(39) ~ 1.2.8(86) · iOS 1.2(21) ~ 1.2.9(65). `app_language` 에 구 iOS 빌드의 `en` 포함.

빌드 번호 → 날짜(`git log -S` 로 확인): iOS 21 = 2026-11-02(`5d97a3a18`), 22 = 11-05, 27 = 11-08, 31 = 11-10, 34 = 11-13 · Android 39 = 2026-11-10(`e75b7cdff`), 54 = 11-14(`43b7960d3`). **가장 오래된 설치가 2026-11-02 빌드.**

### 2-1. 네이티브가 푸시에서 읽는 필드 (구 빌드 코드로 확인)

| 플랫폼 | 이름을 정하는 순서 | 「님의 전화」 파싱 | 「영상」 판정 | 확인 |
|---|---|---|---|---|
| Android (39·54 빌드 소스 = 현재와 동일) | `FcmPayloadResolver.java:53-54` `callerName` ← `data.callerName` → `data.caller_name` → `data.title` · `IncomingCallUiCopy.callerDisplayName(callerName, title, body)` 는 `callerName` 이 비어 있지 않으면 그것만 씀(:9-13, 2026-06-17 `34ad162fe` 부터) | `resolveCallerDisplayName`(:78-89) — `callerName` 이 **비었을 때만** | `statusBrandLabel` — `callType`(데이터 `callType`, 서버가 항상 `video`/`audio` 로 채움)이 우선, 제목·본문 「영상」은 `callType` 이 없을 때의 대체 | `git show e75b7cdff:…FcmPayloadResolver.java` · `git show 43b7960d3:…IncomingCallUiCopy.java` |
| iOS (21 빌드 = `5d97a3a18` 소스 = 현재와 동일) | `IncomingCallCallerIdentity.resolveDisplayName` `callerName`→`caller_name`→`displayName`→`display_name` → 본문 파싱 → 제목(종류 이름이 아니면) → 기본값 (2026-08-02 `85e467cb6` 부터) | 이름 필드 4개가 **모두 비었을 때만** | `kind`/`call_kind`/`callKind` 만 봄 | `git show 5d97a3a18:ios/App/App/Push/IncomingCallCallerIdentity.swift` |

- 서버 수신 푸시는 `caller_name` 을 meta 에 항상 넣고(`send-community-messenger-incoming-call-push.ts:73`), FCM/VoIP 데이터에 `callerName` 으로도 싣는다(`fcm-data-payload-contract.ts:269-273`). 값은 `profileLabel()` — 닉네임이 없으면 「회원 xxxxxx」 대체값이라 **비어 있지 않다**(`service.ts:1569-1575`).
- 따라서 지금 설치된 모든 구 빌드에서 수신 화면 이름은 `callerName` 데이터로 정해지고, 제목·본문 글자는 이름 판정에 쓰이지 않는다. 종류(영상/음성)는 `callType`/`kind` 데이터로 정해진다.
- iOS `isCallKindLabel` 은 이미 영어 「video call」「voice call」(소문자 비교)을 종류 이름으로 알아본다 → en 제목 「Video call」「Voice call」이 이름으로 잘못 쓰이는 경로 없음.
- Android `isCallKindLabel` 은 한국어만 알지만, 이 함수는 본문이 빈 경우의 대체 경로(`callerName` 빈 경우)에서만 쓰인다 → 위와 같은 이유로 도달하지 않는다.

### 2-2. 경로별 결정

| 경로 | 화면에 서버 제목·본문을 그대로 보이는가 | 결정 |
|---|---|---|
| Android FCM 수신(데이터 메시지 → 네이티브 수신 화면·FSI 알림) | 아니오 — 네이티브 리소스 문구 + `callerName` | 제목·본문 현지화해도 표시 변화 없음. **데이터 키 전부 유지**, ko 받는 사람은 글자도 동일 |
| iOS VoIP(PushKit → CallKit) | 아니오 — `callerName` 만 CallKit 에 | 위와 같음 |
| iOS APNs alert (VoIP 미등록 설치 · VoIP 미발송 대체) | **예** — `alert: {title, body}` (`apns-sender-impl.ts:224`) | 받는 사람 언어로 표시 (결함 수정 대상) |
| 웹 푸시(`public/sw.js:107` `showNotification`) | **예** | 받는 사람 언어로 표시 |
| Android 부재중(`MissedCallNotificationHelper.show(title, body)`) | **예** | 받는 사람 언어로 표시 |
| 종료 신호(취소·거절·종료·다른 기기에서 받음) | Android·iOS VoIP 는 표시 안 함(종류 값만 봄 — `VoIPPushRegistry.swift:111`), 웹 SW 는 `call_answered_elsewhere` 를 표시, iOS VoIP 미등록 alert 표시 | 제목만 받는 사람 언어 `cm_ui_call_label`. 본문·종류 값·발송 정책 그대로 |
| 웹 브라우저 로컬 Notification (탭 숨김) | 예 | 런타임 앱 언어 |

### 2-3. 받는 사람 언어 결정

- 서버 푸시·알림 행: `loadNotificationUserLanguage(sb, userId)` (계정 명시값 → 최근 기기 `app_language` → en) — SSOT §2 의 서버 단일 함수.
- 새 헬퍼 `lib/push/call-push-recipient-language.ts` `loadCallPushRecipientLanguage(userId)` 가 위 함수를 부르고 **5분·500명 인스턴스 메모리 캐시**를 둔다(한 통화의 수신·종료·부재중 푸시가 같은 사람을 몇 초 안에 여러 번 조회 → 운영 Supabase 요청 증가 억제). 조회 실패는 en(SSOT 기본값), throw 없음.
- 통화 신호(수신·취소·거절·종료·다른 기기에서 받음)는 언어 조회를 **기다리지 않는다** — §2-4.
- 부재중: `service.ts` 부재중 생성 경로가 프로필 조회와 동시에 언어 조회(통화 신호가 아닌 알림 행 — 기다림 허용).

### 2-4. 통화 신호 지연 0 (경로별 결정 · 2026-11-27 추가 지시)

규칙: 발송 직전 인스턴스 캐시에 받는 사람 언어가 있으면 그 언어, **없으면 변경 전 문구(ko — 「영상 통화/음성 통화」「{이름}님의 전화」「통화」)로 즉시 발송**하고, 언어 조회는 뒤에서 캐시만 채운다(`warmCallPushRecipientLanguage` — 기다리지 않음, 오류 삼킴, 같은 사람 진행 중 조회 1번). 헬퍼 `resolveCallPushLanguageNoWait`.

| 경로 | 결정 | 이유 |
|---|---|---|
| 수신 통화 (`sendIncomingCallPushBestEffort` → `sendWebPushForCommunityMessengerIncomingCall`) | 차단 확인 **전에** 캐시 데우기 시작 → 프로필 조회 뒤 캐시만 봄(`peek`, await 없음) → 없으면 ko | 처음 안: 언어 조회를 프로필 조회와 병렬로 돌리고 끝을 `await` — 조회가 프로필보다 느리면 그만큼 발송이 늦어지므로(추가 대기 가능) 같은 규칙 적용 |
| 취소·거절·종료 (`sendWebPushForCommunityMessengerCallTerminal`) | 캐시 있으면 그 언어, 없으면 ko 즉시 + 뒤에서 데움 | 벨 중 취소 신호 지연 금지 |
| 다른 기기에서 받음 (`sendWebPushForCommunityMessengerCallAnsweredElsewhere`) | 같음 | 같음 |
| 부재중 알림 행 | 프로필 조회와 병렬 조회 후 await | 통화 신호가 아님(통화 종료 뒤 알림) — 받는 사람 언어로 저장하는 것이 목적 |

결과: 처음 받는 사람(이 인스턴스에서 5분 안 조회 기록 없음)의 첫 수신 푸시는 변경 전과 같은 한국어 글자. 같은 통화의 뒤 신호·다음 통화부터 받는 사람 언어(캐시 5분). 시험: `lib/push/__tests__/call-push-language-no-wait.test.ts`(조회가 끝나지 않아도 발송 즉시 1회·예전 문구·조회 1회).
- `notification-user-language.ts` 의 「통화 푸시는 이 함수를 쓰지 않는다」 주석은 이번 결정으로 고친다.

## 3. 영향받는 경로

| 경로 | 영향 |
|---|---|
| 발신 시작 (v4·v3·레거시 레인) | 실패 시 안내 문구만 바뀜. 발신 요청·세션 생성·재시도·시도 취소 로직 변경 없음. 429 응답 본문의 `error` 값이 문장 → 코드 (상태 코드 429·`code`·`Retry-After` 헤더 그대로) |
| 세션 생성 (`startCommunityMessengerCallSession`) | 변경 없음 |
| VoIP/FCM 발송 (`dispatchPushForUser`·발송 정책·대상) | 변경 없음. 수신 푸시 `title`/`body` 값과, 발송 전 언어 조회 1회(캐시)만 추가 |
| iOS CallKit / Android 수신 화면 | 표시 변화 없음(§2-1) |
| 취소/거절/종료/부재중 | 종료 신호 제목 글자·부재중 알림 행 글자만. 판정·dedupe 키·tag·종류 값 그대로 |
| 상태 폴링 (`calls/sessions/incoming`) | 429 본문 `error` 값만 코드로. V4 는 상태 코드로만 판단(`call-v4-api.ts:143-186`) → 백오프 동작 그대로 |
| CallKit 종료 신호 | 변경 없음 (VoIP 데이터 `call_push_kind`·`kind` 그대로) |
| 통화 기록 | 변경 없음 |
| 팝업(앱 안 통화 안내 `CallInAppNoticeBanner`·수신 배너·부재중 배너) | 문구 언어만 |
| 그룹 통화 상태 문구(대화방 시트·타임라인) | 언어만 |

## 4. 회귀 위험

1. **통화 신호 지연 없음(§2-4)** — 대신 캐시가 없으면(첫 수신·다른 서버 인스턴스) 영어 사용자도 예전 한국어 글자를 받는다(iOS VoIP 미등록 alert·웹 푸시에서만 보임). 영어 표시율은 캐시 적중률에 달림 — 실기 en 행에서 확인(NOT_PROVEN).
2. **운영 Supabase 요청 증가** — 캐시가 빗나갈 때 푸시 1건당 2조회(`user_settings`·`user_devices`). 통화 1건 ≈ 수신 1 + 종료 1~2 + 부재중 0~1 → 최악 +8, 캐시 적중 시 +2. `PATCH /calls/sessions/[sessionId]`(예산 5.0)는 종료 신호가 `keepAliveAfterResponse` 로 같은 요청 수명 안에서 돈다 → 예산 감시값이 오를 수 있음. 운영 하루 감시로 확인(NOT_PROVEN).
3. **이름 판정** — §2-1 로 구 빌드 영향 없음을 코드로 확인. 실기기 확인 전에는 NOT_PROVEN.
4. **앱 안 안내 사건 판정** — `inferCallInAppNoticeEventFromFailureMessage` 가 문구 단어(거절·권한·네트워크·busy·declined·permission·network·camera)로 사건을 고른다. 새 문구(ko·en)에 이 단어를 넣지 않았다.
5. **서버 error 문장 숨김** — v4·v3 는 서버가 보낸 **문장**(429 한국어, DB 오류 원문 등)을 더 이상 화면에 쓰지 않는다. 코드 값은 지금처럼 사건 판정에 쓴다 → 바쁨·거절 등 기존 안내 동일.

## 5. 롤백

- 이 PR 은 웹·서버만 → GitHub 에서 PR revert 1회 → main 병합 = 운영 복구. 장애 즉시 복구는 Vercel Instant Rollback(AGENTS 개발 프로세스 2번).
- DB 변경 없음(알림 행 `display_payload` 에 키 2개 추가 — 열·제약 변경 아님, 옛 행은 그대로).
- 네이티브 변경 없음 → 앱 재설치 불필요.

## 6. 실기기 검증 행렬 (구현 뒤 · Production SHA 매 시험 기록)

시각 기록: 발신 시점 · 세션 생성(`community_messenger_call_sessions.created_at`) · VoIP/FCM 발송(`notification_deliveries`) · 수신 화면 표시 · 연결 · 종료.

| # | 시나리오 | Android → iPhone | iPhone → Android | 언어 확인 |
|---|---|---|---|---|
| 1 | 음성 발신·수신·연결·종료 | | | 수신 화면 이름 = 닉네임(문장 아님) · ko/en 각각 |
| 2 | 영상 발신·수신·연결·종료 | | | 같음 · 영상 표시 정확 |
| 3 | 거절 | | | 발신 측 안내 ko/en |
| 4 | 벨 중 취소 | | | 수신 화면 닫힘 지연(취소 ↔ 닫힘 초) |
| 5 | 취소 후 지연 푸시(재울림 없음) | | | — |
| 6 | 통화 중(busy) | | | 안내 ko/en |
| 7 | 무응답 타임아웃 → 부재중 | | | 부재중 시스템 알림·앱 안 배너·알림센터 ko/en |
| 8 | 정상 종료 후 즉시 재발신 | | | — |
| 9 | 웹 브라우저 수신(탭 숨김) OS 알림 | 웹 | — | ko/en |
| 10 | iOS VoIP 미등록 설치 alert 수신(가능한 기기에서만) | | | ko/en |
| 11 | 구 빌드(Android 39 이상 최저 설치·iOS 21~27 중 1대) 수신 이름 | | | en 계정 |

언어 조건: 각 행을 받는 사람 앱 언어 ko·en 두 번(최소 1·2·7 행은 둘 다).
실행 상한: AGENTS 「실기기 반복 실행 시험 상한」 10회 — 넘으면 먼저 승인.

## 7. 사후 검토 변경 (2026-11-27 · PR-C · 설계 `docs/audit/i18n-postmerge-fix-design-2026-11-27.md` §3)

Owner 승인: 2026-11-27 「구현 진행」(§3 계획서), C1 결정 「보는 사람 언어로 바꿈 — 한국어 화면 「26분 55초」」.

### 7-1. C1 — 2026-11-13 설계 D2 변경 기록 (허위 보고 금지 §7)

- **바뀐 결정:** `docs/audit/call-record-en-korean-residual-design-2026-11-13.md` §2 D2 「`formatCallStubRoomTipForViewer` 가 토큰이 아닐 때 **ko 면 원문 그대로** · 한국어 화면 글자 0 변화」를 **일부 폐기**한다.
- **새 규칙:** 옛 통화 문장의 결과 자리가 **영어**인 형태(`cancelled`·`3m 51s`·`12s` — 11-08 이전 서버가 붙인 영어 글자)만 한국어 화면에서도 다시 그린다(「영상 통화 · 26m 55s」 → 「영상 통화 · 26분 55초」, 「영상 통화 · cancelled」 → 「영상 통화 · 취소」). 결과 자리가 한국어인 옛 문장은 지금처럼 원문 그대로. 표에 없는 문장·부분 일치는 원문(D2 의 전체 일치 규칙 유지).
- **근거:** 실기 FAIL — 운영 `b1a70f8`, Samsung, 16:44 PHT, 한국어 화면 메신저 목록 「영상 통화 · 26m 55s」.
- **범위:** 표시만(`lib/community-messenger/call-stub-room-tip.ts` `parseLegacyCallStubLabel`·`formatLegacyCallStubLabelForLang`·`formatCallStubRoomTipForViewer` 의 보는 사람 모름 분기). DB·토큰 형식·viewer 판정 무변경. 메신저 목록 `cm-home-list-copy.ts` call_stub 갈래는 같은 함수를 부르므로 코드 변경 없음.

### 7-2. C2 — §2-3·§2-4 의 인스턴스 메모리 캐시 폐기

- **문제(M4):** 캐시는 인스턴스별 5분이라, 캐시가 빈 인스턴스에서는 영어 사용자도 첫 수신 푸시를 한국어로 받았다.
- **바뀐 방식:** `lib/push/call-push-recipient-language.ts` 삭제. 발송 대상 조회(`load-active-push-targets.ts` `USER_DEVICE_TARGET_SELECT_COLUMNS` — 단건 `loadActivePushTargets`·묶음 `chat-push-facts-batch.ts` `loadTargetsBatch` 공용)에 `app_language` 열 하나를 더하고, 발송부(`dispatch-push-for-user.ts`)가 **기기마다** 그 기기 언어의 제목·본문을 고른다(`lib/push/dispatch/localized-push-alert.ts`).
  - 통화 푸시 3종(수신·취소/거절/종료·다른 기기 받음)은 ko·en 두 벌을 `DispatchPushOptions.localized_alert` 로 넘긴다. 기본 글자(`out.title`/`out.body`)는 **변경 전 한국어 글자**(`CALL_PUSH_DEFAULT_ALERT_LANGUAGE = "ko"` — 「영상 통화/음성 통화」「{이름}님의 전화」「통화」).
  - 기기 언어 순서: 그 기기 `app_language` → 같은 사람의 가장 최근 기기 `app_language`(이미 읽은 행 안, 토큰 없는 행 포함 · web_push_subscriptions 대상도 이것) → 모름이면 기본 글자(예전 한국어). en·ko 를 고르는 것은 그 기기나 같은 사람의 다른 행에 `app_language` 가 있을 때뿐이다. 발송 경로는 `user_settings` 를 읽지 않으므로(통화는 설정 게이트도 건너뜀) 계정 값 단계는 없다. 기기 `app_language` 는 웹이 계정 언어 선택을 반영해 기록하는 실효 언어다.
  - 추가 DB 조회 0, 신호 경로 await 추가 0(수신 경로의 캐시 데우기 조회도 없어져 수신 통화 1건당 언어 조회 2건이 줄어든다).
  - 부재중 알림 행(알림함 저장 글자)만 `loadNotificationUserLanguage` 를 직접 부른다(캐시 없음 · 프로필 조회와 병렬 · 통화 신호 아님). 부재중일 때만 1회.
- **바뀐 것은 alert 글자(제목·본문)뿐**이다. 데이터 필드 이름·값(`caller_name`·`kind`·`call_kind`·`media_type`·`session_id` 등) 불변 → §2-1 의 구 바이너리(Android 39·54, iOS 21) 호환 근거 그대로. FCM data 의 `title`·`body` 값은 이전에도 언어별로 달랐다(캐시 적중 시).
- **회귀 위험:** 활성 기기 중 어느 것도 `app_language` 가 없는 사람(운영에 있음 — Android 1.2.7(80)·옛 iOS 빌드)은 변경 전과 같은 한국어 글자를 받는다(영어 사용자라도 기기 언어 기록이 없으면 한국어 — 변경 전과 같음). 기기 언어가 ko 인 사람의 글자는 이전 ko 글자와 같다.
- **시험:** `lib/push/__tests__/call-push-copy-language.test.ts`(두 벌·기본 = 예전 한국어·데이터 키 불변·DB 클라이언트 생성 0), `lib/push/dispatch/__tests__/localized-push-alert-dispatch.test.ts`(기기별 글자·기기 언어 전혀 없으면 한국어 그대로·대상 조회 수 불변). `call-push-language-no-wait.test.ts` 는 캐시와 함께 삭제.

### 7-3. C3 — 일반 알림 푸시도 기기 언어

- `lib/notifications/pipeline/notify-push-dispatcher.ts` `buildNotificationLocalizedPushAlert`: 알림 행 `display_payload.legacyMeta` 에 `titleKey`·`messageKey` 가 있으면 `renderNotificationCopyFromMeta` 로 ko·en 을 만들어 같은 방식으로 기기마다 고른다. 키가 없는 자리는 저장 `row.title`/`row.body`, 둘 다 없으면 지금과 같은 발송. 부재중 통화 분기는 넘기지 않는다(변경 없음).

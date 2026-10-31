# E — Android 네이티브 알림 목적지·앱 실행 중 중복 알림 수정 계획 (2026-11-01 PHT · **Owner 승인 전, 구현 안 함**)

기준: `docs/audit/notification-tap-list-sound-reaudit-2026-11-01.md` N1·N6·S4(D). 웹 수정 A·B 는 별도 커밋으로 main 반영(이 문서와 무관하게 동작).

## 1. 왜 네이티브가 필요한가 (A 이후 남는 것)

| 항목 | 서버 수정 A·B 후 build ≤24 동작 | 남는 결함 |
|---|---|---|
| 공지·마케팅 캠페인(목적지 없음) | 서버가 `targetApprovedRoute=/notifications/{id}` → build 24 도 상세 | 없음 |
| **시스템 캠페인** (`eventClass=admin_system`) | `FcmPayloadResolver.resolveEnvelopeRoute` 에 분기 없음 → **항상 `/notifications` 목록** (지정 목적지도 무시) | **N1 잔여** |
| 신고 결과 등 관리자 알림 | 서버 url=`/notifications/{id}` → build 24 도 상세 | 없음 |
| 앱 실행 중 관리자 캠페인 | 봉투가 있으면 앱이 보여도 시스템 알림+채널 소리(`DibayFirebaseMessagingService.java:114-117`) + 웹 Realtime 배너+소리 → **2번 울림** | **S4(D)** |
| 댓글 예비 경로 | url 없을 때만 `/philife/posts/{id}`(없는 라우트) — 현재 서버는 항상 url 을 보내 미사용 | N6 (잠재) |

`admin_system`→`admin_notice` 서버 변환은 하지 않는다: `push-routing-transport.ts:169` 가 `admin_notice` 만 회원 A 읽음 파이프라인으로 분류하므로 운송 분류가 바뀐다(Owner 지시 3-A).

## 2. 바꿀 파일·함수 (통화 경로 무변경)

| 파일 | 함수 | 변경 |
|---|---|---|
| `android/.../FcmPayloadResolver.java` | `resolveEnvelopeRoute` | ① `admin_system` 을 `admin_notice` 와 같은 분기로 처리(웹 `push-envelope-v1.ts:236` 과 동일). ② 지정 경로가 없으면 목록(`/notifications?tab=system&…`) 대신 `targetNotificationId` 가 있을 때만 상세 `/notifications/{id}`, 없으면 `/notifications`. 탭 값 `system` 고정 오류 제거. ③ `admin_marketing` 같은 규칙 |
| 같은 파일 | `resolveRouteUrl` `community_comment` 예비 | `/philife/posts/{id}` → `/community/posts/{id}` (N6) |
| `android/.../DibayFirebaseMessagingService.java` | `onMessageReceived` 일반 알림 분기(:113-117) | 앱이 보이는 중이고 봉투에 `targetNotificationId`(=앱 안 알림 행 있음)가 있으면 시스템 알림을 그리지 않는다(웹 배너·소리 1회). `push_only`(행 없음)는 지금처럼 시스템 알림 유지 |

손대지 않는 것: `handleIncomingCall`·`handleMissedCallNotificationOnly`·통화 종료 신호 분기, `incoming_call`/`missed_call` 경로 해석, 채널 레지스트리·알림음 채널, `MainActivity` 탭 처리(`resolveAppPathFromPushExtras` 는 이미 `FcmPayloadResolver` 를 씀).

## 3. 영향받는 경로

- **수신**: 백그라운드·종료 = 지금과 같음(시스템 알림·채널 소리). 앱 실행 중 = 캠페인만 시스템 알림 생략(행 있을 때).
- **탭**: 앱 종료(cold start, `onCreate` → `handleNotificationLaunchIntent`) · 백그라운드(`onNewIntent`) 모두 `resolveAppPathFromPushExtras` → `FcmPayloadResolver` 한 곳만 바뀜 → WebView `queueNavigateWebViewToAppPath` → 웹 `PushRouteListener` 무변경.
- **딥링크 가드**: 결과 경로 `/notifications/{id}`·`/community/posts/{id}` 는 `DibayAppRouteGuard.ALLOWED_ROOT_SEGMENTS`(notifications·community) 안.
- **통화와의 충돌**: 같은 서비스 파일이지만 통화 분기(`isCallTerminalType`·`incoming_call`)는 일반 알림 분기보다 먼저 return 한다. 통화 진행 중 앱이 보이는 상태에서 캠페인이 오면 지금은 시스템 알림이 통화 화면 위에 뜨고, 변경 후에는 웹 배너만 뜬다(통화 화면에서는 웹 배너 표시 여부를 실기로 확인 — 아래 V-E6).
- **iOS 차이**: iOS 는 탭 시 웹 해석기(`push-envelope-v1.ts`)를 쓰므로 이미 상세로 감. 앱 실행 중 Capacitor `presentationOptions` 미설정 → 시스템 배너 없음 → 중복 없음. 변경 후 Android 가 iOS 와 같아진다.

## 4. 구버전 APK 호환

- 서버 A 는 approvedRoute 를 명시하므로 build ≤24·25 모두 공지·마케팅은 상세. build 25 는 시스템 캠페인도 상세.
- 서버가 다시 바뀌어 approvedRoute 를 안 보내도 build 25 는 `targetNotificationId` 로 상세를 만든다(양방향 호환).
- 설치 버전 확인: `public.user_devices.app_version` (Owner q테스트1 = `1.2.5 (24)`, 2026-11-01 06:23 PHT).

## 5. 회귀 테스트

- JVM: `android/app/src/test/.../FcmPayloadResolverTest.java` — admin_notice/admin_system/admin_marketing × (approvedRoute 있음/없음, targetNotificationId 있음/없음), community_comment 예비, 기존 call·missed_call·chat 케이스 그대로 통과.
- JVM: `DibayFirebaseMessagingServiceTerminalTest` 기존 통과 확인(통화 종료 분기 무변경 증명).
- 웹: 기존 `lib/push/__tests__/resolve-push-route-from-fcm-data.test.ts` 와 같은 표를 Android 표와 1:1 대조하는 계약 테스트 추가.

## 6. 실기 검증 (Owner 승인 시나리오 · build 25 설치 후)

| # | 상태 | 시험 | PASS |
|---|---|---|---|
| V-E1 | 종료 | 시스템 캠페인(목적지 없음) 푸시 탭 | 알림 상세 |
| V-E2 | 백그라운드 | 시스템 캠페인(게시판 글 지정) 탭 | 그 글 |
| V-E3 | 실행 중 | 공지 캠페인 수신 | 소리 1번, 앱 안 배너 1개, 시스템 알림 없음 |
| V-E4 | 실행 중 | push_only 공지 | 시스템 알림 1개(지금과 같음) |
| V-E5 | 종료·백그라운드 | 댓글·메신저·주문 탭 | 각 화면(회귀 없음) |
| V-E6 | 통화 중 | 캠페인 수신 | 통화 유지·벨/통화 화면 영향 없음 |
| V-E7 | — | 통화 최소 행렬(Android↔iPhone 음성 발신·수신·거절·종료) | 통화 규정 5번 — 같은 파일 수정이므로 회귀 확인 |

## 7. 반영·롤백

- 통화 규정 4번 취지에 따라 **이 네이티브 변경만 단독 커밋**, 다른 기능과 묶지 않음. versionCode 24→25 는 설치 빌드 때 1회(`npm run native:prepare`).
- 롤백: 해당 커밋 revert 후 재빌드. 서버 A 는 구·신 바이너리 모두와 호환되므로 서버 롤백 불필요.
- [배포 구분] 네이티브 → 재빌드·재설치 필요.

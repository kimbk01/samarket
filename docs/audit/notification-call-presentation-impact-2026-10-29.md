# E 통화 알림 표시 — 영향 분석·계획 (통화 규정 · 2026-10-29 · 커밋 안 함 · Owner 승인 대기)

기준
- 통화 변경 규정: AGENTS.md 「통화 변경 규정」
- 시안: https://claude.ai/artifact/HCss3NKdc4bc3LR26qA3yE ①③④ 부재중 카드
- 알림 표시 SSOT: `lib/notifications/display/notification-presentation.ts`. A~D 에서 만들었고, 통화 타입은 지금 제외돼 있다(`isCallPresentationExcluded`).

## 0. 결함 증거 (「왜」)
- 기능 결함이 아니라 **표시 통일**이다. 통화 동작(울림·수락·거절·종료·부재중 생성)은 바꾸지 않는다.
- 현재 부재중 알림의 표시는 아래와 같다(실기 캡처 `claude-r3/k15-shade.png` 계열, 코드 근거).
  - Android
    - `MissedCallNotificationHelper` 는 `R.mipmap.ic_launcher` 를 쓴다. 샤오미에서는 빈 사각형으로 보인다.
    - 사진이 없고, 강조색도 없다.
  - 문구가 두 곳에서 다르다.
    - 서버 FCM: 「부재중 전화 / 이름 · 부재중 음성 통화」 (`call-missed-notification-authority.ts:154-155`)
    - 단말 타임아웃: 「부재중 통화 / 이름님의 부재중 통화」 (`IncomingCallActionCoordinator.java:288-295`)
  - iOS: 사진·묶음 없이 DIBAY 아이콘만 나온다.

## 1. 바꾸는 것 (파일·함수)

| # | 파일 · 함수 | 바뀌는 동작 |
|---|---|---|
| E1 | `MissedCallNotificationHelper.java` · 알림 빌더 | small icon `R.drawable.ic_stat_dibay`, 색은 브랜드 그린(A 와 같은 `DibayNotificationPresentation.applyBrand`) 또는 빨강. 보낸 사람 사진은 원형 large icon(https, 3초 제한, 실패하면 없음). 본문은 빨간 글씨(`ForegroundColorSpan`). `setWhen` = 부재중 시각 |
| E2 | `call-missed-notification-authority.ts` · 부재중 이벤트 문구 | 제목 = 상대 이름, 본문 = 「부재중 음성 통화 / 부재중 영상 통화」(시안). `display_payload.senderAvatarUrl` = 상대 프로필 사진 |
| E3 | `IncomingCallActionCoordinator.java` · 단말 타임아웃 부재중 문구 | E2 와 같은 문구로 맞춘다(문구 SSOT 하나) |
| E4 | `fcm-data-payload-contract.ts` · missed_call | 표시 SSOT 필드(presKind=missed_call · presImageUrl · presThreadKey=missed_call · presBodyTone=alert)를 싣는다. `isCallPresentationExcluded` 에서 missed_call 만 해제. **incoming_call·취소 payload 는 그대로** |
| E5 | `apns-sender-impl.ts` · alert | 부재중 alert 에 thread-id 「missed_call」, 사진이 있으면 mutable-content(NSE 가 사진을 붙인다). **VoIP payload 무변경** |
| E6 | `IncomingCallNotificationBuilder.java` 수신 통화 · `CallForegroundService` 등 진행 중 통화 알림 6곳 | small icon 만 `ic_stat_dibay` 로 바꾼다. **CallStyle·버튼·full-screen intent·채널·벨소리 무변경** |

## 2. 영향받는 경로
- 발신 시작 · 세션 생성: 무변경(서버 통화 세션 API 를 건드리지 않음).
- VoIP/FCM 발송
  - 수신 통화 FCM·VoIP payload 는 무변경.
  - 부재중 FCM data 에 필드만 추가(E4). 부재중 APNs alert 에 thread-id 와 mutable-content 를 추가(E5).
- iOS CallKit · PushKit: 무변경(VoIP payload·CallKit 코드를 건드리지 않음).
- Android 수신 화면: 아이콘만 바뀐다(E6). 화면·버튼·벨·full-screen 은 그대로다.
- 취소 · 거절 · 종료: 무변경.
- 부재중
  - 표시만 바뀐다(E1~E5).
  - 부재중 생성 조건, dedupe 키(`resolveMissedCallNotificationDedupeKey`), 알림 id(`missed:<callId>`)는 그대로다.
- 상태 폴링 · CallKit 종료 신호 · 통화 기록 · 팝업: 무변경.
- 앱 안 부재중 배너: D 에서 이미 같은 모양으로 그린다(웹).

## 3. 설치된 구 바이너리 호환 (`user_devices.app_version`, 최근 30일 활성 · 2026-10-29 조회)

| 플랫폼 | 버전 | 대수 |
|---|---|---|
| Android | 1.2.1 (4) | 15 |
| Android | 1.0.1 | 3 |
| Android | 1.0 (1) | 3 |
| Android | 1.2.4 (15) | 2 |
| Android | 기타 1.2 · 1.2.4 (11) · 1.2.3 (6) | 각 1 |
| iOS | 1.2 (15) | 2 |

- 서버 변경(E2·E4·E5)은 구 바이너리에도 바로 간다.
  - 구 Android: 새 필드를 무시한다. 문구만 「이름 / 부재중 음성 통화」로 바뀐다.
  - 구 iOS: thread-id 로 묶인다. 사진은 NSE 가 새 빌드부터 붙인다.
  - 수신 통화 payload 가 무변경이라 울림·수락 회귀 위험은 없다.
- 네이티브 변경(E1·E3·E6)은 새 빌드(Android 17 · iOS 다음 빌드)부터 적용된다.

## 4. 회귀 위험과 차단
- 위험 1: 부재중 large icon 다운로드가 메인 스레드를 막는 것.
  - 차단: FCM 스레드에서만 3초 제한으로 받고, 실패하면 사진 없이 표시한다.
  - 단말 타임아웃 경로(E3)는 사진 다운로드를 하지 않는다.
- 위험 2: thread-id·mutable-content 로 iOS 부재중 표시가 늦어지는 것.
  - 차단: NSE 는 5초 제한이고, 실패하면 원본을 표시한다.
- 위험 3: 통화 알림 아이콘 교체(E6)로 리소스를 못 찾아 크래시가 나는 것.
  - 차단: A 에서 같은 리소스로 일반 알림을 먼저 실기 PASS 한 뒤에 진행한다.
- 「한 번에 한 원인」: E 는 A~D 반영·실기 PASS 뒤에 **단독 커밋**으로, 통화만 main 에 반영한다.

## 5. 롤백
- 서버(E2·E4·E5): 커밋을 되돌리면 웹 배포로 즉시 원복된다.
- 네이티브(E1·E3·E6): 커밋을 되돌리고 재빌드한다. 이미 설치된 새 빌드는 아이콘·문구만 다르고, 동작은 같다.

## 6. 실기기 검증 (코드 PASS + 실기 PASS · 매 테스트 Production SHA 기록)
- 최소 행렬(규정)
  - Android↔iPhone 음성·영상 발신·수신
  - 거절
  - 벨 중 취소
  - 취소 후 지연 푸시(다시 울리지 않음)
  - 통화 중(busy)
  - 무응답 타임아웃 → **부재중 알림 표시 확인**(사진·빨간 글씨·아이콘·문구)
  - 정상 종료 후 즉시 재발신
- 각 행마다 기록: 발신 · 세션 생성 · VoIP/FCM 발송(`notification_deliveries`) · 수신 화면 · 연결 · 종료 시각(PHT·UTC)
- 실기 FAIL 이면 즉시 중단하고 통화 정상화를 최우선으로 한다.

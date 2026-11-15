# 맥(Designed for iPad)·iPad 통화 결함 / 하단 회색 막대 — 감사·설계안 (2026-11-15)

> 상태: **감사·설계안 — 구현 금지 (Owner 승인 대기)**. 통화 변경 규정 3번(영향 분석·계획 문서 → Owner 승인 후 구현)에 따른 문서.
> Owner 지시 원문(2026-11-15): 「임시 땜빵으로 하지 말고 통화 부분은 매우 민감한 부분이다. 정확히 아이폰, 아이패드, 맥에서 정상 구현 되야 하는 민감한 부분이다」

## 0. 확인 조건

| 항목 | 값 |
|---|---|
| 기기 | Apple Silicon Mac, iOS 앱을 맥에서 실행(Designed for iPad), 창 1024×800 |
| 앱 | `com.dibay.ph` 1.2.2 (35), Release, git `8bace2b8d`(dirty), 2026-11-15 10:50 PHT Xcode 실행 |
| 웹 | 운영 `samarket.vercel.app` |
| 계정 | 김봉기 로그인 — 운영 `user_devices` 활성 기기 1대 = 이 맥 (`418f295f…`, `voip_apns`, 1.2.2 (35)) |
| 상대 | Ho youn Kim |

## 1. 통화 — 확인된 사실 (증거)

### 1-1. 맥 수신 = FAIL (OS 가 VoIP 푸시를 버림)

운영 DB `community_messenger_call_sessions` · `notification_deliveries` (PHT):

| callId | 종류 | 결과 | 서버 VoIP 발송 |
|---|---|---|---|
| 6a16…edcd | 음성 Ho youn→맥 | 10:53:40 생성 · 10:53:42 caller 취소 | 10:53:40.454 `call_ringing` sent (APNs 200) |
| 7d1d…ff7a | 영상 Ho youn→맥 | 10:53:47 생성 · 10:54:22 missed | 10:53:47.362 sent (200) |
| 6037…3dbb | 영상 Ho youn→맥 | 10:54:24 생성 · 10:54:47 caller 취소 | 10:54:24.295 sent (200) |

맥 시스템 로그(`callservicesd`), 푸시 도착 때마다:

```
BKSProcessAssertion "CSDVoIPProcessAssertion-com.dibay.ph" initization attempted with bundleIdentifier, which not supported on macOS
Dropping incoming message because the process assertion could not be acquired
```

→ 앱은 PushKit 콜백을 **받지 못함**(앱 로그에 CallKit 수신 보고 0건). 앱이 화면에 떠 있었는데도 수신 화면 없음(iOS 수신은 VoIP→CallKit 단일 경로라 대체 경로 없음).

### 1-2. 맥 발신 = FAIL (CallKit 오디오 활성화 신호가 오지 않음)

| callId | 종류 | DB | 맥 앱 로그 |
|---|---|---|---|
| 4d44…7651 | 영상 맥→Ho youn | 10:53:07 생성 · 10:53:12 상대 수락 · 10:53:14 connected · 10:53:16 **ended_by_caller** | 10:53:07 CallKit 발신 트랜잭션 성공 → 10:53:15.645 `ios_audio_session_gate_timeout` |
| 9432…4a40 | 영상 맥→Ho youn | 10:53:43 생성 · 10:53:46 상대 거절 | 10:53:51.959 `ios_audio_session_gate_timeout`(이미 종료 후) |

코드: 발신은 `DibayCallAudioSessionController.registerPendingOutgoingJoin` 이 CallKit `provider(_:didActivate:)` 를 기다린 뒤 Agora 참가. 8초(`outgoingActivationTimeoutSeconds`) 안에 안 오면 `fail(.internalInvariant)`. 맥에서는 `didActivate` 가 오지 않음 → **상대가 받아도 맥이 Agora 에 들어가지 않고 스스로 종료**(화면 「영상 통화 · 2초」). 카메라·마이크는 한 번도 열리지 않음(WebKit·AV 로그 AudioCapture/Video 0).

### 1-3. 맥 구분 없음

- `DibayDeviceClassClassifier` 는 맥에서 `userInterfaceIdiom == .pad` → `TABLET_IPAD` 로 판정. 저장소에 `ProcessInfo.isiOSAppOnMac` 분기 0건.
- 서버 `user_devices.platform = ios`, `push_provider = voip_apns` — 맥인지 알 수 없어 VoIP 만 보냄.

### 1-4. iPad 실기 = NOT_PROVEN

실제 iPad 로 수신·발신을 시험한 기록 없음. iPadOS 는 PushKit·CallKit 이 동작하는 플랫폼이지만 **증거 없이 PASS 로 쓰지 않는다**. iPhone 행렬은 기존 문서 기준(이번에 다시 하지 않음).

## 2. 통화 — 원인별 설계안 (승인 대기)

원칙: 맥만 우회하는 `if` 땜빵 금지. **「기기가 무엇을 지원하는가」를 하나의 권한(능력)으로 정하고**, 서버 발송·네이티브 수신·발신이 그 값 하나만 따른다.

### D1 정정 (2026-11-15 Owner 「승인, D1 부터」 후 구현 착수 시)
- 서버 발송 정책(`resolveCallPushProviderPolicy`, A4)은 이미 「VoIP 행이 없는 iOS 설치」에 통화 수신·취소를 **일반 APNs 알림**으로 보낸다. 따라서 맥 능력을 서버에 알리는 방법은 **새 DB 열이 아니라 「맥은 VoIP 토큰을 등록하지 않고 일반 apns 만 등록」** 하는 것으로 충분하다 → 운영 DB 변경 없음. 이 등록 변경은 수신 동작을 바꾸므로 D2 에서 한다.
- D1 실제 범위 = 네이티브 능력 단일 정의 `DibayCallPlatformCapability`(맥 판정 · `supportsVoipPush` · `supportsCallKitAudioActivation`) + 앱 시작 시 기록 1줄. **동작 무변경**. 기기 분류(`TABLET_IPAD`)·FD1 계약은 바꾸지 않는다(웹 레이아웃 영향 방지).
- 운영 조회(11:10 PHT): 맥 기기는 `voip_apns` 행만 있고 일반 `apns` 행이 한 번도 생기지 않음 → 맥은 현재 채팅 알림도 받지 못함(`voip_reserved_for_call_push` skipped). D2 에서 원인(알림 권한 여부 등) 확인 필요.
- 네이티브만 바뀌므로 단독 main 반영 금지 규정에 따라 D1 은 작업 브랜치에 두고 D3 와 같은 PR 로 올린다.

### D1. 기기 능력 단일 정의 (최초안 — 위 정정으로 대체)
- 네이티브: `DibayDeviceClassClassifier` 에 `ProcessInfo.processInfo.isiOSAppOnMac` 판정 추가 → `MAC_IOS_APP`. 결과에 `callKitIncoming: Bool`, `voipPush: Bool` 능력 포함(iPhone·iPad=true, Mac=false).
- 기기 등록(`register-native-push-client.ts` → 서버)에 능력 전달, `user_devices` 에 저장(새 열 — **운영 DB 적용은 Owner 별도 승인**).
- 영향: 기기 등록 API·`filter-user-device-push-targets.ts`·관리자 기기 표시. 구 바이너리는 능력 값이 없음 → **없으면 현재와 같이 VoIP**(iPhone·iPad 동작 무변경).

### D2. 맥 수신 경로 (VoIP 대신)
- 서버: 능력 `voipPush=false` 기기에는 VoIP 대신 **일반 APNs 알림(소리 포함, 통화 카테고리)** 발송. 취소·종료도 같은 기기에 알림 제거 푸시.
- 앱 실행 중: 서버 통화 신호(Realtime/세션 조회)로 **앱 안 수신 화면**을 띄움 — 어떤 화면을 쓸지(네이티브 수신 화면 vs 웹 `CallV4IncomingSheet`)는 기존 계약(`community-messenger-native-call-receive.md`, `dibay-call-authority-lock.md`)과 충돌 여부를 먼저 확인해야 함 → **Owner 결정 필요**.
- 앱 미실행: 알림 탭 → 앱 실행 → 세션 조회 후 수신 화면(벨 울림 중일 때만).

### D3. 맥 발신·수락 오디오 (CallKit 대기 제거)
- 능력 `callKitIncoming=false` 이면 CallKit 트랜잭션을 쓰지 않고, 앱이 `AVAudioSession`(PlayAndRecord) 을 직접 활성화한 뒤 바로 Agora 참가. 대기·8초 타임아웃 경로를 타지 않음.
- 바뀌는 파일: `DibayCallAudioSessionController.swift`, `NativeVoiceOutgoingCallCoordinator.swift`, `Video/NativeVideoOutgoingCallCoordinator.swift`, 수락 코디네이터 2개, `CallKitProvider.swift`(맥에서 미사용).
- iPhone·iPad 는 기존 CallKit 경로 그대로(분기 값이 true).

### 영향받는 경로 (전수 점검 대상)
발신 시작 · 세션 생성 · VoIP/일반 APNs 발송 · iOS CallKit 수신 화면 · 맥 앱 안 수신 화면 · 취소/거절/종료/부재중 · 상태 폴링 · CallKit 종료 신호 · 통화 기록 · 팝업 · PiP(맥에서 PiP 지원 여부 별도 확인) · 카메라/마이크 권한(맥 TCC).

### 구 바이너리 호환
- 현재 설치: 맥 1.2.2 (35) 1대(운영 조회). iPhone·Android 는 능력 값을 보내지 않으므로 서버가 기존 동작 유지.
- 맥 구 바이너리는 능력 값을 안 보냄 → 서버는 여전히 VoIP → 새 빌드 설치 전까지 맥 수신 FAIL 유지(설치 버전으로 판정).

### 회귀 위험
- 서버 발송 분기 잘못 시 iPhone 수신 실패(가장 큼) → 기본값 = 기존 VoIP, 단위 테스트로 iPhone·iPad·Android·Mac 4조합 고정.
- 맥에서 CallKit 미사용 시 통화 기록·시스템 통화 표시 없음(맥 OS 한계로 수용 여부 Owner 확인).

### 롤백
- 서버: PR 되돌림(능력 무시 → 전부 VoIP). DB 열은 남아도 무해.
- 네이티브: 다음 빌드에서 분기 제거. 웹: Instant Rollback.

### 반영 순서 (통화 단독 커밋·단독 PR)
1) D1 네이티브+서버(능력 저장, 동작 무변경) → 2) D3 맥 발신·수락 오디오 → 3) D2 맥 수신. 단계마다 실기 PASS 전 다음 단계 금지.

### 실기 검증 행렬 (단계마다, Production SHA·설치 버전 기록)
기기: iPhone · iPad(실기기 필요) · Mac · Android. 각 쌍 음성·영상: 발신·수신 · 거절 · 벨 중 취소 · 취소 후 지연 푸시(재울림 없음) · busy · 무응답 타임아웃 · 정상 종료 후 즉시 재발신. 각 시험마다 발신 시각·세션 생성·발송·수신 화면·연결·종료 시각(운영 DB 대조).

## 3. 하단 회색 막대 — 확인된 사실

| 화면 | 현상 | 판정 |
|---|---|---|
| 메신저 대화방, 입력창 클릭 | 창 맨 아래 회색 둥근 막대(약 33pt) + 화면 전체가 위로 같은 만큼 밀려 머리글 잘림. 오른쪽 세로 스크롤 막대 보임. 포커스 해제 시 복귀 | **FAIL** (Claude 재현 11:05 PHT + Owner 캡처) |
| LOUNGE 글 상세(맛집) | 입력 없이도 하단 탭바 위에 회색 막대가 덮음. 오른쪽 세로 스크롤 막대 보임 | **FAIL** (Owner 캡처, Claude 재현 안 함) |

- 회색 막대는 별도 창이 아님(창 목록 = DIBAY 창 1개).
- 맥 스크롤 막대 설정 = 기본(자동). 마우스 연결 시 맥은 스크롤 막대를 항상 표시.

### 원인 — NOT_PROVEN (가설)
모양(둥근 막대 · 창 전체 폭)과 오른쪽 세로 막대가 함께 보이는 점으로 보아 **WKWebView 스크롤 영역의 맥 가로 스크롤 막대**(콘텐츠 폭 또는 높이가 화면보다 조금 큼)일 가능성이 높다. 입력창 포커스 때는 WebKit 이 문서를 위로 스크롤(약 33pt)한 것으로 보인다.
확정하지 못한 이유: 설치 앱이 Release 빌드라 웹 속성 보기(Web Inspector)·디버거 연결 불가(`Not allowed to attach`).

### 원인 확정 단계 (수정 전 필수)
1. 맥에서 웹 속성 보기 가능한 개발 빌드로 같은 두 화면에서 계측: `document.documentElement.scrollWidth/clientWidth`, `scrollHeight/innerHeight`, `visualViewport`, 포커스 전후 `scrollY`, 네이티브 `webView.scrollView.contentSize/bounds/contentOffset`.
2. 계측으로 넘치는 요소(가로) · 포커스 시 스크롤 주체를 특정한 뒤 원인별 설계안을 다시 올린다(웹 레이아웃이면 웹, 스크롤 영역 설정이면 네이티브).
3. 이 항목은 통화가 아니므로 통화 PR 과 섞지 않는다.

## 4. 작업자 잘못 (먼저 보고)
- 2026-11-15 11:00:20 PHT 화면 읽기(접근성 정보 조회)가 앱의 웹 화면 프로세스 크래시(11:00:26 `Array index out of range`)를 일으켜 페이지가 다시 열림. 이후 맥에서는 접근성 조회를 쓰지 않음.
- 11:06 경 + 첨부 시트를 연 뒤 맥 시스템 알림 창(권한 요청으로 보임)이 떴고 누르지 않고 둠.

## 5. 남은 NOT_PROVEN
iPad 실기 전부 · 맥 음성 발신 · 회색 막대 원인 · + 첨부 시트 하단 잘림 · WEBP 디코딩 오류 162건의 화면 영향 · 홈·LOUNGE·DIPICK·telRING·MY 전체 점검.

## 6. D3 구현 기록 (2026-11-15, Owner 「D3 진행」)

- 바뀐 곳 1곳: `DibayCallAudioSessionController.registerPendingOutgoingJoin` — `supportsCallKitAudioActivation == false`(맥)일 때 `setActive(true)` 후 즉시 flush(=`didActivate` 도착과 같은 처리). 음성·영상 발신 둘 다 이 함수 하나를 지나므로 코디네이터는 바꾸지 않음.
- iPhone·iPad: 분기 값 true → 기존 CallKit gate·8초 타임아웃 그대로(코드 경로 무변경).
- 맥에서 유지되는 것: CallKit 발신 보고(`reportOutgoingCallStarted`)·종료 트랜잭션(맥에서 트랜잭션 자체는 성공 실측), 링백, 권한 확인, 원격 종료 감시.
- **수락(수신 후 받기)은 D3 에서 제외 → D2 로 이동**: 맥은 수신 자체가 안 와서(1-1) 수락 경로를 시험할 수 없다. 시험 불가능한 코드를 먼저 넣지 않는다. 수신 계약 코드(`NativeVoiceIncomingCallCoordinator` 등)는 gate 를 쓰지 않음(확인).
- 영향 경로: 맥 발신 시작 → Agora 참가 → 연결·종료·통화 기록. Agora iOS SDK·카메라가 맥에서 동작하는지는 **실기로만 판정**(NOT_PROVEN).
- 맥 실기 행렬(D3): 맥→Android/iPhone 음성·영상 발신 · 상대 수락 후 양방향 음성/영상 · 맥 종료 · 상대 종료 · 상대 거절 · 벨 중 맥 취소 · 무응답 타임아웃 · 종료 후 즉시 재발신. 로그 기준: `ios_audio_session_gate_flush_immediate reason=platform_no_callkit_activation` 존재, `ios_audio_session_gate_timeout` 0건.
- iPhone 회귀 행렬: iPhone 발신 음성·영상 각 1회 이상, 로그에 `platform_no_callkit_activation` 0건·기존 `ios_audio_session_callkit_activated` 경로.

## 7. 설계 대비 구현 대조 (2026-11-15, Owner 「정확히 확인」 지시)

### 7-1. 분석 문장 검증

| 분석 문장 | 근거 | 판정 |
|---|---|---|
| 맥은 VoIP 푸시를 OS 가 버린다 | 맥 `callservicesd` 로그 `Dropping incoming message` (10:53:42·10:53:45) + 서버 발송 200 | 확인됨 |
| 맥은 CallKit `didActivate` 가 오지 않는다 | 발신 2건 모두 8초 뒤 `ios_audio_session_gate_timeout`, `ios_audio_session_callkit_activated` 없음 | 확인됨 |
| 맥에서도 CallKit 발신 트랜잭션 자체는 성공 | `Received reply from transaction request with error: (null)` | 확인됨 |
| 음성·영상 발신 모두 gate 하나를 지난다 | `registerPendingOutgoingJoin` 호출처 = Voice·Video 발신 코디네이터 2곳뿐 | 확인됨(코드) |
| gate 전에 세션이 이미 활성화된다 | `NativeOutgoingRingbackOwner.start` → `prepareOutgoingRingbackRoute` 의 `setActive(true)` 가 gate 등록 전 실행 | 확인됨(코드) |
| 수신 코디네이터는 gate 를 쓰지 않는다 | 호출처 grep — 수신 코디네이터 0건 | 확인됨(코드) |
| 앱이 떠 있어도 VoIP 외 수신 경로 없음 | 웹 수신 배너가 네이티브 앱에서 `suppressWebIncomingBannerForNativeAuthority: isCapacitorNativePlatform()` 로 꺼짐 | 확인됨(코드) |
| 서버는 VoIP 행 없는 iOS 설치에 통화 일반 알림을 보낸다 | `resolveCallPushProviderPolicy` A4 — `iosVoipDeviceIds` 에 없으면 apns 통화 알림 허용 | 확인됨(코드) — 실발송 NOT_PROVEN |
| 맥은 일반 apns 행이 없다 | 운영 `user_devices` 조회(11:10 PHT) | 확인됨 — 원인 NOT_PROVEN |
| 회색 막대 = 맥 스크롤 막대 | 모양·세로 막대 동반 | **NOT_PROVEN**(계측 불가) |

### 7-2. 설계 항목별 구현 상태

| 항목 | 상태 | 위치 |
|---|---|---|
| D1 플랫폼 능력 단일 정의 | 구현 · 코드 PASS | `DibayCallPlatformCapability.swift`, `AppDelegate` 기록 1줄 (PR #307) |
| D1 서버 저장(DB 열) | 설계 정정으로 **하지 않음** | §2 「D1 정정」 |
| D3 맥 발신 오디오 | 구현 · 코드 PASS · 실기 NOT_PROVEN | `DibayCallAudioSessionController.registerPendingOutgoingJoin` (PR #307) |
| D3 맥 수락 | D2 로 이동 · 미구현 | §6 |
| D2 맥은 VoIP 미등록·일반 apns 등록 | 미구현 | — |
| D2 맥 앱 실행 중 수신 화면 | 미구현 · 수신 화면 주체 Owner 결정 필요 | — |
| D2 맥 일반 apns 행 미생성 원인 | 미확인 | — |
| 빌드 번호 | iOS 35 → 36 (4곳) · `--release --ios-only` RELEASE READY | PR #307 |
| 회색 막대 원인 계측 | 미착수(계측 빌드 필요) | §3 |
| iPad 실기 | NOT_PROVEN(실기기 없음 — 연결 기기: iPhone 13 mini unavailable, 나머지 시뮬레이터) | — |

## 8. build 36 맥 실기 (2026-11-15 PHT, 맥 김봉기 1.2.2 (36) Debug · 삼성 SM-M156S q테스트1 1.2.6 (52))

설치 확인: 맥 `user_devices.app_version = 1.2.2 (36)` 11:50:29 · 앱 로그 `call_platform_capability ios_app_on_mac=true voip_push=false callkit_audio_activation=false`.

| 시험 | callId | DB | 판정 |
|---|---|---|---|
| 삼성→맥 음성(맥 수신) | 2b96…e7df | 12:02:20 생성 · 12:02:51 missed | **FAIL** (D2 범위). 이번 VoIP 발송은 `BadDeviceToken` 400 — Debug 서명 빌드의 VoIP 토큰은 개발용인데 서버는 운영 APNs 로 보냄 → 맥 VoIP 행 비활성화됨 |
| 맥→삼성 음성 발신 | 3731…2d22 | 12:03:35 생성 · 12:03:36 cancelled | **FAIL** — D3 gate 는 즉시 통과(`platform_no_callkit_activation`)·Agora local join 성공. 0.9초 뒤 CallKit 종료 동작으로 끝남 |
| 맥→삼성 영상 발신 → 삼성 수락 → 맥 종료 | 7d44…bedb | 12:04:38 생성 · 12:04:54 answered · 12:04:55 connected · 12:05:25 ended_by_caller | **PASS(화면)** — 맥·삼성 양쪽 상대 카메라 영상 표시, 30초 유지, 맥 종료 후 양쪽 종료. 음성 들림은 NOT_PROVEN(청취 불가) |

### 새로 확인된 원인 (D3 이후 남은 맥 발신 결함)
맥 시스템 로그(12:03:35~36):
1. 앱 `CXStartCallAction` → `callservicesd` 가 통화 화면용으로 **FaceTime 앱을 실행**(`launchedByLS=1`).
2. FaceTime: `The app was launched with a URL. Terminating the app because it is not displaying anything.` → 종료.
3. `callservicesd`: `Disconnecting all calls because wantsCallDisconnectionOnInvalidation=YES` → `disconnectCallWithReason: 41` → 앱에 `CXEndCallAction`.
4. 음성: `termination_decision ... source=callkit_system_button` → 종료(3731…2d22). 영상: 같은 종료 동작이 12:04:39 에 왔지만 영상 경로는 종료하지 않고 계속 진행(경로별 처리 차이 — 보고만).

→ 맥에서는 **CallKit 발신 보고 자체가 통화를 끊는다.** gate 제거(D3)만으로는 부족.

### D3-2 설계안 (승인 대기 — 통화 변경 규정 3번)
- 변경 1곳: `CallKitProvider.reportOutgoingCallStarted` — `DibayCallPlatformCapability` 에 `supportsCallKitCallUi`(iPhone·iPad true, Mac false) 추가, false 면 `CXStartCallAction` 을 요청하지 않고 기록만 남기고 반환(세션 추적 맵에도 넣지 않음).
- 영향 확인(코드):
  - 음성 로컬 종료 `handleRejectOrEnd` 는 `hasTrackedCallKitSession == false` 이면 CallKit 없이 바로 `performLocalRejectOrEnd` → 맥 종료 버튼 정상 경로 유지.
  - 원격 종료·무응답의 `reportCallEnded` 는 추적 안 된 UUID 에 대해 CallKit 이 무시 → 무해.
  - 호출처 3곳(음성·영상 발신 코디네이터, `NativeCallServicePlugin`) 모두 이 함수 하나를 지남.
- iPhone·iPad: 값 true → 기존 CallKit 발신 그대로(코드 경로 무변경).
- 맥에서 잃는 것: 맥 시스템 통화 표시(FaceTime UI·통화 기록) — 지금도 FaceTime 이 즉시 종료되어 표시되지 않음.
- 검증: 맥→삼성 음성·영상 발신·수락·맥 종료·삼성 종료·삼성 거절·벨 중 맥 취소·무응답·재발신, iPhone 발신 회귀 1회 이상. 로그 기준 `Disconnecting all calls` 0건.

### D3-2 구현 기록 (Owner 「D3-2 승인」)
- `DibayCallPlatformCapability.supportsCallKitCallUi` 추가(맥 false) · 시작 기록에 `callkit_call_ui` 포함.
- `CallKitProvider.reportOutgoingCallStarted` — false 면 `ios_callkit_outgoing_report_skipped` 기록 후 반환(추적 맵 미기록).
- 영향 재확인: `reportCallEnded`/`endCallKitSession` 은 추적 안 된 UUID 에도 기존과 같은 경로(영상 여부 값은 원래 수신 보고 때만 기록 — 발신은 iPhone 에서도 false). 음성 로컬 종료는 `hasTrackedCallKitSession == false` → `performLocalRejectOrEnd`.
- iOS build 36 → 37 (4곳).

## 9. build 37 맥 실기 (2026-11-15 12:21~12:28 PHT · Production main c94523a51 · 맥 김봉기 1.2.2 (37) Debug · 삼성 SM-M156S q테스트1 1.2.6 (52))

시작 기록: `call_platform_capability ios_app_on_mac=true voip_push=false callkit_audio_activation=false callkit_call_ui=false` (12:20:35).

| # | 시험 | callId | DB (PHT) | 판정 |
|---|---|---|---|---|
| V1 | 맥→삼성 음성 · 삼성 수락 · 맥 종료 | a0d2…4fec | 21:47 생성 · 22:03 answered · 22:05 connected · 22:35 ended_by_caller | PASS (양쪽 「통화 중」 표시) |
| V2 | 맥→삼성 영상 · 삼성 수락 · 삼성 종료 | 3fd1…70ee | 22:49 · 23:06 · 23:07 · 24:25 ended_by_callee | PASS (양쪽 상대 영상, 맥도 함께 종료) |
| V3 | 맥→삼성 음성 · 삼성 거절 | ec78…2df7 | 24:41 · 24:52 rejected/declined | PASS (맥 「통화 거절」 안내) |
| V4 | 맥→삼성 음성 · 벨 중 맥 취소 | 9119…c2ec | 25:27 · 25:39 cancelled | PASS (삼성 벨 멈춤, 20초간 재울림 없음) |
| V5 | 맥→삼성 음성 · 무응답 | a326…1183 | 26:13 · 26:43 missed | PASS (양쪽 종료, 맥 「부재중」 기록) |
| V6 | 종료 직후 재발신 · 수락 · 맥 종료 | 3330…0d49 | 27:43 · 27:47 · 27:48 · 28:03 ended_by_caller | PASS |

맥 로그(12:20 이후): `Disconnecting all calls` 0 · `source=callkit_system_button` 0 · FaceTime 종료 0 · `ios_audio_session_gate_timeout` 0 · `ios_callkit_outgoing_report_skipped` 6 · `platform_no_callkit_activation` 6.

NOT_PROVEN: 실제 소리 들림(청취 불가) · 통화 중(busy) · 맥 영상 발신 후 맥 종료(build 36 에서만 PASS) · 삼성→맥 수신 전부(D2 범위, FAIL 유지) · iPhone 발신 회귀(연결된 iPhone 없음) · iPad 실기.

## 10. D2 설계안 — 맥 수신·수락 (2026-11-15, Owner 「D2 설계 진행」 · 구현은 승인 후)

### 10-1. 현재 사실 (증거)
| # | 사실 | 근거 |
|---|---|---|
| F1 | 맥은 PushKit VoIP 를 OS 가 버린다 | 맥 `callservicesd` `Dropping incoming message` (§1-1) |
| F2 | 맥은 VoIP 등록(`voip_apns`)만 반복하고 일반 알림(`apns`) 등록 요청을 한 번도 보내지 않았다 | Vercel `/api/me/devices/register` 감사 로그 11:31~12:31 PHT — `provider=voip_apns` 만 14회, `apns` 0회 · `/devices/deactivate`·`/devices/status` 호출 0회 |
| F3 | 일반 알림 등록은 `ensureNotificationForPushRegister` 가 권한 준비 아님이면 서버 호출 없이 멈춘다 | `register-native-push-client.ts:341-359` |
| F4 | 맥 알림 권한 = **끔** (12:34 PHT 맥 시스템 설정 > 알림 > DIBAY 「끔」 직접 확인, 변경 안 함) → F3 에서 멈춤 = 일반 알림 미등록의 원인. 기기 설정이며 앱 결함 아님 | 시스템 설정 화면 |
| F5 | 서버는 활성 VoIP 행이 있는 iOS 기기에는 통화 일반 알림을 막는다(VoIP sent 면 차단) | `resolveCallPushProviderPolicy` A4 — 맥 VoIP 는 APNs 200 으로 sent → 맥 일반 수신 알림도 막힘 |
| F6 | 네이티브 앱에서 웹 수신 배너는 꺼져 있고, iOS 웹 수신 주체 요청도 `isNativeVoiceIncomingLaneEnabled` 면 건너뜀 | `GlobalCommunityMessengerIncomingCall.tsx:1859` · `call-v4-ios-shell-owner-client.ts:17-25` |
| F7 | iOS 네이티브 수신 시작은 VoIP→`CallKitProvider.reportIncomingCall` 하나뿐, 수락은 `CXAnswerCallAction` → `NativeVoice/VideoIncomingCallCoordinator.handleAnswer` | `CallKitProvider.swift:101, 742-` |
| F8 | 알림 탭은 `/community-messenger/calls/{callId}` 로 이동 | `resolve-push-route-from-fcm-data.ts:84` |
| F9 | 서버 기기 비활성화 API 는 `push_provider` 단위로 끌 수 있다 | `app/api/me/devices/deactivate/route.ts` |

### 10-2. 설계 (원인별)
**D2-1 맥은 VoIP 를 등록하지 않는다 (F1·F5)**
- 네이티브: `VoIPPushRegistry.start` / `DibayVoipCallPlugin.startVoipRegistration` — `DibayCallPlatformCapability.supportsVoipPush == false` 면 PushKit 등록을 시작하지 않고 기록만.
- 웹: 같은 능력을 플러그인으로 노출(`getCallPlatformCapability`), 맥이면 이 기기의 기존 `voip_apns` 행을 `/api/me/devices/deactivate`(provider=voip_apns)로 끈다 — 구 빌드가 남긴 행 정리.
- 효과: 서버 A4 정책상 이 기기는 「VoIP 없는 iOS 설치」 → 수신·취소가 **일반 APNs 알림**으로 간다(서버 코드 변경 없음).

**D2-2 맥 일반 알림 등록 (F2·F3·F4)**
- 확인 결과 맥 알림 = 끔(F4) → 코드 수정 없음. 맥 앱 종료 상태 수신(D2-4)은 Owner 가 맥 알림을 켠 뒤에만 시험 가능. 앱 실행 중 수신(D2-3)은 알림과 무관.

**D2-3 맥 앱 실행 중 수신 화면 (F6·F7)** — 기존 계약 재사용(Android 포그라운드 `web_in_app` 계약과 같은 구조)
- 벨 UI: 기존 웹 `CallV4IncomingSheet`. 맥이면 `tryClaimIosCapacitorWebIncomingOwner` 의 「네이티브 음성 수신 레인이면 건너뜀」 조건에서 제외(능력 값으로만 분기).
- 수락: 웹 시트 수락 → 새 플러그인 메서드 `acceptIncomingWithoutCallKit(callId, kind)` → 네이티브 런타임에 수신 세션 등록(현재 `reportIncomingCall` 이 하는 등록 중 CallKit 부분만 제외) → `NativeVoice/VideoIncomingCallCoordinator.handleAnswer` 그대로. 미디어는 네이티브 Agora(웹 통화 수립 금지 계약 유지).
- 거절·벨 중 상대 취소·다른 기기 수락: 웹 시트가 서버 상태로 닫힘(기존 웹 경로) + 네이티브 등록 전이면 정리 불필요.

**D2-4 맥 앱이 꺼져 있을 때 (F8)**
- 일반 알림(D2-1 결과) 탭 → 앱 실행 → `/calls/{callId}` → 서버 상태가 벨 중이면 D2-3 시트, 아니면 부재중 안내. 알림 소리·문구는 서버 기존 통화 알림 그대로.

### 10-3. 영향·호환
- iPhone·iPad: 모든 분기는 능력 값(맥만 false)으로만 → 코드 경로 무변경. 회귀 확인 = iPhone 수신·발신 각 1회 이상.
- 구 바이너리(맥 1.2.2 (35)·(36)·(37)): 계속 VoIP 등록 → D2 빌드 설치 전까지 맥 수신 FAIL 유지.
- 서버·DB: 코드·스키마 변경 없음(기존 비활성화 API 사용).
- 통화 규정: 통화만 단독 PR. D2-1 → D2-2 확인 → D2-3·D2-4 순서, 단계마다 맥↔삼성 실기.

### 10-4. 실기 행렬 (D2)
삼성→맥 음성·영상: 맥 앱 앞 화면 수락 · 맥 앱 뒤(다른 앱 앞) 수락 · 맥 앱 종료 상태 알림 탭 수락 · 거절 · 벨 중 삼성 취소(재울림 없음) · 무응답 · 통화 중(busy) · 종료 후 즉시 재수신. iPhone 수신 회귀 1회 이상.

### 10-5. Owner 확인 필요 1건
- 맥 알림을 켤지(현재 「끔」) — 켜야 D2-4(앱 종료 상태 수신) 시험 가능. 작업자는 설정을 바꾸지 않는다.

### 10-6. D2-1 구현 기록 (Owner 「D2-1 부터 구현」)
- 네이티브: `VoIPPushRegistry.start` — 맥(`supportsVoipPush == false`)이면 PushKit 미등록(`ios_voip_registry_start_skipped`). `DibayVoipCallPlugin.getCallPlatformCapability` 추가(웹 노출).
- 웹: `attachVoipPushTokenListener` 부착·로그인(SIGNED_IN/INITIAL_SESSION) 때 능력이 `voipPush=false` 면 `/api/me/devices/deactivate` 에 `{device_id, push_provider:"voip_apns"}` 1회 — 구 빌드가 남긴 「이 기기」 VoIP 행만 끔. 능력 조회 없는 구 바이너리는 아무것도 안 함.
- 서버: deactivate 라우트에 `device_id + push_provider`(토큰 없음) 분기 추가 — 그 회원·그 기기·그 제공자만. 기존 호출(토큰 증명 로그아웃·provider 단독·device scope)은 순서·조건 무변경(테스트 고정).
- 발견(보고만, 범위 밖): 기존 `dibay:voip-token-invalidated` 처리는 `{push_provider:"voip_apns"}` 만 보내 **같은 회원의 모든 기기 VoIP 행**을 끈다(iPhone 2대면 다른 iPhone 도 꺼짐).
- iOS build 37 → 38.
- 맥 기대 결과: VoIP 행 비활성 → 서버가 맥을 「VoIP 없는 iOS」로 보고 통화 수신 일반 알림 발송 시도. 단 맥 알림 「끔」이라 일반 알림 등록이 없어 실제 알림은 Owner 가 알림을 켠 뒤에만 도착(D2-4).

### 10-7. build 38 맥 실기 (2026-11-15 12:55~12:58 PHT · main 8c1dc6aae · 맥 1.2.2 (38) Debug · 삼성 q테스트1 1.2.6 (52))
| 항목 | 증거 | 판정 |
|---|---|---|
| 맥 PushKit 미등록 | 맥 로그 12:55:32 `ios_voip_registry_start_skipped reason=platform_no_voip_push` | PASS |
| 이 기기 VoIP 행만 비활성 | 운영 `user_devices` 맥 device_id voip_apns 2행(35·37) `is_active=false` 12:55:35 (앱 실행 3초 후) | PASS |
| 삼성→맥 음성(61a6…86bc) 서버 발송 | `call_ringing·call_cancel·missed_call : skipped no_active_targets` — VoIP 발송 없음, 맥 `Dropping` 0 | 서버 경로 PASS / **맥 수신 FAIL**(맥 알림 「끔」→ apns 행 없음, D2-3·D2-4 범위) |
| 맥→삼성 음성 회귀(d32f…c17f) | 12:57:18 생성 · 12:57:29 connected · 12:57:38 맥 종료 | PASS |
| 설치 확인 | `user_devices.app_version` 으로는 38 확인 불가(맥 활성 행이 하나도 없음) — 앱 번들 `CFBundleVersion 38`·`DibayGitSha 8c1dc6aae` 로 확인 | — |
NOT_PROVEN: iPhone VoIP 회귀(연결된 iPhone 없음).

### 10-8. D2-3 범위 정정 (구현 착수 전 코드 확인 결과 — 승인 다시 필요)
§10-2 의 「웹 수신 시트를 맥에서 켜려면 `tryClaimIosCapacitorWebIncomingOwner` 조건 하나만 제외」는 **틀렸다**. iOS 셸에서는 그 조건까지 가기 전에 막힌다(코드 확인):

| # | 막는 곳 | 근거 |
|---|---|---|
| G1 | iOS 셸은 V4 공급자가 sync-only — 수신 탐색·수신 시트 자체가 마운트되지 않음 | `CallV4Provider.tsx:353-355, 476-478` (설계 문서 `call-v4-web-incoming-remote-terminal-root-cause-design-2026-11-08.md` E8 와 같음) |
| G2 | 수신 탐색은 `NEXT_PUBLIC_DIBAY_CALL_V4_TELEGRAM_LANE === "1"` 일 때만 — 운영 값 확인 못 함 | `call-v4-incoming-discovery.ts:234` |
| G3 | 캡시터 앱에서는 Realtime 수신 피드 끔 → HTTP 폴링만 | `call-v4-incoming-discovery.ts:261` |
| G4 | 웹 주체 요청을 웹·네이티브 양쪽이 막음(네이티브 음성 레인 켜짐) | `call-v4-ios-shell-owner-client.ts:17-26`, `CallV4SurfaceOwnerBridge.swift:40-65` |
| G5 | 시트의 「수락」은 iOS 에서 **웹 Agora 로 통화 수립**(웹 PATCH → `callV4EnsureAgoraJoined`) — 네이티브 수락 연결 없음 | `call-v4-actions.ts:1240-1254`, `call-v4-agora.ts:200-240` — 「웹뷰 통화 수립 금지」(`dibay-call-native-runtime-ssot.md:9-17`) 와 충돌 |

**정정 설계 (맥만, 능력 값 `callKitCallUi=false` 로만 분기)**
1. 웹 `CallV4Provider`: 맥이면 sync 기능은 그대로 두고 **수신 전용 묶음**(수신 탐색 + `CallV4IncomingSheet`)만 추가로 마운트. 웹 발신·웹 Agora 수립 부분은 마운트하지 않음.
2. 수신 탐색: 맥이면 V4 플래그와 무관하게 시작(G2). 폴링 주기는 기존 탐색 규칙 그대로.
3. 주체 요청: 맥이면 웹(`tryClaimIosCapacitorWebIncomingOwner`)·네이티브(`CallV4SurfaceOwnerBridge.shouldBlockWebIncomingOwnerClaim`) 모두 `web_in_app` 허용(G4).
4. 「수락」: 맥이면 `callV4Accept` 가 웹 PATCH·웹 Agora 대신 새 네이티브 메서드 `acceptIncomingWithoutCallKit(callId, kind, roomId, callerId, callerName)` 호출 → 네이티브가 수신 세션 등록(`NativeVoice/VideoCallRuntime.registerIncomingSession`) → 기존 `handleAnswer`(서버 수락·토큰·Agora 네이티브) → 네이티브 통화 화면. 웹 Agora 는 맥에서 쓰지 않음(G5 계약 유지).
5. 오디오: `prepareForNativeVoiceCall/VideoCall` 이 맥이면 `setActive(true)` 까지(D3 와 같은 원리).
6. 거절·상대 취소·무응답: 기존 웹 시트 경로(서버 상태) 그대로 — 네이티브 세션은 수락 때만 생기므로 정리 대상 없음.

영향: 웹 V4 공급자·탐색·수락 3곳 + 네이티브 2곳(주체 차단·플러그인 1개) + 오디오 준비 1곳. iPhone·iPad·Android·데스크톱 웹은 분기 값이 달라 경로 무변경 — 단위 테스트로 4플랫폼 고정. 통화 단독 PR · 네이티브 build 39.

### 10-9. D2-3 구현 기록 (Owner 「정정 설계로 구현」)
- 웹: `lib/call/native/call-platform-capability-client.ts`(능력 단일 읽기·캐시) · `CallV4Provider` 맥이면 `CallV4MacIncomingHost`(탐색 + `CallV4IncomingSheet`, 웹 수립·웹 통화 화면 없음) · `startCallV4IncomingDiscovery(userId, { macIosApp })` 플래그 무관·Realtime 병행 · `tryClaimIosCapacitorWebIncomingOwner` 맥이면 웹 쪽 `web_in_app` 선언(네이티브 왕복 없음 → `CallV4SurfaceOwnerBridge` 수정 불필요) · `callV4Accept` 맥이면 `callV4AcceptOnMacNative`(네이티브 수락 중 표면 등록 → 시트 닫힘 → `acceptIncomingWithoutCallKit` → 상태 초기화).
- 네이티브: `DibayMacIncomingCallAcceptor`(수신 등록 + 기존 `handleAnswer` + 음성 화면 표시) · `NativeCallServicePlugin.acceptIncomingWithoutCallKit` · `prepareForNativeVoice/VideoCall` 맥이면 `setActive(true)`.
- 계약 테스트 정정(설계 변경 반영): `call-v4-incoming-outside-surface.test.ts` F2 소스 계약 2건, `call-surface-authority-contract.test.ts` 1건 — 「Capacitor 셸 sync-only·Realtime 없음」에 맥 예외만 추가, 맥 묶음에 웹 수립·웹 통화 화면이 없음을 함께 고정.
- 보고만: `CALL_V4_TELEGRAM_INCOMING_SURFACE_CONTRACT.capacitorNativeForeground = "native_incoming_surface"` 설명 상수는 맥 예외를 표현하지 않음(동작 영향 없음).
- iOS build 38 → 39.

### 10-10. build 39 맥 수신 실기 (2026-11-15 13:43~13:48 PHT · main 9d1ac2168 · 맥 김봉기 1.2.2 (39) Debug · 삼성 q테스트1 1.2.6 (52))
시작 기록 13:42:02 `call_platform_capability ios_app_on_mac=true voip_push=false callkit_audio_activation=false callkit_call_ui=false`.

| # | 시험 | callId | DB (PHT) | 판정 |
|---|---|---|---|---|
| R1 | 삼성→맥 음성 · 맥 앱 앞 · 맥 수락 · 맥 종료 | ab23…9f4f | 43:15 · answered 43:26 · connected 43:27 · ended 43:48 ended_by_callee | PASS (맥 홈 화면 위 수신 시트 → 맥 네이티브 통화 화면 · 삼성 「통화 중」) |
| R2 | 삼성→맥 영상 · 맥 수락 · 삼성 종료 | 3419…3b46 | 44:02 · 44:12 · 44:13 · 44:31 ended_by_caller | PASS (맥에 삼성 카메라 영상, 삼성 종료 시 맥도 종료) |
| R3 | 삼성→맥 음성 · 맥 거절 | fbf3…0a32 | 44:45 · 44:51 rejected/declined | PASS (삼성 「거절」 기록) |
| R4 | 삼성→맥 음성 · 벨 중 삼성 취소 | 4ecb…29a8 | 45:09 · 45:17 cancelled | PASS (맥 시트 → 「부재중 전화」 안내, 15초간 재울림 없음) |
| R5 | 삼성→맥 음성 · 무응답 | 5455…9a12 | 45:45 · 46:16 missed | PASS (양쪽 종료) |
| R6 | 다른 앱(시스템 설정) 앞 · 삼성→맥 음성 · 맥 수락 | e3dd…183a | 46:44 · 47:14 · 47:15 · 47:31 | PASS (뒤 창에도 시트 표시). 첫 클릭은 창 활성화만 되고 두 번째 클릭에 수락(맥 비활성 창 기본 동작) |
| R7 | 종료 직후 재수신 · 맥 수락 | 587d…2c64 | 47:39 · 47:44 · 47:46 · 48:01 | PASS |
| 회귀 | 맥→삼성 음성 · 삼성 수락 · 맥 종료 | e90f…d3ee | 48:20 · 48:24 · 48:25 · 48:32 ended_by_caller | PASS |

맥 로그: `ios_mac_incoming_accept_started` 4 · `ok=true` 4 · `ok=false` 0 · 등록 실패 0 · `activated_without_callkit` 6 · gate timeout 0 · `callkit_system_button` 0 · `Disconnecting all calls` 0.

NOT_PROVEN: 실제 소리(청취 불가) · 맥 앱 종료 상태 수신(D2-4, 맥 알림 「끔」) · 통화 중(busy) 수신 · iPhone·iPad 회귀(연결 기기 없음).
보고만(범위 밖): 수신 시트 영상 문구가 「DIBay 영상 통화」(브랜드 표기 대소문자) · 맥 앱이 켜져 있는데 삼성 대화방 머리글에 김봉기 「오프라인」 표시 · 13:42 경 삼성 DIBAY 가 매장 관리 화면에 있었음(작업자 조작 아님).

## 11. 하단 회색 막대 계측 (2026-11-15 14:20~14:35 PHT · 맥 build 40 Debug, 디버거 없이 실행 후 lldb 연결 · 운영 웹 43b3b3810)

방법: lldb 로 `WKWebView`·`WKScrollView` 설명 문자열(프레임·contentOffset·contentSize·insets) 읽기 + `evaluateJavaScript` 로 문서 값을 페이지 제목에 잠시 기록 후 읽고 복원.

| 상태 | 네이티브 (WKScrollView) | 웹 문서 | 회색 막대 |
|---|---|---|---|
| 홈 | frame 1330×998 · offset {0,0} · contentSize {1330,998} · insets 0 · `bottomEdge style=automatic` | 1330×998, scroll 0, 넘침 요소 0 | 없음 |
| 대화방 기본 | 같음 | 같음 | 없음 |
| 대화방 입력창 포커스(TEXTAREA) | 같음(스크롤 0) | 같음, visualViewport 1330×998 | **없음 — 오전 11:05 재현과 다름** |
| LOUNGE 글 상세(맛집) + 스크롤 | 같음 | 같음 | 없음(스크롤 시 하단 탭 숨김) |
| build 35(Release, 오전 재현 빌드) 대화방 포커스 | 계측 불가(디버거 차단) | — | **없음(화면 확인)** |

모의 재현(측정 후 원복, 원복 값 확인 1330×998):
- 문서를 세로로 40pt 넘치게 + 끝까지 스크롤 → 오전처럼 머리글이 잘리고 하단에 띠가 생기지만 **흰색(앱 배경)** 이고 회색 둥근 막대가 아님.
- 문서를 가로로 2pt 넘치게 → 막대 표시 없음.

결론: **현재 운영 웹 + build 35·40 에서는 재현되지 않음. 원인 NOT_PROVEN.**
- 배제: 네이티브 빌드 차이(35·40 모두 미재현), 단순 세로 넘침, 2pt 가로 넘침.
- 오전 재현 시각(11:05) 이후 운영 웹 변경 중 하단 탭·셸 관련: #310(13:14 하단 탭 controller SSOT·키보드 숨김 probe·셸 플래그), #312·#314. 이 중 하나가 바꿨을 가능성 — 증거 없음.
- 다시 나타나면 같은 방법(build 40 Debug + lldb)으로 그 순간 계측해야 원인 확정 가능.

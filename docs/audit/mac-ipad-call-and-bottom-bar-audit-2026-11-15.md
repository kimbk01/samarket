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

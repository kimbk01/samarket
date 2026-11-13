# 영상 통화 「카메라 끄기」 결함 — 영향 분석·수정 설계 (2026-11-14, 보완판)

- 상태: **설계만. Owner 승인 전 구현 금지** (AGENTS.md 통화 변경 규정 3번)
- 분류: **네이티브** (iOS·Android 재빌드 필요). 웹·서버·DB·푸시·CallKit 변경 없음
- Owner 지시 원문:
  - 「카메라 끄기 기능은 안되」 (11-13 App Store 영상 촬영 중)
  - 「이게 삼성 폰에서도 안되는 부분이다」
  - 「계획서 작성」
  - 「땜빵으로 하지 말고 정확한 구현… 다른 기능의 영향성, 구조적인 결함 등을 끝까지 확인하고 설계안을 보완」 (11-14)
- 보완 근거:
  - ① Agora 공식 API 문서 (아래 2절)
  - ② iOS·Android 통화 영상 코드 전수 확인 (호출처·생명주기, 아래 3절. 핵심 줄은 직접 다시 열어 대조함)
  - ③ 실기 증거 (1절)

## 1. 결함 (실기 증거)

시험 조건: 2026-11-14 00:10~00:13 PHT · 통화 `db05e53b-56ce-4124-99c7-8825c0195cd6` · iPhone 13 mini TestFlight 1.2.2 (34) ↔ Samsung SM-M156S `52 / 1.2.6`.

| # | 항목 | 판정 | 증거 |
|---|---|---|---|
| F1 | 내가 끈 뒤 내 화면 미리보기 | **FAIL** — 계속 켜져 움직임, 아이콘만 바뀜 | Samsung 00:12:19 끔 → 캡처 02:12·02:17. iPhone 은 Owner 육안 |
| F2 | 상대가 끈 뒤 내 화면의 상대 영상 | **FAIL** — 검정·표시 없이 마지막 장면에서 멈춤 | iPhone 00:10:45 끔 → Samsung 캡처 00:42·00:54·00:58 같은 장면. 반대 방향은 Owner 육안 「검은 색이 아니라 멈춤」 |
| — | 버튼 입력·송출 중단 | 동작 | 양쪽 로그 `camera_toggle enabled=false` |

## 1-1. 왜 기능이 죽었나 (변경 경위 · git 이력으로 확인)

**결론**: 외부 원인(OS·SDK 업데이트·서버)이 아니다. **웹 통화 화면 → 네이티브 영상 통화로 옮길 때, 카메라 끄기를 웹과 다르게(송출만 멈추게) 새로 만들었고, 상대 쪽 처리도 옮기지 않았다.** 이 차이를 잡는 시험 항목도 없었다.

| 시기 | 경로 | 카메라 끄기 동작 | 근거 |
|---|---|---|---|
| ~2026-06-26 (Android) · ~07-11 (iOS) | **웹 통화 화면** (앱 안 WebView, Agora Web SDK) | ① `client.unpublish([videoTrack])` ② `videoTrack.setEnabled(false)` → **카메라 장치까지 끔**. 상대는 `user-unpublished` → `bindRemoteVideoTrack(null)` 로 **상대 영상 칸을 비움** (멈춘 장면 안 남음). 내 작은 화면은 `cameraOff` 로 숨김 | `components/community-messenger/CommunityMessengerCallClient.tsx:2550-2566`(18925c922, 06-16), `:2740-2744` · `components/messenger/call/MiniLocalVideo.tsx:20` |
| 2026-06-27~ (Android) | **네이티브 영상 통화로 전환** — 같은 커밋에서 스위치 `nativeVideoRuntime: true` | `setCameraEnabled` → `muteLocalVideoStream` 만 (송출만 멈춤, 카메라·미리보기 유지). 상대 처리 없음 | 364e6847b 「feat(call): add native video runtime」 — `assets/dibay-call-lane.json` 를 true 로, `NativeVideoCallAgoraEngine.setCameraEnabled` 신규 |
| 2026-07-10 (iOS 구현) · **07-12 iOS 전환** | iOS 도 네이티브로 | Android 와 같은 방식을 그대로 옮김 | 06eeda971 (구현, 스위치 꺼짐) · 42e1a5b81 「enable nativeVideoRuntime for iOS incoming」 (07-12) · 521edf3a3 발신 전환 (07-12) |
| 그 뒤 ~ 현재 | — | **카메라 코드 변경 0건** (`muteLocalVideoStream`·`setCameraEnabled` 를 건드린 커밋은 위 두 개뿐) | `git log -S` 전수 |

외부 원인이 아님을 확인한 것:
- **Agora SDK 버전**: Android `4.6.3` 은 06-27 도입 뒤 변경 없음. iOS `4.6.2` 는 07-10 `exactVersion` 으로 고정된 뒤 변경 없음 (01ee08948).
- **API 동작**: `muteLocalVideoStream` 이 「송출만 멈춤, 캡처 장치는 계속」인 것은 문서상 원래 동작이다 (2절). SDK 가 바뀌어 죽은 것이 아니다.
- **서버·웹 변경**: 네이티브 카메라 끄기는 서버를 거치지 않는다.

왜 놓쳤나:
- 네이티브 영상 설계·QA 문서에 카메라 끄기 시험 항목이 **한 줄도 없다**. 설계 문서는 `setCameraEnabled (media controls only)` 한 줄뿐이다.
  - 검색 대상: `docs/dibay-call-native-video-runtime-qa.md`·`docs/dibay-call-ios-native-video-qa.md`·`docs/dibay-native-call-ui-design.md:75`
- QA 는 연결·종료·PiP·권한 위주였다. 버튼을 눌러 아이콘이 바뀌는 것만 보고, 상대 화면은 확인하지 않은 구조다.

이번 설계와의 관계:
- 4절 설계는 웹 시절 동작으로 되돌리는 것이다. 카메라 장치 끄기 + 공개 중단, 상대 영상 칸 비우고 표시, 내 작은 화면 숨김.
- 같은 결함이 다시 나오지 않도록 10절 행렬을 네이티브 영상 QA 문서에 고정 항목으로 추가한다.

## 2. Agora SDK 동작 (공식 문서로 확정 · iOS 4.6.2 / Android 4.6.3)

출처: api-ref.agora.io Video SDK 4.x `IRtcEngine`·`IRtcEngineEventHandler`.

| API | 문서 내용 | 이번 설계에 주는 뜻 |
|---|---|---|
| `muteLocalVideoStream(true)` | 「Stops or resumes publishing」, 끄더라도 「the video capturing device will still work」. 원격에 `onUserMuteVideo`·`onRemoteVideoStateChanged` | **지금 결함의 원인** — 카메라 장치는 계속 돈다 |
| `enableLocalVideo(false)` | 「disables … the local video capture」, 채널 안에서는 「simultaneously stops publishing」. 원격에 `onRemoteVideoStateChanged` | 카메라 장치를 실제로 끈다 |
| `enableLocalVideo(true)` 다시 켜기 | 「call enableLocalVideo(true) and then call updateChannelMediaOptions … to publish the locally captured video stream」 | **다시 켤 때 공개 설정을 다시 지정해야 함** (첫 계획서에 빠져 있었음) |
| `onRemoteVideoStateChanged` | STOPPED(0)=사유 3·5·7 / STARTING(1) / DECODING(2)=사유 2·4·6·9 / FROZEN(3)=사유 1(혼잡)·8(음성만으로 낮춤) / FAILED(4). 사유 5 = 「remote user stops sending the video stream or disables the video module」, 6 = 다시 보냄, 7 = 퇴장 | **상대 카메라 꺼짐 = STOPPED + 사유 5 만.** 네트워크 멈춤(FROZEN 1·8)과 구분 가능 |

문서에 없어 실기로 확정할 것 (NOT_PROVEN):
- (a) `enableLocalVideo(false)` 뒤 `startPreview()` 가 캡처를 다시 켜는지
- (b) `leaveChannel` 뒤 다음 통화까지 `enableLocalVideo(false)`·`muteLocalVideoStream(true)` 가 남는지 (엔진을 통화 사이에 재사용함)
- (c) 상대가 이미 끈 상태에서 내가 입장할 때 STOPPED+5 가 오는지

## 3. 전수 확인으로 찾은 구조 결함

### 3-1. 카메라 끄기와 직접 얽힌 것 (이번 수정에 포함)

| # | 결함 | 근거 (파일:줄) | 지금 영향 | 고치지 않으면 새 동작에서 생기는 일 |
|---|---|---|---|---|
| S1 | 카메라 상태가 **화면 객체 필드**뿐 (`cameraEnabled = true`). 화면이 다시 만들어지면 「켜짐」으로 돌아감 | iOS VC:13. VC 는 PiP 복귀·최소화 복귀·잠금 해제 때마다 새로 생성(UiHost:115). Android A:143. 알림 탭 복귀 때 새 Activity(S:242) | 엔진은 끈 상태인데 버튼은 「켜짐」 | 같은 어긋남 + 화면 표시도 틀림 |
| S2 | **발신자는 연결 전에 카메라 버튼이 보이는데**, 엔진 입장 전 탭은 버려짐(엔진 없으면 return). 입장 시 그대로 카메라 공개 | iOS VC:183-186, Engine:183, 입장은 오디오·토큰 대기 뒤(Outgoing:94-102). Android A:1161-1165, E:426, E:221 | 끈 줄 알았는데 상대에게 영상이 나감 (사생활) | 같음 |
| S3 | 카메라를 다시 켜는 경로가 상태를 보지 않음 | iOS `restartLocalMediaCapture` 가 `enableLocalVideo(true)`+`startPreview` (Engine:189-207). 권한 보류 수락 뒤 자동 실행(DibayVoiceMicrophonePermission.swift:264). iOS `startPreview` 는 PiP 복귀·최소화 복귀·잠금 해제·연결 때마다(Engine:340-347, 467) | 없음 (지금은 송출만 끄므로) | **끈 카메라가 몰래 다시 켜짐** |
| S4 | 엔진이 통화 사이에 재사용되는데, 입장 때 **마이크만 초기화**하고 영상은 안 함 | Android E:157-161 (「every call starts with the mic unmuted」). iOS 입장 Engine:331·363 도 영상 상태 미초기화 | NOT_PROVEN (2절 b) | 카메라를 끄고 끊으면 **다음 통화가 카메라 꺼진 채 시작**될 수 있음 |
| S5 | 내 화면 칸을 보이게 하는 코드가 여러 곳에 흩어져 있음 | iOS `localContainer.isHidden` VC:192·354·410·460·585·798·1090. 미리보기 붙일 때 칸 안을 통째로 교체(VC:266-271). Android `localContainer` VISIBLE A:1170·1378·2333-2335·2373 | — | 칸 안이나 한 곳에만 「꺼짐 칸」을 두면 PiP 복귀 등에서 **지워지거나 다시 미리보기가 보임** |
| S6 | 발신 화면 전환(내 전체 화면 → 작은 화면)이 **양쪽 첫 영상 프레임**이 와야만 시작. 대체 타이머 없음 | iOS VC:429-435, 첫 프레임 플래그는 1회용(VC:307). Android A:1358-1364, 연결 화면 버튼도 전환 완료가 조건(A:1209) | — | 발신자가 연결 전에 끄거나 상대가 꺼진 채면 **연결돼도 「거는 중」 화면에 멈춤** |
| S7 | 상대 영상 상태 콜백 처리 없음 | Android E:880-890 (STARTING·DECODING 만), iOS 콜백 미구현(Engine:516-700) | F2 | — |
| S8 | iOS PiP 는 별도 표시층(AVSampleBufferDisplayLayer)에 프레임을 넣고, 프레임이 끊기면 **마지막 프레임을 계속 보여 줌** | VC:1804-1888, 비우기는 deactivate 때만(VC:1835-1839) | PiP 에서도 멈춤 | 전체 화면만 고치면 PiP 는 계속 멈춤 |
| S9 | 상대 카메라 상태가 들어올 때 **화면(VC)이 없을 수 있음** (iOS PiP 중 VC 해제) | UiHost:212-239, `controller(for:)` nil | — | 상태를 화면에만 두면 PiP·복귀 때 잃어버림 |

### 3-2. 같이 발견했지만 이번 범위 밖 (보고만 · 별도 승인)

| # | 결함 | 근거 | 영향 |
|---|---|---|---|
| X1 | **마이크도 S1·S2 와 같은 구조 결함** — 화면 재생성 시 「음소거 아님」으로 돌아감, 발신 입장 전 탭이 엔진에 안 들어감 | iOS VC:14, Engine:215. Android A:144, E:426 | 음소거 중인데 버튼이 「켜짐」. 이번 상태 보관 구조에 같이 넣을 수 있게 설계함(4-1). 실제 변경은 별도 승인 |
| X2 | iOS 권한 재허용 `restartLocalMediaCapture` 가 `enableLocalVideo(true)` 뒤 `updateChannelMediaOptions` 를 부르지 않음 | Engine:198-200, 2절 문서 | 재허용 뒤 상대에게 영상이 다시 나가는지 NOT_PROVEN. 이번에는 카메라 꺼짐 가드(4-3)만 넣고, 공개 설정 재지정은 4-2 의 같은 함수를 쓰게 되어 함께 해소됨 |
| X3 | Android 연결된 수신자를 앞으로 가져올 때 `UI_MODE_INCOMING` 으로 열어 미리보기 재부착을 건너뜀 | R:229, A:819 | 그 경로에서 내 미리보기가 빈 칸일 수 있음 (NOT_PROVEN) |
| X4 | Android PiP 버튼이 3개 미만만 허용되면 「카메라 켜기」가 가장 먼저 빠짐 | CallPipActionPlan:36-56 | 카메라 끈 채 PiP 에서는 다시 켤 수 없음 (전체 화면에서는 가능) |
| X5 | Android 카메라 버튼 접근성 설명은 「상태」, PiP 버튼은 「동작」을 말함 (서로 다름). 버튼 밑 라벨은 항상 「영상」 | A:1944-1945, PipPresenter:72-73, layout:299-310 | 화면 읽기 사용자 혼동 |
| X6 | Android 카메라용 포그라운드 서비스 유형은 Android 14 이상에서만 요청 | S:279 | Android 11~13 에서 PiP·백그라운드 중 카메라 다시 켜기 동작 NOT_PROVEN (시험 V12) |

## 4. 수정 설계

원칙:
- **상태는 한 곳(엔진 쪽 통화 상태 보관소)**, 화면은 그 상태를 그리기만 한다.
- 카메라를 켜고 끄는 SDK 호출은 **한 함수**에서만 한다.
- 화면 칸 표시는 **한 함수**에서만 결정한다.

### 4-1. 통화별 미디어 상태 보관소 (S1·S2·S4·S9)

- 위치:
  - iOS `NativeVideoCallAgoraEngine` 안 (`lock` 보호).
  - Android `NativeVideoCallAgoraEngine` 정적 상태 (`LOCK` 보호).
- 내용 (통화 id 기준): `localCameraOn`(내 카메라) · `remoteCameraOn`(상대 카메라).
  - 마이크(X1) 칸은 구조만 두고 쓰지 않는다 (별도 승인).
- 생성 시점: **통화 세션이 생길 때** (발신 시작·수신 수락). 엔진 입장 전이다.
  - 그래서 발신자가 연결 전에 누른 값도 저장된다 (S2).
- 초기화: 새 통화는 항상 `localCameraOn=true, remoteCameraOn=true`. 통화가 끝나면(leave) 지운다.
- 화면(iOS VC / Android Activity)은 만들어질 때와 상태가 바뀔 때 이 값을 읽어 그린다. **화면 필드 `cameraEnabled` 는 없앤다.**
- 엔진 → 화면 알림 통로:
  - iOS 는 기존 방식 `NativeVideoCallUiHost` 정적 함수 (Engine:441·562·615 와 같은 방식).
  - Android 는 기존 Activity 바인딩.
  - 화면이 없으면 상태만 저장하고, 다음 화면 생성 때 반영한다.

### 4-2. 카메라 켜기·끄기 — 한 함수 (S2·S3·S4 · 2절)

`applyLocalCamera(callId, on)` — 엔진 안 유일한 함수:

| 상황 | 동작 |
|---|---|
| 끄기 (입장 후) | `muteLocalVideoStream(true)` → `enableLocalVideo(false)`. 상태 `localCameraOn=false` |
| 켜기 (입장 후) | `enableLocalVideo(true)` → `updateChannelMediaOptions(publishCameraTrack=true)` → `muteLocalVideoStream(false)` → 내 미리보기 다시 붙이기. 상태 `true` |
| 입장 전 탭 (발신 연결 중) | 상태만 바꾼다. **입장 함수가 이 상태를 읽어**, 꺼짐이면 입장 옵션 `publishCameraTrack=false` 로 들어가고 `enableLocalVideo(false)` 를 적용한다 |
| 입장 (모든 통화 시작) | 상태가 켜짐이면 `enableLocalVideo(true)`·`muteLocalVideoStream(false)` 를 **명시적으로** 불러 지난 통화의 값을 지운다 (S4, 마이크 초기화 E:159 와 같은 자리) |
| SDK 반환값 < 0 | 상태를 되돌리고 기록 (`camera_apply_failed`). 화면은 상태대로 다시 그림 |

- 버튼 처리(화면·Android PiP 버튼)는 `applyLocalCamera` 결과만 반영한다. 직접 SDK 를 부르지 않는다.

### 4-3. 다시 켜지는 경로 막기 (S3)

| 경로 | 처리 |
|---|---|
| iOS `restartLocalMediaCapture` (권한 재허용) | 영상 부분은 `localCameraOn` 이 true 일 때만 실행하고, 4-2 의 켜기 절차를 쓴다 (X2 함께 해소) |
| iOS `attachLocalPreviewOnMain`·입장 중 `startPreview` (Engine:340-347, 467) | `localCameraOn=false` 이면 `startPreview` 와 미리보기 붙이기를 건너뛰고 기록만 한다 |
| Android `reattachLocalPreviewIfNeeded` (E:342-408) | 판단 기준을 화면 필드에서 보관소 값으로 바꾼다 |
| Android 입장 중 `startPreview` (E:171-179, 199-205) | 꺼짐이면 건너뛴다 |

### 4-4. 내 화면 표시 — 한 함수 (F1·S5)

- 「카메라 꺼짐 칸」은 미리보기 칸 **안이 아니라 형제 뷰**로 둔다. 미리보기를 다시 붙여도 지워지지 않게 하기 위해서다.
- `applyLocalVideoPresentation()` 하나가 결정한다: 영상 단계 여부 × `localCameraOn` × iOS 화면 바꾸기(`localIsMain`) × PiP.
  - 미리보기 보임, 「꺼짐 칸」 보임, 둘 다 숨김 중 하나를 고른다.
- 3-1 S5 에 적은 iOS 7곳·Android 4곳의 직접 표시 변경은 **모두 이 함수 호출로 바꾼다**.
- 꺼져 있는 동안 **카메라 전환 버튼은 비활성**으로 한다 (웹 call-v4-view-model.ts:246 과 같음).

### 4-5. 상대 카메라 표시 (F2·S7·S8·S9)

- **엔진 콜백**: iOS `remoteVideoStateChangedOfUid` 를 추가한다. Android `onRemoteVideoStateChanged` 는 기존 분기를 유지하고 판정만 추가한다.

  | 신호 | 처리 |
  |---|---|
  | STOPPED + 사유 5 | `remoteCameraOn=false` |
  | STARTING·DECODING, 또는 사유 6 | `remoteCameraOn=true` |
  | FROZEN(1·8)·사유 7(퇴장)·사유 0 | **바꾸지 않음** — 네트워크 표시·종료 처리가 기존대로 맡음 |

- **전체 화면**: 상대 영상 칸 위에 형제 뷰로 「상대 꺼짐 표시」(아바타 이니셜·이름·문구)를 둔다. 4-4 와 같은 방식으로 한 함수에서 정한다. iOS 화면 바꾸기(상대가 작은 칸) 때는 작은 칸에도 표시한다.
- **iOS PiP**: 표시를 `pipContentViewController.view` 에 두고, 프레임 표시층보다 위에 둔다(VC:1466·1471 이후). 꺼짐이 되면 표시층을 비운다(`flush`). PiP 중 VC 가 없어도 엔진 → PipOwner 로 알린다(S9).
- **Android PiP**: 같은 Activity 이지만 PiP 에서는 `overlayRoot` 가 숨는다(A:2371-2373). 그래서 표시는 **`videoRoot` 안**에 둔다.
- **Android Dock**: 영상이 없으므로 변경하지 않는다.

### 4-6. 발신 화면 전환 조건 (S6)

- 「내 첫 프레임 도착」 대신 **「내 첫 프레임 도착 또는 내 카메라 꺼짐」** 을 쓴다.
- 「상대 첫 프레임 도착」 대신 **「상대 첫 프레임 도착 또는 상대 카메라 꺼짐 또는 연결 후 상대 입장 확인」** 을 쓴다.
- iOS VC:429-435, Android A:1358-1364 두 곳만 바꾼다. 1회용 플래그 구조는 유지한다.

### 4-7. 바뀌는 파일

| 플랫폼 | 파일 |
|---|---|
| iOS | `Call/Video/NativeVideoCallAgoraEngine.swift` (보관소·4-2·4-3·콜백) · `NativeVideoCallViewController.swift` (4-4·4-5·4-6, 필드 제거) · `NativeVideoCallUiHost.swift` (상태 알림 통로) · `NativeVideoCallPipOwner.swift` (PiP 표시) · `Localizable.strings` |
| Android | `nativevideo/NativeVideoCallAgoraEngine.java` · `NativeVideoCallActivity.java` · `NativeVideoCallActionReceiver`(변경 없음 예상, 같은 함수 사용) · `res/layout/activity_native_video_call.xml` · `res/values/strings.xml`·`values-ko/strings.xml` |
| 시험 | Android JVM 단위 시험: 상태 판정(STOPPED+5 만 꺼짐, FROZEN 은 무변경), 전환 조건. iOS 판정 함수는 순수 함수로 분리 |
| 검사 | `verify:call-surface-cta-ssot` 통과 (아이콘·순서·문구 키 양쪽) |
| QA 문서 | `docs/dibay-call-native-video-runtime-qa.md`·`docs/dibay-call-ios-native-video-qa.md` 에 카메라 끄기 행렬(10절) 고정 추가 (1-1 재발 방지) |

변경 없음: 웹(`lib/community-messenger/call*`) · 서버 통화 API · 푸시(VoIP/FCM) · CallKit · 음성 통화(`nativevoice/`, `Call/NativeVoice*`).

## 5. 다른 기능 영향 (전수)

| 기능 | 영향 | 처리·시험 |
|---|---|---|
| 발신 시작·세션 생성·VoIP/FCM·CallKit/Android 수신 화면 | 없음 (보관소 생성만 추가) | V14 |
| 입장(join) | 영상 상태 명시 초기화 추가 | V1·V9 |
| 발신 화면 전환·연결 화면 버튼 | 조건 추가 (4-6) | V3·V4 |
| 내 미리보기 재부착 (PiP 복귀·최소화·잠금 해제·알림 복귀) | 꺼짐이면 건너뜀 | V6·V7 |
| iOS 권한 보류 수락 뒤 재시작 | 꺼짐이면 영상 재시작 안 함 | V8 |
| iOS PiP 프레임 표시층 | 꺼짐 때 비움, 켜짐 때 다시 채움 | V5 |
| Android PiP 버튼·파라미터 | 같은 함수 사용, 상태는 보관소 | V5 |
| 신호 테두리·네트워크 표시 | 무변경. FROZEN 은 카메라 꺼짐으로 보지 않음 | V11 |
| 거절·취소·종료·부재중·통화 기록·heartbeat | 무변경 | V14 |
| 음성 통화 (iOS 같은 공유 엔진) | 음성은 입장 때 `disableVideo`·`publishCameraTrack=false` 로 들어감 (Voice:98·107). 영상 다음 통화는 4-2 입장 초기화로 보장 | V10 |
| 웹 통화 상대 (브라우저) | 웹은 상대 영상 중단을 `user-unpublished` 로 이미 처리 (call-v4-agora.ts:117-127). 무변경 | NOT_PROVEN, 앱↔웹 영상 통화가 실제 쓰이는지 확인 못 함 |

## 6. 설치된 구 바이너리 호환

서버·신호 계약은 바뀌지 않는다. 표시는 Agora SDK 이벤트로만 한다.

| 보내는 쪽 → 받는 쪽 | 결과 (실기 전 NOT_PROVEN) |
|---|---|
| 새 → 새 | 양쪽 정상 |
| 구 → 새 | 구 버전 송출 중단만 해도 SDK 가 STOPPED+5 를 줌 → 새 앱이 「카메라 꺼짐」 표시 |
| 새 → 구 | 구 앱은 지금처럼 멈춘 장면. 다시 켜면 구 Android 는 STARTING/DECODING → 기존 setup 으로 재개(E:880-890), 구 iOS 는 같은 화면 뷰로 프레임 재개 예상 → V13 |

- 현재 설치 (adb·TestFlight 직접 확인): Samsung `52 / 1.2.6`, Xiaomi `40 / 1.2.6`, iPhone `1.2.2 (34)`.
- 운영 `user_devices.app_version` 분포는 구현 승인 후 읽기 전용으로 조회한다 (지금은 NOT_PROVEN).

## 7. Owner 결정 필요 (계약·지시에 없음)

SSOT §3 는 버튼만 정의한다.

1. 상대 화면 문구 — 제안: 아바타 이니셜·이름 + 「카메라 꺼짐」 (웹 `cm_ui_camera_off` 와 같은 말, 영어 「Camera off」).
2. 내 작은 화면 — 제안: 어두운 칸 + 카메라 꺼짐 아이콘, 문구 없음.
3. 카메라 장치까지 끄기 (`enableLocalVideo(false)`) — 제안: 끈다 (iOS 초록 점·사생활). 다시 켤 때 지연은 V2 로 실측한다.

## 8. 회귀 위험과 대응

| 위험 | 대응 |
|---|---|
| 다시 켰는데 상대에게 영상이 안 나감 (공개 설정 누락) | 4-2 에 `updateChannelMediaOptions` 포함, V2 에서 상대 화면으로 확인 |
| 2절 (a) `startPreview` 가 꺼진 캡처를 다시 켬 | 4-3 에서 꺼짐 중 `startPreview` 호출 자체를 막음 |
| 연결 직후 상대 「꺼짐」이 깜빡임 | STOPPED+5 만 꺼짐으로 봄. 사유 0(초기)은 무시. V1 기기 로그 |
| 통화 화면 레이아웃 회귀 (표시 함수로 모으는 과정) | 기존 표시 조건을 표로 옮겨 시험(V3·V6), 영상 녹화 프레임으로 판정 |
| 다음 통화가 꺼진 채 시작 | 4-2 입장 초기화, V9 |

## 9. 롤백

앱 수정이라 Vercel 롤백으로 되돌아가지 않는다. revert → 다음 빌드 번호로 재빌드. 그래서 스토어 제출 전 아래 행렬 PASS 가 조건이다.

## 10. 실기 검증 행렬

공통 기록:
- 매 시험 빌드 번호·PHT 시각·기기 로그 파일(지우지 않음).
- 화면 판정은 **녹화 프레임**으로 한다.
- 기본 조합은 iPhone ↔ Samsung, 양방향.

| # | 시험 | 기대 |
|---|---|---|
| V1 | 영상 연결 직후 | 「꺼짐」 깜빡임 없음 |
| V2 | 연결 후 끄기 → 켜기 (양쪽) | 끈 쪽: 꺼짐 칸·iOS 초록 점 꺼짐. 받는 쪽: 「카메라 꺼짐」. 켜면 양쪽 영상 재개 (지연 실측) |
| V3 | 발신자가 **연결 전** 끄기 | 상대에게 영상 안 나감, 연결 후 화면이 「거는 중」에 멈추지 않음 |
| V4 | 수신자가 연결 직후 끄기 (발신자 전환 전) | 발신자 화면 전환 정상 |
| V5 | 꺼진 상태로 PiP (iOS·Android), Android PiP 카메라 버튼 | PiP 에도 「꺼짐」, 마지막 장면 멈춤 없음, 버튼 상태 일치 |
| V6 | 꺼진 상태로 PiP → 전체 화면 복귀 / iOS 최소화 복귀 / 잠금 해제 | 버튼·칸이 「꺼짐」 유지, 카메라 다시 켜지지 않음 |
| V7 | Android 진행 중 알림 탭 복귀 (Activity 새로 생성) | 「꺼짐」 유지 |
| V8 | iOS 권한 미정 상태로 수락 → 끄기 → 앱 복귀 (권한 재시작 실행) | 카메라 다시 켜지지 않음 |
| V9 | 꺼진 채 통화 종료 → 바로 영상 재발신 | 새 통화는 카메라 켜진 채 시작 |
| V10 | 꺼진 채 종료 → 음성 통화 → 영상 통화 | 모두 정상 |
| V11 | 네트워크 나쁨 (Wi-Fi 끄기·약한 신호) | 「카메라 꺼짐」 아닌 기존 신호 표시만 |
| V12 | Android 11~13 기기(Xiaomi)에서 PiP 중 끄기·켜기 | 카메라 재개 (X6 확인) |
| V13 | 구 바이너리(Xiaomi 40) ↔ 새 빌드, 양방향 끄기·켜기 | 6절 표대로 |
| V14 | 회귀: 영상 발신·수신·거절·벨 중 취소·통화 중·무응답·종료 후 즉시 재발신 | 기존과 같음 (통화 규정 5번 최소 행렬) |

## 11. 반영 방식

- 통화만 단독 PR 1개 (iOS·Android 같은 원인, 카메라 상태만).
- X1~X6 은 넣지 않는다 (X2 는 4-3 으로 자연 해소).
- **자동 병합 등록 안 함** — 통화 변경 예외. 실기 행렬 PASS 후 Owner 확인을 받고 병합한다.
- 빌드 번호는 설치용 빌드 때 1회 올린다. **사용자 버전(1.2.x)은 바꾸지 않는다.**
- 지금 App Store 심사 중인 1.2.2 (34) 에는 들어가지 않는다.

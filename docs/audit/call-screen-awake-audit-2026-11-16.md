# 통화 화면 자동 꺼짐 — 레거시 원본 분석 · DIBAY 구조 결함 · 설계안 (2026-11-16)

상태: **감사·설계만 (코드 변경 없음)**. 통화 변경 규정 3번에 따라 Owner 승인 전 구현 금지.
기준 코드: main `f95353056`. 레거시: Telegram 공개 원본 master (2026-11-16 23:50 PHT 조회, Android `DrKLO/Telegram` · iOS `TelegramMessenger/Telegram-iOS`).

---

## 1. 레거시(Telegram) 원본 — 확인한 사실만

### 1-1. Android

| 항목 | 원본 위치 | 사실 |
|---|---|---|
| 발신 시 통화 화면 | `VoIPHelper.java:233` | 발신 시작 즉시 `LaunchActivity` 를 `voip` 동작으로 열고 → `LaunchActivity.java:3406` `VoIPFragment.show()` |
| 통화 화면 창 | `VoIPFragment.java:429-431` | 통화 화면은 Activity 위에 붙이는 별도 창(`wm.addView`) |
| 화면 유지 | `VoIPWindowView.java:185-191` | 그 창의 플래그에 `FLAG_KEEP_SCREEN_ON`·`FLAG_SHOW_WHEN_LOCKED`·`FLAG_TURN_SCREEN_ON` **고정**. 상태(벨·연결)·종류(음성·영상)·방향(발신·수신)에 따라 바꾸는 코드 없음 |
| 화면 유지 해제 | `VoIPFragment.java:473` `windowView.finish()`, `3107` `wm.removeView` | 창이 사라지면 플래그도 같이 사라짐(별도 해제 코드 없음) |
| 뒤로 가기 | `VoIPFragment.java:447-475` | 영상이면 앱 안 PiP 창으로 전환, **음성이면 통화 화면을 닫음** (`canSwitchToPip` 조건 2126행: 영상일 때만) |
| 영상 PiP 창 | `VoIPPiPView.java:214-218` | PiP 창에도 `FLAG_KEEP_SCREEN_ON` 고정 |
| 근접 센서 등록 | `VoIPService.java:4997 configureDeviceForCall()` ← `startOutgoingCall()`(1110) · `acceptIncomingCall()`(4462) | **발신 시작·수락 순간**부터 등록. 해제는 서비스 종료 `onDestroy()`(4283~4302) |
| 근접 동작 | `VoIPService.java:5108-5140` | 근접이면 `PROXIMITY_SCREEN_OFF_WAKE_LOCK` 잡아 화면 끔, 멀어지면 놓음. **제외 조건**: 상대·내 영상 켜짐, 출력이 수화기가 아님, 유선 이어폰, 스피커, 블루투스 |
| 이어폰 연결 시 | `VoIPService.java:477-497` | 근접 화면 꺼짐 즉시 해제 |

**정리 (Android 규칙)**
- R1 통화 화면(전체 화면)이 떠 있는 동안 → 화면 유지. 발신 벨부터 종료까지, 음성·영상 같음.
- R2 영상 PiP 창이 떠 있는 동안 → 화면 유지.
- R3 음성은 통화 화면을 벗어나면(채팅 등) → 화면 유지 없음, 기기 설정대로 꺼짐.
- R4 음성 + 수화기 출력 → 근접 센서로 귀에 대면 꺼지고 떼면 켜짐. 통화 화면이 보이든 안 보이든 통화 중 내내 동작.

### 1-2. iOS

| 항목 | 원본 위치 | 사실 |
|---|---|---|
| 통화 화면 생성 | `SharedAccountContext.swift:1298` | 현재 통화가 생기면(발신·수신 모두) `CallController` 생성 |
| 자동 잠금 해제 | `CallController.swift:426` `viewDidAppear` → `pushIdleTimerExtension()` | 통화 화면이 **보이는 순간** 자동 잠금 끔 |
| 자동 잠금 복원 | `CallController.swift:436` `viewDidDisappear` | 통화 화면이 **사라지는 순간** 복원 |
| 구현 | `AppDelegate.swift:912-926` | 요청 목록이 비면 `isIdleTimerDisabled=false`, 하나라도 있으면 `true` (여러 화면이 동시에 요청해도 안전한 참조 계수) |
| 근접 센서 | `PresentationCall.swift:445-448` | **CallKit 을 쓰지 않을 때만** 앱이 근접 센서 등록. CallKit 을 쓰면 앱은 근접을 켜지 않음 |

**정리 (iOS 규칙)**: 통화 화면이 보이는 동안 자동 잠금 끔(단계·종류 구분 없음). 근접은 CallKit 통화면 앱이 관여하지 않음.
CallKit 통화에서 시스템이 근접을 대신 켜는지에 대한 Apple 공식 문서는 찾지 못함 → **실기 측정 항목**(§5 V12).

---

## 2. DIBAY 현재 구조 (확인한 코드)

### 2-1. Android — 화면 유지를 거는 곳이 5군데, 규칙이 제각각

| # | 위치 | 거는 조건 | 해제 |
|---|---|---|---|
| a | `NativeVoiceCallActivity.java:267-271` | **onCreate 1회**, 발신 모드면 `FLAG_KEEP_SCREEN_ON`. 수신 모드면 `applyIncomingWakeFlags()` | 창 소멸 |
| b | `NativeVoiceCallActivity.java:643-654` `applyIncomingWakeFlags` | Android 8.1+ 는 `setShowWhenLocked`·`setTurnScreenOn` 만 (유지 없음). 8.0 이하만 유지 | — |
| c | `NativeVideoCallActivity.java:466-468`, `1017-1031` | 수신 모드만 켜기·잠금 위 표시. **유지 없음.** 발신 모드는 아무것도 없음 | — |
| d | `ScreenAwakeBridge.java` ← `NativeVideoCallRuntime.java:1171-1177` | **영상 + CONNECTED 상태**일 때만, 그 순간 앞에 있는 Activity 에 유지 | ENDING·ENDED·FAILED |
| e | `IncomingCallActivity.java:874-890`, `MainActivity.java:2638-2657` | 다른 수신 경로. IncomingCallActivity 는 버전 무관 유지, MainActivity 는 8.0 이하만 유지 | 창 소멸 |

근접 센서: 저장소 전체에 `PROXIMITY` **0건**.

### 2-2. iOS

| 위치 | 조건 |
|---|---|
| `ScreenAwakeBridge.swift` ← `NativeVideoCallViewController.swift:231-240` | **영상 + connected** 일 때만 `isIdleTimerDisabled=true` |
| `NativeVoiceCallViewController.swift` | 자동 잠금 관련 코드 없음 (viewDidAppear 없음, viewDidDisappear 는 타이머 정지만) |
| 근접 | 코드 없음. 음성 통화는 CallKit 사용 (`CallKitProvider.swift:604-624` 발신 보고 · 맥 제외) |

### 2-3. Windows (`windows/DibayDesktop`)
화면 유지 코드 0건(`SetThreadExecutionState`·`DisplayRequest` 없음). 레거시 Desktop 원본은 이번에 분석하지 않음 → 범위 밖, 보고만.

---

## 3. 구조적 결함 (원인 단위)

| # | 결함 | 원인 | 사용자 증상 | 판정 |
|---|---|---|---|---|
| **K1** | 화면 유지의 기준이 「통화 화면이 보이는가」가 아니라 「**영상이고 연결됐는가**」 | 설계 문서 `docs/call/native-video-screen-awake-bridge-lock.md` 가 「acquire on CONNECTED」로 정함. 레거시는 상태와 무관하게 통화 창 자체에 유지 | 영상 발신 벨 중 꺼짐(Owner 지목 증상) · iOS 음성 전 단계 꺼짐 · iOS 영상 벨 중 꺼짐 | **FAIL** |
| **K2** | 화면 유지 소유자가 하나가 아님 (Android 5군데, 규칙 다름) | 음성은 Activity 가 onCreate 에서 1회 결정, 영상은 상태 브리지, 수신은 경로마다 별도 | 같은 음성 통화인데 **건 쪽은 유지, 받은 쪽은 꺼짐** · 같은 수신 벨인데 경로(a·c·e)·Android 버전(8.0 이하/8.1 이상)에 따라 다름 | **FAIL** |
| **K3** | 수락해도 화면 규칙이 바뀌지 않음 | (a) 가 onCreate 1회뿐, 수락 후 `applyState` 는 플래그를 건드리지 않음 | Android 받은 음성 통화 연결 후 꺼짐 | **FAIL** (K2 의 한 증상) |
| **K4** | 근접 센서 소유자 없음 (Android) | 구현 자체가 없음 | 음성 수화기 통화 중 화면이 켜진 채 귀·볼에 버튼(종료·음소거·스피커)이 눌릴 수 있음. K2·K3 를 고쳐 유지를 늘리면 이 위험이 커짐 → **같이 고쳐야 함** | **FAIL** |
| **K5** | iOS 는 영상 연결 외 자동 잠금 해제 경로가 없음 | K1 과 같은 원인, 음성 화면은 생명주기 연결 자체가 없음 | iOS 음성 발신·수신·연결, 영상 발신 벨 모두 기기 설정대로 잠김 | **FAIL** |

**기기마다 다른 점**: 꺼짐 시간 설정값(15초·30초·1분 등)만 다르다. 앱이 유지를 걸면 설정값과 상관없이 꺼지지 않는다. 위 결함은 기기 차이가 아니라 **앱이 유지를 걸지 않는 구간이 있어서** 생긴다.
측정 조건: Xiaomi 24076RP19G · Samsung SM-M156S 모두 `screen_off_timeout`=30000, 1.2.7 설치 (2026-11-16 23:40 PHT adb 조회). 벨 최대 30초(`NativeVideoCallRuntime.MISSED_TIMEOUT_MS`·`NativeVoiceCallRuntime.MISSED_TIMEOUT_MS`).

---

## 4. 설계안 (레거시와 같은 구조)

### 4-1. 규칙 (단일 정의)

| 규칙 | 내용 | 레거시 근거 |
|---|---|---|
| S1 | **통화 전체 화면이 보이는 동안 화면 유지** — 준비·발신 벨·수신 벨·연결 모두, 음성·영상, 발신·수신 구분 없음 | Android R1 · iOS viewDidAppear |
| S2 | **영상 통화 축소 표면(PiP·Dock)이 보이는 동안 화면 유지** — 현재 연결 영상 동작 유지 | Android R2 |
| S3 | **음성 통화 축소(Dock·PiP)는 유지 안 함** — 기기 설정대로 | Android R3 (레거시 음성은 화면을 벗어나면 유지 없음) |
| S4 | **해제 = 표면이 사라지는 순간** (종료·닫힘·백그라운드). 상태 이벤트로 해제하지 않음 | 창 제거 / viewDidDisappear |
| S5 | **근접(Android)**: 음성, 발신 시작·수락부터 종료까지. 출력이 수화기이고 영상·유선 이어폰·블루투스·스피커가 아닐 때만 귀에 대면 화면 끔 | VoIPService 4997·5108~5140 |
| S6 | **근접(iOS)**: CallKit 통화는 앱이 켜지 않음(레거시 동일). 실기 V12 로 시스템 동작 확인. 맥은 센서 없음 → 해당 없음 | PresentationCall 445~448 |
| S7 | 잠금 위 표시·화면 켜기(`setShowWhenLocked`·`setTurnScreenOn`)는 **수신 벨 표면만** — 지금 그대로 | VoIPWindowView 플래그 |

### 4-2. Android 구현 구조

1. **통화 화면 = 창 단위 유지 (레거시와 같은 방식)**
   - `NativeVoiceCallActivity` · `NativeVideoCallActivity` onCreate 에서 **모드와 상관없이** `FLAG_KEEP_SCREEN_ON` 을 창에 건다. 창 플래그라 Activity 가 안 보이거나 끝나면 OS 가 자동으로 적용을 멈춤 → 별도 해제 불필요(S4).
   - 수신 모드의 `applyIncomingWakeFlags()` 는 잠금 위 표시·켜기만 남긴다(S7). 버전별 분기에서 유지 플래그를 빼고 위 1곳에서만 건다 → K2·K3 해소.
   - 음성 PiP 진입 시 유지 플래그를 빼고, PiP 해제(전체 화면 복귀) 시 다시 건다(`onPictureInPictureModeChanged`, 385행) → S3.
2. **영상 축소(Dock) = 기존 `ScreenAwakeBridge` 유지** — 앞에 있는 Activity(MainActivity)에 거는 현재 연결 영상 경로 그대로(S2). 바꾸지 않는다.
   - 주의: 브리지는 다른 Activity 로 옮겨 걸 때 이전 Activity 의 플래그를 지운다(`applyToActivity`). 영상 통화 화면으로 돌아오면 `onActivityResumed` 재적용 + 1번의 onResume 재적용으로 복구 → **영상 Activity 는 onResume 에서도 다시 건다**.
3. **근접 = 새 소유자 1개** `call/NativeCallProximityOwner.java`
   - `PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK`(공개 API) 사용.
   - 시작: 음성 발신 시작(`NativeVoiceCallRuntime` 발신 세션 생성) · 수락. 끝: 종료·실패·세션 정리(`DibayActiveCallSessionManager` 정리 경로, 232행 옆).
   - 조건: 출력 경로가 수화기일 때만 잡고, 스피커·유선·블루투스로 바뀌면 즉시 놓는다. 출력 경로는 Agora `onAudioRouteChanged` 이벤트 + `NativeVoiceCallAgoraEngine.setEnableSpeakerphone`(139행) 결과로 받는다. 놓을 때는 `RELEASE_FLAG_WAIT_FOR_NO_PROXIMITY`(귀에서 뗀 뒤 켜짐).
   - 영상 통화는 근접 사용 안 함(레거시 동일).
4. **(e) IncomingCallActivity·MainActivity 수신 경로**: 이미 유지(또는 8.0 이하만 유지). 이번 범위는 위 두 통화 Activity 로 한정하고 (e) 는 바꾸지 않는다. MainActivity 8.1+ 수신 경로가 실제 쓰이는지는 V11 로 확인 후 별도 보고.

### 4-3. iOS 구현 구조

1. `ScreenAwakeBridge.swift` 를 **참조 계수 방식**으로 바꾼다(레거시 `pushIdleTimerExtension` 과 같음): `push(owner) → 토큰`, `pop(토큰)`. 하나라도 있으면 `isIdleTimerDisabled=true`.
2. `NativeVoiceCallViewController` · `NativeVideoCallViewController`: `viewDidAppear` → push, `viewDidDisappear` → pop (S1·S4).
3. 기존 영상 connected 경로(PiP·Dock 재적용)는 별도 토큰으로 유지(S2). 음성 축소는 화면이 사라지므로 자동으로 S3.
4. 근접: 앱 코드 추가 없음(S6). V12 에서 CallKit 통화 수화기 근접이 꺼지지 않으면 그때 `UIDevice.isProximityMonitoringEnabled` 를 음성·수화기 동안만 켜는 안을 따로 올린다.

### 4-4. 바뀌는 파일 · 영향 · 호환 · 롤백

| 항목 | 내용 |
|---|---|
| 바뀌는 파일 | Android `NativeVoiceCallActivity.java`, `NativeVideoCallActivity.java`, 새 `call/NativeCallProximityOwner.java`, `NativeVoiceCallAgoraEngine.java`(출력 경로 이벤트), `NativeVoiceCallRuntime.java`(근접 시작·끝 호출) · iOS `ScreenAwakeBridge.swift`, `NativeVoiceCallViewController.swift`, `NativeVideoCallViewController.swift` · 문서 `docs/call/native-video-screen-awake-bridge-lock.md` 규칙 갱신 |
| 잠금 문서 충돌 | 잠금 문서가 「DO NOT MODIFY (별도 승인)」로 묶은 `NativeVideoCallActivity`·`NativeVoiceCallActivity`·`NativeVoiceCallRuntime` 을 건드린다 → **이 설계 승인이 그 별도 승인**이어야 함 |
| 안 바뀌는 것 | 웹·서버 코드, 발신·수신·세션·푸시·CallKit 보고·종료 판단, Agora 연결 |
| 영향 경로 | 발신 시작(준비 화면), 수신 벨(잠금 위 포함), 수락, 연결, PiP·Dock 전환·복귀, 종료·거절·취소·부재중·대기 통화 전환, 스피커·이어폰·블루투스 전환 |
| 구 바이너리 호환 | 네이티브만 바뀌므로 설치된 구 버전은 지금 동작 그대로. 서버 계약 변경 없음 → 섞여도 통화 자체 영향 없음 |
| 배포 구분 | **네이티브 — 재빌드·재설치 필요** (Android versionCode·iOS build 1회 증가는 빌드 시점) |
| 회귀 위험 | ① 근접 미해제로 종료 후 화면 꺼진 채 남음 → 세션 정리 경로 3곳에서 놓음 + 실기 V6 ② 브리지가 영상 Activity 플래그를 지운 뒤 복귀 시 재적용 누락 → onResume 재적용 + V8 ③ 음성 PiP 플래그 전환 누락 → V9 |
| 롤백 | PR 되돌리기 → 재빌드. 웹 롤백으로는 되돌릴 수 없음(네이티브) |
| 커밋 | 통화 단독 PR 1개 (통화 변경 규정 4번) |

---

## 5. 실기 검증 항목 (구현 후 · 각 항목 Production SHA·설치 버전·PHT 시각 기록)

| # | 항목 | 기대값 |
|---|---|---|
| V1 | Android→iPhone 영상 발신, 30초 무응답 | 발신 쪽 벨 내내 화면 켜짐 → 부재중 종료 후 기기 설정대로 |
| V2 | iPhone→Android 영상 발신 무응답 | 위와 같음(iOS) |
| V3 | 음성 발신 무응답 (양 플랫폼) | 벨 내내 켜짐 |
| V4 | 음성 수신 → 수락 → 2분 통화 (스피커) | 받은 쪽도 계속 켜짐 |
| V5 | 음성 수화기 통화 중 귀에 댐/뗌 (Android) | 대면 꺼짐, 떼면 켜짐, 볼 터치로 버튼 안 눌림 |
| V6 | V5 상태에서 상대가 종료 | 종료 즉시(귀에서 뗀 뒤) 화면 정상, 꺼진 채 남지 않음 |
| V7 | 수화기→스피커·블루투스·유선 이어폰 전환 중 근접 | 전환 즉시 근접 꺼짐 해제 |
| V8 | 영상 연결 → Dock(채팅) → 통화 화면 복귀 | 전 구간 켜짐 |
| V9 | 음성 연결 → PiP·Dock | 축소 상태에선 기기 설정대로 꺼짐, 전체 화면 복귀 시 다시 유지 |
| V10 | 수신 벨 (잠금 상태·꺼짐 설정 15초 기기) | 벨 내내 켜짐 |
| V11 | 대기 통화 전환, 통화 중(busy), 거절, 벨 중 취소 | 표면 사라지면 즉시 해제 |
| V12 | iPhone 음성 수화기 통화 중 귀에 댐 | 시스템이 화면 끄는지 확인 → 안 끄면 §4-3-4 추가안 |

---

## 6. 범위 밖 (보고만)

- Windows 앱: 통화 중 화면 유지 코드 없음. 레거시 Desktop 미분석.
- Mac(iOS 앱): `isIdleTimerDisabled` 가 맥 화면 잠자기를 막는지 미확인.

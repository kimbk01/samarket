# 대기 통화 전환 — 관찰 2건 원인·설계안 + 맥 통화 버튼 실기 (2026-11-15)

상태: **설계안 — Owner 승인 전 구현 금지** (통화 변경 규정 3번). 운영 기준 main `a11498088` (Android versionCode 57).
증거: Samsung q테스트1 (57) logcat `scratchpad/cw4/logcat-RFCY40PY2CA.txt`, 연속 녹화 `re57-cw6-tile2.jpg`·`re57-cw3-tile.jpg` (`call-waiting-device-verify-2026-11-15/`), 맥 앱 로그 `scratchpad/cw5/mac-log.txt`, 운영 DB `community_messenger_call_sessions`·`community_messenger_call_events`.

## 1. 확인된 원인

### 1-1. 관찰 1 — 통화가 이어질 때 홈 화면이 보임 (CW6 0.27초, CW3 0.8초)
기기 로그 순서 (CW6, PHT):

| 시각 | 로그 | 의미 |
|---|---|---|
| 22:06:24.736 | `runtime_cleanup_start` (2244248d) | 진행 중 통화 정리 시작 |
| 24.763 | `scheduleTopResumedActivityChanged onTop=false NativeVoiceCallActivity t2240` | `cleanup()` 첫 줄 `NativeVoiceCallActivity.finishIfActive` → 통화 화면 닫힘 |
| 24.812 | `onTop=true LauncherActivity` | **홈 화면이 앞** |
| 24.913 | `incoming_fcm_received` (1f967d04) | `onCallCleanedUp` → 150ms 뒤 `promote` → `handleIncoming` |
| 24.987 | `foreground_visible_activity_start_skipped reason=not_foreground_unlocked` | 앱이 「안 보임」으로 판정 → 백그라운드 경로 |
| 25.017 | `incoming_notification_post_done` | 일반 수신 알림(heads-up) 게시 |
| 25.053 | `START ... NativeVoiceCallActivity ... BAL_ALLOW_GRACE_PERIOD` | 새 작업(t2241)으로 수신 화면 시작 |
| 25.080 | `onTop=true NativeVoiceCallActivity t2241` | 수신 화면 앞 (홈 노출 24.812~25.080) |

CW3 도 같은 순서: 34.965 통화 화면 닫힘 → 34.993 홈 → 35.536 정리 끝 → 35.712 `not_foreground_unlocked` → 35.801 새 통화 화면 (홈 노출 0.8초).

**원인 (코드):**
- `NativeVoiceCallRuntime.cleanup` / `NativeVideoCallRuntime.cleanup` 이 정리 **시작 시** 통화 화면을 닫는다 (`finishIfActive`, voice L992·L1027, video L985·L1021). 대기 통화가 있어도 똑같이 닫는다.
- 대기 통화 이어받기(`NativeCallWaitingPresenter.onCallCleanedUp` → 150ms → `promote`)는 정리가 **끝난 뒤** 새 화면을 연다. 그 사이 앱 화면이 없다.
- `promote` → `handleIncoming` 의 「앱 보임」 판정은 `MainActivity.isAppVisibleForIncomingCall()` (= MainActivity 만) 이라, 통화 화면에서 넘어온 경우도 「백그라운드」로 판정된다.

**레거시 기준 (AOSP Dialer `InCallPresenter.startOrFinishUi`, refs/heads/main L1472~1576):** 통화 화면(InCallActivity)은 `newState == InCallState.NO_CALLS` 일 때만 `attemptFinishActivity()` 한다. 진행 중 통화가 끊겨도 대기 통화(INCOMING)가 남아 있으면 상태가 INCOMING 으로 바뀔 뿐 화면은 닫지 않고 같은 Activity 가 수신 화면으로 바뀐다.

### 1-2. 관찰 2 — 전환 순간 알림이 겹침
(a) **대기 알림이 시끄러운 알림으로 다시 올라감 (0.13초):** 24.763 통화 화면 onPause → 띠가 `setCallScreenVisible(false)` → 아직 대기 중이라 `showNotification(quiet=false)` (24.793, 진행 중 통화가 이미 정리돼 `fsi_unavailable`) → 24.913 promote 의 `clearPresentation` 으로 지워짐. 원인은 1-1 과 같다(대기 중에 통화 화면이 닫힘).

(b) **수신 화면 위에 일반 수신 heads-up 「수락 / 거절」:** 1-1 의 백그라운드 경로가 수신 알림(heads-up)을 먼저 올리고(25.017) 화면을 띄운 뒤 1초 유예로 지운다(`incoming_notification_suppress_grace_scheduled graceMs=1000`). 앞 화면 경로(`startForegroundVisibleActivity`)였으면 알림을 올리지 않는다.

### 1-3. 새로 찾은 결함 — 통화 화면 보임 상태가 틀린 값으로 남음 (작업자 #329 결함)
- CW6: 25.211 새 수신 화면 onResume → `visible=true`, 25.349 **옛 통화 화면 onDestroy(detach)** → `visible=false`. 이후 앞 화면은 새 통화 화면인데 presenter 는 「안 보임」으로 기억.
- `NativeCallWaitingPresenter.callScreenVisible` 이 전역 boolean 하나라, 늦게 끝나는 옛 Activity 가 새 Activity 값을 덮는다. 다음 onResume 전까지 틀린 값이 유지된다.
- 영향: 이 상태에서 같은 화면으로 통화를 받아 진행 중일 때 대기 통화가 오면 시끄러운 FSI 알림 + 띠 = **알림 2개 겹침(56 FAIL 과 같은 증상)**. 실기에서 재현은 아직 안 함(NOT_PROVEN) — 로그로 값이 틀린 것만 확인.

## 2. 설계안 (원인별, Owner 승인 필요)

### 설계 A — 보임 상태를 화면별로 기록 (1-3)
- `NativeCallWaitingPresenter`: `callScreenVisible` boolean 대신 「앞에 있는 통화 화면」 집합(띠 객체 식별자). onResume(PiP 아님) = 추가, onPause·PiP·detach = **자기 것만** 제거. 보임 = 집합이 비어 있지 않음.
- 바뀌는 파일: `NativeCallWaitingPresenter.java`, `NativeCallWaitingBanner.java` (`reportVisibility` 가 자기 자신을 넘김).

### 설계 B — 대기 통화가 있으면 통화 화면을 닫지 않고 이어받기 (1-1·1-2)
Dialer 와 같이 「통화가 하나도 없을 때만 통화 화면을 닫는다」.
1. `cleanup()` (음성·영상): 그 통화의 화면을 닫기 전에 `NativeCallWaitingPresenter.hasPendingHandover()` 확인. 대기 통화가 있으면 닫지 않고 화면을 「통화 종료 중」 상태로 둔다(버튼 잠금). 대기 통화가 없으면 지금과 같이 닫는다.
2. `promote()`: 이어받을 화면이 남아 있으면 `handleIncoming` 에 「통화 화면에서 넘어옴」을 넘겨 **앞 화면 경로**(`startForegroundVisibleActivity`)로 띄운다 → 일반 수신 알림·백그라운드 시작을 쓰지 않음.
   - 같은 종류(음성→음성, 영상→영상): singleTask 라 같은 Activity 가 `onNewIntent` 로 새 callId 에 붙는다(`bindIntent` → `applyState(RINGING)` 또는 accept 시 CONNECTING). 홈이 보일 틈이 없다.
   - 다른 종류(음성↔영상): 새 Activity 를 먼저 띄우고, 새 화면이 앞에 온 뒤 옛 화면을 닫는다.
3. 안전장치: 이어받기를 기다리는 화면은 대기 통화가 끝나면(취소·무응답·다른 기기 응답 — `onTerminal`) 바로 닫는다. 정리 후 1.5초 안에 promote 가 없으면 닫는다(화면이 남아 멈추는 것 방지).
4. 1-2 (a): 1번으로 대기 중 통화 화면이 onPause 되지 않으므로 시끄러운 대기 알림 재게시가 생기지 않는다. 추가로 `setCallScreenVisible(false)` 때 진행 중 통화가 이미 없으면(이어받기 직전) 알림을 다시 올리지 않는다.
- 바뀌는 파일: `NativeVoiceCallRuntime.java`·`NativeVideoCallRuntime.java` (cleanup·handleIncoming 진입 인자), `NativeVoiceCallActivity.java`·`NativeVideoCallActivity.java` (이어받기 대기 상태·onNewIntent 재바인딩 시 통화 시간·버튼 초기화), `NativeCallWaitingPresenter.java`, 계약 테스트.
- 영향받는 경로: 일반 통화 종료(대기 없음 — 지금과 같아야 함), 종료 후 받기(CW3), 진행 중 상대 먼저 종료(CW6), 대기 중 취소·무응답(CW4·CW5), PiP 상태에서 종료, 화면 꺼짐·잠금 화면, 최근 앱 통화 카드(`CallRecentsCardPresenter`), 통화 시간(`CONNECTED_AT_BY_CALL`), `NativeCallVisibleSurfaceOwner` 소유권, onDestroy 의 `SURFACE_LOST` 종료 판정(옛 화면이 destroy 되지 않게 되므로 그 경로는 대기 없는 경우에만 남음).
- 회귀 위험: 이어받기 대기 화면이 남는 경우(안전장치로 막음), 옛 통화 시간·음소거 상태가 새 통화에 남는 경우(재바인딩 때 초기화), 영상 화면의 카메라 미리보기가 새 수신 화면에 남는 경우.
- 구 바이너리 호환: 서버·웹 무변경. 네이티브만 → 새 빌드(versionCode 58)부터 적용, 57 이하 동작은 그대로.
- 롤백: 이 PR revert (네이티브 빌드 필요).

### 실기 항목 (구현 후, 같은 녹화 방식)
- T1 CW6: 홈 0 프레임, 수신 heads-up 0 프레임, 대기 알림 재게시 로그 없음.
- T2 CW3: 홈 0 프레임, 새 통화 연결.
- T3 CW6 뒤 그 화면에서 수락 → 통화 중 → 새 대기 통화: 띠만, 시스템 알림 0 (1-3 재현 시험).
- T4 대기 없는 일반 종료: 지금처럼 화면 닫힘(회귀).
- T5 CW2·CW4·CW5 회귀, PiP 상태 종료, 화면 꺼짐 대기.
- T6 음성 중 영상 대기·영상 중 음성 대기(다른 종류 이어받기).

## 3. 맥(김봉기, com.dibay.ph Debug) 통화 버튼 실기 — 22:14~22:19 PHT
상대 Samsung q테스트1 (57). 판정 근거 = 맥 앱 로그(`/usr/bin/log stream`, pid 77759) + 양쪽 화면 캡처 + 운영 DB.

| 항목 | 판정 | 증거 |
|---|---|---|
| 음성 스피커 켜기·끄기 | PASS(적용) · 소리 NOT_PROVEN | 22:16:51.872 `speaker_toggle enabled=true result=0` → `audio_route_applied speaker=true confirmed=true`, 54.119 끄기 같은 형식. 버튼 초록/회색 바뀜 |
| 음성 음소거·해제 | PASS(적용) · 상대가 안 들리는지 NOT_PROVEN | 22:16:47.386 `native_voice_mic_mute_applied muted=true result=0`, 49.636 `muted=false`. 버튼 「음소거 해제」 표시 바뀜 |
| 음성 화면 「영상」 버튼 | 설계상 비활성 | `NativeVoiceCallViewController.swift:100-103` disabled·누를 수 없음 (iPhone 같음) |
| 영상 카메라 끄기 | PASS | 22:18:16.460 `native_video_camera_off_applied` → Samsung 화면 「카메라 꺼짐」+이니셜 (`call-waiting-device-verify-2026-11-15/mac-video-camera-off.jpg`) |
| 영상 카메라 다시 켜기 | PASS | 22:18:31.758 `camera_on_applied`·`local_camera_publish_success` → Samsung 에 맥 영상 다시 보임 (`call-waiting-device-verify-2026-11-15/mac-video-camera-on.jpg`) |
| 영상 음소거·해제 | PASS(적용) · 소리 NOT_PROVEN | 22:18:34.501 `native_video_mic_mute_applied muted=true result=0`, 58.106 `muted=false` |
| 영상 카메라 전환 | **FAIL(누르면 아무 변화 없음)** | 22:19:00.359 `camera_facing_switch result=0` 이지만 화면 변화 없음. 이 맥 카메라 1개(`system_profiler`: 「MacBook Pro 카메라」만) |
| 영상 스피커 버튼 | 없음(설계상) | iOS 영상 화면에 스피커 버튼 없음 (iPhone 같음) |
| 첫 음성 발신 9초 만에 취소 | **FAIL(원인 확인 못 함)** | 225586fb: 22:14:39.3 생성 → 22:14:48.2 `canceled` (actor = 김봉기, 운영 call_events). 그 사이 맥을 누르지 않음. 당시 맥 로그 미수집 → 원인 NOT_PROVEN. 바로 다시 걸었을 때 재현 안 됨 |

### 설계 C — 카메라 1개 기기에서 전환 버튼 숨김 (맥 FAIL)
- 원인: `NativeVideoCallViewController` 가 카메라 수와 상관없이 `cameraFlipButton` 을 항상 보인다. 맥(Designed for iPad)은 카메라 1개라 전환할 대상이 없다.
- 설계: 화면 준비 때 `AVCaptureDevice.DiscoverySession`(video) 기기 수가 2 미만이면 `cameraFlipButton` 을 숨긴다(레이아웃 자리도 뺌). 다른 앱(FaceTime·Telegram 맥)의 버튼 구성은 확인하지 않았다(NOT_PROVEN). iPhone·iPad 는 카메라 2개 이상이라 지금과 같음.
- 바뀌는 파일: `ios/App/App/Call/Video/NativeVideoCallViewController.swift` 1개. iOS build 번호 증가 필요. 서버·Android 무변경.
- 실기: 맥 영상 통화 버튼 3개(카메라·마이크·종료), iPhone 영상 통화 전환 버튼 그대로.

### 9초 취소 — 다음 재현 때 원인 확인 방법
맥 앱 로그를 실기 내내 수집(`/usr/bin/log stream --predicate 'processID == <pid>'`)해 두고, 재현되면 `canceled` 직전 `[DIBAY_CALL]` 줄로 취소 출처를 확정한 뒤 설계한다. 원인 확인 전 수정하지 않는다.

## 4. 구현·실기 결과 (Owner 「A·B·C 구현 승인」 2026-11-15)

- A·B: PR #330 → main `5f3e3470a` (Android versionCode 58). C: PR #331 → main `6f2e405b4` (iOS build 42).
- 조건: B = Samsung q테스트1 1.2.7 (58) 활성 1대(운영 user_devices 22:39:52 PHT), C = Xiaomi zxzx11 (53), A = 맥 김봉기. 판정 = 기기 로그 + 연속 녹화(screenrecord) 프레임 + 운영 DB.

| 항목 | 판정 | 증거 (PHT) |
|---|---|---|
| T1 CW6 (대기 중 C 먼저 종료) | PASS | 22:46:52.401 `handover_hold` → 52.647 `start_allowed handover=true` → 같은 작업에 `NEW_TASK\|CLEAR_TASK`(flg=0x10008000) → 53.285 `handover_release`. 0.1초 간격 40프레임에 홈 0·수신 heads-up 0, 「통화 종료 중」→ 수신 화면 (re58-t1b-tile). 첫 녹화는 12.7초에서 끊겨 전환 미포함 → 재시험 |
| T3 이어받은 화면에서 수락 뒤 새 대기 | PASS | 22:48:27.629 이후 `visible=false` 덮어쓰기 없음(설계 A). 22:49:20 새 대기 `quiet=true`, 녹화 띠만·시스템 알림 0, 띠 거절 22:49:25 → 200 (re58-t3-tile) |
| T2 CW3 (띠 종료 후 받기) | PASS(화면·DB) · 소리 NOT_PROVEN | 22:50:20.120 hold → 21.554 같은 작업 시작 → 22.163 수락 200, 「김봉기 통화 종료 중」→「zxzx11 연결 중」→「통화 중」, 홈 0 (re58-t2-tile) |
| T4 대기 없는 일반 종료 | PASS | 22:50:59 종료 → hold 기록 없음, 통화 화면 닫히고 앱 화면 (re58-t4-tile) |
| T5 CW2·CW5 회귀 | PASS | CW2 = T3 의 띠 거절. CW5 22:52:33.8 cancelled → 띠만 닫힘·통화 유지 (re58-t5-tile) |
| T6 음성 중 영상 대기 → C 종료 | PASS · 관찰 1 | 22:53:17.618 hold(voice) → 17.894 영상 화면 새 작업 → 18.537 음성 화면 정리. 홈 0. 다른 작업 사이 전환이라 시스템 전환 애니메이션(회색 바탕) 약 0.3초 (re58-t6-tile) |
| 화면 꺼짐·잠금 중 이어받기, PiP 중 종료, 이어받기 대기 중 대기 통화 취소, 5초 안전장치 | NOT_PROVEN | 미실시 |
| C 맥 카메라 전환 버튼 숨김 | **FAIL** | 맥 build 42(`6f2e405b4`) 23:01:33 `camera_flip_button_visibility visible=true` → 버튼 그대로. 이때 맥 카메라 2개(MacBook Pro + 연속성 카메라 「iPhonebk」 iPhone15,3, system_profiler 23:0x). 전환 23:02:21 `result=0` 이지만 상대(Samsung) 화면의 맥 영상 그대로 (re58-f01) |

### C FAIL — 원인과 수정 설계안 (Owner 승인 필요)
- 작업자 잘못: 맥이 카메라를 어떻게 보고하는지 재지 않고 「앞·뒤 카메라 둘 다 있으면 보임」으로 구현했다. 맥에 연속성 카메라(iPhone)가 잡히면 앞·뒤가 모두 보고돼 버튼이 남는다.
- 측정 사실: 맥에서는 카메라 1개(22:19, MacBook 만)일 때도, 2개(23:02, 연속성 카메라 포함)일 때도 `switchCameraFacing` 이 `result=0` 이지만 송출 영상이 바뀌지 않는다 → 맥에서는 카메라 수와 상관없이 전환이 동작하지 않는다.
- 설계 C′: 플랫폼 단일 정의 `DibayCallPlatformCapability` 에 `supportsCameraFacingSwitch = !isIOSAppOnMac`(위 실측 근거 기록)를 추가하고, `NativeVideoCallViewController` 는 `cameraFlipButton.isHidden = !DibayCallPlatformCapability.supportsCameraFacingSwitch` 로 바꾼다(카메라 탐색 코드 제거). iOS build 43. iPhone·iPad 는 지금과 같음.
- 실기: 맥 영상 통화 버튼 3개(카메라·마이크·종료), 연속성 카메라가 잡힌 상태에서도 3개. iPhone 영상 통화 전환 버튼 그대로(iPhone 실기기 NOT_PROVEN 가능 — 설치 빌드 필요).

### 범위 밖 관찰 (보고만)
- T4: 통화를 끝낸 뒤 앱 화면 위에 「통화 중 · 00:36 통화 화면으로 돌아가기」 막대가 약 1초 남았다가 사라짐. 이번 변경 전에도 있었는지 확인 못 함.

## 5. C′ 결과 (Owner 「C′ 구현 승인」 2026-11-15)
- PR #332 → main `cd3d0a90b` (iOS build 43). 맥 앱 Xcode 실행 build 43 · DibayGitSha cd3d0a90bd8a.
- 맥 영상 통화(김봉기 → Samsung q테스트1 58, 세션 3bfdb2e0 23:14:46~23:15:09 PHT): 23:14:37.851 `camera_flip_button_visibility visible=false`, 연결 후 버튼 3개(카메라·마이크·종료). 이때 맥 카메라 2개(MacBook Pro + 연속성 카메라 「iPhonebk」) — build 42 FAIL 조건과 같은 상태에서 PASS.
- NOT_PROVEN: iPhone·iPad 실기기에서 전환 버튼 표시·동작(설치 빌드 필요 — 코드상 `!isIOSAppOnMac` 라 true).

## 6. 화면 꺼짐·PiP 이어받기 실기 (Owner 「화면 꺼짐·PiP 이어받기 실기 진행해」 2026-11-15, Samsung 58)
기기 조율: 이미지 감사 세션이 23:19 까지 Xiaomi CDP 계측 — 첫 B↔C 발신(23:19:22)과 겹침(발신은 정상).

| 항목 | 판정 | 증거 (PHT) |
|---|---|---|
| T7 화면 꺼짐 중 대기 → 화면 켜짐 | PASS | 화면 끈 상태(Dozing)에서 23:23:20.119 대기 `quiet=false` → FSI 로 통화 화면 앞(20.663) → `visible=true`·조용한 알림으로 전환(20.824) |
| T7 이어서 C 종료 → 이어받기 (잠금 화면) | **FAIL (작업자 #330 결함)** | 28.375 hold → 28.617 `start_skipped reason=not_foreground_unlocked`(잠금: isKeyguardLocked=true) → 백그라운드 경로 수신 알림 게시 → 남겨 둔 「통화 종료 중」 화면 위에 수신 heads-up 「수락 / 거절」 약 5초 → 33.395 `handover_release reason=hold_timeout` 뒤 33.591 수신 화면 (re58-t7-tile) |
| T8 PiP 중 대기 → C 종료 | 설계대로(이어받기 안 씀) · 범위 밖 관찰 | PiP = 안 보임 → 대기 `quiet=false` heads-up + PiP 함께. C 종료 31.8 → hold 없음·`handover=false` → PiP 닫힘 → 기존 백그라운드 경로: 31.835 Android `Background activity launch blocked` → 수신은 홈 화면 heads-up 「수락 / 거절」 로만 표시 (re58-t8-tile). 이번 변경 전부터의 경로이며 홈에서 일반 수신과 같은 모습 |
| 맥 발신 지연 | 원인 확인 못 함 | 23:20:5x 맥 음성 발신 → 서버 세션 생성 23:22:06(약 70초 뒤). 그 시각 맥 로그 미수집. 이후 로그 수집 중 재현 없음 |

### T7 FAIL — 원인·수정 설계안 B2 (Owner 승인 필요)
- 원인: 런타임 이어받기 조건이 `isHandoverLaunch && isForegroundUnlockedInteractive` 라 잠금 화면(통화 화면이 showWhenLocked 로 잠금 위에 떠 있는 상태)에서는 앞 화면 경로를 쓰지 않는다. 그런데 presenter 는 이미 화면을 남겨 둔 상태라, 백그라운드 경로의 FSI 가 화면을 띄우지 못하고(앱 화면이 앞이라 heads-up) 남겨 둔 화면이 안전장치 5초까지 유지됐다.
- B2-1: 이어받기 조건을 「화면 켜짐(isInteractive)」으로 바꾼다 — 두 통화 화면은 `showWhenLocked`·`turnScreenOn` 이고 시작 주체가 잠금 위에 보이는 우리 통화 화면이라 잠금 해제가 필요 없다(T7 첫 단계에서 잠금 위 통화 화면 표시 확인).
- B2-2: 런타임이 이어받기 시작을 실제로 했는지 presenter 에 알리고(`markHandoverLaunched`), promote 뒤 시작하지 않았으면 남겨 둔 화면을 즉시 닫는다(5초 대기 제거) — 어떤 이유로든 이어받기를 못 하면 기존 동작(바로 닫고 백그라운드 경로)과 같아진다.
- 바뀌는 파일: 음성·영상 런타임(조건·표시), NativeCallWaitingPresenter, 계약 테스트. Android versionCode 59. 서버·웹·iOS 무변경.
- 실기: T7 잠금 화면 이어받기(홈·heads-up 0), T1·T2 회귀, T8 그대로.

## 7. B2 결과 (Owner 「B2 구현 승인」 2026-11-15)
- PR #333 → main `f0510bbdb` (Android versionCode 59). Samsung 1.2.7 (59) 설치 23:39 PHT.
- 기기 조율: 이미지 감사 세션이 알린 Samsung Google 「로그인 시도 확인」 창(23:39~)은 59 설치·DIBAY 실행 뒤 창 목록에서 사라짐 — 버튼은 누르지 않음. Xiaomi 에도 Google 화면(gms OctarineActivity)이 뒤에 남아 있어 모든 탭은 「맨 앞 = DIBAY」 확인 후에만 보냄. 23:43:51 Samsung 화면이 터치로 켜짐(`reason=tap`) — 작업자 입력 아님.

| 항목 | 판정 | 증거 (PHT) |
|---|---|---|
| T7 잠금 화면 이어받기 (재시험) | PASS | isKeyguardLocked=true · 23:44:23.656 hold → 23.882 `start_allowed handover=true` → 같은 작업 CLEAR_TASK → `launched=true` → 24.575 release. 녹화: 「통화 종료 중」→ 수신 화면, 수신 heads-up 0 (re59-t7-tile, 녹화 1.8초에서 끊겼으나 전환 포함). 이번엔 대기 도착 전 화면이 터치로 켜져 대기 알림은 조용한 알림으로 시작 |
| T2 CW3 회귀 | PASS | 23:46:14.5 hold → 16.049 `launched=true` → 16.7 수락 200, 「통화 종료 중」→「김봉기 연결 중」→「통화 중」, 홈 0 (re59-t2-tile) |
| T1 CW6 회귀 | PASS | 1차 23:47 로그만(녹화 전에 맥 종료 지연). 재녹화(Owner 「T1 녹화 다시 해서 화면으로 확인해」) 23:55: 대기 23:55:20.857 → C 종료 → 24.581 hold → 24.873 `launched=true` → 25.501 release, 0.1초 간격 프레임에서 「통화 중」→「통화 종료 중」→「김봉기 음성 통화 수신」, 홈 0·수신 heads-up 0 (re59-t1b-tile, 녹화 4.1초에서 끊겼으나 전환 포함). 재녹화 직전 23:53:58 이미지 감사 세션 탭 2회가 통화 화면 빈 곳에 들어감(스피커·음소거 변화 없음 확인) |
| T8 PiP (재실기 · Owner 「PiP 이어받기도 다시 실기 진행해」) | 설계대로(이어받기 안 씀) · 범위 밖 관찰 | 11-16 00:03:48 PiP 진입(B↔맥 통화) → 00:03:56.942 대기(C) `quiet=false` → 녹화: PiP + 대기 heads-up 「거절 / 종료 후 받기」 약 11초 유지 → 00:04:08 맥 종료 → hold 없음·`handover=false launched=false` → PiP·대기 알림 사라짐 → 00:04:08.679 Android `Background activity launch blocked` → 홈 화면 수신 heads-up 「수락 / 거절」 이 무응답(00:04:27.7 missed)까지 유지 (re59-t8b-tile). 전체 화면 수신 화면은 뜨지 않음 — 이번 변경 전부터의 백그라운드 경로이며 홈에서 일반 수신과 같은 모습. 1차 시도(23:58)는 맥 발신이 3분 넘게 늦게 도착(00:02:13 생성)해 무효 — 맥을 진행 중 통화 상대로, 대기는 Xiaomi 로 바꿔 재실기 |
| 맥 클릭 처리 지연 | 원인 확인 못 함 | 23:42 맥 발신 클릭 → 맥 앱 로그 첫 줄 23:44:07, 발신 시작 23:44:16. 그 사이 맥 앱 로그 0줄 — 앱이 멈춰 있었는지 확인 못 함(시험 환경 문제 가능, 앱 결함 판정 보류) |

## 8. 설계 P — PiP 중에도 대기 통화를 전체 화면으로 이어받기 (Owner 「개선 설계 진행」 2026-11-16, 승인 전 구현 금지)

### 현재 동작과 원인 (59 실기 T8, 11-16 00:04 PHT, Samsung Android 16 / SDK 36)
- PiP = 「안 보임」 → 진행 중 통화가 끝나면 `finishCallScreen` 이 PiP 통화 화면을 바로 닫음(00:04:08.405 PiP 작업 CLOSE 전환) → 0.2초 뒤 promote 가 수신 화면 시작 → 그 순간 앱에 보이는 화면이 없어 `Background activity launch blocked`(00:04:08.679) → 홈 화면 수신 heads-up 만.
- 근거 원문(AOSP main):
  - `BackgroundActivityStartController.checkBackgroundActivityStartAllowedByCallerInForeground` L1013 — 앱 전환 상태가 ALLOW/FG_ONLY 이고 `mCallingUidHasVisibleActivity` 면 `BAL_ALLOW_VISIBLE_WINDOW`. 보이는 판정은 `VisibleActivityProcessTracker.hasVisibleActivity` → `WindowProcessController` 의 `ACTIVITY_STATE_FLAG_IS_VISIBLE`(activity `isVisible()`/`isVisibleRequested()`) — PiP 통화 화면은 보이는 Activity.
  - `ActivityTaskManagerService.stopAppSwitches` L4168~ — 홈 버튼 직후 `APP_SWITCH_DISALLOW`, `RESUME_FG_APP_SWITCH_MS` 뒤 `APP_SWITCH_FG_ONLY` 로 풀림 → PiP 가 떠 있으면 허용 조건을 만족.
- 참고(기준선): AOSP Dialer 도 기기 사용 중(홈 화면) 수신은 FSI 알림이 heads-up 으로 보인다(`StatusBarNotifier`). 지금 T8 동작은 이 기준선과 같다. 설계 P 는 「이미 통화 중(PiP)인 사용자」에 한해 Dialer 의 「통화가 남아 있으면 통화 화면 유지」(§1 startOrFinishUi) 를 PiP 에도 적용하는 것이다.

### 설계
- P-1 보임 판단 분리: 띠(host)가 「앞에 보임」과 「PiP 로 보임」을 따로 보고. presenter 는 대기 알림 조용/시끄러움 판단에는 지금처럼 「앞에 보임」만 쓰고(PiP 는 띠가 숨겨지므로 시끄러운 알림 유지), 이어받기 남기기 판단(`holdCallScreenForHandover`)에는 「앞에 보임 또는 PiP」를 쓴다.
- P-2 PiP 화면 남기기: 진행 중 통화가 끝날 때 대기 통화가 있고 통화 화면이 PiP 면 PiP 화면을 닫지 않는다(앱에 보이는 Activity 유지 → BAL 허용 조건). 화면에는 「통화 종료 중」 상태만 보인다.
- P-3 이어받기 시작: promote 는 지금과 같이 `isHandoverLaunch` + `isInteractive` 면 앞 화면 경로(`NEW_TASK|CLEAR_TASK`)로 수신 화면 시작. 같은 종류는 PiP 작업을 다시 쓰고(`ActivityStarter` L3082~: PiP 작업 재배치는 task organizer(WM Shell)에 맡김 → PiP 해제·확대), 다른 종류는 새 작업으로 시작 후 PiP 화면 정리(B 와 같음).
- P-4 안전장치(그대로 유지): 시작 못 하면 즉시 정리(B2-2 `handover_not_launched`), 1.2초 안에 수신 화면이 안 보이면 기존 FSI 경로(`foreground_visible_activity_start_postcheck_failed`), 5초 hold_timeout.
- 바뀌는 파일: `NativeCallWaitingBanner`(PiP 보고), `NativeCallWaitingPresenter`(PiP host 집합·남기기 조건), 계약 테스트. 런타임·Activity·서버·웹·iOS 무변경. Android versionCode 60.
- 확인 못 한 것(구현 전 NOT_PROVEN): PiP 작업에 CLEAR_TASK 로 넣을 때 WM Shell 이 PiP 를 전체 화면으로 펼치는 화면 모양 — 원문은 「task organizer 에 맡김」까지만 확인. 기대와 다르면 P-4 로 지금 동작(heads-up)보다 나빠지지는 않음.
- 실기: T8(음성 PiP → 대기 → 상대 종료: 전체 화면 수신, 홈 0·heads-up 0), 영상 PiP 같은 시험, 다른 종류(음성 PiP → 영상 대기), 홈 버튼 직후 5초 안 종료(APP_SWITCH_DISALLOW → P-4 대체 경로), T1·T2·T7 회귀.

## 9. 설계 P 실기 FAIL (Android 60, 11-16 00:24 PHT) — 작업자 잘못
- PR #335 → main `fba9b848c` (versionCode 60). Samsung 1.2.7 (60) 활성 1대(user_devices 00:22:45).
- P1 음성 PiP 중 대기(C) → 맥 종료: 00:24:38.244 `handover_hold pip=true` → 38.538 앞 화면 시작(handover=true) → **38.553 `Background activity launch blocked`** (`callingUidHasVisibleActivity: true`, `callingUidHasVisibleNotPinnedActivity: false`) → 39.777 postcheck 실패 → FSI 수신 알림 → 43.259 hold_timeout 로 PiP 정리 → 43.832 수신 화면이 **PiP 창 안에** 표시(`inPip=true`).
- 사용자 화면(re60-p1-tile): PiP 「통화 종료 중」 약 5초 + 수신 heads-up 「수락 / 거절」 → 이후 PiP 창 안 작은 수신 화면(버튼 안 보임). 59(PiP 닫힘 + heads-up 만)보다 나쁨 = **회귀**.
- 원인(작업자 잘못): 설계 P 근거를 AOSP `main` 원문(L1013 `mCallingUidHasVisibleActivity`)으로만 확인했다. 기기의 Android 16 QPR 원문(`android16-qpr2-release` `BackgroundActivityStartController` L1170 `mCheckCallerVisible`)은 `mCallingUidHasVisibleNotPinnedActivity` — **PiP(pinned) 화면은 허용 근거가 아니다**. 기기 버전 원문을 확인하지 않고 설계했다.
- 결론: Android 16 QPR 에서는 PiP 만 떠 있는 상태로 앱이 전체 화면 수신 화면을 띄울 수 없다(플랫폼 규칙). 59 동작(PiP 닫고 FSI heads-up)이 이 플랫폼에서 가능한 동작이며 AOSP Dialer 기준선과 같다.

### 수정 설계안 R (Owner 승인 필요) — P 되돌리기
- #335 코드(NativeCallWaitingBanner PiP 보고·presenter PIP_HOSTS·계약 테스트 P 항목)를 되돌려 59 동작으로 복구. 문서·실기 기록은 유지.
- Android versionCode 61(번호는 되돌리지 않음). 서버·웹·iOS 무변경.
- 실기: PiP 중 대기 → 상대 종료 = PiP 닫히고 heads-up(59 와 같음, hold 없음), T1·T2·T7 회귀.

## 10. PiP 이어받기 — 근본 원인 확정과 계획안 (Owner 「땜빵으로 하지 말고 정확한 원인을 확인 … 정확한 계획안」 2026-11-16)

### 10-1. 기기·근거 범위
- Samsung SM-M156S `BP4A.251205.006` / `M156SKSS9DZG1`, Android 16 `sdk_full 36.1`(QPR2), 보안 패치 2026-07-05. 근거 원문 = AOSP `android16-qpr2-release`(기기와 같은 계열). §8 의 `main` 근거는 기기와 달라 폐기.

### 10-2. 화면 시작 허용 판정 — 기기 로그 전수(11-15~16, 통화 화면 시작 37건)
| 사유 | 언제 | 의미 |
|---|---|---|
| `BAL_ALLOW_VISIBLE_WINDOW` | 통화 화면·앱 화면이 **전체 화면으로 앞**일 때(T1·T2·T6·T7·수락 등) | 보이는 「PiP 아닌」 화면 |
| `BAL_ALLOW_GRACE_PERIOD [realCaller]` | 57 CW6·CW3(22:06:25·22:08:35) — 홈 버튼 안 누른 상태에서 통화 화면이 막 닫힘 | 10초 유예 |
| `BAL_ALLOW_NON_APP_VISIBLE_WINDOW [realCaller]` (realCallingUid=10064 SystemUI) | 알림 탭·FSI·알림 「수락」(22:03:42·22:08:15·23:22~23:23) | **사용자 동작·시스템이 보낸 PendingIntent** |
| `BAL_ALLOW_FOREGROUND` | 23:53:54 | 앞 작업에 앱 화면 |
| **`BAL_BLOCK`** | 22:07:53(홈 화면 일반 수신), 23:25:31·00:04:08(59 PiP), 00:24:38·39(60 PiP), 00:02:13 | 보이는 화면이 PiP 뿐이거나 없음 |

### 10-3. 원문 조건 (`android16-qpr2-release`)
1. `BackgroundActivityStartController.mCheckCallerVisible` L1160~1175: `appSwitch ∈ {ALLOW, FG_ONLY}` **그리고 `mCallingUidHasVisibleNotPinnedActivity`** → PiP(pinned) 는 제외.
2. `BackgroundLaunchProcessController.areBackgroundActivityStartsAllowed` L147~153: 「앞 작업에 화면 있음」(`BAL_ALLOW_FOREGROUND`) 은 **`!inPinnedWindow`** 일 때만.
3. 같은 함수 L156~170: 10초 유예(`BAL_ALLOW_GRACE_PERIOD`)는 **`appSwitchState == APP_SWITCH_ALLOW`** 일 때만. `ActivityTaskManagerService.stopAppSwitches`(홈 버튼) → `DISALLOW`, 500ms 뒤 `FG_ONLY`(L552·L4168~) — ALLOW 로는 돌아가지 않음(앱 화면이 다시 앞에 와야 ALLOW). 60 차단 로그 `appSwitchState: 1`(= FG_ONLY, L555~561) 로 일치.
4. 그 밖 앱 쪽 허용: `mCheckCallerHasSawPermission` L1270(「다른 앱 위에 표시」 권한) 뿐. 사용자 탭은 SystemUI 가 보내므로 허용.
- **결론(근본 원인)**: 홈 버튼으로 PiP 가 된 뒤에는, PiP 만 떠 있는 앱이 스스로 전체 화면 Activity 를 띄우는 것을 Android 16 QPR2 가 막는다(플랫폼 정책 — 홈 버튼 뒤 앱이 스스로 앞으로 나오는 것 차단). 앱 코드로 우회할 수 있는 경로는 「다른 앱 위에 표시」 특수 권한뿐이다.

### 10-4. 60(설계 P)이 더 나빠진 원인
- PiP 를 남김 → 시작 차단 → 1.2초 postcheck 실패로 FSI 알림 → **남긴 PiP 는 hold_timeout 5초까지 유지**(postcheck 실패가 hold 를 풀지 않음) → 차단된 시작 요청이 기존 PiP 작업 안에 화면을 만들어(`balDontBringExistingBackgroundTaskStackToFg: true`) **수신 화면이 PiP 창 안에** 표시(00:24:43.832 `inPip=true`).
- 또 B2-2 의 `launched` 는 「시작 요청을 보냈다」일 뿐 「화면이 떴다」가 아니다(60: `launched=true` 인데 차단) — 차단을 알아채는 것은 postcheck(1.2초) 뿐.

### 10-5. 잠금 문서와의 관계 (통화 축소 표면 SSOT, HARD LOCK)
- `docs/dibay-call-minimized-surface-cta-ssot.md` §7 상태표: **RINGING(수신) = 수신 화면 / PiP 없음(—) / 수신 알림(기존)**. §3·§9: PiP 버튼은 `[MIC, CAMERA, END]` 고정(검사 `verify:call-surface-cta-ssot`). §0: 수신 벨 화면·수신 알림(FSI) 경로는 잠긴 경로.
- 따라서 「PiP 안에서 수신(수락/거절 버튼)을 보여 주는」 방식은 HARD LOCK 변경이 필요하다(아래 안 2).

### 10-6. 계획안
**안 1 (권장) — 플랫폼·잠금 문서·Dialer 기준에 맞춘 근본 정리 (Android versionCode 61)**
- 1-a: PiP 상태에서는 이어받기 남기기를 하지 않는다(설계 P 의 `PIP_HOSTS` 남기기·promote 조건 제거) — 원인 10-3 에 따라 PiP 에서 앱이 전체 화면을 띄울 수 없으므로 남길 이유가 없다. 결과 = SSOT §7 RINGING 행(PiP 없음 + 기존 수신 알림), Dialer(InCallUI 안 보이면 알림) 와 같음. 사용자가 알림 「수락」을 누르면 SystemUI 가 보내는 PendingIntent 라 허용(10-2 근거) → 전체 화면 연결.
- 1-b: 이어받기 시작이 실제로 화면을 띄웠는지를 기준으로 남긴 화면을 정리 — postcheck(1.2초) 실패 시 **즉시** 남긴 화면 정리(지금은 5초 hold_timeout 까지 남음). 앞 화면에서도 홈 버튼을 누른 직후(500ms 안 `DISALLOW`) 같은 차단이 날 수 있어 공통으로 필요.
- 1-c: `launched` 이름·뜻을 「시작 요청함」으로 바로잡고, 판정은 postcheck 결과로 한다(로그 `handover_launch_requested` / `handover_launch_shown` / `handover_launch_blocked`).
- 바뀌는 파일: `NativeCallWaitingPresenter`(PIP_HOSTS 제거·postcheck 연동), `NativeCallWaitingBanner`(PiP 보고 제거), 음성·영상 런타임(postcheck 결과를 presenter 에 알림), 계약 테스트. 서버·웹·iOS·SSOT 무변경.
- 실기(녹화·logcat·DB): ① 음성 PiP 중 대기 → 상대 종료 = PiP 즉시 닫힘 + 수신 heads-up, 알림 「수락」 → 전체 화면 연결 ② 영상 PiP 같은 시험 ③ 앞 화면 이어받기 T1·T2·T7 회귀 ④ 홈 버튼 누르고 0.5초 안 상대 종료(차단 → 남긴 화면 1.2초 안 정리 → heads-up).

**안 2 — PiP 안에서 수신 보이기 (HARD LOCK 변경 필요 · 권장 안 함)**
- PiP 창을 새 수신 통화로 바꿔 「거절 / 수락」 PiP 버튼을 보이고, 「수락」(SystemUI 가 보냄 → 허용)으로 전체 화면. SSOT §7(RINGING 에 PiP 없음)·§3·§9(PiP 버튼 고정)·검사 스크립트 변경 + 수신 알림과 표면 2개 문제(대기 「표면 1개」 원칙과 충돌) + 음성·영상 Activity 재바인딩(영상 카메라 미리보기 등) 범위가 크다.

**안 3 — 「다른 앱 위에 표시」 권한으로 자동 전체 화면 (권장 안 함)**
- `BAL_ALLOW_SAW_PERMISSION`(L1270) 이 유일한 앱 쪽 허용. 사용자에게 특수 권한 요청·Play 정책 신고가 필요하고, 모든 통화 경로의 화면 시작 규칙이 바뀐다.

### 10-7. 확인 못 한 것
- 영상 PiP 에서의 같은 차단(원문상 같다고 판단, 기기 실측 없음) · Android 15 이하 기기 동작(Xiaomi 등) · 안 1-b 의 「홈 버튼 0.5초 안」 재현 가능 여부.

## 11. 안 1 결과 (Owner 「안 1 구현 승인」 2026-11-16, Android 61)
- PR #337 → main `529b83fa3`. Samsung 1.2.7 (61) 활성 1대(user_devices 확인). 11-16 00:47~00:58 PHT. 판정 = 기기 logcat + screenrecord + 운영 DB.

| 항목 | 판정 | 증거 (PHT) |
|---|---|---|
| ① 음성 PiP 중 대기 → 맥 종료 | PASS | hold 없음 → 00:48:24.026 `start_skipped` → 수신 알림(re61-h1s) · 「수락」 00:48:40 → `NOTIFICATION_ACCEPT` 시작 허용 → 전체 화면 「zxzx11 통화 중 00:02」(re61-h2s), 세션 bafd01ec answered 00:48:40.9 |
| ② 영상 PiP 중 대기 → 맥 종료 | PASS | 00:49:54.890 BAL_BLOCK(원문대로 영상 PiP 도 차단) · hold 없음 · 수신 알림(re61-h3s) · 「수락」 00:50:08 → 전체 화면(re61-h4s), 0e5490d7 answered 00:50:09.1 |
| ③ T1 앞 화면 이어받기 | PASS | 00:50:36.485 hold → 36.762 `launchRequested=true` → 37.462 release → 37.963 `handover_launch_shown` · 프레임 홈 0·알림 0 (re61-t1-tile) |
| ③ T2 띠 종료 후 받기 | PASS | 00:54:09.721 hold → 11.365 promote → 11.856 수락 200 → 12.512 `handover_launch_shown` (re61-t2-tile) |
| ③ T7 잠금 화면 이어받기 | PASS | isKeyguardLocked=true · 00:55:54.993 hold → 55.280 promote → 56.481 `handover_launch_shown` · 수신 heads-up 0 (re61-t7-tile) |
| ④ 홈 버튼 직후 종료(차단 → 즉시 정리) | NOT_PROVEN | 1회 시도: 홈 키(adb 00:57:22.174)보다 수신 화면 시작(22.333, BAL_ALLOW_VISIBLE_WINDOW)이 먼저 처리돼 차단 경로가 재현되지 않음. 코드 경로는 계약 테스트로만 확인 |
| ④ 재실기(Owner 「④ 홈 직후 종료도 다시 실기 진행해」) | PASS(홈 직후 남긴 화면 즉시 정리) · 하위 경로 NOT_PROVEN | 01:02:08.698 `handover_hold` 로그 감지 즉시 홈 키(`cmd input keyevent 3`, 08.795 송신) → 08.764 `visible=false`·`notice_repost_skipped` → 09.001 백그라운드 경로 → 09.078 BAL_BLOCK → 09.117 promote `handover=false launchRequested=false` → 09.118 `handover_release reason=handover_not_requested`(즉시) → 수신 heads-up 「수락 / 거절」 약 0.4초 뒤 표시, 「통화 종료 중」 잔류 프레임 0 (re61-t4b-tile). 「시작 요청 뒤 차단(handover_launch_blocked)」 하위 경로는 홈 키가 promote 판단(09.0) 뒤·시작(약 30ms 사이) 전에 들어가야 해 재현 못 함 — 계약 테스트로만 확인 |

- 작업자 잘못: 00:56:28 C 통화가 이미 무응답으로 끝난 뒤 보낸 「수락」 좌표 탭이 DIBAY 메인 화면 아래쪽에 들어가 중고거래 상품 상세로 이동(쓰기 없음, 뒤로 가기로 복귀).
- 기기 조율: 00:54 맥 맨 앞에 「iPhone 미러링」 창(작업자가 연 것 아님) — 건드리지 않고 DIBAY 만 앞으로.

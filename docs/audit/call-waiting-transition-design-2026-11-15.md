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

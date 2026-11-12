# DIBAY 통화 — 화면 밖 표면(PiP·알림·최근 앱·통화 바)·CTA SSOT · HARD LOCK 설계 (Android)

> **상태: Owner 승인(2026-11-12 「구현 시작」) → 구현 PR `fix/call-pip-surface-cta`. 코드 PASS, 실기 NOT_PROVEN(네이티브 빌드 설치 후 §12).** 실기 PASS 후 **HARD LOCK** 확정(§9). 잠금 검사·규칙은 이 PR 부터 적용.
> 상위 잠금: `docs/dibay-chat-call-current-normal-hard-lock.md` HARD LOCK A(네이티브 = Owner 승인 + Native Change Gate) · `AGENTS.md` 「통화 변경 규정」. 이 문서는 그 아래의 **하위 SSOT** 이며 상위 잠금을 약화하지 않는다.
> 근거 문서(감사·실측 원본): `docs/audit/call-pip-nav-notification-audit-design-2026-11-12.md` §1·§3·§4.
> 작성 기준: main `f49160dcf`, 2026-11-12 PHT.

## 0. 범위
| 포함 | 제외 (보고만) |
|---|---|
| Android **1:1 음성·영상, 연결 후(CONNECTED)** 의 표면 6개(§2) 와 그 위의 CTA(누르는 버튼) | iOS(CallKit·PushKit — OS 가 표면을 소유, 별도 SSOT) |
| 하단 내비 ◁ ○ \|\|\| 와 제스처 내비의 동작 | 수신 벨 화면·수신 알림(FSI) — 이미 잠긴 경로(`call-v4-incoming-fsi-fallback-boundary`). §3 의 **종료 아이콘 통일만** 적용 |
| 표면 사이의 상태 전이·정리(잔류 0) | 그룹 통화, 서버 종료 판단(heartbeat 양쪽 만료 규칙), 앱 강제 종료 시 상대 잔류(별도 감사) |

## 1. 기준 = 레거시 실측 (Owner 2026-11-12 「Owner 고집이 아니라 레거시 앱 기준」)
| 근거 등급 | 내용 |
|---|---|
| 1순위 **실측** | Telegram 영상 통화, Samsung SM-M156S(Android 16·3버튼) ↔ Xiaomi, 2026-11-12 19:00:42~19:05:10 PHT — 감사 문서 §3-0 T1~T10 (녹화·캡처 16장·logcat·dumpsys) |
| 2순위 공개 소스 | Telegram `CallPipActions`·`SystemHost`·`VoIPPipContent`·`LaunchActivity`·`VoIPService`, Signal `WebRtcCallActivity`·`CallNotificationBuilder` (GitHub 원문 2026-11-12) |
| 3순위 플랫폼 | Android PiP·CallStyle 공식 문서 |
| DIBAY 현재 실측 | DIBAY 영상 통화 `ba09b163`, 같은 기기·같은 순서, 2026-11-12 19:19:04~19:25:24 PHT(Xiaomi 발신·Samsung 수신, DB `ended_by_callee`) — 감사 문서 §3-4 D1~D11 |
| 미확보 | 카카오톡(Samsung 로그인 전)·Meet — NOT_PROVEN. 레거시끼리 다르면 **실측(Telegram)** 을 따른다 |

## 2. 표면(Surface) 목록 — 통화가 사용자에게 보이는 곳
| ID | 표면 | 소유 코드 | 보이는 상태 |
|---|---|---|---|
| S1 | 통화 화면(전체) | `NativeVideoCallActivity`·`NativeVoiceCallActivity` + `activity_native_*_call.xml` | RINGING~ENDING |
| S2 | 시스템 PiP 창 + PiP 메뉴 | `Native*CallPipPresenter` | CONNECTED 에서 PiP 진입 후 |
| S3 | 진행 중 통화 알림(포그라운드 서비스 알림) | `Native*CallService.buildNotification` | CONNECTING·CONNECTED |
| S4 | 상태 표시줄 통화 표시(칩·아이콘) | S3 의 `CallStyle` 이 OS 에 요청 | CONNECTED |
| S5 | 최근 앱(\|\|\|) 통화 카드 | 통화 Activity 작업(task) | CONNECTED (§6) |
| S6 | 앱 안 통화 바(웹) | `NativeActiveCallBar.tsx` | CONNECTED, 통화 화면이 앞에 없을 때 |
| S7 | Dock(PiP 를 못 쓰는 기기의 앱 안 축소 창) | `Native*CallDockPresenter` + `layout_native_call_dock.xml` | CONNECTED, PiP 실패·꺼짐일 때 |

## 3. CTA SSOT — 버튼 하나는 모든 표면에서 같은 아이콘·같은 말·같은 동작
| CTA | 아이콘(리소스) | 색 | 문구 키 (ko / en) | 동작(단일 함수) | 표면 |
|---|---|---|---|---|---|
| **통화 종료** | **빨간 수화기** `ic_call_end` (신규, Material `call_end` 형태) | 빨강 `bg_call_control_danger` | `dibay_call_end_call` 「통화 종료」 / 「End call」 (신규) | `Native*CallRuntime.end(callId)` → `USER_END` | S1·S2·S3·S7 |
| 발신 취소(벨 울리는 중·발신 준비) | **빨간 수화기** `ic_call_end` (종료 버튼과 같은 자리) | 빨강 | 기존 `dibay_video_call_cancel`·`dibay_voice_call_cancel` 「취소」 | 기존 취소 경로(변경 없음) | S1 |
| 수신 거절 | **빨간 수화기** `ic_call_end` | 빨강 | 기존 `dibay_incoming_reject` 「거절」 / 「Decline」 | 기존 거절 경로(변경 없음) | S1 수신(음성·영상·`activity_incoming_call`), 구형 통화 FGS 알림 버튼 아이콘 |
| 수신 수락 | 기존 `ic_call_check` **유지** (X 가 아니고, 레거시 수신 화면은 미측정 — 근거 없이 바꾸지 않음) | 초록 `bg_call_control_accept` | 기존 `dibay_incoming_accept` | 기존 수락 경로 | S1 수신 |
| 마이크 끄기/켜기 | `ic_call_mic_on` / `ic_call_mic_off` (기존) | 중립 | 기존 `dibay_call_control_mute` 「음소거」 / 기존 `dibay_call_control_unmute` 「음소거 해제」 | 기존 `NativeVideoCallAgoraEngine.setMicMuted(boolean)` · `NativeVoiceCallAgoraEngine.setMicMuted(callId, boolean)` | S1·S2 |
| 카메라 끄기/켜기 (영상) | `ic_call_video` / `ic_call_video_off` (기존) | 중립 | 기존 `dibay_video_camera_off`·`dibay_video_camera_on` | 기존 `NativeVideoCallAgoraEngine.setCameraEnabled` | S1·S2 |
| 카메라 전환 (영상) | 기존 | 중립 | 기존 `dibay_video_camera_flip` | 기존 | S1 |
| 스피커 (음성) | 기존 | 중립 | 기존 `dibay_call_control_speaker` | 기존 | S1 |
| 줄이기 | 기존 `ic_call_minimize` | — | 기존 `dibay_call_minimize` | 기존 `minimizeToApp` | S1 |
| 통화로 돌아가기 | (알림 본문 탭·PiP 전체 화면·카드·바) | — | S6 기존 `cm_ui_native_call_bar_return` | 기존 `returnToCallIntent` / `bringActiveCallToFront` | S2·S3·S5·S6 |

규칙
- **X 모양은 통화 CTA 에 쓰지 않는다.** X 는 OS PiP 메뉴의 「창 닫기」 전용이다(Telegram T4·T5). 현재 `ic_call_end_x`(통화 화면 종료·거절)와 `android.R.drawable.ic_menu_close_clear_cancel`(PiP 종료) 는 **모두** `ic_call_end` 로 바꾸고 `ic_call_end_x` 리소스는 삭제한다.
- 버튼 순서(왼→오) 고정 — 영상 S1: 카메라 전환 · 카메라 · 마이크 · 통화 종료 (Telegram 「전환·영상 중단·음소거·통화 종료」, 현재 DIBAY 순서와 같음) / 음성 S1: 스피커 · 영상 · 마이크 · 통화 종료 (현재와 같음) / S2: 마이크 · 카메라(영상만) · 통화 종료.
- 영상 S1 버튼 아래 **글자 라벨 표시**(음성과 같게, Telegram 실측 화면과 같게). 현재 영상은 아이콘만 있음.
- 종료 CTA 는 확인 창 없이 바로 끝낸다(Telegram 동일). 종료 원인은 모든 표면에서 `USER_END` 하나. 로그 출처만 `source=screen|pip|notification` 로 구분.

## 4. 하단 내비·제스처 SSOT (CONNECTED 기준)
| 입력 | 결과 (고정) | 근거 | 현재 DIBAY |
|---|---|---|---|
| ◁ 뒤로 (S1 에서) | S2 PiP + 메신저(앱) 앞으로 + S6 통화 바. 통화·카메라 유지. **Android 12+·앱 PiP 허용·연결 중이면 메신저를 먼저 올리고 PiP 는 자동 PiP 에 맡긴다**(PiP 를 먼저 요청하면 그 순간 「고정」으로 판정돼 복귀가 막힘 — `docs/audit/call-back-app-return-bal-design-2026-11-12.md` §11~§13). 조건 밖은 PiP 요청 → 복귀(Dock 대체). 결과는 `native_call_app_return_confirmed`/`_unconfirmed`·`native_*_auto_pip_entered`/`_missed` 로 기록 | Telegram T1(앱 위 영상 창 + 「통화로 돌아가기」 막대)·Signal 소스 | 같음(D1) — 유지 |
| ○ 홈 (S1 에서) | S2 PiP. 통화·카메라 유지 | Telegram T2(1.26초) | 같음(D3, 1.28초) — 유지 |
| \|\|\| 최근 앱 (S1 에서) | S2 PiP + 최근 앱 목록 | Telegram T3 | **FAIL(D6)**: PiP 안 됨 — 통화 화면이 일시정지·정지만 되고 `onUserLeaveHint` 가 오지 않음(19:22:00 로그). **변경**: CONNECTED 동안 `setAutoEnterEnabled(true)`(§4-1) |
| 제스처 홈·뒤로·최근 (Xiaomi) | 위 3줄과 같은 결과 | Android PiP 가이드 | NOT_PROVEN |
| PiP 한 번 탭 | OS 메뉴(설정·크기·전체 화면·X) + 앱 CTA(§3 S2 순서) | Telegram T4 | **FAIL(D4)**: 아래쪽 앱 버튼이 작은 회색 X 1개 → 위쪽 시스템 X 와 X 가 두 개 — **변경** |
| PiP 전체 화면 버튼 | S1 복귀, 시간 이어짐 | Telegram·DIBAY N6 | 같음 |
| **PiP X (OS 닫기)·아래로 밀기** | **통화 유지 · 카메라 상태 그대로 · S1 숨김** → 복귀 수단 S3·S5·S6 | Telegram T5 | 같음(D7: heartbeat 200·카메라 DIBAY·Xiaomi 연결) — 유지 |
| X 후 최근 앱에서 통화 카드 탭 | S1 복귀 | Telegram T6 | **FAIL(D8)**: 메인 카드만 있음 — **변경**(§6) |
| 최근 앱에서 통화 카드 밀어 없애기 | **통화 유지**(11-01 판단표 `SURFACE_LOST`=KEEP) | Telegram T8 | 같음(D10: `termination_decision cause=SURFACE_LOST` → `surface_lost_call_kept`, Xiaomi 05:32 계속) |
| S3 본문 탭 | S1 복귀 | Telegram T7 | 같음(D9) |
| S3 「통화 종료」 | 알림창 맨 위 통화 카드에서 **한 번 펼치면** 보임 → 통화 종료, 모든 표면 정리 | Telegram T9·T10 | **FAIL(D11)**: DIBAY 묶음 안에 들어가 **두 번 펼쳐야** 「종료」가 보임. 정리는 2초 안 0(통화 알림·카메라·작업·PiP) — 단 **통화 채널 자동 그룹 요약(id=0) 잔류** — **변경**(§5) |

### 4-1. 자동 PiP (최근 앱·제스처 대응)
| 항목 | 고정 값 |
|---|---|
| CONNECTED 진입 | `setPictureInPictureParams(… setAutoEnterEnabled(true) …)` (API 31+) — Telegram `SystemHost`·Signal `WebRtcCallActivity` 와 같음 |
| CONNECTED 아님(벨·연결 중·ENDING)·화면 종료 | `setAutoEnterEnabled(false)` |
| `onUserLeaveHint` | **모든 버전 유지**(Signal 과 같음 — 자동 PiP 와 함께). PiP 가 꺼진 기기에서는 `tryEnterPip` 실패 → Dock(S7) 대체 경로 보존. 중복은 `tryEnterPip` 가드가 소비 |
| 중복 진입 | 기존 `tryEnterPip` 가드(이미 PiP·요청 중이면 소비) 유지. 뒤로·줄이기 버튼 경로(`minimizeToApp`)는 그대로 |

## 5. 진행 중 통화 알림 SSOT (S3·S4)
| 항목 | 고정 값 |
|---|---|
| 형식 | `NotificationCompat.CallStyle.forOngoingCall(person, 종료 PendingIntent)` · 영상은 `.setIsVideo(true)` (API 31+). API 30 이하 = 지금 방식 + 종료 액션(§3 아이콘·문구) |
| 제목(person) | 상대 이름 = `Session.callerName`(발신·수신 모두 상대 이름이 들어감 — 발신은 `NativeVideoCallRuntime` 의 `new Session(…, boundPeerName, …)` 확인, 음성 CallStyle 이 이미 같은 필드 사용), 비면 앱 이름 |
| 본문 | `dibay_call_ch_video_ongoing_name` 「영상 통화 중」 / `dibay_call_ch_voice_ongoing_name` 「음성 통화 중」(기존 키 재사용) + 통화 시간 `setUsesChronometer(true)`·`setWhen(연결 시각)` |
| CONNECTING 본문 | 기존 `dibay_video_call_connecting`/`dibay_voice_call_connecting` |
| 벨(서비스 RINGING) 본문 | 기존 `dibay_video_call_incoming`/`dibay_voice_call_incoming` (영어 고정 문구 제거만, 수신 알림·FSI 경로 불변) |
| 금지 문구 | 코드 안 영어 고정 문자열(`"DIBAY video call"`·`"Native video runtime"` 등) — i18n SSOT 위반 |
| 작은 아이콘 | 변경 없음(실측 화면에서 문제 확인 안 됨) |
| 그룹 | 통화 전용 그룹 키 `dibay.call.ongoing` — DIBAY 일반 알림과 자동 묶음 금지(D5: 「2」 묶음에 접힘, D11: 두 번 펼쳐야 종료). 통화 종료 후 통화 채널 자동 그룹 요약 잔류 0 |
| 본문 탭 | 기존 `returnToCallIntent` |
| 채널·중요도·소리 | **변경 없음**(기존 채널 `dibay_native_*_call_v2`, `setSilent`·`setOnlyAlertOnce` 유지 — 사용자 채널 설정 보존) |
| 정리 | 통화 종료·정리(`cleanup`)·고아 회수에서 반드시 제거(현재 경로 유지) |

## 6. 최근 앱 통화 카드 SSOT (S5)
| 상태 | 카드 |
|---|---|
| RINGING·CONNECTING | 숨김(현재 `excludeFromRecents="true"` 유지 — 매니페스트 변경 없음) |
| CONNECTED | **보임**: `ActivityManager.AppTask.setExcludeFromRecents(false)` + `setTaskDescription(라벨 「통화 중 · 상대 이름」 키 `dibay_call_recents_label`, 아이콘)` |
| ENDING·ENDED·정리·고아 회수 | 다시 숨김(`setExcludeFromRecents(true)`) 후 작업 종료 — **종료 뒤 카드 잔류 0** |
| 카드 밀어 없애기 | 통화 유지(판단표 KEEP) — 복귀 수단 S3·S6 |

## 7. 상태 × 표면 표 (잔류 0 불변식)
| 상태 | S1 | S2 | S3 | S4 | S5 | S6 |
|---|---|---|---|---|---|---|
| RINGING(수신) | 수신 화면 | — | 수신 알림(기존) | — | 숨김 | — |
| CONNECTING | 통화 화면 | — | 연결 중 알림 | — | 숨김 | — |
| CONNECTED | 보임/숨김 | 사용자 입력 시 | **통화 카드** | **통화 표시** | **보임** | S1 이 앞에 없을 때 |
| ENDING→ENDED | 닫힘 | 닫힘 | 제거 | 제거 | 제거 | 제거 |
불변식: ENDED 후 2초 안에 S2·S3·S4·S5·S6 **모두 0개**(실기 판정 항목).

## 8. 바뀐 파일 전수 (구현 PR)
| 파일 | 변경 |
|---|---|
| `res/drawable/ic_call_end.xml` (신규) · `ic_call_end_x.xml` (삭제) | §3 아이콘 |
| `res/layout/activity_native_video_call.xml` | 종료·수신 거절 아이콘 → 수화기, 연결 후 버튼 4개 아래 라벨(카메라 전환·영상·음소거/음소거 해제·통화 종료/취소) |
| `res/layout/activity_native_voice_call.xml` | 종료·거절 아이콘, 종료 라벨 키 |
| `res/layout/activity_incoming_call.xml` | 거절 아이콘만 (수신 FSI 경로 불변) |
| `res/values/strings.xml`·`values-ko/strings.xml` | `dibay_call_end_call`·`dibay_call_recents_label`·`dibay_call_recents_label_no_name` |
| `call/CallPipActionPlan.java` (신규) | PiP 버튼 순서·우선순위·갱신 키 단일 규칙(순수 자바) |
| `call/CallRecentsCardPresenter.java` (신규) | §6 최근 앱 카드 표시/숨김·라벨 단일 함수 |
| `call/CallForegroundService.java` | 알림 거절·종료 버튼 아이콘만(X → 수화기). 구형 경로 동작 불변 |
| `nativevideo/NativeVideoCallPipPresenter.java`·`nativevoice/NativeVoiceCallPipPresenter.java` | §3 PiP 버튼, §4-1 자동 PiP |
| `nativevideo/NativeVideoCallActionReceiver.java`·`nativevoice/NativeVoiceCallActionReceiver.java` | PiP 마이크(·카메라) 동작, 종료 출처 `source=pip` / `notification` 기록 |
| `nativevideo/NativeVideoCallActivity.java`·`nativevoice/NativeVoiceCallActivity.java` | 마이크·카메라 토글을 함수 하나로(화면·PiP 공용), PiP 파라미터 갱신(키가 바뀔 때만), §6 카드, 종료 라벨(발신 중 「취소」) |
| `nativevideo/NativeVideoCallService.java`·`nativevoice/NativeVoiceCallService.java` | §5 알림 |
| `nativevideo/NativeVideoCallDockPresenter.java`·`nativevoice/NativeVoiceCallDockPresenter.java`·`nativevideo/NativeVideoCallUiPresenter.java` | 종료 문구 키 |
| `scripts/verify-call-surface-cta-ssot.cjs` (신규) · `package.json` | 잠금 검사 + `ci:static` 연결 |
| `android/app/src/test/java/com/dibay/app/call/CallPipActionPlanTest.java` (신규) | PiP 버튼 단위 테스트 |
| `.cursor/rules/dibay-call-surface-cta-ssot.mdc` (신규) · `AGENTS.md` 1줄 | 규칙 연결 |

변경 없음: 종료 판단표(`CallTerminationPolicy`)·Runtime 정리 순서·서버·웹·DB·iOS·수신 알림·알림 채널.

## 9. HARD LOCK — 승인·실기 PASS 후 고정되는 것과 지키는 장치
고정(바꾸려면 Owner 명시 재개방 + 이 문서 개정 + 통화 규정 3번):
1. §3 CTA 표(아이콘·색·문구 키·동작·순서), X 모양 통화 CTA 금지.
2. §4 내비 결과표, PiP X = 통화 유지·카메라 그대로.
3. §5 알림 형식·문구 키·아이콘·그룹, §6 카드 규칙, §7 잔류 0 불변식.

장치(코드로 강제 — CI `ci:static` 에서 실패):
| 검사 | 내용 |
|---|---|
| `verify:call-surface-cta-ssot` | ① `nativevideo/`·`nativevoice/`·`call/`·`res/layout/activity_native_*_call.xml`·수신 알림 빌더에 `ic_menu_close_clear_cancel`·`ic_call_end_x` 사용 0건 ② 두 PipPresenter 가 `ic_call_end`·마이크 아이콘을 쓰고 버튼 순서 상수 `[MIC, CAMERA, END]` 를 가짐 ③ 두 Service 의 연결 알림이 `CallStyle.forOngoingCall` 사용, 영상은 `setIsVideo(true)`, 묶음 `dibay.call.ongoing`, 통화 시간 ④ 통화 Service·Notification 에 영어 고정 문자열(`"DIBAY video call"`·`"Native video runtime"`·`"Native voice runtime"` 등) 0건 ⑤ 두 통화 Activity 에 `setAutoEnterEnabled(true)` 와 `setAutoEnterEnabled(false)` 가 함께 있음, 진행 중 알림에 `setGroup("dibay.call.ongoing")` ⑥ 신규 문자열 키가 `values`·`values-ko` 양쪽에 있음 ⑦ `setExcludeFromRecents(false)` 호출이 있으면 같은 파일 또는 Runtime `cleanup` 에 `setExcludeFromRecents(true)` 가 있음 |
| JVM 단위 테스트 | PiP 버튼: 영상 = 마이크·카메라·종료 3개 / 음성 = 마이크·종료 2개, 마이크 상태에 따라 아이콘·문구 바뀜 |
| 기존 검사 유지 | `verify:native-video-runtime-contract`·`verify:native-voice-runtime-contract`·`verify:call-authority-contract`·판단표 단위 테스트 — 변경 없음 확인 |

## 10. 영향·위험·롤백 (통화 규정 3번)
| 경로 | 영향 |
|---|---|
| 발신 시작·세션 생성·VoIP/FCM 발송·서버 heartbeat·통화 기록·종료 판단표 | **없음**(코드 미변경) |
| 수신 화면·수신 알림 | 수신 화면 거절 아이콘만(X → 수화기). 수신 알림·수락·거절 동작·FSI 경로 불변 |
| 연결·PiP·알림·최근 앱 | §3~§6 대로 |
| 종료·상대 종료·부재중·busy | 종료 버튼 모양만. 정리 경로에 카드 숨김 1줄 추가 |
| 구 바이너리 | 네이티브 전용 → 새 빌드 설치 기기만 바뀜. 웹·서버 무변경이라 구 앱 동작 그대로 |
| 위험 → 방지 | 자동 PiP 가 벨·연결 중에 뜸 → CONNECTED 에서만 true / 앱 안 화면 전환(통화 바·알림 복귀)에서 의도치 않은 PiP → 자동 진입은 OS 의 「사용자가 떠남」(홈·최근 앱·제스처)에만 동작, 실기 항목 D1·D9 재확인 / 버튼 갱신 깜박임 → 상태 바뀔 때만 갱신 / 종료 후 카드·알림 잔류 → §7 불변식 실기 항목 + `cleanup` 경로 / 카드 제거로 통화 종료(09-21·G1-3b 회귀) → 판단표 KEEP 불변 확인 테스트 / Android 11 이하 CallStyle 실패 → 기존 분기 |
| 롤백 | 네이티브 PR 되돌림 + 이전 빌드 재설치(웹 영향 없음) |

## 11. 기존 잠금과의 충돌 (임의로 고르지 않고 보고)
| 기존 | 이 설계 | 처리 |
|---|---|---|
| 2026-07-10 `56a65c1c8` 「lock(native-call): telegram voice ui」 — 종료·거절 = **X 아이콘**(`ic_call_end_x`) | Telegram 실측 = **빨간 수화기**(T4·통화 화면 「통화 종료」) | 07-10 잠금이 Telegram 과 다르게 잠겼다. Owner 승인 시 이 문서가 그 부분을 대체한다 |
| `dibay-call-presentation-cross-platform-hard-lock.md` 「Reopen only if … Owner explicit reopen」 | Android 통화 표시 변경 | 이 설계 승인 = Owner 명시 재개방으로 기록. iOS 표시는 범위 밖(재개방 안 함) |
| 10-31 Owner 「종료 버튼·상대 종료·취소 외 종료 없음」, 11-01 판단표 | §4 PiP X·카드 제거 = 유지 | 충돌 없음(같은 방향) |

## 12. 검증 (승인 후)
1. 로컬: `typecheck:build`·통화 vitest·`verify:call-*`·`verify:native-*-runtime-contract`·신규 `verify:call-surface-cta-ssot`·JVM 단위 테스트.
2. 실기(통화 규정 5번 행렬 + 아래): Samsung 3버튼·Xiaomi 제스처 × 음성·영상 × §4 표 11줄 + §7 잔류 0 + S3 알림 화면 캡처 + S5 카드 — **같은 순서로 Telegram 측정값(감사 문서 §3-0)과 1:1 표**. 녹화 + logcat 파일 보존 + DB 세션 시각 + Production SHA·설치 버전.
3. 결과가 Telegram 과 다르면 FAIL 로 적고 원인부터 쓴다(허위 보고 금지 규정).

## 13. 아직 NOT_PROVEN (설계 확정에는 영향 없음, 구현 후 실기에서 측정)
- Xiaomi 제스처 내비(입력 불가 기기 — Owner 손 조작 필요), DIBAY 음성 통화 표면(코드로만 확인: 음성 PiP 종료도 X 모양, 음성 알림 문구 `Native voice runtime`).
- 카카오톡·Meet 비교, Telegram 음성 통화.

# 통화 PiP·하단 내비(◁ ○ |||)·진행 중 통화 알림 — 감사 + 개선 설계안 (2026-11-12 PHT)

> 상태: **감사·실측 원본.** 최종 설계·SSOT 는 `docs/dibay-call-minimized-surface-cta-ssot.md`. 코드 변경 0건. 통화 변경 규정 3번에 따라 Owner 승인 전에는 구현하지 않는다.
> 근거: Samsung SM-M156S(Android 16·API 36·**3버튼 내비**) logcat 원본 `logcat_RFCY40PY2CA.txt`(18:24:29~18:36:45), Xiaomi 24076RP19G(Android 16·**제스처 내비**) logcat, 운영 DB `community_messenger_call_sessions` 읽기 전용 조회 3회, `dumpsys notification`(읽기 전용), main `f49160dcf` 코드.
> 기기 입력(탭·키)은 보내지 않았다. 다른 세션이 기기를 쓰는 중이었다(18:34:56 adb 강제 종료가 그 증거).

## 0. 먼저 알릴 것
- Owner 지시 「레거시 앱 형태」의 근거로 마스터 계획서가 가리키는 `docs/audit/call-inapp-multitask-legacy-design-2026-10-30.md`·`call-inapp-multitask-pip-audit-2026-10-30.md` 는 **저장소와 git 기록 어디에도 없다**(커밋된 적 없음). 이 문서는 그 두 문서를 다시 만들지 않고, 남아 있는 `call-inapp-multitask-master-plan-2026-10-31.md`·`call-termination-authority-audit-2026-11-01.md` 의 확정 결정을 기준으로 한다.
- 레거시 앱 실측은 **Telegram 1건**(Samsung 3버튼 ↔ Xiaomi, 19:00:42~19:05:10 PHT, Owner 승인·Owner 가 Xiaomi 에서 연결)만 했다. 카카오톡은 Samsung 이 로그인 전이라 못 했다(로그인은 작업자 금지 행위). Meet 미실측. 실측 아닌 것은 NOT_PROVEN.

## 1. 직전 통화 `7f4180dc` 가 안 끊긴 원인 (확정)
| 시각 PHT | 증거 | 의미 |
|---|---|---|
| 18:25:59 | DB `connected_at` | Samsung(발신, 1.2.6 (41)) ↔ 상대 Android(1.2.6 (39)) 영상 연결 |
| 18:33:43.892 | `UiEvent(PICTURE_IN_PICTURE_SHOW_MENU)` | PiP 창을 눌러 시스템 메뉴가 열림 |
| 18:33:46.365 | `PipMenuView: dismissPip` → `UiEvent(PICTURE_IN_PICTURE_TAP_TO_REMOVE)` | **시스템 메뉴의 닫기(X)** 를 누름. 앱의 「통화 종료」 버튼(`ACTION_END`)이 아님 — `end_tapped` 로그 없음 |
| 18:33:46.927 | `native_video_pip_activity_stopped … isFinishing=false` | 통화 화면만 숨겨짐(Task `setForceHidden 0->1`). `onDestroy` 없음 |
| 18:33:46~18:34:56 | `active_heartbeat_patch_done status=200` 10초마다 | 통화·카메라·서버 heartbeat 모두 살아 있음 |
| 18:34:45·18:34:49 | 최근 앱 목록 = DIBAY 메인(task 2084)·Chrome 만 | 통화 화면은 `excludeFromRecents` + 숨김이라 **화면에 통화를 다시 열 곳이 없음** (알림·앱 통화 바만 남음) |
| 18:34:56.959 | `Force stopping com.dibay.app … from pid 13468` (`ActivityManagerShellCommand.runForceStop`) | **adb `am force-stop`** — 사람 조작 아님. 프로세스가 즉시 죽어 서버 종료 PATCH 가 나가지 않음 |
| 18:35:34·18:35:42 | DB `caller_busy` 2건 | 서버는 아직 통화 중으로 봄 → Samsung 재발신 실패(`outgoing_create_session_failed`) |
| 18:35:51 | DB `ended_by_callee` | 상대가 직접 끊어서야 끝남(발신측 사라진 뒤 약 55초) |

원인은 세 가지가 겹친 것이다.
1. **시스템 PiP 닫기(X) = 통화 유지**가 현재 설계다(레거시 앱 Telegram·Signal 과 같은 동작 — §3)(`NativeVideoCallActivity.reportSurfaceLost:685-697` → `SURFACE_LOST` → `KEEP`, 2026-10-31 Owner 요구로 만든 P3). 사용자가 보기에는 「X 를 눌렀는데 안 끊김」이다.
2. PiP 안에 있는 앱의 끊기 버튼 아이콘이 **시스템 닫기와 같은 X 모양**(`android.R.drawable.ic_menu_close_clear_cancel`, `NativeVideoCallPipPresenter.java:44`)이다. 같은 메뉴에 X 가 두 개(하나는 끊기, 하나는 숨기기) 있다. 화면 캡처로는 확인하지 않았다(**배치는 NOT_PROVEN**, 아이콘 리소스는 코드 확인).
3. 서버는 **양쪽 heartbeat 가 모두 90초 끊겨야만** 자동 종료한다(`call-server-heartbeat.ts:8`, 한쪽만 끊긴 것은 종료 근거가 아님 — 2026-09-01 결정). 발신측 프로세스가 죽어도 상대가 살아 있으면 세션은 계속 `active` 다.
- 상대 기기에서 Agora 「상대 나감」을 받았는지, 상대 화면이 어땠는지는 **NOT_PROVEN**(상대 기기가 이 Mac 에 연결돼 있지 않음).

## 2. 기준 = 레거시 앱 (Owner 2026-11-12 「Owner 고집이 아니라 레거시 앱 기준을 따른다」)
Owner 결정을 묻지 않고, 아래 §3 의 레거시 앱 **공개 소스 근거**로 권장안을 정한다. 10-31 결정(PiP 닫기 = 통화 유지)은 레거시 기준과 **같은 방향**이라 충돌이 없다. 다른 점은 「닫은 뒤의 처리(카메라·알림·버튼)」다.

## 3. 레거시 앱 근거
### 3-0. Telegram 실측 (Samsung SM-M156S 3버튼 내비 · Telegram 영상 통화 연결 상태 · 2026-11-12 19:00~19:05 PHT)
증거: 화면 녹화 `tg1.mp4`(19:00:42~19:03:42), 단계별 캡처 16장, 두 기기 logcat 파일(지우지 않음), `dumpsys media.camera`·`dumpsys notification`·`dumpsys activity`.
| # | 동작 | Telegram 결과 | 같은 동작의 DIBAY (§4) |
|---|---|---|---|
| T1 | ◁ 뒤로 | 시스템 PiP 아님. **앱 안 대화창 + 떠 있는 작은 영상 창 + 「통화로 돌아가기」 초록 막대** | 시스템 PiP + 메신저 앞으로 (결과 화면은 비슷: 앱 위에 영상 창) |
| T2 | ○ 홈 | 시스템 PiP(`mode=pinned`). 홈 시작 19:01:13.437 → `PICTURE_IN_PICTURE_ENTER` 19:01:14.697 = **1.26초** | 시스템 PiP. 18:31:13.137 → 18:31:14.033 = **0.90초** (DIBAY 가 느리지 않음) |
| T3 | \|\|\| 최근 앱 (전체 화면에서) | 시스템 PiP 로 바뀌고 최근 앱 목록이 열림(19:02:27.900 → 19:02:29.533) | NOT_PROVEN |
| T4 | PiP 한 번 탭 → 메뉴 | 위: 설정·크기·전체 화면·**X**. 아래: **마이크 · 카메라 · 빨간 수화기(종료)** | 위: 같은 시스템 버튼 + X. 앱 버튼은 **X 모양 종료 1개** |
| T5 | **메뉴 X (시스템 닫기)** | `TAP_TO_REMOVE`(19:02:47.964) → **통화 유지**(상태 표시줄 통화 아이콘·통화 알림 유지, Xiaomi 계속 연결). **카메라 계속 켜짐**(`Active Camera Clients: org.telegram.messenger`, Camera ID 1) | 통화 유지, 카메라 계속 켜짐 — **같음** |
| T6 | X 이후 \|\|\| 최근 앱 | **Telegram 통화 화면 카드가 맨 앞에 보임** → 눌러서 복귀 가능 | **통화 카드 없음**(메인 카드만) — 다름 |
| T7 | X 이후 알림 탭 | 통화 화면으로 복귀(「3분 29초」 계속) | 알림 있음(내용 §4-1) |
| T8 | X 이후 최근 앱에서 카드 밀어 없애기 | 작업 2093 제거(19:04:24) → **통화·알림·카메라 유지**, 프로세스 유지 | 11-01 판단표 `SURFACE_LOST`=KEEP 로 같음(이번 실측 NOT_PROVEN) |
| T9 | 진행 중 통화 알림 | 맨 위 **어두운 통화 카드** 「텔레그램으로 통화 중 · BKKIM · 상대 사진」, 펼치면 **「통화 종료」 버튼**. DIBAY 일반 알림과 **따로**, 상태 표시줄에 **통화 아이콘** | 개발자 문구, 일반 알림, 다른 DIBAY 알림과 자동 그룹 |
| T10 | 알림 「통화 종료」 | 19:05:10 종료 → Xiaomi 「통화 종료 04:41」, Samsung 알림·카메라 정리 확인 | 같은 버튼 있음 |

### 3-4. DIBAY 같은 순서 실측 (통화 `ba09b163`, Xiaomi 발신 → Samsung 수신, 2026-11-12 19:19:04~19:25:24 PHT, DB `ended`·`ended_by_callee`)
증거: 녹화 `dv1.mp4`(19:19 부터 3분), 캡처, 두 기기 logcat 파일, dumpsys.
| # | 동작 | DIBAY 결과 | Telegram | 판정 |
|---|---|---|---|---|
| D1 | ◁ 뒤로 | 메신저 + PiP + 상단 「통화 중 · 00:29 · 통화 화면으로 돌아가기」 | T1 같음 | 정상 |
| D2 | 통화 바 탭 | 통화 화면 복귀(PiP 해제) | 「통화로 돌아가기」 | 정상 |
| D3 | ○ 홈 | PiP, 홈 19:19:47.456 → 진입 19:19:48.733 = **1.28초** | 1.26초 | 정상 |
| D4 | PiP 탭 → 메뉴 | 위 시스템 설정·크기·전체 화면·**X** / 아래 앱 버튼 **작은 회색 X 1개** | 마이크·카메라·빨간 수화기 | **FAIL** |
| D5 | 알림창 | 「DIBAY video call / Native video runtime」, DIBAY 일반 알림과 **「2」 묶음**, 상대 이름 없음. 상태 표시줄 통화 아이콘 **없음** | 맨 위 통화 카드·이름·사진·통화 아이콘 | **FAIL** |
| D6 | \|\|\| 최근 앱(전체 화면에서) | **PiP 안 됨** — `pip_activity_paused`·`stopped` 만, `pip_request` 없음(19:22:00) | PiP | **FAIL** |
| D7 | PiP X | `TAP_TO_REMOVE` 19:22:51 → 통화 유지(heartbeat 200)·카메라 DIBAY 사용·Xiaomi 04:05 연결 | 같음 | 정상 |
| D8 | X 후 최근 앱 | 메인 카드만, 통화 카드 없음 | 통화 카드 맨 앞 | **FAIL** |
| D9 | 알림 본문 탭 | 통화 화면 복귀(04:52) | 같음 | 정상 |
| D10 | 최근 앱에서 통화 카드 밀어 없애기 | 19:24:24 작업 제거 → `SURFACE_LOST`→KEEP, 통화 유지(Xiaomi 05:32) | 같음 | 정상 |
| D11 | 알림 「종료」 | **두 번 펼쳐야** 보임 → 19:25:23 종료, 2초 안 통화 알림·카메라·작업·PiP 0. **통화 채널 자동 그룹 요약(id=0) 잔류** | 한 번 펼치면 보임, 잔류 없음 | **FAIL** |

### 3-1. 공개 소스로 확인 (2026-11-12 PHT, GitHub main/master 원문 직접 열람)
| 항목 | Telegram (`DrKLO/Telegram`) | Signal (`signalapp/Signal-Android`) |
|---|---|---|
| **PiP 닫기(X)** | **통화 유지.** `LaunchActivity.onPictureInPictureModeChanged` 주석 「closing a PiP window never ends a call: it goes on with its notification」, `VoIPPipContent.onDismissed` 주석 「system PiP closed by the user: the call goes on」 | **통화 유지.** `WebRtcCallActivity.onStop` 은 끊지 않음. PiP 가 아닌 상태로 멈추면 `setEnableVideo(false)` = **내 카메라 끔** |
| 뒤로 ◁ | (자체 화면 흐름 — 이 범위 확인 못 함) | 수신 벨이 아니면 **PiP 진입**(`handleOnBackPressed` → `enterPipModeIfPossible`) |
| 홈 ○ | `setAutoEnterEnabled`(API 31+) + `onUserLeaveHint` | `setAutoEnterEnabled`(API 31+, 통화 가능 상태일 때만) + `onUserLeaveHint`(수신 벨 제외) |
| PiP 파라미터 | `setAspectRatio`·**`setSourceRectHint`**·`setActions`·`setAutoEnterEnabled`, Android 15 `onPictureInPictureUiStateChanged` 사용 | 상대 영상 비율 따라 `setAspectRatio` 갱신, **미리 `setPictureInPictureParams`** |
| PiP 버튼 | `CallPipActions`: **마이크 · 카메라 · 통화 종료(`msg_endcall` 수화기 아이콘)**, 휴대폰 최대 3개, 우선순위 마이크 > 카메라 끄기 > 종료 | 사용자 버튼 없음 |
| 시스템 닫기 동작 교체(`setCloseAction`) | 사용 안 함 | 사용 안 함 |
| 진행 중 통화 알림 | 포그라운드 알림, 상대 이름, **종료 버튼(수화기 아이콘)**, 통화 전용 작은 아이콘, 색 강조(`setColorized`), 누르면 통화 화면 | **`CallStyle.forOngoingCall(person, hangup).setIsVideo(…)`**, 상대 이름, `CATEGORY_CALL` |

### 3-2. 웹 자료 (보조 · 실측 아님)
- WhatsApp: 홈·뒤로 → PiP(2017 기사). PiP 닫기 결과는 확인 못 함.
- Google Duo/Meet·카카오톡·LINE·Messenger: 공식 자료 없음 → NOT_PROVEN.
- Jami 공식 문서: 「PiP 창을 닫아도 통화는 끝나지 않는다」.
- Android 공식 가이드: 통화 앱은 Android 12+ `setAutoEnterEnabled` 권장, 미리 `setPictureInPictureParams`. PiP 닫기 처리 지침은 없음. 진행 중 통화 알림은 `CallStyle.forOngoingCall`.

### 3-3. 레거시 기준 정리 (실측 우선, 소스 보조)
1. **PiP 닫기(X) = 통화 유지**, 알림으로 복귀 — Telegram 실측·Telegram 소스·Signal 소스·Jami 일치.
2. **X 뒤 카메라**: Telegram(실측) = 계속 켜짐, Signal(소스) = 끔 → 레거시끼리 다르다. **DIBAY 현재(켜짐) = Telegram 실측과 같으므로 바꾸지 않는다.**
3. **X 뒤 최근 앱에 통화 카드가 남아 다시 열 수 있다** — Telegram 실측.
4. **PiP 안 버튼 = 마이크 · 카메라 · 빨간 수화기 종료** — Telegram 실측·소스. 종료는 시스템 X 와 다른 아이콘.
5. **진행 중 통화 알림 = 통화 카드(이름·사진·종료 버튼), 일반 알림과 분리, 상태 표시줄 통화 아이콘** — Telegram 실측, Signal 소스(CallStyle).
6. 홈 → PiP 속도: DIBAY(0.90초)가 Telegram(1.26초)보다 느리지 않다 → 바꿀 근거 없음. 제스처 내비(Xiaomi)는 NOT_PROVEN.

## 4. 감사 — 하단 내비 3버튼 × 통화 상태 (DIBAY 현재 동작)
판정: 정상 = 로그로 확인 · 결함 = 로그/코드로 확인된 문제 · NOT_PROVEN = 이번 로그에 없음

| # | 버튼 · 상태 | 현재 동작 (근거) | 판정 |
|---|---|---|---|
| N1 | ◁ 뒤로 · 영상 연결됨 전체 화면 | PiP 진입 + 메신저 앞으로(`native_video_pip_request source=back_invoked` → `native_call_app_return via=move_to_front`, 18:31:04·18:31:23·18:32:32 세 번) | 정상 |
| N2 | ○ 홈 · 영상 연결됨 전체 화면 | `onUserLeaveHint` → PiP(홈 18:31:13.137 → 진입 18:31:14.033, **0.90초**, Telegram 1.26초) | 정상 |
| N3 | ○ 홈 · 제스처 내비(Xiaomi) | 같은 코드. 제스처 홈 애니메이션과 PiP 전환이 매끄러운지 | NOT_PROVEN (이번 통화 미참여) |
| N4 | \|\|\| 최근 앱 · 영상 연결됨 전체 화면 | `onUserLeaveHint` 로 PiP 가 되는지 | NOT_PROVEN (이번 로그의 최근 앱 3회는 모두 이미 PiP·숨김 상태였음) |
| N5 | \|\|\| 최근 앱 · PiP 중 | PiP 창이 그대로 떠 있음(18:30:17·18:30:37·18:33:14) | 정상 |
| N6 | PiP 한 번 탭 → 메뉴 → 전체 화면 | `EXPAND_TO_FULLSCREEN` → `connected_shell_restored`(9회 모두 복귀) | 정상 |
| N7 | PiP 메뉴 X(시스템 닫기) | 통화 유지 + 화면 숨김(§1). **카메라는 계속 켜져 상대에게 내 영상이 계속 감**(18:33:46 이후 카메라 HAL 로그 `ifunc_cam_twin` 계속, 18:34:57 강제 종료 때 `hardwareOps_stop`) | 정상 — Telegram 실측 T5 와 같음(통화 유지·카메라 켜짐) |
| N8 | PiP 메뉴의 앱 끊기 버튼 | 아이콘이 시스템 X 와 같은 모양(코드). 로그 출처가 `source=notification` 으로 찍혀 PiP 에서 눌렀는지 구분 안 됨(`NativeVideoCallActionReceiver:31`) | **결함** (아이콘·기록) |
| N9 | PiP 닫은 뒤 \|\|\| 최근 앱 | 통화 카드 없음(18:34:45·18:34:49 목록 = 메인·Chrome). 돌아갈 곳 = 알림·앱 통화 바뿐 | **결함** (Telegram T6 은 통화 카드가 맨 앞에 보임) |
| N10 | PiP 닫은 뒤 진행 중 통화 알림 | 알림 96001 은 게시됨(18:34:57 강제 종료 때 제거 로그). 내용은 §4-1 | **결함** |
| N11 | ◁/○ · 연결 전(벨·연결 중) | 뒤로 = 화면만 내림(P1, 10-31 PASS). 홈 = `isPipEligible`·`isDockEligible` 가 `CONNECTED` 만 허용 → PiP 없음 | 기존 결정대로. 이번 로그 NOT_PROVEN |
| N12 | PiP 중 \|\|\| 최근 앱에서 DIBAY 밀어 없애기 | 이번 로그 없음(18:34:56 은 adb 강제 종료) | NOT_PROVEN |
| N13 | 음성 통화 PiP | 같은 구조·같은 X 아이콘(`NativeVoiceCallPipPresenter.java:43`, 비율 3:4) | N7·N8 과 같은 결함 (코드 확인, 실기 NOT_PROVEN) |

### 4-1. 진행 중 통화 알림 (Owner 추가 지시: 알림에 「통화 중」이 보여야 함)
| # | 항목 | 현재 (근거) | 판정 |
|---|---|---|---|
| A1 | 영상 알림 문구 | 제목 `"DIBAY video call"`, 본문 **`"Native video runtime"`**(`NativeVideoCallService.java:161-170`) — 개발자 문구·영어 고정, 상대 이름·통화 시간 없음 | **결함** (i18n SSOT 위반 포함) |
| A2 | 영상 알림 형식 | `CallStyle` 미사용(일반 알림 + 「끊기」 버튼 1개). 음성은 `CallStyle.forOngoingCall` 사용(`NativeVoiceCallService.java:202`) → **영상만 상단 통화 표시(칩)·통화 알림 정렬을 못 받음** | **결함** |
| A3 | 무음·중요도 | `setSilent(true)` + 채널 `dibay_native_video_call_v2` 중요도 3 · 알림 플래그 `SILENT`(18:34:57 로그) → 「무음 알림」 영역으로 내려감 | 결함 후보 — 실제 알림창 위치는 **NOT_PROVEN**(캡처 안 함) |
| A4 | 묶임 | 통화 알림이 DIBAY 의 다른 알림(읽지 않은 알림 710001 등)과 함께 시스템 자동 그룹 `Aggregate_NormalNotificationSection` 으로 묶임(dumpsys·logcat 18:34:57) → 접힌 그룹 안에 숨을 수 있음 | 결함 후보 — 화면 NOT_PROVEN |
| A5 | 작은 아이콘 | `R.mipmap.ic_launcher`(컬러 앱 아이콘). 일반 알림은 단색 `R.drawable.ic_stat_dibay` 를 쓴다(`DibayNotificationPresentation.java:101`) → 상태 표시줄에서 흰 덩어리로 보일 수 있음 | 결함 후보 — 화면 NOT_PROVEN |
| A6 | 음성 알림 문구 | 제목 `"DIBAY voice call"`, 본문 `"Native voice runtime"`(`NativeVoiceCallService.java:166-175`) | **결함** (A1 과 같음) |
| A7 | 통화 종료 후 잔여 | 지금(18:47) Samsung 에 내용 없는 DIBAY 자동 그룹 요약 알림이 남아 있음(`originalFlags=ONGOING_EVENT…`) | 관찰만 — 원인 NOT_PROVEN |

## 5. 권장안 (레거시 실측 기준 · 구현 전 · 통화 규정 3번 승인 대상)
모두 **Android 네이티브만** 바꾼다. 웹·서버·DB·iOS 는 바꾸지 않는다. 통화 단독 PR. 레거시와 같은 동작은 바꾸지 않는다.

| ID | 권장 (근거) | 바꾸는 파일 | 바뀌는 동작 |
|---|---|---|---|
| R1 | **PiP 닫기(X) = 통화 유지, 카메라 그대로 — 현재 유지** (Telegram T5) | 없음 | 없음 |
| R2 | **PiP 버튼 = 마이크 · 카메라 · 빨간 수화기 종료**, 상태 바뀌면 버튼 갱신, 휴대폰 최대 3개 (Telegram T4·`CallPipActions`) | `NativeVideoCallPipPresenter`, `NativeVideoCallActionReceiver`(마이크·카메라 동작 추가 — 기존 `setCameraEnabled`·마이크 토글 재사용, 출처 `source=pip` 기록), drawable 3개, 문자열 키 ko·en | X 모양 종료 아이콘 → 수화기. 종료 동작(`ACTION_END` → USER_END)은 같음 |
| R3 | **영상 진행 중 알림 = 통화 카드**: `CallStyle.forOngoingCall(person, 끊기).setIsVideo(true)` + 상대 이름 + i18n 문구 + 통화 시간 + 단색 작은 아이콘 + DIBAY 일반 알림과 분리 (Telegram T9, Signal 소스) | `NativeVideoCallService.buildNotification`, 문자열 키 ko·en, 작은 아이콘 | 알림창 맨 위 통화 카드·상태 표시줄 통화 표시. `Native video runtime` 제거. 누르면 통화 화면(기존 Intent) |
| R4 | **PiP 닫은 뒤 최근 앱에 통화 카드 표시** — 연결된 동안만 통화 작업을 최근 앱에 보이게(`ActivityManager.AppTask.setExcludeFromRecents(false)`), 통화가 끝나면 다시 숨김 (Telegram T6) | `NativeVideoCallActivity`·`NativeVoiceCallActivity`(연결·종료 지점). 매니페스트 `excludeFromRecents` 는 그대로(벨·잠금 화면은 지금처럼 숨김) | 최근 앱에 「DIBAY 통화」 카드가 메인 카드 옆에 보임 → 눌러 복귀. 카드를 밀어 없애도 통화 유지(11-01 KEEP, Telegram T8 과 같음) |
| R5 | 음성 진행 중 알림 문구·아이콘 정리(이미 CallStyle) — `Native voice runtime` 제거 | `NativeVoiceCallService.buildNotification` | 문구·아이콘만 |
| R6 | 음성 PiP 종료 아이콘을 수화기로, 마이크 버튼 추가 (R2 와 같은 규칙) | `NativeVoiceCallPipPresenter`, `NativeVoiceCallActionReceiver` | 아이콘·버튼 |
| 폐기 | 앞 판의 카메라 끄기·`setCloseAction` | — | Telegram 실측과 같음. 자동 PiP 는 D6 실측(최근 앱 → PiP 안 됨)으로 **다시 필요** — 최종 설계는 `docs/dibay-call-minimized-surface-cta-ssot.md` §4-1 |
| 보고만 | 발신측 앱 강제 종료 시 상대 통화 잔류 — 서버 「양쪽 heartbeat 만료」 규칙 변경이라 이번 범위 밖 | — | 별도 감사 |

### 5-1. 영향받는 경로 (통화 규정 3번)
| 경로 | R2·R6 | R3·R5 | R4 |
|---|---|---|---|
| 발신 시작·세션 생성·VoIP/FCM·수신 화면·잠금 화면 수신 | — | 수신 알림 그대로(진행 중 알림만) | 벨·연결 중은 지금처럼 숨김 |
| 연결됨 → PiP | 버튼 | — | — |
| PiP 닫기 | — | 알림이 복귀 수단 | **최근 앱 카드가 복귀 수단 추가** |
| 최근 앱에서 통화 카드 제거 | — | — | 11-01 판단표 KEEP 경로(G1-3b 수정분)를 **더 자주 지남** |
| 종료·상대 종료·부재중·busy | 종료 아이콘만 | 알림 제거 경로 같음 | 종료 시 다시 숨김(카드 잔류 0) |
| 통화 기록·서버 heartbeat·종료 판단표 | — | — | — |
| iOS·웹·서버·DB | 무변경 | 무변경 | 무변경 |

### 5-2. 깨질 수 있는 것 → 같은 단계에서 막는 방법
| 위험 | 방지 |
|---|---|
| R2: 버튼 갱신이 잦아 PiP 깜박임 | 버튼 상태가 바뀔 때만 `setPictureInPictureParams`(Telegram `actionsKey` 방식) |
| R2: 마이크·카메라 상태가 통화 화면 버튼과 어긋남 | 같은 런타임 상태 하나를 PiP·화면이 함께 읽음 |
| R3: Android 11 이하 CallStyle 실패 | 음성과 같은 분기(API 31 미만 = 지금 방식) |
| R3: 알림 재게시 때 소리·진동 | 채널 변경 없음, `setOnlyAlertOnce`·`setSilent` 유지 |
| R4: 종료 후 최근 앱에 빈 통화 카드 잔류 | 종료·정리(`cleanup`) 지점에서 숨김 + 고아 회수 때 숨김. 실기 항목에 「종료 후 카드 0」 |
| R4: 카드 제거 → 통화 종료(09-21·G1-3b 회귀) | 11-01 판단표 `SURFACE_LOST`=KEEP 그대로. 실기에서 카드 제거 → DB `active` 유지 확인 |
| R4: 최근 앱에 DIBAY 카드 2장(메인·통화)으로 혼동 | 통화 카드 제목을 「통화 중」 i18n 라벨로(`setTaskDescription`) |
| 구 바이너리 | 네이티브 전용 → 새 빌드 설치 기기만 바뀜. 웹·서버 변경 없음 |

롤백: 네이티브 PR 되돌림 + 이전 빌드 재설치(웹 영향 없음).

## 6. 남은 승인 (통화 규정 3번 — 착수 승인)
- R2~R6 구현 착수. 통화 단독 PR, Android 빌드는 Owner 일괄 빌드 때.
- 카카오톡 실측은 Samsung 카카오톡 로그인 후 가능(Owner 로그인 필요). 권장안은 Telegram 실측·Signal 소스로 확정했으므로 기다리지 않는다.

## 7. 단계와 검증
| 단계 | 내용 | 검증 |
|---|---|---|
| 1 구현 | R2~R6, 통화 단독 PR | `typecheck:build`·통화 계약 vitest·`verify:call-*`·네이티브 단위 테스트(판단표 전 조합 불변) |
| 2 실기 | 통화 규정 5번 행렬 + 이 문서 T1~T10 과 같은 순서로 DIBAY 측정(Samsung 3버튼·Xiaomi 제스처) → Telegram 결과와 1:1 표 | 녹화 + logcat 파일 보존 + DB 세션 시각 대조, Production SHA·설치 버전 매번 기록 |

# DIBAY 통화·메신저 실기기 관찰 REPORT (2026-10-22)

절차: `docs/audit/messenger-2026-10-22-call-scenario-observation.md` (origin/claude/keen-ramanujan-1iwx5z)
역할: Owner=조작 · Cursor=로그 수집·기록 · 코드/DB 수정 없음 · 원인 추측 없음

## 준비
- 시각: 2026-10-22 18:46:18 PHT
- Samsung serial: RFCY40PY2CA
- Samsung APK dumpsys:     versionCode=11 minSdk=24 targetSdk=36     versionName=1.2.4 
- 웹 SHA (설정→버전정보): NP — 기기 조작 금지로 UI 미확인 (Owner 전달 시 갱신)
- user_devices.app_version: NP — 본 준비에서 운영 조회 미실행 (Owner/별도 전달 시 갱신)
- Samsung logcat: `.tmp/call-scenarios-2026-10-22/samsung.log` 수집 중
- iPhone console: `.tmp/call-scenarios-2026-10-22/iphone-console.log` (idevicesyslog) 수집 중

---

## 준비 (Claude 로컬 세션 · 19:00 PHT 재시작)
- 웹 배포 SHA (Samsung 내정보→버전 정보 화면): **a077795** · Samsung 앱 1.2.4 (11)
- user_devices.app_version (운영 DB 읽기 전용, 최신 행): q테스트1 android 1.2.4 (11) · w테스트1 ios **1.2 (7)** (device d0c29f5a…, 07:13:23Z) · zxzx11 android 1.2.4 (11)
- 로그: samsung.log · xiaomi.log (adb logcat -v threadtime) · iphone-console.log (idevicesyslog, USB — Xcode 콘솔 동등)
- 관찰 제약: iPhone 미러링은 iPhone **잠금 상태에서만** 연결됨 · 미러링 화면에 **CallKit 수신 화면이 표시되지 않음**(Mac 에도 없음) → iPhone 받기·거절·끊기는 Owner 실기기 조작

### A1(시도 1) — S→I 음성, I 잠금(미러링 연결로 잠금)·앱 종료 상태 · **받지 않음 → 응답 없음 종료**
- 시각: 다이얼 확인 19:07:26 → S 「응답 없음」 팝업 (S 로그 종료 처리 19:08:01) · callId: c8f5d827-ed0b-443a-af5f-6ab37476a5de
- Owner: 벨 옴 · 받지 않음 (Owner 가 받기 지시를 늦게 받음 — 시나리오 A8(무응답) 과 유사 데이터)
- iPhone 콘솔: `19:07:31.205268 [DIBAY_CALL] [voip] received callId=c8f5…a5de kind=incoming_call eligibleFlag=true hasBound=true boundPrefix=edc8c2f0 presentable=true` · `19:07:31.208297 callservicesd Received -[CXCallSource reportNewIncomingCallWithUUID:update:reply:]` · `19:07:31.532307 marker=I3 event=reportNewIncomingCall_ok` · `19:07:31.532323 [voip] completion callId=c8f5…a5de incoming`
- 발신 확인(19:07:26)→iPhone VoIP 수신(19:07:31.205) ≈ 5s
- S 팝업: 「응답 없음 · 상대방이 응답하지 않습니다.」 1회
- Samsung 알림(dumpsys): DIBAY 2개 — ch=dibay_native_video_call_v2 (제목·본문 없음) · dibay_app_icon_summary_v1 「읽지 않은 알림 129개」
- 녹화: A1/A1.mp4 (Samsung)
- 이상점: 1) 발신 확인 후 iPhone VoIP 수신까지 약 5초
- 시도 1 이후 iPhone 콘솔 (Owner 가 앱 종료하기 전, 앱이 백그라운드에서 살아 있던 구간):
  - `19:08:02.705476 callservicesd(CallKit) Received -[CXCallSource reportCallWithUUID:endedAtDate:privateReason:failureContext:reply:] ... privateEndedReason: 3`
  - `19:08:03.205025 [DIBAY_CALL] [voip] received callId=c8f5…a5de kind=missed_call eligibleFlag=true hasBound=true boundPrefix=edc8c2f0 presentable=true`
  - `19:08:03.205996 [DIBAY_CALL_V4] ios_voip_terminal_already_suppressed callId=c8f5d827-… owner=terminal reason=completion_only kind=missed_call`
  - `19:08:03.206119 [DIBAY_CALL] [voip] completion callId=c8f5…a5de already_terminal_suppressed kind=missed_call`
  - `19:08:03.213133 SpringBoard(FrontBoard) [app<com.dibay.app>:5367] Process exited: <RBSProcessExitContext| specific, status:<RBSProcessExitStatus| domain:signal(2) code:SIGABRT(6)>>.`
  - `19:08:10.624776 callservicesd(RunningBoardServices) Sending terminate request: ... app<com.dibay.app((null))> ... context:<RBSTerminateContext| domain:10 code:0xBAADCA11`
  - (missed_call VoIP 수신 후 CallKit reportNewIncomingCall 줄 없음)

### A1(시도 2) — S→I 음성, I ①꺼짐(Owner 잠금 해제·앱 종료·홈 화면) · **수신 화면 안 옴 → 응답 없음**
- 시각: 다이얼 확인 19:11:45 → S 응답 없음 처리 19:12:18~19:12:20 · callId: aad71c55-6984-4688-b139-215b8d8eaa39
- Owner 체크: 1 벨/수신 화면 **안 옴** · 2~5 해당 없음 · 6 (미확인) · 7 S 「응답 없음」 팝업 1회
- iPhone 콘솔:
  - `19:11:49.361817 callservicesd[5412] <Notice>: VoIP push for app <private> dropped on the floor`
  - `19:11:50.070886 SpringBoard [com.dibay.app] Received remote notification request 709E-2C6E [ waking: 0, hasAlertContent: 1, hasSound: 1 hasBadge: 1 ... pushType: Alert]` → `19:11:50.081648 Delivered user visible push notification 709E-2C6E` → `19:11:50.089466 Withdrawing notification 709E-2C6E`
  - `19:12:21.839606 callservicesd[5412] <Notice>: VoIP push for app <private> dropped on the floor`
  - `19:12:22.491211 [com.dibay.app] Received remote notification request 1752-4D3D [hasAlertContent: 1, hasSound: 1 ...]` → `19:12:22.500289 Delivered user visible push notification 1752-4D3D`
  - 이 구간 App(DIBAY) 프로세스의 `[DIBAY_CALL] [voip]` 줄 없음
- Samsung logcat: `19:11:50.171 [DIBAY_CALL_V4] missed_timer_start` · `19:12:18.695 missed_timer_fire` · `19:12:20.407 native_outgoing_ringback_stop callId=aad71c55-… reason=missed` · `19:12:20.889 missed_patch_done`
- Samsung 알림(dumpsys): DIBAY 2개 (ch=dibay_native_video_call_v2 제목·본문 없음 · 앱 아이콘 요약 129개) — 시도 1 과 동일
- 녹화: A1/A1.mp4
- 이상점:
  1) iPhone 수신 화면·벨 없음 — callservicesd `VoIP push ... dropped on the floor` (19:11:49)
  2) 같은 시각 iPhone 일반 알림(소리 있음) 709E-2C6E 전달 후 즉시 Withdrawing
  3) 시도 1 종료 뒤 missed_call VoIP 수신 → `already_terminal_suppressed` completion → 앱 SIGABRT 종료(19:08:03) → callservicesd terminate 0xBAADCA11(19:08:10) 순서가 시도 2 이전에 기록됨
  4) 무응답 후 19:12:21 VoIP 한 번 더 dropped + 일반 알림 1752-4D3D 전달

### A2 — S→I 음성, I ②잠금(앱 종료) · **수신 화면 안 옴 → 응답 없음**
- 시각: 다이얼 확인 19:14:21 → S 「응답 없음」 19:14:55 · callId: ff346864-47ba-4811-9ce0-064448f415c9
- Owner 체크: 1 수신 화면·벨 **안 옴** · 2~5 해당 없음 · 6 (미확인) · 7 S 「응답 없음」 팝업 1회
- iPhone 콘솔:
  - `19:14:24.875305 callservicesd[5412] <Notice>: VoIP push for app <private> dropped on the floor`
  - `19:14:26.019945 [com.dibay.app] Received remote notification request BF37-4025 [hasAlertContent: 1, hasSound: 1 ...]` → `19:14:26.030823 Delivered user visible push notification BF37-4025` → `19:14:26.038503 Withdrawing notification BF37-4025` · `19:14:26.045829 Withdrawing notification 1752-4D3D`
  - `19:14:57.281567 callservicesd[5412] <Notice>: VoIP push for app <private> dropped on the floor`
  - `19:14:57.422315 Received remote notification request A8CD-6625 [hasAlertContent: 1, hasSound: 1 ...]` → `19:14:57.431845 Delivered user visible push notification A8CD-6625`
  - App(DIBAY) `[DIBAY_CALL]` 줄 없음
- Samsung logcat: `19:14:25.829 missed_timer_start` · `19:14:53.693 missed_timer_fire` · `19:14:55.465 native_outgoing_ringback_stop callId=ff346864-… reason=missed` · `19:14:55.668 missed_patch_done`
- Samsung 알림(dumpsys): DIBAY 2개 (A1 과 동일)
- 녹화: A2/A2.mp4
- 이상점: 1) VoIP dropped (A1 시도 2 와 동일 패턴) 2) 수신 시 일반 알림 전달 직후 Withdrawing 3) 무응답 뒤 VoIP dropped + 일반 알림 1건 전달

### A3 — S→I 음성, I ③뒤(앱 연 뒤 홈) · **수신 화면 안 옴 → 응답 없음**
- 시각: 다이얼 확인 19:17:14 → S 「응답 없음」 19:17:48 · callId: d3e52402-7f96-487b-b59f-eae1e8362635
- Owner 체크: 1 수신 화면·벨 **안 옴** · 2~5 해당 없음 · 6 (미확인) · 7 S 「응답 없음」 팝업 1회
- iPhone 콘솔:
  - (준비 중) `19:16:02.980973 SpringBoard(FrontBoard) [app<com.dibay.app>:5407] Workspace state did change: FG-Active[90] --> XX-None[0] (assertion dropped).`
  - `19:17:17.056692 callservicesd[5412] <Notice>: VoIP push for app <private> dropped on the floor`
  - `19:17:17.773070 Received remote notification request FE57-9E0B [hasAlertContent: 1, hasSound: 1]` → `19:17:17.786276 Delivered` → `19:17:17.795938 Withdrawing notification FE57-9E0B` · `19:17:17.800414 Withdrawing notification A8CD-6625`
  - `19:17:50.822920 callservicesd[5412] <Notice>: VoIP push for app <private> dropped on the floor`
  - `19:17:50.883325 Received remote notification request 65C7-B8BE [hasAlertContent: 1, hasSound: 1]` → `19:17:50.906835 Delivered user visible push notification 65C7-B8BE`
  - App(DIBAY) `[DIBAY_CALL]` 줄 없음
- Samsung logcat: `19:17:46.693 missed_timer_fire` · `19:17:48.360 native_outgoing_ringback_stop callId=d3e52402-… reason=missed`
- Samsung 알림(dumpsys): DIBAY 2개 (A1 과 동일) · 녹화: A3/A3.mp4
- 이상점: A2 와 동일 (앱 백그라운드 상태에서도 VoIP dropped)

### A4 — S→I 음성, I ④켜짐(메신저 화면) · **수신·연결 OK → S 가 끊자 iPhone 「통화를 시작하지 못했습니다」 빨간 배너**
- 시각: 다이얼 확인 19:18:52 → iPhone CallKit 보고 19:18:55.5 → 받기 19:19:01.8 → 연결 19:19:03.6 → S 종료 탭 19:19:38 → iPhone 화면 닫힘 19:19:43.8 · callId: 527c59ed-56af-402c-a505-49dc6344c38c
- Owner 체크: 1 수신 화면 옴 · 3 연결 OK(받음) · 5 **iPhone 에 「통화를 시작하지 못했어요/습니다」 빨간 배너** (Samsung 이 끊은 직후) · 2·4·6 (미확인) · 7 S 팝업 없음
- iPhone 콘솔:
  - `19:18:55.437672 callservicesd[5412] <Notice>: Application <private> will not be launched because it failed to report an incoming call too many times or repeatedly crashed. However because the app is foreground, delivering V…`
  - `19:18:55.439291 [DIBAY_CALL] [voip] received callId=527c…c38c kind=incoming_call ... presentable=true` · `19:18:55.517495 [callkit] report success`
  - `19:18:56.070347 [com.dibay.app] Received remote notification request B469-3858 [hasAlertContent: 1, hasSound: 1]` → `Adding notification B469-3858 [ hasAlertContent: 1, shouldPresentAlert: 0 hasSound: 1 shouldPlaySound: 0 ]` (앱 포그라운드 — 표시 안 함)
  - `19:19:01.840603 ios_native_voice_answer_started` · `19:19:03.284457 ios_native_voice_callkit_fulfilled` · `19:19:03.553203 ios_native_voice_agora_local_joined` · `19:19:03.561620 ios_native_voice_agora_remote_joined`
  - `19:19:38.492646 [DIBAY_CALL] ios_native_voice_cleanup_started sessionId=527c…c38c reason=mediaFailed`
  - `19:19:38.493671 [DIBAY_CALL] ios_native_voice_cleanup_started sessionId=527c…c38c reason=fail_after_fulfill`
  - `19:19:38.494000 [DIBAY_CALL] ios_callkit_terminal_suppressed sessionId=527c…c38c reason=fail_after_fulfill`
  - `19:19:38.494110 [DIBAY_CALL] ios_native_voice_callkit_end sessionId=527c…c38c reason=fail_after_fulfill`
  - `19:19:38.497215 callservicesd Received -[CXCallSource reportCallWithUUID:endedAtDate:...] privateEndedReason: 1`
  - `19:19:38.869629 [DIBAY_CALL] ios_native_voice_agora_leave sessionId=527c…c38c reason=fail_after_fulfill`
  - `19:19:39.862949 [DIBAY_CALL] [voip] received callId=527c…c38c kind=call_ended` → `19:19:39.863613 [DIBAY_CALL_V4] ios_voip_terminal_already_suppressed ... reason=completion_only kind=call_ended` → `[voip] completion ... already_terminal_suppressed kind=call_ended` (CallKit reportNewIncomingCall 없음)
  - `19:19:40.683620 Adding notification D783-81F7 [ hasAlertContent: 1, shouldPresentAlert: 0 hasSound: 1 shouldPlaySound: 0 ]`
  - `19:19:43.829451 [DIBAY_CALL] ios_native_voice_ui_dismissed`
  - 콘솔에 `remote_offline` 문자열 줄 없음 (grep 0건)
- Samsung logcat: `19:19:03.633 native_outgoing_ringback_stop reason=connected` · `19:19:03.649 active_call_connected` · `19:19:38.436 terminal_tombstone_mark reason=end` · `19:19:40.373 call_end_signal_sent reason=ended` · `19:19:40.389 terminal_received status=ended source=webview_inject`
- Samsung 알림(dumpsys): DIBAY 2개 (A1 과 동일) · 녹화: A4/A4.mp4
- 이상점:
  1) callservicesd: 「failed to report an incoming call too many times or repeatedly crashed」 → 포그라운드일 때만 VoIP 전달
  2) S 종료(19:19:38.4) 0.06s 뒤 iPhone `cleanup reason=mediaFailed` → `fail_after_fulfill` → 빨간 배너 (Owner 확인)
  3) iPhone 이 call_ended VoIP 를 S 종료 신호(19:19:40.37) 보다 앞선 19:19:39.86 에 수신, CallKit 보고 없이 completion
  4) 연결 직후 일반 알림(소리 있음) B469-3858 · 종료 후 D783-81F7 수신 (포그라운드라 표시 안 함 로그)

### A5 — S→I 음성, I ①꺼짐 · **CallKit 수신 화면 안 옴, 일반 알림 배너만 옴 → 거절 불가 → 응답 없음**
- 시각: 다이얼 확인 19:21:43 → S 「응답 없음」 19:22:17 · callId: e88fbab6-8c5a-4ee8-b765-69f88a4b3c42
- Owner 체크: 1 CallKit 수신 화면 **안 옴** · 2 **수신 화면이 아닌 알림이 옴**(Owner) · 7 S 「응답 없음」 팝업 1회
- iPhone 콘솔:
  - `19:21:46.564907 callservicesd[5412] <Notice>: Application <private> will not be launched because it failed to report an incoming call too many times (or repeatedly crashed.)`
  - `19:21:46.565011 callservicesd[5412] <Notice>: VoIP push for app <private> dropped on the floor`
  - `19:21:47.300775 [com.dibay.app] Received remote notification request A70F-EA2B [hasAlertContent: 1, hasSound: 1 ... pushType: Alert]` → `19:21:47.323123 Adding notification A70F-EA2B [ hasAlertContent: 1, shouldPresentAlert: 1 hasSound: 1 shouldPlaySound: 1 ]` → `19:21:47.325401 Withdrawing notification A70F-EA2B` · `Withdrawing notification 65C7-B8BE`
  - `19:22:18.886785 ... will not be launched because it failed to report an incoming call too many times (or repeatedly crashed.)` · `19:22:18.886794 VoIP push ... dropped on the floor`
  - `19:22:19.516914 Received remote notification request 4045-A602` → `19:22:19.536009 Adding notification 4045-A602 [shouldPresentAlert: 1 hasSound: 1 shouldPlaySound: 1]`
- Samsung logcat: `19:22:15.692 missed_timer_fire` · `19:22:17.370 native_outgoing_ringback_stop callId=e88fbab6-… reason=missed`
- 녹화: A5/A5.mp4
- 이상점: 1) 거절 시험 불가(수신 화면 없음) 2) callservicesd 앱 실행 거부 + VoIP dropped 3) 수신 일반 알림 표시(shouldPresentAlert 1·소리 1) 후 0.002s 뒤 Withdrawing 4) 무응답 뒤 일반 알림 4045-A602 표시(소리 1)

### A6 — S→I 음성, I ②잠금(앱 종료) · **수신 화면 안 옴 → 거절 불가 → 응답 없음**
- 시각: 다이얼 확인 19:24:04 → S 「응답 없음」 19:24:39 · callId: 19440c0a-0118-4e60-b938-2e04dce74401
- Owner 체크: 1 수신 화면 **안 옴** · 7 S 「응답 없음」 팝업 1회
- iPhone 콘솔:
  - `19:24:08.586700 ... will not be launched because it failed to report an incoming call too many times (or repeatedly crashed.)` · `19:24:08.586710 VoIP push for app <private> dropped on the floor`
  - `19:24:09.103771 Received remote notification request 2CF4-E360` → `19:24:09.119709 Adding notification 2CF4-E360 [shouldPresentAlert: 1 hasSound: 1 shouldPlaySound: 1]` → `19:24:09.121802 Withdrawing notification 2CF4-E360` · `Withdrawing notification 4045-A602`
  - `19:24:41.046379 ... will not be launched ...` · `19:24:41.046388 VoIP push ... dropped on the floor`
  - `19:24:41.549505 Received remote notification request 70B6-F640` → `19:24:41.560424 Adding notification 70B6-F640 [shouldPresentAlert: 1 hasSound: 1 shouldPlaySound: 1]`
- Samsung logcat: `19:24:39.307 native_outgoing_ringback_stop callId=19440c0a-… reason=missed` · 녹화: A6/A6.mp4
- 이상점: A5 와 동일 (측면 버튼 거절 시험 불가)

### A7 — S→I 음성, I ①꺼짐 · S 5초 뒤 취소 · **iPhone 30초간 수신 화면·벨·알림 없음 (Owner)**
- 시각: 다이얼 확인 19:25:50 → S 종료 탭 19:25:55 · callId: ea4b32ad-dfec-429d-a59e-fc5176beb389
- Owner 체크: 1 수신 화면·벨 없음 · 6 30초간 알림 없음 · 7 S 팝업 없음
- iPhone 콘솔:
  - `19:25:54.676833 ... will not be launched because it failed to report an incoming call too many times (or repeatedly crashed.)` · `19:25:54.676843 VoIP push ... dropped on the floor`
  - `19:25:55.687684 Received remote notification request 969B-9090` → `19:25:55.701840 Adding notification 969B-9090 [shouldPresentAlert: 1 hasSound: 1 shouldPlaySound: 1]` → `19:25:55.703829 Withdrawing notification 969B-9090` · `Withdrawing notification 70B6-F640`
  - `19:25:57.848394 ... will not be launched ...` · `19:25:57.848404 VoIP push ... dropped on the floor`
  - `19:25:58.920297 Received remote notification request C6DA-62DC` → `19:25:58.931121 Adding notification C6DA-62DC [ hasAlertContent: 1, shouldPresentAlert: 1 hasSound: 1 shouldPlaySound: 1 ]` (Withdrawing 줄 없음)
- Samsung logcat: `19:25:55.647 native_outgoing_ringback_stop callId=ea4b32ad-… reason=end` · `19:25:55.658 terminal_tombstone_mark reason=end` · `19:25:56.927 ring_stop source=native_foreground` · **`19:26:22.322 active_call_phase IDLE -> LOCAL_ENDING source=cancelled`** · `19:26:22.322 active_call_cleanup reason=cancelled` · `19:26:22.331 call_end_signal_sent reason=cancelled`
- 녹화: A7/A7.mp4
- 이상점:
  1) iPhone 로그상 취소 직후 일반 알림 C6DA-62DC 가 shouldPresentAlert 1·소리 1 로 추가됐으나 Owner 는 알림 없음으로 봄 (로그와 Owner 관찰 불일치 — 녹화 없음)
  2) S 종료 탭(19:25:55.6) 후 `active_call_cleanup reason=cancelled`·`call_end_signal_sent reason=cancelled` 가 19:26:22.3 (약 26.7s 뒤)
  3) 수신 VoIP 와 두 번째 VoIP 모두 dropped

### A8 — S→I 음성, I ①꺼짐 · 무응답 · **수신 화면 없음 · 부재중 알림 1개 (Owner)**
- 시각: 다이얼 확인 19:28:19 → S 「응답 없음」 19:28:53 · callId: 0abd8479-5dfe-44cc-91d8-84963403c035
- Owner 체크: 1 수신 화면 없음 · 6 **부재중 알림 1개** · 7 S 「응답 없음」 팝업 1회
- iPhone 콘솔:
  - `19:28:22.335335 ... will not be launched because it failed to report an incoming call too many times (or repeatedly crashed.)` · `19:28:22.335345 VoIP push ... dropped on the floor`
  - `19:28:22.945435 Received remote notification request BEBF-A64F` → `19:28:22.958458 Adding notification BEBF-A64F [shouldPresentAlert: 1 hasSound: 1 shouldPlaySound: 1]` (이번엔 Withdrawing 줄 없음)
  - `19:28:55.408323 ... will not be launched ...` · `19:28:55.408332 VoIP push ... dropped on the floor`
  - `19:28:56.930772 Received remote notification request 587D-2DCE` → `19:28:56.942328 Adding notification 587D-2DCE [shouldPresentAlert: 1 hasSound: 1 shouldPlaySound: 1]`
- Samsung logcat: `19:28:53.464 missed_patch_done` · `19:28:53.720 native_outgoing_ringback_stop callId=0abd8479-… reason=missed` · 녹화: A8/A8.mp4
- 이상점: 1) 수신·부재중 VoIP 모두 dropped 2) 로그상 일반 알림 2건 표시(BEBF 수신·587D 종료 후), Owner 확인은 부재중 1개

## 묶음 A 요약 (관찰 사실만)
- iPhone CallKit 수신 화면이 뜬 경우: A1 시도 1(앱 종료+잠금, 19:07) · A4(앱 포그라운드)
- A1 시도 1 무응답 종료 뒤 missed_call VoIP → `ios_voip_terminal_already_suppressed` completion → 앱 SIGABRT(19:08:03) → callservicesd terminate 0xBAADCA11(19:08:10)
- 이후 앱이 포그라운드가 아니면 매 VoIP 마다 `will not be launched because it failed to report an incoming call too many times (or repeatedly crashed.)` + `dropped on the floor` (A1 시도 2 · A2 · A3 · A5 · A6 · A7 · A8 — 수신·종료 VoIP 모두)
- A4: 포그라운드라 VoIP 전달 → 연결 OK → S 종료 0.06s 뒤 `cleanup reason=mediaFailed` → `fail_after_fulfill` → iPhone 빨간 배너 「통화를 시작하지 못했…」(Owner)
- 거절(A5·A6) 시험 불가 — 수신 화면 없음
- 매 통화 이벤트마다 iPhone 일반 알림(소리 있음) 수신 — 수신 시 알림은 대부분 즉시 Withdrawing (A8 은 아님)
- A7: S 종료 후 `call_end_signal_sent reason=cancelled` 가 약 27s 뒤

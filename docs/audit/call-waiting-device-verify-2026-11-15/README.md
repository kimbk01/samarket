# 대기 통화 실기 CW (2026-11-15 PHT) · Production 34735b755

## 조건
- 운영 34735b755 (PR #326) READY. Android Samsung SM-M156S q테스트1(qqqq) 1.2.7 (55) = B, Xiaomi 태블릿 zxzx11 1.2.7 (53) = C,
  맥 DIBAY(김봉기 09003red, Debug) = A, iOS 시뮬 DIBAY-Scene 선양소주(asas22) 1.2.2 (41).
- 설치 확인: 운영 `user_devices` 16:21 PHT (qqqq 55·활성 1대, asas22 41·활성 1대).
- 운영 데이터 변경: asas22 옛 기기 5행 `is_active=false` (16:13:53 PHT, Owner 지시, 백업 `asas22-user-devices-backup-before.json`).

## 조건 섞임 (다른 세션 알림 16:3x PHT)
- 16:26~16:29 PHT 다른 세션이 Xiaomi(C) WebView 를 CDP 로 조작(목록 다시 읽기·폭 맞춤·줄 누름·history.back).
  이 구간 CW4·CW2·CW5 의 판정 근거는 B 로그·운영 DB 이며, C 는 통화 유지 역할(세션 735ecd1e 계속 active, 16:29 C 화면 06:21).
  다만 이 구간 「C 통화 유지」 항목은 조건이 섞였으므로 재실기에서 다시 확인한다.

## 결과
| 항목 | 판정 | 증거 |
|---|---|---|
| CW1 대기 알림+대기음, C 유지 | **FAIL (알림 유지)** / 나머지 PASS | present 16:27:59 · heads-up 「거절 / 종료 후 받기」 보임(cw2-h2) → 약 3~6초 뒤 사라짐(cw2-h8 16:28:05), 30초 동안 알림 줄에만 남음. 대기음 ToneGenerator 22 시작 로그. C 통화 유지 |
| CW2 거절 | PASS | reject 16:28:56.7 → 200, 세션 rejected/declined, A 「통화 거절」, B·C 유지 |
| CW3 종료 후 받기 | PASS(화면·DB) · 소리 NOT_PROVEN | end_and_accept 16:31:45.2 → 기존 ended_by_callee 45.6 → 새 통화 answered 46.8 · Agora join 47.8, 양쪽 「통화 중」 |
| CW4 무응답 30초 | PASS | timeout 16:27:22.856, 서버 missed 23.055, B 「김봉기 · 부재중 음성 통화」, A 대화 「부재중 발신」 |
| CW5 A 취소 | PASS | cancel 16:29:46.7, B 대기 닫힘 46.988, missed_call 푸시 48.3, B·C 유지 |
| CW6 C 먼저 종료 | PASS | C 종료 16:30:37 → promote 16:30:38.3 → B 일반 수신 화면 |
| CW7~12 B=iPhone | NOT_PROVEN | 시뮬레이터가 CallKit 발신을 즉시 종료(CXEndCallAction 16:24:54, source=callkit_system_button) — 통화 유지 역할 불가, 실기기 필요 |
| CW13 영상 조합 | NOT_PROVEN | 미실시(CW1 FAIL 로 중단) |
| CW14 구 빌드 기기 섞임 | NOT_PROVEN | 미실시 |
| CW15 울리는 중·거는 중 | NOT_PROVEN | 미실시 |
| CW16 세 번째 발신 | NOT_PROVEN | 시뮬 발신 탭 미반영(세션 없음) |
| CW17 맥 B | NOT_PROVEN | 미실시 |
| CW18 기본 행렬 | NOT_PROVEN | 미실시 |

## CW1 FAIL 원인 (확정)
- `NativeCallWaitingPresenter.showNotification` 은 보통 알림(PRIORITY_HIGH·ongoing·버튼 2개)만 만든다. `setFullScreenIntent` 없음.
- Android SystemUI 는 전체 화면 인텐트가 있는 알림만 heads-up 을 자동으로 내리지 않는다(`canEntryDecay` 가 fullScreenIntent 있으면 false). 그 밖의 heads-up 은 몇 초 뒤 알림 줄로 들어간다 — 실측 3~6초.
- 기존 일반 수신은 FSI + CallStyle(`IncomingCallNotificationBuilder`)이라 남는다. 대기 알림만 이 계약에서 빠졌다(PR #324 구현 결함 — 작업자 잘못).

## 수정 설계안 (Owner 승인 필요 · 통화 규정 3)
1. 대기 알림에 FSI 추가 — 대상: 진행 중 통화 화면(`NativeVoiceCallActivity` / `NativeVideoCallActivity`, singleTask) + extra `call_waiting_call_id`. 기기 사용 중에는 시스템이 FSI 를 「고정 heads-up」으로 보여 선택할 때까지 유지, 화면 꺼짐·잠금이면 통화 화면을 켠다.
2. 통화 화면 안 대기 띠 — 두 통화 화면 상단에 「OO님 대기 중 · 거절 · 종료 후 받기」 띠. Presenter present/terminal/timeout 때 표시·제거(같은 액션 receiver 사용). 앱 통화 화면을 보는 동안에는 알림과 무관하게 항상 보인다(Google 전화·WhatsApp 과 같은 형태).
- 바뀌는 파일: `NativeCallWaitingPresenter.java`, 두 통화 Activity·레이아웃, 문자열(ko/en). 서버·웹·iOS 무변경.
- 영향: 대기 통화(빌드 55 이상 + 서버 waiting=true)에만. 구 바이너리·일반 수신 무영향.
- 위험: FSI 가 잠금 화면에서 통화 화면을 띄우는 경로 — 통화 중 근접 센서로 화면 꺼진 상태 확인 필요.
- 빌드: Android versionCode 56. 롤백 = 앱 이전 빌드(서버는 waiting 유지해도 55 동작으로 돌아감).
- 실기: heads-up 30초 유지(1초 간격 프레임), 화면 꺼짐 상태, 통화 화면 띠, CW1~CW6 재실시.

## 재실기 — Android versionCode 56 (PR #328, 운영 01f8071ef) · 16:46~16:50 PHT
조건: Samsung q테스트1 1.2.7 (56) 활성 1대(운영 user_devices 16:45:32), C = Xiaomi zxzx11 (53), A = 맥 김봉기. 다른 세션 기기 사용 없음(16:40 종료 통보).

| 항목 | 판정 | 증거 |
|---|---|---|
| CW1 대기 알림 유지 | PASS(유지) · **FAIL(알림 2개 겹침, 아래 절)** | present 16:47:14.7 → heads-up 16:47:19·25·36·42 프레임 모두 「거절 / 종료 후 받기」 유지(re56-s-15·s-25) → 타임아웃 16:47:44.7 뒤 사라짐(re56-s-28·s-32). 통화 화면 대기 띠 표시(re56-s-01) |
| CW2 거절 | PASS | reject 16:48:34.36 → 200, 세션 rejected/declined, A 「통화 거절」, B·C 유지(re56-s-cw2a) |
| CW3 종료 후 받기(통화 화면 띠 버튼) | PASS(화면·DB) · 소리 NOT_PROVEN | heads-up 밀어 치운 뒤 띠 표시(re56-s-cw3-2-banner) → 띠 버튼 16:49:37.2 → 기존 ended_by_callee 37.674 → 새 통화 answered 38.966, B 「김봉기 통화 중」 |
| CW4 무응답 30초 | PASS | 세션 missed 16:47:44.6, missed_call 푸시 16:47:46, B 「김봉기 · 부재중 음성 통화」 |
| CW5 A 취소 | PASS | cancel 16:49:10.6 → B 알림·띠 닫힘 16:49:10.866, missed_call 16:49:12, B·C 유지(re56-s-cw5) |
| CW6 진행 중 상대 먼저 종료 | PASS | A 종료 16:50:24.6 → promote 16:50:25.3 → B 일반 수신 화면(re56-s-cw6) |
| CW7~18 | NOT_PROVEN | iPhone 실기기 필요(시뮬레이터 CallKit 발신 즉시 종료) · 영상·구 빌드 섞임·울리는 중·세 번째·맥 B·기본 행렬 미실시 |

## FAIL — 대기 알림 2개 동시 표시 (Owner 지적 2026-11-15, 56 재실기 프레임으로 확인)
- 16:47:15 프레임: 통화 화면 대기 띠(검은 상자, NativeCallWaitingBanner)만 보임 (`re56-dup-1-banner-only.png`).
- 16:47:16~16:47:42 프레임: 그 위에 시스템 heads-up(흰 상자, FSI 대기 알림)이 겹쳐 같은 내용·같은 버튼이 두 번 보임. 아래 띠의 빨강·초록 버튼이 흰 알림 뒤로 비침 (`re56-dup-2-hun-over-banner.png`).
- 원인(작업자 설계 결함, PR #328): 대기 알림을 **통화 화면이 보이는지와 상관없이** 항상 FSI(시끄러운 알림)로 올리고, 통화 화면 안 띠도 함께 그림 → 앱 통화 화면이 앞에 있을 때 두 표면이 겹침.
- 레거시 기준(AOSP Dialer `StatusBarNotifier.buildAndSendNotification`): INCOMING·**CALL_WAITING** 알림은 `InCallPresenter.isShowingInCallUi()` 이면 `NOTIFICATION_INCOMING_CALL_QUIET`(진행 중 통화 채널, FSI 없음·heads-up 없음 — 통화 화면 자체가 선택지를 보임), 통화 화면이 안 보이면 `NOTIFICATION_INCOMING_CALL`(FSI + PRIORITY_MAX).

### 수정 설계안 (Owner 승인 필요)
1. 통화 화면 보임 여부 = 음성·영상 통화 Activity 의 resumed 상태(PiP 는 「안 보임」 — 띠를 숨기므로). 띠의 attach 객체가 onResume/onPause/PiP 변화 때 `NativeCallWaitingPresenter.setCallScreenVisible(boolean)` 호출.
2. 대기 알림 2종 (Dialer 와 같음):
   - 보임 → 조용한 알림: 진행 중 통화 채널(`dibay_native_voice_call_v2`, IMPORTANCE_DEFAULT) · FSI 없음 · 알림 줄에만 남음. 화면 선택지는 띠 하나.
   - 안 보임(다른 앱·홈·PiP·화면 꺼짐) → 지금의 FSI 알림(수신 채널, 선택할 때까지 유지 / 화면 꺼짐이면 통화 화면 켬).
3. 대기 중 보임 상태가 바뀌면 같은 id 로 다시 올림: 조용→시끄러움은 cancel 후 notify(setOnlyAlertOnce 때문에 갱신만으로는 heads-up 이 안 뜸), 시끄러움→조용은 cancel 후 조용한 알림.
- 바뀌는 파일: NativeCallWaitingPresenter, NativeCallWaitingBanner, 두 통화 Activity(onResume/onPause 연결), 계약 테스트. 서버·웹·iOS 무변경. Android versionCode 57.
- 실기: 통화 화면 앞(띠 1개·heads-up 0 프레임), 홈으로 나감(heads-up 유지), 다시 통화 화면(heads-up 사라지고 띠), 화면 꺼짐, CW1~CW6.

### 구현 (Owner 「구현 승인」) — PR 「표면 1개」, Android versionCode 57. 실기 결과는 반영 후 이 아래에 추가.

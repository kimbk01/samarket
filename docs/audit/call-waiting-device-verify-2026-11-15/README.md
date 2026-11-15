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

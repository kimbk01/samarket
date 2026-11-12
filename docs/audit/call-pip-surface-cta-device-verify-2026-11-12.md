# 통화 화면 밖 표면·CTA SSOT — 실기 결과 (Android 1.2.6 (42), 2026-11-12 PHT)

> 대상: PR #208 (main `6df4f1771`) · SSOT `docs/dibay-call-minimized-surface-cta-ssot.md` §12 · 비교 기준 Telegram 실측 T1~T10(`call-pip-nav-notification-audit-design-2026-11-12.md` §3-0)
> 빌드: `npm run native:prepare -- --android-only` READY(origin/main `6df4f1771`) → `assembleRelease` → Samsung `adb install -r` 19:50:02 → 운영 DB `user_devices.app_version = 1.2.6 (42)` 19:50:17 확인
> 기기: Samsung SM-M156S(Android 16·3버튼) = 시험 기기 1.2.6 (42) / Xiaomi 24076RP19G = 상대 기기 **1.2.6 (40) 그대로**(서명이 달라 덮어 설치 불가 — 지우면 데이터·로그인 삭제)
> 증거: 녹화 `v42a.mp4`(19:52~), 단계별 캡처, 두 기기 logcat 파일(지우지 않음), `dumpsys`(activity·notification·media.camera·systemui), 운영 DB 세션·`notification_deliveries`

## 1. 영상 통화 `3d27e820` (Xiaomi 발신 → Samsung 수신, 19:52:04 연결 ~ 19:59:09 종료 `ended_by_callee`)
| # | 항목 | 이전 빌드(41) D | 이번 빌드(42) E | Telegram | 판정 |
|---|---|---|---|---|---|
| 1 | 통화 화면 버튼 | X 종료, 라벨 없음 | 카메라 전환 · 영상 · 음소거 · **통화 종료(빨간 수화기)**, 라벨 표시 | 전환·영상 중단·음소거·통화 종료 | PASS |
| 2 | 자동 PiP 켜짐 | 없음 | 벨 `autoEnter=false` → 연결 `true` | 사용 | PASS |
| 3 | \|\|\| 최근 앱 (통화 화면에서) | PiP 안 됨 | **PiP** (19:52:17.740 → 19:52:19.022, 1.28초) | PiP 1.63초 | PASS |
| 4 | ○ 홈 | PiP 1.28초 | **PiP 0.69초** (19:57:17.353 → 18.044) | 1.26초 | PASS |
| 5 | PiP 메뉴 | 아래 작은 회색 X 1개 | 아래 **마이크 · 카메라 · 수화기** | 같음 | PASS |
| 6 | PiP 마이크 | — | 음소거 `source=pip` 19:52:50 → 아이콘 마이크 꺼짐, 해제 19:53:51 | — | PASS |
| 7 | PiP 카메라 | — | 끔 `source=pip` 19:53:16 → 아이콘 카메라 꺼짐, 켬 19:53:43 | — | PASS |
| 8 | 진행 중 알림 | 「DIBAY video call / Native video runtime」, 「2」 묶음 | 맨 위 **「zxzx11 · 01:58 · 영상 통화 중」** CallStyle, 묶음 `dibay.call.ongoing`, 자동 묶음 요약 없음 | 통화 카드 | PASS |
| 9 | 알림 종료 버튼 | 두 번 펼침 | **한 번 펼치면** 빨간 버튼 | 한 번 | PASS — 단 문구는 OS CallStyle 고정 **「전화 끊기」**(SSOT 「통화 종료」와 다름, §3) |
| 10 | 상태 표시줄 통화 표시 | 없음 | 초록 통화 칩(「03:35」 화면), systemui `ongoing_call_chip` · `Active call notification=…96001` | 통화 아이콘 | PASS |
| 11 | PiP X | 통화 유지 | 19:55:17 `TAP_TO_REMOVE` → 통화 유지(heartbeat 200)·카메라 유지·알림 유지 | 같음 | PASS |
| 12 | X 후 최근 앱 | 메인 카드만 | **통화 카드 맨 앞**(task 2098) | 같음 | PASS |
| 13 | 통화 카드 탭 | — | 통화 화면 복귀(03:46) | 같음 | PASS |
| 14 | 카드 밀어 없애기 | 통화 유지 | 19:58:22 → `SURFACE_LOST`→`surface_lost_call_kept`, 통화·카메라·알림 유지 | 같음 | PASS |
| 15 | 알림 「전화 끊기」 → 잔류 | 그룹 요약 잔류 | 19:59:09 종료, 2초 안 통화 알림·카메라·최근 앱 통화 작업·PiP·통화 칩 **모두 0**, `source=notification` | 잔류 없음 | PASS |
| 16 | ◁ 뒤로 (통화 바로 들어온 통화 화면) | 메신저 + PiP | 메신저(MainActivity) + PiP (19:56:39) | 앱 화면 + 떠 있는 창 | PASS |
| 17 | **◁ 뒤로 (최근 앱 카드로 들어온 통화 화면)** | (경로 없음) | PiP 는 되지만 **홈 화면**이 나옴 | 앱 화면 | **FAIL** — §3 |

## 2. 음성 통화 `8189ea47` (20:05:58 연결 ~ 20:08:55 종료)
| # | 항목 | 결과 | 판정 |
|---|---|---|---|
| V0 | 통화 화면 | 스피커 · 음소거 · **통화 종료(빨간 수화기)** | PASS |
| V1 | \|\|\| 최근 앱 | PiP (20:06:12.488 → 13.295, 0.81초), 벨 `autoEnter=false` → 연결 `true` | PASS |
| V2 | PiP 메뉴 | 아래 **마이크 · 수화기** (이전 X) | PASS |
| V3 | PiP 마이크 | 음소거 `source=pip` 20:06:57(아이콘 변경) · 해제 20:07:08 | PASS |
| V4 | 진행 중 알림 | 맨 위 **「zxzx11 · 01:23 · 음성 통화 중」** CallStyle·통화 시간·묶음 `dibay.call.ongoing`, 통화 칩 켜짐 | PASS |
| V5 | PiP X | 20:08:17 → 통화 유지(heartbeat 200)·알림 유지 | PASS |
| V6 | X 후 최근 앱 | **음성 통화 카드 맨 앞**(task 2099), 통화 칩 「02:31」 | PASS |
| V7 | 알림 「전화 끊기」 → 잔류 | 20:08:55 종료, 2초 안 통화 알림·마이크/카메라·통화 작업·PiP·통화 칩 0 | PASS |

## 3. FAIL — 최근 앱 카드로 들어온 통화 화면에서 뒤로 → 홈 화면 (기존 결함, 이번 변경이 만든 것 아님)
- 증거: 19:56:01.796 `native_call_app_return via=move_to_front` 직전 19:56:01.794 시스템 `Background activity launch blocked! … moveTaskToFront blocked: BAL_BLOCK`.
- 원인: 뒤로 → PiP 진입 **완료 뒤**(PiP 콜백)에 메신저 작업을 앞으로 올리는데, 그때 통화 화면은 이미 PiP 라 Android 16 이 백그라운드 화면 전환으로 막는다. 통화 바로 들어온 경우는 메신저가 이미 바로 뒤에 있어 보였을 뿐이다.
- 이전 빌드 측정 로그(`dv/samsung_logcat.txt`·첫 logcat)에도 같은 차단이 각 6회 — **기존 결함**. 이번에 새로 생긴 「최근 앱 카드로 복귀」 경로에서 드러났다.
- 처리: 통화 변경 규정 3번 — 원인별 설계안(PiP 진입 **전**에 메신저 작업을 앞으로 올리는 순서 등)·영향 분석 후 Owner 승인. 이번에 고치지 않음.

## 4. 수신 실패 신고 조사 (20:00 전후) — 원인: 기기 푸시 연결 공백
| 통화 | 서버 | 기기 | 결과 |
|---|---|---|---|
| `7b36682d` 음성 19:59:59 | FCM 발송(high, 토큰 `cMY5u9DU…coec`) · `push_delivery_diagnostic_missing_device_ack` | 수신 기록 없음 | 발신 취소 |
| `b88c144f` 음성 20:00:49 | 같음 | 수신 기록 없음 | 발신 취소 |
| `920ba3f8` 음성 20:03:46 | 발송 | 수신 → 벨(`ringtone_admin_play_start`) · 알림 · ack | 미응답 30초 부재중 |
| `14668a89` 음성 20:05:10 | 발송 | 수신 → 벨·알림 | 부재중(작업자 자동 수락 스크립트 오류) |
| `8189ea47` 음성 20:05:5x | 발송 | 수신 → 연결 | §2 |
| `c8106c84` 영상 20:09:34 (PiP 를 여러 번 쓴 통화 종료 직후) | 생성 34.677 → 발송 34.919 | 수신 35.137 · 벨 35.163 · 알림 35.177 · ack 35.516 → **20:09:52 연결** | 정상 |
- 시스템 브로드캐스트 기록: Samsung 이 받은 마지막 FCM = DIBAY 19:52:03, **모든 앱 19:53:44** → 다음 DIBAY FCM 20:03:46. 그 사이 Telegram 포함 어떤 앱에도 FCM 0건 → **기기의 Google 푸시(mtalk) 연결 공백**. 앱 프로세스는 같은 pid 로 살아 있었고 얼림·절전·배터리 제한 앱 동작 없음(`curProcState=15`, `mState=ACTIVE`, 대기 버킷 10).
- Owner 가설 「PiP 전환 뒤 통화가 연결 안 됨」: PiP 를 여러 번 쓴 통화 직후 `c8106c84` 가 0.84초에 수신·연결됨 → 이번 측정에서는 **재현 안 됨**. 공백 기간 동안 다른 앱 푸시도 끊겨 PiP(앱 화면 기능)로는 설명되지 않음. 단 공백이 왜 생겼는지(Google 푸시 연결 10분 끊김)는 **확인 못 함**.

## 5. NOT_PROVEN
- Xiaomi 제스처 내비·Xiaomi 새 빌드(서명이 달라 설치 안 함 — 지우고 설치하면 데이터 삭제, Owner 결정 필요).
- iPhone(이번 변경 범위 아님).
- 통화 시간 표시 위치·문구의 다른 기기(One UI 외) 모양.

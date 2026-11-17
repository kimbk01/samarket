# 수신 벨 화면 ◁ 뒤 「받을 수단 없음」 — 원인·수정 계획 (구현 안 함 · Owner 승인 대기) — 2026-11-18 PHT

통화 변경 규정(AGENTS.md) 2·3번에 따른 문서다. 승인 전에는 코드를 바꾸지 않는다.

## 1. 결함 (실기 FAIL)

- **조건:** Samsung SM-M156S, Android 16, 3버튼 내비, 릴리스 1.2.7 (71)(main `9f8cf3f`), q테스트1 로그인, 화면 켜짐·홈 화면.
- **통화:** Xiaomi(zxzx11) → Samsung 음성. callId `62ec539d-cb25-461d-a368-e1a5819f4666`, 2026-11-18 02:03:51 PHT 발신.
- **현상:** 전체 화면 수신 화면(거절·수락)에서 ◁ → 수신 화면이 내려가고 DIBAY 앱 화면이 보임. 벨은 계속 울림. 그런데 앱 화면(`f-sam-incoming-back.png`)에도 알림창(`f-sam-shade.png`)에도 받을 수 있는 표시가 없음. 02:04:26 「부재중」으로 끝날 때까지 받을 수 없었다.

## 2. 원인 (로그 + 코드로 확인)

| 시각 (PHT) | 로그 (Samsung) | 의미 |
|---|---|---|
| 02:03:54.360 | `incoming_notification_post_done` | 수신 알림(FSI) 게시 |
| 02:03:54.444 | `incoming_activity_shown` | 전체 화면 수신 화면 표시 |
| 02:03:55.620 | `incoming_notification_cancel_done` · 55.922 `notification_visual_suppressed` | 수신 화면이 보이므로 알림 시각 표시를 지움(설계: `NativeVoiceCallNotification.suppressVisualAfterActivityShown`, 1초 유예) |
| 02:04:05.605 | `native_voice_back_minimize_pre_connected state=RINGING` → `native_call_app_return via=move_to_front` | ◁ = 화면만 내리고 앱으로(`NativeVoiceCallActivity.leavePreConnectedCallToApp`, Owner 승인 S2 P1 2026-10-30). 수신 Activity 는 종료하지 않음 |
| 02:04:05.721 | `surface_owner_bridge_injected owner=native_activity` | 웹에는 「수신 화면 주인 = 네이티브 화면」 → 웹 앱 안 수신 표시도 나오지 않음 |
| 02:04:05 ~ 02:04:24 | (알림 다시 게시 로그 없음) | **돌아갈 수단 0** |
| 02:04:24.413 | `termination_decision cause=SURFACE_LOST … source=activity_destroyed` | 부재중 처리 중 화면 파괴 |

**코드 근거**
- 통화 Runtime 불변식: 「살아 있는 통화에는 사용자가 돌아가 끊을 수단이 항상 있어야 한다」(`NativeVoiceCallRuntime.java:928` `ensureReturnPathAfterSurfaceLost`).
  - 수신 벨 중이면 `dismiss` + `showIncoming` 으로 수신 알림을 다시 올린다.
  - 그런데 이 함수는 **화면이 파괴될 때(SURFACE_LOST)만** 불리고, `isShowing` 이 참이면 아무것도 하지 않는다.
- ◁ 경로(`leavePreConnectedCallToApp`)는 Activity 를 파괴하지 않고 앱을 앞으로만 가져온다. 그래서 `isShowing` 이 참인 채 화면만 뒤로 가고, 1초 뒤 지운 수신 알림을 다시 올리는 곳이 없다.
- 통화 SSOT 상태표(`docs/dibay-call-minimized-surface-cta-ssot.md` §7): 「RINGING(수신) S3 = 수신 알림」. ◁ 뒤에는 이것과 다르다.
- 영상도 같은 구조다(`NativeVideoCallActivity.java:662-679`, `NativeVideoCallRuntime.java:924`). 영상 수신 ◁ 실측은 하지 않았다(NOT_PROVEN).

## 3. 수정 계획 (승인 시)

| 바꾸는 곳 | 바뀌는 동작 |
|---|---|
| `NativeVoiceCallActivity.leavePreConnectedCallToApp` · `NativeVideoCallActivity.leavePreConnectedCallToApp` | 수신 쪽(`!session.initiator`)이고 `RINGING` 이며 앱으로 가기에 성공했을 때만, Runtime 에 「돌아갈 수단 다시 보장」을 요청한다 |
| `NativeVoiceCallRuntime` · `NativeVideoCallRuntime` | 기존 `ensureReturnPathAfterSurfaceLost` 의 수신 벨 분기(`dismiss` + `showIncoming`)를 그대로 쓰는 공개 함수 1개 추가(예: `ensureIncomingReturnPathAfterLeave`). 새 알림 모양·채널·문구 없음 |

| 같은 두 Activity `onResume` | ◁ 로 나가며 알림을 다시 올린 경우에만(`incomingReturnPathPosted`), 그 수신 화면으로 돌아오면 처음 표시 때와 같은 `suppressVisualAfterActivityShown` 을 다시 건다 — 화면·알림 중복(R2) 방지 |

바꾸지 않는 것: ◁ = 취소·거절 아님(S2 P1), 벨·부재중 30초 타이머, 수락·거절·종료 처리, 웹 코드, 서버, 발신 쪽, 연결 후(CONNECTED) PiP.

## 4. 영향 분석

| 경로 | 영향 |
|---|---|
| 발신 시작·세션 생성·VoIP/FCM 발송 | 없음 |
| 수신 화면 표시(FSI)·벨 | 없음. 처음 표시는 그대로 |
| ◁ 뒤 | 수신 알림(받기·거절 버튼)이 다시 게시됨. 화면이 켜져 있고 잠금이 없으면 Android 는 FSI 를 위쪽 알림으로 띄운다(01:49 영상 시험에서 Samsung 위쪽 알림 「수락·거절」 실측) |
| 알림 「수락」·「거절」 | 기존 알림의 버튼 그대로 |
| 알림 누르기 | 수신 화면이 다시 앞으로 → 기존 `suppressVisualAfterActivityShown` 이 알림을 다시 지움(지금과 같은 순서) |
| 취소·부재중·상대 종료 | 기존 종료 처리(`cancelVisualNotification`)가 알림을 지움. 잔류 0 불변식(SSOT §7) 실기 확인 항목 |
| 통화 기록·팝업 | 없음 |
| 구 설치본(≤71) | 네이티브 변경이라 구 설치본은 지금 결함 그대로, 동작 변화 없음. 웹·서버 변경이 없어 호환 문제 없음 |
| iOS | 변경 없음(Android 파일만) |

**회귀 위험과 대응**
- **R1:** 다시 게시한 FSI 알림이 위쪽 알림이 아니라 수신 화면을 곧바로 다시 띄울 수 있다(OEM 차이). 그러면 ◁ 가 무력해 보인다.
  - 실기에서 Samsung·Xiaomi 둘 다 확인한다.
  - 다시 띄우면 같은 PR 에서 「FSI 없이 HIGH 채널 + CATEGORY_CALL」 로 다시 게시하는 방식으로 바꾼다(알림 모양·버튼은 같음).
- **R2:** 알림 중복(수신 화면 + 알림 동시). 코드 확인 결과 기존 지움은 처음 표시 때(`scheduleSuppressNotificationWhenActivityShown`)만 걸리고, 다시 돌아올 때는 걸리지 않는다. 그래서 위 `onResume` 처리를 같은 PR 에 넣었다. 실기에서 확인한다.
- **R3:** Samsung 은 「취소 먼저 하면 오래된 항목이 남는」 문제가 있었다(`cancelVisualNotification` 주석). 그래서 기존 `dismiss` 를 먼저 부르는 순서를 그대로 쓴다.

**롤백**
- 해당 PR 되돌림 + 설치본 재빌드. 웹·DB 롤백은 없다.

## 5. 반영 방식

- 통화 단독 PR(다른 변경과 묶지 않음). 한 원인만 고친다.
- 네이티브라 설치본 빌드가 필요하다. versionCode 는 빌드 때 1회 올린다.
- Owner 승인 전에는 자동 병합을 등록하지 않는다.

## 6. 실기 검증 행렬 (코드 PASS + 실기 PASS 둘 다)

각 항목마다 Production SHA, 설치 버전, 발신·세션·발송·수신 화면·◁·연결·종료 시각을 기록한다.

| # | 항목 | Samsung 수신 | Xiaomi 수신 |
|---|---|---|---|
| 1 | 음성 수신 화면 ◁ → 위쪽 알림 「수락」 → 연결 | | |
| 2 | 음성 수신 화면 ◁ → 알림 「거절」 | | |
| 3 | 음성 수신 화면 ◁ → 알림 누르기 → 수신 화면 복귀 → 수락 | | |
| 4 | 음성 수신 화면 ◁ → 그대로 둠 → 부재중 → 알림 잔류 0 | | |
| 5 | 음성 수신 화면 ◁ → 발신자 취소 → 알림 잔류 0, 재울림 없음 | | |
| 6 | 1~5 를 영상으로 | | |
| 7 | 회귀: ◁ 없이 수락·거절·부재중·벨 중 취소·통화 중(busy)·정상 종료 후 즉시 재발신 | | |
| 8 | 회귀: 연결 후 ◁ = PiP(지금과 같음) | | |

- 제약: Xiaomi(MIUI)는 알림창·위쪽 알림을 adb 로 누를 수 없다(보안 설정은 바꾸지 않음). 그래서 Xiaomi 수신 항목의 알림 버튼은 Owner 가 직접 누르거나 NOT_PROVEN 이다.
- 규정 행렬의 Android↔iPhone 은 이 작업 환경에 iPhone 이 없어 NOT_PROVEN 이다(이번 변경은 Android 수신 쪽만).

## 7. 함께 확인할 것 (이번 수정 범위 밖 · 보고만)

- 발신 쪽 벨 중 ◁ 뒤 돌아갈 수단: SSOT 상 「연결 중 알림」. Xiaomi 01:49 에 ◁ 뒤 대화방 머리 통화 아이콘에 점만 보였다. 알림 존재는 확인하지 못했다(NOT_PROVEN).
- 화면 꺼짐·잠금 상태 수신 ◁: 측정 안 함.

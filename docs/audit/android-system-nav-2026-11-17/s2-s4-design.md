# S2·S4 설계안 v2 — Android 공식 정의 기준 (구현 안 함 · Owner 승인 대기) — 2026-11-18 04:50 PHT

원칙(Owner): ◁·○·||| 는 Android 기기 기능이다. DIBAY 기능이 아니다. DIBAY 는 Android 기능을 임의로 막거나 바꾸지 않는다. Android 동작이 먼저다.
- 기준: main `1520e35`, 설치본 1.2.7 (74).
- 측정: Samsung SM-M156S(Android 16, 3버튼), Xiaomi 24076RP19G(Android 16, 제스처).
- 판정 근거: Android 시스템 로그 `BackNavigationInfo mType`, 이벤트 로그 `wm_*`, 화면 캡처.

## 0. 작업자 정정 (먼저 보고)

**앞선 측정 방법 오류:**
- 첫 화면 ◁ 측정에서 앱을 adb `monkey` 로 실행했다.
- AOSP `ActivityClientController.shouldMoveTaskToBack`(`:1732-1750`)은 「홈(런처)에서 실행된 작업」(`LAUNCH_SOURCE_TYPE_HOME`)일 때만 첫 화면 ◁ 를 「백그라운드로 보내기」로 처리한다. `monkey` 실행은 이 조건이 아니라 시스템이 화면을 **종료**했다(기준 앱 포함).
- 그래서 앞 보고서들의 「Android 첫 화면 ◁ = Activity 종료」 정정은 **틀렸다**(`s1-s3-device-results.md`, `final-summary-2026-11-18.md`).
- 런처로 실행해 다시 측정한 결과는 §1 에 적었다.

## 1. Android 기기 기능의 정확한 정의 (공식 문서·AOSP 원문)

| 버튼 | 정의 (원문 요지) | 출처 |
|---|---|---|
| ◁ 뒤로 | 「used to navigate in reverse-chronological order through the history of screens … the current destination is popped off the top of the back stack」 | Android Developers — Principles of navigation |
| ◁ 앱 첫 화면 | 「System behavior on Android 12 and higher: The system moves the activity and its task to the background instead of finishing the activity. This behavior matches … the Home button or gesture.」(런처에서 시작된 루트 Activity 에 한함) | Tasks and the back stack · Android 12 behavior changes · AOSP `ActivityClientController.onBackPressed :1703-1750` |
| ◁ 앱 처리 순서 | 「Only when a callback is enabled … will the dispatcher call the callback」 · 「Finally, the system handles the back gesture if all preceding callbacks are disabled. When the back stack is at its root destination, the system triggers system-level animations such as back-to-home, cross-activity, and cross-task」 | Provide custom back navigation · Predictive back gesture |
| ◁ 떠 있는 창 | 팝업은 ◁ 에서 `dismiss()`, 대화상자는 ◁ 에서 `cancel()` — 맨 위에 떠 있는 것만 닫는다 | AOSP `PopupWindow.java :2538-2553`, `Dialog.java :772-775` |
| ○ 홈 | 앱 작업을 백그라운드로(작업·기록 유지) | Tasks and the back stack |
| ||| 최근 앱 | 「system-level UI that lists recently accessed activities and tasks. The user can … select a task to resume, or remove a task from the list by swiping it away」 | Recents screen |
| 3버튼·제스처 | 같은 「뒤로」 이벤트를 앱에 보낸다. 앱은 버튼 모양을 보지 않는다 | Predictive back gesture(제스처·버튼 공통 처리) |

## 2. 런처 실행 기준 실측 (04:42~04:45 PHT)

| 기기 | 앱(런처로 실행) | 첫 화면 ◁ 처리 종류 | 결과 | Android 정의 대비 |
|---|---|---|---|---|
| Samsung | 기준: 계산기 | `TYPE_RETURN_TO_HOME` — 시스템이 처리(홈으로 가는 애니메이션) | 홈 | — |
| Samsung | **DIBAY** | **`TYPE_CALLBACK` — 앱이 먼저 가로챔** | 작업이 백그라운드로(`wm_task_moved`, 종료 없음, 최근 앱 유지) | 가는 곳은 정의와 같다. **처리 주체가 다르다(S2)** |
| Xiaomi | DIBAY(독 아이콘) | `TYPE_CALLBACK` | 홈 | 같은 결함 |
| Xiaomi | 기준: YouTube | `TYPE_CALLBACK`(YouTube 자체 처리) | — | 기준 앱으로 부적합 → Xiaomi 비교 NOT_PROVEN |

## 3. S2 — 통화가 없는데도 DIBAY 가 첫 화면 ◁ 를 먼저 가로챔

- **Android 정의와 다른 점:** 앱에 할 일이 없으면 「시스템이 처리」해야 한다(§1). DIBAY 는 통화가 없어도 ◁ 를 받아(`TYPE_CALLBACK`) 다시 넘긴다.
  - 그래서 Android 가 정한 시스템 처리(back-to-home·cross-task 애니메이션)가 일어나지 않는다.
  - 가는 곳(작업 백그라운드)은 같지만 Android 기능을 DIBAY 가 가로채 대신 처리하는 상태다.
- **원인(코드):** `MainActivity.registerActiveCallBackPressedCallback`(`MainActivity.java:1492-1517`)이 `OnBackPressedCallback(true)` — 통화 유무와 관계없이 항상 켜짐.
  - 다른 뒤로 처리는 정상이다.
    - `DibaySystemBackPlugin`: S1 로 「할 일 있을 때만」 켜짐.
    - `DibayNativeIntro`: 인트로 끝나면 `remove()`.
    - 통화 Activity: 별도 창.
- **이 처리가 해야 할 일(통화 SSOT):** **웹 통화**(네이티브 통화 화면이 아닌 것)가 **연결된 동안** ◁ = 통화 화면을 PiP/뒤로 보내 통화를 지킨다. 그 밖에는 할 일이 없다(지금 코드도 그 외에는 다시 넘김).
- **설계:** 할 일이 있을 때만 켠다(S1 과 같은 공식 방식).

| 바꾸는 곳 | 지금 | 바꾼 뒤 |
|---|---|---|
| `MainActivity` 통화 뒤로 처리 | 항상 켜짐 | 기본 꺼짐. 켜짐 = `DibayActiveCallSessionManager` 연결됨(`CONNECTED`) && 웹 통화(`!NativeCallAppReturn.isNativeOwnedCall`) |
| `DibayActiveCallSessionManager` | 상태 변경 알림 없음 | 연결·해제(`bindActiveCall`·`transitionPhase`·정리)할 때 「다시 계산」 알림만 추가. 통화 상태·로직은 바꾸지 않음 |
| `MainActivity.onResume` | — | 다시 계산 1회(안전망) |
| 처리 본문 | — | 그대로(통화 중 PiP·뒤로 보내기, 상태가 늦은 경우 다시 넘김) |

- **결과:** 통화가 없을 때 첫 화면 ◁ = `TYPE_RETURN_TO_HOME`(기준 앱과 같음). 웹 통화 중 동작은 변경 없다.
- **통화 변경 규정:**
  - 영향 경로: 웹 통화 연결·종료 시점, 네이티브 통화(변경 없음), PiP, 통화 중 앱 전환.
  - 위험: 연결 직후 켜짐이 늦으면 그 순간 ◁ 가 통화 화면 대신 웹 뒤로로 간다.
    - 대응: 상태 변경 즉시 계산한다.
    - 실기: 웹 통화 연결 직후 ◁.
  - 구 설치본은 변경 없음.
  - 롤백: PR 되돌림 + 재빌드.
  - 통화 단독 PR, 설치본 빌드.
- **실기 행렬:**
  - 런처 실행 첫 화면 ◁ 처리 종류(두 기기 × 3버튼·제스처)
  - 하위 화면·시트 ◁ 회귀
  - 웹 통화 연결 중 ◁
  - 네이티브 음성·영상 통화 중 ◁
  - 통화 종료 직후 ◁
- **구현 전 확인:** 웹 통화(비네이티브)가 지금 어떤 조건에서 쓰이는지. 실측 통화는 모두 네이티브였다(코드상 경로는 `call-v4-presentation-android.adapter.ts:26`, `CommunityMessengerCallClient.tsx:1972`).

## 4. S4 — 메뉴가 떠 있는데 ◁ 가 메뉴를 무시하고 화면을 떠남

- **Android 정의:** 떠 있는 팝업·대화상자는 ◁ 에서 그것만 닫힌다(§1, AOSP).
- **실측(04:35, Samsung):** LOUNGE 글 「⋯」 메뉴를 연 채 ◁ → 메뉴와 함께 글 화면을 떠나 목록으로(`s4-menu-open.png` → `s4-menu-back.png`).
- **원인:**
  - DIBAY 웹 메뉴는 Android 창이 아니라 웹 안의 그림이라, Android 는 「떠 있는 것」을 모른다.
  - DIBAY 시트·대화상자는 「떠 있는 것」 목록(`overlay-back-stack`)에 올라가 ◁ 로 닫힌다(실측 PASS).
  - 메뉴·팝오버는 올라가 있지 않다.
- **설계:**
  - 떠 있는 동안 기존 `useOverlayHardwareBack(open, close)` 로 목록에 올린다. ◁ 는 그 메뉴의 기존 닫기만 부른다.
  - 확인창·새 목적지 같은 새 동작은 넣지 않는다. 되돌린 F2 와 다른 점이 이것이다.
  - 계약 시험을 추가한다: 바깥 탭으로 닫히는 떠 있는 메뉴는 ◁ 에도 등록되어야 한다.
- **결과:** 메뉴 열림 + ◁ = 메뉴만 닫힘(`PopupWindow` 와 같음). 다음 ◁ = 이전 화면 또는 Android 처리(S1).
- **대상:** 코드 검색 25곳(이전 표와 같음, 관리자 화면 제외). **실기로 결함을 확인한 것은 글 「⋯」 1곳**이다. 나머지는 구현 전에 하나씩 기기로 「떠 있는 UI 인지·지금 ◁ 결과」를 확인하고, 아니면 뺀다.
- 웹 PR 1개, 통화 경로 아님, 설치본 빌드 불필요.

## 5. 순서

S4(웹) → S2(네이티브, 통화 규정)를 서로 다른 PR 로 한다.

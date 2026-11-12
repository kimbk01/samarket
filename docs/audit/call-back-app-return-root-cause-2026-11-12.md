# 통화 화면 ◁ 뒤로 → 메신저 + PiP 실패 — 원인 확정 (Android 16 QPR2 원문 + 기기 로그)

> 상태: **원인 분석 — 코드 변경 0건.** 구현은 Owner 승인 후(AGENTS.md 「통화 변경 규정」 3번).
> 기기: Samsung SM-M156S `samsung/m15xskt/m15x:16/BP4A.251205.006/M156SKSS9DZG1` = **Android 16 QPR2** (보안 패치 2026-07-05), PiP 셸 = **PiP2**(`com.android.wm.shell.pip2`).
> 원문: `android.googlesource.com/platform/frameworks/base/+/refs/heads/android16-qpr2-release` (2026-11-12 열람). 줄 번호는 그 판 기준.
> 앞선 실패: 설계안 A(#209 FAIL), 설계안 B(#210 FAIL·회귀 → #211 되돌림). 둘 다 **원문 확인 없이 가정으로 설계한 작업자 잘못**.

## 0. 결론
| 시도 | 실패 원인 (원문) | 기기 증거 |
|---|---|---|
| 현재·A: PiP 요청 → 메신저 올리기 | 백그라운드 시작 허용 조건이 **프로세스 단위 「고정(PiP) 아님」**. 통화 화면이 PiP 가 되는 순간 같은 프로세스의 앱 전체가 「고정」 → 메신저 올리기 차단 | `callingUidHasVisibleNotPinnedActivity: false` → `moveTaskToFront blocked: BAL_BLOCK` (19:56:01, 20:29:25) |
| B: 메신저 올리기(`AppTask.moveToFront`) → 자동 PiP | `moveToFront` 는 **`TO_FRONT` 전환**을 만든다. PiP2 셸은 자동 PiP 를 **`OPEN` 전환일 때만** 받는다 → 코어가 PiP 후보를 넣어도 무시 | 전환 #4204 `type=TO_FRONT … pip=PipChange{taskId=2105}` → `PipTransition` 미처리, `auto_pip_missed` (20:44:13~15) |
| adb `am start` (시험) | `startActivity` 경로는 항상 **`OPEN` 전환** + 사용자 떠남 → PiP2 가 자동 PiP 처리 | 전환 #4189 `type=OPEN` → `PipTransition.handleRequest` → `scheduled_enter_pip` → `entered-pip` (20:30:36) |

**→ 「통화 화면이 아직 전체 화면일 때, 메신저를 `startActivity`(명시 컴포넌트, `FLAG_ACTIVITY_NO_USER_ACTION` 없이)로 연다」** 가 Android 16 QPR2 규칙상 메신저 + PiP 를 만드는 경로다. (§4)

## 1. 규칙 ① — 백그라운드 시작 허용은 「프로세스가 고정(PiP) 아님」일 때만
- `BackgroundActivityStartController.java` `mCheckCallerVisible` (≈1160~1175):
  `if (appSwitchAllowedOrFg && state.mCallingUidHasVisibleNotPinnedActivity) return BAL_ALLOW_VISIBLE_WINDOW "callingUid has visible non-pinned window"`
- 그 값 계산 (≈436): `getService().mVisibleActivityProcessTracker.hasVisibleNotPinnedActivity(callingUid)`
- `VisibleActivityProcessTracker.java` (≈90): `hasVisibleNotPinnedActivity(uid) { return match(uid, wpc -> !wpc.inPinnedWindowingMode()); }` — **`WindowProcessController`(프로세스) 단위**.
- DIBAY 는 메신저(`MainActivity`)와 통화 화면(`NativeVideoCallActivity`·`NativeVoiceCallActivity`)이 **같은 프로세스**(`android:process` 없음) → 통화 화면이 PiP 가 되면 프로세스가 고정으로 판정되어 앱의 모든 화면 전환 요청이 막힌다.
- `AppTaskImpl.moveToFront` (≈115~150) 도 같은 판정(`checkBackgroundActivityStart`)을 거친다.
- 판정 시점: 설계안 A 는 `enterPictureInPictureMode()` 수락 직후(통화 화면 일시정지 전)에 보냈지만 이미 `VisibleNotPinned=false` → 요청 수락과 동시에 고정으로 바뀐다(20:29:25.172 수락 → 25.269 차단).
- Android 16 **초기판**(`android16-release`)에는 이 판정이 없다(`hasVisibleActivity` 만 봄) — QPR1 부터 추가. 그래서 S2(2026-10-30) 설계 당시의 동작과 지금이 다를 수 있다(당시 기기 빌드는 확인 못 함).

## 2. 규칙 ② — PiP2 셸은 자동 PiP 를 `OPEN` 전환에서만 받는다
- `libs/WindowManager/Shell/.../pip2/phone/PipTransition.java` `handleRequest` (≈260~281): `isAutoEnterInButtonNavigation(request) || isEnterPictureInPictureModeRequest(request)` 일 때만 PiP 진입.
- `isAutoEnterInButtonNavigation` (≈945~967): `return requestInfo.getType() == TRANSIT_OPEN && pipTask.pictureInPictureParams.isAutoEnterEnabled();` (주석: 「TRANSIT_OPEN 요청이면 버튼 내비게이션에서 PiP 진입」)
- `isEnterPictureInPictureModeRequest`: `getType() == TRANSIT_PIP` (앱이 `enterPictureInPictureMode` 를 부른 경우).
- `TO_FRONT` 는 둘 다 아님 → 무시.

## 3. 규칙 ③ — 어떤 호출이 어떤 전환을 만드나
| 호출 | 전환 | 사용자 떠남 | 원문 |
|---|---|---|---|
| `AppTask.moveToFront()` | `TO_FRONT` | 켜짐(`findTaskToMoveToFront`: `MOVE_TASK_NO_USER_ACTION` 없으면 `mUserLeaving = true`) | `AppTaskImpl` → `ActivityTaskSupervisor.startActivityFromRecents` → `ATMS.moveTaskToFrontLocked` → `findTaskToMoveToFront` (`ActivityTaskSupervisor` ≈1652~1668) |
| `startActivity(intent)` | **`OPEN`** (호출자와 무관) | `FLAG_ACTIVITY_NO_USER_ACTION` 이 **없을 때만** 켜짐 | `ActivityStarter` ≈1521 `createAndStartCollecting(TRANSIT_OPEN)`, ≈2774 `mUserLeaving = (mLaunchFlags & FLAG_ACTIVITY_NO_USER_ACTION) == 0` |
- 자동 PiP 후보 지정·발동(코어): `Task.enableEnterPipOnTaskSwitch` (≈5536) → `TaskFragment.startPausing` (≈1997~2019) `supportsEnterPipOnTaskSwitch && userLeaving && resumingOccludesParent && checkEnterPictureInPictureState(...) && isAutoEnterEnabled()`.
- 현재 `NativeCallAppReturn` 의 시작 경로(메신저 작업이 없을 때)는 `FLAG_ACTIVITY_NO_USER_ACTION` 을 붙인다 → 이 경로로는 사용자 떠남이 꺼져 자동 PiP 불가.

## 4. 레거시 앱이 이 문제를 겪지 않는 이유
- **Telegram**: 통화 화면이 `LaunchActivity` 안(같은 작업·같은 화면 구조). 뒤로 = 앱 안 대화 화면 + 앱 자체 떠 있는 창(실측 T1) — 다른 작업을 앞으로 올릴 일이 없다.
- **Signal**: `WebRtcCallActivity` 뒤로 = `enterPipModeIfPossible()` 만(앱 화면을 올리지 않음) — 뒤에 있던 화면이 그대로 보인다.
- DIBAY 만 「통화 화면 = 별도 작업」 + 「뒤로 = 메신저를 앞으로 + PiP」 를 동시에 하므로 규칙 ①②를 정확히 피해야 한다.

## 5. 원인에 맞는 방법 (설계 방향 — 구현 승인 대상)
1. 조건: CONNECTED · Android 12+ · PiP 기능·앱 PiP 허용 · 자동 PiP 켜짐 · 통화 화면 전체 화면(PiP 아님).
2. 뒤로·줄이기 → `enterPictureInPictureMode` 를 **부르지 않고**, 통화 화면에서 `startActivity(new Intent(this, MainActivity.class).addFlags(FLAG_ACTIVITY_NEW_TASK))` — **`FLAG_ACTIVITY_NO_USER_ACTION` 없음**.
   - 규칙 ①: 이 순간 통화 화면은 전체 화면 → `VisibleNotPinned=true` → 허용(설계안 B 의 `moveToFront` 가 같은 조건으로 허용됨: `app_return_confirmed` 20:44:14 — 같은 판정 함수).
   - 규칙 ②③: `startActivity` → `OPEN` + 사용자 떠남 → 코어가 통화 화면을 PiP 후보로 지정 → PiP2 가 자동 PiP 처리(adb 시험 #4189 과 같은 경로).
   - `MainActivity` 는 `singleTask` → 기존 메신저 작업을 재사용(adb 시험에서 `MainActivity t2102` 재개 확인).
3. 사용자 떠남이 켜지므로 통화 화면이 `onUserLeaveHint` 를 받는다 → 지금 코드는 거기서 `enterPictureInPictureMode`(= `TRANSIT_PIP`)를 또 요청 → 자동 PiP 와 겹친다. **이 경로로 연 직후의 `onUserLeaveHint` 1회는 PiP 요청을 하지 않는다**(자동 PiP 에 맡김).
4. 결과 기록: 기존 `native_*_auto_pip_entered`/`_missed`, `native_call_app_return_confirmed`/`_unconfirmed`.
5. 조건 밖(Android 11 이하·PiP 꺼짐): 기존 경로 그대로.

## 6. 확인 못 한 것 (NOT_PROVEN — 구현 전 남은 위험)
- **앱이 호출한 `startActivity` 가 실제로 `OPEN` + 자동 PiP 를 만드는지**: 원문상 호출자와 무관(§3)이고 adb 시험이 같은 경로로 성공했지만, 앱 호출로는 아직 실측하지 않았다. 구현 후 첫 실기 1순위 항목.
- Samsung 이 PiP2·전환 규칙을 바꿨는지: 기기 로그의 셸 동작이 AOSP 원문과 일치(§0 표)하는 것까지만 확인.
- S2(2026-10-30) 당시 정상으로 보인 이유: 메신저가 통화 화면 바로 뒤에 있던 경로만 시험(§1) — 당시 기기 빌드가 QPR 이전이었는지는 확인 못 함.

## 7. 확정 설계 (Owner 「설계·구현 진행」 2026-11-12) — 가정 없음, 각 줄 근거
| 항목 | 내용 | 근거 |
|---|---|---|
| 적용 조건 | CONNECTED · Android 12+ · PiP 기능 · 앱 PiP 허용(AppOps) · 자동 PiP 켜짐 · 통화 화면 전체 화면(PiP·Dock 아님) | §2 자동 PiP 는 `isAutoEnterEnabled` 필요 |
| 동작 | 뒤로·줄이기 → `enterPictureInPictureMode` 안 부름 → `startActivity(new Intent(this, MainActivity.class).addFlags(FLAG_ACTIVITY_NEW_TASK))` (NO_USER_ACTION 없음) | §1 고정 전이라 허용 · §3 OPEN + 사용자 떠남 · §2 PiP2 자동 PiP |
| 메신저 쪽 영향 | `MainActivity`(singleTask) `onNewIntent` → `handleNotificationLaunchIntent`: 빈 인텐트는 알림 해제·화면 켜기·잠금 해제 모두 `dibay://call` 주소일 때만 동작(코드 확인) → 아무것도 하지 않음 | `MainActivity.java` `dismissIncomingCallNotificationFromIntent`·`applyIncomingCallWakeFlags`·`requestDismissKeyguardForCallIntent` 진입 조건 |
| 통화 화면 쪽 영향 | 사용자 떠남이 켜져 `onUserLeaveHint` → 현재 코드는 `minimizeConnectedCall("user_leave")` → `enterPictureInPictureMode`(TRANSIT_PIP) 를 또 요청 → **이 경로로 연 직후 1회는 건너뜀**(2초 안, 같은 통화) | `NativeVideoCallActivity`·`NativeVoiceCallActivity` `onUserLeaveHint` |
| 결과 기록 | `native_*_app_return_open` · `native_*_auto_pip_entered` / `_auto_pip_missed`(1.5초) · `native_call_app_return_confirmed` / `_unconfirmed` | — |
| 조건 밖 | 지금 경로(PiP 요청 → 복귀 / Dock) 그대로 | — |
| 바뀌는 파일 | `NativeCallAppReturn`(열기 함수·조건 함수), 영상·음성 Activity(분기·onUserLeaveHint 1회 건너뜀·확인 타이머), `verify-call-surface-cta-ssot` ⑩, SSOT §4, `versionCode 46` | — |
| 불변 | 자동 PiP 설정·종료 판단표·Runtime·Dock·서버·웹 · 홈/최근 앱 자동 PiP 경로 | — |
| 실기 | 진입 4경로(최근 앱 카드·알림 탭·통화 바·홈에서 수락) × 영상(+음성 1회) → 메신저 + PiP · `auto_pip_entered` · 차단 0 / 회귀: 홈·최근 앱 → PiP, PiP X·카드 제거 = 통화 유지, 종료 잔류 0 | — |
| 실기 FAIL 이면 | 즉시 중단·되돌림, 원문 재분석 — 다른 안을 바로 시도하지 않음 | Owner 지시 |

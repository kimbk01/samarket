# 통화 화면 ◁ 뒤로 → 메신저 복귀 실패(홈 화면) — 원인 확정 · 원인별 설계안 (2026-11-12 PHT)

> 상태: **설계안 — Owner 승인 전 구현 금지**(AGENTS.md 「통화 변경 규정」 3번). 코드 변경 0건.
> 발견: 실기 `call-pip-surface-cta-device-verify-2026-11-12.md` §1 #17 (Android 1.2.6 (42), Samsung SM-M156S Android 16·3버튼).
> SSOT 기준: `docs/dibay-call-minimized-surface-cta-ssot.md` §4 「◁ 뒤로 → S2 PiP + 메신저(앱) 앞으로」.

## 0. 먼저 알릴 것
- 이 결함은 **이번 PR #208 이 만든 것이 아니다.** 이전 빌드(41) 측정 로그 2개에도 같은 차단(`moveTaskToFront blocked: BAL_BLOCK`)이 각 6회 있었다. 다만 #208 이 최근 앱 통화 카드를 새로 보이게 하면서, 이 결함이 화면에 드러나는 진입 경로가 하나 늘었다.
- 앱 복귀 함수(`NativeCallAppReturn.bringAppToFront`)는 **실제로 막혀도 「via=move_to_front」 성공으로 기록**한다(`AppTask.moveToFront()` 는 차단돼도 예외 없이 반환). 그래서 지금까지 로그로는 실패가 보이지 않았다.

## 1. 증상 (같은 통화 `3d27e820`, 같은 기기·같은 빌드)
| 진입 경로 | ◁ 뒤로 결과 | 시간 순서 (logcat) |
|---|---|---|
| 앱 통화 바 → 통화 화면 | 메신저 + PiP (정상으로 보임) | PiP 요청 수락 19:56:39.874 → **메신저 재개 39.985** (`main_activity_resume`) → PiP 진입 40.637 → 앱 복귀 요청 40.698 |
| 최근 앱 통화 카드 → 통화 화면 | **홈 화면** + PiP | PiP 요청 수락 01.022 → PiP 진입 01.758 → 시스템 차단 01.794 `Background activity launch blocked!` → 01.796 `moveTaskToFront blocked: BAL_BLOCK` → 앱 복귀 「via=move_to_front」 01.796 |
- 정상으로 보인 첫 줄도 메신저가 앞으로 **불려 온 것이 아니라**, 통화 화면 바로 뒤에 원래 있었기 때문에 PiP 가 되면서 저절로 드러난 것이다(메신저 재개가 앱 복귀 요청보다 0.7초 먼저).

## 2. 원인 (확정)
차단 로그의 판정 값(19:56:01.794, Android 16 `ActivityTaskManager`):
```
callingUidHasVisibleActivity: true
callingUidHasVisibleNotPinnedActivity: false   ← 보이는 화면이 PiP(고정 창)뿐
callingUidProcState: TOP · intent: null(AppTask.moveToFront) · balDontBringExistingBackgroundTaskStackToFg: true
```
- Android 는 앱의 보이는 화면이 **PiP 하나뿐이면 다른 작업(메신저)을 앞으로 올리는 것을 막는다**.
- 현재 코드는 S2(`a3be8ea29`, 2026-10-30)부터 앱 복귀를 **PiP 진입이 끝난 뒤**(`onPictureInPictureModeChanged(true)` 또는 800ms 보조 타이머)에 보낸다 → 항상 「PiP 뿐」인 순간에 요청 → 항상 차단.
- 따라서 메신저가 통화 화면 **바로 뒤에 있지 않은** 모든 진입 경로에서 뒤로 = 홈(또는 직전 앱) 화면이 된다.

## 3. 영향받는 진입 경로 (호출처 전수 — `grep NativeCallAppReturn.bringAppToFront`)
| 호출처 | 언제 | 현재 결과 |
|---|---|---|
| 영상 `onPictureInPictureModeChanged`(:662) · 보조 타이머(:193) · 음성 같은 자리(:353 · :124) | 연결 후 ◁·줄이기 → PiP 뒤 복귀 | **차단**(메신저가 바로 뒤에 없으면 홈) |
| 영상 `minimizeToApp` PiP 이미 켜짐(:1984) | 이미 PiP 일 때 | 차단 가능 |
| 영상·음성 Dock 경로(:1992 · :946) | PiP 실패 → Dock | 통화 화면이 보이는 상태라 허용 |
| 발신 준비 중 뒤로(:575 · :392), 연결 전 뒤로(:608 · :421) | PiP 없이 바로 복귀 | 통화 화면이 보이는 상태라 허용 |
메신저가 바로 뒤에 없는 실제 진입: ① 최근 앱 통화 카드 ② 알림 본문 탭으로 복귀 ③ 다른 앱·홈 화면에서 수신 알림으로 수락 ④ 잠금 화면 수락 후 잠금 해제.

## 4. 레거시 기준
- Telegram 실측 T1: ◁ 뒤로 → **앱 화면** + 떠 있는 영상 창(통화 화면이 앱과 같은 작업이라 항상 앱으로 돌아감).
- SSOT §4 도 「PiP + 메신저(앱) 앞으로」로 고정 → 홈 화면은 **FAIL**.

## 5. 설계안 (원인별 — 순서만 바꾼다)
**원인 = 요청 시점.** 메신저를 앞으로 올리는 요청을 「통화 화면이 아직 보이고 고정되지 않은」 순간에 보낸다.

| 단계 | 지금 | 바꾼 뒤 |
|---|---|---|
| 1 | ◁ → `tryEnterPip` → `enterPictureInPictureMode` true | 같음 |
| 2 | `pendingAppReturnSource` 저장, PiP 콜백·800ms 타이머까지 대기 | **`enterPictureInPictureMode` 가 true 를 돌려준 바로 그 호출 안에서** `bringAppToFront` (통화 화면은 아직 RESUMED·고정 전 → 「보이는 고정 안 된 화면」 조건 충족) |
| 3 | PiP 콜백에서 `bringAppToFront` | 콜백·타이머 경로는 **확인 전용**: 메신저가 이미 재개됐으면 아무것도 안 함, 아니면 1회 재시도 + `native_call_app_return_unconfirmed` 기록 |
| 4 | 결과 기록 = 요청만 기록(차단돼도 성공처럼) | **실제 결과 기록**: 요청 후 1.5초 안에 `MainActivity.onResume` 이 오면 `app_return_confirmed`, 아니면 `app_return_unconfirmed reason=…` |

세부:
- `NativeCallAppReturn` 에 「마지막 복귀 요청 callId·시각」 정적 기록 + `MainActivity.onResume` 에서 `NativeCallAppReturn.onMainResumed()` 호출 → 확인 로그. UI·통화 상태는 건드리지 않는다(로그만).
- 영상·음성 `minimizeToApp` 은 같은 규칙(두 화면 대칭). Dock·발신 준비·연결 전 경로는 지금 그대로(이미 허용되는 시점).
- 자동 PiP(§4-1, `setAutoEnterEnabled`)·종료 판단표·Runtime·서버·웹: **변경 없음**.

## 6. 바뀌는 파일
| 파일 | 변경 |
|---|---|
| `android/.../nativevideo/NativeVideoCallActivity.java` | `minimizeToApp` — PiP 요청 수락 직후 복귀 요청, 콜백·타이머는 확인 전용 |
| `android/.../nativevoice/NativeVoiceCallActivity.java` | 같음 |
| `android/.../call/NativeCallAppReturn.java` | 요청 기록 + 확인/미확인 로그(동작 불변) |
| `android/.../MainActivity.java` | `onResume` 에서 확인 함수 1줄 호출 |
| `android/app/src/test/.../NativeCallAppReturnConfirmTest.java` (신규) | 확인/미확인 판정 단위 테스트 |
| `scripts/verify-call-surface-cta-ssot.cjs` | 「PiP 콜백에서만 복귀」 회귀 금지 검사 1항목 |
| `docs/dibay-call-minimized-surface-cta-ssot.md` §4 | ◁ 행에 「복귀 요청은 PiP 요청 수락 직후」 명시 |

## 7. 영향·위험·방지 (통화 규정 3번)
| 경로 | 영향 |
|---|---|
| 발신·수신·FCM·VoIP·세션·종료·부재중·busy·통화 기록 | 없음 |
| 연결 후 ◁·줄이기 | **복귀 요청 시점만 앞당김** |
| 홈·최근 앱(자동 PiP) | 없음(복귀 요청 없음 — 사용자가 다른 곳으로 가는 동작) |
| Dock·발신 준비·연결 전 뒤로 | 없음 |

| 위험 | 방지 |
|---|---|
| 메신저가 PiP 전환 중에 앞으로 오면서 **PiP 진입이 취소**될 수 있음(전환 두 개가 겹침) | 실기 1순위 항목. PiP 가 취소되면 통화 화면은 정지·통화 유지(판단표 KEEP) → 복귀 수단 S3 알림·S5 카드·S6 통화 바 남음. FAIL 이면 이 안을 버리고 §8 대안 B 로 |
| 메신저가 앞으로 오며 통화 화면에 `onUserLeaveHint` → 중복 PiP 요청 | 기존 `tryEnterPip` 가드(요청 중이면 소비) |
| 확인 로그 오판(메신저가 원래 바로 뒤라 재개된 경우) | 「요청 후 재개」만 confirmed — 원인 판정이 아닌 결과 판정용 |
| 구 바이너리 | 네이티브 전용 — 새 빌드 설치 기기만. 웹·서버 무변경 |
롤백: 네이티브 커밋 되돌림 + 이전 빌드 재설치.

## 8. 검토한 대안과 고르지 않은 이유
| 대안 | 내용 | 판단 |
|---|---|---|
| B | 먼저 메신저를 앞으로 → 자동 PiP(`setAutoEnterEnabled`)로 통화 화면이 PiP 되게 | 앱이 스스로 작업을 바꿀 때 자동 PiP 가 걸리는지 **확인 못 함**(공식 문서는 홈 제스처 예시만). A 가 실기 FAIL 일 때만 실측으로 검토 |
| C | 통화 화면을 메신저와 같은 작업(taskAffinity)으로 | Telegram 과 같은 구조지만 잠금 화면 수신·최근 앱·통화 정리 경로 전체가 바뀜 — 범위 과대, 기각 |
| D | PendingIntent + 백그라운드 시작 허용 옵션 | 로그상 `balAllowedByPiCreator: BSP.ALLOW_BAL` 이어도 `resultIfPiCreatorAllowsBal: BAL_BLOCK` — 조건(보이는 고정 안 된 화면)을 못 넘음, 기각 |
| E | 복귀 요청 없이 PiP 만(Signal 방식) | 레거시 Telegram·SSOT §4(앱 화면)와 다름 — 기각 |

## 9. 실기 검증 (승인 후, 같은 빌드에서 매번 Production SHA·설치 버전 기록)
| # | 진입 → ◁ 뒤로 | 기대 |
|---|---|---|
| 1 | 최근 앱 통화 카드 → 통화 화면 | 메신저 + PiP, `app_return_confirmed`, 차단 로그 0 |
| 2 | 알림 본문 탭 → 통화 화면 | 같음 |
| 3 | 홈 화면에서 수신 알림 수락 | 같음 |
| 4 | 잠금 화면 수락 → 해제 | 같음 |
| 5 | 통화 바 → 통화 화면(현재 정상 경로) | 같음(회귀 없음) |
| 6 | 줄이기 버튼 | 같음 |
| 7 | PiP 가 실제로 떴는지 | 1~6 모두 `PICTURE_IN_PICTURE_ENTER` + `pinned` |
| 8 | 회귀 | 홈·최근 앱 자동 PiP, PiP X·카드 제거 = 통화 유지, 종료 잔류 0 (실기 문서 §1·§2 재측정) |
음성·영상 각각, Samsung 3버튼(입력 가능 기기). Xiaomi 제스처는 Owner 손 조작 시에만.

## 10. NOT_PROVEN
- A 순서에서 PiP 전환과 메신저 전환이 겹칠 때 One UI·Android 16 의 실제 동작(§7 1순위 위험) — 구현 후 실기로만 판정.
- iPhone(별도 구조, 범위 밖).

## 11. 실기 결과 — 설계안 A (PR #209, Android 1.2.6 (43)) = **FAIL**
조건: main `55f540bc8` · `native:prepare` READY · Samsung 설치 20:26:33 · 운영 DB `1.2.6 (43)` 20:26:39 · 영상 통화 `f56b8b9a`(Xiaomi 1.2.6 (40) 발신, 20:28:38 연결 ~ 20:31:06 `ended_by_callee`) · 녹화 `v43a.mp4` · logcat 보존.

| # | 진입 → ◁ | 결과 | 증거 |
|---|---|---|---|
| A-1 | 최근 앱 통화 카드 → 통화 화면 | **FAIL — 홈 화면 + PiP** | PiP 요청 수락 20:29:25.172 → 복귀 요청 25.269 → 시스템 차단 25.269 `callingUidHasVisibleNotPinnedActivity: false` → `moveTaskToFront blocked: BAL_BLOCK` → 재시도 26.138 차단 → `native_call_app_return_unconfirmed` 27.617 |
| A-2 | 통화 바 → 통화 화면 (회귀) | PASS — 메신저 + PiP | `native_call_app_return_confirmed afterMs=158` 20:30:08.968 |
| A-3 | 종료 후 잔류 (회귀) | PASS — 통화 알림·카메라·PiP·통화 칩 0, 최근 앱 화면에 통화 카드 없음(`recents_card visible=false` ending·destroy) | 20:31:05~06 |

원인(정정): **`enterPictureInPictureMode()` 가 수락되는 그 순간 시스템은 이미 통화 화면을 「고정(PiP)」으로 본다** — 통화 화면이 일시정지되기 전(25.283)인데도 판정 값이 `VisibleNotPinned=false`. 따라서 「PiP 요청 뒤」 보내는 복귀 요청은 시점과 관계없이 모두 막힌다. §5 의 가정이 틀렸다(내 잘못 — 실측 없이 「요청 직후는 아직 고정 전」이라고 가정).
이번 변경의 이득: 복귀 결과가 이제 정확히 기록된다(`confirmed`/`unconfirmed`). 동작은 이전 빌드와 같다(나빠지지 않음, 고쳐지지도 않음).

## 12. 대안 B 실측 — 시스템 동작 성립
- 시험(20:30:35): 최근 앱 카드로 통화 화면 진입(뒤에 홈) → 통화 화면 전체 화면·자동 PiP 켜짐 상태에서 **메신저 작업을 먼저 앞으로**(adb `am start -n com.dibay.app/.MainActivity` — 앱 대신 시스템 동작만 확인).
- 결과: 통화 화면 일시정지 36.140 → **자동 PiP 진입 37.028** (`PICTURE_IN_PICTURE_ENTER` · `pip_callback_entered`) → 맨 앞 = MainActivity, `pinned` 유지. = 원하는 화면(메신저 + PiP).
- 앱이 직접 올릴 때의 허용 여부: 그 시점 통화 화면은 전체 화면(고정 아님)이라 `callingUidHasVisibleNotPinnedActivity: true` 조건을 만족 → 막히지 않는 것이 Android 규칙상 맞다. **앱 코드로 실제 허용되는지는 구현 후 실기로만 PASS 판정**(adb 시험은 호출자가 셸이라 같지 않음).

## 13. 설계안 B (원인별 — 순서 뒤집기)
| 단계 | A(현재) | B |
|---|---|---|
| 조건 | — | CONNECTED · API 31+ · PiP 기능 있음 · 앱 PiP 허용(AppOps `OPSTR_PICTURE_IN_PICTURE`) · 자동 PiP 켜짐(`isAutoPipEligible`) |
| 1 | `enterPictureInPictureMode` → 복귀 요청(막힘) | **복귀 요청 먼저**(통화 화면이 아직 전체 화면 = 허용) — `enterPictureInPictureMode` 를 부르지 않는다 |
| 2 | — | 시스템이 자동 PiP(§12 실측 0.9초) |
| 3 | PiP 콜백·타이머 = 확인·재시도 | PiP 콜백 = 확인만. 1.5초 안에 PiP 콜백이 없으면 `native_*_auto_pip_missed` 기록(통화는 유지 — 판단표 KEEP, 복귀 수단 S3·S6·S5) |
| 조건 밖 | — | 지금 경로 그대로(API 30 이하는 백그라운드 시작 제한이 약해 기존 순서로 동작 · PiP 꺼진 기기 = Dock) |
- 바뀌는 파일: 영상·음성 `minimizeToApp`(분기 1곳씩), `verify-call-surface-cta-ssot` ⑨ 갱신, SSOT §4 문구. Runtime·판단표·자동 PiP 설정·Dock·서버·웹 불변.
- 위험: ① 자동 PiP 가 안 걸리는 기기(제조사 정책) → 통화 화면이 메신저 뒤로 숨기만 함 → `auto_pip_missed` 로 드러나고 통화·복귀 수단 유지. ② 메신저를 올릴 때 통화 화면이 `onUserLeaveHint` 를 받아 `tryEnterPip` 이 겹칠 수 있음 → 기존 가드(요청 중이면 소비). ③ 앱 PiP 권한을 사용자가 끈 경우 → 조건 밖(Dock 경로).
- 실기: §9 행렬(진입 4경로 × 음성·영상) + `auto_pip_missed` 0건 + 차단 로그 0건 + 회귀(A-2·A-3·홈·최근 앱 자동 PiP·PiP X·카드 제거).

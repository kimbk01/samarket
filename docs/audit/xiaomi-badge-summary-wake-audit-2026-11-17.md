# Xiaomi — 앱 아이콘 요약 알림 재게시로 화면이 다시 켜짐 (감사 · 2026-11-17)

발견: 통화 화면 유지 실기(`call-screen-awake-device-verify-2026-11-17.md` V9) 중. 기준 코드 main `5b3c82be1`. 기기 Xiaomi 24076RP19G(zxzx11) 1.2.7 (65), 충전 상태 흉내(`dumpsys battery unplug`) 중.

## 1. 관측 (기기 기록 — 직접 본 것)
02:29:01 음성 통화 축소(통화 화면 유지 해제 KEEP=0) 후 무조작:

| 시각 (PHT) | 기록 |
|---|---|
| 02:29:32.192 | `PowerManagerService: Going to sleep due to timeout (screenOffTimeout=30000)` |
| 02:29:32.626 | `native_voice_pip_activity_stopped` → 02:29:32.867 `active_call_phase CONNECTED -> BACKGROUNDED source=app_background` |
| 02:29:32.870 / .874 / .878 | `DIBAY_APPICON_DELIVERY launcher_provider_applied total=64` → `acquireWakeLockInternal tag="NotificationManagerService:post:com.dibay.app"` → `summary_applied total=64 tray=0 number=64` |
| 02:29:32.991 / .995 / .998 | 같은 3줄 한 번 더 (두 번째 재게시) |
| 02:29:33.228 | `MiuiBubbleManager: onEntryUpdated` |
| 02:29:33.289 | `Waking up from Asleep (reason=WAKE_REASON_UNKNOWN, details=com.android.systemui:NOTIFICATION)` |
| 02:30:03.286 → 02:30:03.841 | 다시 잠듦 → 다시 `com.android.systemui:NOTIFICATION` 로 깨어남 |
| 02:30:33.845 → 02:30:34.481 | 같은 반복 |

- 그 사이 다른 앱 알림 게시 기록 없음(게시 wake lock 은 `com.dibay.app` 만).
- 같은 시험의 Samsung 은 같은 재게시(`NotificationManagerService:post:com.dibay.app`)가 있었으나 화면이 깨지 않음(Dozing 유지).
- 한계: 02:29 원본 기록은 이후 작업자 스크립트의 `logcat -c`(02:34:50)로 기기에서 지워졌다 — 위 표는 그 전에 터미널로 출력해 둔 줄이다(작업자 잘못).

## 2. 코드 경로 (main `5b3c82be1`)
1. `DibayAppIconDeliveryPlugin.handleOnStop()` — **브리지 Activity 가 멈출 때마다** `DibayAppIconDeliveryAdapter.reapplyLast()` (B7, 2026-11-04 `0d131be5b`: 앱 안에서 읽어 지워진 알림창 카드 수를 백그라운드 전환 때 다시 맞추려는 목적).
2. `reapplyLast` → `applyExcluding(마지막 총수)` → 총수 > 0 이고 요약 숫자 > 0 이면 **값이 같아도 매번** `postOrUpdateSummary` → `nm.notify(710001, …)`.
3. 요약 카드: 채널 `dibay_app_icon_summary_v1` IMPORTANCE_LOW, `setOnlyAlertOnce(true)`·`setSilent(true)`, `setWhen(now − 13일)` → **게시마다 when 값이 바뀐다**(같은 내용이어도 새 갱신).
4. 화면 타임아웃 = Activity onStop → 1~3 → 재게시.
- 운영 기기 상태(읽기 전용 조회): `dumpsys notification` 710001 `importance=2 flags=ONLY_ALERT_ONCE number=64`; Xiaomi 설정 `wakeup_for_keyguard_notification=1`(MIUI 「알림 받으면 잠금 화면 켜기」).

## 3. 원인 — 증거
### 3-1. Xiaomi 시스템 UI 가 「DIBAY 710001 때문에 화면을 켰다」고 기록 (결정 증거)
`dumpsys activity service com.android.systemui` 의 `NotificationAlertLogger`(읽기 전용, 11-16 17:56 ~ 11-17 02:49 보존분):
| 시각 (PHT) | 기록 |
|---|---|
| 02:29:33.482 | `wakeUp:success2, 0\|com.dibay.app\|710001` |
| 02:30:03.847 | `wakeUp:success2, 0\|com.dibay.app\|710001` |
| 02:30:34.493 | `wakeUp:success2, 0\|com.dibay.app\|710001` |
- 세 시각이 `PowerManagerService: Waking up ... details=com.android.systemui:NOTIFICATION` 시각과 일치. 보존 기간 전체에서 화면 켜기 성공(`success`)은 이 3건뿐, 전부 DIBAY 710001.
- 같은 기간 710001 재게시 판정 54회(11-16 18 · 11-17 36). 나머지 51회는 `f,device interactive`(이미 화면 켜짐 → 안 켬). 충전 중 화면 유지 설정 때문에 평소엔 화면이 꺼지지 않아 드러나지 않았다.
- 통화 알림 93001 은 매번 `f,!clearable`(상주 알림이라 안 켬).

### 3-2. Xiaomi 시스템 UI 판단 규칙 (기기 원본 `MiuiSystemUI.apk`, HyperOS OS3.0.305.0.WHYMIXM, dexdump)
`AlertCoordinator$$ExternalSyntheticLambda0.onViewBound` → `MiuiAlertManager.wakeUpForNotificationInternal`:
1. `ExpandedNotification.buzzBeeped` 가 참이면 끝. 아니면 참으로 바꾸고 판단. 이 표시는 **알림 객체마다** 있고 갱신 때 옛 객체에서 옮기지 않는다(쓰는 곳 2곳: 이 함수·`ShadeListBuilder.pruneIncompleteGroups`) → **같은 id 를 다시 게시(갱신)할 때마다 새로 판단**. 기기 로그 `AlertCoordinator: onViewBound, buzzBeep for 0|com.dibay.app|710001` 가 재게시마다 찍힘(02:34:57 ×2, 02:49:29).
2. 안 켜는 조건(하나라도 해당하면 끝): 설정 `wakeupForNotification` 꺼짐 · 잠금 화면 알림 표시 꺼짐 · 잠금 화면에서 숨김 · 방해 금지 · 접힌(중요하지 않은) 알림 · 접힌 묶음 · 미디어 · **지울 수 없는 알림(`!clearable`)** · 진행률 표시 · **화면이 이미 켜짐** · 묶음 머리(국제판은 시스템 자동 묶음 머리만).
3. 위 조건을 다 통과하면 근접 센서 확인 후 화면을 켠다(`success2`).
- **중요도(IMPORTANCE_LOW)·`setOnlyAlertOnce`·`setSilent` 는 판단에 없다** → 소리 없는 요약 카드 갱신도 화면을 켠다.
- 기기 설정: `wakeup_for_keyguard_notification=1`.

### 3-3. DIBAY 코드 (main `5b3c82be1`)
- 710001 은 지울 수 있는 일반 알림(상주 아님), 묶음 머리 아님(`setGroup` 만, `setGroupSummary` 없음) → 3-2 의 제외 조건에 하나도 안 걸림.
- `DibayAppIconDeliveryPlugin.handleOnStop`(B7 `0d131be5b`) → `reapplyLast` → `applyExcluding` 이 **총수·숫자가 그대로여도 매번 `nm.notify(710001)`**. 화면 타임아웃 = 앱 화면 onStop = 재게시 = 새 판단 = 화면 켬 → 30초 뒤 반복.

### 3-4. 레거시(Telegram `DrKLO/Telegram` master `NotificationsController.java:1855`)
`setBadge(count)`: `if (lastBadgeCount == count) return;` → `NotificationBadge.applyCount`(런처 제공자만, Xiaomi 는 `XiaomiHomeBadger`). 숫자 전달용 상주 알림 없음, 백그라운드 전환 때 알림 재게시 없음.

## 4. 영향
| 조건 | 판정 |
|---|---|
| Xiaomi · 화면 꺼진 상태 · 710001 재게시 | FAIL — 3-1 기록 3건 |
| Xiaomi · 통화 없이 DIBAY 앞 화면에서 타임아웃 | 코드상 같은 경로(onStop → 재게시 → 3-2 통과). 기기 재현은 NOT_PROVEN |
| Samsung(One UI) | 재게시는 있으나 화면 안 켬(관측) |
| #401 통화 화면 유지 | 무관 |

## 5. 수정안 (증거로 고른 것 · 승인 전 구현 안 함)
### 채택: R1 — 값이 그대로면 다시 게시하지 않는다
- `applyExcluding` 이 게시 직전에 `getActiveNotifications()` 에서 710001 을 찾아, **`number` 와 본문 총수가 같으면 `nm.notify` 를 건너뛴다**(런처 숫자 저장소 `ShortcutBadger` 도 직전 값과 같으면 건너뜀 — Telegram `lastBadgeCount` 와 같은 원칙).
- 근거: 3-2 에 따라 재게시가 없으면 판단 자체가 일어나지 않는다. 3-1 의 3건은 모두 총수 64 그대로인 재게시(`summary_applied total=64 tray=0 number=64`).
- 호출처 4곳(`handleOnStop`·`DibayNotificationDismissReceiver`·웹 `apply`·FCM `onDomainNotificationPosted`)이 모두 `applyExcluding` 하나를 거친다 → 한 곳 수정. B7 목적(알림창 카드가 지워진 뒤 숫자 맞추기)은 값이 바뀐 경우라 그대로 게시된다.
- 값이 실제로 바뀌는 재게시는 남는다: 새 메시지 알림이 함께 오는 경우(그 메시지 알림이 어차피 화면을 켬 — Telegram 도 같음), 앱 안에서 읽어 알림창 카드가 줄어든 뒤 화면이 꺼지는 순간(1회).

### 버린 안 (증거)
- 상주 알림(지울 수 없게) 으로 바꾸기: 3-2 상 화면은 안 켜지지만, Xiaomi 공식 문서 「아이콘 숫자 = 앱 알림 수, 상주·진행률 알림 제외」(B7 문서 §2) → **아이콘 숫자 전달이 끊김**. 기각.
- 묶음 머리로 바꾸기: 3-2 상 국제판은 시스템 자동 묶음 머리만 제외 → 효과 없음. 기각.
- 중요도·소리 설정 변경: 3-2 판단에 없음 → 효과 없음. 기각.

### 검증 계획 (구현 승인 후)
- 단위 시험: 같은 총수·같은 알림창이면 notify 0회, 값이 바뀌면 1회.
- Xiaomi(배터리 상태 흉내): 통화 축소·통화 없이 각각 화면 타임아웃 3회 → `NotificationAlertLogger wakeUp:success` 0건, `Waking up ... NOTIFICATION` 0건. 아이콘 숫자 = 서버 총수(Samsung·Xiaomi).
- 네이티브 변경 → 재빌드 필요.

## 6. 작업자 잘못
- 02:29 원본 기기 기록(logcat)은 작업자 스크립트의 `logcat -c`(02:34:50)로 지워졌다. 판정은 지워지지 않은 시스템 UI 기록(3-1)으로 했다.

# DIBAY Call — V3 → V4 Regression Audit (최우선 SSOT)

**상태:** OPEN — 1순위 진행  
**기준 기기:** Samsung SM-A176B (RRGL4046NTW) · Android 16  
**베이스라인 커밋:** `3201dd96` (2026-06-20 — 잠금 수신 정상 시점, V4 lane **미존재**)  
**현재:** `HEAD` — `dibay-call-lane.json` → `v4TelegramLane: true`

**Telegram parity (트랙 2):** 본 회귀 감사 **결과 확정 전 보류** → [`dibay-call-telegram-lock-parity-audit.md`](./dibay-call-telegram-lock-parity-audit.md)

---

## 왜 최우선인가

| 사실 | 근거 |
|------|------|
| V4 lane 이전 동일 계열 기기 잠금 수신 정상 | 현장 QA + `3201dd96` 계약 |
| 6/24 `v4TelegramLane: true` 활성화 | `af307a99` · `android/app/src/main/assets/dibay-call-lane.json` |
| 잠금 Policy A: `manual_start_activity=false` | `IncomingCallBackgroundNotifier.presentV4LockFsiOnlyIncoming` |
| `fsiAllowed=false` 시 Activity 직접 기동 없음 | `fsi_denied_fallback` → notification만 |
| V3 경로는 `launchIncomingActivity("lock_fcm_immediate")` 존재 | `3201dd96` `presentLockIncoming` |

→ **코드 변경 사실**이며, Samsung FSI만으로 설명하기 어렵다.  
**Telegram parity보다 먼저:** V3에서 제거된 직접 Activity 경로가 정말 필요했는지 검증.

**코드 수정 금지** — A/B 실측 + diff SSOT 확보 후 설계 결정.

---

## 1순위 — Lane OFF / ON A/B (SM-A176B)

### 목적

동일 기기·동일 잠금/잠자기 조건에서 **lane 분기만** 또는 **구/신 APK**로 수신 UI 차이 실측.

### A/B-A (권장 — lane 분기 격리)

| ARM | APK | `v4TelegramLane` | 기대 분기 |
|-----|-----|------------------|-----------|
| **OFF** | HEAD 빌드, asset `false` | `false` | legacy: `presentLockIncoming` → FGS 후 `launchIncomingActivity` (V4 Policy A **미진입**) |
| **ON** | HEAD 빌드, asset `true` (기본) | `true` | V4: `presentV4LockFsiOnlyIncoming`, `manual_start_activity=false` |

격리 worktree 예 (메인 브랜치 수정 없음):

```bash
git worktree add /tmp/samarket-ab-lane-off HEAD
echo '{"v4TelegramLane":false}' > /tmp/samarket-ab-lane-off/android/app/src/main/assets/dibay-call-lane.json
cd /tmp/samarket-ab-lane-off/android && ./gradlew assembleDebug
adb -s RRGL4046NTW install -r app/build/outputs/apk/debug/app-debug.apk
# 잠금 수신 1회 후:
node .qa-logs/v3-v4-regression-ab.mjs --arm lane-off --notes "v4TelegramLane false APK"
```

### A/B-B (전체 회귀)

| ARM | 커밋 | lane |
|-----|------|------|
| **V3 baseline** | `3201dd96` | 파일 없음 → lane **OFF** |
| **V4 current** | `HEAD` | `true` |

### 수신 시나리오 (각 ARM 동일)

1. 화면 끔 + 잠금  
2. DIBAY 앱 백그라운드/종료  
3. 음성/영상 수신 1회  
4. 즉시 logcat 캡처

```bash
adb -s RRGL4046NTW logcat -d | grep -E 'DIBAY_CALL_V4_LOCKSCREEN|DIBAY_CALL_V4|DIBAY_INCOMING_CALL|lock_presentation|lock_fcm_immediate|lock_incoming_fsi_only|manual_start_activity|fsi_denied|incoming_activity_shown|fallback_notification'
```

### 판정 표 (실측)

| ARM | 잠금 UI | Activity | 핵심 로그 | 판정 |
|-----|---------|----------|-----------|------|
| **lane OFF** (2026-06-26, repack APK) | **없음** | launch 시도 → **BAL_BLOCK** | `v4TelegramLane=false` · route=`/calls/` · `outside_app_incoming_activity_launch` · **FGS `ForegroundServiceStartNotAllowedException`** · `incoming_activity_shown` 없음 | **FAIL (UI)** |
| **lane OFF r2** (알림 권한 grant 후) | **없음** | 동일 BAL_BLOCK | `notificationEnabled=true` `fsiAllowed=true` · Activity START `result code=102` | **FAIL (UI)** |
| **lane ON** (6/26 이전 캡처, 동일 기기) | fallback만 | **미시도** (`manual_start_activity=false`) | `lock_incoming_fsi_only` · `fsi_denied_fallback` | **FAIL (UI)** |

리포트:
- lane OFF: `.qa-logs/v3-v4-regression-ab/report-lane-off-r2-2026-06-26T10-10-09-722Z.json`
- lane ON baseline: `.qa-logs/v3-v4-regression-ab/report-lane-on-baseline-2026-06-26T09-55-50-811Z.json`

**주의:** `lock_fcm_immediate` / `lock_presentation_immediate`는 **`3201dd96` 마커**. 현재 HEAD는 lane OFF여도 `presentLockIncoming`이 **queued** (6/24 이후 공통 변경). lane OFF에서 기대 가능한 차이는 `deliverPendingPresentation` → `launchIncomingActivity` **시도** vs lane ON Policy A **미시도**.

**APK 빌드:** worktree Gradle 타임아웃 → 메인 `app-debug.apk` asset만 교체·서명 (`/tmp/dibay-lane-off-apk/app-lane-off-debug-v2-signed.apk`). 설치 기기에서 asset `false` 확인됨.

스크립트: [`.qa-logs/v3-v4-regression-ab.mjs`](../.qa-logs/v3-v4-regression-ab.mjs)

---

## 2순위 — Diff SSOT (`3201dd96` → `HEAD`)

상세: [`artifacts/dibay-call-v3-v4-regression-diff-3201dd96-head.md`](./artifacts/dibay-call-v3-v4-regression-diff-3201dd96-head.md)

### 변경 규모

| 파일 | Δ (lines) |
|------|-----------|
| `IncomingCallBackgroundNotifier.java` | +643 / −36 |
| `IncomingCallNotificationBuilder.java` | +348 / −60 |
| `IncomingCallActivity.java` | +615 / −6 |
| `CallForegroundService.java` | +111 / −21 |

### 잠금 경로 계약 변경 (요약)

#### `presentLockIncoming` — **회귀 핵심**

| | `3201dd96` (V3) | `HEAD` (V4 lane ON) |
|--|-----------------|---------------------|
| FCM 직후 | `showIncomingCall` + **`launchIncomingActivity("lock_fcm_immediate")`** | `PendingIncomingPresentation.put` only → **FGS defer** |
| 로그 | `lock_presentation_immediate` | `lock_presentation_queued` |
| V4 Policy A | 없음 | `presentV4LockFsiOnlyIncoming` · **`manual_start_activity=false`** |
| FSI deny | Activity 기동 **시도함** (FCM 경로) | Activity **미시도** → `fsi_denied_fallback` |

#### `deliverPendingPresentation` (FGS 이후)

| | `3201dd96` | `HEAD` (lane ON) |
|--|------------|------------------|
| 잠금/백그라운드 | `launchIncomingActivity` → notification | `presentV4NonForegroundIncoming` → lock이면 **Policy A only** |

#### V4 lane 게이트

- `CallV4Lane.isTelegramLaneEnabled()` — asset `v4TelegramLane` 또는 shared_prefs  
- lane ON 시 `IncomingCallPushDelivery`에 owner claim · `logLockscreenEvent` 추가  
- lane OFF 시 legacy `launchIncomingActivity` 분기 유지 (`deliverPendingPresentation` 등)

### V4 lane 관련 커밋 (6/24~)

```
af307a99 feat(cm-call-v4): add telegram lane phase 1 call screen
32c97f73 fix(cm-call-v4): defer lock incoming UI to FGS like background path  ← lock 즉시 기동 제거
7b0ba6b9 fix(cm-call-v4): use CallStyle FSI as lock screen incoming primary surface
546d2d28 fix(cm-call-v4): Telegram-parity single fullscreen incoming on Android
675da9d4 fix(cm-call-v4): Activity-first incoming — no parallel CallStyle UI
1e3e4633 fix(call-v4): stabilize Android incoming FSI and fallback QA
6ebb61f7 fix(call-v4): add lockscreen fallback for FSI gaps
```

---

## 3순위 — Telegram parity

회귀 원인·수정 방향 확정 **후** 재개.  
Telegram이 ConnectionService를 쓴다는 **idle 실측**만 있고, 잠금 수신 **인과**는 미확정.

---

## Phase 결정 (보류)

A/B + diff SSOT 후:

| 옵션 | 조건 |
|------|------|
| V3 잠금 직접 Activity 경로 **복원** (lane ON에서도 FSI deny 시) | A/B에서 lane OFF만 PASS일 때 |
| Policy A 유지 + FSI 설정 UX만 | lane ON PASS가 FSI allow 후에만일 때 |
| Telegram 구조 검토 | 회귀 아님이 실측으로 증명된 후 |

---

## 제출 형식

```
### V3→V4 Regression A/B
기기: SM-A176B
ARM: lane OFF | lane ON | 3201dd96 | HEAD
fsiAllowed: true|false
로그: (시간순)
UI: 0|1|2 surfaces
판정: PASS|FAIL|REGRESSION_CONFIRMED
```

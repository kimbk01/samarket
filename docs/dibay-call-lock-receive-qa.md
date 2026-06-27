# DIBAY Call V4 — 잠금 화면 수신 QA (LOCK)

**범위:** Android 14+ · Samsung 등 OEM FSI AppOps · 배터리 최적화 · CallStyle fallback

**트랙 분리 (2026-06-26):**

| 트랙 | 상태 | 범위 |
|------|------|------|
| **1. 제품 UX LOCK** | **CODE PASS** | `checkCallReceiveSettings` 분리 · 전화 수신 안정화 UI · FSI/배터리 안내 · 온보딩 자동 설정 이동 제거 · QA 문서화 |
| **2. Telegram parity** | **DEFERRED** | V3→V4 회귀 감사 후 재개 — [`dibay-call-v3-v4-regression-audit.md`](./dibay-call-v3-v4-regression-audit.md) |
| **0. V3→V4 regression** | **OPEN — 최우선** | lane OFF/ON A/B · `3201dd96` diff SSOT |

> **주의:** 트랙 1 PASS는 rollback 불필요·UX 보강 승인을 의미한다. **Telegram 동일 조건 LOCK은 아직 아님.** `fsiAllowed=false`를 “제품 종료·expected”로만 닫지 않는다.

로그 수집:

```bash
adb logcat -s DIBAY_CALL_V4_LOCKSCREEN DIBAY_CALL
```

---

## 판정 분류 (LOCK)

### A. 권한 미허용 — UX 안내 기대 (트랙 1)

다음 중 하나라도 해당하면 **잠금 전체화면 Activity 미표시는 Android FSI 경로상 가능**하다. presentation 회귀로 분류·rollback 하지 않는다.

> 트랙 2: **동일 기기에서 Telegram이 수신되는 경우** 이 상태만으로 parity 달성을 주장하지 않는다.

| 신호 | 의미 |
|------|------|
| `fsiAllowed=false` / `fullScreenIntentAllowed=false` | USE_FULL_SCREEN_INTENT AppOps deny |
| `full_screen_intent_blocked` | FSI 게시 차단 |
| `fsi_denied_fallback` / `fsi_skipped_denied` | FSI 경로 스킵 → fallback 알림 |
| `batteryOptimizationIgnored=false` | Doze/배터리 제한 — 수신 지연·FGS 실패 가능 |
| `SUPPRESSED_EFFECT_FULL_SCREEN_INTENT` | DND·알림 효과 억제 |
| `ForegroundServiceStartNotAllowedException` | 잠금/백그라운드 FGS 제한 |

**PASS (A):** 앱이 `checkCallReceiveSettings` 상태를 분리 표시하고, 설정 화면·온보딩에서 FSI·배터리 안내 제공.

**FAIL (A):** 권한 deny인데 “UI 구현 실패”로 rollback 하거나, 원인 없이 빈 화면만 노출.

### B. 권한 허용 (제품 기대)

| 조건 | 기대 |
|------|------|
| `fsiAllowed=true` (`fullScreenIntentAllowed=true`) | 잠금 FSI Activity 경로 허용 |
| `batteryOptimizationIgnored=true` | 권장 — 잠자기 수신 안정 |
| `postNotificationsGranted` + `notificationsEnabled` + 수신 채널 미차단 | CallStyle·fallback 게시 가능 |

**PASS (B):** 잠금/잠자기 수신 UI **정확히 1개**, 수락·거절·cleanup 정상, UI 0개/2개 없음.

**FAIL (B):** 권한 허용인데 FSI·fallback 모두 없거나 중복 UI.

---

## Fallback (FSI denied)

FSI deny 시 **전체화면 Activity를 기대하지 않는다.**

| 로그 | 의미 |
|------|------|
| `fallback_notification_posted` | NotificationManager에 CallStyle fallback 게시 시도 성공 |
| `fsi_skipped_denied` | FSI 경로 생략 (정상) |

사용자가 **수신 통화 채널 자체를 차단**한 경우 fallback도 제한될 수 있음 → 로그·`incomingChannelBlocked`로만 판정.

---

## 실측 — Samsung SM-A176B (Android 16)

**기기:** RRGL4046NTW · SM-A176B · Android 16

| 항목 | 결과 |
|------|------|
| `fsiAllowed` / `fullScreenIntentAllowed` | **false** — USE_FULL_SCREEN_INTENT AppOps **deny** |
| `batteryOptimizationIgnored` | **false** |
| DND / notification effects | `SUPPRESSED_EFFECT_FULL_SCREEN_INTENT` **가능** |
| 잠금 FSI Activity | **미표시 (LOCK A — UX 안내 대상)** |
| 분류 | AppOps deny + 배터리 제한. **V4 presentation/UI 회귀 아님** · **Telegram parity 미해결** |

**트랙 1 다음:** APK 재빌드 → 설정 화면 「전화 수신 안정화」QA → FSI·배터리 허용 후 **LOCK B** 재QA.

**트랙 2 다음:** Telegram parity audit — 동일 기기에서 Telegram 권한·채널·Telecom role 대비 DIBAY Case 2 구조 갭.

앱 내 확인: 마이페이지 → 기기 권한 → **전화 수신 안정화** 섹션.

---

## 제품 문구 (금지/허용)

| 금지 | 허용 |
|------|------|
| 「알림을 켜야 전화가 됩니다」 | FSI 꺼짐 시 잠금 전체 수신 화면 **제한될 수 있음** 안내 |
| FSI deny를 앱 버그로 표현 | OS 정책·설정 안내 + 설정 진입 버튼 |

---

## 관련 verify

```bash
npm run verify:android-device-permissions-contract
npm run verify:call-v4-incoming-fsi-fallback-boundary
npx vitest run lib/permissions/__tests__/android-call-receive-stability.test.ts
```

---

## 제출 형식

```
### LOCK A / B
기기: ...
checkCallReceiveSettings: { ... }
[DIBAY_CALL_V4_LOCKSCREEN] (시간순)
판정: LOCK A EXPECTED / LOCK B PASS / FAIL
```

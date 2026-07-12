# DIBAY Legacy Receive Policy

**Status:** Product + implementation SSOT (2026-07)  
**Scope:** Permission UX layer, tier separation, agent guidance  
**Out of scope (LOCK):** Native Runtime / FCM / `NotificationReceiveGate` / Agora — see §정책 불변 원칙

---

## 최우선 원칙 (DIBAY 구조 — 레거시 앱 일반 원칙 아님)

**현재 DIBAY 구조에서 Runtime 수신을 차단하는 공식 게이트는 Notification Permission (`receiveReady`)뿐이다.**

다음 권한은 **Runtime 수신을 차단해서는 안 되며**, Runtime **이후** 단계에서만 영향을 준다.

| 권한 | tier |
|------|------|
| Full Screen Intent | Lock Screen |
| Microphone | Media |
| Camera | Media |
| Battery Optimization | Lock Screen |
| Speaker | Media / audio route |
| Bluetooth | Media / audio route |

**금지 표현**

- “전화 수신을 막을 수 있는 권한은 Notification Permission뿐이다.” (레거시 앱 **일반 원칙**으로 단정)
- “카카오톡·텔레그램·당근·배민도 동일한 코드 게이트를 쓴다.”

**허용 표현**

- “현재 DIBAY Native SSOT에서는 `receiveReady`가 FCM Runtime 진입 조건이다.”
- “레거시 UX 목표는 Post-login OS 알림·(Android) FSI 확인, 발신·수락 시 mic/camera OS prompt이다.”

레거시 앱에서 알림이 통화·메시지·주문 수신에 **사실상 필수**인 것은 **UX·플랫폼 관행**이며, DIBAY **코드 게이트**와 동일하다고 단정할 수 없다.

---

## Runtime / Lock / Media 3계층 정책 (SSOT)

세 계층을 **절대 혼동하지 않는다.** 한 tier의 문제를 다른 tier의 원인으로 보고하지 않는다.

### Runtime 계층

```
Notification (receiveReady)
  ↓
FCM
  ↓
IncomingCallPushDelivery
  ↓
Runtime
  ↓
Ring
  ↓
Incoming UI
```

- **Notification Permission만** Runtime 진입에 영향을 준다.
- FSI, Mic, Camera, Battery, Speaker, Bluetooth는 **Runtime을 차단하지 않는다.**

**코드 (LOCK):** `IncomingCallPushDelivery` → `!receiveReady` → return.  
`lockScreenIncomingReady=false` → log only, Runtime **계속**.

### Lock Screen 계층

```
Runtime (already entered)
  ↓
Full Screen Intent (+ battery tier)
  ↓
잠금화면 Full Screen UI
```

- FSI는 **잠금화면 표시만** 담당한다.
- Runtime을 차단하지 **않는다**.
- Ring은 **유지**된다.
- Incoming UI는 **유지**된다.
- FSI가 없으면 **notification-only fallback**을 사용한다.

**코드 (LOCK):** `NotificationReceiveGate.lockScreenIncomingReady` — FSI/battery는 `receiveReady`에 **포함되지 않음**.

### Media 계층

```
사용자 수락
  ↓
Voice → Microphone → Join

사용자 수락
  ↓
Video → Microphone → Camera → Join
```

- Mic/Camera는 **Join 단계**에서만 필요하다.
- 수신(Runtime, Ring, Incoming UI)을 차단해서는 **안 된다**.
- 권한은 **사용자 제스처(발신 또는 수락) 이후** OS가 요청한다.

**코드 (LOCK):** `NativeVoiceCallRuntime.handleIncoming` / `NativeVideoCallRuntime.handleIncoming` — mic/camera 검사 **없음**.  
Media prompt: `callPermissionGate` / `call-media-permission-preflight` (gesture boundary).

---

## 권한/상태 영향 표

| 권한/상태 | Runtime tier | Lock Screen tier | Media tier |
|-----------|-------------|------------------|------------|
| Notification denied | **차단** | 영향 | 간접 |
| Notification allowed | OK | tier별 | tier별 |
| FSI OFF | OK | full UI 제한, notification-only | — |
| Battery restricted | OK | full UI 제한 | — |
| Mic denied | OK | — | Voice/Video join |
| Camera denied | OK | — | Video join |
| Speaker / Bluetooth | OK | — | audio route only |

---

## Post-login Permission UX (레거시 UX 목표)

| 플랫폼 | Post-login |
|--------|------------|
| **Android** | OS Notification → FSI 상태 확인 → OFF 시 OS 설정. DIBAY 장문 popup **금지**. |
| **iOS** | OS Notification만. FSI/Battery/Android Intent **없음**. |
| **Web** | Browser Notification — **브라우저·user gesture 정책** 준수. Native와 **동일하게 만들지 않음**. |

| 항목 | 정책 |
|------|------|
| mic / camera / battery | **로그인에서 묻지 않음** |
| Notification 거부 | 가능. 푸시 기반 통화 수신 제한 가능 — **장문 DIBAY Popup 금지** |
| Battery | 로그인 제외. **발신 시** `runLockScreenEducationIfNeeded` → 배터리 제한이면 `requestBatteryOptimizationExemption` (원탭 OS 허용 팝업, Android). |

**Permission UI 구현 (non-LOCK):**

- `DiBaYDevicePermissionOnboardingGate` — notification OS → FSI OS settings (Android)
- `runPostLoginFullScreenIntentCheck` — FSI off → `openFullScreenIntentSettings()` 직행

---

## 현재 DIBAY Native SSOT (코드 참조)

### `receiveReady` (Runtime tier)

Native (`NotificationReceiveGate.java`):

- `POST_NOTIFICATIONS` granted (API 33+)
- app notifications enabled
- incoming call channel enabled

JS layer adds: `!appBlocked` (`notification_required_blocked`).

**NOT in receiveReady:** FSI, battery, mic, camera, speaker, bluetooth.

### `lockScreenIncomingReady` (Lock Screen tier)

```
receiveReady
AND fullScreenIntentAllowed
AND batteryOptimizationIgnored
```

---

## 정책 불변 원칙

앞으로 Permission UX를 변경하더라도 **아래 원칙은 변경하지 않는다.**

1. **Runtime 계층**
2. **Lock Screen 계층**
3. **Media 계층**

**세 계층은 서로 독립적으로 유지한다.**

Permission UX를 변경하기 위해 **Runtime, FCM, Agora, Native Runtime, `NotificationReceiveGate`를 수정하지 않는다.**

`receiveReady` 게이트 자체를 바꾸려면 **별도 LOCK 해제·제품 승인** 과제로 분리한다.

### LOCK 파일 (Permission UX 작업 시 diff 0 유지)

- `android/`, `ios/`
- `IncomingCallPushDelivery`, `NotificationReceiveGate`, `IncomingCallNotificationBuilder`
- `NativeVoiceCallRuntime`, `NativeVideoCallRuntime`
- FCM / Push Runtime core, Agora
- `callPermissionGate`, `call-media-permission-preflight`

---

## Related

- `docs/permissions/dibay-notification-permission-ssot.lock.md` — `receiveReady` / `lockScreenIncomingReady` composite
- `.cursor/rules/dibay-notification-permission-ssot.mdc`

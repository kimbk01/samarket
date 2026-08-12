# Phase 2-5 — Cross-Platform Notification Delivery Strategy

**Date:** 2026-08-01  
**Status:** **S3 APPROVED** · **Layer model HARD LOCK** · contract LOCKED · implementation **not started** · not PRODUCT PASS / FINAL LOCK  
**Former name (superseded):** “Android Badge Delivery Strategy”  
**Neighbor LOCK (do not reopen):** Phase 1 RoomUnread · Phase 2 Badge Projection/Writer SSOT · Phase 3 Bell · Phase 4 Batch A · Batch B forbidden  

**Spike (Android experiment only):**  
`docs/notifications/2026-08-01-android-badge-silent-probe-spike.md`  
`.qa-logs/badge-ssot-phase4/launcher/silent-probe/`

**Canonical pointer:** older file `2026-08-01-phase2-5-android-badge-delivery-strategy.md` redirects here.

---

## L0. Layer HARD LOCK (team lead — pre-implement)

Cross-Platform Notification Delivery is frozen as **adapters only**. S3 may modify **Delivery Adapter Layer** exclusively.

```
─────────────────────────────
Product Layer                          LOCK
─────────────────────────────
AppIconTotal · Bell · Bottom · Trade · Customer · Owner

─────────────────────────────
Projection Layer                       LOCK
─────────────────────────────
Badge Projection · Bell Projection · Explain Matrix

─────────────────────────────
Authority Layer                        LOCK
─────────────────────────────
RoomUnread · Notification Event

─────────────────────────────
Delivery Adapter Layer                 S3 ONLY (when implement ordered)
─────────────────────────────
Android Adapter · iOS Adapter · Web Adapter

─────────────────────────────
Platform                               (OS / browser — not product math)
─────────────────────────────
Android Launcher · APNS · Browser
```

### Pipeline (immutable)

```
Authority → Projection → Delivery Adapter → Platform
```

Only the last Adapter differs per platform. Product numbers stay one.

### Adapter contract (same on every platform)

| Platform | Delivery Adapter duty |
|----------|------------------------|
| Android | `Notification.setNumber(appIconTotal)` (+ S3 summary rules) |
| iOS | `aps.badge = appIconTotal` (+ Cap echo) |
| Web | Badge API = `appIconTotal` when supported |

### Absolute modify ban (S3 / Cursor)

RoomUnread · Badge Projection · Bell Projection · Explain Matrix · Notification Event · Projection math · Bottom / Trade / Customer / Owner / AppIconTotal calculation · Product Layer contract.

### Implementer role

Cursor is **not** “the person who recalculates badges.”  
Cursor is **the person who delivers already-projected `appIconTotal` to platform adapters.**

Violation of Layer LOCK = project FAIL (even if digits look right).

**Final operating principles (team lead):**  
`2026-08-01-dibay-notification-final-operating-principles-lock.md`  
**Golden Rule:** `2026-08-01-dibay-notification-golden-rule-lock.md`  
— five layers · Kernel LOCK · Adapter-only · Surface display-only · PASS = user-visible ≡ Explain · no Badge.get PASS.

---

## 0. Why this phase was renamed

DIBAY product goal from day one:

```
Android = iOS = Web (same user experience)
```

Badge **Projection** (`appIconTotal`) is already one Authority.  
What was missing is **Delivery** — how that number reaches the user-visible App Icon / OS badge on each platform.

Phase 2-5 is therefore **Notification Delivery Strategy**, not an Android-only patch.

Spike proved Android needs Notification + `setNumber`. That does **not** make Android a separate product; it is one platform adapter under one contract.

---

## 1. Platform-independent product contract (highest priority)

| Rule | Requirement |
|------|-------------|
| P0 | **App Icon product behavior is platform-independent.** Same meaning, same increase/decrease rules. |
| P1 | **Single Authority number:** `appIconTotal` from Badge Projection SSOT (HARD LOCK). |
| P2 | Android · iOS · Web (PWA Badge when supported) **all consume the same `appIconTotal`**. |
| P3 | No platform may invent a second App Icon formula, Heal, or Bell-derived total. |
| P4 | Cap / local cache / OEM helpers are **echoes**, never product Authority. |

```
RoomUnread Authority                         LOCK
        ↓
Badge Projection → appIconTotal              HARD LOCK
        ↓
┌─────────────────────────────────────────┐
│  PRODUCT CONTRACT (one)                   │
│  App Icon digit ≡ appIconTotal            │
│  Read of correct domain → digit decreases │
│  Zero unread → App Icon 0                 │
└─────────────────────────────────────────┘
        ↓
   platform adapters only (below)
```

---

## 2. Product contract vs platform implementation

```
Product contract (one)
        ↓
┌───────────────────┬───────────────────┬───────────────────┐
│ Android Delivery  │ iOS Delivery      │ Web Delivery      │
│ NotificationMgr   │ APNS aps.badge    │ PWA Badge API     │
│ + setNumber(N)    │ + Cap Badge echo  │ (when supported)  │
│ + S3 summary rule │ + real notifs     │ Bell/Inbox UI     │
└───────────────────┴───────────────────┴───────────────────┘
        ↓
User-visible App Icon / OS badge / (Web) install badge
```

| Layer | Owns |
|-------|------|
| Product | Meaning of `appIconTotal`; read/zero lifecycle; parity of user experience |
| Android adapter | Tray notifications, `setNumber`, S3 summary constraints |
| iOS adapter | APNS `badge`, Cap Badge.set, notification presentation |
| Web adapter | In-app surfaces always; PWA Badge only if runtime supports |

Bell SSOT stays separate: Bell digit = `notification_events` unread — not App Icon.

---

## 3. Strategy decision (S1 / S2 / S3)

### 3.1 S1 — REJECTED

Cap `Badge.get` / ShortcutBadger alone as delivery. Spike: Cap ≠ Launcher.

### 3.2 S2 — REJECTED

Always-on silent / MIN badge-only notification. Numbers without understandable product reason → UX FAIL.

### 3.3 S3 — APPROVED (cross-platform direction)

```
① Real user notifications exist
     → deliver appIconTotal to OS badge
       Android: Notification.setNumber(appIconTotal)
       iOS:     APNS aps.badge / Cap Badge.set(appIconTotal)
       Web:     PWA Badge.set(appIconTotal) when supported
     → user reads → Projection ↓ → OS badge ↓; Bell on its own read path

② ONLY when appIconTotal > 0 AND no active domain tray notifications (Android)
     → ONE product summary notification (see §4–§5)
     → never a Bell/Inbox/notification_events row
```

iOS/Web do not use Android’s summary tray as Authority; they must still match the **same product flow** in §7.

---

## 4. Android implementation constraints (extra approval conditions)

| # | Constraint |
|---|------------|
| A1 | Summary notification may auto-create **only if** real unread exists (`appIconTotal > 0`) **and** **zero** active domain DIBAY notifications. |
| A2 | When any real domain notification appears again → **immediate cancel** of summary. |
| A3 | **Forbidden:** real notification(s) **and** summary notification **simultaneously**. |
| A4 | Summary is **Notification Delivery only** — not a Bell Event. |
| A5 | Summary must **never** insert into `notification_events`, Bell digit, or Inbox rows. |
| A6 | Copy must be product-understandable (not bare digit). See §6. |
| A7 | `appIconTotal == 0` → immediate remove summary + clear OS badge. |
| A8 | Remove primarily on **read**, not dismiss-loop recreate. |
| A9 | Visible identity: `setNumber == appIconTotal == home digit` (FAIL if divergent). |
| A10 | No reopen RoomUnread / Projection / Bell / Heal / Batch B. |

---

## 5. Bell separation (absolute)

| Surface | Authority | Summary notification may… |
|---------|-----------|----------------------------|
| App Icon | `appIconTotal` | Carry `setNumber` / OS badge only |
| Bell / Inbox | `notification_events` | **Never** create/update/delete rows for summary |
| Domain tray | FCM/local event posts | Real events only |

**FAIL:** summary writer calls Bell insert, Inbox merge, or `notification_events` create.

---

## 6. Summary notification product copy (Android secondary path)

| Field | ko (intent) | en (intent) |
|-------|-------------|-------------|
| Title | DIBAY | DIBAY |
| Body | 읽지 않은 알림 {n}개가 있습니다. 탭하여 확인하세요. | You have {n} unread notifications. Tap to review. |
| Tap | Open Notifications Inbox UI (destination only — does not create Bell rows) | same |

i18n keys only at implementation (ko/en + user-sentence fallback). No key literal on UI.

---

## 7. Product PASS / FINAL LOCK flow (Android = iOS)

Required end-to-end **same user story** on Android and iOS before FINAL LOCK:

```
Real notification exists
        ↓
App Icon shows appIconTotal
        ↓
User reads those notifications / rooms (correct read paths)
        ↓
(If Android shade empty but appIconTotal > 0)
        Summary notification created  [Android adapter only]
        App Icon still appIconTotal
        ↓
User completes Bell / remaining unread reads as product requires
        ↓
Summary removed (Android) when appIconTotal → 0
        ↓
App Icon 0
```

| Gate | PASS |
|------|------|
| X1 | Android: real notif → icon N → read → (optional summary if empty tray) → Bell/unread clear → summary gone → icon 0 |
| X2 | iOS: same product sequence with APNS badge (no Android summary object required; badge still tracks `appIconTotal`) |
| X3 | Web: Bell/Inbox/hubs track SSOT; PWA Badge = `appIconTotal` when supported |
| X4 | No Bell row invented by Delivery summary |
| X5 | Xiaomi ×3 · Samsung ×3 · iOS device PASS · Web parity check |

Until X1–X5:

```
CROSS-PLATFORM NOTIFICATION DELIVERY  INCOMPLETE
ANDROID LAUNCHER BADGE PRODUCT        FAIL (until Android adapter PASS)
DIBAY NOTIFICATION SYSTEM             RUNTIME PARTIAL
FINAL LOCK                            미선언
Batch B                               금지
```

---

## 8. Spike facts (Android — frozen)

| Fact | Evidence |
|------|----------|
| Cap-only ≠ Launcher | Pre-spike + Spike A |
| Active notif + setNumber(N) → numeric N (Samsung & Xiaomi) | Spike B–D |
| Cancel → launcher 0 | Spike E |
| Silent forever ≠ product | Team lead UX FAIL |

---

## 9. Platform adapter notes

### 9.1 Android

- Primary: domain tray + `setNumber(appIconTotal)`.
- Secondary: S3 summary under §4 only.
- Cap Badge.set = echo only.

### 9.2 iOS

- Primary: APNS `aps.badge = appIconTotal` on pushes; foreground Cap Badge.set echo.
- Real notifications remain user-visible events.
- No `notification_events` invent for badge paint.
- Product flow §7 must match Android outcomes.

### 9.3 Web

- Bell / hubs / Explain always from SSOT.
- PWA Badge API: set/clear to `appIconTotal` only when supported; else N/A (not FAIL if unsupported).

---

## 10. Implementation boundary

**Not authorized until explicit “S3 implement” order.**

When ordered:

1. Touch **only** Android / iOS / Web **Delivery Adapter** code paths (§L0).  
2. Android adapter first (S3 + A1–A10), then iOS parity (X2), then Web (X3).  
3. Forbidden: any Authority / Projection / Product Layer edit · Batch B · summary → Bell rows · silent forever · recalculating App Icon in the adapter.

---

## 11. Official status

| Item | Status |
|------|--------|
| Phase name | **Cross-Platform Notification Delivery Strategy** |
| Layer model (Product / Projection / Authority / Adapter / Platform) | **HARD LOCK** (§L0) |
| Product contract (one `appIconTotal`) | LOCKED |
| S3 direction | APPROVED — Adapter Layer only |
| S1 / S2 | REJECTED |
| Android summary constraints A1–A10 | LOCKED pre-implement |
| Bell separation | LOCKED |
| Phase 1–3 / Batch A | Must not reopen |
| Implementation | NOT STARTED |
| FINAL LOCK | Requires Android + iOS same flow (§7); Web parity |

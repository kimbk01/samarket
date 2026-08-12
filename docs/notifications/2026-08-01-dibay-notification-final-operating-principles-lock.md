# DIBAY Notification — Final Operating Principles LOCK

**Declared:** 2026-08-01 (team lead)  
**Mutate:** Forbidden without explicit team-lead override.  
**Related:**  
`2026-08-01-dibay-notification-golden-rule-lock.md` (**supreme layer view**)  
`2026-08-01-phase2-5-cross-platform-notification-delivery-strategy.md` §L0  
`2026-08-01-phase2-5-delivery-adapter-layer-hard-lock.md`  
`2026-08-01-dibay-notification-ssot-roadmap-lock.md`

---

## 1. Kernel — permanent LOCK

Nobody modifies these without team-lead override. This is the **DIBAY Notification Kernel**:

| Kernel | Status |
|--------|--------|
| RoomUnread Authority | LOCK |
| Badge Projection | HARD LOCK |
| Bell Projection | HARD LOCK |
| Explain Matrix | LOCK |
| Notification Event | LOCK |

Also frozen as Product / Projection surfaces: AppIconTotal · Bell · Bottom · Trade · Customer · Owner **meaning and calculation**.

---

## 2. Only Adapters may change

Cursor (and any implementer) may modify **only**:

- Android Delivery Adapter  
- iOS Delivery Adapter  
- Web Delivery Adapter  

Role: **deliver** already-projected values.  
Not: recalculate RoomUnread / Badge / Bell / hubs.

---

## 3. Adapter single responsibility

### Android Adapter

```
appIconTotal  →  Android Launcher
```

Must **not** know or rewrite: Bell · RoomUnread · Trade · Customer · Owner (as calculation).

May read `appIconTotal` (and tray lifecycle needed for S3 delivery). Must not invent Authority.

### iOS Adapter

```
appIconTotal  →  aps.badge
```

Same ignorance of Bell / RoomUnread / hub math.

### Web Adapter

```
appIconTotal  →  PWA Badge API (when supported)
```

Bell/Inbox UI remains Bell SSOT consumers — not Delivery inventing Bell rows.

---

## 4. PASS = what the user sees

| Invalid PASS signal | Valid PASS signal |
|---------------------|-------------------|
| Cap `Badge.get` alone | Home / Launcher digit |
| Internal prefs / cache | Bell digit on screen |
| API JSON only | Bottom · Trade · Customer · Owner on screen |

All product surfaces must match their SSOT **on the actual UI** (and OS badge where applicable).

---

## 5. One product, three adapters

```
DIBAY is NOT three apps.
DIBAY is ONE product.

Authority · Projection · Explain  = one
Delivery Adapter                  = per platform only
```

Android · iPhone · Web must show the same product motion: same increases, same decreases after the correct read.

---

## Pipeline (never reverse)

```
Authority → Projection → Delivery Adapter → Platform
```

---

## Current program status

| Item | Status |
|------|--------|
| Direction | NORMAL / APPROVED |
| Kernel | LOCK |
| Layer model | HARD LOCK |
| S3 Delivery | APPROVED · not started |
| FINAL LOCK | Not declared until Android = iOS (= Web) user-visible parity |

**Violation of these principles = structural FAIL**, even if a single OEM digit looks correct.

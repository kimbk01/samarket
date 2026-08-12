# Android App Icon Badge — Native/Launcher single-cause audit

**Date:** 2026-08-01  
**Production SHA / APK:** `ec9c3e7b3` / `dibay-fpv-ec9c3e7b3-ec9c3e7b3.apk`  
**Scope:** Native → OEM Launcher only. RoomUnread / Badge Projection / Bell **not** modified.

## Official chain (code)

```
Projection appIconTotal
→ domain-badge-surface-store
→ NativeBadgeSync
→ syncNativeBadgeCount → Capawesome Badge.set
→ ShortcutBadger.applyCount + SharedPreferences("capacitor.badge")
→ (expected) launcher glyph

FCM (separate):
badge_count → DibayFirebaseMessagingService.showMessageNotification
→ NotificationCompat.setNumber(badgeCount)
→ channel showBadge → launcher
```

## Measured facts

| Layer | Xiaomi `8b37179f7d94` | Samsung `RFCY40PY2CA` |
|-------|----------------------|------------------------|
| Cap prefs `capacitor.badge` | **32** | **32** |
| Active *message* notifications | **0** | **0** |
| Active other (call FGS etc.) | 0 | video call / incoming (no useful `number`) |
| Channel `mShowBadge` (chat/trade/…) | **true** | **true** |
| App “알림 배지 / 앱 아이콘 배지” | **ON** (`checked=true`) | **ON** |
| System `notification_badging` | 1 | (badge_app_icon_type=0 = numeric preferred) |
| Other apps numeric launcher | Chrome/Kakao/Google folder yes | Messages **145** |
| DIBAY launcher | **dot only** | **none** |
| `com.sec.android.provider.badge` | n/a | **provider missing** |

Evidence: `.qa-logs/badge-ssot-phase4/launcher/`  
(`*-home-A-badge-set-only.png`, `*-app-notification-settings.png`, channel dumps)

## Writer conflict

- `Badge.set` / `Badge.clear` only via `syncNativeBadgeCount` (+ logout clear).
- Capawesome `Badge.get()` = **SharedPreferences only**, not launcher (false product signal).
- No Cap `autoClear` in `capacitor.config`.
- FCM `setNumber` only when a message tray notification is posted; warm Cap sync does **not** call `setNumber`.
- Stale channel id `dibay_badge_silent_v1` exists on devices with `mShowBadge=true`, but **no current Java creator/poster** in tree.

## First divergent step

```
Projection == Cap prefs (Badge.get) == 32
→ ShortcutBadger / setNumber → launcher
```

- **Samsung:** ShortcutBadger Samsung content-provider path is dead on this One UI build; without active notification `setNumber`, launcher stays 0. Settings OK → **native delivery FAIL**.
- **Xiaomi:** Settings badge ON; device shows numeric badges for other apps; DIBAY Cap-only path yields **dot**, not 32. Not proven OEM-dot-only; not settings-blocked. → **native delivery incomplete for numeric** (needs notification-number path like peer apps).

## Samsung A–E (partial)

| Step | Badge prefs | Active msg notif | Launcher |
|------|-------------|------------------|----------|
| A Cap set only, no msg notif | 32 | 0 | **0** (confirmed) |
| B FCM + setNumber | pending (needs send or native post) | | |
| C local + setNumber | pending | | |
| D keep | pending | | |
| E cancel | pending | | |

## Verdict labels (evidence-only)

```
SAMSUNG LAUNCHER FAIL          (settings ON, Cap=32, glyph=0)
XIAOMI NATIVE IMPLEMENTATION FAIL for numeric
  (settings ON; other apps numeric; DIBAY dot-only under Cap-only)
NOT yet: XIAOMI OEM DOT-ONLY LIMITATION
NOT yet: XIAOMI SETTINGS BLOCKED (toggle currently ON)

ANDROID LAUNCHER BADGE PRODUCT  FAIL
DIBAY NOTIFICATION SYSTEM       RUNTIME PARTIAL
PRODUCT PASS / FINAL LOCK       미선언
BATCH B                         금지
```

## Single-cause hypothesis (allowed fix class)

Modern Samsung (and Xiaomi numeric) launcher badges for DIBAY require **`NotificationCompat.setNumber(appIconTotal)` on an active notification**, not Capawesome/ShortcutBadger alone.

P0 docs already state tray `setNumber` as Android primary path; Cap path alone cannot satisfy product numeric App Icon when tray is empty.

### Proposed fix (approval required — may expose tray row)

1. Native helper: ensure channel `dibay_badge_silent_v1` with `setShowBadge(true)`, `IMPORTANCE_MIN`, silent.
2. On Cap/`syncNativeBadgeCount(n)`: if `n>0` upsert one silent notification with `setNumber(n)`; if `n==0` cancel it.
3. Keep Capawesome `Badge.set` as secondary echo (no Authority change).
4. Explicit `setShowBadge(true)` on message channel **create** (existing channels already true; helps new installs only).
5. **Do not** change RoomUnread / Projection / Bell / server totals.
6. UX: report tray visibility of MIN silent row; do not hide with permanent opaque hacks beyond MIN/silent.

Re-verify Xiaomi×3 / Samsung×3 warm / bg→fg / cold / ±1 / logout·login with home screenshots after fix.

## Forbidden (unchanged)

Heal, Batch B, Projection math, UI fake digits, OEM hardcode of 32, treating `Badge.get` as launcher PASS.

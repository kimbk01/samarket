# Android badge silent probe — Native spike results (NOT product merge)

**Date:** 2026-08-01  
**Scope:** Debug APK only (`DibayBadgeSilentProbeReceiver`). No commit / no Production / no product App Icon writer.  
**Channel:** `dibay_badge_silent_probe_v1` · IMPORTANCE_MIN · `setShowBadge(true)` · `setNumber(N)`  
**Evidence:** `.qa-logs/badge-ssot-phase4/launcher/silent-probe/{serial}/{A-E}/`

Devices restored to `dibay-fpv-ec9c3e7b3-ec9c3e7b3.apk` after the spike.

## Matrix

| Step | Xiaomi `8b37179f7d94` | Samsung `RFCY40PY2CA` |
|------|----------------------|------------------------|
| **A** no probe notif | Cap prefs was 32→(launch) later 0; **launcher 없음**; probe channel absent | Cap prefs 0; call FGS may linger; **launcher 없음** |
| **B** summary + setNumber(32) | active id=710032 number=32; channel mShowBadge=true; **home 숫자 32**; shade에 “DIBAY badge probe” **노출** | same; **home 숫자 32**; shade **노출** |
| **C** 32→33 | number=33; **home 33** | number=33; **home 33** |
| **D** 33→32 | number=32; **home 32** (png) | number=32; **home 32** (png) |
| **E** cancel | probe gone; **home 0** | dump 직후 id 잔존 race 가능했으나 **home 0** |

`Badge.get` / Cap prefs during B–E often **0** (app cold/warm cleared Cap cache). Launcher followed **notification setNumber**, not Cap prefs — confirms Cap≠launcher.

## Shade UX

Both OEMs show a normal notification row titled **“DIBAY badge probe”** (MIN still visible in shade). Not invisible. User can clear it → launcher goes to 0 (E).

## Spike verdict (team criteria)

```
Samsung + Xiaomi: actual numeric launcher PASS under active summary+setNumber
→ path is technically valid
→ NOT approved as silent permanent product patch
→ next: product design review for user-understandable “unread N” summary notification
   (or discard if shade UX unacceptable)

NOT: path discarded (numbers failed)
NOT: Xiaomi OEM DOT-ONLY (numeric proven with setNumber)
```

## Official labels (unchanged)

```
ANDROID LAUNCHER BADGE PRODUCT FAIL
DIBAY NOTIFICATION SYSTEM RUNTIME PARTIAL
FINAL LOCK 미선언
Batch B 금지
PRODUCT silent setNumber merge 불승인 (이번 spike만)
```

## Local debug artifacts (uncommitted)

- `android/app/src/debug/java/com/dibay/app/DibayBadgeSilentProbeReceiver.java`
- `android/app/src/debug/AndroidManifest.xml` (receiver registration)

These stay debug-source-set only until product design decides next step.

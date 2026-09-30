# DIBAY Device SSOT — FD1 Device Class HARD LOCK

**Status:** HARD LOCKED · LOCAL COMMIT  
**Declared:** 2026-09-25  
**Owner accepted:** YES  
**Evidence:** `.tmp/fd1-device-class-runtime/` (`samsung.json` · `xiaomi.json` · `iphonebk.json` · `SUMMARY.json`)

## Meaning of HARD LOCK (this domain)

HARD LOCK means:

- Canonical DeviceClass authority exists and was read from installed FD1 binaries
- DeviceClass is physical/product identity — not window width, not orientation
- 600dp Android threshold and iOS idiom rules are frozen
- iPad / Windows fixture absence stays **NOT_PROVEN** — not a defect, not a PASS
- It does **not** mean HEAD is origin/Production

```text
DeviceClass ≠ WindowClass ≠ Orientation ≠ LayoutMode ≠ Pane
768 / 767 MQ  ≠  tablet identity
Xiaomi 24076RP19G  =  TABLET_ANDROID  (sw601dp)
```

## AUTHORITY (baseline)

| Item | Value |
|---|---|
| HEAD | `15635e664cb55411a2b98a145b26e6d913c21267` |
| ORIGIN | `854dd5c920449badff151c761cf24c08a5c6f99a` |
| AHEAD / BEHIND | 1 / 0 |
| Production | **NOT THIS SHA** — local commit only |
| CURRENT DEVICE DEFECT | NONE PROVEN |

Product implementation is fixed on HEAD. origin/Production is still the previous SHA until `git push origin main`.

## Classification (LOCKED)

### Android

PRIMARY: `Configuration.smallestScreenWidthDp`

| Rule | Class |
|---|---|
| `>= 600` | `TABLET_ANDROID` |
| `< 600` | `PHONE_ANDROID` |

`screenLayout & SIZE_MASK` = FALLBACK only when smallestScreenWidthDp is unusable.  
When both are present and disagree: **sw wins**, record `conflict=true`. DeviceClass does not change because of the diagnostic.

Do not use current window px, display px, innerWidth, screen.width, CSS px, or orientation to classify Android.

### iOS

`UIDevice.current.userInterfaceIdiom` only

| Idiom | Class |
|---|---|
| `.phone` | `PHONE_IOS` |
| `.pad` | `TABLET_IPAD` |
| other | `UNKNOWN` |

No Mac Catalyst guess. No width.

### Windows / web

Proven Windows environment → `DESKTOP_WINDOWS`  
General desktop web → `WEB_DESKTOP`  
Unclear → `UNKNOWN`  
Narrow window must not become `PHONE_*`.

### UNKNOWN

Return `UNKNOWN`. Never coerce to `PHONE_ANDROID` / `PHONE_IOS` / `WEB_DESKTOP`.

## Runtime (LOCKED)

| Device | Canonical | Result |
|---|---|---|
| Samsung SM-M156S (`RFCY40PY2CA`) | `PHONE_ANDROID` · `smallestScreenWidthDp` · sw384 / NORMAL | PASS |
| Xiaomi 24076RP19G (`8b37179f7d94`) | `TABLET_ANDROID` · `smallestScreenWidthDp` · sw601 / LARGE | PASS |
| iPhonebk iPhone 14 Pro Max | `PHONE_IOS` · `userInterfaceIdiom` | PASS |

Rotation identity: DeviceClass unchanged on all three. PASS.

Xiaomi is an **Android Tablet-class fixture** for later FDs. Do not force `PHONE_ANDROID`. Do not change 600dp to fit the model name.

## NOT HARD LOCK blockers

| Item | Rule |
|---|---|
| iPad real device | NOT_PROVEN — fixture absence |
| Windows real PWA/browser | NOT_PROVEN — fixture absence |
| HEAD not on origin/Production | Operational pending push — not an FD1 defect |
| App may stay portrait (FD3) | Not an FD1 identity failure |

Do not promote NOT_PROVEN to PASS. Do not reopen FD1 because those fixtures are missing.

## Canonical files (do not redesign)

- `lib/device/dibay-device-class.ts`
- `lib/device/dibay-device-class-native.ts`
- `android/.../DibayDeviceClassPlugin.java`
- `ios/.../DibayDeviceClassPlugin.swift`
- `lib/platform/capacitor-native.ts` remains **shell** `android|ios` only — not DeviceClass

Session cache only. No localStorage DeviceClass authority.

## DO NOT

- Reopen FD1 to change 600dp, add model/UA/width exceptions, or fake Xiaomi as phone
- Use 768 / 767 as DeviceClass or tablet identity
- Implement orientation enforcement (FD3)
- Start WindowClass / Pane / UI work inside FD1 files
- Treat `am get-config` or idiom guess as DeviceClass PASS without the plugin API
- Touch Call / Messenger split / Community / Trade layout for DeviceClass reasons

## Reopen only if

- Canonical API returns the wrong DeviceClass
- DeviceClass changes on rotation / resize / keyboard / Split View / Stage Manager
- Native classification authority diverges from this contract
- iPad or Windows runtime later exposes an **actual classification defect**

## NEXT

FD2 WINDOW CLASS only. DeviceClass remains this HARD LOCK.  
FD2 consumes DeviceClass as input. It does not rewrite it.

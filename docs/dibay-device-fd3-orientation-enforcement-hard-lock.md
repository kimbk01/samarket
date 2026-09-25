# DIBAY Device SSOT — FD3 Orientation Enforcement HARD LOCK

**Status:** HARD LOCKED · LOCAL COMMIT  
**Declared:** 2026-09-25  
**Evidence:** `.tmp/fd3-orientation-runtime/` (`samsung.json` · `xiaomi.json` · `iphonebk.json`)

FD1 DeviceClass and FD2 Window authority remain READ-ONLY.  
FD2 WindowClass band numbers and domain floors stay `CANDIDATE_NOT_LOCKED`.

## Meaning

HARD LOCK means:

- Application-shell orientation has one native authority per platform
- That authority consumes FD1 DeviceClass — it does not copy 600dp / idiom rules
- PHONE_* application shell is portrait from first presentation
- TABLET_* does not receive a portrait request
- PWA manifest is not a phone-orientation SSOT
- Call-specific presentation is untouched (FD8)

It does **not** mean iPhone physical-rotate / cold-landscape was host-actuated.

## FIRST DIVERGENCE

No application-shell orientation authority existed.

- Android `MainActivity` had unspecified orientation + `configChanges` including orientation → OS sensor rotation. Samsung FD2 landscape innerWidth 832 was that hole.
- iOS `UISupportedInterfaceOrientations` included landscape on iPhone; `DibayStartupBridgeViewController` did not override.

Root cause is not “missing `screenOrientation=portrait` on MainActivity”. A global manifest portrait would lock `TABLET_ANDROID`.

## ANDROID APP AUTHORITY

`DibayDeviceClassClassifier` (FD1 SSOT)  
→ `DibayAppOrientationPolicy.applyToAppShell`  
→ `MainActivity.onCreate` once, before `super.onCreate` / WebView first frame.

`PHONE_ANDROID` → `SCREEN_ORIENTATION_PORTRAIT`  
`TABLET_ANDROID` / `UNKNOWN` → no `setRequestedOrientation`

No onResume repeat. No manifest portrait on MainActivity.

## ANDROID CALL AUTHORITIES

`NativeVideoCallActivity` still requests portrait. **KEEP. FD8.**  
`NativeVoiceCallActivity` / `IncomingCallActivity`: no orientation request. Untouched.

## IOS APP AUTHORITY

Plist iPhone: Portrait only.  
Plist iPad: Portrait + UpsideDown + LandscapeLeft + LandscapeRight.  
`DibayStartupBridgeViewController` returns the same contract via `DibayDeviceClassClassifier` + `DibayAppOrientationPolicy`.

## IOS CALL AUTHORITIES

No `supportedInterfaceOrientations` override in Call VCs. Untouched.

## PWA AUTHORITY

`app/manifest.ts` `orientation: "any"`. Native shells own orientation. Manifest is not DeviceClass.

## CSS/JS SHADOWS (not deleted)

| Consumer | Kind | Later owner |
|---|---|---|
| `use-app-viewport-size` orientationchange + 5-tier | LEGACY_SHADOW | FD4 |
| keyboard / CM room `orientationchange` | DETECTION_ONLY | existing keyboard locks |
| `GlobalPopupHost` landscape deny | POPUP presentation | FD9 |
| `owner-compact-shell.css` landscape media | VISUAL_TUNING | Owner shell |
| CallScreenShell / PiP orientation listeners | CALL_PRESENTATION | FD8 |

## Runtime

| Device | Result |
|---|---|
| Samsung SM-M156S | PHONE_ANDROID. Physical landscape + cold landscape: app stayed 384×832 portrait. PASS |
| Xiaomi 24076RP19G | TABLET_ANDROID. Portrait → landscape → portrait. PASS |
| iPhonebk | PHONE_IOS. Installed binary current 430×932 portrait. PASS. Physical rotate / dedicated cold-landscape actuation: NOT_PROVEN (no host iOS rotator) |
| iPad | STRUCTURAL_PASS. Runtime NOT_PROVEN |
| Windows | Manifest structural `any`. Runtime NOT_PROVEN |

## DO NOT

- Copy 600dp into MainActivity
- Request portrait on Tablet “because OS ignores it”
- Wait for JS DeviceClass then snap
- Touch Call Activities / Agora / CallKit
- Promote FD2 760/840/720 to Device or orientation cutoffs
- Start FD4 unless this lock is accepted

## NEXT

FD4 APP SHELL / NAVIGATION only.

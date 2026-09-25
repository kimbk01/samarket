# DIBAY Device SSOT — FD2 Window Class HARD LOCK

**Status:** HARD LOCKED · LOCAL COMMIT  
**Declared:** 2026-09-25  
**Owner accepted:** YES  
**Evidence:** `.tmp/fd2-window-class-runtime/` (`samsung.json` · `xiaomi.json` · `iphonebk.json` · `SUMMARY.json`)

FD1 DeviceClass remains READ-ONLY input. This lock does not reopen 600dp, Xiaomi identity, native plugins, or rotation identity.

## Meaning of HARD LOCK (this domain)

HARD LOCK means:

- DeviceClass and WindowClass are separate authorities
- Usable window has one measurement formula
- Phone / Tablet / Desktop layout family cannot be reclassified by width
- Keyboard may change window measurement, never Device family
- iPad / Windows fixture absence stays **NOT_PROVEN**

HARD LOCK does **not** mean:

- WindowClass band numbers 760 / 1230 / 1302 are final
- Those bands stay `CANDIDATE_NOT_LOCKED`
- HEAD is origin/Production

```text
DeviceClass ≠ WindowClass ≠ Orientation ≠ LayoutMode ≠ Pane
768 messenger split ≠ tablet identity
PHONE landscape ≠ TABLET
TABLET compact ≠ PHONE
DESKTOP narrow ≠ PHONE
```

## AUTHORITY

| Item | Value |
|---|---|
| FD1 HEAD | `15635e664cb55411a2b98a145b26e6d913c21267` |
| ORIGIN | `854dd5c920449badff151c761cf24c08a5c6f99a` |
| CURRENT WINDOW DEFECT | NONE PROVEN |

## Usable window (LOCKED)

```text
availableWidth = visualViewport.width  if present
               else window.innerWidth
usableWidth    = availableWidth - --safe-left - --safe-right
```

`--safe-*` is app-shell SSOT (`max(env, --dibay-safe-*)`). Raw `env()` is forbidden.  
`window.innerWidth` alone is not SSOT.  
`use-app-viewport-size` remains the existing resize/visualViewport listener. FD2 does not add a second subscription authority.

## WindowClass (bands CANDIDATE_NOT_LOCKED)

| Class | Candidate usable width |
|---|---|
| COMPACT | `< 760` |
| MEDIUM | `760–1229` |
| EXPANDED | `1230–1301` |
| LARGE | `>= 1302` |

These are not Device cutoffs.

## Domain floors (CANDIDATE_NOT_LOCKED, not Device)

| Domain | Floor | Source |
|---|---|---|
| Messenger | 760 | LIST_MIN 360 + ROOM_MIN 400. CSS 768 is the integer media for this floor. |
| Community | 840 | LIST_MIN 360 + DETAIL_MIN 480. `max-w-3xl` is a cap. |
| Trade | 720 | Phone-proven 2-col list 360 + phone-proven detail 360. Not copied from Community. No Trade 2-pane UI yet. |

## Layout resolver (LOCKED family)

| DeviceClass | Width | Mode |
|---|---|---|
| PHONE_* | any, including 760/768/840/1024/1366 | `PHONE_SINGLE` |
| TABLET_* | below domain floor | `TABLET_STACKED` |
| TABLET_* | at/above domain floor | `TABLET_DUAL` |
| DESKTOP_* | below domain floor | `DESKTOP_STACKED` |
| DESKTOP_* | at/above domain floor | `DESKTOP_DUAL` |
| UNKNOWN | any | `UNKNOWN_SAFE` |

`DESKTOP_TRIPLE` is reserved. FD2 never auto-selects it.  
Call modes exist as types only. Call UI is not wired.

## Runtime (recorded)

| Device | DeviceClass | Portrait usable / WindowClass | Landscape usable / WindowClass |
|---|---|---|---|
| Samsung SM-M156S | PHONE_ANDROID | 384 / COMPACT | 755 / COMPACT (inner 832 − safe 29/48) |
| Xiaomi 24076RP19G | TABLET_ANDROID | 601 / COMPACT | 1007 / MEDIUM |
| iPhonebk | PHONE_IOS | 430 / COMPACT | NOT_MEASURED |
| iPad | NOT_PROVEN | — | — |
| Windows | NOT_PROVEN | unit only | unit only |

Xiaomi WindowClass changing portrait→landscape is expected. DeviceClass stayed TABLET_ANDROID.

## DO NOT

- Reopen FD1 DeviceClass
- Use 760/768/840/1024 as Device identity
- Wire Community / Trade / Messenger / Call UI from this resolver yet
- Auto-enable 3-pane
- Treat keyboard visualViewport shrink as Device change
- Start FD3 until this lock is accepted

## NEXT

FD3 ORIENTATION ENFORCEMENT only.

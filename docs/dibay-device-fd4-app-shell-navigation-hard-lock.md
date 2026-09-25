# DIBAY Device SSOT — FD4 App Shell / Navigation HARD LOCK

**Status:** IMPLEMENTATION COMPLETE · NOT LOCKED  
**Declared:** 2026-09-25  
**Evidence:** `.tmp/fd4-shell-runtime/` (`samsung.json` · `xiaomi.json` · `iphonebk.json` · `SUMMARY.json`)

iPhonebk Web Inspector was unreachable this session (device on localNetwork, no USB inspector page).  
Samsung + Xiaomi runtime PASS. Do not start FD5 until iPhonebk DOM read exists.

FD1 DeviceClass, FD2 Window/LayoutMode, and FD3 orientation remain READ-ONLY.  
FD2 WindowClass band numbers and domain floors stay `CANDIDATE_NOT_LOCKED`.

## Meaning of HARD LOCK (this domain)

HARD LOCK means:

- App Shell identity is FD1 DeviceClass
- App Shell presentation mode is FD2 LayoutMode
- Navigation selection consumes `resolveAppShell` only
- Width / touch / UA / orientation cannot change Phone / Tablet / Desktop identity
- Existing main BottomNav is reused for every family — no new Tablet rail, no restored Desktop side nav
- Domain dual-pane is not activated (FD5/FD6/FD7)

HARD LOCK does **not** mean:

- iPad / Windows real-device runtime PASS
- iPhone physical rotate PASS (FD3 NOT_PROVEN preserved)
- HEAD is origin/Production

```text
DeviceClass ≠ WindowClass ≠ Orientation ≠ LayoutMode ≠ Pane
PHONE + wide width ≠ TABLET
TABLET + compact width ≠ PHONE
DESKTOP + 500px ≠ PHONE
UNKNOWN ≠ Phone guess
```

## AUTHORITY

| Item | Value |
|---|---|
| HEAD BEFORE | `c399af0c43d4a8ad446ef2f310af4c749fa99036` |
| ORIGIN / PRODUCTION | `854dd5c920449badff151c761cf24c08a5c6f99a` |
| CURRENT SHELL DEFECT | NONE PROVEN |

## FIRST DIVERGENCE

`ConditionalAppShell` never consulted DeviceClass. It mounted BottomNav from route eligibility only.

The 5-tier `use-app-viewport-size` hook stood beside it as a width+touch+orientation Device impersonator. Identity exports were unused; measurement was used by Write.

Root cause is not “a 768 breakpoint exists”. Root cause is: no shell resolver, so every device was an implicit Phone-nav mount without identity authority.

## CANONICAL SHELL CONTRACT

```text
DeviceClass
  → shellFamily  PHONE | TABLET | DESKTOP | UNKNOWN
LayoutMode
  → presentation mode only (stacked/dual recorded, not wired)
Navigation
  → EXISTING_MAIN_BOTTOM_NAV for every family
UNKNOWN
  → UNKNOWN_SAFE, existing BottomNav, no family inference
```

SSR / first React render starts UNKNOWN_SAFE. It does not default to Phone.  
Resolve updates data attributes only. BottomNav is not remounted by DeviceClass.

## DO NOT

- `if width < 768 then phone`
- `if width >= 768 then tablet`
- touch / landscape / UA shell selection
- new permanent Tablet rail
- restore MainDesktopSideNav as Device identity
- remount page tree on DeviceClass / orientation / resize
- setTimeout shell correction
- migrate Messenger 768, Community 767, Trade grid, Call, Owner 1024
- reopen FD1 600dp, FD2 floors, FD3 native orientation

## NEXT

FD5 COMMUNITY only.

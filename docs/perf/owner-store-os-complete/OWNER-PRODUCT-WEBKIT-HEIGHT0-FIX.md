# Owner Product shell — WebKit height:0 verified fix

## Verified cause (CURRENT measurement)

Production `4d95ca8ac` (ad7942 geometry) measured 2026-09-06:

| Engine | composer height | scroll clientHeight | form scrollHeight |
|---|---|---|---|
| **WebKit** (iPhone 390 / Mac 1440) | **0px** | **0** | ~1300 |
| Chromium (same viewport) | ~776px | ~649 | ~1304 |

Artifact: `docs/perf/owner-store-os-complete/selective-shell-restore-proof/IOS-SAFARI-HEIGHT-VERIFY.json`

Root chain (shared, not iOS-only fork):

1. Product composer nested `h-[calc(100dvh-…)]` under dual shell `100dvh` → WebKit used height **0** (max-height still valid)
2. Follow-up measure: CSS `height:100dvh` on `.owner-stack-shell` also collapsed to **0** in WebKit when the node also had Tailwind `flex-1 min-h-0` (`flex: 1 1 0%`)

## Fix (APK / iOS / Windows 동일 SSOT)

1. Product CREATE/EDIT joins Owner stack **single scroll host** (`.owner-compact-shell__scroll`)
2. `OwnerProductForm` = **document-flow** under `OwnerAdminPageScrollShell` (no nested `100dvh` / flex-1 overflow scroll owner)
3. Product CREATE/EDIT **hides BottomNav** (Register/Save CTA clearance)
4. Shell: **ONE** `.owner-stack-shell` CSS root — `flex: none` + `min/max/height: 100dvh|100svh` (no JIT `${bp}:h-[100dvh]`, no nested height root)
5. `--owner-bottom-nav-footprint` includes delivery overhang — content-bottom and FAB share the same footprint (APK bottom-nav overlap)

## Local re-verify after fix (`LOCAL-FLEXNONE-REVERIFY.json`)

| Engine | stackH | shellCh | nameVisible | submit after scroll | BottomNav |
|---|---|---|---|---|---|
| WebKit iPhone 390 | 844 | 787 | true | true | false |
| Chromium iPhone 390 | 844 | 787 | true | true | false |

## Status

**FAIL / NOT CLOSED** until human confirms Product New on iOS Safari + Cap APK + Windows web after Production deploy.

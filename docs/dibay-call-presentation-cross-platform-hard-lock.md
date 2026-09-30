# DIBAY Call Presentation — Cross-Platform HARD LOCK

**ACTIVE.** Agent rule: `.cursor/rules/dibay-call-presentation-cross-platform-hard-lock.mdc`  
Final close: `.tmp/call-presentation-cross-platform-final-close/DIBAY_CALL_PRESENTATION_CROSS_PLATFORM_FINAL_HARD_LOCK.md`

## AUTHORITY

PRODUCTION SHA `d4e5ce5bf5f4556edeb57024a9edf236dcc525b1` · Deployment `dpl_Gg5pY33V8vfbtgXAGWc1biL46K8k`

| Layer | Status | Evidence level |
|---|---|---|
| ANDROID | HARD LOCKED | Device/runtime measured |
| IOS | HARD LOCKED — OWNER ACCEPTED | Static + tooling + Owner-observed presentation |
| CROSS-PLATFORM | **HARD LOCKED** | Union of above — levels **not** identical |

## Preserved (do not reopen)

Android Page Nav · CD-1 · CD-2 · SR-1 · Call Functional A/B/C/D · Android Call Presentation · iOS Call Presentation (Owner-accepted)

## DO NOT

- Re-run presentation matrices without Production regression or locked-consumer change
- Pull Call Functional into presentation scope via log gaps
- Claim identical evidence depth for Android vs iOS
- Build new WDA/Appium/test-only native hooks for “finish” presentation

## Reopen only if

Production presentation regression · locked presentation consumer change · Cap/Web presentation authority change · Owner explicit reopen.

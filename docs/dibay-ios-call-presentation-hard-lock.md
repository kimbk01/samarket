# DIBAY iOS Call Presentation — HARD LOCK

**ACTIVE.** Agent rule: `.cursor/rules/dibay-ios-call-presentation-hard-lock.mdc`  
Close evidence: `.tmp/call-presentation-cross-platform-final-close/DIBAY_CALL_PRESENTATION_CROSS_PLATFORM_FINAL_HARD_LOCK.md`  
Prior static/tooling: `.tmp/call-presentation-ios-final-close/` · Owner assist: `.tmp/call-presentation-ios-owner-assist/`

## AUTHORITY (baseline)

| Field | Value |
|---|---|
| PRODUCTION SHA | `d4e5ce5bf5f4556edeb57024a9edf236dcc525b1` |
| DEPLOYMENT | `dpl_Gg5pY33V8vfbtgXAGWc1biL46K8k` |
| DEVICE | iPhonebk · iPhone 14 Pro Max · `00008120-000025C826F3C01E` |

**IOS CALL PRESENTATION = HARD LOCKED — OWNER ACCEPTED**  
**CONFIRMED PRESENTATION DEFECT = NONE** · **UNEXPLAINED PRESENTATION COLLISION = NONE**

## Evidence provenance (honest)

| Source | Role |
|---|---|
| Static ownership audit | iOS adapter / Cap nativeOwned / dock fallback / I6 no enter writer |
| Existing tooling audit | devisectl / idevicesyslog / webkit proxy limits documented |
| Owner-visible I1 | Single call presentation; no Web/Native dual collision observed |
| Call Functional HARD LOCK | Preserved — connecting/active **not** re-proven in this presentation close |

**Not claimed:** full automated Cap place matrix · I2–I5 device-measured PASS · new CallKit/PushKit/RTC/media PASS.

## What is locked (presentation only)

- ONE call moment → ONE primary presentation owner on iOS Cap product path (Owner-accepted)
- I1 outgoing presentation: no dual Web/Native primary collision (Owner-observed)
- I6 iOS Native PiP: **NOT_APPLICABLE_CURRENT_PRODUCT** (no product enter writer; background = dock fallback)
- Call Functional A/B/C/D: **not reopened** by this lock

## Explicitly NOT claimed

| Item | Status |
|---|---|
| Connecting/active functional re-proof in Owner-assist run | NOT RE-PROVEN — **not required** for this presentation close |
| I2–I5 full Owner matrix re-run | Closed by Owner directive — do not re-demand |
| Android presentation | Separate HARD LOCK (device/runtime measured) |
| Media quality / RTC | Functional — out of scope |

## DO NOT

- Reopen Call Functional HARD LOCK for presentation cosmetic / log-gap reasons
- Demand Owner re-call / syslog loops to “finish” connecting/active under presentation scope
- Forge automated FULL runtime evidence language for iOS
- Equate iOS Owner-accepted evidence with Android device-measured evidence
- Invent iOS Native PiP entry path
- Patch without first-divergence presentation root owner + Owner gate if Native

## Reopen only if

A. Production iOS presentation collision regression, or  
B. Locked presentation consumer change, or  
C. Product changes Cap nativeOwned vs Web routing / PiP product path, or  
D. Owner explicit reopen.

Otherwise: **PRESERVE HARD LOCK.**

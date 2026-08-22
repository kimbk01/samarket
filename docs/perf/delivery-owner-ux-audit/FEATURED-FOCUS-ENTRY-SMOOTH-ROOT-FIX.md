# FEATURED FOCUS — LEGACY-GRADE SMOOTH ENTRY

Generated: 2026-08-22  
Local origin: `http://127.0.0.1:3000` (fix under test)  
Evidence: `featured-focus-entry-local-viewport-gate-latest.json`

## Final report

```
ENTRY CONTRACT BEFORE: WRONG STORE FRAME → SCROLL → SCROLL → FINAL
ENTRY CONTRACT AFTER:  TRANSITION/PREPARING (when needed) → FINAL CORRECT STORE FRAME

TRANSITION TYPE: StoreDeliveryBufferingSpinner overlay (existing primitive)
TRANSITION OWNER: StoreDetailPublic focusEntryPreparing + StoreDetailMenusSection land

TAP→TRANSITION: armStoreMenuFocusEntryIntent on featured tap (immediate preparing intent)
TRANSITION→STORE: reveal only after single land + align (or fast-ready skip)

WRONG INTERMEDIATE FRAME: NO (local viewport 5/5; cat-visible wrong top suppressed)
DOUBLE LANDING: NO
VISIBLE SCROLL CORRECTION: NO

FIRST STORE CATEGORY: KIMBAP
FIRST STORE PRODUCT: focused KIMBAP row in view
FIRST FOCUS DELTA: phone ≈ -4 / tablet ≈ -5 (≤ tolerance 8)
FINAL FOCUS DELTA: same

AUTO SCROLL COUNT: 0 (scrollIntoView + sync nudge; no effect-driven 2nd correction)
SECOND CORRECTION: NONE

FOCUS SPACER BEFORE: retained full dvh spacer during prepare (hidden under overlay when shown)
FOCUS SPACER AFTER: retain after URL strip (layout clamp guard); not first-visible overflow

STICKY BOTTOM MAX (visible): ≤130 on settle samples
VIEWPORT HEIGHT: phone 832 / tablet 601
OVERFLOW: NO on first usable store frame

URL STRIP POSITION CHANGE: 0 (pin retained after strip)

PHONE 5/5: PASS (Playwright viewport = RFCY40PY2CA size)
TABLET 5/5: PASS (Playwright viewport = 8b37179f7d94 size)
ANDROID APK: NOT_PROVEN
  reason: installed APK WebView is locked to Production origin;
  local code cannot load without cap rebuild (not authorized this turn)

BAEMIN/LEGACY OBSERVATION: NOT_OBSERVED
LEGACY IMPLEMENTATION ASSUMPTION USED: NO

ROOT FIX:
- focus entry PREPARING/READY authority
- single land (scrollIntoView + sync nudge); no didCorrect second effect scroll
- sticky land uses header+tabs; align rejects in-flow bottoms
- retain focus pin after URL strip
- arm preparing intent on featured tap

FILES CHANGED:
- lib/dibay/store-menu-focus-entry.ts
- lib/dibay/store-menu-focus-entry-intent.ts
- lib/dibay/store-menu-product-focus.ts
- lib/ui/store-detail-scroll-root.ts
- components/stores/store-detail/StoreDetailMenusSection.tsx
- components/stores/StoreDetailPublic.tsx
- components/stores/home/StoreDeliveryRowCard.tsx
- lib/dibay/__tests__/store-menu-focus-entry.test.ts
- lib/dibay/__tests__/store-menu-product-focus.test.ts
- scripts/qa/delivery-featured-focus-entry-local-viewport-gate.mjs
- scripts/qa/delivery-featured-focus-entry-gate.mjs

REGRESSION: unit focus helpers PASS; cold-entry/owner locks untouched

GATE: PARTIAL
  LOCAL_VIEWPORT PHONE+TABLET: PASS
  ANDROID_APK: NOT_PROVEN (needs APK rebuild against this build or Production deploy)
```

## LOCK

`FEATURED FOCUS FIRST-FRAME LANDING: REOPEN` remains until **ANDROID APK** proves same contract.
Local viewport 5/5 is evidence for the code path, not APK PASS substitute.

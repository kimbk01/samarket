# FEATURED FOCUS FIRST-FRAME LANDING — AUDIT

Generated: 2026-08-22  
Origin: Production `https://samarket.vercel.app`  
Surface: Android APK WebView `com.dibay.app` only  
Evidence: `featured-first-frame-landing-audit-latest.json`  
Script: `scripts/qa/delivery-featured-first-frame-landing-audit.mjs`

## Verdict form

```
FEATURED FIRST FRAME: FAIL
WRONG INTERMEDIATE FRAME: YES
DOUBLE LANDING: YES
AUTOMATIC SCROLL COUNT: phone=2 / tablet=2
FIRST FRAME SCROLLTOP: phone=0 / tablet=0
FINAL SCROLLTOP: phone=3237 / tablet=3299
FIRST FOCUS DELTA: phone=2854 / tablet=2923   (first store frame with menu rows)
FINAL FOCUS DELTA: phone=1 / tablet=0
VIEWPORT OVERFLOW: YES
OVERFLOW SOURCE: focus_spacer_height (phone spacer≈691px; tablet≈468–473px)
                 + stickyBottom > viewport on tablet (stickyBottom=754, vh=601)
FIRST WRONG FRAME SOURCE: store_detail_top_paint_before_focus_scroll
SECOND CORRECTION OWNER: Element.scrollTo #2 (focus landing correct path; tops 3473→3237 / 3548→3299)
PHONE: FAIL
TABLET: FAIL
ANDROID APK: FAIL
ROOT CAUSE: PROVEN
CODE FIX REQUIRED: YES
CODE FIX STARTED: NO
```

## Proven sequence (not settle-only)

### Phone `RFCY40PY2CA` (vw 384×832)

| t (ms) | scrollTop | delta | note |
|--------|-----------|-------|------|
| 823 | 0 | 2854 | store paint; focus row top=3616; category still Bungeoppang; spacer=691 |
| 987 | →3473 | — | automatic `Element.scrollTo` #1 |
| 1002 | 3473 | 49 | still misaligned (>8) |
| 1171 | →3237 | — | automatic `Element.scrollTo` #2 |
| 1509 | 3237 | 1 | correct slot; URL already stripped |
| 2011 | 3237 | 1 | final |

### Tablet `8b37179f7d94` (vw 1006×601)

| t (ms) | scrollTop | delta | note |
|--------|-----------|-------|------|
| 764–1031 | 0 | 2923 | store top paint; focus offscreen; spacer≈470; stickyBottom=754 > vh |
| 1104 | →3548 | — | scroll #1 |
| 1724 | →3299 | — | scroll #2 |
| 1581–2013 | ~3299 | -3→0 | final correct |

## Contract failure

`FIRST USABLE FRAME ≠ FINAL FRAME`

- First usable store/menu frame shows **wrong store top** (scrollTop 0, focus offscreen).
- Later automatic scrolls correct to sticky-aligned menu.
- Final `focusDelta≈0` is **not** PASS under first-frame contract.

## Root cause (measured)

1. **URL focus 처리 전 일반 store-detail first paint** — store mounts at scrollTop 0 with focus product still far below (`delta≈2850–2920`).
2. **focus landing scroll owner runs after paint** — two programmatic `Element.scrollTo` (~1.0s / ~1.2–1.7s): first overshoot, second correction (`StoreDetailMenusSection` land + didCorrect path).
3. **focus spacer** present during wrong frame (`data-store-menu-focus-scroll-spacer` height phone≈691 / tablet≈470) — contributes to viewport-taller scroll surface.
4. **Tablet sticky geometry**: measured `stickyBottom=754` while `innerHeight=601` during wrong frame — chrome/tabs stack exceeds viewport before pin settle.

## Explicit non-claims

- Did not treat final settle delta as PASS.
- Did not change product code.
- Did not use Chrome screencap as APK substitute.
- iOS: still NOT_PROVEN (separate gate).

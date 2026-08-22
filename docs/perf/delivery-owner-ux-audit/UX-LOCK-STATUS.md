# Delivery / Owner UX LOCK (2026-08-22)

| Field | Status |
|--------|--------|
| STORES COLD ENTRY P0 | **CLOSED** |
| FEATURED FOCUS LANDING (settle delta) | **SUPERSEDED** |
| FEATURED FOCUS FIRST-FRAME LANDING | **REOPEN** — local viewport 5/5 PASS; **ANDROID APK NOT_PROVEN** |
| OWNER CHILD→CHILD RTL | **PASS** |
| OWNER CHILD→HUB LTR-BACK | **NOT_PROVEN** |
| OWNER HUB BOUNDARY REMOUNT | **OBSERVED** |
| OWNER HUB BOUNDARY FIX | **NOT AUTHORIZED / NOT STARTED** |
| ANDROID RTL DOM | **PASS** (APK WebView CDP) |
| IOS | **NOT_PROVEN** |

## Featured smooth entry (this turn)

- Code: PREPARING overlay + single land (`scrollIntoView` + sync nudge) + retain pin after strip
- Local Playwright phone/tablet viewports (device-matched): **5/5 PASS**
- Evidence: `featured-focus-entry-local-viewport-gate-latest.json`
- Report: `FEATURED-FOCUS-ENTRY-SMOOTH-ROOT-FIX.md`
- **GATE for close: ANDROID APK still required** (APK serves Production until rebuild/deploy)

## Rules

- Do not close featured first-frame on settle delta alone.
- Do not treat Chrome/Playwright viewport as APK PASS.
- Owner hub remount fix still NOT AUTHORIZED.

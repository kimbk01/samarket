# DIBAY INTRO — 13TH FINAL CORRECTION / 14TH GO-NO-GO

**ACTIVE.** 13TH FINAL PASS = REVOKED · 13TH PRODUCT = FAIL · 14TH FULL REBUILD = NOT YET AUTHORIZED

## Owner product (SSOT)

```
ICON → 최소 OS START → SCENE 1 → SCENE 2… → HOME
EDIT → SAVE → PREVIEW → APPLY → APP
```

Owner must never need to understand Release / Package / Live pointer.

## Proven failures (do not shrink)

| Layer | Result |
|---|---|
| Scene delete → Save | PASS (sceneCount 1) |
| Hard reload Draft | PASS (sceneCount 1) |
| Publish/Apply contract | FAIL — Apply could select OLD release |
| Device delivery | FAIL — `verified_local_fast` skipped Live refresh |
| ADMIN → APP | FAIL |

FIRST DIVERGENCE: Draft=NEW · Published=OLD · Apply=OLD Live · Device=stale local.

## Preserve (evidence-backed)

canonical document · immutable release/package · native Android/iOS renderer · normalized geometry · scene timeline · CUT/FADE/SLIDE · element motion · package integrity · atomic local commit

## Correction axes (must close)

1. **OS System Start** — platform primitive only; artificial hold = 0; NOT Scene0; Admin config is build-bound (installed vs next build); no forced Scene1 match
2. **Admin CMS UX/SSOT** — primary actions = Save / Preview / Service Apply; Publish history = advanced only
3. **Admin → Live → Device** — Service Apply is atomic (draft→release→package→live); device always refreshes Live when online; no store clear / reinstall for Product Intro

## Atomic Service Apply

`POST /api/admin/intro/documents/:id/apply-service`  
→ `applyIntroServiceFromDraft`  
→ publish current saved draft + setLive with `expectedSourceDraftVersion`

Silent old-release Apply = FORBIDDEN.

## Device freshness

Online cold start: always fetch `/api/intro/device/live`, then match or download+atomic commit.  
Offline: may use `OFFLINE_VERIFIED_MATCH` only when pointer matches verified local.  
`verified_local_fast` skip of Live check = FORBIDDEN.

## GO / NO-GO

After correction + Owner UI tests A–G (no code fixtures):

- **KEEP 13TH** only if EDIT→SAVE→PREVIEW→APPLY→APP is clean end-to-end without special-case patches / clear / reinstall
- Else **13TH REJECT → 14TH ZERO REBUILD**

“Could patch” ≠ GO. Structural simplicity = GO.

## Final acceptance

Owner Admin action → Owner-visible actual app result.  
API/DB/Release/Pack/Live/log PASS alone ≠ FINAL PASS.

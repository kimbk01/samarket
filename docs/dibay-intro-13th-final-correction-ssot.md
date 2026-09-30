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

1. **OS System Start** — platform primitive only; NOT Scene0; Admin config is build-bound (desired next build vs last materialized snapshot); no forced Scene1 match. Durable Admin presets = `SYSTEM_START_MIN_VISIBLE_PRESETS_MS` (500–5000ms). Native materializer key = `SYSTEM_START_MIN_VISIBLE_MS` (App/Cap continuation only; OS splash duration ≠ this). Handoff = max(Intro first meaningful frame ready, configured minimum). Hidden artificial hold beyond that = FORBIDDEN. Brand media select·upload·replace·delete + size presets S/M/L only; free x/y · arbitrary fit · full-bleed BG image · minVisibleMs=0 · free fit = FORBIDDEN.
   - **ONE CORRECTION BATCH:** Production Admin Save = durable `app_system_start_config` only — MUST NOT write `/var/task/native` or materialize Android/iOS resources. Build materializer = `scripts/generate-system-start-build-input.mjs` → immutable build snapshot → Android + iOS packaged assets. `logoIntegrity` = durable Media SSOT (not Vercel FS). iOS Cap SplashScreen `launchShowDuration` = mount sentinel (≠0); hide via real `SplashScreen.hide` after minVisible ∧ Intro first frame. New overlay / fake splash / white-cover = FORBIDDEN.
2. **Admin CMS UX/SSOT** — primary actions = Save / Preview / Service Apply via AdminActionButton hierarchy; Publish history = advanced only (⋯). Operator list hides QA titles by default. Canonical document field = `title` (boundary may accept legacy `name`). Motion types = `MOTION_TYPES_V1` registry only (`SLIDE_LEFT` as element motion = FAIL-CLOSED; no silent reinterpret).
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

# DIBAY INTRO / SYSTEM START
# REBUILD 14 — PRECHECK-B SECURITY CLOSE + R14-P7 NATIVE LIFECYCLE INTEGRATION REPORT

**STOP for Owner audit after actual P7 execution. No push. No deploy.**

---

# PART A — SECURITY CLOSE

## 1. ROOT CAUSE

`setLiveRelease` upserted `app_intro_live` after only `publish_state === "COMMITTED"` (+ optional draft stale gate). It did not join `app_intro_documents.content_class`. Service-role QA callers could therefore replace the Production Owner Live pointer.

## 2. AUTHORITATIVE CONTENT CLASS SOURCE

| Layer | Authority |
|---|---|
| Document | `app_intro_documents.content_class` (`OWNER` \| `QA` \| `SYSTEM`) |
| Release/revision | No content_class column — join via `document_id` |
| Live eligibility | `revision → document.content_class === OWNER` + `COMMITTED` + pack |
| Caller spoof | `args.contentClass` ignored |

`COMMITTED` means immutable published release, not Owner Live eligibility. QA may still mint COMMITTED releases via `publishIntroDocument`; `setLiveRelease` rejects them from Owner Live.

## 3. setLiveRelease BEFORE/AFTER

| | BEFORE | AFTER |
|---|---|---|
| Gate | COMMITTED + pack (+ optional draft) | + document join + `evaluateOwnerLiveContentClass` fail-closed |
| Error | `release_not_committed` | + `release_not_found` + `owner_live_forbidden_content_class:<CLASS>` (403) |
| Service-role | Bypass domain gate | Domain gate still applies |

Primitive: `lib/intro/live/service.ts` + `lib/intro/live/owner-live-eligibility.ts`

## 4. QA CALLERS

| Caller | Class | Action |
|---|---|---|
| `scripts/qa/intro-13th-v1-prove-live.ts` | OBSOLETE_13TH_QA | LIVE_MUTATION_RETIRED (publish only) |
| `scripts/qa/intro-13th-forensic-publish-apply-1scene.test.ts` | OBSOLETE_13TH_QA | LIVE_MUTATION_RETIRED |
| `scripts/qa/intro-13th-owner-grand-opening.test.ts` | OBSOLETE_13TH_QA | LIVE_MUTATION_RETIRED |
| `lib/intro/live/apply-service.ts` | PRODUCT | Sole product path → `setLiveRelease` after OWNER Apply gate |
| `app/api/admin/intro/live/set/route.ts` | PRODUCT | Retired (`live_set_retired`) — no `setLiveRelease` |

## 5. DB/RPC WRITER AUDIT

| Writer | Class |
|---|---|
| `setLiveRelease` upsert | SOLE TS mutation writer (guarded) |
| Migration seed INSERT NEVER_CONFIGURED | MIGRATION inert |
| Direct SQL RPC/trigger for Live upsert | NONE found |
| RLS | service_role GRANT ALL — domain gate remains in TS primitive |

Architecture: TypeScript canonical primitive is the sole service-role mutation authority for Owner Live. No DB trigger added (no alternate executable writer remains).

## 6. TESTS

B-01…B-13 in `lib/intro/live/__tests__/owner-live-eligibility-set-live.test.ts` — **14/14 PASS** (CURRENT).

## 7. FULL P1–P6 REGRESSION (CURRENT)

| Suite | Count | Result |
|---|---|---|
| P1–P6 | **237** | **PASS** (CURRENT this turn) |
| PRECHECK-B | 14 | PASS |
| P7 | 10 | PASS |
| **TOTAL** | **261** | **PASS** |

## 8. SECURITY COMMIT

`d35c501987775cde416c099d52ad8ba559255f88` — `fix(intro): fail-closed Owner Live eligibility at setLiveRelease`

## 9. PRECHECK A

**PASS** (envelope canonical; pack.json LEGACY_COMPAT — unchanged).

## 10. PRECHECK B

**PASS**

Question: Can any QA/TEST/FIXTURE path establish or replace Owner Live?

**NO.**

Evidence: canonical primitive gate · retired QA callers · sole upsert writer · service-role not exempt · B-01…B-13 PASS.

---

# PART B — P7

## 11. P7 FILES CHANGED

- `android/.../DibayStartupCompositorHost.java`
- `android/.../DibayStartupCompositorSession.java` (new)
- `android/.../DibayStartupEnvelopeVerifiedStore.java` (new)
- `android/.../MainActivity.java`
- `ios/App/App/DibayStartupCompositorHost.swift`
- `ios/App/App/DibayRootBridgeViewController.swift`
- `ios/App/App.xcodeproj/project.pbxproj` (remove deleted Bridge/surfaces; add RootBridge)
- `lib/startup-compositor/runtime/activation.ts` → P7 active
- P2–P6 tests updated for wired hosts
- `lib/startup-compositor/__tests__/r14-p7-native-lifecycle.test.ts` (new)

## 12. PRESENTATION OWNER

ONE `DibayStartupCompositorHost` per platform. No Bridge resurrection. No second VC/Dialog.

## 13–15. ANDROID LIFECYCLE / SPLASH / FAILURE

- `onCreate` → `startStartupCompositorSession`
- Splash keep: hold until first product frame **or** skip → web dismiss
- Skip `no_owner_envelope` → existing splash→Home path
- `onResume`/`onStop` → foreground/background
- HOME_PRESENTATION_READY → session → one HANDOFF yield

## 16–17. IOS LIFECYCLE / FIRST FRAME

- `DibayRootBridgeViewController` attaches host + WK `DibayBootBridge`
- LaunchScreen → compositor first frame or skip
- BUILD SUCCEEDED (`CODE_SIGNING_ALLOWED=NO`)

## 18–20. ENVELOPE / STORE / GENERATION

- Canonical read: `startup-envelope.json` + meta integrity + OWNER class
- Verified store: `dibay-startup-envelope/verified/`
- Bootstrap / non-OWNER rejected
- Live sync requires `packageAuthority === StartupPackageEnvelope` + `envelopeRetrievalUrl`

## 21–28. SS / INTRO / HOME / CTA / BG

Implemented in session/host: SS paint (color + brand still), minVisible, Intro scene timeline (IMAGE/LOGO/TEXT still), last-frame hold until HOME_READY, one HANDOFF. CTA INTERNAL registry semantics retained in shared TS; native CTA tap wiring OPEN. BG/FG no second surface.

## 29–31. GIF / MP4 / AUDIO

**OPEN / NOT_PROVEN** — not claimed. Still decode may show GIF first frame opportunistically; not playback proof. MP4 audio OPEN.

## 32. ANDROID BUILD

**PASS** — `app-debug.apk` built; installed on Samsung + Xiaomi.

## 33. IOS BUILD

**PASS** — xcodebuild Debug iphoneos **BUILD SUCCEEDED** after pbxproj stale-file cleanup. Device install/sign **NOT_PROVEN** this turn (no signed install to iPhonebk).

## 34. P7 TESTS

10/10 PASS (CURRENT) within 261 total.

## 35. STATIC OLD-AUTHORITY AUDIT

No `DibayStartupBridgeViewController` / `DibayIntroSceneSurface` / `DibaySystemStartSurface` / cream fallback in P7 owners. pbxproj references removed.

## 36. SAMSUNG EVIDENCE (RFCY40PY2CA)

| Item | Result |
|---|---|
| INSTALL | PASS |
| STATE LOG | `compositor_skipped reason=no_owner_envelope` · `envelope_absent_on_live authority=` · intro delivery `DOWNLOADED_COMMITTED` |
| FRAME | Community Home (`.tmp/.../RFCY40PY2CA.png`) |
| Owner-visible SS/Intro pixels | **NO** — fail-closed skip (no OWNER envelope on Production Live) |

Logs ≠ pixels. Frame = Home, not compositor product paint.

## 37. XIAOMI EVIDENCE (8b37179f7d94)

| Item | Result |
|---|---|
| INSTALL | PASS |
| STATE LOG | `compositor_skipped reason=no_owner_envelope` · `VERIFIED_MATCH` pack side-path |
| FRAME | Community Home |
| Owner-visible SS/Intro pixels | **NO** — same fail-closed |

## 38. IPHONE EVIDENCE

BUILD PASS · device install/runtime **NOT_PROVEN**.

## 39. OPEN REQUIREMENTS

Preserved OPEN: GIF Admin authoring · MP4 Admin authoring · GIF native playback · MP4 native playback · MP4 audio · Pause/Resume · schedule/frequency · device targeting · deep drag.

## 40. COMMITS

1. Security: `d35c501987775cde416c099d52ad8ba559255f88`
2. P7: (this commit — recorded after commit)

## 41. PUSH

**NO**

## 42. DEPLOY

**NO**

## 43. PRODUCTION ACTIVATION

Compositor path **wired** and **active flag true**, but Production Live currently lacks `StartupPackageEnvelope` authority URL → devices **skip** to Home. Not a false visual PASS of Intro/SS.

## 44. P7 FINAL GRADE

**STRUCTURAL / BUILD / WIRED RUNTIME FAIL-CLOSED PASS**  
**NOT** Owner visual SS/Intro PASS · **NOT** Production envelope activation PASS · **NOT** Hard Lock.

## 45. FIRST DIVERGENCE

Production device Live response has empty `packageAuthority` / missing `envelopeRetrievalUrl` while pack delivery still works → compositor correctly skips. Closing this requires Owner Apply that persists StartupPackageEnvelope (already P6 Apply path) on the Live generation devices fetch — **not** a second Live writer.

## 46. NEXT

Owner audit. Optional: confirm Production Live returns `packageAuthority: StartupPackageEnvelope` after Apply; then re-run cold start for Owner-visible SS/Intro frames. No push/deploy from this agent turn.

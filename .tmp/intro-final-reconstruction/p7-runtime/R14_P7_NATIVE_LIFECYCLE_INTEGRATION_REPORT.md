# DIBAY INTRO / SYSTEM START
# REBUILD 14 — R14-P7 NATIVE LIFECYCLE INTEGRATION REPORT

**STOP for Owner audit. P7 NOT EXECUTED. No push. No deploy. No commit.**

---

## 1. AUTHORITY

| Item | Value |
|---|---|
| HEAD | `2404ea29f74c4d2773ce385afdd9f6b07bd8c8a8` |
| ORIGIN | `fb1e7bd28665208bf7c87a1e6c27e5b04042aec0` |
| AHEAD / BEHIND | **6 / 2** (recorded; untouched) |
| P6 final | `2404ea29f` |
| Native compositor hosts | EXIST · `PRODUCTION_PRESENTATION_ACTIVE = false` · UNWIRED |
| Production compositor | FALSE |

Git safety observed: no push / pull / merge / rebase / reset / rewrite.

---

## 2. PRECHECK A — PACKAGE READ AUTHORITY

**PASS**

| Claim | Evidence |
|---|---|
| CANONICAL path | `startupEnvelopeStoragePath` → `authority/v1/packs/{packageId}/startup-envelope.json` (`lib/intro/live/apply-intent.ts`) |
| Apply stores envelope | `persistStartupEnvelope` / `applyIntroServiceFromDraft` |
| Shared runtime contract | `StartupPackageEnvelope` via `lib/startup-compositor/envelope.ts` + engine |
| LEGACY_COMPAT | `pack.json` labeled `legacyIntroPackClassification: "LEGACY_COMPAT"` in `getLiveStatus` |
| Device Live | returns `packageAuthority` + `envelopeRetrievalUrl`; pack URL is transitional / asset seal |
| Cold presentation path | `MainActivity` / `DibayRootBridgeViewController` do **not** call Intro VerifiedStore / pack.json (ZERO baseline unwired) |

pack.json remaining roles (non-competing while unwired):

- Sealed asset layout / mediaManifest hydrate in Apply
- Orphaned DATA_ONLY stores: `DibayIntroVerifiedStore` (Android/iOS) still file-name pack.json — **not** attached to cold presentation owner

**Not claimed:** native already consumes envelope at cold launch (that is P7 wiring). Claim proven: pack.json is not an alternative **active** runtime selection authority on the current presentation path; canonical selection authority is StartupPackageEnvelope.

---

## 3. PRECHECK B — QA LIVE BOUNDARY

**FAIL**

| Question | Answer |
|---|---|
| Is it called “QA_ONLY”? | Yes (P6 residual label) — **not sufficient** |
| Can QA path mutate Owner Live? | **YES** |

Exact enforcement gap:

1. `setLiveRelease` (`lib/intro/live/service.ts`) upserts `app_intro_live` after checking only `publish_state === "COMMITTED"` (+ optional draftVersion stale gate).
2. **No** `content_class` / `canBecomeActiveProductGeneration` / OWNER check inside `setLiveRelease`.
3. `publishIntroDocument` has **no** content_class gate (QA can mint COMMITTED releases).
4. Direct callers still import and invoke `setLiveRelease`:
   - `scripts/qa/intro-13th-v1-prove-live.ts`
   - `scripts/qa/intro-13th-forensic-publish-apply-1scene.test.ts`
   - `scripts/qa/intro-13th-owner-grand-opening.test.ts`
5. Product Apply (`applyIntroServiceFromDraft`) gates OWNER **before** calling `setLiveRelease`, but the Live-mutation primitive itself remains callable with service-role QA and can replace the Owner Live pointer.

Contrast (does **not** protect Production device Live):

- R14 process `promoteStagingIfValid` / `canBecomeActiveProductGeneration` block QA for in-memory generation-authority.
- Device Live API still reads `app_intro_live` via `getLiveStatus` ← mutated by `setLiveRelease`.

Filename/qa path ≠ security boundary. Server/data boundary does **not** prevent QA from establishing/replacing Owner Live.

---

## 4. GIT

| Field | Value |
|---|---|
| HEAD | `2404ea29f74c4d2773ce385afdd9f6b07bd8c8a8` |
| ORIGIN | `fb1e7bd28665208bf7c87a1e6c27e5b04042aec0` |
| ahead / behind | 6 / 2 |
| Actions | NONE (left alone) |

---

## 5. FILES CHANGED

**NONE** (P7 not started).

Report only: `.tmp/intro-final-reconstruction/p7-runtime/R14_P7_NATIVE_LIFECYCLE_INTEGRATION_REPORT.md`

---

## 6–35. P7 SECTIONS

**NOT EXECUTED** — stopped at PRECHECK B.

| Section | Status |
|---|---|
| 6 PRESENTATION OWNER | NOT STARTED |
| 7 ANDROID LIFECYCLE | NOT STARTED |
| 8 ANDROID SPLASH RELEASE | NOT STARTED |
| 9 ANDROID FAILURE / INFINITE HOLD | NOT STARTED |
| 10 IOS LIFECYCLE | NOT STARTED |
| 11 IOS FIRST PRODUCT FRAME | NOT STARTED |
| 12 CANONICAL PACKAGE RESOLUTION | PRECHECK A only |
| 13 VERIFIED STORE | NOT STARTED (DATA_ONLY pack.json stores remain unwired) |
| 14 BOOTSTRAP / OWNER SELECTION | NOT STARTED |
| 15–26 SS / Intro / Home / CTA / lifecycle | NOT STARTED |
| 19 GIF NATIVE | OPEN (untouched) |
| 20 MP4 NATIVE | OPEN (untouched) |
| 21 MP4 AUDIO | OPEN_PRODUCT_DECISION (untouched) |
| 27–28 ANDROID/IOS BUILD | NOT RUN |
| 29 TESTS | NOT RUN (prior P6 237/237 = HISTORICAL; not reclaimed as P7) |
| 30 STATIC OLD-AUTHORITY AUDIT | NOT RUN |
| 31–33 DEVICE EVIDENCE | NOT RUN |
| 34 EVIDENCE GRADES | N/A |
| 35 OPEN REQUIREMENTS | Preserved: GIF/MP4 Admin authoring, GIF/MP4 native playback, MP4 audio, Pause/Resume, schedule/frequency, device targeting, deep drag |

---

## 36. SCOPE CONTAINMENT

- No P0–P6 reopen
- No Admin redesign
- No unrelated dirty-tree work
- No architecture invention
- No false P7 progress

---

## 37. COMMITS

**NONE**

---

## 38. PUSH

**NO**

---

## 39. DEPLOY

**NO**

---

## 40. PRODUCTION ACTIVATION

**FALSE** — compositor still unwired; P7 not started.

---

## 41. P7 FINAL GRADE

| Gate | Grade |
|---|---|
| STRUCTURAL | **STOPPED** (precheck) |
| AUTOMATED | NOT RUN |
| ANDROID BUILD | NOT RUN |
| IOS BUILD | NOT RUN |
| SAMSUNG DEVICE | NOT RUN |
| XIAOMI DEVICE | NOT RUN |
| IPHONE DEVICE | NOT RUN |
| OWNER_VISIBLE | FALSE |

---

## 42. FIRST DIVERGENCE

**QA_SET_LIVE_CAN_MUTATE_OWNER_LIVE**

Exact consumer/function:

`setLiveRelease` in `lib/intro/live/service.ts`

- Mutates `app_intro_live` (Production device Live pointer)
- No contentClass / OWNER validation
- Still callable from QA scripts with service role
- Violates invariant: QA/test/fixture authority must not establish or replace Owner active Live / Owner startup generation

PRECHECK A = PASS. PRECHECK B = FAIL → **P7 forbidden until this divergence is closed.**

---

## 43. NEXT

STOP for Owner audit.

Owner must decide the repair for PRECHECK B before P7 wiring, for example (Owner chooses — agent must not invent):

- Fail-closed contentClass=OWNER inside `setLiveRelease` (join document / revision class)
- Remove/retire direct QA imports of `setLiveRelease`; force QA through Apply boundary only
- Or other Owner-approved Live mutation seal

Do **not** start native lifecycle integration until PRECHECK B = PASS.

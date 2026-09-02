# DIBAY GLOBAL POPUP AD — CUT 0-D MEASURED GEOMETRY REPORT

Document status: **HISTORICAL MEASURE → GRADE → PROPOSE** (Owner LOCK recorded separately)  
Phase: CUT 0-D (proposal artifact)  
Date: 2026-09-02  

| Field | Value |
|---|---|
| CUT 0-C product contract | **CLOSED / PRESERVED** — not reopened |
| Owner geometry authority | [`docs/dibay-global-popup-ad-measured-geometry-lock.md`](dibay-global-popup-ad-measured-geometry-lock.md) |
| PIXEL_CONTRACT_LOCKED / GEOMETRY_CONTRACT_LOCKED | **YES** (see lock doc; this report is not the lock) |
| IMPLEMENTATION | **BLOCKED** |
| Code / CSS / migration / component | **0** |

Authority parent: [`docs/dibay-global-popup-ad-product-contract-lock.md`](dibay-global-popup-ad-product-contract-lock.md)

Evidence folder: [`docs/perf/popup-cut0d-evidence/`](perf/popup-cut0d-evidence/)

---

## 0. Scope of this CUT

Measure → grade → propose DIBAY geometry contract → **stop for Owner LOCK**.

Out of scope (hard):

- reopening CUT 0-C
- React / CSS tokens / migrations / APIs
- inventing tablet/landscape parity without evidence
- treating editorial screenshot px as runtime CSS px
- copying Baemin ~10s auto-dismiss (already locked NO in CUT 0-C)

---

## 1. Evidence inventory

| ID | Asset / source | Grade | Role in CUT 0-D |
|---|---|---|---|
| E1 | Connected Android Baemin runtime | **NOT_PROVEN** | App not installed on `RFCY40PY2CA` (prior CUT 0/0-B). No runtime CSS. |
| E2 | Baemin Ads creative guide (중문배너 PDF body) | **NOT_PROVEN this CUT** | Index page lists “중문배너 소재 제작 가이드”; **720×500 body not verified** in this chat. |
| E5 | ZDNet 2024-06-10 phone mockup (`zdnet-baemin-1.png`, Baemin-credited) | **PUBLIC_MOCKUP_MEASURED** | **Primary** measurable geometry. |
| E5b | ZDNet collage panel 2 (`zdnet-baemin-2.png`) | **PUBLIC_MOCKUP_INSUFFICIENT** | 128×252 crop; ratios unstable — supporting structure only. |
| E3/E6 | CEO plaza / media kit references | Product/visual direction (prior) | Not re-measured as pixel SSOT this CUT. |

Label rule (from CUT 0-C §14): public mockup measurements = **PUBLIC_MOCKUP_MEASURED**, never runtime CSS.

---

## 2. Primary measurement (E5)

Source: `docs/perf/popup-cut0d-evidence/zdnet-baemin-1.png`  
Machine record: `zdnet-baemin-1.measure.json`  
Debug overlay: `zdnet-baemin-1.debug.png`

| Landmark | Measured (image px) | Notes |
|---|---|---|
| Source image | 268×540 | Compressed editorial photo |
| Phone content (frame excluded) | x=3..263 (w=261), h=540 | Left rgb(249) frame 3px; right grey frame ~4px |
| Popup rect | x=3, y=308, w=261, h=223 | Bottom-anchored |
| Creative rect | h=182 | Above close row |
| Close rect | y=490..530, h=41 | White bar, label **닫기** |
| Corner radius (approx) | ~8 px | From left rounded-corner emergence |
| Backdrop sample (above popup) | ~rgb(119,121,123) | Opacity **NOT_PROVEN** |

### Ratios vs phone content

| Ratio | Value | Confidence |
|---|---|---|
| `popupWidth / contentWidth` | **1.00** | MEDIUM — close bar is content-edge-to-edge in this crop |
| `popupHeight / contentHeight` | **0.413** | MEDIUM |
| `topOffset / contentHeight` | **0.570** | MEDIUM |
| `bottomMargin / contentHeight` | **0.017** | LOW–MEDIUM |
| `creativeAspect (w/h)` | **1.434** | MEDIUM–HIGH |
| `creativeHeight / popupHeight` | **0.816** | MEDIUM |
| `closeHeight / popupHeight` | **0.184** | MEDIUM |
| `cornerRadius / popupWidth` | **~0.031** | LOW–MEDIUM (approx) |
| side gutter L/R | **~0 / ~0** | See §3 |

### Structure observed (not ratios)

- Creative-first card (not title/body dialog)
- In-creative CTA: **자세히 보기**
- Separate dismissal chrome: **닫기** row under creative
- Dimmed home behind
- Bottom-anchored promotional interstitial (not centered generic dialog)

---

## 3. Gutter finding (important)

| Claim | Status |
|---|---|
| Human visual estimate “~5–8% side gutter each side” | **NOT SUPPORTED** by pixel samples of primary asset |
| Pixel sample of close bar / creative left edge | White/creative begins at content x=3 (after frame artifact) |
| Lockable DIBAY side-gutter from this asset alone | **NO** |

Interpretation: this editorial crop shows a **near full-bleed (content-width) bottom card**. That may be true of the product UI, or the photo may already crop device chrome tightly. **Do not lock 5–8% gutter from prior visual guess.**

Owner must choose a DIBAY gutter policy (see §6).

---

## 4. Creative aspect cross-check

| Claim | Value | Grade |
|---|---|---|
| Prior secondary claim “중문배너 720×500” | aspect **1.440** | E2 PDF body **NOT verified this CUT** |
| Measured creative aspect (E5) | **1.434** | PUBLIC_MOCKUP_MEASURED |
| Δ vs 720×500 | **~0.006** | Corroboration only — not official E2 lock |

**Proposal candidate:** DIBAY creative upload / render aspect **36:25 (720×500 class)** is *consistent* with measured mockup. Official advertiser PDF confirmation remains optional upgrade, not blocking if Owner accepts measured corroboration + product need.

---

## 5. NOT_PROVEN (explicit)

| Topic | Status |
|---|---|
| E1 runtime CSS px / dp | NOT_PROVEN |
| Backdrop opacity % | NOT_PROVEN |
| Tablet layout | NOT_PROVEN |
| Landscape layout | NOT_PROVEN |
| Safe-area / home-indicator contract | NOT_PROVEN (only ~1.7% bottom margin observed in crop) |
| Official E2 720×500 PDF pixels | NOT_PROVEN this CUT |
| Side gutter 5–8% | NOT_PROVEN (contradicted by primary pixel sample) |
| Collage panel-2 ratios | INSUFFICIENT (discarded as SSOT) |

---

## 6. Proposed DIBAY Geometry Contract (candidates for Owner LOCK)

These are **proposals**, not locks. Values marked LOCKABLE_NOW are supported by graded evidence; others require Owner policy without Baemin runtime proof.

### 6.1 Presentation class — LOCKABLE_NOW

```text
presentation_class =
  bottom_anchored_promotional_interstitial
  + creative_region
  + separate_dismissal_row
  + dim_backdrop
  − centered_title_body_dialog
  − brand_green_as_card_fill
```

Aligns with CUT 0-C PRESENTATION lock; geometry measurement confirms structure.

### 6.2 Phone portrait proportions — PROPOSED BASELINE (PUBLIC_MOCKUP)

| Token (logical, not CSS yet) | Proposed | Basis |
|---|---|---|
| `popup.anchor` | `bottom` | E5 measured |
| `popup.widthPolicy.phone` | **Owner choice A/B** (below) | Gutter unresolved |
| `popup.heightRatio.phone` | ~0.40–0.45 of viewport height | Measured 0.413 |
| `creative.aspect` | **36:25** (720×500 class) | Measured 1.434 ≈ 1.44 |
| `creative.shareOfPopup` | ~0.80–0.85 of popup height | Measured 0.816 |
| `dismiss.shareOfPopup` | ~0.15–0.20 of popup height | Measured 0.184 |
| `popup.radiusRatio` | ~0.03 of popup width (scale with width) | Measured ~0.031 |
| `backdrop.required` | YES (dim) | Observed |
| `backdrop.opacity` | **Owner pick** (NOT_PROVEN) | — |

**Width / gutter Owner choice (required):**

| Option | Meaning | Evidence |
|---|---|---|
| **A — Content full-bleed card** | Phone: popup width = content width (0 side gutter) | Matches E5 pixel sample |
| **B — Small side inset** | Phone: e.g. 4–8% gutter each side | Visual habit only — **not measured**; would be DIBAY design choice, not Baemin-proven |
| **C — Max-width + center** | Phone full-bleed or inset; tablet uses max-width | Tablet still NOT_PROVEN |

Recommendation for honesty: **A** as measured baseline, or **B** only if Owner explicitly wants DIBAY inset aesthetics (label as DIBAY design, not Baemin parity).

### 6.3 Dismissal region — LOCKABLE_NOW (structure)

```text
dismiss.region = separate row under creative, same width as card
dismiss.control = text action (i18n), not X overlay on creative
dismiss.required = always visible in v1
```

### 6.4 Tablet — POLICY CANDIDATE (NOT_PROVEN)

```text
tablet = NOT_PROVEN from Baemin
proposed DIBAY policy (Owner pick):
  T1: same structure; max-width card; horizontally centered; bottom-anchored
  T2: defer tablet until device evidence
```

Do **not** claim Baemin tablet parity.

### 6.5 Landscape — POLICY CANDIDATE (NOT_PROVEN)

```text
landscape = NOT_PROVEN
proposed DIBAY policy (Owner pick):
  L1: suppress popup in landscape
  L2: compact height / keep aspect, still bottom-anchored
  L3: defer
```

### 6.6 Safe area — POLICY CANDIDATE (NOT_PROVEN)

```text
safe_area = respect platform bottom inset
measured bottom margin ~1.7% of crop height only → not CSS lock
```

---

## 7. Owner acceptance (recorded)

Owner accepted the checklist in the original proposal and locked geometry in:

[`docs/dibay-global-popup-ad-measured-geometry-lock.md`](dibay-global-popup-ad-measured-geometry-lock.md)

Summary of accepted decisions: E5 baseline YES; width **A** full-bleed; creative **36:25**; close **15–20%**; radius **~0.03 width**; backdrop opacity **DEFER**; tablet **T1**; landscape **L1**; lock doc **YES**.

This report remains the measurement / grading artifact. The lock doc is geometry authority.

---

## 8. Honesty statement (preserved)

- No E1 Baemin runtime was measured.
- No CSS token or component was added in CUT 0-D.
- Collage panel-2 was not used as SSOT.
- Side gutter 5–8% was **rejected** as proven for this asset.
- Creative aspect match to 720×500 is **corroboration**, not verified E2 PDF.
- CUT 0-C remains CLOSED and unchanged.

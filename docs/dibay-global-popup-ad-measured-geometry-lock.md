# DIBAY GLOBAL POPUP AD — MEASURED GEOMETRY LOCK

Document status: **GEOMETRY CONTRACT LOCKED**  
Phase: CUT 0-D  
Date: 2026-09-02  

| Field | Value |
|---|---|
| CUT_0_C | **CLOSED / HARD PRESERVE** — not reopened, not amended |
| PIXEL_CONTRACT_LOCKED | **YES** |
| GEOMETRY_CONTRACT_LOCKED | **YES** (preferred internal label; same authority as PIXEL lock) |
| IMPLEMENTATION | **BLOCKED** until Owner opens an implementation CUT |
| Code / CSS / API / migration / component / token impl | **0** |

Parent product authority (unchanged):  
[`docs/dibay-global-popup-ad-product-contract-lock.md`](dibay-global-popup-ad-product-contract-lock.md)

Measurement proposal (historical; superseded for lock status by this document):  
[`docs/dibay-global-popup-ad-cut0d-measured-geometry-report.md`](dibay-global-popup-ad-cut0d-measured-geometry-report.md)

Evidence folder:  
[`docs/perf/popup-cut0d-evidence/`](perf/popup-cut0d-evidence/)

---

## 0. Authority interpretation (hard)

This CUT locks a **DIBAY Geometry Contract** derived from:

1. **PUBLIC_MOCKUP_MEASURED** phone-portrait evidence (E5), and  
2. **DIBAY_PRODUCT_POLICY** where legacy evidence is absent.

It does **not** lock:

- Baemin **E1** runtime CSS/dp replication  
- Baemin **E2** official PDF proof of 720×500  
- every CSS numeric token

```text
PIXEL_CONTRACT_LOCKED = YES
GEOMETRY_CONTRACT_LOCKED = YES
```

means: geometry product authority needed to **begin** implementation is locked,  
and deferred numerics are documented as **implementation-calibration tokens** —  
not permission to invent product geometry, and not “all CSS px known.”

```text
IMPLEMENTATION = BLOCKED
```

until Owner separately opens an implementation CUT.

---

## 1. Evidence language hard lock

Never collapse these labels:

| Label | This CUT |
|---|---|
| `E1_RUNTIME_MEASURED` | **NONE** |
| `PUBLIC_MOCKUP_MEASURED` | Phone portrait E5 geometry (`zdnet-baemin-1.png`) |
| `DIBAY_PRODUCT_POLICY` | 36:25 contract; tablet T1; landscape L1 |
| `NOT_PROVEN` | Baemin runtime; tablet legacy; landscape legacy; backdrop opacity; exact CSS geometry; E2 PDF body |

---

## 2. Owner LOCK decisions

### 2.1 Phone baseline

**ACCEPTED** as phone portrait geometry baseline:

- Asset: E5 `docs/perf/popup-cut0d-evidence/zdnet-baemin-1.png`
- Grade: **PUBLIC_MOCKUP_MEASURED**
- Machine record: `zdnet-baemin-1.measure.json`

This is **not** E1 runtime proof. Do not describe values as Baemin runtime CSS/dp.  
They are measured references for deriving the **DIBAY** geometry contract.

**LOCK:**

| Field | Value |
|---|---|
| `popup.anchor` | `bottom` |
| `presentation` | creative-first |
| `dismiss.region` | separate row under creative |
| `backdrop.required` | `YES` |

---

### 2.2 Phone width

**LOCK:**

```text
popup.widthPolicy.phone = CONTENT_FULL_BLEED
```

Meaning:

- On phone portrait, popup spans the available **application content width**
- Arbitrary 4–8% side inset is **forbidden** as a “measured” or Baemin-parity claim
- Previous 5–8% gutter guess remains **discarded**

Evidence (PUBLIC_MOCKUP_MEASURED):

- `popupWidth / contentWidth` ≈ **1.00**
- side gutter ≈ **0**

This is **phone portrait policy only**.

---

### 2.3 Creative aspect

**LOCK:**

```text
creative.aspect = 36:25
```

Equivalent class: **1.44** / **720×500-class**

Evidence classification:

| Claim | Status |
|---|---|
| PUBLIC_MOCKUP_MEASURED creative aspect | **1.434** |
| E2 PDF 720×500 body | **NOT_PROVEN** |

Required wording:

> DIBAY geometry contract selected as **36:25**, supported by measured mockup corroboration.

**Forbidden wording:**

> “Baemin official 720×500 proven.”

---

### 2.4 Popup height (bounded envelope)

Do **not** lock one exact viewport ratio.

**LOCK** bounded phone portrait visual envelope:

```text
popup.height / viewport.height ≈ 0.40–0.45
```

Measured reference: **0.413**

Creative aspect remains the **primary** geometry authority.  
Do not distort the creative merely to hit the height envelope.

---

### 2.5 Creative / dismiss share

**LOCK:**

```text
creative.shareOfPopup ≈ 0.80–0.85
dismiss.shareOfPopup  ≈ 0.15–0.20
```

Measured references: creative **0.816**, dismiss **0.184**

Dismissal row contract:

- same card width as creative  
- below creative  
- text action (i18n)  
- always visible in v1  
- no X overlay replacing this contract  

---

### 2.6 Radius

**LOCK** proportional visual contract:

```text
popup.radiusRatio ≈ 0.03 × popup width
```

Measured reference: **~0.031**

Do **not** lock editorial screenshot **8px** as runtime CSS.

Later implementation tokens may approximate this ratio while remaining bounded for accessibility / device sanity.  
This does **not** require a literal `3vw` (or similar) CSS expression — only that the final visual ratio is preserved.

---

### 2.7 Backdrop

**LOCK:**

```text
backdrop.required = YES
```

**DO NOT LOCK:**

```text
backdrop.opacity
```

Reason: numeric opacity = **NOT_PROVEN**.

No guessed `0.4`, `0.5`, `rgba(...)` value in this CUT.  
Backdrop numeric token must be calibrated during implementation visual QA and must not be falsely described as legacy-measured parity.

---

### 2.8 Tablet — T1 (DIBAY responsive product policy)

**LOCK:**

```text
TABLET = T1
```

Requirements:

- same renderer  
- same creative-first structure  
- same 36:25 creative  
- same separate dismissal row  
- bottom anchored  
- horizontally centered  
- bounded by a tablet **max-width**

**Important:**

```text
tablet max-width numeric value = NOT LOCKED
```

This is **DIBAY RESPONSIVE PRODUCT POLICY**, not **BAEMIN TABLET PARITY**.  
Tablet Baemin runtime remains **NOT_PROVEN**.

---

### 2.9 Landscape — L1

**LOCK:**

```text
LANDSCAPE = L1
popup exposure = SUPPRESSED while landscape (v1)
```

Reason:

- landscape legacy geometry = **NOT_PROVEN**  
- do not invent compact popup geometry  
- popup advertising is non-critical UI  

On return to supported portrait orientation, normal resolver eligibility may be evaluated again, subject to session / suppression / storm-guard rules (CUT 0-C).

Do not mark landscape as “parity proven.”

---

### 2.10 Safe area

**LOCK semantic only:**

```text
respect platform safe-area / bottom inset
```

**DO NOT LOCK** numeric safe-area offset from the editorial crop.  
Measured ~1.7% bottom gap is **not** runtime CSS authority.

---

## 3. Final geometry authority

### LOCKED

| Field | Value | Basis |
|---|---|---|
| `presentation_class` | `bottom_anchored_promotional_interstitial` | PUBLIC_MOCKUP_MEASURED + CUT 0-C presentation |
| `phone.width` | `content_full_bleed` | PUBLIC_MOCKUP_MEASURED |
| `creative.aspect` | `36:25` | DIBAY_PRODUCT_POLICY + mockup corroboration |
| `popup.phone.heightEnvelope` | ~40–45% viewport | PUBLIC_MOCKUP_MEASURED (bounded) |
| `creative.share` | ~80–85% of popup | PUBLIC_MOCKUP_MEASURED |
| `dismiss.share` | ~15–20% of popup | PUBLIC_MOCKUP_MEASURED |
| `radius.visualRatio` | ~0.03 × popup width | PUBLIC_MOCKUP_MEASURED |
| `backdrop.required` | YES | PUBLIC_MOCKUP_MEASURED |
| `tablet` | same renderer + centered bounded max-width + bottom anchored | DIBAY_PRODUCT_POLICY (T1) |
| `landscape` | NO POPUP v1 | DIBAY_PRODUCT_POLICY (L1) |
| `safe_area` | respect platform inset | DIBAY_PRODUCT_POLICY (semantic) |

### EXPLICITLY NOT LOCKED

- runtime CSS px / dp  
- tablet max-width numeric value  
- backdrop opacity numeric value  
- breakpoint numeric values  
- exact safe-area px  
- exact animation  
- exact runtime vertical offset  
- Baemin E1 runtime equivalence  
- Baemin E2 official 720×500 proof  

---

## 4. CUT 0-D result matrix

| Field | Value |
|---|---|
| CUT_0_C | CLOSED / PRESERVED |
| PHONE_GEOMETRY_BASELINE | LOCKED |
| CREATIVE_ASPECT | LOCKED — 36:25 |
| PHONE_WIDTH_POLICY | LOCKED — CONTENT_FULL_BLEED |
| DISMISS_GEOMETRY | LOCKED |
| RADIUS_VISUAL_CONTRACT | LOCKED |
| BACKDROP_REQUIRED | LOCKED |
| BACKDROP_OPACITY | NOT_LOCKED |
| TABLET_POLICY | LOCKED — T1 |
| TABLET_NUMERIC_MAX_WIDTH | NOT_LOCKED |
| LANDSCAPE_POLICY | LOCKED — L1 SUPPRESS |
| SAFE_AREA_SEMANTIC | LOCKED |
| SAFE_AREA_NUMERIC | NOT_LOCKED |
| PIXEL_CONTRACT_LOCKED | **YES** |
| GEOMETRY_CONTRACT_LOCKED | **YES** |
| IMPLEMENTATION | **BLOCKED** |

---

## 5. Hard prohibitions (still)

Until Owner opens an implementation CUT:

```text
NO MIGRATION
NO API
NO POPUP COMPONENT
NO CSS TOKEN IMPLEMENTATION
NO INVENTED TABLET MAX-WIDTH AS “MEASURED”
NO INVENTED BACKDROP OPACITY AS “LEGACY PARITY”
NO LANDSCAPE COMPACT GEOMETRY
NO CLAIM OF E1 RUNTIME MEASUREMENT
NO CLAIM OF E2 OFFICIAL 720×500 PROOF
NO REOPEN OF CUT 0-C
```

---

## 6. Owner principle (preserved)

Success is not “a popup appears.”

Success is a DIBAY-native, creative-first promotional popup whose geometry authority is locked from graded evidence and explicit product policy — without inventing Baemin E1 equivalence.

**GEOMETRY LOCKED. DEFERRED NUMERICS DOCUMENTED. IMPLEMENTATION BLOCKED.**

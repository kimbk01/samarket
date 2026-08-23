# DIBAY STORES — BAEMIN-STYLE PRESENTATION CUT A ARCHITECTURE HARD LOCK

**Status:** CUT A ARCHITECTURE LOCK — **APPROVED**  
**Approved by Owner instruction:** 2026-08-24 — proceed in frozen order; false/bandaid work → unconditional revert + report  
**Mode after APPROVED:** Follow §11 / §15 sequence only.

**Date:** 2026-08-24

---

## 0. WHY THIS LOCK EXISTS

CUT 1~3 was aimed at **card hierarchy cleanup**.  
Owner intent was **Baemin-style HOME purpose shelves + dense BROWSE store comparison**.

That mismatch is a **direction error**, not a leftover caption bug.

---

## 1. HARD LOCKS (DO NOT TOUCH)

```text
STORES DISCOVERY SCALE:     HARD LOCK / CLOSED
HOME RANKING AUTHORITY:     NEW / LOCKED
BROWSE RANKING AUTHORITY:   NEW / LOCKED
coverage:                   LOCKED
schedule projection:        LOCKED
completed_orders_30d:       LOCKED
Gi / Dj:                    LOCKED
pagination:                 LOCKED
sort modes:                 LOCKED
server ranking:             LOCKED
```

This track is **PRESENTATION + COMPOSITION only**.

---

## 2. CUT 1~3 REJUDGMENT (NOT CLOSED)

| Item | Verdict |
|---|---|
| Presentation CUT 1~3 | **NOT product-complete** → **REVERTED** (`141456514`) |
| CLOSED claim | **CANCELLED / INVALID** |
| Post-revert CURRENT code | `StoreDeliveryRowCard` again: **116px menu L1 + payment line + isFeatured→instant_discount bug** |
| Useful cleanup intent | KEEP as **CUT B/C goals** (not present in HEAD until re-applied correctly) |

Do **not** treat reverted CUT 1~3 as architecture success.  
Do **not** claim cleanup is already in HEAD.

---

## 3. PRODUCT SURFACES (LOCKED ROLES)

```text
HOME   = discovery + mixed purpose shelves
BROWSE = category store comparison (short density)
DETAIL = full store + full menu exploration
```

| Forbidden | |
|---|---|
| HOME as BROWSE clone | FORBIDDEN |
| BROWSE as mini DETAIL | FORBIDDEN |
| DETAIL info dumped into BROWSE | FORBIDDEN |
| One generic StoreCard for every HOME shelf | FORBIDDEN |

---

## 4. BAEMIN REFERENCE — STRUCTURE LOCK (FROM OWNER SCREENSHOTS)

Observed HOME pattern (structure only — **not pixel claim**):

| Shelf purpose (Baemin examples) | Card job |
|---|---|
| Fast / soon-arriving stores | store-forward visual + ETA/distance |
| Brands on discount | brand/benefit-forward |
| Discount stores worth catching | food hero + discount overlay + store meta |
| Nearby pickup cafes | venue/pickup-forward |
| High-rating stores | store visual + rating/reviews + delivery meta |

**HOME ≠ repeating one small store row.**  
**HOME = ordered composition of different shelf purposes and presentations.**

Observed BROWSE / list density goal:

- multiple stores visible without scrolling a mini-detail
- store identity first
- decision signals compact
- menu peek secondary, not a second store block

**Yogiyo / Coupang Eats live pixel measure:** NOT_OBSERVED until evidence file exists (CUT A-VIS).

---

## 5. BAEMIN VISUAL CLONE TARGET (SEPARATE GATE)

```text
VISUAL CLONE TARGET:     YES (Owner intent)
TYPOGRAPHY / FONT SSOT:  NOT_PROVEN until measured
EXACT PX GEOMETRY:       NOT_PROVEN until measured
COMPETITOR GUESS:        FORBIDDEN
```

Structure work (CUT B/C) may proceed **without** pixel clone.  
Pixel/token clone requires CUT A-VIS PASS. Claiming “Baemin 100%” without A-VIS = **false → REVERT**.

---

## 6. COMPOSITION VS RANKING (LOCKED BOUNDARY)

```text
DISCOVERY RANKING SSOT  → which candidates / order (LOCKED)
COMPOSITION SSOT        → which shelf, order, caps, titles, sources (TO ELEVATE)
PRESENTATION OWNER      → how each shelf/card renders
ADMIN                   → business/composition policy (not ranking formula)
```

Existing HOME composer (`lib/stores/stores-home-composer.ts`) is the **composition base**.

```text
NEW PARALLEL COMPOSER:   FORBIDDEN
FORK RANKING INTO UI:    FORBIDDEN
```

---

## 7. HOME COMPOSITION — CURRENT AUTHORITY MAP (CODE FACT)

| Shelf | Code field | Signal | Current presentation (HEAD) |
|---|---|---|---|
| Slot0 | `slot0Food` | open + deliverable | FoodCard rail |
| Slot1 | `slot1Stores` | primary remainder | **`StoreDeliveryRowCard` (legacy mini-detail)** |
| Slot2 | `slot2Food` | popular pool | FoodCard rail |
| New | `newStoreFood` | first_listed window | FoodCard rail |
| Campaign | `campaignFood` | discovery campaign | FoodCard rail |
| Slot3 | `slot3Food` | delivery fee strike | FoodCard rail |
| Slot4 | `slot4Food` | rating/reviews threshold | FoodCard rail |
| Slot5 | `slot5Food` | `is_featured` | FoodCard grid |
| Slot6 | nearby/rest | distance / remainder | **`StoreDeliveryRowCard`** |

**Fact:** multi-shelf composition already exists.  
**Gap:** purpose-specific presentations missing; Admin cannot edit composition.

**FALSE (do not write):** `StoresHomeStoreTeaserCard` exists in HEAD — **ABSENT after revert**.

---

## 8. BROWSE PRESENTATION — CURRENT AUTHORITY MAP (CODE FACT)

| Item | Fact |
|---|---|
| Named target owner | `StoresBrowseStoreComparisonCard` (CUT B) |
| Real impl | `StoreDeliveryRowCard` + `presentation="browseComparison"` on Browse |
| Server order | preserved (no client re-sort) |
| Failure mode | vertical mini-detail: popular caption + **116px** menu tiles + meta + payment |

**BROWSE goal:** short store comparison density.  
**Not:** caption-only patch. **Not:** mini store detail page.

**Note:** Separate `StoresBrowseStoreComparisonCard` file not required if `presentation="browseComparison"` owns browse density.

---

## 9. KEEP / CHANGE / DELETE

### KEEP

- Discovery scale + ranking HARD LOCK
- Existing HOME composer + exposure dedupe (Invariant C)
- P1 signals: popular store/product, new store, campaign, fee strike, featured, top-rated
- Food vs Store presentation split **direction**
- Admin discovery **monitor** (read-only)

### CHANGE (later cuts)

- BROWSE: real comparison density (CUT B)
- HOME: purpose-specific shelf presentations (CUT C)
- Popular product: HOME shelf primary; BROWSE secondary peek only
- Composition: Admin-controllable policy (CUT D / C1~C8)
- Visual system: after A-VIS → tokens

### DELETE / INVALIDATE

- “CUT 1~3 CLOSED = Baemin done”
- “Fix popular caption → CLOSED”
- Docs claiming Teaser/Comparison exist while HEAD still uses legacy row only
- Guessed competitor px/font as SSOT

### DO NOT TOUCH

- Ranking RPC / eligibility / Gi·Dj / coverage / schedule / pagination / sort modes
- New parallel home composer

---

## 10. ADMIN CONTROL MODEL (TARGET — NOT IN CUT A)

Admin controls **composition policy**, not ranking:

- shelf enabled / disabled  
- display order  
- title / subtitle  
- surface type  
- candidate source  
- max items  

```text
ADMIN → React component picker: FORBIDDEN
ADMIN → ranking weight editor:  OUT (this track)
```

Current Admin Discovery Control v1 = **READ-ONLY**. Campaign HTTP writer = **NOT_IMPLEMENTED**.

---

## 11. IMPLEMENTATION CUT SEQUENCE (FROZEN ORDER)

| Cut | Name | Allowed | Forbidden |
|---|---|---|---|
| **CUT A** | Architecture Lock (this doc) | freeze roles/boundaries | ranking edits |
| **CUT A-VIS** | Competitor visual measurement | evidence file | UI implementation / fake px |
| **CUT B** | BROWSE comparison density | browse presentation only | ranking; HOME redesign; caption-only CLOSE |
| **CUT C** | HOME shelf presentations | map existing slots → purpose cards | new composer fork; ranking |
| **CUT D / C1~C8** | Admin composition policy + engine | policy over existing composer | ranking editor |
| **W** | Campaign HTTP writer | CRUD | ranking |
| **A** | Ads / coupon insert | stores surfaces | ranking pollution |

**Structure CUT B/C may run before A-VIS.**  
**Pixel clone may not claim PASS before A-VIS.**

---

## 12. ANTI-BANDAID RULE (OWNER HARD)

If any of the following occurs → **unconditional git revert of that change + report**:

1. Caption-only / CSS-only tweak claimed as CUT B/C complete  
2. “Baemin/Yogiyo/Coupang done” without structure + (for pixels) A-VIS evidence  
3. Discovery ranking / scale / sort / pagination touched on this track  
4. Parallel home composer invented  
5. False doc claiming components exist that HEAD does not  
6. Skipping a frozen phase then declaring later phase CLOSED  

---

## 13. OWNER APPROVAL BLOCK

```text
CUT A ARCHITECTURE LOCK

RANKING / SCALE:           HARD LOCK PRESERVED
CUT 1~3 CLOSED:            CANCELLED (REVERTED)
HOME ROLE:                 PURPOSE SHELF COMPOSITION
BROWSE ROLE:               SHORT STORE COMPARISON
DETAIL ROLE:               FULL STORE + MENU
COMPOSITION BASE:          EXISTING HOME COMPOSER (EXTEND ONLY)
PARALLEL COMPOSER:         FORBIDDEN
BAEMIN STRUCTURE TARGET:   LOCKED
BAEMIN FONT/PX CLONE:      DEFERRED TO CUT A-VIS (NOT_PROVEN)
ANTI-BANDAID:              REVERT + REPORT

OWNER:
[x] APPROVED — 2026-08-24 (order lock + anti-bandaid instruction)
[ ] REJECTED — reason: ________
```

---

## 14. MASTER REMAINING CHECKLIST (SSOT)

```text
DONE     : Discovery LOCK · CUT1~3 revert · C0 composition audit · CUT A APPROVED
IN PROGRESS : CUT B — `StoreDeliveryRowCard` `presentation="browseComparison"` + isFeatured→recommended
OPEN     : CUT B runtime proof · CUT C · A-VIS · C1~C8 · Campaign writer · Ads/coupon insert

CUT B CODE FACT (not pixel clone):
- Browse wires `presentation="browseComparison"`
- Store identity first (56px profile) · meta compact · menu peek 40px secondary
- No payment line · no 116px menu L1 on browse comparison
- isFeatured badge → `store_badge_recommended` (not instant discount)
- HOME remains `presentation="legacy"` until CUT C
- Baemin px/font: NOT claimed (A-VIS pending)

```

Report format every cut:

```text
PHASE: ...
DONE THIS STEP: ...
EVIDENCE: ...
DISCOVERY: untouched | FAIL
STILL OPEN: [ ] B [ ] C [ ] A-VIS [ ] C1-8 [ ] W [ ] A
NEXT: ...
BANDAID?: NO | YES→REVERTED
```

---

## 15. STATUS

```text
STATUS: CUT A APPROVED — CUT B CODE LANDED (runtime proof pending)
UI MODIFICATION: allowed only for current frozen cut
COMMIT: only when Owner requests
PUSH: only when Owner requests
```

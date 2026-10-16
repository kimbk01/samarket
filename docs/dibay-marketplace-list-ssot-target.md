# DIBAY Marketplace — LIST SSOT TARGET CONTRACT

**STATUS: OWNER CONFIRMED (2026-08-20). L-SOFT AMENDED BY OWNER (2026-10-16) — LOCAL → NEARBY → NATIONWIDE.**  
**Audit close:** CURRENT AUDIT PASS · LEGACY NOT PROVEN · IMPLEMENTATION unblocked for CUT-SSOT-*.

Parent audit: SSOT AUDIT CLOSE (2026-08-20).  
Implementation plan: `docs/dibay-marketplace-cut-ssot-implementation-plan.md`.

---

## 1. OWNER decisions (LOCKED)

| # | Topic | Decision | ID |
|---|--------|----------|-----|
| 1 | T5 unrelated boundary | same ROOT expansion then **STOP** (no global unrelated) | **T5-B** |
| 2 | ROOT/TOPIC membership | browse + search **HARD** `trade_category_id IN` | **M-HARD** |
| 3 | TOPIC ↔ composition | **COMP-ONLY** — SUV = `body_type` composition; TOPIC child not used for SUV semantic (CUT A) | **TC-B** |
| 4 | Similarity authority | **BOTH** — TOPIC id graph → composition proximity ladder | **SIM-BOTH** |
| 5 | Browse location | nationwide eligible + **LOCAL → NEARBY → NATIONWIDE** priority (soft), never region-only (2026-10-16) | **L-SOFT** |
| 6 | Default sort | tier/block internal **newest**; distance **only** `sort=distance` | **S-CURRENT** |

### 1.1 L-SOFT location tiers (OWNER 2026-10-16 — supersedes "LGU boost = anchor only")

Default browse (anchor City + 거리 「전체」, `radiusKm == null`) is a **priority/ranking** system, not a filter:

```text
LOCAL    = anchor City (trade_lgu_id = anchor, or legacy region/city mapped to anchor)
NEARBY   = LGUs whose centroid is within TRADE_BROWSE_NEARBY_TIER_RADIUS_KM of the anchor centroid, anchor excluded
NATIONWIDE (rest) = every other eligible listing, incl. listings without a resolvable location
order    = LOCAL → NEARBY → NATIONWIDE; inside each tier the user sort (latest · popular · distance)
```

- Nearby radius = **the service recommended radius** (`TRADE_BROWSE_NEARBY_TIER_RADIUS_KM = TRADE_BROWSE_RECOMMENDED_RADIUS_KM`, 64 km — "Metro Manila city-grain browse default"). Same centroid matcher as explicit `radius=`; no second distance policy.
- Tiers are **disjoint SQL partitions** whose union is the full eligible set — pagination keeps tier order with no duplicate / missing row (`lib/trade/location/national/browse-location-tiers.ts`).
- Explicit `radius=N` remains the **only** hard location boundary. `location=all` (guest · no master · unmappable master) = nationwide user sort, no tiers.
- A failed tier query is an **error** (HTTP 503 → list error + retry), never an empty list.
- Search (`q`) keeps T1–T5 relevance bands; inside each band the same LOCAL → NEARBY → NATIONWIDE order. The eligible pool is ranked **once per ranked window** (up to `MARKETPLACE_SEARCH_RANK_POOL_CAP`), so the order is global across pages (duplicate 0 / missing 0); a failed fill is an error, never a truncated list. Ranking reads only `MARKETPLACE_SEARCH_RANK_SELECT` (slim columns, no images / no per-row masking function); full rows are loaded for the visible page only (`hydrateHomePostsByIds`, ranked order kept).
- Search step 2 (candidate filter): round 1 ranks only rows matching `buildSearchCandidateSqlFilter` — a proven superset of bands 0–4 (`search_text ILIKE %word%` per word + category-id sets; `posts.search_text` + pg_trgm GIN, migration `20270506120000`). Band 5 (tail) = band-5 candidates merged by the same comparator with an SQL stream of `NOT filter` rows per location block, read lazily. Result order is identical to ranking the whole pool (equivalence tests). Falls back to whole-pool ranking when the candidate set exceeds the cap or the candidate query fails. `strongRelated` "all ≥3-char tokens present" applies only when such tokens exist (OWNER 2026-10-16 fix — short queries such as 「임대」 no longer mark every listing related; unrelated listings move to the tail, still shown).

---

## 2. TAXONOMY SSOT (TARGET)

```text
Admin categories (ROOT parent_id=null, TOPIC parent_id=root)
  → UI chips / WRITE / URL ?topic=
  → posts.trade_category_id (child if chosen else root)
  → LIST membership (HARD IN expanded ids)
  → SEARCH hints (TOPIC graph + profile composition — SIM-BOTH)
  → FILTER composition AND (explicit filters[] only)
```

**TC-B:** Admin TOPIC child = list narrowing membership only. Product attributes (SUV, 페소 판매 direction, etc.) live in **ROOT composition**, not duplicate TOPIC semantics.

**DB authority for TOPIC graph:** `id`, `parent_id`, `name`, `name_en`, `slug`. No `aliases` column — label-only token search is **not** primary similarity SSOT.

---

## 3. MEMBERSHIP SSOT (TARGET — M-HARD)

### Eligible set

```text
Eligible =
  public trade listings
  AND status/moderation gates
  AND CUT B sell-intent domain eligibility (unchanged)
  AND explicit user hard AND (composition filters[], price, tradeState, …)
  AND when ROOT/TOPIC selected:
       trade_category_id IN expand(root [, topic child subtree])
```

### Forbidden

- `philife/posts` nationwide fetch + soft `partitionPostsByCategoryPriority` as **sole** category gate when ROOT/TOPIC selected
- `trade/feed` vs `philife/posts` **different** category membership for same URL state
- `location` / `q` / `radius` changing eligible set (REOPEN-1) — **rank only**

### Member UI

- Display fetch = **`GET /api/philife/posts`** (single member path)
- `trade/feed` = internal/prefetch delegate to same membership resolver (CUT-SSOT-1)

---

## 4. SEARCH RELEVANCE SSOT (TARGET)

Within **M-HARD** eligible set:

```text
T1  exact phrase (title)
T2  strong related (profile-aware tokens / catalog)
T3  similar — composition proximity (same ROOT profile)
T4  similar — TOPIC graph (sibling TOPIC, same parent) [SIM-BOTH tier order TBD in assembler]
T5  same ROOT only — expanded listings not in T1–T4; NO cross-ROOT unrelated [T5-B]
```

**T5-B STOP rule:** After T5 within ROOT exhausted → **stop** (no exchange/general tail for car query).

Each tier internal (S-CURRENT + L-SOFT where applicable):

```text
LOCAL (selected LGU) → NEARBY → NATIONWIDE → newest
(sort=distance → distance within tier only)
```

---

## 5. SIMILARITY SSOT (TARGET — SIM-BOTH)

Profile-aware composition expansion (per ROOT seed):

| ROOT | Expansion signals (after exact) |
|------|----------------------------------|
| used-car | model → make → body_type |
| exchange | direction → currency pair |
| real-estate | deal_type → estate_type |
| jobs | listing_kind → work_category |
| rent-car | make/model |
| general | title tokens |

Cross-cutting TOPIC graph (when TOPIC child exists):

```text
same trade_category_id TOPIC
  → sibling TOPIC (same parent_id)
  → parent ROOT (already membership boundary)
```

**Not primary:** TOPIC name/slug ILIKE alone.

---

## 6. LOCATION / SORT SSOT (TARGET)

| Mode | Location (L-SOFT) | Sort (S-CURRENT) |
|------|-------------------|------------------|
| Default browse | LOCAL → NEARBY → NATIONWIDE on nationwide eligible | newest |
| ROOT/TOPIC browse | LOCAL → NEARBY → NATIONWIDE; no SQL hard city wall | newest |
| Text search | per-band LOCAL → NEARBY → NATIONWIDE | newest in tier |
| Explicit `sort=distance` | distance within tier/block | distance |

**Remove:** `trade/feed` hard location SQL empty-set behavior (align with philife soft boost).

---

## 7. FINAL LIST SSOT (TARGET)

```text
resolveMarketplaceMembership(state) → eligible[]
mode = browse | search
assembleMarketplaceListOrder(eligible, mode, state) → ordered page
```

Single ranked-window key per `(membership, mode, query, location, sort, filters)`.

---

## 8. Mode matrix (TARGET locked)

| MODE | MEMBERSHIP | RELEVANCE | SIMILAR | LOCATION | SORT | UNRELATED |
|------|------------|-----------|---------|----------|------|-----------|
| Default browse | M-HARD universe + sell-intent | none | none | L-SOFT boost | newest | none |
| ROOT browse | M-HARD IN root∪children | none | none | L-SOFT | newest | none |
| TOPIC browse | M-HARD IN topic subtree | none | none | L-SOFT | newest | none |
| Text search | M-HARD or full universe if no root | T1→T2 | T3/T4 SIM-BOTH | tier LGU | S-CURRENT | T5-B ROOT only |
| Search + ROOT | M-HARD IN root | T1→T2 | T3/T4 within ROOT | tier LGU | S-CURRENT | T5-B |
| Search + TOPIC | M-HARD IN topic | T1→T2 | TOPIC graph + comp | tier LGU | S-CURRENT | T5-B |
| Filter combined | M-HARD + composition AND | if q: tiers | SIM-BOTH | L-SOFT / tier | S-CURRENT | T5-B if q |

LEGACY column: **NOT PROVEN** (all modes).

---

## 9. OWNER one-liner (TARGET intent)

Search ordering target: **exact → similar (composition + TOPIC graph within ROOT) → location tier (LOCAL → NEARBY → NATIONWIDE) within band → newest**; **no cross-ROOT unrelated**; distance only when user selects distance sort.

Browse ordering target (2026-10-16): **내 지역 → 주변 지역 → 그 외 전국** — 특정 지역만 보여주는 구조 금지 (명시 거리 `radius=` 제외).

---

## 10. DO NOT (without new cut)

- Restore global T5 unrelated tail (T5-C)
- SOFT-only category membership when ROOT/TOPIC selected (M-SOFT)
- SUV as Admin TOPIC semantic duplicate of `body_type` (TC-B violation)
- Label-only TOPIC search without id graph (SIM-BOTH)
- Anchor-only boost without the NEARBY tier, or any default-browse SQL location wall (L-SOFT 2026-10-16)
- Hard-coded nearby km outside `TRADE_BROWSE_NEARBY_TIER_RADIUS_KM`
- Presenting a failed tier query as an empty list

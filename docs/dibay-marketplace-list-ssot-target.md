# DIBAY Marketplace — LIST SSOT TARGET CONTRACT

**STATUS: OWNER CONFIRMED (2026-08-20).**  
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
| 5 | Browse location | nationwide eligible + **LGU boost** (soft), not block-only | **L-SOFT** |
| 6 | Default sort | tier/block internal **newest**; distance **only** `sort=distance` | **S-CURRENT** |

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
within selected LGU → outside LGU → newest
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
| Default browse | LGU boost on nationwide eligible | newest |
| ROOT/TOPIC browse | LGU boost; no SQL hard city wall | newest |
| Text search | per-tier within→outside LGU | newest in tier |
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

Search ordering target: **exact → similar (composition + TOPIC graph within ROOT) → location boost within tier → newest**; **no cross-ROOT unrelated**; distance only when user selects distance sort.

---

## 10. DO NOT (without new cut)

- Restore global T5 unrelated tail (T5-C)
- SOFT-only category membership when ROOT/TOPIC selected (M-SOFT)
- SUV as Admin TOPIC semantic duplicate of `body_type` (TC-B violation)
- Label-only TOPIC search without id graph (SIM-BOTH)

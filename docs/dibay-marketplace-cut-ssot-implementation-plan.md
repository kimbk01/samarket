# DIBAY Marketplace — CUT-SSOT Implementation Plan

**STATUS: ACTIVE.**  
**TARGET authority:** `docs/dibay-marketplace-list-ssot-target.md` (OWNER CONFIRMED 2026-08-20).

**Reopens (explicit):** CUT C T5 global tail · philife soft category priority · dual membership · browse location block-only (partial — L-SOFT).

**Preserves:** CUT A–J · UI-1~6 · CUT B sell-intent · Phase 0–3 reset/PTR/pagination.

---

## CUT sequence

| Cut | Scope | Gate |
|-----|--------|------|
| **SSOT-0** | TARGET doc | DONE |
| **SSOT-1** | M-HARD membership + T5-B + feed/philife parity | **DONE** (2026-08-20) |
| **SSOT-2** | Profile hints + TOPIC graph relevance | **DONE** (2026-08-20) |
| **SSOT-3** | `assembleSearchOrder` + SIM-BOTH ladder | **DONE** (2026-08-20) |
| **SSOT-4** | L-SOFT browse + single assembler + feed location align | **DONE** (2026-08-20) |
| **SSOT-5** | Production runtime CASE A–H | **PROBE DONE** — runtime PASS requires Git deploy |

---

## SSOT-1 (DONE 2026-08-20)

### Shipped

- `resolve-marketplace-membership.ts` — `computeMarketFilterIds` parity · T5-B tail gate
- `home-posts-route-core.ts` — M-HARD `tradeCategoryIdsForQuery`
- `home-posts-query-server.ts` — no global unrelated tail without membership
- `app/api/trade/feed/route.ts` — shared `resolveMarketplaceMembershipIdsForRoots`
- Tests: `marketplace-membership-ssot.test.ts` (5) · search-relevance (16) · `verify:trade-primary-tab-transition` PASS

### Deferred to SSOT-2+

- SIM-BOTH similarity ladder · TOPIC graph relevance
- L-SOFT browse refactor
- Single `assembleMarketplaceListOrder`
- Production CASE A–H runtime

---

## SSOT-2 (DONE 2026-08-20)

### Shipped

- `search-topic-graph-context.ts` — TOPIC id/sibling graph relevance
- `load-search-topic-graph-context.ts` — DB load under trade ROOTs
- `search-expansion-profile-hints.ts` — exchange/jobs/RE meta catalog hints
- `search-candidate-expansion.ts` — T2 topic graph + profile meta; related OR extended
- `home-posts-route-core.ts` — load topic graph on search
- Tests: topic graph (4) · profile hints (3) · prior search tests preserved

### Deferred to SSOT-3

- Full `assembleSearchOrder` tier reorder (T3 composition vs T4 TOPIC split)
- Ranked window key includes topic graph revision

---

## SSOT-3 (DONE 2026-08-20)

### Shipped

- `search-expansion-composition-proximity.ts` — profile-aware T3 signals
- `assemble-marketplace-search-order.ts` — SSOT search order entry
- `search-candidate-expansion.ts` — T3 composition vs T4 TOPIC sibling; location only within-tier sort
- `home-posts-query-server.ts` — uses `assembleMarketplaceSearchOrder`
- Tests: composition proximity (3) · topic graph T4 · search-relevance rank updated

### Deferred to SSOT-4

- L-SOFT browse nationwide + LGU boost refactor
- Feed/philife location align · single browse assembler

---

## SSOT-4 (DONE 2026-08-20)

### Shipped

- `assemble-marketplace-browse-order.ts` — L-SOFT within → outside + sort blocks
- `home-posts-query-server.ts` — browse priority uses assembler · `pageSize` param for feed parity
- `fetch-trade-feed-page.ts` — city browse + no q → `resolveHomePostsPayload` (no hard SQL location)
- Tests: `assemble-marketplace-browse-order.test.ts` (2)

### Deferred to SSOT-5

- Production runtime CASE A–H matrix · Samsung/Xiaomi smoke

---

## SSOT-5 (PROBE 2026-08-20)

### Shipped (code gate)

- `scripts/qa/marketplace-list-ssot-runtime-matrix.mjs` — CASE A–H Production API probe
- Evidence: `.qa-logs/marketplace-list-ssot-runtime/REPORT.json`

### Production runtime (current deploy — pre-SSOT merge)

| Case | Mode | Result |
|------|------|--------|
| A | default browse | **PASS** |
| B | ROOT M-HARD | **FAIL** — philife soft leak (audit-known) |
| C | TOPIC browse | **NOT_PROVEN** — TOPIC children=0 |
| D | search T5-B | **FAIL** — unrelated exchange in Fortuner tail |
| E | search+ROOT | **FAIL** — cross-ROOT ids |
| F | search+TOPIC | **NOT_PROVEN** |
| G | filter+location | **PASS** (smoke) |
| H | feed/philife parity | **FAIL** — feed empty / philife soft |

**Gate:** `node scripts/qa/marketplace-list-ssot-runtime-matrix.mjs` → expect **8/8 PASS** after Git Integration deploy of SSOT-0~4.

### Samsung/Xiaomi UI smoke

**NOT_RUN** — device matrix deferred until post-deploy API matrix PASS.

---

## Verification (add stage)

| Stage | Command |
|-------|---------|
| SSOT-1 | `vitest run lib/trade/marketplace/__tests__/marketplace-membership-ssot.test.ts` |
| SSOT-1 | `npm run verify:trade-primary-tab-transition` |
| SSOT-5 | `node scripts/qa/marketplace-list-ssot-runtime-matrix.mjs` (post-deploy) |
| Pre-commit | lint · typecheck:build · i18n (when UI touched) |
| Pre-push | `npm run build` |

# DIBAY STORES — Composition Contract (C1)

**Status:** `C1 = CLOSED` · `C2 = READY FOR OWNER CLOSE` (Admin policy storage; engine NOT_STARTED)

**Phase:** C1 Composition Contract · C2 Admin Composition Policy

**Presentation track:** CLOSED (A-VIS · CUT B · CUT C · PHASE 4 evidence-limited)

**Claim allowed:** `BAEMIN MEASURED PARITY CLOSED WITH EVIDENCE-LIMITED DELTAS` (Presentation)

**Claim forbidden:** `BAEMIN 100% IDENTICAL`

---

## 1. Authority

| Layer | Owner | C1 touch |
|---|---|---|
| Discovery candidate / eligibility / ranking / sort / pagination | `store-discovery-*` · RPC | **UNTOUCHED** |
| HOME multi-shelf allocation | `lib/stores/stores-home-composer.ts` | **documented only** |
| HOME presentation order / titles | `StoresHomeHub` · `StoresHomeHubBelowFold` · i18n | **UNTOUCHED** |
| BROWSE organic list | Discovery browse sort + `StoresBrowsePrimaryView` | **UNTOUCHED** |
| Admin Discovery monitor | `lib/stores/admin-store-discovery-control.ts` (read-only) | **UNTOUCHED** |
| Composition contract (C1) | `lib/stores/composition/*` | **NEW — types + default policy + invariants** |

Canonical types: `lib/stores/composition/stores-composition-contract.ts`

---

## 2. Current Composition Authority (C0 + repository audit)

### HOME

| Concern | Current owner |
|---|---|
| Single compose per feed render | `composeStoresHomeFeed` in `stores-home-composer.ts` |
| Composition fields | `StoresHomeFeedComposition` (slot0Food … slot6RestStores) |
| Section ordering (UI) | Hub: slot0 → slot1 → deferred BelowFold rails → FeedList slot6 |
| Caps / max | `STORES_HOME_*_MAX` constants in composer |
| Exposure dedupe | `StoresHomeExposureRegistry` (per-feed, role-aware) |
| Enable/disable | Implicit: empty shelf omitted in UI; no Admin toggle |
| Title authority | Presentation i18n in Hub/BelowFold/FeedList |
| Campaign composition input | `store.discoveryCampaign` from `loadActiveStoreDiscoveryCampaignsForHome` (home-feed route) |

### BROWSE

| Concern | Current owner |
|---|---|
| Composition engine | **None** — Discovery ranked result is the list |
| Section ordering | N/A (single organic list) |
| Caps | Discovery pagination / API limits |
| Future insertion | **NOT_STARTED** |

### Admin read-only Discovery monitor

`admin-store-discovery-control.ts` — rating policy read, campaign monitor read, per-store snapshot. **Does not write composition.** Campaign eligibility authority remains in Discovery layer.

---

## 3. Contract Fields

| Field | Meaning |
|---|---|
| `surface` | `home` \| `browse` |
| `slot` | Exposure region id (reuses `StoresHomeSlotId` on HOME) |
| `contentType` | `store` \| `food_product` \| `campaign_food` \| `ad` \| `coupon` |
| `enabled` | Section on/off |
| `order` | **Presentation section order** (not Discovery ranking) |
| `interval` | Insertion interval — **NOT_CONSUMED** in C1 |
| `max` | Max items consumed from source stream; `null` = unbounded |

---

## 4. Composition CAN Control

- Surface targeting (HOME / BROWSE)
- Slot / section identity
- Content type placement per slot
- Section enable/disable
- Section presentation order
- Per-section max/cap (consume head of stream)
- Future interval placement (field defined; **NOT_CONSUMED**)

---

## 5. Composition CANNOT Control

Frozen list: `STORES_COMPOSITION_FORBIDDEN_AUTHORITIES` in contract module.

Includes: candidate generation, eligibility, ranking score/weights, sort, pagination, distance, popularity metric, new-store authority, campaign eligibility, rating authority.

**Rule:** Discovery returns `[S1, S2, S3, S4, S5]` → Composition may cap to `[S1, S2, S3]` but **never** `[S3, S1, S2]`.

---

## 6. Discovery Input Order Invariant

**ID:** `composition_preserves_discovery_input_order_per_stream`

Pure helpers: `lib/stores/composition/stores-composition-invariants.ts`

- `applyCapPreserveDiscoveryOrder`
- `dedupePreserveDiscoveryOrder`
- `preservesDiscoveryInputOrder`

Dedupe example: `[S1, S2, S1, S3]` → `[S1, S2, S3]` ✓

Tests: `lib/stores/__tests__/stores-composition-contract.test.ts`

---

## 7. HOME Mapping (CURRENT PRODUCTION)

Default policy: `STORES_HOME_COMPOSITION_DEFAULT_POLICY`

| Current field | Contract slot | Content type | Max | Order | Title ref |
|---|---|---|---:|---:|---|
| slot0Food | slot0Food | food_product | 16 | 0 | store_order_now_title |
| slot1Stores | slot1Stores | store | ∞ | 1 | (none — primary row) |
| slot2Food | slot2Food | food_product | 20 | 2 | store_home_popular_stores_title |
| newStoreFood | newStoreFood | food_product | 20 | 3 | store_home_new_stores_title |
| campaignFood | campaignFood | campaign_food | 20 | 4 | store_home_campaigns_title |
| slot3Food | slot3Food | food_product | 20 | 5 | store_badge_menu_discount |
| slot4Food | slot4Food | food_product | 20 | 6 | store_spot_recommended_subtitle |
| slot5Food | slot5Food | food_product | 8 (UI shows 4) | 7 | store_spot_recommended_title |
| slot6NearbyStores | slot6NearbyStores | store | 24 | 8 | store_neighborhood_more_title |
| slot6RestStores | slot6RestStores | store | ∞ | 9 | store_feed_stores_title |

**Note:** Composer-internal filters (open-now, strike, rating thresholds, deprioritize, product dedupe) remain in `stores-home-composer.ts` — C1 does not relocate them.

---

## 8. BROWSE Boundary

Policy: `STORES_BROWSE_COMPOSITION_DEFAULT_POLICY`

| Slot | Status | Notes |
|---|---|---|
| organic_discovery_list | enabled | Discovery browse sort = list authority |
| future_ad_insertion | disabled, NOT_CONSUMED | CONTRACT ONLY |
| future_coupon_insertion | disabled, NOT_CONSUMED | CONTRACT ONLY |
| future_promoted_placement | disabled, NOT_CONSUMED | CONTRACT ONLY |

Organic reorder forbidden. Future insertion may interleave only without mutating Discovery authorities.

---

## 9. Default Policy

`STORES_HOME_COMPOSITION_DEFAULT_POLICY` + `STORES_BROWSE_COMPOSITION_DEFAULT_POLICY`

**CURRENT PRODUCTION BEHAVIOR PRESERVED** — declarative only; **not wired** into composer in C1.

---

## 10. Evidence-Limited (non-blocking, from PHASE 4)

- Category row height +5.4px — UNRESOLVED / EVIDENCE-LIMITED
- Category tile width asymmetry — UNRESOLVED / EVIDENCE-LIMITED

**Not Composition scope.** Presentation CLOSED.

---

## 11. C2 — Admin Composition Policy (CLOSED scope)

| Layer | Path |
|---|---|
| Migration | `supabase/migrations/20260824120000_stores_composition_policy.sql` |
| Override storage | `store_composition_policy_overrides` |
| Audit log | `store_composition_policy_logs` |
| Validation | `lib/stores/composition/stores-composition-policy-validation.ts` |
| DB read/write | `lib/stores/composition/stores-composition-policy-db.ts` |
| Resolve (default + override) | `lib/stores/composition/stores-composition-policy-resolve.ts` |
| Admin API | `app/api/admin/stores-composition-policy/route.ts` (GET/PUT) |
| Admin UI | `app/admin/stores-composition-policy` |

**Immutable (system-owned):** `surface`, `slot`, `contentType` (canonical C1 identity)

**Editable:** `enabled`, `order`, `max`, `interval` (C2: `NOT_CONSUMED` only)

**Title editability:** DEFERRED (Presentation i18n authority)

**Default + override:** Missing DB row ⇒ C1 default. Admin override persisted per `(surface, slot)`.

**Engine:** `NOT_STARTED` — saved policy does **not** wire to `composeStoresHomeFeed` or Browse list.

**E2E script:** `scripts/qa/stores-c2-composition-policy-admin-e2e.mjs` (requires `ADMIN_E2E_EMAIL` / `ADMIN_E2E_PASSWORD`)

## 12. C3 Handoff

Next: **C3 — Composition Engine** (policy consumption behind feature gate; still no C8 cutover).

C3 may read resolved policy but must not:

- Modify Discovery ranking/sort
- Change default policy without explicit cutover gate (C8)

---

## 13. Absolute Prohibitions (C1–C2)

- Presentation / CATEGORY / HOME card / parity delta changes
- Discovery / ranking / sort / pagination changes
- Admin UI / Admin writer API
- DB migration
- Composition engine / shadow / cutover
- Campaign writer
- Ads/Coupon insertion runtime
- Commit / push without Owner instruction

---

## 14. Close Checklist

| Gate | Status |
|---|---|
| Composition authority boundary documented | ✓ |
| Canonical contract/type exists | ✓ |
| HOME current mapping exists | ✓ |
| BROWSE organic-order boundary exists | ✓ |
| Discovery input-order invariant + tests | ✓ |
| Runtime exposure unchanged | ✓ (no composer wire) |
| Admin read/write + persistence | ✓ (API + migration) |
| Presentation diff | NONE |
| Discovery diff | NONE |

**C1:** CLOSED  
**C2:** READY FOR OWNER CLOSE

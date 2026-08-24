# DIBAY STORES — HOME + CATEGORY CURRENT SSOT

**STATUS:** CURRENT HEAD FACT LOCK  
**DATE:** 2026-08-24  
**AUTHORITY:** Sole implementation/QA baseline until replaced by a newer HEAD audit.

---

## 1. CURRENT HEAD

| Field | Value |
|-------|--------|
| Recovery code lock | `2e96de414` — `fix(stores): close HOME+CATEGORY recovery authority gaps` |
| Tip requirement | After push: `HEAD == origin/main` and `2e96de414` is an ancestor of tip |
| Supersedes | `f12b3c6ec` audit and any HEAD/WT-mixed statuses |

**Verify:** `git merge-base --is-ancestor 2e96de414 HEAD`  
**Product Recovery WT vs tip:** recovery paths must have **0** uncommitted lines (EXCLUDE unrelated dirty).

Do not promote historical CLOSED / prior PASS language to CURRENT PASS.

---

## 2. CURRENT DB SCHEMA

### HOME

**Table:** `public.store_composition_policy_overrides`  
**Migrations:** `20260824120000_*`, `20260824130000_*`, `20260824170000_*`, `20260824180000_*`

Columns used by shelves CMS: `surface`, `slot`, `shelf_id`, `enabled`, `section_order`, `max_items`, `title_*`, `subtitle_*`, `presentation_mode`, `coupon_integration`, `ad_integration`, `schedule_*`, `product_config` jsonb.

**CAS:** `store_composition_policy_surface_revision`.

### CATEGORY

**Table:** `public.store_browse_scope_policy` (`scope_key` PK)  
**Migrations:** `20260824170000_*`, `20260824190000_*`, `20260824200000_stores_browse_scope_policy_cas_delete.sql`

Columns: `enabled`, `display_title_*`, `ad_enabled`, `coupon_enabled`, `max_insertion`, `interval_every_n`, `presentation_mode`, `schedule_*`, `product_config`.

**CAS:** `save_store_browse_scope_policy_cas` with `p_delete_scope_keys` (secondary inherit = delete row).

---

## 3. ADMIN MENU AUTHORITY

| Surface | Path | Owner file |
|---------|------|------------|
| HOME | `/admin/stores-home-shelves` | `components/admin/admin-menu.ts` + `AdminStoresHomeShelvesPage.tsx` |
| Category 1차/2차 | `/admin/stores-category-policy?tier=…` | same menu + `AdminStoresCategoryPolicyPage.tsx` |
| Delivery CMS rail | right menu | `lib/admin/delivery-cms-nav.ts` |

Menu path: `/admin` → 배달 → HOME 관리 / 카테고리 관리.  
`/admin/stores-composition-policy` → `permanentRedirect` to HOME shelves (`app/admin/stores-composition-policy/page.tsx`).

---

## 4–7. HOME AUTHORITY (ONE OWNER EACH)

| Concern | ONE OWNER | Consumer proof |
|---------|-----------|----------------|
| HOME ADMIN | `AdminStoresHomeShelvesPage.tsx` → `PUT/GET /api/admin/stores-home-shelves` | master-detail; no policy `<table>` |
| HOME STORAGE | `store_composition_policy_overrides` via `stores-home-shelf-product-db.ts` + composition CAS | shelves API only for product fields |
| HOME RESOLVER | `stores-home-shelf-product-resolve.ts` + `stores-composition-home-feed-meta.ts` → `meta.compositionPolicy.shelfProduct` | Hub reads `shelfProduct` |
| HOME PRESENTATION | Hub dispatch `StoresHomeCompositionSlotSection.renderFoodEntryCard` + `StoresHomePrimaryStoreRowListSection`; defaults from **catalog only** | map mirrors catalog (`catalogPresentation`) |
| HOME IMAGE (store slots) | `resolveHomeShelfStoreImage` | slot1 / slot6 pass `imageSource` |
| HOME IMAGE (food slots) | `resolveHomeShelfFoodEntryImage` | wired; `store_profile`/`brand_logo` still collapse to product/featured on food entries |
| HOME SHOW-ALL | `resolveHomeShelfShowAllHref` → `StoresHomeSectionShell` | enabled + routeKey ≠ `none` |
| HOME COUPON/AD BENEFIT | `resolveHomeShelfCardBenefit` → card `benefit` props | food_horizontal / high_rating / store_* / brand / timesale bind badge/line/sponsored |

**Composer data (ranking/IDs):** `stores-home-composer.ts` — unchanged by CMS entityType.

**Duplicate HOME writer:** `PUT /api/admin/stores-composition-policy` with `surface=home` returns **409** `use_stores_home_shelves`. Browse surface write may remain for legacy QA scripts; not Admin UI HOME path.

---

## 8–11. CATEGORY AUTHORITY (ONE OWNER EACH)

| Concern | ONE OWNER | Consumer proof |
|---------|-----------|----------------|
| CATEGORY ADMIN | `AdminStoresCategoryPolicyPage.tsx` | click → detail; secondary click-select |
| CATEGORY PRIMARY POLICY | `store_browse_scope_policy` primary `scope_key` | API GET/PUT |
| CATEGORY SECONDARY POLICY | same table `primary/sub` | override rows only |
| CATEGORY INHERIT RESOLVER | `resolveBrowseScopePolicy` + `isBrowseScopeSubOverrideRow` | sub → primary → platform; primary OFF wins |
| CATEGORY CARD | `StoreBrowseCategoryRowCard` | anatomy: menu band → promo → identity → meta → badges |
| CATEGORY COUPON/AD | `StoresBrowsePrimaryView` `campaignBenefit` on same row card | no text-box insertion cards |

**Inherit save:** Admin sends `deleteScopeKeys` for mode=inherit (no stub UPSERT).  
**Reload mode:** Admin GET sets `row` to null unless `isBrowseScopeSubOverrideRow`; client `row != null` ⇒ override.

**Taxonomy:** Admin GET loads DB via `loadStoreTaxonomyRows` + `mergeBrowsePrimaryIndustries` / `listBrowseSubIndustriesForPrimary`; seed fallback if empty.

---

## 12. HOME SHELF CATALOG (defaults)

Owner: `lib/stores/product/stores-home-shelf-product-catalog.ts`

| shelfId | composerSlot | entity | default presentation |
|---------|--------------|--------|----------------------|
| order_now | slot0Food | product | food_horizontal |
| main_stores | slot1Stores | store | timesale_vertical |
| popular | slot2Food | store | store_horizontal |
| delivery_fee_discount | slot3Food | store | timesale_vertical |
| high_rating | slot4Food | store | store_horizontal |
| fast_arrival | slot6NearbyStores | store | timesale_vertical |
| new_store | newStoreFood | store | store_teaser_horizontal |
| promo_campaign | campaignFood | brand | brand_circular |
| recommended | slot5Food | store | editorial_grid |
| rest_stores | slot6RestStores | store | timesale_vertical |
| praise_reviews / queue_popular / timesale_countdown | — | — | unavailable |

---

## 13. LEGACY / STALE

| Path | Status on HEAD |
|------|----------------|
| `StoresHomeInsertionRails.tsx` | **DELETED** |
| `StoreBrowseInsertionRowCards.tsx` | **DELETED** |
| `AdminStoresCompositionPolicyPage.tsx` | **DELETED** |
| `/admin/stores-composition-policy` page | redirect only |
| HOME PUT on composition-policy API | rejected (`use_stores_home_shelves`) |
| Planner slot names `future_ad_insertion` / `future_coupon_insertion` | internal planner ids only — not customer text cards |

---

## 14. INVARIANT TESTS / CONTRACT

| Gate | Command / file |
|------|----------------|
| Authority unit | `lib/stores/__tests__/stores-product-recovery-authority.test.ts` |
| Presentation map = catalog | `lib/stores/__tests__/stores-home-presentation-map.test.ts` |
| Static recovery contract | `node scripts/verify-stores-product-recovery-contract.cjs` |

---

## 15. KEEP / FIX / DELETE (as of this HEAD)

| Item | Action |
|------|--------|
| Shelves Admin/API/resolver/Hub | KEEP |
| Composer ranking / discovery / organic order / checkout redemption | KEEP |
| Category Admin + CAS delete + resolve + browse meta | KEEP |
| StoreBrowseCategoryRowCard integrated benefit | KEEP |
| Stale insertion rails / orphan composition Admin page | DELETED |
| Dual HOME write | REJECT on API |
| Food-path `store_profile`/`brand_logo` true logo authority | OPEN (collapses to product) — not claimed CLOSED for food image brand/profile |

---

## 16. STATUS SUMMARY (this HEAD only)

| Area | Status | Basis |
|------|--------|--------|
| HOME Admin menu + master-detail | **IMPLEMENTED** | menu + page + contract |
| HOME storage/resolver/showAll | **IMPLEMENTED** | API + Hub + tests |
| HOME PRODUCT/STORE/BRAND renderers | **IMPLEMENTED** | distinct components + benefit props |
| HOME store-slot imageSource + coupon/ad | **IMPLEMENTED** | PrimaryStoreRow + Timesale list wiring + tests |
| HOME food-slot imageSource brand/profile | **PARTIAL** | resolve collapses to product |
| HOME coupon/ad on food_horizontal/high_rating/editorial | **IMPLEMENTED** | benefit prop rendered |
| CATEGORY primary/secondary Admin | **IMPLEMENTED** | master-detail + deleteScopeKeys |
| CATEGORY inherit/override resolve + reload | **IMPLEMENTED** | `isBrowseScopeSubOverrideRow` + GET null stub |
| CATEGORY customer integrated coupon/ad | **IMPLEMENTED** | campaignBenefit on category row card |
| Duplicate HOME writer / stale live components | **CLEARED** | 409 + files deleted + contract |
| Production Customer QA | **NOT_RUN** | push + Vercel READY required first |

**HARD LOCK (code/static):** owners singular for listed concerns except food-path brand/profile image nuance.  
**PRODUCT CLOSED / QA PASS:** **NOT** claimed until Production QA + restore.

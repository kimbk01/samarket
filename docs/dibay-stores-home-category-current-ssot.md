# DIBAY STORES — HOME + CATEGORY CURRENT SSOT

**STATUS:** CURRENT FACT LOCK (audit of HEAD `f12b3c6ec` + WT dirty noted)  
**MODE:** Code/schema facts only — not intent, not historical PASS promotion  
**DATE:** 2026-08-24  
**AUTHORITY:** This document is the sole implementation/QA baseline until replaced by a newer HEAD audit.

---

## 1. CURRENT HEAD

| Field | Value |
|-------|--------|
| Commit | `f12b3c6ecd3ca549b383975683c1e9ff07af5432` |
| Message | `fix(stores): close Admin CMS right menu and HOME/CATEGORY wire` |
| Branch | `main` tracks `origin/main` |

**Working-tree note (not HEAD):** `app/api/admin/stores-category-policy/route.ts` has uncommitted GET override-filter + PUT `deleteScopeKeys` wiring. `OwnerProductsHubClient.tsx` unrelated dirty. Audit statuses below are **HEAD facts** unless marked WT.

---

## 2. CURRENT DB SCHEMA

### HOME storage

**Table:** `public.store_composition_policy_overrides`  
**Migrations:** `supabase/migrations/20260824120000_stores_composition_policy.sql`, `20260824130000_stores_composition_policy_surface_revision.sql`, `20260824170000_stores_product_recovery_policy.sql`, `20260824180000_stores_product_recovery_cms_extended.sql`

| Column | Role |
|--------|------|
| `surface`, `slot` | PK pair; HOME engine slot key |
| `shelf_id` | Owner shelf id (catalog) |
| `enabled`, `section_order`, `max_items` | Exposure |
| `title_ko/en`, `subtitle_ko/en` | Copy |
| `presentation_mode` | Presentation pattern id |
| `coupon_integration`, `ad_integration` | Card benefit modes |
| `schedule_start`, `schedule_end` | Window → `customerVisible` |
| `product_config` jsonb | entityType, showAll*, imageSource, badgeMode, benefitLineMode, reviewSnippetMode, operatorMemo |

**CAS surface revision:** `store_composition_policy_surface_revision` (HOME writes via shelves API).

### CATEGORY storage

**Table:** `public.store_browse_scope_policy` (`scope_key` PK)  
**Migrations:** `20260824170000_*`, `20260824190000_stores_browse_scope_product_config_cas.sql`, `20260824200000_stores_browse_scope_policy_cas_delete.sql`

| Column | Role |
|--------|------|
| `scope_key` | `primary` or `primary/sub` |
| `enabled` | Scope on/off |
| `display_title_ko/en` | Customer header |
| `ad_enabled`, `coupon_enabled` | `inherit` \| `true` \| `false` |
| `max_insertion`, `interval_every_n` | Insertion planner |
| `presentation_mode` | `inherit` \| `card_benefit_integrated` \| `hidden` |
| `schedule_*` | Window gate |
| `product_config` jsonb | e.g. `cardType` |

**CAS:** `save_store_browse_scope_policy_cas` (+ optional `p_delete_scope_keys`) + `store_browse_scope_policy_state.revision`.

---

## 3. ADMIN MENU AUTHORITY

| Surface | Path | Menu key | File |
|---------|------|----------|------|
| HOME | `/admin/stores-home-shelves` | `stores-home-shelves` | `components/admin/admin-menu.ts` |
| Category 1차 | `/admin/stores-category-policy?tier=primary` | `stores-category-primary` | same |
| Category 2차 | `/admin/stores-category-policy?tier=secondary` | `stores-category-secondary` | same |
| Ads | `/admin/store-insertions?focus=ads` | `store-ads-control` | same |
| Coupons | `/admin/store-insertions?focus=coupons` | `store-coupons-control` | same |
| Promo | `/admin/store-discovery` | `store-promo-control` | same |

**Delivery CMS rail:** `lib/admin/delivery-cms-nav.ts` + `components/admin/shell/AdminDeliveryCmsRightMenu.tsx`  
**Shell:** `components/admin/shell/AdminPlatformShell.tsx` when `isDeliveryCmsSurface`.

**Menu path:** `/admin` → 배달 → HOME 관리 / 카테고리 관리 — **not direct-URL-only**.

**NOT a live menu leaf:** orphan i18n key `stores-composition-policy`; page `app/admin/stores-composition-policy/page.tsx` → `permanentRedirect` to HOME shelves.

---

## 4. HOME SHELF CATALOG

**Owner:** `lib/stores/product/stores-home-shelf-product-catalog.ts`

| Owner name | shelfId | composerSlot | availability | default presentation | entityType |
|------------|---------|--------------|--------------|----------------------|------------|
| 지금 주문 가능 | `order_now` | `slot0Food` | available | `food_horizontal` | product |
| 매장 | `main_stores` | `slot1Stores` | available | `timesale_vertical` | store |
| 많이 주문하는 맛집 | `popular` | `slot2Food` | available | `store_horizontal` | store |
| 배달팁 할인 | `delivery_fee_discount` | `slot3Food` | partial | `timesale_vertical` | store |
| 평점 높은 가게 | `high_rating` | `slot4Food` | available | `store_horizontal` | store |
| 금방 도착 | `fast_arrival` | `slot6NearbyStores` | available | `timesale_vertical` | store |
| 신규 매장 | `new_store` | `newStoreFood` | available | `store_teaser_horizontal` | store |
| 할인/프로모션 | `promo_campaign` | `campaignFood` | available | `brand_circular` | brand |
| 추천 | `recommended` | `slot5Food` | available | `editorial_grid` | store |
| 더 많은 매장 | `rest_stores` | `slot6RestStores` | available | `timesale_vertical` | store |
| 칭찬 리뷰… / 줄 서는… / 타임세일 | `praise_reviews` / `queue_popular` / `timesale_countdown` | null | unavailable | n/a | — |

**Composer data authority:** `lib/stores/stores-home-composer.ts` via `composeLiveHomeFeed` — CMS `entityType` does **not** change ranking/data source.

---

## 5. HOME STORAGE AUTHORITY

| Role | Owner |
|------|--------|
| Admin read/write | `app/api/admin/stores-home-shelves/route.ts` |
| Product field upsert | `lib/stores/product/stores-home-shelf-product-db.ts` |
| Composition enable/order/max CAS | `lib/stores/composition/stores-composition-policy-db.ts` (via shelves PUT) |
| Customer attach | `lib/stores/composition/stores-composition-home-feed-meta.ts` → `meta.compositionPolicy.shelfProduct` |

**DUPLICATE WRITE SURFACE (live):** `app/api/admin/stores-composition-policy/route.ts` still writes same overrides table (no Admin UI page mounted; page redirects).

---

## 6. HOME RESOLVER

| Role | Owner |
|------|--------|
| Catalog + DB merge | `lib/stores/product/stores-home-shelf-product-resolve.ts` |
| Schedule → `customerVisible` | `lib/stores/product/stores-product-schedule-window.ts` |
| Section order | `lib/stores/composition/stores-composition-home-section-order.ts` |
| Live composition | `lib/stores/composition/stores-composition-live.ts` |
| Hub consumption | `components/stores/home/hub/StoresHomeHub.tsx` → `StoresHomeCompositionSlotSection` |

**slot1Stores / slot6\*:** still use composer store arrays; they **do** consume shelf CMS for title/subtitle/max/showAll/presentation via `shelfProduct` — not a separate Admin authority. Coupon/ad/imageSource on those store paths are **not** fully wired (see §7/§12/§14).

---

## 7. HOME PRESENTATION OWNER

| Role | Owner |
|------|--------|
| Dispatch (food slots) | `renderFoodEntryCard` in `components/stores/home/hub/StoresHomeCompositionSlotSection.tsx` |
| Store list presentation | `components/stores/home/hub/StoresHomePrimaryStoreRowListSection.tsx` |
| Patterns | `components/stores/home/presentation/*` |

| Pattern | Renderer | Anatomy | Coupon/ad benefit prop |
|---------|----------|---------|------------------------|
| `food_horizontal` / default | `StoresHomeFoodRailCard` | product image/name/price/store (+eta/rating/fee) | **NO** (benefit computed then dropped) |
| `store_horizontal` | `StoresHomeStoreHorizontalCard` | store image/name/rating/fee/ETA + benefit | YES |
| `brand_circular` | `StoresHomeBrandCircularCard` | circular logo/brand + promo line | YES |
| `high_rating_horizontal` | `StoresHomeHighRatingFoodCard` | high-rating food anatomy | **NO** |
| `store_teaser_horizontal` | `StoresHomeStoreTeaserCard` | teaser | YES (food path only) |
| `timesale_vertical` food slot | falls through to `food_horizontal` | — | N/A |
| `timesale_vertical` store slot | `StoresHomeTimesaleRowCard` | store vertical row | **NO** |
| `editorial_grid` | `StoresHomeFoodCard` grid | product grid | **NO** |

**DUPLICATE defaults:** `lib/stores/presentation/stores-home-presentation-map.ts` patternIds diverge from catalog (Hub uses shelf CMS / catalog, not this map).

---

## 8–10. CATEGORY PRIMARY / SECONDARY / INHERITANCE

| Role | Owner |
|------|--------|
| Admin UI | `components/admin/stores/AdminStoresCategoryPolicyPage.tsx` (master-detail; primary click → detail; secondary click-select) |
| API | `app/api/admin/stores-category-policy/route.ts` |
| Resolve | `lib/stores/product/stores-browse-scope-policy-catalog.ts` (`resolveBrowseScopePolicy`, `isBrowseScopeSubOverrideRow`) |
| Customer meta | `lib/stores/product/stores-browse-scope-customer-meta.ts` |
| Attach to browse | `lib/stores/composition/stores-composition-browse-insertion-meta.ts` |

**Inheritance (customer runtime):** sub override field → primary → platform default; primary `enabled=false` forces secondary off. Pure inherit stubs ignored by `isBrowseScopeSubOverrideRow`.

**Admin taxonomy source:** `listBrowsePrimaryIndustries()` / `listBrowseSubIndustries` from `lib/stores/browse-taxonomy-seed-queries.ts` — **not** live `GET /api/stores/taxonomy`.

**GAP — Admin inherit save (HEAD):** `onSaveAll` UPSERTs secondary rows with all-inherit fields when mode=inherit. Admin reload uses `row != null` → **override mode after inherit save** (FIRST DIVERGENCE). DB CAS already supports `p_delete_scope_keys`; Admin does not send deletes; HEAD API does not pass them (WT dirty adds pass-through only).

**Primary fields wired:** enabled, title, coupon, ad, max, interval, schedule, save, reload, preview. `presentationMode` hard-coded `card_benefit_integrated` on save (no Admin selector for `hidden`). `cardType` stored in `product_config` only.

---

## 11. CATEGORY CARD OWNER

| Role | Owner |
|------|--------|
| Customer list card | `components/stores/browse/StoreBrowseCategoryRowCard.tsx` |
| Browse view | `components/stores/browse/StoresBrowsePrimaryView.tsx` |
| Organic + insertion plan | `lib/stores/composition/stores-composition-insertion-live.ts` |

Anatomy KEEP: menu band → promo/benefit → identity → rating/meta → badges.

`cardType` → `data-browse-card-type` attribute only — **no anatomy branch**.

Coupon/ad rows use same `StoreBrowseCategoryRowCard` with `campaignBenefit` — not separate text-box cards in live browse path.

---

## 12. COUPON / AD PRESENTATION OWNER

| Surface | Owner |
|---------|--------|
| HOME card benefit resolve | `lib/stores/product/stores-home-shelf-card-benefit.ts` |
| HOME insertion meta | `lib/stores/composition/stores-composition-home-insertion-meta.ts` |
| CATEGORY benefit on row card | `StoresBrowsePrimaryView` → `campaignBenefit` |
| CATEGORY planner slot names | still `future_ad_insertion` / `future_coupon_insertion` |

**KEEP (not re-audited):** coupon writer, checkout, financial snapshot, redemption, paid-ad writer.

**STALE (file exists, Hub/Browse unimported):** `StoresHomeInsertionRails.tsx`, `StoreBrowseInsertionRowCards.tsx`.

---

## 13. SHOW-ALL CTA OWNER

| Role | Owner |
|------|--------|
| Config | `product_config.showAllEnabled` / `showAllLabel*` / `showAllRouteKey` |
| Href builder | `resolveHomeShelfShowAllHref` in `lib/stores/product/stores-home-shelf-product-config.ts` |
| Render | `StoresHomeSectionShell` `actionHref` / `actionLabel` |

Connected Admin → storage → resolver → Customer CTA when enabled and routeKey ≠ `none`.

---

## 14. IMAGE SOURCE OWNER

| Role | Owner | Fact |
|------|--------|------|
| Food path | `resolveHomeShelfFoodEntryImage` in `lib/stores/product/stores-home-shelf-image-resolve.ts` | Wired; `store_profile` / `brand_logo` collapse to product/featured images |
| Store list path | `resolveStoreShelfCardImageUrl` in `stores-home-store-to-shelf-entry.ts` | **Ignores** Admin `imageSource` |
| Unused helper | `resolveHomeShelfStoreImage` | Defined, **not** called from Hub |

---

## 15. LEGACY / STALE PATH

| Path | Status |
|------|--------|
| `/admin/stores-composition-policy` | Redirect → HOME shelves |
| `AdminStoresCompositionPolicyPage.tsx` | Orphan component |
| `/api/admin/stores-composition-policy` | Still writable (**DUPLICATE AUTHORITY**) |
| `StoresHomeInsertionRails` | Unimported (**STALE**) |
| `StoreBrowseInsertionRowCards` | Unimported (**STALE**) |
| `STORES_HOME_PRESENTATION_MAP` | Dual default authority vs catalog (**DUPLICATE** for defaults; Hub ignores map) |

---

## 16. KEEP / FIX / DELETE MATRIX

| Item | Action | Status after GAP |
|------|--------|------------------|
| HOME shelves Admin + API + shelfProduct meta | **KEEP** | kept |
| Catalog + composer data authorities | **KEEP** | kept |
| Category policy Admin + CAS + resolve + browse meta | **KEEP** | kept |
| `StoreBrowseCategoryRowCard` Baemin anatomy | **KEEP** | kept |
| Discovery ranking / organic order / checkout redemption | **KEEP** | kept |
| Secondary inherit: stop stub UPSERT; delete scopes; Admin mode = override-row detector | **FIX** | fixed |
| Food `timesale_vertical` dispatch | **FIX** | fixed → store_horizontal |
| Store-slot `imageSource` + coupon/ad benefit | **FIX** | fixed |
| PRODUCT/`food_horizontal` (+ high_rating/editorial/timesale) benefit binding | **FIX** | fixed |
| `cardType` consumer or remove Admin-only choices | **FIX** | removed Admin branch; cardType fixed `store` |
| Admin taxonomy seed vs live taxonomy | **FIX** | DB taxonomy + seed fallback |
| Dual composition-policy write API | **FIX** | HOME PUT → `use_stores_home_shelves` |
| Orphan InsertionRails / InsertionRowCards / CompositionPolicyPage | **DELETE** | deleted |
| Presentation-map defaults vs catalog | **FIX** | map mirrors catalog |

---

## AUDIT STATUS SUMMARY (PHASE 1 → after GAP)

| Area | Post-GAP status |
|------|-----------------|
| A. HOME Admin menu + master-detail + fields persist | **IMPLEMENTED** |
| B. HOME customer CMS wiring (incl. store slots image/benefit) | **IMPLEMENTED** |
| C. PRODUCT / STORE / BRAND anatomy | **IMPLEMENTED** |
| D. showAll + imageSource | **IMPLEMENTED** |
| E. HOME coupon/ad card binding | **IMPLEMENTED** |
| F–G. CATEGORY primary/secondary inherit | **IMPLEMENTED** |
| H. CATEGORY Customer integrated benefit | **IMPLEMENTED** |
| I. Duplicate/stale live paths | **CLEARED** (HOME write duplicate rejected; stale files deleted) |

**PHASE 1 AUDIT documented gaps; PHASE 3 GAP IMPLEMENTATION applied against this SSOT.**


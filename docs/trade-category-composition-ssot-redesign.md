# Trade Category Composition SSOT — Redesign LOCK

**Status:** Phase 0 LOCK (2026-08-17)  
**Mode:** Owner intent **B** — WRITE / LIST / DETAIL / ADMIN 재설계 (배관만으로 완료 금지)

## 1. Goal

카테고리 추가 시 전용 Write/List/Detail fork를 만들지 않는다.

```text
Field Library (Product) → Seed (+ Admin Overlay) → resolveTradeComposition
  → WRITE Generic(+legacy-look widgets)
  → LIST layoutVariant + composition attrs
  → DETAIL single projector
  → CTA / EDIT (same entry as WRITE)
```

## 2. Authority

| Concern | Owner |
|---------|--------|
| Field id / widget / storage / surfaces / option catalog | `lib/trade/category-form/field-library.ts` |
| Default field set + layoutVariant + behaviorAdapterId | `composition-seeds.ts` |
| active / required / order (+ approved id add/remove) | `category_settings.field_composition` |
| Resolve | `resolveTradeComposition` only |
| Mode visibility (buy/sell, hire/seek, deal_type) | `behavior-adapters.ts` (visible/required only) |
| CTA | `cta-policy.ts` |
| UI tone | DIBAY legacy — 당근/Marketplace = field contract only |

**Admin MUST NOT** store widget / storagePath / validator / CTA / layoutVariant in JSONB.

## 3. Profiles (6)

| profileId | layoutVariant | behaviorAdapterId |
|-----------|---------------|-------------------|
| general | general-card | null |
| used-car | vehicle-card | used-car-trade |
| real-estate | property-card | real-estate-deal |
| jobs | job-card | jobs-hire-seek |
| exchange | exchange-card | exchange-php-krw |
| rent-car | rental-card | rent-car-rental |

## 4. Completion definition

| Surface | Done when |
|---------|-----------|
| WRITE | No Jobs/Exchange/UsedCar full-form fork; Generic + widgets only; EDIT == WRITE entry |
| LIST | Home + favorites + category + related pass overlay; `rental-card` ≠ used-car |
| DETAIL | Spec block = single projector; no skin Meta if-tree for UsedCar/RE/Jobs |
| ADMIN | Overlay change observable on WRITE/LIST/DETAIL; new field types = Product PR only |
| Extend | 7th category = Library ± Seed ± Overlay — no new `*WriteForm.tsx` |

## 5. Phase order (mandatory)

0. This LOCK doc  
1. WRITE absorb: Jobs → Exchange → used-car → general chrome  
2. LIST unify: home/favorites wire + rental-card + layout if-tree shrink  
3. DETAIL unify: UsedCar/RE/Jobs → projector  
4. ADMIN verify matrix + category/chip data ops  
5. Delete legacy modules + close UI leaks  

## 6. DO NOT

- Call piping “재설계 완료”
- Reintroduce TradeCategoryWriteForm forks
- Grow Behavior Adapter into WriteModules
- Break trade home list invariants while wiring composition
- Claim rent-car menu exists from code seed alone

## 7. Track

Update this section when a phase completes (append-only).

| Phase | Status | Notes |
|-------|--------|-------|
| 0 LOCK | DONE | This file |
| 1 WRITE | DONE | Jobs/Exchange in shared shell. Jobs hire seed fields (`work_category`, `work_term`, `pay_type`, `pay_amount`) and Exchange `exchange_direction` now render through `GenericTradeWriteFields`; hire/seek extras remain shell-owned. Rent-car: `rental-car`→`rent-car` skin, auto title from model, title input hidden. |
| 2 LIST | DONE | Home/fav overlay + rental-card. Daily `/일` + with-driver chip. List preview now prefers `layoutVariant` and only uses legacy meta heuristics when `general-card` or `skinKey` is missing; `rental-card` wins over used-car. |
| 3 DETAIL | DONE | UsedCar + RealEstate + rent-car + Jobs core → `TradeCompositionDetailSection`. Jobs hire/seek extras in `JobsExtendedDetailExtras`. |
| 4 ADMIN | DONE | Surface matrix + rent-car subtype label/icon in menu form (`admin_cat_subtype_rent_car`). Create category with subtype rent-car + `show_in_home_chips` to expose menu. |
| 5 Legacy removal | DONE | Removed unused Job*DetailCards wrappers. Jobs/Exchange remain as Extended write bodies (intentional product extras + shell-owned submit). |

## 8. Ops — rent-car menu exposure

Code seed does **not** insert a DB category. Admin must:

1. Menus → Trade → add category subtype **렌터카** (`rent-car`)
2. Enable write + home chips as needed (`show_in_home_chips`)
3. Optionally save Field Composition (null = Product seed)

Without step 1–2, rent-car WRITE/LIST/DETAIL code exists but the chip/menu will not appear.

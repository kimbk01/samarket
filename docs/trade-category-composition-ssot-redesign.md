# Trade Category Composition SSOT — Redesign HARD LOCK

**Status:** §4 COMPLETION **PASS** · PATH B STRUCTURAL REDESIGN **COMPLETE** · **HARD LOCK (2026-08-17)**  
**Mode:** Owner intent **B** — WRITE / LIST / DETAIL / ADMIN composition authority (not piping-only)

> §4 PASS is **not** from legacy Track “Phase 1–5 DONE”. It is from §4 completion definition + code contracts + runtime/browser evidence below.

## 1. Goal

카테고리 추가 시 전용 Write/List/Detail fork를 만들지 않는다.

```text
Field Library (Product) → Seed (+ Admin Overlay) → resolveTradeComposition
  → WRITE Generic (+ reusable domain widgets)
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

## 4. Completion definition — **PASS (2026-08-17)**

| Surface | Status | Evidence |
|---------|--------|----------|
| WRITE | **PASS** | `TradeWriteForm` owns chrome, submit, composition resolve; Jobs/Exchange extras-only; UsedCar domain widgets ALLOW |
| LIST | **PASS** | home / fav / category / related composition wire; rent-car browser overlay |
| DETAIL | **PASS** | `resolveDetailSpecProfileId` → `TradeCompositionDetailSection` single projector; domain extras only |
| ADMIN overlay runtime | **PASS** | DB `field_composition` JSONB `{id,active,required,order}` → WRITE/LIST/DETAIL browser |
| 7th category | **PASS** | `seventh-category-anti-fork-contract.test.ts` |
| rent-car ops | **PASS** | DB category + home chip |

## 5. Runtime evidence (§4 — not Phase track)

### WRITE

- Common chrome / topic / title / location / description / images → `TradeWriteForm`
- Submit / `createPost` → shell only (`TradeExtendedWriteController` for Jobs/Exchange payload)
- Jobs / Exchange → domain extras only (no chrome slots)
- Used-car `UsedCarSellFields` / `UsedCarBuyFields` → domain widget; does **not** steal submit or detail spec
- Rent-car `/write/rent-car`: overlay `mileage_cap active:false` → 일일 주행 한도 hidden (browser)

### LIST

- Composition map: home / favorites / related (`useTradeListCompositionMap`)
- Rent-car post browser: overlay year OFF → `R4LD… · 2500`; year ON → `R4LD… · 2018 · 2500`; `mileage_cap` stays hidden

### DETAIL

- Single projector: `TradeCompositionDetailSection` + `formatCompositionDetailField`
- Real-estate page early-return removed; Jobs/RE/UsedCar remain domain widget / hero / CTA only
- Rent-car post browser: year OFF → pickup only; year ON → year visible; `mileage_cap` hidden throughout

### ADMIN overlay

- Stored: `category_settings.field_composition` on rent-car `e236ce0b-8dd1-4bff-83ae-79d36a1a0e9c`
- Contract: `{id, active, required, order}` only — no widget/storage/CTA in JSONB
- Persist path for proof: production contract JSONB (Admin UI click-save = separate surface QA)

### Rent-car ops

| Field | Value |
|-------|--------|
| id | `e236ce0b-8dd1-4bff-83ae-79d36a1a0e9c` |
| slug / icon_key | `rent-car` |
| name | 렌터카 / Rent a car |
| show_in_home_chips | true |
| Final overlay | year ON, mileage_cap OFF |
| Test posts | deleted after proof |

## 6. HARD LOCK — DO NOT (without reopen)

- Re-distribute composition authority (category-name if/switch as presentation owner)
- Reintroduce category-specific full `*WriteForm.tsx` forks
- Reintroduce UsedCar/RE/Jobs/Exchange **Detail spec MetaBlock if-trees**
- Store widget / storage / CTA / layoutVariant in Admin overlay JSONB
- Add 7th category via new WriteForm — use Library ± Seed ± Overlay + reusable domain widget
- Claim overlay changed live UI while DB `field_composition` is null for that category

**Reopen requires:** explicit product decision + new runtime evidence + doc amendment in §7.

## 7. Track (append-only)

| Gate | Status | Notes |
|------|--------|-------|
| Authority / seeds / resolve | DONE | |
| WRITE entry + one submit | DONE | |
| WRITE shell + domain extras/widgets | DONE | Used-car widgets = domain ALLOW |
| LIST home/fav/category/related | DONE | |
| DETAIL single projector | DONE | |
| ADMIN overlay runtime | DONE | Browser LIST/DETAIL/WRITE |
| 7th anti-fork contract | DONE | |
| rent-car ops | DONE | DB + chip |

### KNOWN FOLLOW-UP (NOT §4 blockers)

1. **Used-car WRITE overlay gap** — `UsedCarSellFields` / `UsedCarBuyFields` not via Field Library widget registry; some used-car fields do not follow WRITE overlay directly.
2. **Admin UI click-save QA** — overlay proof used same JSONB contract written to DB; Admin modal click path not separately exercised.

## 8. Ops — rent-car

DB row (not migration): id `e236ce0b-8dd1-4bff-83ae-79d36a1a0e9c`, slug/icon_key `rent-car`, `show_in_home_chips=true`, overlay stored.

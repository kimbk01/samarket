# DIBAY Marketplace CUT I HARD LOCK

**HARD LOCK (2026-08-18).** Do not reopen CUT I. Next work is a **separate cut only**.

## Baseline

```text
CUT I 6-PROFILE CATEGORY RUNTIME MATRIX: LOCKED

PRODUCT SHA:
023bb23a031e069afbb184f469e9060abcbd0b59

PRODUCTION:
dpl_CJHbp1PL3WFVLmWJN9hapKtWC4fg
https://samarket.vercel.app

RUNTIME:
6 profiles (general, used-car, real-estate, jobs, exchange, rent-car)
WRITE / LIST / DETAIL / FILTER surface matrix: PASS
WRITE submit chain (6 + used-car uc_buy): PASS
exchange.WRITE.converted: PASS
used-car.WRITE.uc_buy: PASS
FIRST BREAK: NONE

PRODUCT CODE MODIFIED DURING RUNTIME:
0

MIGRATION:
NO

CUT A / B / C / D / E / F / G / H / P0–P5:
PRESERVED

FINAL:
CUT I LOCKED
```

- Commit: `023bb23a031e069afbb184f469e9060abcbd0b59` (contract gate `54fa33721`; runtime on alias deploy above)
- Alias: `https://samarket.vercel.app`
- Deploy: Git Integration Production (`dpl_CJHbp1PL3WFVLmWJN9hapKtWC4fg`)

CLI `githubCommitSha` may be empty. LOCK authority is alias → this deployment plus Production runtime of CUT I behavior.

This cut proved **6-profile WRITE / LIST / DETAIL / FILTER** runtime parity on Production. It did **not** change composition SSOT (A), LIST sell-intent (B), SEARCH expansion (C), review UI (D), Buyer MY (E), promotion (F), heart/report/share (G), or HOME freshness (H).

## Product contract (KEEP)

```text
6 profiles: general, used-car, real-estate, jobs, exchange, rent-car
WRITE: TradeCategoryWriteForm + composition seeds + profile widgets (UsedCar*, Generic*, Jobs*, Exchange*)
LIST / FILTER: CompositionAttributeFilterSelects on category browse + SEARCH only (not HOME)
DETAIL: composition overlay + profile detail authority
used-car: sell + buy widgets KEEP (no Generic rewrite)
rent-car: UsedCarSellFields overlay + pickup / daily_price KEEP
CUT A root option authority KEEP
CUT H HOME CTA untouched
```

Authority: `lib/trade/category-form/resolve-composition.ts` · `composition-seeds.ts` · `composition-filter-query.ts` · `TradeCategoryWriteForm.tsx`.

## Production runtime

Evidence: `.qa-logs/cut-i-prod-runtime-2026-08-18T09-59-05-920Z/REPORT.json`

Supplementary (rent-car WRITE chain on Production): Playwright `RENT-CAR chain` in `tests/e2e/trade-category-form-runtime-closure.spec.ts` — PASS on alias (2026-08-18).

```text
FIRST BREAK: NONE
PRODUCT CODE MODIFIED DURING RUNTIME: 0
52 checks PASS (surface matrix + WRITE submit/list/detail + uc_buy + exchange converted)
```

## DO NOT (without an explicit new cut)

- Reopen CUT A–H inside CUT I work
- Start CUT J inside CUT I work
- Read child `field_composition` as option authority (CUT A)
- Replace UsedCar sell/buy widgets with Generic-only write for used-car
- Put composition attribute filters on HOME `/market` default list
- Touch Feed Banner / trade chat hot-path under CUT I scope

## Gate

```bash
npx vitest run lib/trade/__tests__/marketplace-cut-i-category-matrix.test.ts lib/trade/category-form/__tests__/r7-surface-matrix-contract.test.ts
```

## Next

A later marketplace cut is a **separate cut**. Do not reopen A–I.

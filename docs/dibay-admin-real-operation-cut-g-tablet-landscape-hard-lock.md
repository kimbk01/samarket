# DIBAY Admin Real Operation — CUT G TABLET LANDSCAPE RUNTIME

**Status:** HARD LOCK (CUT G)  
**Companion:** `lib/admin/admin-real-operation-cut-g-tablet-landscape-hard-lock.ts`  
**Probe:** `PLAYWRIGHT_BASE_URL=… node scripts/qa/admin-cut-g-tablet-landscape-runtime.mjs`  
**Evidence:** `docs/perf/admin-cut-g-tablet-landscape-runtime/cut-g-report.json`  
**Depends on:** CUT A–F (do not squash)

## Purpose

Prove Admin A–F surfaces are **usable** at Tablet Landscape runtime — not that responsive classes exist.

## Viewport authority

| Field | Value |
|---|---|
| Token | `--sam-bp-lg-min` (`app/design-tokens.css`) |
| Probe | **1024×768** landscape |
| Emulation | Playwright Chromium viewport (not physical iPad unless stated) |

`CODE_READY` / `lg:grid` ≠ PASS.

## PASS requires runtime evidence

- No document-level horizontal overflow
- Primary CTA reachable
- Sidebar/main no destructive overlap
- Placement Map selector/list/detail usable
- Navigation memory + Placement deep-links
- Modal/dropdown contained when present

Unmeasured routes = **NOT_PROVEN**. Missing safe entity = **BLOCKED** (not FAIL).

## Carry (locked)

Finance/Ads/Support/Partner Production live remain **NOT_PROVEN** / **PARTIAL**.

**CUT F P1** (Placement Map ACTIVE + eligibility live data) → prove in **CUT I** (ACTIVE ad → Map → execution/creative/eligibility → app exposure). Do not drop.

## Forbidden

New tablet Admin shell · broad CSS rewrite · domain mutation changes · Production deploy claim from local probe.

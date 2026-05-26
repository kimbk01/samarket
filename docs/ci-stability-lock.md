# CI stability lock

Recurring CI failures on `main` were traced to three areas. This doc describes the locks added so they do not silently regress.

## 1. Bundle size (`check:bundle`)

**Problem:** A single hard-coded KB cap (14 000 → 16 000) broke on every large feature merge with no review path.

**Lock:**

- Committed baseline: `scripts/bundle-budget-baseline.json`
- Check: `npm run check:bundle` (after `npm run build` in CI)
- Rule: current build must be ≤ **baseline + growth_slack_kb** per metric
- Intentional growth: `npm run build && npm run check:bundle:update-baseline`, then commit the JSON with PR notes

Default slack (KB):

| Metric | Slack |
|--------|-------|
| total client js | 500 |
| messenger home | 200 |
| messenger room | 200 |
| messenger call | 300 |

## 2. TypeScript in tests

**Problem:** `vi.stubGlobal("window", …)` and Playwright `page.evaluate` `globalThis` bags failed `tsc --noEmit`.

**Lock:**

- `lib/test-utils/vitest-minimal-window.ts` — window stub for Vitest
- `lib/test-utils/e2e-app-wide-phase-global.ts` — typed `__samarketAppWidePhaseLastMs` helpers for E2E

Use these instead of ad-hoc `as any` casts in new tests.

## 3. Stores home structural contract

**Problem:** Perf refactors broke hub shell / category markers without unit test coverage.

**Lock:** `npm run verify:stores-home-hub-contract` (also in `npm run check` and `verify:ci-stability`).

## Commands

| Command | When |
|---------|------|
| `npm run verify:ci-stability` | Before push (fast, no build) |
| `npm run ci` | Same as CI (`check` = routes + contracts + tsc + lint + test + build + bundle lock) |
| `npm run check:bundle:update-baseline` | After an intentional bundle increase |

# Pretendard Dynamic Subset Font Performance Check

Date: 2026-05-09

## Scope

This round checks whether the current Pretendard dynamic subset import blocks mobile perceived performance.

Kept unchanged:

- `app/globals.css` keeps `@import "../node_modules/pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";`
- No switch to single `pretendardvariable.css`
- No `next/font/local` conversion
- No design, font-size, or typography changes

Raw output: [`font-performance-check.raw.json`](./font-performance-check.raw.json)

## Method

- Tool: Playwright Chromium
- Profile: mobile 360 x 740, DPR 3
- Runs: 3 per page
- Wait: `domcontentloaded` + `networkidle` + 5s post-wait for late font downloads
- Base URL: `http://localhost:3000`
- Auth note: automatic test login is currently disabled (`/api/test-login` returns 410), and password login with the seeded test credentials did not complete in this environment. Measurement used a fake Supabase auth cookie to pass the HTML proxy gate. API-level authenticated data may still be absent, so this result is valid for font/CSS critical-path inspection, not authenticated data completeness.

## Summary

| Page | Final URL / Status | FCP median | LCP median | TTFB median | Font requests | Font transfer | Render-blocking CSS | Font in LCP critical path | Duplicate woff2 |
|---|---:|---:|---:|---:|---:|---:|---:|---|---|
| `/home` | `/home` / 404 | 140ms | 140ms | 68ms | 0 | 0 B | 1 | No | No |
| `/stores` | `/stores` / 200 | 2836ms | 3172ms | 2612ms | 0 | 0 B | 2 | No | No |
| `/community-messenger` | `/community-messenger` / 200 | 6104ms | 9968ms | 5452ms | 0 | 0 B | 3 | No | No |
| `/mypage` | `/mypage` / 200 | 880ms | 880ms | 667ms | 0 | 0 B | 2 | No | No |

Notes:

- `/home` currently returns the app 404 page in this environment. It is kept in the table because it was part of the requested page list, but it should not be used as a product-route performance conclusion.
- Playwright did not observe any `PretendardVariable.subset.*.woff2` network request on these measured routes, even with a 5s post-network idle wait.
- The browser warning seen manually in DevTools (`downloadable font: name records are not sorted`) can still appear in Edge/Firefox when a subset file is downloaded, but the measured mobile Chromium path did not place those files on the LCP critical path.
- Render-blocking resources observed were Next CSS chunks (`layout.css?...`), not the Pretendard woff2 files.

## Page Details

### `/home`

- Measured page: `/home`
- Final status: 404 app page
- FCP/LCP: median 140ms / 140ms
- Font request count: 0
- Font transfer size: 0 B
- LCP critical path: no Pretendard font resource observed
- Conclusion: route status makes this page invalid for product performance; no font bottleneck observed.

### `/stores`

- Measured page: `/stores`
- FCP/LCP: median 2836ms / 3172ms
- TTFB: median 2612ms
- Font request count: 0
- Font transfer size: 0 B
- LCP critical path: no Pretendard font resource observed
- Duplicate woff2: none
- Conclusion: keep Pretendard dynamic subset. Current measured delay is server/CSS/route work, not font transfer.

### `/community-messenger`

- Measured page: `/community-messenger`
- FCP/LCP: median 6104ms / 9968ms
- TTFB: median 5452ms
- Font request count: 0
- Font transfer size: 0 B
- LCP critical path: no Pretendard font resource observed
- Duplicate woff2: none
- Conclusion: keep Pretendard dynamic subset. The route is dominated by non-font latency under the proxy-pass measurement mode.

### `/mypage`

- Measured page: `/mypage`
- FCP/LCP: median 880ms / 880ms
- TTFB: median 667ms
- Font request count: 0
- Font transfer size: 0 B
- LCP critical path: no Pretendard font resource observed
- Duplicate woff2: none
- Conclusion: keep Pretendard dynamic subset.

## Decision

**Keep the current Pretendard dynamic subset import.**

Reasoning:

- Pretendard subset requests were not observed in the measured LCP critical path.
- No duplicate `PretendardVariable.subset.*.woff2` downloads were observed.
- Total measured Pretendard font transfer size was 0 B in Playwright mobile runs.
- The current CSS uses `font-display: swap`, so even when a subset is downloaded in manual browsers, it should not block first text paint in the same way a blocking webfont would.
- Switching to the single variable CSS remains prohibited for this round because it increases initial font payload.
- `next/font/local` regeneration should only be revisited if a real browser trace with an authenticated session proves Pretendard is on the LCP critical path.

## Next Valid Follow-up

If font warnings need another pass later, capture a real Chrome/Edge Performance trace from the already logged-in browser session and verify:

- `PretendardVariable.subset.*.woff2` response end relative to LCP
- whether LCP element is text using Pretendard
- whether the same subset file is fetched more than once without cache reuse

Until then, treat the warning as a known harmless console warning and keep focusing on blocking errors, Supabase Security Advisor items, API 4xx/5xx, and Realtime failures.

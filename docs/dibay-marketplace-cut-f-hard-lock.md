# DIBAY Marketplace CUT F HARD LOCK

**HARD LOCK (2026-08-18).** Do not reopen CUT F. Next work is a **separate cut only** (CUT G).

## Baseline

```text
CUT F SELLER PROMOTION UNIFICATION: LOCKED

PRODUCT SHA:
c85f47e8e1fabd3a8d8a9027edd1ae045b16ef49

PRODUCTION:
dpl_Ec8MmHhcSDqZf3VcSZ8BzmLc7CLD
https://samarket.vercel.app

RUNTIME:
LIST PIN (page=1 ≤3, page=2 prepend 0): PASS
SEARCH PIN 0: PASS
SEARCH ORDER UNCHANGED: PASS
SEARCH PROMO BADGE: PASS
DETAIL CTA PRODUCT A: PASS
trade-ads/apply CALLS: 0
PRODUCT A ROUNDTRIP: PASS (sheet + GET promotion-orders; no spend)
FEED BANNER: PASS
CUT B / C / E: PASS
FIRST BREAK: NONE

PRODUCT CODE MODIFIED DURING RUNTIME:
0

MIGRATION:
NO

CUT A / B / C / D / E / P0–P5:
PRESERVED

FINAL:
CUT F LOCKED
```

- Commit: `c85f47e8e1fabd3a8d8a9027edd1ae045b16ef49`
- Alias: `https://samarket.vercel.app`
- Deploy: Git Integration Production (`dpl_Ec8MmHhcSDqZf3VcSZ8BzmLc7CLD`)

CLI `githubCommitSha` may be empty. LOCK authority is alias → this deployment plus Production runtime of CUT F behavior. `c85f47e8e` remains the product SHA even if a later QA commit sits on `origin/main`.

This cut unified **Marketplace seller promotion** as Product A. It did **not** delete `trade_post_ads`, Admin trade-post-ads, Feed Banner, or CUT C search rank.

## Product contract (KEEP)

```text
LIST / CATEGORY BROWSE (no q)
  → Product A pin ≤3 on request page=1 (pageIndex 0)
  → page=2+ prepend 0
  → 홍보 badge on promoted rows only

SEARCH (q present)
  → no pin prepend
  → CUT C T1→T2→T3→T4 order unchanged
  → badge only on entitlements already in the ranked window

DETAIL
  → CTA 더 알리기 → MemberPostPromoteSheet → point_promotion_orders
  → trade-ads/apply not a member product path

Feed Banner: DO NOT TOUCH
trade_post_ads backend/Admin: KEEP (dead-code fate = CUT J)
```

Authority: `lib/promotion/feed-promotion-projection.ts` (`tradePromotionPageIndexFromRequestPage`, `overlayTradePromotionBadges`) · `lib/posts/home-posts-route-core.ts` · `components/post/MemberPostPromoteSheet.tsx`.

## Production runtime

Evidence: `.qa-logs/cut-f-prod-runtime-2026-08-18T01-12-45-756Z/REPORT.json`

```text
FIRST BREAK: NONE
PRODUCT CODE MODIFIED DURING RUNTIME: 0
```

Live `point_promotion_orders` entitlement count at probe time was 0. LIST pin ≤3 and SEARCH badge-without-reorder still held (no false overlay, no pin prepend). DETAIL Product A was proven on an owned listing.

## DO NOT (without an explicit new cut)

- Prepend Product A pins onto SEARCH / CUT C ranked windows
- Restore DETAIL CTA to `trade-ads/apply` / `TradePostAdApplySheet`
- 410/delete `trade_post_ads` under CUT F
- Touch Feed Banner product / slot cadence
- Reopen CUT A–E inside CUT F work
- Start CUT G (favorite/report) inside a CUT F change

## Gate

```bash
npx vitest run lib/promotion/__tests__/promotion-feed-contract.test.ts lib/promotion/__tests__/list-search-promo-badge-single-render.test.ts lib/search/__tests__/post-with-meta-to-product.test.ts lib/trade/marketplace/__tests__/sell-intent-list-ssot.test.ts lib/trade/marketplace/__tests__/search-relevance-rank.test.ts lib/mypage/__tests__/slice5-activity-route-merge.test.ts
```

## Next

CUT G (favorite / report integrity) is a **separate cut**. Do not reopen A–F.

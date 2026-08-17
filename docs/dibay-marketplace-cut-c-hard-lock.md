# DIBAY Marketplace CUT C HARD LOCK

**HARD LOCK (2026-08-18).** Do not reopen CUT C. Next work is a **separate cut only**.

## Baseline

```text
DIBAY MARKETPLACE CUT C

PRODUCTION SHA:
1afedf38e14d45839ac13e9eb5e6a1618c247bf2

T1 EXACT / CONTAINS:
LOCKED

T2 ATTRIBUTE / TOKEN EXPANSION:
LOCKED

T3 SAME-LOCATION RELATED:
LOCKED

T4 GLOBAL RELATED:
LOCKED

T3 → T4 ORDER:
LOCKED

UNRELATED EXCLUSION:
LOCKED

MIGRATION:
NO

CUT A / CUT B / P0-P5:
PRESERVED

50+ WINDOW PAGINATION:
NOT_PROVEN — non-blocking

RUNTIME QUERY COUNT <= 3:
NOT_PROVEN — code contract only; non-blocking

FINAL:
CUT C LOCKED
```

- Commit: `1afedf38e14d45839ac13e9eb5e6a1618c247bf2`
- Alias: `https://samarket.vercel.app`
- Deploy: Git Integration Production (`dpl_4xgf6HmYVHJocNoUuUnvyWfrxzAk`)

This cut is **SEARCH candidate expansion + tier ranking**. It did not add a search table, vector/fuzzy index, or DETAIL similar-posts as SEARCH.

## Product contract (KEEP)

```text
SEARCH q + latest/newest
  T1 = title exact / prefix / contains
  T2 = strong related (title token / make / model / car_model)
  T3 = same-location looser related (e.g. body_type) — not every local listing
  T4 = global looser related
  unrelated (same-city fridge on a Fortuner query) = excluded

location is a T3/T4 axis, not a dump of all local posts
explicit filters stay AND: category / price / composition / sell-intent / status
ranked window cache key has NO page
page1/page2 slice the same window
continuation cursors stay independent (T1 exhausted does not kill T2/T3/T4)
distance / popular sort = unchanged
```

Authority: `lib/trade/marketplace/search-candidate-expansion.ts` · `lib/trade/marketplace/search-ranked-window-cache.ts`.
Wired through `lib/posts/home-posts-query-server.ts` · `lib/posts/home-posts-route-core.ts`.

## Production runtime (expansion)

Temporary fixtures (created then deleted) on Production:

```text
q=Toyota Fortuner  location=city&lgu=pasig

1 Toyota Fortuner                         T1 Pasig
2 CUTC-RT-20260818 T2 Diesel 2022         T2 car_model, no title phrase
3 CUTC-RT-20260818 T3 Montero Sport       T3 body_type=suv, Pasig
4 CUTC-RT-20260818 T4 Davao SUV           T4 body_type=suv, Davao
fridge Pasig                              not in results
```

Duplicate IDs: 0. Product code modified during runtime: 0.

## DO NOT (without an explicit new cut)

- Restore title `ILIKE %q%` as the only SEARCH candidate gate
- 0..1999 full scan as SEARCH pagination
- Treat a short ranked window as search exhaustion
- Put `page` on the ranked window cache key
- New search table / migration / vector / fuzzy index
- Reuse DETAIL similar-posts as SEARCH
- Client page-1 filtering
- Reopen CUT A or CUT B inside CUT C work
- Start CUT D (or later) inside a CUT C change
- Force 50+ pagination or HTTP query-count rows to PASS without new evidence

## Next

Later marketplace cuts are **separate**. Do not reopen A / B / C.

# DIBAY Marketplace CUT G HARD LOCK

**HARD LOCK (2026-08-18).** Do not reopen CUT G. Next work is a **separate cut only**.

## Baseline

```text
CUT G FAVORITE / REPORT / DETAIL SHARE: LOCKED

PRODUCT SHA:
637c42a10a0b12fdf218110d3c8dece8cb7b712b

PRODUCTION:
dpl_7vWnF25rvFYdQh1thGuEF62yx88k
https://samarket.vercel.app

RUNTIME:
LIST / SEARCH HEART TOGGLE → /api/favorites/toggle: PASS
LIST / SEARCH / DETAIL 관심 N REMOVED: PASS
LIST + DETAIL ReportReasonModal: PASS
SEARCH 신고하기 ABSENT: PASS
DETAIL 공유하기: PASS
DETAIL CHAT CTA: PASS
FIRST BREAK: NONE

PRODUCT CODE MODIFIED DURING RUNTIME:
0

MIGRATION:
NO

CUT A / B / C / D / E / F / P0–P5:
PRESERVED

FINAL:
CUT G LOCKED
```

- Commit: `637c42a10a0b12fdf218110d3c8dece8cb7b712b`
- Alias: `https://samarket.vercel.app`
- Deploy: Git Integration Production (`dpl_7vWnF25rvFYdQh1thGuEF62yx88k`)

CLI `githubCommitSha` may be empty. LOCK authority is alias → this deployment plus Production runtime of CUT G behavior. `637c42a10` remains the product SHA even if a later commit sits on `origin/main`.

This cut unified **Marketplace heart boolean parity**, **LIST+DETAIL structured report**, and **DETAIL share**. It did **not** add a `posts.favorite_count` writer, SEARCH report, report dedup, or Feed Banner / chat-hot-path change.

## Product contract (KEEP)

```text
FAVORITE:
  LIST / SEARCH / DETAIL / MY → same toggleFavorite + POST_FAVORITE_CHANGED_EVENT
  product = heart boolean, not social-proof count

favorite_count CASE B then CASE 1:
  truth = favorites table
  no trigger / RPC / toggle UPDATE of posts.favorite_count
  member LIST / SEARCH / DETAIL do not render posts.favorite_count / 관심 N
  MY hub “내가 찜한 개수” = live favorites-row count for the user — KEEP

REPORT:
  LIST + DETAIL → ReportReasonModal
  SEARCH → report after DETAIL entry
  MY → no extra report surface
  /api/reports writer KEEP
  HARD DEDUP NOT_PROVEN — do not add precheck-409

DETAIL 4축:
  찜 + 신고 + 공유 + 채팅
  share = navigator.share else copy canonical /post/[id]
```

Authority: `lib/favorites/toggleFavorite.ts` · `lib/favorites/post-favorite-events.ts` · `components/post/ReportReasonModal.tsx` · `lib/trade/share-trade-listing.ts`.

## Production runtime

Evidence: `.qa-logs/cut-g-prod-runtime-2026-08-18T02-15-25-174Z/REPORT.json`

```text
FIRST BREAK: NONE
PRODUCT CODE MODIFIED DURING RUNTIME: 0
```

Runtime proved heart toggle on LIST and SEARCH, no 관심 N on LIST/SEARCH/DETAIL, LIST+DETAIL same report sheet, DETAIL share, and Chat CTA still present. It did **not** prove favorite_count batch projection, report unique-constraint dedup, SEARCH report button, or Admin/store counts.

## DO NOT (without an explicit new cut)

- Restore member `posts.favorite_count` / 관심 N
- Add a `posts.favorite_count` column writer
- Batch `favorites(count)` onto LIST select
- Add SEARCH report button or MY extra report surface
- Add `/api/reports` precheck-409 / unique-constraint dedup
- Redesign community/store share
- Touch Feed Banner or trade chat hot-path / `getItemDetailPageData` related bundle
- Reopen CUT A–F inside CUT G work
- Start CUT H inside a CUT G change

## Gate

```bash
npx vitest run lib/trade/__tests__/marketplace-cut-g-favorite-report-share.test.ts
```

## Next

A later marketplace cut is a **separate cut**. Do not reopen A–G.

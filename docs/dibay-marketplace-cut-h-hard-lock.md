# DIBAY Marketplace CUT H HARD LOCK

**HARD LOCK (2026-08-18).** Do not reopen CUT H. Next work is a **separate cut only**.

## Baseline

```text
CUT H HOME LIST FRESHNESS: LOCKED

PRODUCT SHA:
e74a5775f61d6c45e6271e43beb4efdcb5fa616b

PRODUCTION:
dpl_2C5bCtmGtuwMiYyS1uSwoRSYpxKK
https://samarket.vercel.app

RUNTIME:
SILENT no-unshift: PASS
CTA N=1 then apply latest page-1: PASS
PTR applies latest without waiting for CTA: PASS
CUT F pin: PASS (no 홍보 regression)
FIRST BREAK: NONE

PRODUCT CODE MODIFIED DURING RUNTIME:
0

MIGRATION:
NO

CUT A / B / C / D / E / F / G / P0–P5:
PRESERVED

FINAL:
CUT H LOCKED
```

- Commit: `e74a5775f61d6c45e6271e43beb4efdcb5fa616b`
- Alias: `https://samarket.vercel.app`
- Deploy: Git Integration Production (`dpl_2C5bCtmGtuwMiYyS1uSwoRSYpxKK`)

CLI `githubCommitSha` may be empty. LOCK authority is alias → this deployment plus Production runtime of CUT H behavior. `e74a5775f` remains the product SHA even if a later commit sits on `origin/main`.

This cut changed **HOME `/market` latest-list freshness** (keep in-view order until CTA/PTR). It did **not** change SEARCH (C), LIST sell-intent (B), taxonomy (A), review UI (D), Buyer MY (E), seller promotion (F), or heart/report/share (G).

## Product contract (KEEP)

```text
HOME /market only
created_at latest 유지
silent = 현재 순서 유지 (in-place field patch only)
자동 unshift 없음
N = unique incoming page-1 ids not on the applied list
N cap 없음
CTA → latest page-1 적용
PTR → 즉시 latest 적용 (CTA 대기 없음)
same-session write invalidate 유지
CUT F pin ≤3 유지
SEARCH untouched
category browse untouched
Realtime 0
bumped_at untouched
```

Authority: `lib/trade/marketplace/home-list-freshness.ts` · `components/home/HomeProductList.tsx`.

## Production runtime

Evidence: `.qa-logs/cut-h-prod-runtime-2026-08-18T04-25-12-962Z/REPORT.json`

```text
FIRST BREAK: NONE
PRODUCT CODE MODIFIED DURING RUNTIME: 0
```

Runtime proved: other-session new listing does not shove the current HOME list; CTA shows N=1; tap applies latest page-1; PTR applies a second new listing without waiting for CTA; CUT F pin copy did not regress.

## DO NOT (without an explicit new cut)

- Auto-unshift / replace HOME list order from silent refresh
- Cap pending N at 7 (or any display cap) as product default
- Count duplicate pin ids or dropped sold/hidden rows as new listings
- Let a stale silent response overwrite newer pending N or applied page-1
- Add Realtime or `bumped_at` as HOME LIST order
- Put CUT H CTA on category browse or SEARCH
- Reopen CUT A–G inside CUT H work
- Start CUT I inside a CUT H change

## Gate

```bash
npx vitest run lib/trade/marketplace/__tests__/marketplace-cut-h-freshness.test.ts
```

## Next

A later marketplace cut is a **separate cut**. Do not reopen A–H.

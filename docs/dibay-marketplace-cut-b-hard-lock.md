# DIBAY Marketplace CUT B HARD LOCK

**HARD LOCK (2026-08-18).** Do not reopen CUT B. Next work is a **separate cut only**.

## Baseline

```text
DIBAY MARKETPLACE CUT B

PRODUCTION SHA:
0a0958c9f63693dd185e53340b7d4229c5c67722

SELL-SIDE LIST DEFAULT:
LOCKED

EXPLICIT OPPOSITE INTENT:
REACHABLE (삽니다 / 구직 / 페소 삽니다)

LEGACY NULL META:
COUNTS AS SELL-SIDE (exclude opposite, do not eq sell)

HOME / NO-CATEGORY SEARCH:
SELL-CENTERED MIXED DISCOVERY

TOPIC SCOPE:
used-car / jobs / exchange only — realty and rent-car unchanged

MIGRATION:
NO

CUT A / P0-P5 / PREVIOUS LOCKS:
PRESERVED

FINAL:
CUT B LOCKED
```

- Commit: `0a0958c9f63693dd185e53340b7d4229c5c67722`
- Alias: `https://samarket.vercel.app`
- Deploy: Git Integration Production (`dpl_F1JByRDbb5fbCMSzkdQSdtVCHpwa`)

This cut is **discovery default = sell-side**. It did not delete 삽니다 / 구직 / 페소 삽니다 as product features.

## Product contract (KEEP)

```text
HOME / SEARCH without trade parent
  = exclude car_trade=buy, listing_kind=work (and job_type=seek), exchange_direction=buy

중고차 LIST/SEARCH
  default / car_trade=sell → exclude buy (null meta stays)
  car_trade=buy            → buy only
  never stack default exclude + explicit buy

일자리 LIST/SEARCH
  default / listing_kind=hire → exclude 구직
  listing_kind=work           → 구직 only (incl. legacy job_type=seek)

환전 LIST/SEARCH
  default / exchange_direction=sell → exclude 페소 삽니다
  exchange_direction=buy            → 페소 삽니다 only

부동산 / 렌터카
  = no CUT B intent clause
```

Authority: `lib/trade/marketplace/sell-intent-list-ssot.ts`.
Server LIST only. No client page-1 slice. No SEARCH ranking (CUT C).

## DO NOT (without an explicit new cut)

- Default LIST with `eq sell` / `eq hire` (drops legacy null meta)
- Stack mixed-discovery exclude with explicit opposite intent on the same query
- Delete 삽니다 / 구직 / 페소 삽니다 WRITE or hide those filters on their topics
- Apply car_trade / listing_kind / exchange_direction intent to 부동산 or 렌터카
- Delete 부동산 / 일자리 / 환전 topics
- Start CUT C (or later) inside a CUT B change
- Declare a later marketplace cut LOCKED without that cut’s own Production runtime

## Next

CUT C — SEARCH ranking — is a **separate cut**. Not opened by this lock.

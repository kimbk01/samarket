# DIBAY Marketplace Trade Guest Location HARD LOCK

**HARD LOCK (2026-08-22).** Do not reopen guest nationwide browse. Next change is a **separate cut only**.

## Baseline

```text
DIBAY MARKETPLACE TRADE GUEST LOCATION

GUEST UNSET /market HYDRATE:
confirmed guest + address-defaults 401/403 → location=all (ALL)

GUEST CONFIRMATION (not blind 401):
anonymous boot OR terminal guest — NOT recoverable boot race

GUEST HEADER AFTER HYDRATE:
전체 (not 지역을 확인하는 중… stuck)

GUEST FEED:
location=all nationwide fetch enabled

LOGGED-IN UNSET HYDRATE:
master CITY first; no master → ALL; LGU fail → ALL

TRANSIENT address-defaults !ok (not 401/403):
UNSET + boot retry — no silent ALL

MIGRATION:
NO

CUT A–J / UI-1–6 / P0–P5:
PRESERVED

FINAL:
TRADE GUEST LOCATION LOCKED
```

## Product contract (KEEP)

```text
/m market with no location query (UNSET)
  guest  → after boot anonymous (or terminal guest), hydrate writes location=all
  member → master CITY (+ distance 전체) or ALL when no master / LGU fail

401 alone is NOT guest proof:
  recoverable boot / session restore → UNSET + boot retry (stores CUT-B1 parity)

Explicit location=all remains the only ALL authority in URL parse,
but confirmed guest hydrate MUST commit ALL onto the URL on first entry.
```

## Authority

- `lib/trade/location/trade-marketplace-address-defaults-hydrate-scope.ts` — guest 401/403 → ALL SSOT
- `lib/trade/location/resolve-trade-marketplace-default-city.ts` — hydrate caller
- `lib/trade/location/use-trade-marketplace-location-hydrate.ts` — URL replace
- `lib/trade/marketplace/client-location-fetch.ts` — unset blocks fetch until hydrate commits

## DO NOT (without a new cut)

- Map guest address-defaults 401/403 back to UNSET **without** guest confirmation
- Treat raw 401 as ALL during recoverable boot (logged-in master seed regression)
- Show "지역을 확인하는 중…" as the steady guest browse state
- Block guest feed fetch while UNSET without committing ALL
- Remove or bypass `tradeMarketplaceHydrateScopeBeforeMasterResolution` in hydrate
- Reopen master-seed work (13daf285b) to break guest ALL parity

## Verification

```bash
npx vitest run lib/trade/location/__tests__/trade-marketplace-guest-location-hydrate.test.ts
npx vitest run lib/trade/marketplace/__tests__/marketplace-browse-wiring-contract.test.ts
```

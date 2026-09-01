# DIBAY Currency Visual Surface Matrix

Companion to `docs/dibay-currency-ssot-hard-lock.md`.  
**Purpose:** route-level inventory for visual + authority migration.

| Route | Component | Current label | Current visual | Current authority | Target currency | Target variant | Action |
|---|---|---|---|---|---|---|---|
| `/mypage/points` | `PointBalanceCard` | Point | Blue | POINT | point | Blue | KEEP |
| `/mypage` | `MyPointCard` | points card | signature purple `P` | POINT | point | Blue | REPLACE |
| `/stores/owner/points` | historical route tombstone | none | none | historical only | none | none | NO UI / NAV |
| `/stores/owner/business-cash` | compatibility route only | none | none | canonical Cash + Coin | cash + coin | Green + Gold | NO LEGACY LABEL / NAV; Finance only |
| `/stores/owner/finance` | `OwnerStoreFinanceView` | Coin / Cash | currency cards | AST-004 + AST-005 | coin + cash | Gold + Green | KEEP (CUT 4) |
| `/stores/owner/ads` | `OwnerDeliveryAdsHubView` | Cash | Green cash context | AST-005 | cash consumer | Green snippet | KEEP AS CONSUMER |
| `/stores/owner/settlements` | `OwnerStoreSettlementsView` | settlement PHP | neutral list | settlement | coin source | context | RENAME |
| `/stores/owner/gift-certificates` | gift revenue UI | gift revenue | separate card | gift ledger | coin inflow | Gold | REPLACE |
| `/admin/store-points` | historical route tombstone | none | none | historical only | none | none | NO UI / NAV |
| `/admin/business-cash-charges` | compatibility route | Cash | admin queue | AST-005 | cash | Green badge | NO LEGACY LABEL / NAV |
| `/admin/gift-certificates/cash-outs` | `AdminGiftMoneyPanel` | external cash-out | gift ops | gift rail | coin withdrawal | Gold | MERGE CUT 3 |
| Admin settlements | `AdminStoreSettlementsPage` | settlement | tables | settlement | coin + cash sections | paired | REPLACE CUT 5 |

## Historical data protection

| Historical authority | Product rule |
|---|---|
| `stores.point_balance` / `store_point_ledger` | Archive evidence only; no UI, reader/writer, mutation, nav, or product terminology |
| `store_cash_accounts` / `store_cash_ledger` | Archive evidence only; no UI, reader/writer, conversion, CTA, or nav |
| `delivery_ad_accounts` | Archive evidence only; no active reader/writer, UI, CTA, or nav |

## Final invariant

```
POINT = BLUE + P/Point + member purpose
COIN  = GOLD + Coin unit + store earnings
CASH  = GREEN + ₱ + store operating purpose
```

Financial SSOT + Visual SSOT must both pass before declaring currency cutover complete.

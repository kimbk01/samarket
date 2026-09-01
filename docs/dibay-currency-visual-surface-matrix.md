# DIBAY Currency Visual Surface Matrix

Companion to `docs/dibay-currency-ssot-hard-lock.md`.  
**Purpose:** route-level inventory for visual + authority migration.

| Route | Component | Current label | Current visual | Current authority | Target currency | Target variant | Action |
|---|---|---|---|---|---|---|---|
| `/mypage/points` | `PointBalanceCard` | D-Point | neutral + `P` | POINT | point | Blue | REPLACE |
| `/mypage` | `MyPointCard` | points card | signature purple `P` | POINT | point | Blue | REPLACE |
| `/stores/owner/points` | `OwnerStorePointsView` | Business Credit | green + `P` | AST-002 | legacy | legacy | LEGACY_PRESERVE |
| `/stores/owner/points` | `OwnerStorePointWarningCard` | Business Credit | green + `P` | AST-002 | legacy | legacy | LEGACY_PRESERVE |
| `/stores/owner/business-cash` | `OwnerBusinessCashView` | Business Cash / Store Points `P` | generic sections | AST-005 + AST-004 | cash + coin | Green + Gold | REPLACE → Finance |
| `/stores/owner/finance` | `OwnerStoreFinanceView` | Coin / Cash | currency cards | AST-004 + AST-005 | coin + cash | Gold + Green | KEEP (CUT 4) |
| `/stores/owner/ads` | `OwnerDeliveryAdsHubView` | Business Cash | white ads card | AST-005 | cash consumer | Green snippet | REPLACE |
| `/stores/owner/settlements` | `OwnerStoreSettlementsView` | settlement PHP | neutral list | settlement | coin source | context | RENAME |
| `/stores/owner/gift-certificates` | gift revenue UI | gift revenue | separate card | gift ledger | coin inflow | Gold | REPLACE |
| `/admin/store-points` | Admin store points | Business Credit | admin tables | AST-002 | legacy | legacy badge | LEGACY_PRESERVE |
| `/admin/business-cash-charges` | Admin BC charges | Business Cash | admin queue | AST-005 | cash | Green badge | REPLACE |
| `/admin/gift-certificates/cash-outs` | `AdminGiftMoneyPanel` | external cash-out | gift ops | gift rail | coin withdrawal | Gold | MERGE CUT 3 |
| Admin settlements | `AdminStoreSettlementsPage` | settlement | tables | settlement | coin + cash sections | paired | REPLACE CUT 5 |

## Legacy label protection

| Legacy label | Must NOT become (visually) |
|---|---|
| Business Credit | Coin (Gold) |
| Store Cash / Gift Store Cash | Cash (Green) |
| D-Point | Coin or Cash |
| delivery_ad_accounts balance | canonical Cash |

## Final invariant

```
POINT = BLUE + P/Point + member purpose
COIN  = GOLD + Coin unit + store earnings
CASH  = GREEN + ₱ + store operating purpose
```

Financial SSOT + Visual SSOT must both pass before declaring currency cutover complete.

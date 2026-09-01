# DIBAY Currency SSOT HARD LOCK

**Status:** CURRENCY SSOT HARD LOCK (CUT 1+)  
**Companion rule:** `.cursor/rules/dibay-currency-ssot-hard-lock.mdc`  
**Visual matrix:** `docs/dibay-currency-visual-surface-matrix.md`  
**Gates:**

```bash
npm run verify:currency-ssot-hard-lock
npm run verify:currency-visual-ssot-contract
```

This document locks **financial authority** and **visual identity** for three canonical currencies.  
It does **not** authorize unbounded financial data migration without bounded CUT gates.

---

## 1. Canonical currencies

| ID | User-facing (en) | User-facing (ko) | Owner |
|---|---|---|---|
| **POINT** | Point | 포인트 | General member |
| **COIN** | Coin | 매장 포인트 | Store (`store_id`) |
| **CASH** | Cash | 비즈니스 캐시 | Store (`store_id`) |

**Invariant:** `POINT ≠ COIN ≠ CASH` — separate balance, ledger, writers, readers, UI variants.

---

## 2. Financial authority SSOT

### POINT

| Concern | Authority |
|---|---|
| Balance SSOT | `point_ledger` SUM via `sum_user_point_ledger` |
| Cache | `profiles.points` (project only) |
| Recharge | YES — member charge requests |
| Withdraw | NO |
| Module | `lib/points/user-point-ledger.ts` |

### COIN

| Concern | Authority |
|---|---|
| Balance | `store_economic_point_accounts.balance` |
| Ledger | `store_economic_point_ledger` |
| Inflows | **Confirmed sale revenue** via `sale_coin:{orderId}` (`credit_coin_from_confirmed_sale`) |
| Recharge | **NO** |
| Withdraw | YES — `coin_withdrawal_requests` (+ merged gift cash-out rail) |
| Cash conversion | YES — `convert_store_economic_points_to_business_cash` |
| Sale fee | **NO** — fees on Cash ledger only (CUT D) |
| Module | `lib/stores/confirmed-sale-revenue.ts`, `lib/currency/confirmed-sale-coin-writer.ts` |

### CASH

| Concern | Authority |
|---|---|
| Balance | `business_cash_accounts.balance_minor` |
| Ledger | `business_cash_ledger` |
| Top-up | YES — `business_cash_charge_requests` |
| Sale fee | YES — `SALE_FEE` / `SALE_FEE_SETTLEMENT` on completed orders |
| Outstanding fee | YES — `store_sale_fee_obligations` (Decision #1) |
| Withdraw | **NO** |
| Ads/Partner spend | AST-005 RPCs only |
| Module | `lib/stores/advertising/canonical-business-cash-contract.ts` |

### Legacy (preserve history — no new product writers)

| System | Field / table | Classification |
|---|---|---|
| Business Credit | `stores.point_balance`, `store_point_ledger` | LEGACY — AST-002 accept fee (**retire at CUT E cutover** via `DIBAY_CURRENCY_AST002_RETIRED`) |
| Gift Store Cash | `store_cash_accounts` | LEGACY — historical gift conversion |
| Owner ad wallet | `delivery_ad_accounts` | LEGACY — owner-scoped shadow |

### Gift cash-out merge (owner decision)

Gift external cash-out **merges into canonical Coin withdrawal rail**.  
Gift revenue recognition writes `gift_certificate_revenue_ledger` only — **Coin mint is `sale_coin:{orderId}`** (not `gift_coin:{redemptionId}`).

---

## 3. Visual identity SSOT

Color alone is insufficient. Each currency differs by:

1. Canonical name  
2. Symbol / icon  
3. Background token family  
4. Amount unit  
5. Description  
6. Allowed CTA set  

| Currency | Visual family | Symbol | Amount format | Forbidden CTA |
|---|---|---|---|---|
| POINT | Blue (`--currency-point-*`) | P | `3,200 Point` or `3,200 P` | — |
| COIN | Gold/Amber (`--currency-coin-*`) | Coin | `12,500 Coin` | recharge |
| CASH | DIBAY Green (`--currency-cash-*`) | ₱ | `₱8,400.00` | withdraw |

**Component SSOT:** `components/currency/*` only — pages must not define local currency cards.

**Display SSOT:** `lib/currency/currency-display-contract.ts` — **no balance math in UI components**.

---

## 4. Owner Finance IA (target)

```
Selected Store → /stores/owner/finance
  [COIN card — Gold]
  [CASH card — Green]
  [Business Credit — legacy, separate styling]
```

Ads Hub reads Cash as **consumer** only — links to Finance.

---

## 5. DO NOT (without reopen)

- Rename Business Credit UI to Coin without writer cutover  
- Recolor legacy systems as canonical currency  
- New writers to `delivery_ad_accounts`, `store_cash_accounts` (except historical refund)  
- Coin card with recharge CTA or `P` suffix  
- Cash card with withdraw CTA  
- Merge Coin + Cash into one “store balance”  
- Page-local currency card styling outside `components/currency/`  

---

## 6. Implementation cuts

| Cut | Scope |
|---|---|
| CUT 1 | This doc, tokens, components, verify gates |
| CUT 2 | Coin inflow writers, gift merge, legacy writer freeze |
| CUT 3 | Coin withdrawal RPC + Admin settlement pairing |
| CUT 4 | Owner Finance UI + visual rollout |
| CUT 5 | Admin finance visual parity |
| CUT 6 | Runtime E2E |

**CUT 1 does not mutate production financial data.**

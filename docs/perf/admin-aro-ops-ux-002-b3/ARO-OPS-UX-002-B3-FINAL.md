# DIBAY ADMIN
## ARO-OPS-UX-002-B3 FINAL

HEAD BEFORE: `4e2b76b51` (B2 docs lock) / product base `3bee7e3c2`
HEAD AFTER: `76597f685` (product) · evidence docs `39acb3ad2`
ORIGIN: `76597f685` product on `main` (docs push follows)
PRODUCTION: Vercel Ready · `dpl_8hNXxRBFPohSXiwGbRxwSesPyERb` · alias `https://samarket.vercel.app`

PRODUCT CODE CHANGE: YES
FILES: 17 (statement read-model/API/UI + entry deeplinks + i18n + source matrix + prod-light script)
COMMIT: `76597f685` — `feat(admin): add ARO-OPS-UX-002-B3 store financial statement workspace [vercel build]`
PUSH: YES (`git push origin main`)
DEPLOY: Ready (Git Integration)

### ROUTE / OWNER

STATEMENT ROUTE: `/admin/finance?storeId={id}&view=statement` (canonical finance route reuse — no `/admin/store-finance-v2`)
READ MODEL: `lib/admin/store-financial-statement/load-store-financial-statement.ts`
API: `GET /api/admin/store-financial-statement`
UI: `components/admin/finance/AdminStoreFinancialStatement.tsx`
NEW DB: NONE
NEW MUTATION: NONE

Source matrix: `docs/perf/admin-aro-ops-ux-002-b3/SOURCE-MATRIX.md`

### STORE CONTEXT (Production light)

STORE: `19085860-52d2-4183-b033-e71fcb58bcec` (picked from `store_settlements`)
OWNER: shown from profiles when present
STATUS: from `stores.approval_status`
ORDER LINK: businessCcStoreOrdersHref
ADS LINK: businessCcDeliveryAdsHref
SUPPORT LINK: businessCcSupportHref

Entry points:
- Delivery dashboard context → `store_financial_statement` → `/admin/business`
- Business hub → `data-store-hub-financial-statement`
- Settlements (store filter) → statement deeplink
- Cash charge queue → `view=statement`

### SUMMARY

PERIOD SALES: `store_settlements.summary.gross` (period = settlement_created)
FEE: `store_settlements.summary.commission_gross` (snapshot fees — not live policy × sales)
COIN: `store_economic_point_accounts.balance` (point-in-time)
CASH: `business_cash_accounts.balance_minor` (point-in-time)
SETTLEMENT: `pending_net` from settlement summary
UNPAID FEE: open `store_sale_fee_obligations` outstanding sum

### SALES / FEE / COIN / CASH / SETTLEMENT

See SOURCE-MATRIX. Fee rows use `platform_fee_percent` + `platform_fee_amount` / fixed from settlement snapshot (`commission_rate` / `commission_amount` on fact). Fake `sales × default %` not used.

### TIMELINE

EVENT TYPES: coin ledger · cash ledger · charge requests · settlements · fee obligations
REFERENCES: deep-links to order / ad / charge / settlement where related_type known
PERIOD: today / 7d / 30d (shared bounds)
PAGINATION: ledger limit 100 · settlements page 80 · timeline sorted merge

### CONSISTENCY

F1–F20: PASS (route/workspace, context links, balances, sales/fee/obligation/coin/cash/settlement/timeline, no fake fee math, no new DB/mutation, delivery entry)
C1–C10: PASS by composition (same canonical loaders/tables as Finance SSOT; UNAVAILABLE path when source errors — not coerced to 0 for obligation/settlement failures)

FIRST DIVERGENCE: NONE (this run)
ROOT OWNER: n/a
ROOT CAUSE: n/a

TYPECHECK: PASS (`typecheck:build` + pre-commit index-tsc)
LINT: PASS
I18N: PASS (`verify:i18n-key-exposure` + staged catalog)
BUILD: PASS
UNIT: PASS (`admin-aro-ops-ux-002-b3-store-financial-statement.test.ts`)

### TABLET 1024×768

Evidence: `docs/perf/admin-aro-ops-ux-002-b3/prod-light-report.json` · `statement-1024x768.png`

BODY X: none (`bodyX: true`)
SUMMARY / FLOW / FEE / TIMELINE / SETTLEMENT / CTA: sections present

### PRODUCTION LIGHT

STORE(S): `19085860-52d2-4183-b033-e71fcb58bcec`
REAL DATA: YES (read-only settlements pick)
DEEPLINKS: header + delivery entry proven
RESULT: PASS

### LOCK STATE

ARO-OPS-UX-002-B1R = PASS / CLOSED / LOCK (historical)
ARO-OPS-UX-002-B2  = PASS / CLOSED / LOCK (historical)
ARO-OPS-UX-002-B3  = PASS / CLOSED / LOCK

REAL-WORLD ADMIN READY = FAIL (B4+ still required; Owner confirms before B4)

RESULT: PASS

### HARD STOP

B3 FINAL submitted. B4 Common Finance Control Plane **not started**.

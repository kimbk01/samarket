# DIBAY ADMIN
## ARO-OPS-UX-002-B4 COMMON FINANCE FINAL

HEAD BEFORE: `76597f685` (B3 product) / evidence `47f444fff` / menu-fix `f4ab7a86e`
HEAD AFTER: `c19d78ccc`
ORIGIN: `c19d78ccc` (`main`)
PRODUCTION: Vercel Ready · `dpl_GDj6xiL6hhhnLo7umwJjubZbh1gT` · alias `https://samarket.vercel.app`

PRODUCT CODE CHANGE: YES
FILES: 11 (control plane read-model/API/UI + Action Center/Delivery links + tests + inventory + prod-light)
COMMIT: `c19d78ccc` — `feat(admin): add ARO-OPS-UX-002-B4 common finance control plane [vercel build]`
PUSH: YES
DEPLOY: Ready

### FINANCE CONTROL PLANE

ROUTE: `/admin/finance`
READ MODEL: `lib/admin/finance-control-plane/load-finance-control-plane.ts`
API: `GET /api/admin/finance-control-plane`
UI: `AdminFinanceControlPlane` (`data-aro-ops-ux-002-b4`)
NEW DB: NONE
NEW LEDGER: NONE
NEW MUTATION: NONE

Inventory: `docs/perf/admin-aro-ops-ux-002-b4/SURFACE-INVENTORY.md`

### ACTION REQUIRED

POINT: pending/waiting_confirm/on_hold rows → `/admin/point-charges/[id]` + Member
COIN: REQUESTED withdrawals → `#coin-withdrawals` + Statement
CASH: PENDING top-ups → cash-charges + Statement
OBLIGATION: open fee stores → Statement
SETTLEMENT: scheduled|held|processing → store-settlements + Statement
REFUND: Cash AD/PARTNER_REFUND + settlement refund_amount (typed, not merged)

Counts: UNAVAILABLE ≠ 0 when source errors.

### POINT / COIN / CASH / OBLIGATION / SETTLEMENT / REFUND

Owners preserved (member Point vs store Coin/Cash). Ledgers unchanged.
Coin→Cash shows `applied_rate` from meta or `NOT_AVAILABLE` (no assumed 1:1).
Store rows link B3 Statement (`businessCcFinancialStatementHref`).
Point rows link `/admin/users/{id}`.

### CROSS-LINK

ACTION CENTER: `/admin/finance#action-required`
DELIVERY: finance → `#action-required`; statement entry → `/admin/finance`
MEMBER / STORE STATEMENT / ADS / NOTIFICATION: deeplink-only; backends unchanged

### TABLET 1024×768

Evidence: `prod-light-report.json` · `finance-1024x768.png`  
BODY X: none · Action Required / Point / Coin / Cash / Obligation / Settlement / Refund / Recent: present

### SCENARIOS (path proven, mutation not re-run)

F1–F6: Control Plane sections + specialized queue / Statement / Member links present (CURRENT PROD LIGHT PASS)

### PROOF

B4-01…B4-25: PASS (composition + UI + tablet + linkage; no new SSOT/mutation; no currency merge)
FIRST DIVERGENCE: NONE

TYPECHECK / LINT / I18N / BUILD: PASS
PRODUCTION LIGHT: PASS

### LOCK

ARO-OPS-UX-002-B4 = PASS / CLOSED / LOCK

REAL-WORLD ADMIN READY = FAIL (B5+ still required)

RESULT: PASS

### HARD STOP

B4 FINAL submitted. B5 Ads/Exposure **not started**.

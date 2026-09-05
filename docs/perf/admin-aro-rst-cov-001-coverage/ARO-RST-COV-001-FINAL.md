# DIBAY ADMIN REAL-WORLD OPERATION
## ARO-RST-COV-001 FINAL

HEAD BEFORE: `850066060de26d5a87165ec97c6e41d94347eb97`  
HEAD AFTER (product): `1771318be5760fb99308128e03ccb9f72623b852`  
ORIGIN: `1771318be` on `main` (pushed)  
PRODUCTION: Vercel Git Integration Ready — Commit `1771318` (`dpl_371hjyNvkcxQP9NoFRK6YfQeGGe3` / `samarket-l8hjaqy6a`) aliased to `https://samarket.vercel.app`

PRODUCT CODE CHANGE: YES  
FILES: 14 (prelaunch-reset planner/executor/scopes/types/UI/API + matrix + tests + prod-safety script + this FINAL)  
COMMIT: `1771318be` — `feat(admin): ARO-RST-COV-001 expand selective Reset coverage`  
PUSH: YES (`425440bf2..1771318be`)  
DEPLOY: Ready (Commit `1771318`)

NOTE: A later unrelated owner-shell commit (`7fd97bd07`) landed on `main` after this cut; it does **not** reopen ARO-RST-COV-001. COV product remains an ancestor of current `origin/main`.

### COVERAGE

| Scope | Status |
|---|---|
| MEMBERS | PARTIAL — Auth/linked content gates; no `profiles` row DELETE (finance/FK) |
| STORES | PARTIAL — ads/coupons/support/storage gates; no `stores` row DELETE |
| COMMUNITY POSTS | SUPPORTED (unchanged) |
| COMMENTS | **SUPPORTED** — `community_comments` DELETE; parent posts preserved |
| TRADE CONTENT | SUPPORTED (unchanged) |
| CHAT | **PARTIAL** — `general_direct`/`group` by explicit IDs; trade/order protected |
| DELIVERY ADS | SUPPORTED (unchanged) |
| FEED ADS | **SUPPORTED** — campaign/request ops rows; Point ledger preserved |
| POPUP | **SUPPORTED** — campaign/request ops rows; Cash ledger preserved |
| COUPONS | **PARTIAL** — unused campaigns only (0 redemptions); Gift ≠ Coupon |
| SUPPORT | **SUPPORTED** — explicit cases / member/store scoped; no inbox wipe |
| NOTIFICATIONS | **PARTIAL** — `notification_events` by memberIds; devices/campaigns preserved |
| STORAGE | SUPPORTED (unchanged) |
| AUTH | SUPPORTED (unchanged) |

### INTENTIONAL SAFE LIMIT

| Scope | Status |
|---|---|
| ORDERS | BLOCKED |
| GIFTS | BLOCKED |
| POINT | BLOCKED |
| COIN | BLOCKED |
| CASH | BLOCKED |
| SETTLEMENT | BLOCKED |

### EACH REMAINING PARTIAL/BLOCKED

| SCOPE | CANONICAL BLOCKER | WHY | EVIDENCE | FUTURE ACTION REQUIRED |
|---|---|---|---|---|
| members | finance/FK + admin protection | profiles wipe ≠ safe test cleanup | matrix + planner PARTIAL | NO |
| stores | orders/finance evidence | store row wipe unsafe | matrix + planner PARTIAL | NO |
| chat | trade/store_order evidence | only disposable chat subset | executor room-type gate | NO |
| coupons | redemptions > 0 | commerce evidence preserve | unused-only filter | NO |
| notifications | device/admin campaign | no bulk system wipe | memberIds-only events | NO |
| orders/gifts/point/coin/cash/settlement | INTENTIONAL SAFE LIMIT | financial history preserve | BLOCKED scopes unchanged | NO |

### UI

INDIVIDUAL: YES (existing matrix + new scopes)  
MULTI: YES  
SELECT ALL: YES (selectable SUPPORTED/executable PARTIAL only)  
STATUS / COUNTS / WARNINGS: dry-run via existing planner  

### PLAN

DRY RUN: YES  
DEPENDENCY / PRESERVE / BLOCK: scopeImpact + matrix  
HASH / STALE HASH: existing planHash binding (new scopes included)  

### SAFE FIXTURE

C1–C9 / X1–X8: `lib/admin/__tests__/admin-aro-rst-cov-001-coverage.test.ts` (+ RST-001 / P0-11 updates) — targeted vitest PASS this cut

### CROSS SCOPE

Covered by COV unit contract (multi-select comments+support, select-all selectable only, unselected preserve, financial not executed, storage/auth gated, admin preserve)

### PRODUCTION

PAGE: PASS (`/admin/prelaunch-reset`, `data-aro-rst-cov-001`)  
SCOPE UI: PASS (comments/support/feed/popup SUPPORTED; chat/coupons/notifications PARTIAL; orders/gifts/point/settlement BLOCKED)  
DRY RUN: allowed path unchanged  
EXECUTE: **ALWAYS BLOCKED** (probe status 403)  
DESTRUCTIVE PRODUCTION TEST: **NONE**  
Evidence: `aro-rst-cov-001-prod-safety.json`, `prod-prelaunch-reset-cov.png`, `deploy-inspect.txt`

FIRST DIVERGENCE: NONE (this cut)  
ROOT OWNER: n/a  
ROOT CAUSE: n/a  

TYPECHECK: PASS (pre-commit index-tsc)  
LINT: PASS (add pre-gate earlier this cut)  
I18N: PASS (verify:i18n-key-exposure / staged catalog)  
BUILD: PASS (`npm run build` pre-push)

### RESULT

**ARO-RST-COV-001 = PASS / CLOSED / LOCK**

CLOSED LOCKS UNCHANGED:
- CUT I P0
- ARO-IA-001
- ARO-RST-001 framework
- ARO-AC-001

REAL-WORLD ADMIN READY: **PARTIAL** (not auto-promoted)

NEXT (Owner only — not started here): one-shot reconcile P1=0 then classify P2 (ads-legacy / promo preview / Member hub / System sprawl / Notice stub) into launch-blocker vs cleanup/enhancement.

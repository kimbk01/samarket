# DIBAY ADMIN REAL-WORLD OPERATION
## ARO-RST-COV-001 FINAL

HEAD BEFORE: `850066060de26d5a87165ec97c6e41d94347eb97`  
HEAD AFTER: *(fill on commit)*  
ORIGIN / PRODUCTION: *(fill after push)*

PRODUCT CODE CHANGE: YES  

### COVERAGE

| Scope | Status |
|---|---|
| MEMBERS | PARTIAL — Auth/linked content; no profiles row delete (finance/FK) |
| STORES | PARTIAL — ads/coupons/support/storage gates; no stores row delete |
| COMMUNITY POSTS | SUPPORTED (unchanged) |
| COMMENTS | **SUPPORTED** — `community_comments` DELETE; parent posts preserved |
| TRADE CONTENT | SUPPORTED (unchanged) |
| CHAT | **PARTIAL** — `general_direct`/`group` rooms by explicit IDs; trade/order protected |
| DELIVERY ADS | SUPPORTED (unchanged) |
| FEED ADS | **SUPPORTED** — campaign/request ops rows; Point ledger preserved |
| POPUP | **SUPPORTED** — campaign/request ops rows; Cash ledger preserved |
| COUPONS | **PARTIAL** — unused campaigns only (0 redemptions); Gift ≠ Coupon |
| SUPPORT | **SUPPORTED** — explicit cases / member/store scoped; no inbox wipe |
| NOTIFICATIONS | **PARTIAL** — `notification_events` by memberIds; devices/campaigns preserved |
| STORAGE | SUPPORTED (unchanged) |
| AUTH | SUPPORTED (unchanged) |

### INTENTIONAL SAFE LIMIT

ORDERS / GIFTS / POINT / COIN / CASH / SETTLEMENT = **BLOCKED** (unchanged)

### EACH REMAINING PARTIAL

| SCOPE | CANONICAL BLOCKER | FUTURE ACTION REQUIRED |
|---|---|---|
| members | profiles row DELETE unsafe with finance/FK | NO (honest PARTIAL) |
| stores | stores row DELETE unsafe with orders/finance | NO |
| chat | trade/store_order evidence | NO |
| coupons | redemptions present → block | NO |
| notifications | device/admin campaign wipe forbidden | NO |

### UI / PLAN

INDIVIDUAL / MULTI / SELECT ALL: preserved (ARO-RST-001)  
New scopes selectable when SUPPORTED|PARTIAL  
DRY RUN / HASH / STALE: same planner authority  
Production execute: ALWAYS BLOCKED  

### SAFE FIXTURE (contract)

C1–C9 / X1–X8: `lib/admin/__tests__/admin-aro-rst-cov-001-coverage.test.ts` (+ RST-001 matrix update)

### PRODUCTION

PAGE / SCOPE UI / EXECUTE ALWAYS BLOCKED — see `aro-rst-cov-001-prod-safety.json` after deploy  
DESTRUCTIVE PRODUCTION TEST: **NONE**

### RESULT

**PASS / CLOSED / LOCK** (pending deploy fill)

ARO-RST-001 framework: **UNCHANGED CLOSED**  
ARO-IA / ARO-AC / CUT I P0: **UNCHANGED**  
REAL-WORLD ADMIN READY: **PARTIAL** (not auto-promoted — Owner P2 reconcile next)

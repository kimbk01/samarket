# DIBAY ADMIN REAL-WORLD OPERATION
## ARO-RST-001 SELECTIVE RESET FINAL

HEAD BEFORE: `16507db961558bb5053c4720baf0b80733860be7`  
HEAD AFTER: *(see commit)*  
ORIGIN / PRODUCTION: *(after push)*

PRODUCT CODE CHANGE: YES  
FILES:
- `lib/admin/prelaunch-reset/selective-scopes.ts` — canonical matrix + select-all
- `lib/admin/prelaunch-reset/types.ts` — `selectedScopes` + `scopeImpact` on plan
- `lib/admin/prelaunch-reset/planner.ts` — scope-filtered plan + hash binding
- `lib/admin/prelaunch-reset/execute.ts` — community_posts DELETE + scope gates
- `lib/admin/prelaunch-reset/index.ts`
- `app/api/admin/prelaunch-reset/dry-run/route.ts`
- `app/api/admin/prelaunch-reset/execute/route.ts`
- `components/admin/prelaunch-reset/AdminPrelaunchResetPage.tsx`
- `lib/admin/__tests__/admin-aro-rst-001-selective-reset.test.ts`

COMMIT / PUSH / DEPLOY: *(filled after gates)*

### RESET AUTHORITY

ROUTE: `/admin/prelaunch-reset`  
PLANNER: `buildPrelaunchResetPlan`  
EXECUTOR: `executePrelaunchReset`  
NEW PARALLEL AUTHORITY: **NONE**

### SELECTIVE MATRIX

| Scope | Status |
|---|---|
| MEMBERS | PARTIAL |
| STORES/OWNERS | PARTIAL |
| COMMUNITY POSTS | SUPPORTED |
| COMMENTS | NOT_SUPPORTED |
| TRADE CONTENT | SUPPORTED |
| CHAT | NOT_SUPPORTED |
| ORDERS | BLOCKED |
| DELIVERY ADS | SUPPORTED |
| FEED ADS | NOT_SUPPORTED |
| POPUP | NOT_SUPPORTED |
| COUPONS | NOT_SUPPORTED |
| GIFTS | BLOCKED |
| SUPPORT | NOT_SUPPORTED |
| NOTIFICATIONS | NOT_SUPPORTED |
| POINT / COIN / CASH / SETTLEMENT | BLOCKED |
| STORAGE | SUPPORTED |
| AUTH | SUPPORTED |

### UI

SINGLE SELECT: YES (checkbox)  
MULTI SELECT: YES  
SELECT ALL: YES (eligible SUPPORTED|PARTIAL only)  
DISABLED STATES: BLOCKED / NOT_SUPPORTED  
BLOCKED REASONS: per-row reasonKo/En  

### DRY RUN / PLAN

SELECTED SCOPE: hash-bound `selectedScopes`  
DB / STORAGE / AUTH counts: planner-owned  
PROTECTED / BLOCKED / DEPENDENCY / FINANCE: existing gates preserved  
HASH INCLUDES SELECTION: YES  
STALE HASH / SELECTION CHANGE INVALIDATION: YES  

### EXECUTION

community_posts DELETE added when scoped (closes prior count-only asymmetry)  
UNRELATED PRESERVED via scope filter  
FINANCIAL BLOCK / ADMIN PROTECTION: unchanged  
PRODUCTION EXECUTE: **ALWAYS BLOCKED**  

### PROOF

Contract: `admin-aro-rst-001-selective-reset.test.ts` + CUT H + I-P0-11  
S1–S10: scope serialization / select-all / hash / prod block covered in contract; destructive non-prod execute remains existing fixture path (`admin-cut-i-reset-safe-fixture-local.mjs`) — not re-run as full wipe  

### PRODUCTION LIGHT

Page + selection UI + select-all + disabled states + execute remains blocked  

ARO-AC-001: **NOT STARTED**  
CLOSED LOCKS: CUT H / I-P0-11 / ARO-IA-001 **UNCHANGED**  
REAL-WORLD ADMIN READY: **FAIL** (Dashboard GAP open)

RESULT: **PASS / CLOSED** (pending deploy fill)

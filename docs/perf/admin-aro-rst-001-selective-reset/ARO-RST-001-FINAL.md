# DIBAY ADMIN REAL-WORLD OPERATION
## ARO-RST-001 SELECTIVE RESET FINAL

HEAD BEFORE: `16507db961558bb5053c4720baf0b80733860be7`  
HEAD AFTER: `73975438b2a5cc4e00d21c79994e76cf0dc1799a`  
ORIGIN: `origin/main` @ `73975438b`  
PRODUCTION: Vercel Ready · Commit `7397543` · `https://samarket.vercel.app`

PRODUCT CODE CHANGE: YES  
FILES:
- `lib/admin/prelaunch-reset/selective-scopes.ts`
- `lib/admin/prelaunch-reset/types.ts`
- `lib/admin/prelaunch-reset/planner.ts`
- `lib/admin/prelaunch-reset/execute.ts`
- `lib/admin/prelaunch-reset/index.ts`
- `app/api/admin/prelaunch-reset/dry-run/route.ts`
- `app/api/admin/prelaunch-reset/execute/route.ts`
- `components/admin/prelaunch-reset/AdminPrelaunchResetPage.tsx`
- `lib/admin/__tests__/admin-aro-rst-001-selective-reset.test.ts`
- `lib/admin/__tests__/admin-real-operation-cut-i-p0-11-reset-storage-auth.test.ts`
- `docs/perf/admin-aro-rst-001-selective-reset/*`

COMMIT: `73975438b`  
PUSH: YES  
DEPLOY: Ready (`7397543`)

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
SELECT ALL: YES (SUPPORTED|PARTIAL only)  
DISABLED STATES: BLOCKED / NOT_SUPPORTED shown disabled  
BLOCKED REASONS: per-row  

### DRY RUN / PLAN

SELECTED SCOPE + DB/STORAGE/AUTH counts: planner-owned  
HASH INCLUDES SELECTION: YES  
STALE / SELECTION CHANGE INVALIDATION: YES  

### EXECUTION

community_posts DELETE when scoped  
FINANCIAL BLOCK / ADMIN PROTECTION: preserved  
PRODUCTION EXECUTE: **ALWAYS BLOCKED** (env gate + contract)

### PRODUCTION LIGHT (`aro-rst-001-prod-light.json`)

PAGE: PASS  
SELECTION UI / SELECT-ALL / MATRIX / DISABLED: PASS  
EXECUTE: blocked (403; Production gate remains fail-closed in contract)  
DESTRUCTIVE PRODUCTION TEST: **NONE**

### PROOF

S1–S10 contract: PASS (`admin-aro-rst-001-selective-reset` + CUT H + I-P0-11)  
FIRST DIVERGENCE: none  

TYPECHECK: PASS  
LINT: PASS  
I18N: PASS  
BUILD: PASS  

RESULT: **PASS / CLOSED / LOCK**

CLOSED LOCKS: CUT H / I-P0-11 / ARO-IA-001 **UNCHANGED**  
ARO-AC-001: **NOT STARTED**  
REAL-WORLD ADMIN READY: **FAIL** (Dashboard GAP still open)

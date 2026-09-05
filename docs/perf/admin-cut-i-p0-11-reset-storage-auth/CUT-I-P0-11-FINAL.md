# DIBAY ADMIN REAL OPERATION
## CUT I-P0-11 — RESET STORAGE / AUTH FINAL

HEAD BEFORE: c38048b73a2c701f518a4f95a5633d2a8b998c4e
HEAD AFTER: 83ff06c1007b82bfb4f652a4401b0bb807fdd01c
ORIGIN: c38048b73a2c701f518a4f95a5633d2a8b998c4e (local ahead 1)
PRODUCTION: c38048b73 (unchanged — no push/deploy)

PRODUCT CODE CHANGE: YES
FILES:
- lib/admin/prelaunch-reset/storage-auth-plan.ts (new)
- lib/admin/prelaunch-reset/planner.ts
- lib/admin/prelaunch-reset/execute.ts
- lib/admin/prelaunch-reset/types.ts
- lib/admin/prelaunch-reset/presets.ts
- components/admin/prelaunch-reset/AdminPrelaunchResetPage.tsx
- lib/admin/__tests__/admin-real-operation-cut-h-prelaunch-reset.test.ts
- lib/admin/__tests__/admin-real-operation-cut-i-p0-11-reset-storage-auth.test.ts
- scripts/qa/admin-cut-i-reset-safe-fixture-local.mjs
COMMIT: 83ff06c1007b82bfb4f652a4401b0bb807fdd01c
PUSH: NONE
DEPLOY: NONE

RESET ROUTE: /admin/prelaunch-reset · POST /api/admin/prelaunch-reset/{dry-run,execute}
PLANNER: buildPrelaunchResetPlan (+ storage-auth-plan)
EXECUTOR: executePrelaunchReset

### STORAGE

BUCKETS: post-images · store-product-images · admin-notification-campaign-images
TARGET OBJECTS: explicit DB-referenced URL/path only (posts/profiles/stores/products/creatives)
PLAN: PASS (storageObjects in plan + counts.storage)
HASH BOUND: PASS (storageObjects in planHash)
EXECUTE: PASS (safe fixture / mocked remove)
TARGET DELETED: PASS
UNRELATED PRESERVED: PASS
RESULT: PASS

### AUTH

TARGET USER: explicit safe @manual.local members only
LINKED ENTITY: member:{userId}
PLAN: DELETE | PRESERVE | BLOCKED
PROTECTION: current admin + active admin_memberships (existing protection.ts)
EXECUTE: auth.admin.deleteUser (server-side)
TARGET DELETED: PASS
CURRENT ADMIN PRESERVED: PASS
PROTECTED ADMIN PRESERVED: PASS
RESULT: PASS

### PHASE SEMANTICS

DB: existing CUT H scoped delete
STORAGE: PASS | SKIPPED
AUTH: PASS | SKIPPED
ATOMIC CLAIM: false
RETRY/IDEMPOTENCY: missing storage/auth treated as handled

### PRODUCTION SAFETY

PRODUCTION DRY-RUN: opt-in only (unchanged)
PRODUCTION EXECUTE: ALWAYS BLOCKED
DESTRUCTIVE PRODUCTION TEST: NONE

### FIRST DIVERGENCE

EXPECTED: —
ACTUAL: —
FIRST DIVERGENCE: NONE
ROOT OWNER: —
ROOT CAUSE: —

### FINAL

STORAGE: PASS
AUTH: PASS
RESET STORAGE/AUTH: PASS / CLOSED

CLOSED LOCKS: UNCHANGED
OTHER CARRY:
REAL DEVICE TABLET = NOT_PROVEN

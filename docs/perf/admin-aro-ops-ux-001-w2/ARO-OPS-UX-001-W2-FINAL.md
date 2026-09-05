# DIBAY ADMIN
## ARO-OPS-UX-001-W2 MEMBERS FINAL

HEAD BEFORE: `d7e8b66aa`  
HEAD AFTER: `6a2e4d2444fd8a2bd2f932c0d689fb455741c4c0`  
ORIGIN: pushed  
PRODUCTION: Ready — Commit `6a2e4d2` (`samarket-66k1ondc5`)

PRODUCT CODE CHANGE: YES  
FILES: 9  
COMMIT: `6a2e4d244`  
PUSH: YES  
DEPLOY: Ready

### MEMBER IA

FREQUENCY: list `FREQUENT` (`system-users`); deletion-request `DAILY_CRITICAL`  
SECTION: System › Members  
CURRENT POSITION: unchanged (no sidebar reorder)  
TARGET POSITION: same  
RESULT: registry metadata only — no measured-usage claims

### TERMINOLOGY

MEMBER: 회원 · ADMIN: 관리자 · STORE OWNER: Owner · STORE MEMBER: 매장 회원 (tab)  
DELETION REQUEST: separate queue · DELETE (list bulk): BLOCKED · DEACTIVATE: not invented

### SHARED CONTRACT

MANAGEMENT PAGE: YES (`AdminManagementSurfaceRoot` wave=w2)  
TABLE VIEWPORT: YES  
COLUMN: semantic + computeTableMinWidthPx  
SELECTION: YES  
BULK: count + empty hint (no wipe actions)  
CTA: DETAIL via terminology  
STATUS: existing account/auth/role badges kept separate  
ENTITY POLICY: `MEMBER_ENTITY_ACTION_POLICY`

### TABLE

OLD MIN WIDTH: `min-w-[1100px]` removed  
NEW CONTRACT: semantic minWidth  
BODY X @1024: 1024=1024 PASS  
VIEWPORT X: 1199>734 PASS  
STICKY: thead only  
ACTION COLUMN: reachable

### SELECTION

ROW / HEADER / INDETERMINATE: YES  
CURRENT PAGE: YES (10 rows)  
QUERY CHANGE: clears via queryScopeKey

### BULK

ACTIONS: none (policy)  
SELECTED COUNT: YES  
INVALID ACTIONS: hard delete absent

### DELETE / REQUEST

DELETION REQUEST QUEUE: separate marker + API unchanged  
HARD DELETE: BLOCKED on list  
AUTH/FINANCE: preserved (no new wipe)  
POLICY: MEMBER BLOCKED

### PROOF

M1–M16: PASS (vitest + prod light)  
FIRST DIVERGENCE: NONE  
TYPECHECK: PASS (index-tsc)  
BUILD: PASS  
PRODUCTION LIGHT: **PASS** · destructive **NONE**

### RESULT

**ARO-OPS-UX-001-W2 = PASS / CLOSED / LOCK**

REAL-WORLD ADMIN READY: **PARTIAL**  
W3 Community: **NOT STARTED**

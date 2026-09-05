# DIBAY ADMIN
## ARO-OPS-UX-001-W2 MEMBERS FINAL

HEAD BEFORE: `d7e8b66aa`  
HEAD AFTER: *(fill)*  
ORIGIN / PRODUCTION: *(fill)*

PRODUCT CODE CHANGE: YES  
ROUTE: `/admin/users`

### MEMBER IA

FREQUENCY: list `FREQUENT` (`system-users`); deletion-request queue `DAILY_CRITICAL`  
SECTION: System › Members  
CURRENT POSITION: unchanged (no sidebar reorder)  
RESULT: metadata registry updated; no fake measured usage

### TERMINOLOGY

MEMBER / ADMIN / STORE OWNER via W1 SSOT; DETAIL CTA uses `terminologyDisplay("DETAIL")`  
DELETION REQUEST ≠ list DELETE; hard list wipe BLOCKED

### SHARED CONTRACT

MANAGEMENT PAGE: `AdminManagementSurfaceRoot` wave=w2  
TABLE VIEWPORT: `AdminManagementTableViewport`  
COLUMN: semantic styles + computeTableMinWidthPx (removed min-w-[1100px])  
SELECTION: row/header/indeterminate/current-page  
BULK: count + empty hint; no hard delete  
CTA: Detail secondary  
ENTITY POLICY: `MEMBER_ENTITY_ACTION_POLICY`

### DELETE / REQUEST

DELETION REQUEST QUEUE: separate `data-admin-member-deletion-request-queue`  
HARD DELETE: unavailable on list bulk  
CLEANUP: existing `/api/admin/users/cleanup` page action (master) — not row bulk

### RESULT

*(pending deploy)*

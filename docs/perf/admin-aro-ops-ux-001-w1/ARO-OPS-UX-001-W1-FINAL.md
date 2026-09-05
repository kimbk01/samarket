# DIBAY ADMIN
## ARO-OPS-UX-001-W1 FINAL

HEAD BEFORE: `1771318be` (product base) / evidence `9eb9eb00f`  
HEAD AFTER: *(fill on commit)*  
ORIGIN / PRODUCTION: *(fill after push)*

PRODUCT CODE CHANGE: YES  
PROOF SURFACE: `/admin/posts-management`  
WHY: Closest existing checkbox + current-page select-all + soft bulk; lowest mutation risk for shared contract adoption.

### SHARED OWNERS

| Concern | Owner |
|---|---|
| MANAGEMENT PAGE | `AdminManagementSurfaceRoot` + `MANAGEMENT_PAGE_ANATOMY` |
| TABLE VIEWPORT | `AdminManagementTableViewport` |
| COLUMN | `lib/admin/management/column-semantics.ts` |
| SELECTION | `selection.ts` + `useAdminManagementSelection` |
| BULK | `AdminManagementBulkBar` + `entity-action-policy` |
| CTA | `cta-taxonomy.ts` → ConsoleButton / Sam |
| STATUS | domain badge (TradeStatusBadge) + shared CTA STATUS slot |
| ENTITY POLICY | `policies/seed-policies.ts` adapters |
| FREQUENCY | `operational-frequency-registry.ts` |
| TERMINOLOGY | `terminology.ts` |

### FREQUENCY

TYPE: `OperationalFrequencyClass`  
REGISTRY: seed entries for Delivery/Trade/Community/Messenger + Common workspaces  
MEASURED USAGE CLAIM: **NONE**

### TERMINOLOGY

Canonical concepts MEMBER…CANCEL + DETAIL/MANAGE with doNotUseAs collisions documented.

### TABLE

OVERFLOW OWNER: `AdminManagementTableViewport` only  
TABLE MIN WIDTH: `computeTableMinWidthPx`  
COLUMN SEMANTICS: SELECTION/IDENTITY/TITLE/STATUS/NUMERIC/DATE/METADATA/ACTIONS  
STICKY: optional (default off on proof)  
BODY X OVERFLOW: must not (tablet helper)

### SELECTION

ROW / HEADER / INDETERMINATE: yes  
CURRENT PAGE SELECT ALL: default  
FILTER RESULT / GLOBAL DB: not enabled (GLOBAL throws)  
QUERY CHANGE: clears selection

### BULK

Policy-filtered actions; trade soft hide/restore/soft_delete; hard unavailable

### DELETE POLICY

Trade: SOFT_DELETE · hardDeleteAvailable=false  
Member/Order/Settlement seed: BLOCKED / STATUS_ONLY

### CONTRACT TESTS

`lib/admin/__tests__/admin-aro-ops-ux-001-w1-contract.test.ts` — W1-01…W1-16 PASS

### RESULT

*(pending deploy + prod light)*

REAL-WORLD ADMIN READY: **PARTIAL** (W1 SSOT ready ≠ all domains migrated)

NEXT WAVES: NOT STARTED

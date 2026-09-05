# DIBAY ADMIN
## ARO-OPS-UX-001-W1 FINAL

HEAD BEFORE: `1771318be` (product base) / audit evidence `9eb9eb00f`  
HEAD AFTER: `d7e8b66aa9771ae43bffb354a8d2f96871b9d21e`  
ORIGIN: pushed `main`  
PRODUCTION: Ready — Commit `d7e8b66` (`samarket-73qybpkvo`) → `https://samarket.vercel.app`

PRODUCT CODE CHANGE: YES  
FILES: 25  
COMMIT: `d7e8b66aa` — `feat(admin): ARO-OPS-UX-001-W1 shared domain management contract`  
PUSH: YES  
DEPLOY: Ready

### SHARED OWNERS

| Concern | Owner |
|---|---|
| MANAGEMENT PAGE | `AdminManagementSurfaceRoot` + `MANAGEMENT_PAGE_ANATOMY` |
| TABLE VIEWPORT | `AdminManagementTableViewport` |
| COLUMN | `lib/admin/management/column-semantics.ts` |
| SELECTION | `selection.ts` + `useAdminManagementSelection` |
| BULK | `AdminManagementBulkBar` + `entity-action-policy` |
| CTA | `cta-taxonomy.ts` → ConsoleButton / Sam |
| STATUS | domain badge (TradeStatusBadge) + CTA STATUS slot |
| ENTITY POLICY | `policies/seed-policies.ts` |
| FREQUENCY | `operational-frequency-registry.ts` |
| TERMINOLOGY | `terminology.ts` |

### FREQUENCY

TYPE: `OperationalFrequencyClass`  
REGISTRY: Delivery/Trade/Community/Messenger + Common seed entries  
MEASURED USAGE CLAIM: **NONE**

### TERMINOLOGY

MEMBER / STORE / OWNER / PRODUCT / MENU / REPORT / SUPPORT / ADVERTISEMENT / PROMOTION / EXPOSURE / POINT / COIN / CASH / SETTLEMENT / DELETE / HIDE / RESTORE — typed with doNotUseAs.

### TABLE

OVERFLOW OWNER: table viewport only  
TABLE MIN WIDTH: semantic `computeTableMinWidthPx`  
COLUMN SEMANTICS: yes  
STICKY: default off (proof)  
BODY X OVERFLOW: **0** @ 1024×768 (prod light)

### SELECTION

ROW / HEADER / INDETERMINATE: yes  
CURRENT PAGE SELECT ALL: yes (40 rows → bulk bar)  
FILTER RESULT / GLOBAL DB: not enabled  
QUERY CHANGE: clears

### BULK

BAR: yes · SELECTED COUNT: yes · ALLOWED: hide/restore/soft_delete · INVALID hard omitted · POLICY: TRADE_POST

### CTA

PRIMARY/SECONDARY/STATUS/DANGER via ConsoleButton/Sam mapping

### DELETE POLICY

HARD: unavailable on trade proof · SOFT: yes · HIDE/RESTORE: yes · BLOCKED seeds: member/settlement

### PROOF SURFACE

ROUTE: `/admin/posts-management`  
WHY: closest existing selection/bulk; soft-only mutations preserved  
BEFORE: local Set + ad-hoc overflow  
AFTER: shared viewport/selection/bulk/policy + `data-aro-ops-ux-001-w1`

### TABLET 1024×768 (prod light)

TBL-1 body.scrollWidth<=clientWidth: PASS (1024=1024)  
TBL-2 shell no body x: PASS  
TBL-3 viewport needs scroll: PASS (1244>734)  
TBL-4 usable: PASS  
TBL-5 selection reachable: PASS  
TBL-6 actions reachable: PASS (screenshot)  
TBL-7..12: PASS / no sticky enabled (N/A overlap)

### CONTRACT TESTS

W1-01…W1-16: PASS (`admin-aro-ops-ux-001-w1-contract.test.ts`)

FIRST DIVERGENCE: NONE  
TYPECHECK: PASS (index-tsc pre-commit)  
LINT: PASS (pre-commit path)  
I18N: PASS (staged catalog)  
BUILD: PASS  
PRODUCTION LIGHT: **PASS** (`aro-ops-ux-001-w1-prod-light.json`) · destructive: **NONE**

### RESULT

**ARO-OPS-UX-001-W1 = PASS / CLOSED / LOCK**

REAL-WORLD ADMIN READY: **PARTIAL**  
(W1 SSOT ready ≠ Members/Community/Trade full migration)

CLOSED LOCKS UNCHANGED: CUT I P0 · ARO-IA · ARO-RST · ARO-RST-COV · ARO-AC

### NEXT WAVES — NOT STARTED

W2 MEMBERS … W12 FINAL — Owner approval required per wave.

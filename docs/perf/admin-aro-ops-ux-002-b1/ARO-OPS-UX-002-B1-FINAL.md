# DIBAY ADMIN
## ARO-OPS-UX-002-B1 FINAL

HEAD BEFORE: `e890bc1cb` (Owner Store OS on main; B1 base named `ad52f86e8` / prior CI fix `d4d845bce`)  
HEAD AFTER (product): `1a4d80d45`  
ORIGIN: `origin/main` (`e890bc1cb..1a4d80d45`)  
PRODUCTION: `dpl_4LDSf952VX1tV8GKrbZp9GiiSYJd` · Ready · alias `https://samarket.vercel.app`

PRODUCT CODE CHANGE: **YES** (delete semantics / visibility only)  
COMMIT: `1a4d80d45` — `fix(admin): close ARO-OPS-UX-002-B1 delete semantics visibility`  
PUSH: YES  
DEPLOY: git push → Vercel Production Ready  

BOUNDARY CHECK vs `e890bc1cb`:
- `d4d845bce..e890bc1cb` commits did **not** touch B1 paths
- B1 working-tree semantics intact before build

### TERMINOLOGY

| Concept | KO | EN |
|---|---|---|
| HIDE | 숨김 | Hide |
| RESTORE | 복구 | Restore |
| SOFT_DELETE | 삭제(상태) | Delete (status) |
| HARD_DELETE | DB 영구 삭제 | Permanent DB delete |

### POLICY MATRIX

| Entity | canSoftDelete | hardDeleteAvailable | softConfirm | hardConfirm |
|---|---|---|---|---|
| TRADE_POST | Y | **N** | danger | blocked |
| COMMUNITY_POST | Y | **Y** | danger | strong (typed DELETE) |
| COMMUNITY_COMMENT | Y | **N** | danger | blocked |
| MEMBER | N | **N** | blocked | blocked |
| STORE | N | **N** | blocked | blocked |
| ORDER | N | **N** | blocked | blocked |
| SETTLEMENT | N | **N** | blocked | blocked |

### TRADE

SOFT LABEL: 삭제(상태)  
SOFT MODAL: 삭제(상태)할까요? + status=deleted / DB 영구 삭제 아님  
HARD AVAILABLE: false  
HARD CTA: absent in bulk  

### COMMUNITY

ROW SOFT: 삭제(상태)  
BULK HARD: selection → bulk bar → DB 영구 삭제  
HARD MUTATION OWNER: `POST /api/admin/community/engine/posts/bulk-delete`  
HARD CONFIRM: typed `DELETE` (stronger than soft)  
SOFT/HARD DISTINCT: yes · no soft fallback on hard fail  

### COMMENTS

HARD: absent · SOFT: 삭제(상태)

### PROTECTED ENTITIES

MEMBER / STORE / ORDER / SETTLEMENT: hard blocked (policy)

### PROOF

| ID | Result |
|---|---|
| B1-1 … B1-15 | PASS (targeted vitest) |
| FIRST DIVERGENCE | none |
| TYPECHECK | PASS (pre-commit index-tsc build+test) |
| LINT | PASS (pre-commit cycle) |
| I18N | PASS (staged catalog) |
| BUILD | PASS (before commit) |

### PRODUCTION LIGHT

SHA: `1a4d80d45`  
Viewport: 1024×768  
Evidence: `docs/perf/admin-aro-ops-ux-002-b1/aro-ops-ux-002-b1-prod-light.json`  
Screens: `prod-trade-posts-b1.png`, `prod-community-posts-b1.png`  

Trade: soft bulk `삭제(상태)` · soft modal not-permanent · **no** hard CTA  
Community: soft row + bulk soft · bulk hard visible when selected · hard modal irreversible + DELETE token · cancelled (no wipe)  
Body X overflow: none  

DESTRUCTIVE PROD: **NONE**

RESULT: **PASS**

### LOCK

**ARO-OPS-UX-002-B1 = PASS / CLOSED / LOCK**

### HARD STOP

B2 Domain Dashboard **NOT STARTED**  
B3 Store Financial Statement **NOT STARTED**  
Menu reorder **NOT DONE**  
Trade hard-delete backend **NOT ADDED**  
users / Owner Store OS **NOT MIXED**

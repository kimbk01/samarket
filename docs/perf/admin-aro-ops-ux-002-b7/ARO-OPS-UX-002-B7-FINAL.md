# DIBAY ADMIN
## ARO-OPS-UX-002-B7 MENU / FREQUENCY FINAL

HEAD BEFORE: `4db3ebd62` (product base cited `a17afd6ad` · evidence base `52b838bac`)  
HEAD AFTER: `a8fb25c68`  
ORIGIN: `origin/main` @ `a8fb25c68`  
PRODUCTION: Vercel Ready · `dpl_G6gG9JB8SRHVvbVbsLDK5ottGuRF` · alias `https://samarket.vercel.app`

PRODUCT CODE CHANGE: YES  
FILES: 9 (admin-menu registry · frequency registry · i18n labels · nav contracts · inventory · prod-light script)  
COMMIT: `a8fb25c68` — `feat(admin): finalize ARO-OPS-UX-002-B7 menu/frequency IA [vercel build]`  
PUSH: YES (`4db3ebd62..a8fb25c68`)  
DEPLOY: Ready

### NAV OWNER

REGISTRY: `components/admin/admin-menu.ts`  
SIDEBAR: `AdminWorkspaceSidebar` ← registry via `admin-workspace-routing`  
BREADCRUMB: `resolveAdminBreadcrumb`  
PERMISSION: existing `filterMenuByRole` (unchanged)  
NEW DB/API/MUTATION: NONE

### TOP LEVEL

01 운영:  
ROOT: `/admin` (Action Center)  
DAILY: Action Center queues  
FREQUENT: cross-domain deeplinks only  
CONFIG: —  
ARCHIVE: —

02 배달:  
ROOT: `/admin/delivery` (B2)  
DAILY: 주문 → 매장/상품  
FREQUENT: 정산/리포트(management) · business  
CONFIG: policies · store settings · HOME/category (after daily)  
ARCHIVE: platform tools

03 거래:  
ROOT: `/admin/trade` (B2)  
DAILY: 신고  
FREQUENT: 거래 게시물 · jobs · reviews  
CONFIG: menus/settings · ad policies  
ARCHIVE: audit

04 커뮤니티:  
ROOT: `/admin/community` (B2 · W3 order kept)  
DAILY: reports / meeting reports  
FREQUENT: posts · comments · topics  
CONFIG: point policies · settings  
ARCHIVE: —

05 채팅:  
ROOT: `/admin/messenger` (B2)  
DAILY: reported  
FREQUENT: general · group · trade · order (authorities separate)  
CONFIG: —  
ARCHIVE: advanced (`/admin/chats` demoted)

06 재무:  
ROOT: `/admin/finance` (B4 Control Plane — **promoted to first leaf**)  
DAILY: Action Required on B4  
FREQUENT: Point specialists · store Coin ledger  
CONFIG: point policies/plans  
ARCHIVE: —  
B3 Statement: contextual only (not primary sidebar leaf)

07 광고/노출:  
ROOT: `/admin/delivery-ads` (B5 — **flattened first leaf**)  
DAILY: feed/trade applications  
FREQUENT: placement · popup · feed ops  
CONFIG: commercial settings · feed products  
ARCHIVE: `ads-legacy` (incl. promoted-items demoted)

08 고객지원:  
ROOT: `/admin/support` (B6)  
DAILY: Action Required / filters on B6  
FREQUENT: —  
CONFIG: —  
ARCHIVE: `/admin/support/archive`  
REMOVED PRIMARY: `store-inquiries` (route KEEP)

09 알림:  
ROOT: `/admin/notifications` (send tools)  
DAILY: — (inbox remains Ops RT / bell; not a second leaf)  
FREQUENT: —  
CONFIG: `/admin/settings/notifications` (**moved from System**)  
ARCHIVE/TOOLS: push-devices

10 시스템:  
ROOT: customer-platform leaf (existing)  
DAILY: member deletion queue (existing)  
FREQUENT: users · reports  
CONFIG: app-config (minus notification prefs) · Prelaunch Reset  
ARCHIVE: platform-ops / growth-rec tools

### DUPLICATE AUDIT

TRUE DUPLICATES: none remaining (one path = one leaf)  
CONTEXT ENTRIES: trade chat / order chat under messenger with `from=` · AC → Control Planes  
SPECIALIST: Point / Feed / Popup / Placement under owners  
LEGACY: `ads-legacy` (+ `ads-paid`) · support store-inquiries **hidden**  
STUB: none promoted  
REMOVED/HIDDEN: `support-legacy`, `ads-delivery-ops` wrapper, primary `ads-paid`  
ALIASES PRESERVED: matchPaths / query / hash deeplinks unchanged

### CROSS-LINK

B2: domain dashboard roots unchanged  
B3: statement via finance/store context only  
B4: finance workspace root  
B5: ads workspace root  
B6: support workspace root  
RESET: System → Prelaunch Reset

### SCENARIOS

IA1 ORDER: PASS → `/admin/stores/orders`  
IA2 CASH: PASS → `/admin/finance`  
IA3 ADS: PASS → `/admin/delivery-ads`  
IA4 SUPPORT: PASS → `/admin/support`  
IA5 TRADE: PASS → `/admin/posts-management`  
IA6 STATEMENT: PASS → `/admin/finance?view=statement` (finance ownership)  
IA7 POPUP: PASS → `/admin/platform-popup`  
IA8 RESET: PASS → `/admin/prelaunch-reset`

### TABLET 1024×768

TOP LEVEL: PASS (10/10 matched)  
NESTED: PASS (scenario routes load)  
ACTIVE: PASS (workspace tabs + roots)  
BREADCRUMB: PASS on Control Planes / specialists; IA1 orders breadcrumb selector miss → B8 candidate  
BODY X: PASS (`overflowX=false`)  
SIDEBAR SCROLL: PASS (no X overflow)  
HEADER INTERFERENCE: not re-audited (B8)

Evidence: `prod-light-report.json` · `admin-ia-1024x768.png` · `finance-root-1024x768.png` · `ads-root-1024x768.png`

### PROOF

B7-01: PASS  
B7-02: PASS  
B7-03: PASS  
B7-04: PASS (operational frequency registry + menu order)  
B7-05: PASS  
B7-06: PASS  
B7-07: PASS  
B7-08: PASS  
B7-09: PASS  
B7-10: PASS  
B7-11: PASS  
B7-12: PASS  
B7-13: PASS  
B7-14: PASS  
B7-15: PASS  
B7-16: PASS  
B7-17: PASS  
B7-18: PASS  
B7-19: PASS  
B7-20: PASS  
B7-21: PASS  
B7-22: PASS  
B7-23: PASS (removed generic “캠페인” menu labels)  
B7-24: PASS (static breadcrumb ownership + prod Control Plane crumbs)  
B7-25: PASS  
B7-26: PASS  
B7-27: PASS (no returnTo/query rewrite)  
B7-28: PASS (permission filter untouched)  
B7-29: PASS (no new static badges)  
B7-30: PASS (no page rewrite)  
B7-31: PASS  
B7-32: PASS

FIRST DIVERGENCE: Finance B4 root buried under Point specialists  
ROOT OWNER: `components/admin/admin-menu.ts` finance children order  
ROOT CAUSE: workspace first-leaf became `/admin/point-charges` instead of `/admin/finance`

TYPECHECK: PASS (`typecheck:build`)  
LINT: PASS  
I18N: PASS (`verify:i18n-key-exposure`)  
BUILD: PASS (`npm run build`)  
NAV TESTS: PASS (B7 + CUT J SSOT contracts)

PRODUCTION LIGHT: PASS (`ok:true`, topCount=10, rootsOk, IA1–IA8)

B8 CANDIDATES:
- `/admin/stores/orders` breadcrumb not detected by shell selector (content/header IA)
- System workspace root still lands on Customer Platform (label vs purpose clarity)
- Content-level CTA/header/table parity across Control Planes (out of B7)

RESULT: **PASS / CLOSED / LOCK**

ARO-OPS-UX-002-B7 = PASS / CLOSED / LOCK

HARD STOP — B8 / B9 / B1R–B6 reopen forbidden in this cut.

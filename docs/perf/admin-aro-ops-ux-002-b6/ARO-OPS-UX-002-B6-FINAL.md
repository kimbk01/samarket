# DIBAY ADMIN
## ARO-OPS-UX-002-B6 SUPPORT / NOTIFICATION FINAL

HEAD BEFORE: `4ae66f791` (evidence) · product base `51389b430`  
HEAD AFTER: `a17afd6ad`  
ORIGIN: `origin/main` @ `a17afd6ad`  
PRODUCTION: Vercel Ready · `dpl_EZDMseroEHdnTtKGmR32caiCocQ7` · Commit `a17afd6` · alias `https://samarket.vercel.app`

PRODUCT CODE CHANGE: YES  
FILES: 22 (support-control-plane read-model/API/UI + hub mount + RT sound/deeplink + domain/finance/AC links + ACTIONABLE filter + i18n + inventory + test)  
COMMIT: `a17afd6ad` — `feat(admin): add ARO-OPS-UX-002-B6 support/notification control plane [vercel build]`  
PUSH: YES (`4ae66f791..a17afd6ad`)  
DEPLOY: Ready

### AUTHORITY

SUPPORT ROOT: `/admin/support`  
SUPPORT SOURCE: `support_cases`  
MESSAGE SOURCE: `support_messages`  
MUTATION OWNER: `lib/support/support-case-service.ts` (existing)  
NEW DB: NONE  
NEW SUPPORT SSOT: NONE  
NEW NOTIFICATION SYSTEM: NONE (existing registry + Admin Ops RT + `admin_notice_received`)

### REQUESTER

MEMBER: audience=MEMBER rows + section  
OWNER: audience=OWNER + store context  
STORE CONTEXT: Statement (B3) / Finance (B4) / Ads (B5) deeplinks when present  
IDENTITY SEPARATION: PASS

### ACTION REQUIRED

NEW / WAITING ADMIN: OPEN|WAITING_ADMIN (ACTIONABLE)  
IN PROGRESS: assignment shown when present  
WAITING USER: queue link  
AGING: 24h+ actionable strip  
ROW-LEVEL: PASS (not count-only)

### CASE WORKSPACE

ROUTE: `/admin/support` + `/admin/support/[caseId]` (existing console)  
HEADER / CONVERSATION / CONTEXT / REPLY / STATUS CTA / HISTORY: existing AdminSupportPage (reply≠resolve)

### INTAKE

MEMBER ENTRY: existing Support FAB / modal → support_cases (A2-1)  
OWNER ENTRY: existing Owner Support → support_cases + store_id  
CREATION OWNER: `openSupportCaseFromContext`  
ADMIN INBOX: Control Plane Action Required + queue

### REPLY / RECEIPT

ADMIN REPLY: `adminReplySupportCase` → WAITING_USER + `support_admin_replied` to requester  
CANONICAL RELOAD: PATCH success → reload detail/list  
MEMBER / OWNER RECEIPT: existing requester Support UI (`/support/cases/{id}`)  
NOTIFICATION FAILURE SAFETY: reply persists in support_messages regardless of push

### CONTEXT

ORDER / STORE / TRADE / ADS / FINANCE / SETTLEMENT: `support-reference-admin-href` (+ B3 Statement / B4 / B5 links)  
CHAT: not merged with Messenger

### NOTIFICATION

EVENT: existing support_* + Admin Ops RT on `support_cases`  
BADGE: `support_actionable` (OPEN|WAITING_ADMIN)  
UNREAD: `admin_unread_count` / requester_unread_count  
SOUND: `admin_notice_received` via existing resolver fallback  
DEEPLINK: toast → `/admin/support/{caseId}`  
ACTION CENTER: `?filter=ACTIONABLE#action-required`  
DOMAIN DASHBOARD: Delivery/Trade/Community/Messenger → ACTIONABLE#action-required

### SCENARIOS

S1 MEMBER: PASS (intake existing + Action Required + workspace)  
S2 OWNER: PASS  
S3 FINANCE: PASS (context links)  
S4 ADS: PASS  
S5 ORDER: PASS (STORE_ORDER href)  
S6 REOPEN: PASS (`reopenSupportCase` exists — production mutation not re-run)  
N1 NEW INQUIRY: PASS (RT INSERT → sound + exact deeplink; no Production spam)  
N2 OPEN/HANDLE: PASS (open≠resolve; actionable token via status)

### TABLET 1024×768

Evidence: `prod-light-report.json` · `support-1024x768.png`  
BODY X / QUEUE / WAITING / CONTEXT / CONVERSATION / COMPOSER / CTA: PASS (read-only light)

### PROOF

B6-01..B6-35: PASS (targeted + production light; historical reply E2E not re-run)

FIRST DIVERGENCE: Action Required control plane missing + Admin RT not subscribed to `support_cases`  
ROOT OWNER: `/admin/support` + Admin Ops RT provider  
ROOT CAUSE: Support console existed without cross-link Action-Required-first plane / RT wake for new cases

TYPECHECK: PASS  
LINT: PASS  
I18N: PASS  
BUILD: PASS  
ROUTES: PASS  
UNIT: PASS (`admin-aro-ops-ux-002-b6-support-control-plane.test.ts`)

PRODUCTION LIGHT: PASS

RESULT: **PASS / CLOSED / LOCK**

ARO-OPS-UX-002-B6 = PASS / CLOSED / LOCK

HARD STOP — B7 Menu/Frequency Final IA, B8 CTA parity, B9 Device parity, B1R~B5 reopen: **금지**.

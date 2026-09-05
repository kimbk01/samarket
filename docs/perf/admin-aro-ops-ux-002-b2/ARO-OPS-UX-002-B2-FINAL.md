# DIBAY ADMIN
## ARO-OPS-UX-002-B2 FINAL

DOMAIN DASHBOARD CONTROL PLANE

---

HEAD BEFORE: `e6827d58e` (B1R product)
HEAD AFTER: `3bee7e3c2`
ORIGIN: `https://samarket.vercel.app`
PRODUCTION: Vercel Ready for `3bee7e3c2`

Note: `f288b6763` on main was an accidental docs-only commit (wrong index during commit). Product B2 landed in `3bee7e3c2` with `[vercel build]`.

PRODUCT CODE CHANGE: YES  
COMMIT: `3bee7e3c2`  
PUSH: `origin/main`  
DEPLOY: Ready  

### SHARED DASHBOARD OWNER

COMPONENT: `components/admin/domain-dashboard/AdminDomainDashboardShell.tsx`  
READ MODEL: `lib/admin/domain-dashboard/load-*-domain-dashboard.ts`  
NO NEW DB: YES  
NO NEW MUTATION: YES (read-only composition)

Anatomy: Action Required → Current State → Domain Status → Issues → Primary entries → Context → Recent

### DELIVERY

ROUTE: `/admin/delivery` (workspace root)  
CURRENT STATE: stores total / open / closed / restricted (`business_ops_kpi`)  
ACTION REQUIRED: orders attention, pending orders, settlements, store approval, store reports, delivery ads, support (`action_queue` + KPI)  
ORDER: in-progress / delivering / completed / cancelled (`store_orders` head counts)  
STORE: `/admin/business` + ops entries  
SETTLEMENT: `/admin/store-settlements?settlement_status=scheduled`  
ADS: `/admin/delivery-ads`  
SUPPORT: `/admin/support`

### TRADE

ROUTE: `/admin/trade`  
CURRENT STATE: total / active / sold / hidden / deleted(status)  
ACTION REQUIRED: product reports, promo pending  
CATEGORY: posts-management tabs (trade / used_car / real_estate / jobs)  
CHAT: `/admin/chats/trade`  
PROMOTION: `/admin/ad-applications?domain=trade`  
RESET: `?scopes=trade_content`  
Posts list remains `/admin/posts-management` (separate)

### COMMUNITY

ROUTE: `/admin/community`  
CURRENT STATE: posts/comments totals + today + hidden + deleted  
ACTION REQUIRED: general reports, meeting reports  
REPORT: `/admin/community/reports`  
MEETING: `/admin/philife/meeting-reports`  
PROMOTION: `/admin/community/promotions`  
POINT: `/admin/community/point-policies`  
RESET: `?scopes=community_posts`  
W3 list owners unchanged

### MESSENGER

ROUTE: `/admin/messenger` (workspace root)  
CURRENT STATE: general / group / trade / order / messenger reports (separate sources)  
ACTION REQUIRED: CM reports, trade chat reports, blocked rooms  
GENERAL: `community_messenger_rooms.chat_domain=general_direct` → `/admin/chats/general`  
GROUP: `chat_domain=group` → `/admin/chats/group`  
TRADE: `product_chats` → `/admin/chats/trade`  
ORDER: `store_orders` with room id → `/admin/order-chats`  
REPORT: `/admin/chats/reported`  
RESET: `?scopes=chat`  
Authorities not merged

### GLOBAL LINKAGE

ACTION CENTER: `/admin#action-center` on each domain context  
FINANCE / ADS / SUPPORT / NOTIFICATIONS: context entries (no SSOT duplication)

### TABLET (1024×768 Production light)

DELIVERY: PASS  
TRADE: PASS  
COMMUNITY: PASS  
MESSENGER: PASS  

BODY X: PASS (no overflow)  
CTA / CARD CLIPPING: PASS (sections + entries visible)

### PROOF

D1–D8: PASS (route + real sources + deeplinks + no new mutation)  
T1–T8: PASS  
C1–C8: PASS  
M1–M8: PASS  

FIRST DIVERGENCE: none (after correcting mis-commit)  
ROOT OWNER: `AdminDomainDashboardShell` + domain loaders  

TYPECHECK: PASS  
LINT: PASS  
I18N: PASS  
BUILD: PASS  

PRODUCTION LIGHT: PASS (`aro-ops-ux-002-b2-prod-light.json`)

RESULT: **PASS**

ARO-OPS-UX-002-B2 = PASS / CLOSED / LOCK

REAL-WORLD ADMIN READY = **FAIL** (B3+ remaining)

### HARD STOP

B3 Store Financial Statement **not** started.

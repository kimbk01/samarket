# DIBAY ADMIN
## ARO-OPS-UX-002-B8 REMAINING CLOSE FINAL

HEAD BEFORE: `9ff1f37da` (CI IA align · product base `9c11ed2aa` B8 closed)  
HEAD AFTER: `636462a3a`  
ORIGIN: `origin/main` @ `636462a3a`  
PRODUCTION: Vercel Ready · `dpl_33kpYgoGHA5Y7GLS8r66qb47j9j7` · alias `https://samarket.vercel.app`

PRODUCT SHA: `636462a3a`  
EVIDENCE SHA: (this docs commit, if pushed) · artifacts under `docs/perf/admin-aro-ops-ux-002-b8-remaining/`  
DEPLOYMENT: Ready · `dpl_33kpYgoGHA5Y7GLS8r66qb47j9j7`

UNRELATED FILES INCLUDED: **NONE** (product commit staged list verified)

### PRESERVED CLOSED B8

SHELL: LOCK (unchanged)  
HEADER: LOCK (unchanged)  
BREADCRUMB: LOCK (unchanged)  
SYSTEM LABEL: LOCK (unchanged)  
CONTROL PLANE CHROME: LOCK (unchanged)  
1024 GEOMETRY: LOCK (bodyX=0 on U3/U4/U8 prod light)

### R1 MODAL / STICKY

MODAL OWNER: `dibay-overlay` / `DibayDialog`  
ROOT CAUSE: long confirm/prompt content could grow past viewport without body scroll owner; admin table H-scroll `z-40` competed visually with sticky chrome  
SHARED FIX: dialog `max-height` + `dialogScroll` body + sticky actions; H-scroll `z-30` + hide while overlay open  
REPRESENTATIVE ROUTES: Trade / Community / Chat hard confirm (open→cancel)  
FOOTER VISIBLE: PASS  
BOTTOM OBSTRUCTION: PASS (false)  
STICKY CONFLICT: PASS (sticky hidden under overlay)  
RANDOM ROUTE PATCH: NONE (trade `md:hidden` H-scroll only data-attr + z demote)

### R2 SPECIALIST CTA

ORDERS: state-valid (refund CTA only on `refund_requested`; detail links secondary) — code audit PASS  
STORE: review open/close presentation; no new delete lifecycle  
TRADE: BulkBar soft/hard danger hierarchy preserved (B1R)  
COMMUNITY: posts row CTA gated by status; comments soft-only + confirm; hard CTA not exposed for comments  
CHAT: hide = secondary `AdminActionButton`; DB 영구 삭제 = danger + ring; group separator  
SETTLEMENT: `allowedModes` blocks paid→approve on paid  
RESET: existing danger band preserved (no execute)

STATE-INVALID CTA: fixed on community posts/comments row gates  
DANGER HIERARCHY: PASS (Trade/Community/Chat)  
DISABLED REASON: N/A (actual disabled via selection/busy only)  
MUTATION OWNER CHANGED: NONE

### U3 TRADE CURRENT VISUAL

ROUTE: `/admin/posts-management?tab=trade`  
SOFT CTA: present after selection (BulkBar)  
HARD CTA: `hard_delete` / typed DELETE prompt  
DANGER SEPARATION: PASS  
CONFIRMATION: open→cancel PASS · footerVisible  
FOOTER: PASS  
OBSTRUCTION: false  
BODY X: 0  
MUTATION: NONE  
SCREENSHOT: `u3-trade-base-1024x768.png` · `u3-trade-hard-confirm-1024x768.png`

### U4 COMMUNITY CURRENT VISUAL

ROUTE: `/admin/community/posts`  
STATE VALID: row hide/soft/restore gated  
SOFT/HARD: soft confirm + hard typed DELETE where allowed  
DANGER: PASS  
CONFIRMATION: PASS  
FOOTER: PASS  
OBSTRUCTION: false  
BODY X: 0  
MUTATION: NONE  
SCREENSHOT: `u4-community-base-1024x768.png` · `u4-community-hard-confirm-1024x768.png`

### U8 CHAT CURRENT VISUAL

ROUTES: `/admin/chats` + `/admin/chats/trade`  
HIDE: `admin_chat_remove_list_only` · secondary  
PERMANENT DELETE: `admin_chat_delete_from_db` · danger  
DANGER: PASS  
CONFIRMATION: typed DELETE open→cancel PASS  
FOOTER: PASS  
OBSTRUCTION: false  
BODY X: 0  
MUTATION: NONE  
SCREENSHOT: `u8-chat-all-base-1024x768.png` · `u8-chat-hard-confirm-1024x768.png` · `u8-chat-trade-base-1024x768.png`

### GEOMETRY

VIEWPORT: 1024×768  
BODY CLIENT WIDTH: 1024  
BODY SCROLL WIDTH: 1024  
MODAL RECT: see `prod-light-report.json` (U3/U4/U8 confirm)  
FOOTER RECT: within viewport  
STICKY RECT: null under overlay  
OVERLAP: false

### PROOF

BR-01: PASS  
BR-02: PASS  
BR-03: PASS (shared DibayDialog)  
BR-04: PASS  
BR-05: PASS (audit)  
BR-06: PASS (audit)  
BR-07: PASS  
BR-08: PASS  
BR-09: PASS (visual typed DELETE)  
BR-10: PASS  
BR-11: PASS (comments soft-only)  
BR-12: PASS  
BR-13: PASS  
BR-14: PASS  
BR-15: PASS  
BR-16: PASS (audit `allowedModes`)  
BR-17: PASS (audit Reset danger band)  
BR-18: PASS  
BR-19: PASS  
BR-20: PASS  
BR-21: PASS  
BR-22: PASS  
BR-23: PASS  
BR-24: PASS  
BR-25: PASS  

TYPECHECK: PASS  
LINT: PASS  
I18N: PASS  
BUILD: PASS  

PRODUCTION LIGHT: PASS (`prod-light-report.json` ok=true · run2)

### LOCK PRESERVATION

B1R: preserved  
B2: preserved  
B3: preserved  
B4: preserved  
B5: preserved  
B6: preserved  
B7: preserved  

NEW DB: NONE  
NEW API: NONE  
NEW MUTATION: NONE  
NEW LIFECYCLE: NONE  
IA CHANGE: NONE  

REAL-WORLD ADMIN READY: **FAIL**

RESULT: **PASS / CLOSED / LOCK** (B8 remaining + closed base)

HARD STOP: B9 not started.

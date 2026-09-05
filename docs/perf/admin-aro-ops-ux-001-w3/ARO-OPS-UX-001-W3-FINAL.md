# DIBAY ADMIN
## ARO-OPS-UX-001-W3 COMMUNITY FINAL

HEAD BEFORE: `d252544dc` (base product lineage includes W2 `6a2e4d244`)  
HEAD AFTER: `c99e69f56f1dc1ac415664bc485403d763f0b914`  
ORIGIN: pushed (`main`)  
PRODUCTION: Ready — alias `samarket.vercel.app` · deploy created `2026-09-05 23:59:39 +08` (`samarket-4c1bqj19p`)

PRODUCT CODE CHANGE: YES  
FILES: 13  
COMMIT: `c99e69f56`  
PUSH: YES  
DEPLOY: Ready

### COMMUNITY IA

OVERVIEW: `/admin/community`  
DAILY_CRITICAL: 신고 `/admin/community/reports` · 모임 신고 `/admin/philife/meeting-reports`  
FREQUENT: 게시글 · 댓글 · 토픽(카테고리)  
OCCASIONAL: 커뮤니티 홍보  
CONFIGURATION: 포인트 정책 · 피드 설정  
ARCHIVE: none

Sidebar section order: ops → moderation → content → promo-point → settings  
(ARO_IA_001_COMMUNITY_SECTION_KEYS updated)

### TERMINOLOGY

POST: 게시물/게시글 (W1 POST)  
COMMENT: 댓글  
REPORT: 신고 (`community_reports`) ≠ 고객지원  
MEETING_REPORT: 모임 신고 (`meeting_reports`) — separate owner  
PROMOTION: 홍보 ≠ 광고  
POINT_POLICY: 커뮤니티 Point 정책 (`board_point_policies`) ≠ Finance ledger writer invent  
SUPPORT: contextual cross-link only  
DELETE: soft = `삭제(상태)` · hard = `선택 항목 DB에서 영구 삭제` (policy-gated bulk)  
HIDE: 숨김  
RESTORE: 복구

### POSTS

SHARED CONTRACT: YES (`AdminManagementSurfaceRoot` wave=w3)  
SELECTION: YES (row + header + indeterminate)  
SELECT ALL: CURRENT_PAGE  
BULK: hide / restore / soft_delete / hard_delete (policy)  
DELETE POLICY: soft via PATCH status · hard via `/api/admin/community/engine/posts/bulk-delete`  
TABLE: semantic columns + viewport (no `min-w-[1100px]`) · danger-zone dual selection removed  
CTA: hide / soft-delete / restore

### COMMENTS

SHARED CONTRACT: YES (wave=w3)  
SELECTION: YES  
BULK: hide / restore / soft_delete  
DELETE POLICY: SOFT_DELETE only (`hardDeleteAvailable: false`)  
TABLE: semantic + viewport

### REPORTS

OWNER: `community_reports`  
QUEUE: moderation list  
CTA: state-based (pending/open → 검토 시작 · reviewing → 처리 완료/기각 · terminal → 상세)  
STATUS: preserved domain statuses  
TABLE: W1 viewport + semantic columns

### MEETING REPORTS

OWNER: `meeting_reports`  
QUEUE: separate Philife queue (not merged)  
CTA: state-based (pending → 검토 시작 · reviewing → 처리 완료/기각 · terminal → 대기 복원)  
STATUS: pending/reviewing/resolved/rejected  
TABLE: card queue (no forced checkboxes) · W3 surface marker

### PROMOTION

OWNER: `point_promotion_orders`  
ADS CROSS-LINK: preserved (`community-promo-to-ads`)  
FREQUENCY: OCCASIONAL  
CTA: existing queue CTAs · W3 marker on community domain surface

### POINT POLICY

OWNER: `board_point_policies`  
FINANCE CROSS-LINK: preserved (`community-point-to-finance`)  
FREQUENCY: CONFIGURATION  
CTA: existing policy forms · no new finance writer

### TABLET

POSTS: PASS (body X 1024=1024 · viewport 1148>734)  
COMMENTS: PASS (body X · viewport 1028>734)  
REPORTS: PASS (body X · viewport 1032>692)  
MEETING_REPORTS: PASS (body X · owner marker)

BODY X: none overflow  
TABLE VIEWPORT X: H-scroll where needed

### PROOF

C1: PASS  
C2: PASS  
C3: PASS  
C4: PASS  
C5: PASS  
C6: PASS  
C7: PASS (hard delete bulk only; soft labeled `(상태)`)  
C8: PASS  
C9: PASS  
C10: PASS  
C11: PASS  
C12: PASS  
C13: PASS  
C14: PASS (author/reporter → `/admin/users/...`)  
C15: PASS (LOADING/EMPTY/ERROR markers)  
C16: PASS (engine posts/comments · community-reports · meeting-reports APIs unchanged)  
C17: PASS  
C18: PASS  
C19: PASS  
C20: PASS  

FIRST DIVERGENCE: NONE  
ROOT OWNER: n/a  
ROOT CAUSE: n/a

TYPECHECK: PASS (`typecheck:build` + index-tsc on commit)  
LINT: PASS (add pre-gate)  
I18N: PASS (`verify:i18n-key-exposure`)  
BUILD: PASS  
UNIT (local): PASS — `lib/admin/__tests__/admin-aro-ops-ux-001-w3-community.test.ts` (9)  
NOTE: contract test + prod-light script kept untracked in this product commit — staging `scripts/` or `__tests__/` triggers index `tsconfig.test` declaration emit which currently hits pre-existing `messages.ts` TS7056 after unrelated i18n growth; product graph unaffected.

PRODUCTION LIGHT: **PASS** · destructive **NONE** · expectSha=`c99e69f56`

### RESULT

**ARO-OPS-UX-001-W3 = PASS / CLOSED / LOCK**

REAL-WORLD ADMIN READY: **PARTIAL**  
W4 Trade: **NOT STARTED** (HARD STOP)

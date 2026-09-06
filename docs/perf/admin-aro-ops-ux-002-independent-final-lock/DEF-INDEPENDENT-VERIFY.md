# DEF INDEPENDENT VERIFY (source @ post-fix `3d90c3e05` / prior claim `85480b40b`)

Authority: current source + Production — not prior FINAL-LOCK.md.

| DEF | Verdict | Evidence summary |
|---|---|---|
| 001 | **PASS** | Primary `businessCcBackToStoreHref(storeId)`; public secondary only |
| 002 | **PASS** | `messengerActionableCount` → `/admin/chats/reported` |
| 003 | **PASS** | Critical counts via `markUnavailable`; error→unavailable not “0건” |
| 004 | **PASS** | Cash GET/POST `requireAdminPermission("business")`; no `cash` key |
| 005 | **PASS** | Canonical `business_cash_charge_requests`; legacy ads READ; AST-002 410; actionable excludes store_charges |
| 006 | **PASS** | `requestId` + `status=all` when focusing; R6 LIVE |
| 007 | **PASS** | `membershipId` href+consumer; R7 list LIVE (exact fixture optional) |
| 008 | **PASS** | AC `?status=actionable`; page+API consume; R8 LIVE |
| 009 | **PASS** | Session `listHiddenIds`; copy refresh-restore; no localStorage |
| 010 | **PASS** | Seed policy documents hide vs bulk-delete vs Prelaunch; no merge |
| 011 | **PASS after fix** | Was P1 contract drift (`view=statement`); aligned to `businessCcFinancialStatementHref(storeId)` only |
| 012 | **PASS** | Thumbnail-only label present |
| 013 | **P2 NON_BLOCKING** | `ads-legacy` last under Ads, demoted `partial`, not canonical Delivery Ads control |
| 014 | **PASS** | Recent → `/admin/community/posts/{id}` |

## Three corrected decisions

### DEF-004
- CANONICAL PERMISSION: **`business`**
- EVIDENCE: Coin/store-finance/gift same; Cash route comments + gates; `AdminPermissionKey` has no cash
- RESULT: **PASS**

### DEF-005
- CLASSIFICATION: **B** legacy ads READ + **D** AST-002 ≠ Cash
- ACTIVE SSOT: `business_cash_charge_requests` + `/api/admin/business-cash-charges`
- RESULT: **PASS** (ACTIVE_DUPLICATE_CHARGE_SSOT=0)

### DEF-009
- SEMANTICS: **A ADMIN_PERSONAL_PREFERENCE (session)**
- PERSISTENCE: React Set only; refresh restores
- RESULT: **PASS**

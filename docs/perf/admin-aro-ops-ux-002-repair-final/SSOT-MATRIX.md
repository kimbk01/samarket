# ARO-OPS-UX-002 — Post-repair SSOT Matrix

Date: 2026-09-06  
Design: `IMPLEMENTATION-DESIGN.md` (3 mandatory corrections applied)

| Domain | Canonical owner | Legacy / archive | Permission | Notes |
|---|---|---|---|---|
| Cash top-up | `business_cash_charge_requests` + `/api/admin/business-cash-charges` | `delivery_ad_business_cash_charge_requests` READ (B) · writes 410 | **`business`** (DEF-004 A — no `cash` key) | Coin/store-finance same owner |
| Member Point charge | `point_charge_requests` + point APIs | — | `point` | Separate from Cash |
| AST-002 store_point charges | archive count only | table + GET; writes 410 | generic admin | **D** not Cash ops truth |
| Action Queue counts | `loadAdminActionQueueCounts` | — | — | error → `unavailable[]` (DEF-003) |
| Messenger AC card | `messenger_actionable` (CM reports + trade chat reports) | hardcoded 0 removed | — | href `/admin/chats/reported` |
| Order → Store | `businessCcBackToStoreHref(storeId)` | public `/stores/slug` secondary | — | DEF-001 |
| Support → Cash | `?requestId=` consumed by Cash queue | — | — | DEF-006 |
| Support → Partner | `?membershipId=&status=` | list-only removed | — | DEF-007 |
| Store onboarding | `/admin/stores?status=actionable` | unfiltered list | — | DEF-008 |
| Chat hide | session `listHiddenIds` (A preference) | no localStorage | — | DEF-009 |
| Chat hard wipe | bulk-delete API vs Prelaunch `scopes=chat` | dual owners documented in seed-policy | — | DEF-010 |
| Finance statement link | `/admin/finance?storeId=` | `view=statement` no longer emitted | — | DEF-011 |
| Placement map preview | labeled thumbnail-only | full renderer on detail/studio | — | DEF-012 |
| ads-legacy nav | demoted last under Ads (B7 contract) | primary still shows group | — | DEF-013 residual demoted |
| Community recent | `/admin/community/posts/{id}` | generic list href removed | — | DEF-014 |

## Classification decisions (corrected)

| DEF | Decision | Evidence |
|---|---|---|
| 004 | **A** reuse `business` | Coin + store-finance + gift already `business`; Cash = store ledger |
| 005 | **B** legacy ads charge READ · **D** AST-002 ≠ Cash | Separate tables; writes 410; AC uses `cash_charges` |
| 009 | **A** session preference | Catalog already session-only; no preference SSOT → no localStorage |

# ARO-OPS-UX-002 — IMPLEMENTATION DESIGN (corrected)

Evidence root: `docs/perf/admin-aro-ops-ux-002-repair/`  
Authority: PLAN REVIEW — APPROVED WITH 3 MANDATORY CORRECTIONS. No premature `cash` key, no expected DEF-005 class, no DEF-009 localStorage invention.

---

## DEF-004 Cash permission — evidence → decision

### Trace

| Surface | Gate today |
|---|---|
| `AdminPermissionKey` | `business` (= 매장/배달), `point`, `ads` — **no `cash`** |
| Coin withdrawals | `requireAdminPermission("business")` |
| Store finance / statement / finance-control-plane | `requireAdminPermission("business")` |
| Gift / cash-outs / settlements-adjacent gift | `requireAdminPermission("business")` |
| Member Point APIs | `requireAdminPermission("point")` |
| Canonical Cash queue `/api/admin/business-cash-charges` | `requireAdminApiUser` only |
| Legacy delivery-ads business-cash* | `requireAdminApiUser` (writes 410) |

### Classification

**A — existing canonical permission already covers Cash: `business`.**

Reasons:
1. Cash is store Business Cash ledger (`business_cash_charge_requests`), same Store economic domain as Coin withdrawals / store-finance.
2. Coin already locked under `business`; adding `cash` would **split** Store economic permission SSOT.
3. `point` is member Point ops — different domain; must not absorb Cash.
4. Operator role already has `business` without `point`/`ads` — correct for store ops including Cash.

### Fix (minimal)

- Gate Cash canonical READ/WRITE with `requireAdminPermission("business")`.
- **Do not** add `cash` to `AdminPermissionKey` / DEFAULT_PERMISSIONS / label groups.
- No parallel permission architecture.

### Tests

- Source contract: Cash route contains `requireAdminPermission("business")` and does **not** invent `"cash"`.

---

## DEF-005 Charge SSOT — evidence → decision

### Trace

| Role | Path | Table / behavior |
|---|---|---|
| CURRENT OPERATIONAL READ+MUTATE | `/api/admin/business-cash-charges` | `business_cash_charge_requests` + AST-005 writer |
| HISTORICAL READ | `/api/admin/delivery-ads/business-cash/charge-requests` | `delivery_ad_business_cash_charge_requests` (adapter comment: historical ads-specific) |
| HISTORICAL WRITE | same + `[id]` PATCH / business-cash POST | **410 NO_NEW_WRITE** |
| AST-002 READ | `/api/admin/store-point-charges` | `store_point_charge_requests` |
| AST-002 WRITE | `[id]` | **410** |
| Action queue | counts both `store_charges` + `cash_charges`; actionable finance **excludes** `store_charges` | CUT E |

### Classification

- Legacy ads charge-request GET vs canonical Cash: **B LEGACY_COMPAT_READ** (different historical table; writes already dead).
- AST-002 store_point charges vs Cash: **D DIFFERENT_BUSINESS_CONCEPT** (archive / not Cash ops truth).

### Fix (minimal)

- Keep canonical Cash as only active Cash authority.
- Do not merge tables or invent migration.
- Ops UI / AC finance cards already use `cash_charges`; ensure legacy surfaces are not treated as pending Cash truth (label/archive only if still linked).
- No new tables.

---

## DEF-009 Chat hide — evidence → decision

### Trace

| Evidence | Finding |
|---|---|
| Implementation | `listHiddenIds` React `Set` in `AdminChatListPage` — client only |
| Button copy | `admin_chat_remove_list_only` = "관리 목록에서 숨김" / "Hide from admin list" |
| Success copy | `admin_chat_hidden_list_only` = **screen list only; refresh restores** |
| Sibling (delivery orders) | explicit “this browser session” for hide-list |
| Server/API / management policy / preference store | **none** for chat list hide |
| Separate actions | Trade ops close · DB hard-delete · Prelaunch Reset — room lifecycle / wipe |

### Classification

**A ADMIN_PERSONAL_PREFERENCE** (session/screen list filter — not persisted management, not room lifecycle).

### Fix (minimal)

- **Do not** add isolated `localStorage` SSOT.
- Keep React Set; strengthen copy if needed so operators cannot confuse hide with moderation/lifecycle.
- Persistence across sessions would require new Admin preference architecture → **not invented here**.

---

## Other DEFs (unchanged direction)

| ID | Root | Fix |
|---|---|---|
| DEF-003 | `safeCount` error→0 | Mark non-missing errors `unavailable`; UI never shows 0 for those |
| DEF-002 | `domain-chat` `count: 0` | Wire messenger dashboard actionable (CM reports + trade chat reports) → `/admin/chats/reported` |
| DEF-001 | Order Store link public | `businessCcBackToStoreHref(order.storeId)` + optional public secondary |
| DEF-006 | `?requestId=` unused | Cash queue consume focus/highlight |
| DEF-007 | Partner drops id | href + consume `membershipId` |
| DEF-008 | stores URL status ignored | seed `status` / `actionable` |
| DEF-010 | hard-delete vs Reset | clarify owners; add chat to management seed-policy matrix |
| DEF-011–014 | P2 | scoped cleanup only |

---

## Continuous execution

Phase 1 → 2 → gates/commits → `git push origin main` → bind Production → R1–R14 → full re-audit → HARD LOCK judgment. No intermediate STOP unless architecture blocker.

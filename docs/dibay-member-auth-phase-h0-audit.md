# DIBAY MEMBER / AUTH — PHASE H-0 AUDIT ONLY

**Status:** ⏳ **IN PROGRESS** (2026-08-07)  
**Mode:** Audit only — **no implementation · no deletion · no HARD LOCK · no PHASE H execute**  
**Goal:** Inventory product gaps vs legacy-class member admin + list H removal targets so the program does not stall on Ops-only wait.

**Relation to §13.2 / §14:** Ops acknowledgment remains required before HARD LOCK declaration. H-0 runs **in parallel** as product/legacy audit — it does **not** replace §13.2 and does **not** authorize deletes.

```text
A–G Gate COMPLETE
        │
        ├─ §13.2 Ops Acknowledgment (governance) — still OPEN
        │
        └─ H-0 Audit (this doc) — product + legacy inventory
                ↓
         Delete Plan (after H-0 CLOSE)
                ↓
         (§13.2 CLOSE + §14 HARD LOCK — when Ops done)
                ↓
         PHASE H execute: isolate → remove writers → authority → files
                ↓
         Runtime verify between steps
```

---

## 0. Verdict snapshot

| Area | Finding |
|---|---|
| Membership Grant/Revoke SSOT | ✅ Shipped + F PASS |
| Person Directory / Detail (E) | ✅ Core projection shipped; **product completeness gaps remain** |
| Legacy-class member admin | ❌ **Not complete** — see §1–2 gaps |
| Dual-read / dual-write | ⏳ Transitional — H cutover candidates |
| `test_users` | ⏳ Still in product paths — H isolate first |
| Dead UI / helpers | 📋 Listed §6 — **do not delete in H-0** |

---

## 1. Admin Member List (Person Directory) audit

**Live:** `app/admin/users/page.tsx` → `AdminUserListPage` · API `app/api/admin/users/route.ts`

| Capability | Verdict | Notes |
|---|---|---|
| Search | PRESENT | param `search` only; ilike nickname/username/email/… — **not UUID/phone** |
| Role / accountCategory filter | PRESENT | member / store_manager / admin via stores+membership |
| Status filter | PRESENT | aggregated statusCategory |
| Provider filter | **MISSING** | summary counts only |
| Status display | PRESENT | badge; not raw moderation columns |
| Provider column | PRESENT | |
| UUID primary | **MISSING** | nickname/@id visual primary; contract wants UUID |
| Join date | PRESENT | |
| Last login / active | **MISSING in UI** | API maps `last_login_at`; table unused |
| Store relation | **PARTIAL** | API `storeRelation`; UI only role tint |
| Admin membership | **PARTIAL** | folded into admin role badge |
| QA / internal badges | **MISSING** | PHASE D field not in UI |
| Suspend / Ban on list | **PARTIAL** | Suspend button disabled; ActionPanel orphaned |
| Audit trail on list | **MISSING** | |
| Pagination | **PARTIAL** | client slice; API loads all |
| Sort | **PARTIAL** | fixed `created_at` desc |

---

## 2. Person Detail audit

**Live:** list modal → `AdminMemberDetail` (`AdminTestUserDetail.tsx`).  
`/admin/users/[id]` redirects to `?detail=`. `AdminUserDetailPage` **unmounted**.

| Capability | Verdict | Notes |
|---|---|---|
| Member profile | PRESENT | |
| Store list | PRESENT | `owner_user_id` |
| Admin membership | PRESENT | read-only |
| Activity | PARTIAL | honest `not_implemented`; points/orders can show fake `0` |
| Moderation actions | PARTIAL | Suspend disabled; withdraw wired; ActionPanel orphaned |
| Staff permissions on detail | **MISSING** | Staff tab only |
| Provider / identities | PARTIAL | email heuristic; API omits provider fields |
| Internal/password ops notes | **MISSING** | |
| Soft-delete visibility | PARTIAL | API has `deleted_at`; UI resolver weak |
| Grant/revoke on detail | **MISSING** | |

---

## 3. Top product gaps (legacy-class member admin)

1. UUID not primary (copyable) on list/detail header  
2. No server pagination / cursor  
3. Last login not shown (API already has data)  
4. No provider filter  
5. Search cannot find UUID / phone  
6. Suspend/Ban not operable on live list/detail (stubs; panel orphaned)  
7. Moderation audit UI not mounted  
8. List store count/approval not shown  
9. No QA / internal / ops class badges  
10. Detail provider not from `profiles.auth_provider`  
11. Activity aggregates unimplemented; points can fake `0`  
12. No grant/revoke/permissions on Person Detail  
13. No CS / ops notes on person  
14. Soft-delete state poorly surfaced  
15. No user-controlled sort  

**H-0 implication:** Completing “회원관리 레거시 수준” is **product work after audit**, not silent under Ops wait. Sequence remains: audit → plan → (HARD LOCK when Ops ready) → H isolation/removal for dead authority; **product gaps may be a parallel completion track** — do not confuse with “delete dead files first.”

---

## 4. Bootstrap 운영 (contract vs reality)

| Item | Status |
|---|---|
| Contract §3 / §3.1 | DEFINED |
| F runtime Super Admin | PROVEN (Dev evidence) |
| Env Ops acknowledgment | **OPEN** — `docs/dibay-member-auth-phase-g-ops-acknowledgment.md` |
| aaaa scripts write membership? | **NO** — profiles-only privilege seed gap (`ensure-e2e-aaaa…`, `bootstrap-aaaa-master-admin.sql`) |

H-0 does not close §13.2. Ops doc remains the governance path.

---

## 5. Legacy Authority inventory (H removal planning)

| Artifact | CURRENT role | H intent |
|---|---|---|
| `admin_memberships` | TARGET SSOT (write via staff) | **KEEP** |
| `admin_staff_permissions` | Granular staff keys | **KEEP** |
| Dual-read (`role` OR membership) | Live on `requireAdmin*` / SQL `is_platform_admin` | Cut over → membership-only |
| `profiles.role` privilege | Still dual-written; sole authority on `isRouteAdmin` + many bypasses | Stop dual-write → stop gate reads |
| `test_users` | ensure-from-test_users privilege; cleanup API; mirrors | Isolate writers → then readers → table later |
| Dual-write in `admin-membership.ts` | Keeps role in sync | Stop after membership-only gates |

### Proposed H execute order (plan only — not started)

1. Freeze new privilege via `test_users` (ensure admin roles / cleanup)  
2. Stop dual-write of privilege on profiles (membership-only mutations)  
3. Cut all gates to membership-only (`isRouteAdmin` first skew)  
4. Deprecate `profiles.role` as admin authority  
5. Isolate `test_users` product paths  
6. Remove duplicate authority helpers  
7. Dead file / orphan UI removal + runtime verify  

---

## 6. Dead Writer inventory

### Privilege writers → `profiles.role` / `is_admin` / `admin_tier`

| Path | Class |
|---|---|
| `lib/admin/admin-membership.ts` upsert/revoke dual-write | TRANSITIONAL |
| `app/api/admin/staff/route.ts` · `[id]/route.ts` | PRODUCT + TRANSITIONAL |
| `app/api/admin/users/[id]/route.ts` ensure-from-`test_users` | **LEGACY** |
| `app/api/admin/users/[id]/route.ts` PATCH demote without membership revoke | **LEGACY / gap** |
| `ensure-profile-for-user-id` / member create defaults `user` | PRODUCT (non-admin) |
| `scripts/ensure-e2e-aaaa-manual-auth.mjs` | SCRIPT — **no membership** |
| `supabase/scripts/bootstrap-aaaa-master-admin.sql` | SQL — **no membership** |

### Writers → `admin_memberships`

| Path | Class |
|---|---|
| `admin-membership.ts` + staff APIs | PRODUCT SSOT |
| Migration backfill | SQL |

### Writers → `test_users` (mutate)

| Path | Class |
|---|---|
| `app/api/admin/users/cleanup/route.ts` | LEGACY (still UI-wired) |
| `app/api/me/store-orders/route.ts` contact mirror | LEGACY non-privilege |
| aaaa ensure / bootstrap SQL | SCRIPT |

### Gate skew (critical)

| Gate | Reads |
|---|---|
| `requireAdmin` / `requireAdminApiActor` | Dual-read |
| **`isRouteAdmin`** (many `/api/admin/*`) | **`profiles.role` only** |
| SQL `is_platform_admin` | Dual-read |
| Phone/onboarding admin bypasses | Often role-only |

---

## 7. Dead File candidates (LIST ONLY — do not delete)

| Path | Reason | Confidence |
|---|---|---|
| `components/admin/users/AdminUserSummaryCards.tsx` | Unused; replaced by ListSummaryCards | HIGH |
| `components/admin/users/AdminUserModerationLogList.tsx` | Unused export | HIGH |
| `components/admin/users/AdminUserModerationEventsList.tsx` | Unused export | HIGH |
| `components/admin/users/AdminUserActionPanel.tsx` | Unused (ops panel orphaned) | HIGH |
| `components/admin/users/AdminUserDetailPage.tsx` | Unrouted; redirect uses modal | HIGH |
| `loadProfileRole` in `admin-user-server.ts` | Never called | HIGH |
| `verifyAdminUserId` / `verifyAdminAccess` | No call sites | HIGH |
| `getAllowedAdminEmails` in `admin-policy.ts` | Always `[]`, unused | HIGH |
| `app/api/admin/users/cleanup/route.ts` | Legacy purge authority | MED (wired — isolate before delete) |
| `AdminTestSwitcher` / test-login client switch | Impersonation / local role | MED |
| `bootstrap-aaaa-master-admin.sql` | Privilege without membership | MED (rewrite/retire in H) |
| `AdminTestUserDetail.tsx` | Alive (modal) — rename later | LOW |

---

## 8. H-0 CLOSE criteria (audit)

H-0 may CLOSE when:

1. §§1–7 recorded (this doc)  
2. Owner accepts product-gap list as backlog vs H-delete list as isolation targets  
3. No deletes / no privilege cutover code started under H-0 label  

Then:

- **Delete Plan** document (H-1 plan) from §5–7  
- Continue §13.2 Ops in parallel  
- **PHASE H execute** only after plan + (for HARD LOCK path) §14 when Ops closed  

---

## 9. Explicit non-goals of H-0

- ❌ Implement Membership Suspend  
- ❌ Declare HARD LOCK  
- ❌ Delete `test_users` or dead files  
- ❌ Membership-only cutover code  
- ❌ “Ops wait only” as the sole remaining work  

---

## 10. Next

1. Owner review this audit (product gaps vs H-delete targets)  
2. Produce **Delete Plan** (ordered, no execute)  
3. Keep filling `docs/dibay-member-auth-phase-g-ops-acknowledgment.md` for §13.2  
4. Do **not** start PHASE H deletes until Delete Plan accepted  

# DIBAY MEMBER / AUTH — PHASE D STRUCTURE DESIGN

**Status:** PHASE D CLOSED (2026-08-07 owner acceptance) · Production Password Policy **P2 LOCKED**  
**Date:** 2026-08-07  
**Depends on:** PHASE A–B CLOSED · PHASE C CLOSED (`docs/dibay-member-auth-phase-c-ssot-design.md`)  
**Parent contract:** `docs/dibay-member-auth-account-hard-lock-contract.md`  
**Next:** PHASE F PASS · PHASE E CLOSED · PHASE G §13 gate review (`docs/dibay-member-auth-phase-e-close.md`)  
**Does not reopen:** `docs/auth-hard-lock.md`

**E accepted gap:** Admin membership suspend writer = NOT IMPLEMENTED.  
**Forbidden:** Treat Suspend as shipped · declare G without §13 · `test_users` delete · Auth Session reopen

---

## 0. Scope of PHASE D

Owner-required pillars (must all be designed here):

| # | Pillar | Outcome of this doc |
|---|---|---|
| 1 | **Admin Membership** | Model: create/revoke · Role · Permission · Audit · Bootstrap succession |
| 2 | **Person Directory** | List keyed by UUID; profiles ⋈ stores ⋈ admin — not profiles-only |
| 3 | **Person Detail** | Member · Store · Admin · Activity · Moderation · Asset · Customer Center on one UUID |
| 4 | **Production Password Surface** | Internal vs Customer Social fully separated in product policy |

PHASE E implements only what this design accepts. No redesign-by-patch.

---

## 1. Admin Membership model

### 1.1 TARGET shape (logical)

```text
PERSON_ID (auth.users.id)
  └─ admin_memberships (0..1 active platform membership preferred)
        role: SUPER_ADMIN | ADMIN
        status: active | suspended | revoked
        granted_at / granted_by
        revoked_at / revoked_by / revoke_reason
        └─ permissions[]  (reuse AdminPermissionKey set)
```

**UI role mapping (CURRENT menu):** `operator | manager | master`  
**DB/TARGET role:** `ADMIN` (tier via `admin_tier` or membership metadata) | `SUPER_ADMIN`  
Normalization stays: `master` → `SUPER_ADMIN` (`normalizeAdminRole`).

### 1.2 Proposed physical design (PHASE E implements; not applied now)

**Option A (preferred — additive, low churn):**

```text
public.admin_memberships
  id              uuid PK
  user_id         uuid NOT NULL UNIQUE REFERENCES auth.users(id)  -- one active row policy via partial unique
  role            text NOT NULL CHECK (role IN ('admin', 'super_admin'))
  status          text NOT NULL CHECK (status IN ('active', 'suspended', 'revoked'))
  admin_tier      text NULL CHECK (admin_tier IS NULL OR admin_tier IN ('operator', 'manager'))
  -- super_admin: admin_tier NULL or ignored
  granted_at      timestamptz NOT NULL
  granted_by      uuid NULL REFERENCES auth.users(id)
  revoked_at      timestamptz NULL
  revoked_by      uuid NULL
  revoke_reason   text NULL
  bootstrap_seed  boolean NOT NULL DEFAULT false  -- true only for env bootstrap event row metadata
  created_at      timestamptz NOT NULL
  updated_at      timestamptz NOT NULL
```

Keep existing `admin_staff_permissions (user_id, permission_key, granted_by, created_at)` as permission store.  
**SSOT for “is admin?”** after cutover: `EXISTS admin_memberships WHERE user_id=? AND status='active'`.

**Option B:** Promote `profiles.role` forever — **REJECTED** by PHASE B/C (weak for history/expiry/org move).

### 1.3 Membership lifecycle operations

| Op | Actor | Rules | Audit action |
|---|---|---|---|
| **Create (staff)** | SUPER_ADMIN | New Auth User (Internal) or promote existing Person; role=`admin`; default permissions by tier | `admin_membership_create` |
| **Promote to SUPER_ADMIN** | SUPER_ADMIN | Explicit succession path; not Bootstrap re-run | `admin_membership_promote_super` |
| **Update permissions / tier** | SUPER_ADMIN (or policy) | Cannot elevate self beyond policy; cannot strip last SUPER_ADMIN | `admin_membership_update` |
| **Suspend** | SUPER_ADMIN | status=`suspended`; login may remain but admin APIs 403 | `admin_membership_suspend` |
| **Revoke** | SUPER_ADMIN | status=`revoked`; clear or freeze permissions; **precheck other active SUPER_ADMIN ≥ 1** if target is SUPER_ADMIN | `admin_membership_revoke` |
| **Bootstrap seed** | Ops/SQL break-glass | Env once; set `bootstrap_seed` on membership or audit only; alias optional | `bootstrap_master_seed` |

Map to PHASE B §3.1:

| §3.1 | Membership op |
|---|---|
| Create Bootstrap | Bootstrap seed → membership SUPER_ADMIN |
| Recover | Auth password reset on **same UUID**; membership unchanged |
| Deactivate | Revoke/suspend membership after succession precheck |
| Succession | Promote/create another SUPER_ADMIN then optional revoke |
| Cardinality | `bootstrap` procedure once; many SUPER_ADMIN rows allowed |

### 1.4 Role

| Role | Meaning | Permission default |
|---|---|---|
| `super_admin` | Full platform; create/promote admins; bootstrap succession | All `AdminPermissionKey` (CURRENT `defaultPermissionsForUiRole("master")`) |
| `admin` | Staff; scoped by `admin_tier` + `admin_staff_permissions` | Tier defaults (`operator`/`manager`) |

`operator` is **not** a `profiles.role` value today for privilege (`isPrivilegedAdminRole` false for operator). Keep: only `admin`|`super_admin` gate APIs; tier refines menu keys.

### 1.5 Permission

- **Reuse** existing `AdminPermissionKey` (`lib/types/admin-staff.ts`) — do not invent parallel key system in E.
- Store: `admin_staff_permissions`.
- SUPER_ADMIN: effective = all keys (no row required).
- ADMIN: rows or tier defaults via `defaultPermissionsForUiRole`.
- API gate: keep `requireAdminPermission(key)` shape; swap backing read to membership after cutover.

### 1.6 Audit

- Reuse `public.audit_logs` (exists).
- Every membership mutation: `actor_type=admin`, `target_type=admin_membership|staff`, `before_json`/`after_json`.
- Bootstrap / break-glass: mandatory dual-control note in `after_json` (who approved).

### 1.7 Cutover plan (CURRENT → TARGET)

```text
1. Add admin_memberships (E)
2. Backfill: profiles.role in (admin, super_admin) → active membership
3. Dual-read window: isPrivilegedAdminRole OR active membership (temporary, time-boxed)
4. Switch all server gates to membership-only
5. Stop writing privilege via profiles.role (keep column user|mirror deprecated)
6. Document: profiles.role no longer Admin SSOT
```

**Forbidden during cutover:** permanent dual-write as “done”; privilege by alias.

### 1.8 CURRENT inventory (do not delete in D)

| Artifact | Role until cutover |
|---|---|
| `profiles.role` | Transitional privilege read |
| `profiles.admin_tier` | Staff tier |
| `profiles.is_admin` | Mirror — not sole authority |
| `admin_staff_permissions` | Keep |
| `POST /api/admin/staff` | Create/promote — retarget to membership in E |
| `getAdminRole()` / `NEXT_PUBLIC_ADMIN_ROLE` | UI only — PHASE E should prefer `/api/admin/me` snapshot; remove default-master fallback |

---

## 2. Person Directory (List)

### 2.1 Purpose

```text
Person Directory = search / filter / triage by PERSON_ID
NOT “profiles-only member list”
```

### 2.2 Query contract (logical)

```text
FROM profiles p
LEFT JOIN LATERAL (
  SELECT count(*)::int AS store_count,
         bool_or(approval_status = 'approved') AS has_approved_store,
         min(approval_status) ... -- or array_agg summary
  FROM stores s WHERE s.owner_user_id = p.id
) store ON true
LEFT JOIN admin_memberships m
  ON m.user_id = p.id AND m.status = 'active'   -- TARGET
-- CURRENT dual-read: OR p.role IN ('admin','super_admin')
```

### 2.3 Row projection (minimum)

| Field | Source |
|---|---|
| `personId` | `profiles.id` |
| `displayName` / `@publicId` | nickname / dibay_id / username |
| `authProviderClass` | social \| internal_manual \| email \| unknown |
| `memberStatusCategory` | active / needs_review / suspended / deleted (existing resolver) |
| `storeRelation` | `{ count, hasApproved, statuses[] }` from **stores** |
| `adminRelation` | `{ isAdmin, role }` from membership (or transitional role) |
| `internalClass` | derived policy hint (ops/qa/dev/bootstrap) — optional badge, not privilege |
| `joinedAt` / `lastLoginAt` | profiles |
| `phoneVerified` | profiles |

### 2.4 Filters

- Search: nickname, dibay_id, username, email (alias search → UUID rows)
- Account facet: `member` \| `store_owner` (≥1 store) \| `admin` — **store_owner from stores, not profiles.role**
- Status facet: existing status categories

### 2.5 Remove / replace CURRENT anti-patterns

| CURRENT | TARGET |
|---|---|
| `GET /api/admin/users` profiles-only | Directory query with store + admin projection |
| `accountCategory=store_manager` via role/member_type heuristic | `storeRelation.count > 0` (or approved-only filter) |
| Staff as separate tab only | Keep Staff tab for ops UX **or** Directory filter `admin` — both OK if same SSOT |

### 2.6 API sketch (E)

```text
GET /api/admin/persons?search=&facet=&status=&cursor=
→ { persons: PersonDirectoryRow[], summary }
```

Legacy `/api/admin/users` may alias during E then retire after G — **no delete in D**.

---

## 3. Person Detail

### 3.1 Purpose

One UUID page: canonical Person + related ops surfaces.  
List = triage; Detail = operate.

### 3.2 Sections (product contract)

| Section | SSOT / data | CURRENT gap | TARGET |
|---|---|---|---|
| **Member** | profiles (+ provider, phone, dibay_id, status) | Partial | Keep + edit via existing admin user APIs |
| **Store** | `stores` where `owner_user_id=UUID` | Missing | List stores: name, slug, approval_status, link to admin store |
| **Admin** | membership + permissions + audit slice | role badge only | Role, tier, permissions, grant/revoke history |
| **Activity** | orders / trade / chat counts — real aggregates | Hardcoded `0` | Define read APIs or “not in v1” honestly — **no fake 0 as done** |
| **Moderation** | `user_moderation_events` | Partial UI | List + warn/suspend/restore actions wired |
| **Asset** | points ledger / balance | Points API exists | Surface balance + link to ledger |
| **Customer Center** | member notes / inquiries | Separate admin notes | Link threads by `user_id` |

### 3.3 Identity header (always)

```text
personId (UUID, copy)
@publicId · displayName
auth provider class
member status · store badge · admin badge
joinedAt · lastLoginAt
```

### 3.4 Actions (by permission)

| Action | Permission / role | Notes |
|---|---|---|
| Edit member profile | `users` / `users_edit_membership` | Existing |
| Suspend / restore | `reports` or dedicated | Wire moderation events — no disabled stub as “done” |
| Message | existing messenger link | Keep |
| Grant/revoke admin | SUPER_ADMIN | Membership ops |
| Delete / soft-delete | controlled | Existing delete route — irreversible guard |

### 3.5 Detail API sketch (E)

```text
GET /api/admin/persons/:id
→ {
  person, member, stores[], adminMembership,
  moderation: { recent[] },
  assets: { points },
  customerCenter: { noteThreadIds[] },
  activity: { ... } | { status: "not_implemented" }
}
```

Never silently return zeros for unimplemented activity.

### 3.6 `test_users` on detail (until H)

- CURRENT `ensureProfileRow` / test_users backfill remains **legacy**.
- PHASE D: inventory only; E must not add new test_users writers; H isolates.

---

## 4. Production Password Surface policy

### 4.1 Product rule (LOCK for D)

```text
Production Customer Auth  = Social / OAuth providers only (product meaning)
Internal Auth             = Manual ID / password (Bootstrap · Ops · QA · Dev)
```

Same technical resolve chain may exist; **UI meaning and Production exposure** must separate.

### 4.2 Production policy — **P2 LOCKED** (2026-08-07 owner)

| Option | Behavior | Verdict |
|---|---|---|
| **P1** | Production: `auth_login_settings.password.enabled=false` | Rejected for current ops model (ops/QA/bootstrap need prod emergency access) |
| **P2** | Production: password **ON**, but UI/copy = **Internal / Operations Login** only — never customer signup/login meaning | **LOCKED** |
| **P3** | Password on with customer email-signup framing | **REJECT** |

**P2 rationale (owner):** Customer = Social; Dev/QA = Manual ID; Operators may need Production emergency access; Bootstrap/ops accounts are not removal targets. Product meaning must stay fully separated from customer Social login.

**P2 implementation constraints (PHASE E):**

1. Keep `auth_login_settings.provider=password` **enabled** in Production (explicit DB/ops confirmation).
2. Login UI: when password surface is shown, copy/labels must mean **Internal / Operations** — not customer “email signup” or primary member login.
3. Do not market password path as customer membership signup (`/signup` stays redirect to `/login`).
4. Social-only accounts: keep `password_login_blocked_for_social_account`.
5. Privilege never derived from Internal ID string — only UUID → Admin Membership (TARGET) / transitional `profiles.role`.
6. Customer path remains Social/OAuth primary on the same page only if Internal entry is visually/secondary and clearly labeled.


### 4.3 Settings SSOT (under P2)

- Toggle authority: `auth_login_settings` row `provider=password` (server), not client hardcode.
- **P2:** Production keeps password **enabled**; product meaning = Internal/Ops only (E: copy + secondary placement).
- Social-only accounts: keep `password_login_blocked_for_social_account`.

### 4.4 Internal login copy (TARGET · P2)

- Identifier field: “Internal / Operations ID” (or i18n equivalent) — never customer “email signup”.
- Primary login affordance on Production: Social providers; Internal password is secondary/explicit entry.
- No client privilege from identifier string.

### 4.5 QA / Dev

- local/staging: password surface allowed per `deploy-surface` / settings.
- Fixtures (`aaaa`) remain alias → Auth; privilege from membership/role only.

---

## 5. Cross-cutting: Bootstrap succession binding

| Step | Structure |
|---|---|
| Seed | Ops creates Auth User + `admin_memberships` SUPER_ADMIN (+ optional alias) |
| Succession | Active SUPER_ADMIN grants another membership SUPER_ADMIN + audit |
| Deactivate former | Revoke only if other active SUPER_ADMIN ≥ 1 |
| Recover | Auth credential reset; membership intact |

SQL `bootstrap-aaaa-master-admin.sql` = CURRENT seed tool — E replaces with membership-aware runbook; do not delete script until H+.

---

## 6. PHASE E implementation boundaries (preview — not start)

**In scope when E starts (after D accept):**

1. `admin_memberships` + backfill + gate cutover  
2. Person Directory API + Admin UI list projection from stores  
3. Person Detail sections Store/Admin/Moderation/Asset links; Activity honest  
4. Production password settings + copy separation  

**Out of scope for first E slice (unless owner expands):**

- Store manager/staff multi-seat tables  
- Full activity analytics warehouse  
- Deleting `test_users` / dead files  

**Never in E:**

- Temp patch that re-encodes Store Owner as `profiles.role`  
- Alias privilege  
- Auth Completion/Session redesign  

---

## 7. Acceptance checklist (PHASE D)

| # | Item | Status in this draft |
|---|---|---|
| 1 | Admin Membership model (create/revoke/role/permission/audit) | Designed |
| 2 | Bootstrap succession mapped to membership ops | Designed |
| 3 | Person Directory UUID + stores + admin projection | Designed |
| 4 | profiles-only list anti-pattern replaced in contract | Designed |
| 5 | Person Detail section set (7 surfaces) | Designed |
| 6 | Activity: no fake-zero-as-done | Designed |
| 7 | Production password policy | **P2 LOCKED** (P1 rejected for ops; P3 rejected) |
| 8 | Customer Social vs Internal Manual separation | Designed · P2 |
| 9 | Cutover CURRENT role → membership | Designed |
| 10 | No E/G/H started | Affirmed · D CLOSED |

---

## 8. Verdict

```text
PHASE D STRUCTURE DESIGN — CLOSED (2026-08-07)
Production Password Policy — P2 LOCKED

Next: PHASE F PASS · E CLOSED · G §13 gate (not declared)
Suspend writer: NOT IMPLEMENTED (accepted E gap)

Still forbidden:
  Declare G without §13
  Treat membership suspend as shipped
  Legacy / test_users deletion
  Auth HARD LOCK reopen
```

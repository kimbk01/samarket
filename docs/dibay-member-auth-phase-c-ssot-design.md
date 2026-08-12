# DIBAY MEMBER / AUTH — PHASE C SSOT DESIGN

**Status:** PHASE C CLOSED (2026-08-07 owner acceptance)  
**Date:** 2026-08-07  
**Depends on:** PHASE A CLOSED · PHASE B CLOSED (`docs/dibay-member-auth-account-hard-lock-contract.md`)  
**Next:** PHASE D — `docs/dibay-member-auth-phase-d-structure-design.md`  
**Does not reopen:** `docs/auth-hard-lock.md` (Session / Completion / Profile Writer / Destination)

**Allowed in this phase:** SSOT tables, CURRENT vs TARGET authority maps, cutover notes for PHASE D.  
**Forbidden:** schema/UI patches, `test_users` delete, Auth Slice reopen, dual-writer “fixes”.

---

## 0. Purpose

PHASE B fixed **meanings**. PHASE C fixes **which artifact is authority** for each concern, with evidence from code/DB, so PHASE D can design structure without inventing SSOT mid-implementation.

```text
Person / Store / Admin / Internal Account
  → each has exactly one AUTHORITY read path (TARGET)
  → CURRENT may differ; labeled transitional until PHASE E cutover
```

---

## 1. SSOT map (summary)

| Domain | AUTHORITY (TARGET) | CURRENT (code/DB) | Label / alias (NOT authority) |
|---|---|---|---|
| **Person** | `auth.users.id` | `auth.users.id` ≡ `profiles.id` | email, phone, nickname, `username`, `dibay_id`, `aaaa` |
| **MemberProfile** | `profiles` row PK=`id` | same | display fields |
| **Store ownership** | `stores.owner_user_id` | same | Admin list `store_manager` via `profiles.role` (broken heuristic) |
| **Store entity** | `stores.id` | same | slug (lookup key, not person) |
| **Platform Admin** | Admin Membership → Role → Permission (**TARGET**) | `profiles.role` ∈ `{admin,super_admin}` + `admin_staff_permissions` | `aaaa`, `@manual.local`, `NEXT_PUBLIC_ADMIN_ROLE`, `is_admin` flag alone |
| **Bootstrap Master** | Procedure once/env → UUID with SUPER_ADMIN | SQL seed + `profiles.role=super_admin` | fixture login `aaaa` |
| **Internal login credential** | Supabase Auth email/password for that UUID | `auth_login_email` / `{id}@manual.local` resolve | UI identifier string |
| **Customer login** | OAuth / native provider → Auth session → same UUID | Auth HARD LOCK completion path | — |
| **QA / dual legacy** | **Not product SSOT** — isolate PHASE H | `test_users` (+ plaintext password, detail ensure) | — |

---

## 2. Person SSOT

### 2.1 Authority

```text
PERSON_ID = auth.users.id
profiles.id MUST equal PERSON_ID
```

**Evidence:** `lib/profile/types.ts`, `lib/auth/ensure-user-profile.ts`, `app/api/admin/users/create/route.ts` (createUser → profiles upsert same id).

### 2.2 Writers (CURRENT — do not expand in PHASE C)

| Writer | What it writes | Notes |
|---|---|---|
| Auth signup / OAuth / native exchange | `auth.users` | Auth HARD LOCK owns session completion |
| `ensureAuthProfileForLogin` / `ensureProfileForUserId` | `profiles` seed | Auth HARD LOCK Profile Writer |
| Admin `POST /api/admin/users/create` | Auth + profiles | Internal/manual member |
| Admin `POST /api/admin/staff` | Auth + profiles.role | Admin create/promote |
| Admin `PATCH` users/:id | profiles fields | detail ensure may touch `test_users` |

### 2.3 Readers

Product APIs, RLS `auth.uid()`, Admin Person Directory (TARGET), messenger/trade/store FKs as `user_id` / `owner_user_id` / `buyer_user_id`.

### 2.4 Non-authority (must not become person SSOT)

- `profiles.email`, `auth_login_email`
- `profiles.username`, `dibay_id` (public handle — `lib/auth/dibay-public-id-ssot.ts`)
- `test_users.id` when used as parallel person table
- Login form raw identifier (`aaaa`)

### 2.5 PHASE C decision

**LOCK:** Person SSOT = Auth UUID. No second person table.  
**PHASE D:** Person Directory list/detail APIs must key by UUID; search may use aliases but return UUID as primary id.

---

## 3. MemberProfile SSOT

### 3.1 Authority

```text
MemberProfile = public.profiles WHERE id = PERSON_ID
```

Member **state** (status, phone verification, points, trust, provider metadata) lives here.  
Member **is not** Admin and **is not** Store — those are relations.

### 3.2 Key columns (authority vs display)

| Column | Role |
|---|---|
| `id` | Person FK / PK — authority join |
| `status`, `member_status`, `deleted_at` | Member lifecycle |
| `phone_*`, `provider`, `auth_provider`, `provider_user_id` | Verification / identity link |
| `role` | **CURRENT Admin transitional only** — TARGET moves Admin off this for privilege reads |
| `member_type` | Member tier (normal/premium…) — **not** Store Owner |
| `username`, `dibay_id`, `nickname`, `email` | Labels |

### 3.3 PHASE C decision

**LOCK:** Keep `profiles` as MemberProfile SSOT.  
**LOCK:** Do not use `member_type` or `role` to mean Store Owner.  
**TARGET note:** After Admin Membership cutover, `profiles.role` for non-admins stays `user`; privileged reads stop depending on this column (PHASE D designs cutover).

---

## 4. Store SSOT

### 4.1 Authority

```text
STORE_ID = stores.id
STORE_OWNER_PERSON = stores.owner_user_id  →  PERSON_ID
```

**Evidence:** `POST /api/me/stores` inserts `owner_user_id: userId` (logged-in person). No new Auth User for store.

### 4.2 What is NOT Store SSOT

| Wrong pattern | Why |
|---|---|
| `profiles.role = owner \| store_owner \| …` | DB CHECK only allows `user\|admin\|super_admin`; Admin list heuristic is dead/misleading |
| Separate “store login Auth User” as required product model | Not how create-store works |
| Admin account category `store_manager` from profiles alone | Must join `stores` (PHASE D) |

### 4.3 Membership scope (PHASE C lock)

| Relation | CURRENT | TARGET (this program) |
|---|---|---|
| Owner | `stores.owner_user_id` | **SSOT LOCK** |
| Manager / staff seats | Not proven as first-class table | **Out of scope** unless product explicitly opens StoreMembership later |

### 4.4 PHASE C decision

**LOCK:** Store ownership = `stores.owner_user_id`.  
**LOCK:** Person may be Member + Owner simultaneously.  
**PHASE D:** Person Directory must surface store relation via `stores` query/aggregate, never via inventing `profiles.role`.

---

## 5. Admin SSOT

### 5.1 CURRENT authority (transitional — evidence)

```text
PERSON_ID
  → profiles.role ∈ {admin, super_admin}   (master normalized → super_admin)
  → isPrivilegedAdminRole() / requireAdmin*
  → (non-super) admin_staff_permissions + profiles.admin_tier
```

**Evidence:** `lib/auth/admin-policy.ts`, `lib/auth/server-guards.ts`, `lib/admin/require-admin-permission.ts`, `app/api/admin/staff/route.ts`, migration `admin_staff_permissions`.

**Not authority (CURRENT):**

- Email allow-list (`getAllowedAdminEmails()` → `[]`)
- Login alias `aaaa`
- Client `getAdminRole()` / `NEXT_PUBLIC_ADMIN_ROLE` / default `"master"` (menu UX only)

### 5.2 TARGET authority (PHASE B contract)

```text
PERSON_ID
  → Admin Membership (status, granted_at, revoked_at, …)
       → Role (SUPER_ADMIN | ADMIN | …)
            → Permission keys
```

Bootstrap Master = **procedure** that creates first SUPER_ADMIN membership for a UUID (§3 / §3.1 of PHASE B contract). Not a parallel SSOT key.

### 5.3 Cutover invariant (design constraint for D/E)

1. Until membership table is live and backfilled, **server privilege reads may keep** `profiles.role` (transitional).
2. Cutover must: backfill membership from `role in (admin,super_admin)` → switch readers → then stop treating `role` as Admin SSOT.
3. Forbidden forever: privilege by alias / `@manual.local` / client env.
4. Audit: grant/revoke/succession → `audit_logs` (table exists).

### 5.4 PHASE C decision

**LOCK CURRENT read:** `profiles.role` + permissions (documented transitional).  
**LOCK TARGET read:** Admin Membership.  
**PHASE D:** Table/API shape, backfill, dual-read window rules (no silent dual-write as permanent state).

---

## 6. Internal Account SSOT

### 6.1 Policy classes (PHASE B §5) — not separate Auth products

```text
Internal Account (policy class on a Person)
  ├── Bootstrap   — seed procedure outcome (SUPER_ADMIN person)
  ├── Operations  — production operators (Admin Membership)
  ├── QA          — fixtures / device runtime
  └── Development — local/staging convenience
```

Same technical login chain may apply:

```text
UI identifier
  → resolvePasswordLoginIdentifier
  → auth email (often {id}@manual.local or auth_login_email)
  → signInWithPassword
  → PERSON_ID
  → (optional) Admin Membership / profiles.role
```

**Evidence:** `lib/auth/manual-member-email.ts`, `lib/auth/resolve-password-login-identifier.ts`, `app/login/LoginPageClient.tsx`.

### 6.2 Customer vs Internal (login product SSOT)

| Class | Login authority path | Product meaning |
|---|---|---|
| Production Customer | Social/OAuth → Auth session → UUID | Primary membership signup |
| Internal | Manual ID/password → Auth session → UUID | Ops/QA/Dev only — **not** customer email signup |

Password surface gated by `auth_login_settings.provider=password` (CURRENT default enabled). PHASE D must decide Production policy (hide / settings-only / ops-only) — **policy decision, not Auth reopen**.

### 6.3 PHASE C decision

**LOCK:** Internal classes are **policy labels** on Person (+ Admin membership when applicable), not separate person SSOT tables.  
**LOCK:** Credential verification = Supabase Auth only (not `test_users.password`).  
**PHASE H:** `test_users` isolation — not SSOT.

---

## 7. Competing identifiers (explicit demotion)

| Identifier | Allowed use | Forbidden use |
|---|---|---|
| `auth.users.id` / `profiles.id` | Person authority | — |
| `stores.owner_user_id` | Store owner authority | Platform admin |
| `profiles.role` | Transitional admin read | Store owner; customer class |
| `admin_staff_permissions` | Permission keys under admin | Person identity |
| `username` / `dibay_id` | Search, @handle, login alias resolve | Privilege |
| `email` / `auth_login_email` | Auth credential / display | Privilege |
| `aaaa` / any alias | Login alias / QA fixture | Privilege / Bootstrap brand |
| `test_users.*` | Legacy dual — isolate later | Product SSOT / password verify |
| `member_type` | Member tier | Store Owner / Admin |
| `is_admin` boolean | Mirror/legacy flag | Sole privilege authority |

---

## 8. Auth HARD LOCK boundary (unchanged)

| Concern | SSOT owner doc |
|---|---|
| Session lifecycle, Completion, Profile Writer for login, Destination | `docs/auth-hard-lock.md` |
| Person / Store / Admin / Internal **account** authority | This PHASE C + PHASE B contract |

PHASE C does **not** change Completion owners, `ensureAuthProfileForLogin`, or provider adapters.

---

## 9. Open items deferred to PHASE D (structure design)

PHASE C does **not** invent schema. PHASE D must design:

1. **Admin Membership** table/API shape + backfill from `profiles.role`
2. **Person Directory** list query: `profiles` ⋈ store aggregates ⋈ admin membership (transitional role ok in dual-read window)
3. **Person Detail** sections: Member / Store / Admin / Activity — real data contracts (no hardcoded 0 as “done”)
4. **Production password surface** policy
5. **Bootstrap ops runbook** binding to CURRENT SQL vs TARGET membership APIs
6. **test_users** read/write inventory for PHASE H isolation (no delete in D)

---

## 10. PHASE C acceptance checklist

| # | Item | Status |
|---|---|---|
| 1 | Person = Auth UUID | LOCKED |
| 2 | MemberProfile = `profiles` | LOCKED |
| 3 | Store owner = `stores.owner_user_id` | LOCKED |
| 4 | Admin CURRENT = `profiles.role` (+ permissions) transitional | LOCKED |
| 5 | Admin TARGET = Membership → Role → Permission | LOCKED (design in D) |
| 6 | Internal = policy class + Auth password path | LOCKED |
| 7 | Alias / email / dibay_id demoted | LOCKED |
| 8 | `test_users` not product SSOT | LOCKED |
| 9 | Auth Session HARD LOCK untouched | LOCKED |

---

## 11. Verdict

```text
PHASE C SSOT DESIGN — CLOSED (2026-08-07)

Next: PHASE D — structure design
  docs/dibay-member-auth-phase-d-structure-design.md

Still forbidden:
  PHASE E implementation (until D accept)
  PHASE G HARD LOCK declaration
  Legacy / test_users deletion
  Auth HARD LOCK reopen
```

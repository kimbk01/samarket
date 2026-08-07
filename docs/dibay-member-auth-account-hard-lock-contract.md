# DIBAY MEMBER / AUTH ACCOUNT HARD LOCK CONTRACT

**Status:** PHASE A–D CLOSED · PHASE E **CLOSED** · PHASE F **PASS** · Migration **APPLIED** · Password **P2 LOCKED** · dual-read transitional · PHASE G **NOT DECLARED** (PRE-HARD-LOCK)  
**Date:** 2026-08-07  
**Phase B–D closed:** 2026-08-07  
**Phase E closed:** 2026-08-07 — `docs/dibay-member-auth-phase-e-close.md`  
**Phase F:** PASS — `docs/dibay-member-auth-phase-f-runtime-validation.md` · evidence `.qa-logs/phase-f-runtime-20260807/`  
**Migration:** `20261020120000_admin_memberships.sql` — **APPLIED**  
**Accepted E gap:** Admin membership suspend writer = **NOT IMPLEMENTED** (transitional)  
**Non-scope:** Session Lifecycle · Completion · Profile Writer · Destination (`docs/auth-hard-lock.md`)  
**Still forbidden:** PHASE G without §13 · `test_users` delete · Auth HARD LOCK reopen · treating Suspend writer as shipped  

Companion Cursor rule: `.cursor/rules/dibay-member-auth-account-hard-lock.mdc`  
Related (do not silently reopen): `docs/auth-hard-lock.md` · `.cursor/rules/dibay-auth-hard-lock.mdc`

Audit baseline (PHASE A): conversation audit 2026-08-07 — Person=`auth.users.id`≡`profiles.id`; Store=`stores.owner_user_id`; Admin privilege currently via `profiles.role`; password/ID shares customer login UI; `test_users` dual writer.

---

## 0. Absolute rules

1. **No implementation from audit/contract alone** until PHASE C–D designs are accepted; then only **fundamental** implementation that matches this contract. Temporary / patch / dual-writer “때빵” 금지.
2. **Do not delete** legacy auth, email/password login, `test_users`, patch/dead files, duplicate writers before PHASE G HARD LOCK + isolation phases (H+).
3. **Do not reopen** Auth Slice 6–10 (Session/Completion/Profile writer) without `docs/auth-hard-lock.md` §4.
4. **Alias is never authority.** UUID + membership/role/permission are.
5. **Store Owner is not `profiles.role`.** SSOT = `stores.owner_user_id`.
6. Guessing forbidden. CURRENT vs TARGET must stay labeled.
7. **Do not invert phases.** Design (C–D) before implementation (E); HARD LOCK (G) before legacy deletion (H+).

---

## 1. Person identity SSOT (LOCKED)

```text
PERSON AUTHORITY = auth.users.id
Member profile row PK = profiles.id = auth.users.id
```

- Email, nickname, phone, `username`, `dibay_id`, `aaaa` alias → **labels / login aliases / public handles**, not person authority.
- One human may simultaneously hold Member context, Store relation(s), and Admin membership.
- Role/context must not invent a second Auth User for the same person (except documented Internal account classes that are intentionally separate operators).

---

## 2. Account / context model (TARGET)

```text
                 Auth User UUID  (= Person)
                        │
          ┌─────────────┼─────────────────┐
          │             │                 │
    MemberProfile  StoreRelation    AdminMembership
    (profiles)     (stores.*)       (TARGET table/API)
                          │                 │
                        Store          Role + Permission
```

| Context | CURRENT (evidence) | TARGET (contract) |
|---|---|---|
| Member | `profiles` | `profiles` as MemberProfile (keep) |
| Store | `stores.owner_user_id` (no staff membership table proven) | StoreRelation SSOT stays on `stores`; optional manager/staff membership only if product requires later |
| Admin | `profiles.role` ∈ `{admin,super_admin}` + `admin_staff_permissions` | **Admin Membership** row(s): user_id → role → permission (+ history/expiry later) |
| QA / Dev / Ops Internal | same `@manual.local` password chain | Internal Account classes (§5) — same Auth machinery, different **policy class** |

**DO NOT:** encode Store Owner as `profiles.role`.  
**DO NOT:** treat Admin as “just another member_type” without membership authority.

---

## 3. BOOTSTRAP MASTER CONTRACT (REQUIRED — was missing)

Bootstrap Master · Super Admin · login alias are **three different concepts**.

```text
Bootstrap Master (procedure, once)
        │
        ▼
Auth User UUID
        │
        ▼
Admin Membership
        │
        ▼
Role = SUPER_ADMIN
```

| Concept | Meaning | Authority? |
|---|---|---|
| **Bootstrap Master** | First-time platform admin **creation procedure** (seed / SQL / controlled ops) | Procedure only — not a forever privilege brand |
| **Super Admin** | Operational role on Admin Membership | Yes — via UUID → membership → role |
| **`aaaa` (or any alias)** | Optional **dev/QA login alias** → usually `{alias}@manual.local` | **No** — never grant privilege by string compare |

### Rules (HARD LOCK must include all 10)

1. Exactly **one Bootstrap Master procedure** exists for a given environment (first admin seed).
2. Bootstrap Master **is** an Auth User (real `auth.users` row).
3. Privilege is decided only by: **User UUID → Admin Membership → SUPER_ADMIN** (CURRENT transitional: UUID → `profiles.role=super_admin` until membership cutover).
4. Bootstrap Master **login alias may change**; alias change must not change UUID authority.
5. Alias (`aaaa`) is **not** authority.
6. **UUID is authority.**
7. Bootstrap Master (as Super Admin) **may create other Super Admins / Staff** per permission policy.
8. Disabling Bootstrap Master’s login must **not** strand the platform if another Super Admin exists.
9. Bootstrap credentials **must never** be used in Production **client** code for privilege checks (`if id===aaaa`, NEXT_PUBLIC password, etc.).
10. After bootstrap, day-to-day ops use **Role + Permission only** — not “bootstrap brand”.

### CURRENT fixture note (not TARGET privilege model)

- Ops/SQL: `supabase/scripts/bootstrap-aaaa-master-admin.sql` seeds `aaaa@manual.local` → `profiles.role=super_admin` and mirrors `test_users`.
- QA scripts default `E2E_ADMIN_USERNAME=aaaa` / password env — **fixture**, not product SSOT.
- Code grep: no `id === "aaaa"` privilege gate (audit). Keep it that way.

### 3.1 Bootstrap Master operations (REQUIRED before PHASE B close)

개념 정의(§3)만으로는 부족하다. **생성 · 복구 · 비활성화 · Super Admin 승계 · 복수 여부**를 계약으로 고정한다.  
구현 세부는 PHASE D/G에서 붙이되, 아래 의미는 PRE-HARD-LOCK에서 이미 LOCK한다.

#### A. 생성 절차 (Create)

1. **환경당 Bootstrap 절차는 1회**만 정상 경로로 허용한다 (local / staging / production 각각 독립).
2. 순서 (TARGET):
   ```text
   (ops-controlled) create Auth User
     → attach Admin Membership with SUPER_ADMIN
     → record bootstrap event (who/when/env/UUID) in audit trail
     → optional: set login alias (e.g. aaaa) — alias is not the bootstrap brand
   ```
3. CURRENT 허용 경로 (구현 전 운영): service-role / SQL seed (`bootstrap-aaaa-master-admin.sql` 계열)로 Auth User가 이미 있을 때 `profiles.role=super_admin` 부여. **제품 UI “회원가입”으로 Bootstrap을 만들지 않는다.**
4. Bootstrap 생성은 **고객 Social 가입 플로우와 분리**된 ops/runbook만 사용한다.
5. 생성 직후 반드시 **두 번째 Super Admin(또는 승계 가능한 Staff→승격 경로) 확보 계획**을 문서에 남긴다 (§3 rule 8).

#### B. 분실 시 복구 절차 (Recover)

“분실” = 로그인 alias/비밀번호 상실, Auth MFA 상실, 또는 해당 Auth User 세션 불가 — **UUID/membership가 DB에 남아 있는 경우**.

1. **권위는 UUID**이므로 alias 재발급·비밀번호 리셋으로 복구한다. 새 Auth User를 “두 번째 Bootstrap”으로 만들지 않는다.
2. 복구 권한자: **다른 활성 Super Admin**이 있으면 그 계정으로 Staff/ops API·runbook 수행.  
   Super Admin이 **0명**이면 → **Break-glass** (§3.1 C 하단 / E): service-role + 이중 통제(최소 2인 승인 기록)로 기존 UUID에 membership/role 재부여 또는 비밀번호 리셋.
3. 금지: 클라이언트/`aaaa` 문자열/`NEXT_PUBLIC_*`로 권한 복구. 금지: 분실을 이유로 임의 신규 Bootstrap 절차를 “정상 1회”처럼 재실행.
4. 복구 후: audit에 `bootstrap_or_super_admin_recover` (또는 동등) + actor + target UUID 기록.

#### C. 비활성화 절차 (Deactivate)

1. Bootstrap Master **절차 브랜드**를 끄는 것과, 해당 **Auth User의 Super Admin membership을 revoke**하는 것을 구분한다.
2. 비활성화(권장 의미): 해당 Person의 Admin Membership(또는 CURRENT `profiles.role`)에서 **SUPER_ADMIN 제거/정지** + 로그인 자격 정지(선택). Person/MemberProfile 행을 무조건 hard-delete 하지 않는다.
3. **사전 조건 (HARD FAIL if violated):** 동일 환경에 **다른 활성 Super Admin ≥ 1** 존재. 없으면 비활성화 금지 → 먼저 승계(D).
4. 비활성화 후에도 플랫폼은 남은 Super Admin만으로 운영 가능해야 한다 (§3 rule 8).
5. “Bootstrap 완료” 플래그/runbook 상태는 유지할 수 있다. 비활성화 ≠ Bootstrap 절차를 다시 열림.

#### D. Super Admin 승계 절차 (Succession)

1. 승계 = **기존 활성 Super Admin**이 다른 Auth User UUID에 SUPER_ADMIN(또는 동등 Admin Membership)을 부여하는 것.
2. 승계는 **정상 운영 경로**이다. Bootstrap 절차 재실행이 아니다.
3. 최소 순서:
   ```text
   verify actor is active SUPER_ADMIN
     → target Auth User exists (or create Internal Ops account)
     → grant SUPER_ADMIN membership (TARGET) / profiles.role=super_admin (CURRENT transitional)
     → audit log
     → (optional) revoke or demote previous Super Admin only after handoff verified
   ```
4. Staff(`admin`) → Super Admin 승격도 동일하게 **membership/role 변경 + audit**이며 Bootstrap 재시드가 아니다.
5. 승계 실패 시 롤백: 새 권한 revoke, 기존 Super Admin 유지.

#### E. Bootstrap Master 복수 존재 여부 (Cardinality)

| 질문 | 계약 |
|---|---|
| 환경당 **Bootstrap 절차**를 정상적으로 몇 번? | **1회** (이미 완료된 환경에서 재실행 = 비정상; Break-glass만 예외) |
| 환경당 **Super Admin** 몇 명? | **1명 이상 허용·권장 ≥ 2** (버스 팩터) |
| “Bootstrap Master” Person이 동시에 2명? | **아니오 (정상 경로).** Bootstrap은 절차이지 병렬 직함 타이틀이 아님 |
| 시드 스크립트를 두 계정에 돌리면? | **계약 위반 상태.** 하나는 Super Admin으로만 인정하고, bootstrap 이벤트는 최초 1건만 SSOT로 취급. 정리 runbook 필요 |
| Break-glass로 새 Auth User에 첫 Super Admin을 다시 심는 경우 | **복구/재시드 비상**으로 audit에 명시. 이것을 “두 번째 Bootstrap Master 직함”으로 부르지 않음. 이후 운영은 Super Admin 승계(D)로만 확장 |

**요약:**  
`Bootstrap procedure count = 0|1 per env (done or not).`  
`Super Admin count >= 1 (prefer >= 2).`  
`Alias count = unlimited labels.`  
`aaaa` 복제 ≠ Bootstrap 복수.

#### Operations checklist (PHASE B close)

- [x] Create defined (§3.1 A)
- [x] Recover defined (§3.1 B)
- [x] Deactivate defined (§3.1 C)
- [x] Succession defined (§3.1 D)
- [x] Cardinality defined (§3.1 E)

---

## 4. Admin Membership contract (TARGET; CURRENT is transitional)

### CURRENT (transitional — weak long-term)

```text
auth.users.id → profiles.role → (optional) admin_staff_permissions
```

- Server gates correctly use `isPrivilegedAdminRole(profiles.role)` (not email allow-list).
- Risks: no first-class membership history/expiry/org move; Admin and Member share one profile row’s `role` column; client menu can fall back to `NEXT_PUBLIC_ADMIN_ROLE` / default `master` (UI only — API still server-gated).

### TARGET (red-team preferred)

```text
Auth User UUID
      → Admin Membership (status, created_at, revoked_at, …)
            → Role (e.g. SUPER_ADMIN | ADMIN | …)
                  → Permission keys
```

Requirements when implementing (PHASE D+, not now):

- Privilege reads from **membership**, not string alias / client env.
- Audit log on grant / revoke / role change (table `audit_logs` already exists — reuse).
- Super Admin cannot be created solely by “member create” UI (CURRENT already routes admin create to Staff API — keep).
- Cutover plan must map existing `profiles.role in (admin,super_admin)` → membership rows **before** removing role reads.
- Until cutover: document CURRENT as **transitional authority**; do not pretend membership already exists.

### Forbidden forever

```text
if (loginId === "aaaa") admin = true
if (email.endsWith("@manual.local")) admin = true
NEXT_PUBLIC_* password / master id as privilege
```

---

## 5. Internal Account separation policy

Same Manual ID / `@manual.local` **login chain** may be shared technically; **policy class must not be collapsed**.

```text
Internal Account
  ├── Bootstrap   — first Super Admin seed (procedure)
  ├── Operations  — production operators (Admin Membership)
  ├── QA          — automated / device runtime fixtures
  └── Development — local/staging convenience accounts
```

| Class | Login | Production customer UI | Privilege source |
|---|---|---|---|
| Production Customer | Social / approved OAuth providers | Primary | MemberProfile only |
| Operations | Internal Manual ID (or promoted Social user + membership) | Not marketed as signup | Admin Membership |
| QA | Manual ID / env-driven fixtures | Must not look like public signup | Fixture + optional Admin Membership if needed |
| Development | Manual ID | local/staging only where policy allows | Same |

**Policy (contract):**

- **Production Customer Auth = Social/Auth Provider.** Email/password is **not** the normal member signup path (`/signup` → `/login` already).
- **Internal Manual Auth = QA / Admin / Development only** — same technical resolve (`resolve-password-login-identifier` → `signInWithPassword`) but **product meaning ≠ customer email membership**.
- HARD LOCK implementation must define whether Production **hides or disables** password surface via `auth_login_settings` (CURRENT default password **enabled** — gap).
- Do not delete password Auth; **isolate policy and UI meaning**.

---

## 6. Person Directory (Member administration model)

Admin “회원 리스트” TARGET name/meaning:

```text
Person Directory
  Person (UUID)
    ├── MemberProfile fields
    ├── StoreRelation summary (from stores)
    ├── AdminMembership summary (from membership / transitional role)
    ├── Internal class (if applicable)
    └── status / verification / activity
```

| Surface | Role |
|---|---|
| **Person Directory (List)** | Fast identify · search · status · account class badges |
| **Person Detail** | Canonical UUID + related ops (stores, admin, points, moderation, notes) |

### CURRENT gaps (must not be called “done”)

- List reads **`profiles` only** — no `stores` join → Store owners mis-labeled as plain members when `store_manager` heuristic fails.
- Detail has placeholder activity (orders=0) and weak suspend UX; ensure path can still touch **`test_users`**.

### List must show (minimum TARGET)

- Person UUID  
- Public @id / nickname  
- Auth provider class (social vs internal manual)  
- Member status  
- Store relation (owned store count / approval) — from **`stores`**, not `profiles.role`  
- Admin membership (yes/no + role) — from membership / transitional `profiles.role`  
- Joined / last login  
- Verification / restriction flags  

Sensitive raw credentials (Auth password, `test_users.password`) must **never** appear in UI.

---

## 7. Store relation SSOT (LOCK NOW — no redesign required)

```text
Store ownership SSOT = stores.owner_user_id → auth.users.id
```

- Creating a store does **not** create a second person Auth User.
- User may be Member + Store Owner at once.
- Admin Member List / Person Directory **must not** invent Store Owner via `profiles.role`.
- Manager/staff multi-seat is **out of scope** until an explicit product decision adds `StoreMembership`; until then owner-only is correct.

---

## 8. Login surface contract

```text
Production Customer  →  Social / OAuth providers
Internal             →  Manual ID / password (alias → auth email)
```

- Shared UI fields are allowed only if **authority and product copy** stay separated (customer must not believe email signup is the product membership path).
- Social-only accounts remain blocked from password login (`password_login_blocked_for_social_account`).
- Legacy `POST /api/test-login` stays gone (410); do not revive parallel cookie auth for product.

---

## 9. Legacy / dual authority (post-HARD-LOCK isolation order)

**Do not delete in PRE-HARD-LOCK.** Ordered after account HARD LOCK declaration:

| Priority | Target | Why |
|---|---|---|
| **1** | `test_users` | Plaintext password · Detail ensure · Auth backfill · Dual writer — largest tech debt |
| 2 | Client admin role env fallback (`NEXT_PUBLIC_ADMIN_ROLE` / default master menu) | UI over-privilege smell |
| 3 | Password surface vs customer marketing copy | Policy isolation |
| 4 | Dead patch / duplicate writers | Only after authority reads proven |

---

## 10. Relation to Auth HARD LOCK

| Concern | Owner doc |
|---|---|
| Session / Completion / Profile writer / Destination | `docs/auth-hard-lock.md` |
| Person / Bootstrap Master / Admin Membership / Internal classes / Person Directory / Store relation / Login **product policy** | **This document** |

Implementing Admin Membership tables or Person Directory joins does **not** by itself reopen Auth Slice 6–8, unless it changes Session/Completion/Profile-writer meaning — then Auth §4 applies.

---

## 11. Phase order (do not invert)

```text
PHASE A — Evidence Audit                         ✅ (2026-08-07)
PHASE B — Account Model Definition               ✅ CLOSED (2026-08-07)
PHASE C — SSOT Design                            ✅ CLOSED (2026-08-07)
PHASE D — Structure design                       ✅ CLOSED (2026-08-07) · Password P2 LOCKED
PHASE E — Fundamental implementation             ✅ CLOSED (2026-08-07)
  · Membership · Directory · Detail · P2 · Grant/Revoke runtime
  · Dual-read transitional retained
  · Suspend writer = NOT IMPLEMENTED (accepted gap) — docs/dibay-member-auth-phase-e-close.md
PHASE F — Runtime Validation                     ✅ PASS (2026-08-07)
PHASE G — MEMBER/AUTH ACCOUNT HARD LOCK          ❌ NOT DECLARED — §13 gate review next

----- after HARD LOCK -----
PHASE H — Legacy Isolation (test_users first)
PHASE I — Dead Writer Removal
PHASE J — Dead File Removal
PHASE K — Duplicate Authority Removal
PHASE L — Repo / Runtime Regression
```

| Phase | Allowed work | Forbidden |
|---|---|---|
| **B** (done) | Account contract | Product code, deletes |
| **C** (done) | SSOT design docs | Schema/UI patches, `test_users` delete, Auth reopen |
| **D** (done) | Structure design (4 pillars) + P2 | E code |
| **E** | ✅ CLOSED — see phase-e-close.md | Reopening E to add Suspend without new phase |
| **F** | ✅ PASS | Fake Suspend PASS; ignoring documented gaps |
| **G** | HARD LOCK declaration after §13 | Starting H+ deletes before G |
| **H+** | Isolation / dead removal | Skipping regression (L) |

**Next:** PHASE G §13 gate review only. Do not declare G in this close. Do not implement membership suspend as silent E reopen.

---

## 12. Pre-HARD-LOCK contract checklist

| # | Item | Section | Status |
|---|---|---|---|
| 1 | Bootstrap Master SSOT | §3 | Defined · B CLOSED |
| 2 | Admin Membership contract (CURRENT transitional vs TARGET) | §4 | Defined · B CLOSED |
| 3 | QA / Ops / Dev Internal Account separation | §5 | Defined · B CLOSED |
| 4 | Person Directory member-admin model | §6 | Defined · B CLOSED |
| 5 | Bootstrap Create | §3.1 A | Defined · B CLOSED |
| 6 | Bootstrap Recover | §3.1 B | Defined · B CLOSED |
| 7 | Bootstrap Deactivate | §3.1 C | Defined · B CLOSED |
| 8 | Super Admin Succession | §3.1 D | Defined · B CLOSED |
| 9 | Bootstrap cardinality (procedure=1, Super Admin≥1) | §3.1 E | Defined · B CLOSED |

Plus locked: Store=`stores.owner_user_id` (§7), Internal vs Social login policy (§8).

---

## 13. Current verdict & HARD LOCK gate

### Current judgment (2026-08-07)

| Item | Verdict |
|---|---|
| PHASE B Account Model Definition | ✅ **CLOSED** |
| PHASE C SSOT Design | ✅ **CLOSED** |
| PHASE D Structure Design | ✅ **CLOSED** · Password **P2 LOCKED** |
| PHASE E Fundamental implementation | ✅ **CLOSED** — `docs/dibay-member-auth-phase-e-close.md` |
| PHASE F Runtime Validation | ✅ **PASS** — evidence `.qa-logs/phase-f-runtime-20260807/` |
| MEMBER HARD LOCK (PHASE G / §14) | ✅ **DECLARED** 2026-08-07 — see `docs/dibay-member-auth-phase-g-ops-acknowledgment.md` |
| Admin membership suspend writer | ❌ **NOT IMPLEMENTED** (accepted gap; travels with HARD LOCK) |
| Dual-read (`profiles.role` OR membership) | ✅ **EXITED** — membership-only cutover Runtime PASS |
| Legacy / `test_users` deletion | ❌ Forbidden until Phase H (separate track) |
| Auth Session HARD LOCK reopen | ❌ Forbidden |
| Temp / patch implementation | ❌ Forbidden |
| Next work | Authority Track **CLOSED**. Optional separate: Phase H / Legacy Cleanup. See `docs/dibay-member-auth-wrap-up-order.md` |

```text
PHASE A–F: CLOSED / PASS
PHASE G Gate Review: COMPLETE
§13.2 Ops acknowledgment: ACKNOWLEDGED
MEMBER/AUTH HARD LOCK: DECLARED 2026-08-07
Authority Track: CLOSED
```

### PHASE G may be declared only when

1. PHASE B closed (done) and C–D designs accepted  
2. Bootstrap Master 10 rules **and** §3.1 operations acknowledged for each deployed environment  
3. CURRENT→TARGET Admin Membership cutover plan written (**membership-only read**; dual-read exit)  
4. Person Directory field contract agreed (List/Detail) — runtime PASS in F  
5. Internal password surface Production policy decided — **P2 LOCKED**  
6. Explicit statement: **no `test_users` delete** until PHASE H  
7. PHASE E–F evidence: fundamental impl + runtime PASS — dual-read may remain documented transitional **until cutover item 3 closes**  
8. Accepted gaps explicitly listed (at minimum: **membership suspend writer NOT IMPLEMENTED**; last-SA product code `cannot_disable_super_admin`)  
9. No open First Break that blocks Grant/Revoke / Directory / Detail authority chain  

**G is not auto-declared by E CLOSE.** Owner must explicitly pass §13.

---

## 14. Declaration template (use only at PHASE G)

```text
DIBAY MEMBER / AUTH ACCOUNT HARD LOCK

Person SSOT: auth.users.id = profiles.id
Bootstrap Master: procedure ≠ alias ≠ eternal brand (§3)
Bootstrap ops: create / recover / deactivate / succession / cardinality (§3.1)
Admin: TARGET Admin Membership; CURRENT profiles.role transitional (§4)
Store: stores.owner_user_id (§7)
Login policy: Customer=Social; Internal=Manual ID (§8)
Person Directory: List/Detail contract (§6)
test_users: isolation PHASE H — not deleted at lock
Auth Session HARD LOCK: unchanged (docs/auth-hard-lock.md)
```

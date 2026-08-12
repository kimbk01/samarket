# DIBAY MEMBER / AUTH — PHASE F RUNTIME VALIDATION

**Status:** PHASE F **PASS** (2026-08-07) · PHASE E **CLOSED** (accepted Suspend N/A) · PHASE G **NOT DECLARED**  
**Date:** 2026-08-07  
**Evidence dir:** `.qa-logs/phase-f-runtime-20260807/`  
**E CLOSE:** `docs/dibay-member-auth-phase-e-close.md`  
**Depends on:** PHASE A–D CLOSED · Migration `20261020120000_admin_memberships.sql` **APPLIED**  
**Contracts:** `docs/dibay-member-auth-account-hard-lock-contract.md` · phase-c · phase-d  

**Purpose:** Prove dual-read / membership behavior with **runtime evidence**.  
**Forbidden:** Fake Suspend PASS · declaring PHASE G without §13 · new feature as substitute for F.  
**On FAIL:** Find First Break → fix that break → re-verify the blocked item(s) only.  

---

## 0. Why E is not CLOSED yet

| Fact | Implication |
|---|---|
| Migration applied | Schema + backfill available |
| Privilege still **role OR membership** (dual-read) | Transitional — not HARD LOCK |
| Cutover CURRENT→TARGET not runtime-proven | E remains IN PROGRESS until F evidence + E close criteria |

```text
CURRENT (transitional): profiles.role
TARGET:                 admin_memberships (active)
NOW:                    dual-read (both)
HARD LOCK:              only after F proves TARGET path + agreed cutover
```

---

## 1. Execution order (do not invert)

```text
1.  Migration applied                         ✅ (2026-08-07)
2.  Runtime authority matrix                  🟡 partial — Super/Member/Owner PASS; Staff Admin awaits Grant
3.  Backfill verification                     ✅ PASS
4.  Grant                                     ✅ PASS (FB2 closed — staff /api/admin/me 200)
5.  Revoke                                    ✅ PASS — membership revoked · role=user · Admin 403 · Directory/Detail · Audit · last SA blocked (`cannot_disable_super_admin`)
6.  Suspend                                   ⚪ N/A (membership suspend not wired) + gap documented — profile moderation suspend only; membership stays active; API blocked via session invalidate (401); see suspend-runtime.json
7.  Person Directory                          ✅ PASS (search= + stores projection)
8.  Person Detail                             ✅ PASS (membership/stores/activity not_implemented)
9.  Password Surface (P2)                     ✅ PASS
10. Regression                                ✅ PASS — member/owner 403 · alias≠authority · suspend gap honesty · Auth path alive · test_users intact · no new membership writers
11. PHASE E CLOSE                             ❌ pending owner decision on Suspend gap (accepted N/A vs E-scope membership suspend impl)
12. PHASE G HARD LOCK                         ❌
```

### First Break #1 — CLOSED

- Duplicate import in `lib/auth/server-guards.ts` removed
- Re-verified: Super Admin / Member / Store Owner / Directory / Detail / P2

---

## 2. Runtime authority matrix (required)

For each row: login → session UUID → expected admin/store/member behavior. Record env, UUID, pass/fail, evidence path.

| Persona | Login | Expect | Evidence notes |
|---|---|---|---|
| **Bootstrap / Super Admin** | Internal ID (e.g. alias→Auth) | Admin APIs 200; `admin_memberships` active `super_admin` (or dual-read via role) | UUID authority — not alias |
| **Admin (staff)** | Internal ID | Admin APIs per permissions; membership `admin` | Grant path from Super Admin |
| **Member (customer)** | Social preferred | No platform admin; MemberProfile only | Password not primary product path |
| **Store Owner** | Same Person UUID as member + `stores.owner_user_id` | Owner store admin OK; **not** `profiles.role=store_*` | Directory shows store_manager from stores |

---

## 3. Backfill verification

```sql
-- Active memberships should cover privileged profiles (dual-read window)
SELECT p.id, p.role, p.username, m.role AS membership_role, m.status
FROM public.profiles p
LEFT JOIN public.admin_memberships m
  ON m.user_id = p.id AND m.status = 'active'
WHERE lower(COALESCE(p.role,'')) IN ('admin','super_admin','master');
```

**PASS:** every privileged `profiles.role` row has matching active membership (or documented exception).  
**FAIL:** privileged profile with no membership and no recovery plan.

---

## 4. Grant

- Super Admin promotes existing Person or creates staff → row in `admin_memberships` status=`active` role=`admin`
- `profiles.role` still synced in dual-write window (E writers)
- Audit log present

---

## 5. Revoke

- Revoke staff → membership `revoked`; admin APIs 403
- **Last Super Admin revoke refused** (`last_super_admin`)
- Dual-write: `profiles.role` → `user` when revoke succeeds

---

## 6. Suspend

- If product uses suspend on membership: status=`suspended` → admin APIs denied while Person may still login
- Or document “suspend = profiles/moderation only until membership suspend wired” — **honest, no fake PASS**

### Runtime (2026-08-07) — evidence `.qa-logs/phase-f-runtime-20260807/suspend-runtime.json`

| Check | Result |
|---|---|
| Product path sets `admin_memberships.status=suspended` | ❌ **not wired** (schema allows value; no staff/API writer) |
| Closest product Suspend | `POST /api/admin/users/:id/moderation` `action=suspend` |
| Profile `status=suspended` | ✅ |
| Membership after moderation suspend | still **`active`** (gap) |
| `is_platform_admin(uuid)` RPC | still **true** (gap) |
| Admin API | ✅ denied **401** (session invalidated / no active_session_id) — not membership deny |
| Directory | moderation/status suspended reflected; still `accountCategory=admin` + `hasAdminMembership=true` (gap) |
| Detail | `adminMembership.status=active` (gap) |
| Audit | ✅ `moderation_suspend` |

**Verdict:** **N/A** for membership Suspend TARGET. Do not treat as membership Suspend PASS. Transitional gap for PHASE G / cutover: profile moderation ≠ membership SSOT suspend.

### Revoke product reject code (HARD LOCK doc note)

Runtime last Super Admin DELETE returns **`cannot_disable_super_admin`** (front-gate), not `last_super_admin`. Protection holds; contract text should cite the actual product code.

---

## 7. Person Directory

- Search returns UUID primary
- Store owners classified via **stores**, not `profiles.role`
- Admins via membership and/or transitional role
- No privilege from alias string

---

## 8. Person Detail

- Same UUID shows Member + Store list + Admin membership
- Activity: **not_implemented** (or real aggregates) — never fake 0 as done

---

## 9. Password Surface (P2)

- Social remains customer primary
- Internal/Ops copy visible on password path
- Social-only account still blocked from password login
- Privilege still UUID→membership/role — not identifier string

---

## 10. Regression

- Non-admin member cannot hit admin APIs
- Store owner without admin membership is not platform admin
- Auth Session HARD LOCK paths unchanged (login completion)
- `test_users` not deleted; no new writers preferred

### Runtime (2026-08-07) — `.qa-logs/phase-f-runtime-20260807/regression-runtime.json` → **PASS**

| Check | Result |
|---|---|
| Member (`aa11`) `/api/admin/me` | ✅ 403 |
| Store Owner (`qqqq`) platform admin | ✅ 403 · RPC false · stores≥1 · role=user |
| Alias `aaaa` not privilege string | ✅ no gate match; authority = UUID + membership |
| Suspend gap honesty | ✅ profile suspended + membership **still active** + RPC true (do **not** assume admin cleared) |
| Suspended staff Admin API via session | ✅ 401 (session), not membership deny |
| Revoked staff | ✅ RPC false · no active membership |
| Auth login path | ✅ `/api/auth/login-settings` + Super Admin password login |
| `test_users` | ✅ readable; no new writers in membership/staff E paths |

### PHASE F rollup — **PASS** · E CLOSED (owner A)

| Item | Status |
|---|---|
| Grant | ✅ PASS |
| Revoke | ✅ PASS |
| Suspend | ⚪ N/A + **accepted** transitional gap (NOT IMPLEMENTED writer) |
| Regression | ✅ PASS |
| PHASE F | ✅ **PASS** |
| PHASE E | ✅ **CLOSED** — `docs/dibay-member-auth-phase-e-close.md` |
| PHASE G | ❌ **NOT DECLARED** — §13 gate review |

---

## 11. PHASE E CLOSE criteria

E may CLOSE only when:

1. §§2–10 have **recorded** PASS (or explicit N/A with reason)  
2. Dual-read still documented as transitional **or** membership-only cutover proven  
3. No open First Break that blocks Person Directory / Admin grant-revoke  

Then → consider PHASE G gate in account contract §13.

---

## 12. Verdict template (fill after runs)

```text
PHASE F RUNTIME — PASS
PHASE E — CLOSED (Suspend writer = NOT IMPLEMENTED / accepted gap)
PHASE G — NOT DECLARED (§13 gate)

Migration applied: YES
Grant: PASS
Revoke: PASS (product reject code: cannot_disable_super_admin)
Suspend: N/A + accepted gap
Regression: PASS
Dual-read: YES (transitional — G cutover item)
```

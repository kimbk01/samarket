# DIBAY MEMBER / AUTH — PHASE E CLOSE

**Status:** ✅ **CLOSED** (2026-08-07)  
**Owner decision:** Suspend gap = **accepted transitional N/A** (option A) — do **not** implement membership suspend writer as part of E.  
**Depends on:** PHASE A–D CLOSED · PHASE F PASS · `docs/dibay-member-auth-phase-f-runtime-validation.md`  
**Evidence:** `.qa-logs/phase-f-runtime-20260807/`

---

## 1. Why E CLOSE is allowed

PHASE D first-E scope was: Admin Membership + backfill/dual-read gates · Person Directory · Person Detail · P2 Internal/Ops surface.  
PHASE F proved those at runtime (Grant/Revoke/Directory/Detail/P2/Regression).  
Membership **suspend writer** was **not** a mandatory E deliverable; F recorded it as honest N/A instead of fake PASS.

Implementing membership suspend now would be **scope expansion during validation** — rejected.

---

## 2. Accepted transitional gaps (MUST NOT be mistaken for implemented)

| Gap | Status | Do not assume |
|---|---|---|
| **Admin membership suspend writer** | **NOT IMPLEMENTED** · accepted transitional gap | `profiles` moderation suspend ≠ `admin_memberships.status=suspended` |
| Dual-read privilege | Transitional until cutover / G | TARGET-only membership reads are HARD LOCK material, not E CLOSE |
| Last Super Admin product reject code | Runtime = `cannot_disable_super_admin` (front-gate) | Helper also has `last_super_admin`; document both |
| `admin_staff_permissions` table may be absent | Optional; empty permissions + tier defaults | Missing table is not membership SSOT failure |
| `test_users` | Still present | Delete only after G → H+ |

### Suspend gap (explicit)

```text
Admin membership suspend writer = NOT IMPLEMENTED
Accepted transitional gap (PHASE E CLOSE 2026-08-07)

CURRENT product suspend = profiles moderation (Person status)
admin_memberships may remain status=active
is_platform_admin(uuid) may remain true
Admin API block may be session invalidate (401), not membership deny
Directory/Detail may still show active admin membership
```

---

## 3. E delivered (runtime-backed)

1. `admin_memberships` + migration backfill + dual-read `is_platform_admin` / `requireAdmin*`
2. Staff Grant / Revoke writers (+ dual-write `profiles.role`)
3. Person Directory: stores join + membership projection
4. Person Detail: Store / Admin / Activity `not_implemented`
5. P2 Internal/Ops login copy
6. PHASE F PASS: Grant · Revoke · Suspend N/A+gap · Regression

---

## 4. Still forbidden after E CLOSE

- Declaring PHASE G without §13 HARD LOCK gate
- Deleting `test_users` / legacy writers
- Reopening Auth Session HARD LOCK
- Treating membership suspend as already shipped
- Treating dual-read as final TARGET cutover

---

## 5. Next

**Next:** PHASE G §13 gate review — `docs/dibay-member-auth-phase-g-gate-review.md` (HARD LOCK not auto-declared).  
Do not auto-declare G.

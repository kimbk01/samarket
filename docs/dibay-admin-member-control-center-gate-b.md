# DIBAY Admin Member Control Center — GATE B LOCK

**Status:** LOCKED 2026-08-11  
**HEAD at lock:** `4c111e191` (origin/main)  
**Depends on:** GATE A audit (PARTIAL — live DB/query plan/EYOO not measured)  
**EYOO:** REFERENCE NOT AVAILABLE — do not invent EYOO UI

Admin Member Control Center is an **orchestration surface**. It is not a new member warehouse, enum, or shadow authority.

## Locked SSOT

| Concern | Authority |
|---|---|
| Person | `auth.users.id` ≡ `profiles.id` |
| Store owner | `stores.owner_user_id` |
| Admin / Super Admin | active `admin_memberships` only |
| Point | `point_ledger` via `adjustUserPoints` / existing readers |
| Trust | `member_trust_snapshots` + `trust_events` |
| Delivery order | `store_orders` + financial-fact + apply transition |
| Community | `community_posts` / `community_comments` / `community_reports` |
| Trade | `posts` + existing trade chat |
| Messenger | 4-domain freeze (`general_direct` / `group` / `trade` / `store_order`) |
| Audit | `audit_logs` + `user_moderation_events` |

**DO NOT:** new `member_type` enum · Admin shadow table · store staff/employee role · `profiles.role` as admin allow/deny · `profiles.points` as balance SSOT · chat-body duplicate API · expose retired Business Credit or mix any archive ledger into Point · `test_users` Phase H cleanup in this track.

## Role model (additive)

Every onboarded person is a **회원**. Badges are additive from relations:

- 회원 (identity — always)
- 매장주 (`stores.owner_user_id`, 0..N)
- 관리자 (`admin_memberships.role=admin`)
- Super Admin (`admin_memberships.role=super_admin`)

Exclusive `admin > store_owner > member` overwrite is forbidden.

**일반회원 tab** = convenience filter (no store ownership and no admin membership). Not identity SSOT.  
**매장주 tab** = has store (overlap with admin allowed).  
**관리자 tab (person list)** = has active membership (overlap with store allowed). Staff CRUD remains a separate surface until Slice 2/9.  
**전체** = all onboarded persons (Slice 2).

## Slice order

1. Authority corrections (this implementation start)
2. Server list: search / pagination / filters / badges
3. Real `/admin/users/[id]` Control Center route + shell
4. Overview aggregates
5. Account/auth + address (read-only)
6. Community + trade tabs
7. Delivery/order + store tabs
8. Chat/group metadata only
9. Contact + moderation UI + ops history
10. Cleanup after Runtime PASS (dead files, 0 importer proof)

## KEEP / MODIFY / ADD / DELETE / NO CHANGE

| Item | Action |
|---|---|
| `admin_memberships` writers (staff API) | KEEP |
| `adjustUserPoints` / `AdminUserPointsSection` ledger | KEEP |
| Trust `recordTrustEvent(manual_adjustment)` | KEEP |
| `POST /api/admin/member-notes` | KEEP — wire in Slice 9 |
| `GET /api/admin/store-orders?buyer_user_id=` | KEEP — wire in Slice 7 |
| Exclusive `accountCategory` overwrite | MODIFY → additive badges |
| Moderation SA guard `profiles.role` | MODIFY → membership |
| List `lastActiveAt = last_login_at` | MODIFY → last login only |
| Detail activity = `phone_verified_at` | MODIFY → remove |
| List `profiles.points` as balance | MODIFY → omit column |
| Points fetch error → 0P | MODIFY → error ≠ zero |
| `/admin/users/[id]` modal redirect | MODIFY in Slice 3 |
| Server pagination / UUID search | ADD Slice 2 |
| Control Center tabs | ADD Slice 3+ |
| Store staff badge | NO CHANGE — no authority |
| `test_users` deletion | NO CHANGE (Phase H) |
| Native Android/iOS | NO CHANGE |
| EYOO copy of DB/permission | NO CHANGE |

## Surface map (Slice 1)

| Surface | Current | Target | Authority | CTA | Permission |
|---|---|---|---|---|---|
| Member list roles | exclusive category | additive badges | membership + `owner_user_id` | view | `users` |
| Member list points | `profiles.points` | omit | ledger only on detail | — | `point` on detail |
| Member list last login | unused / aliased | `profiles.last_login_at` | profile session sync | — | `users` |
| Detail clocks | phone_verified as activity | joined + last login | `created_at` / `last_login_at` | — | `users` |
| Moderation | `profiles.role` SA guard | membership guard | `admin_memberships` | warn/suspend/ban/restore | `users` |
| Point detail | ledger + fake 0 on error | ledger; error ≠ 0 | `point_ledger` | adjust | `point` |

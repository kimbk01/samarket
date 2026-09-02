# Support Center — Identity / Case / Session (CUT 2)

## ACCESS MODEL

**Selected: A — Supabase auth only + server case authorization**

DIBAY already uses Supabase authenticated sessions for all member/owner/admin APIs. Support access is gated by:

1. `requireAuthenticatedUserId()` on user APIs
2. `isRouteAdmin()` on admin APIs
3. Service-role writes with server-derived `requester_user_id` / `owner_store_id`
4. RLS SELECT: requester owns case; owner cases require store ownership; admin sees all

`support_sessions` are **lifecycle records only** (open/close), not bearer tokens.  
`sessionStorage` in FAB flow is **UX handoff only** — not authorization.

No `support_access_grants` table in CUT 2 (not required given auth SSOT).

## CASE SSOT

Tables (migration `20261202170000_support_cases_ssot.sql`):

| Table | Role |
|-------|------|
| `support_cases` | Canonical case; MEMBER (`owner_store_id IS NULL`) vs OWNER (`owner_store_id NOT NULL`) |
| `support_messages` | Conversation; `sender_type` set server-side |
| `support_sessions` | Lifecycle; one open session per case |
| `support_case_events` | Assignment/status audit trail |

Entry: `POST /api/support/cases/open` → `/support/cases/[caseId]`

## Identity rules

- MEMBER: `requester_user_id = auth.uid()`, `owner_store_id = NULL`
- OWNER: `requester_user_id = auth.uid()`, `owner_store_id` validated via `getCachedStoreIfOwner`
- Client never submits `user_id` / trusted `audience` for authorization
- Reference entities validated in `lib/support/support-reference-authority.ts`

## Admin

Canonical inbox: `/admin/support` (menu under Customer Platform → Support)

Legacy routes retained for migration: `/admin/member-notes`, `/admin/platform-inquiries`

## Verification

```bash
npm run verify:support-identity-contract
npm run verify:support-fab-visibility-contract
```

## Status labels

| Area | Status |
|------|--------|
| CODE_IMPLEMENTED | support_cases schema, APIs, UI, admin inbox |
| DB_APPLIED | **NOT_PROVEN** until migration applied to target env |
| RLS_PROVEN | CODE_IMPLEMENTED (policies in migration) |
| REALTIME_PROVEN | NOT_PROVEN (subscription code exists; no device run) |
| ADMIN_RUNTIME_PROVEN | NOT_PROVEN |
| PRODUCTION_PROVEN | NOT_PROVEN |

Legacy `member_admin_note_*` / `platform_admin_inquiries` **not deleted** — read compatibility preserved.

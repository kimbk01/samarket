# Web OAuth owner rebind — root fix contract (2026-08-04)

## Proven root

- SSOT: `user_auth_identities(provider, provider_user_id)` → owner (e.g. `c5068…`)
- Web: `exchangeCodeForSession` → Supabase creates parallel `auth.users` (e.g. `dd00…`) with `auth.identities` Google row
- Policy previously rejected `SAME_PROVIDER_SUBJECT_DIFFERENT_USER` (FALSE CONFLICT)

**SUPABASE USER CREATION IS AUTHORITATIVE** — fix is callback rebind, not “stop create” in DIBAY start.

## Design (pre-implement)

| Concern | Decision |
|---|---|
| Owner session re-issue | `admin.generateLink({ type: "magiclink" })` + route `verifyOtp({ token_hash })` on cookie-bound client. Fallback (Google subject only): deterministic password update + `signInWithPassword` (same pattern as native Google / Naver). |
| Temporary session | `signOut()` on parallel user **before** owner session cookies are written. |
| `auth.identities` | Google identity **stays** on the parallel “landing pad” user so retries reuse the same Supabase user (no new parallel users). App SSOT remains `user_auth_identities` → owner. No admin identity-move API; no raw `auth.identities` SQL. |
| `auth.users` delete | **Default: no delete.** Tombstone parallel user email + metadata `dibay_oauth_landing_pad`. Immediate `deleteUser` only if future hardened path proves purge-safe; not in v1. |
| Cookie / client | Same `createServerClient` cookie jar as callback `response`; `syncActiveSessionForUser(ownerId)` after success. |
| Rollback unit | If rebind fails after signOut: redirect login with `auth_error=oauth_rebind_failed` (no half-owner session). Landing-pad tombstone only after owner session verified. |
| Concurrent callback | In-process single-flight keyed by `provider:providerUserId`. Serverless multi-instance: identity unique key still lands on same pad user. |
| Orphan prevention | Do not create app profile / identity rows for parallel user; continue callback only as owner. |
| Profile non-destructive | Continue existing `ensurePendingAuthProfileRow` (fills empty nickname/display only). No email auto-merge. |
| Email merge | Forbidden. `provider_email_conflict` unchanged. |
| Scope | `user_auth_identities` subject match only. `profiles_fallback` mismatch still rejects. |

## Allowed files

- `lib/auth/provider-identity/web-oauth-owner-rebind.server.ts`
- `lib/auth/provider-identity/web-oauth-policy.server.ts`
- `app/auth/callback/route.ts`
- tests + this doc

## Forbidden

Launcher, Apple, Kakao, email auto-merge, profile/username overwrite, timeout/sleep retries.

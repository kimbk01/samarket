# DIBAY Admin Real Operation — CUT H PRE-LAUNCH RESET

**Status:** HARD LOCK (CUT H)  
**Companion:** `lib/admin/admin-real-operation-cut-h-prelaunch-reset-hard-lock.ts`  
**Gate:** `npm run verify:admin-real-operation-cut-h-prelaunch-reset-hard-lock`  
**Depends on:** CUT A–G (do not squash)

## Purpose

Safe **Pre-launch Reset**: protect first, dry-run with shared planner, typed confirmation, Production execute fail-closed.

Not: TRUNCATE CASCADE, schema wipe, auth.users mass delete, Admin SQL, single “delete all” button.

## Authority

| Piece | Owner |
|---|---|
| Planner | `buildPrelaunchResetPlan` |
| Dry-run / Execute | same planner + revalidate hash |
| Env gate | `resolvePrelaunchResetEnvGate` |
| Auth | `requireSuperAdmin` |
| Audit | `appendAuditLog` (audit_logs protected) |

## Environment

- Production **execute**: always blocked
- Production **dry-run**: fail-closed — requires `PRELAUNCH_RESET_PRODUCTION_DRY_RUN=1` (explicit opt-in)
- Execute elsewhere: requires `PRELAUNCH_RESET_ENABLED=1`
- Dry-run non-production: allowed for MASTER analysis

## Carry

Prior NOT_PROVEN / PARTIAL items remain. CUT F Placement ACTIVE/eligibility → **CUT I**.

## Forbidden ops reference

`supabase/scripts/wipe-all-app-data.sql` must never be wired to Admin UI.

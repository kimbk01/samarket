# DIBAY Supabase — FINAL PRODUCTION HARD LOCK

**Declared:** 2026-09-25  
**Evidence:** `.tmp/supabase-forensic-audit/fd10-final/` · `.tmp/supabase-forensic-audit/final-ship-integrity/`

HARD LOCK means current Product/DB P0/P1 = none proven, FD1–FD10 contracts stay, and historical rolling totals cannot unlock. It does **not** mean every historical error is zero, every object is referenced, or every runtime fixture was measured.

This document distinguishes two locks. Do not merge them.

| Lock | Meaning |
|---|---|
| **PRODUCT/DB PRODUCTION HARD LOCK** | Production Product/DB tree is closed. SHA equality with local HEAD is not required. |
| **REPOSITORY SSOT HARD LOCK** | This document + Cursor rule are Git authority. Remote origin authority requires an allowed push. |

## AUTHORITY

| Layer | Value |
|---|---|
| SUPABASE | `ckdosyydvgzqwpbwuhon` |
| PRODUCTION PRODUCT SHA | `854dd5c920449badff151c761cf24c08a5c6f99a` |
| ORIGIN | `854dd5c920449badff151c761cf24c08a5c6f99a` |
| DEPLOYMENT | `dpl_BCiszFHAiNMuK6q1USWwVNRySJXH` Ready |
| ALIAS | `samarket.vercel.app` |
| LOCAL HEAD at lock (unrelated device ancestors) | DeviceClass `15635e664cb55411a2b98a145b26e6d913c21267` · WindowClass `b0a0f918b3bcf447bcc7c6cbcc844f6159db0efc` |
| LOCAL QA commit | `2c7175803ddbb55568922ccaffc428769a71d99a` |
| HEAD=ORIGIN=PRODUCTION | **FALSE** — local unrelated device commits + local QA/governance |
| SUPABASE PRODUCT TREE EQUIVALENCE | **PASS** |

Vercel `githubCommitSha` meta may be null — not a product divergence.

Unrelated local device commits are **not** Supabase Product repairs:

- `15635e66` DeviceClass FD1 — LOCAL COMMIT only; origin-push authority **not** established
- `b0a0f918b` WindowClass FD2 — additional local ancestor observed at ship time; origin-push authority **not** established

Do not reset, revert, amend, rewrite, or push them to manufacture SHA equality.

## SCOPE

Supabase Product/DB/security/request reliability for project `ckdosyydvgzqwpbwuhon` as closed by FD1–FD10. Not a new feature audit. Not FD11.

## FD1–FD10 FINAL STATES

| FD | State | Production inclusion |
|---|---|---|
| FD1 user_sessions | CLOSED — PRESERVED | live table + mig `20270120130000` + repo `95224183be52cf2ec342152237ea650e2dc19d5b` ancestor |
| FD2 42703 | CLOSED — PRESERVED | mig `20270125160000` + code `98af0bd56ca69ef1380f9754ed924ef5c657cd1d` ancestor |
| FD3 RLS/security | CLOSED — PRESERVED | migs `20270125170000` + `20270125171000` in `9ae3c98352a4baf09e6cc7b33b356e1374b94275` ancestor |
| FD4 migrations | CLOSED — PRESERVED | local-only 35 intentional · remote-only 0 · two blocked unapplied |
| FD5 auth/session | CLOSED — PRESERVED | `3d4c89e2b9297de291794ff5f8bedc05c136fe25` ancestor |
| FD6 storage | CLOSED — PRESERVED · PRODUCTION LOCKED | `854dd5c920449badff151c761cf24c08a5c6f99a` IS Production · blob post stripped |
| FD7 realtime | CLOSED — PRESERVED | NO-OP · both slots ACTIVE |
| FD8 request/cost | CLOSED — PRESERVED · PRODUCTION LOCKED | NO-OP |
| FD9 residual/QA | CLOSED — PRESERVED | ledger UNKNOWN=0 · executable QA shipped locally this document set |
| FD10 final reconciliation | CLOSED — PRESERVED | no Product/DB change |

Cross-FD contradictions: **0**.

## PRODUCT REPAIR LEDGER

Required Product behavior repairs = **3**. Missing = **0**.

| FD | SHA | Purpose | origin/main ancestor | Production included |
|---|---|---|---|---|
| FD2 | `98af0bd56ca69ef1380f9754ed924ef5c657cd1d` | stop stale schema probes (`currency`/`category_id`/`applicant_nickname`/`parent_id`) | YES | YES |
| FD5 | `3d4c89e2b9297de291794ff5f8bedc05c136fe25` | fail-close `user_sessions` + logout-all still signs out | YES | YES |
| FD6 | `854dd5c920449badff151c761cf24c08a5c6f99a` | reject blob/localhost/undefined media refs; no invented AVIF `.feed.webp` | YES | YES IS Production |

FD7 / FD8 / FD9 / FD10 required **no** Product code repair.

## DB REPAIR LEDGER

Required Production DB repairs = **5 applied + 1 live data**. Missing = **0**.

| FD | Version / action | Repo | schema_migrations | Live |
|---|---|---|---|---|
| FD1 | `20270120130000` restore `user_sessions` | YES `95224183be52cf2ec342152237ea650e2dc19d5b` | YES | table + 7 indexes + RLS FORCE |
| FD2 | `20270125160000` browse_target | YES `98af0bd56` | YES | `browse_target_kind` live |
| FD3 | `20270125170000` revoke claim RPC client EXECUTE | YES `9ae3c9835` | YES | fn exists; client execute revoked |
| FD3 | `20270125171000` drop post-images public insert | YES `9ae3c9835` | YES | matching insert policy name absent |
| FD4 | forward APPLY + 161 HISTORY_REPAIR | YES | documented at FD4 close | remote-only 0 |
| FD6 | one-row blob strip `ab58bb51-ccd7-48f1-9ac6-db141d1b29b7` | data-only (no migration) | n/a | `has_blob=false` |

### Intentional unapplied (do not zero-drift)

| Version | Reason |
|---|---|
| `20260917140000` | caller_live unique — Call HARD LOCK + session-ending DML |
| `20261201270000` | delivery_ad cash charge table — Owner-deferred; browse already via FD2 |
| FD4 local-only 35 | SUPERSEDED / DATA_ONLY / OTHER_PROVEN / OBSOLETE / 2 BLOCKED |

## SECURITY FINAL STATE

| Area | Verdict |
|---|---|
| RLS | PASS (hist 389 ON / 0 OFF; `user_sessions` FORCE live) |
| Security Definer critical | PASS (claim client EXECUTE revoked) |
| Storage write | PASS (FD3 + FD6) |
| Finance writer | PASS deny-by-RLS (historical) |
| Admin | PASS deny (historical) |
| Service role | PASS |
| Cross-user | FIXTURE_BLOCKED |
| Cross-store | FIXTURE_BLOCKED |

## RELIABILITY FINAL STATE

| Area | Verdict |
|---|---|
| Schema/API | PASS current Product |
| Auth/session | PASS Product |
| Storage | PASS Product |
| Realtime | PASS slots ACTIVE; lifecycle NOT_PROVEN |
| Request/retry | PASS (no Product storm) |
| Connections | PASS (no pressure at last live proof) |
| Timeouts | NOT_PROVEN current 57014 |
| API residuals | historical classified; current hour NOT_PROVEN |

## CURRENT P0 / P1

CURRENT P0 = **0**  
CURRENT P1 = **0**

Historical repaired P0/P1 remain documented (FD1 missing table · FD2 42703 · FD3 claim/storage · FD5 fail-open · FD6 blob). They are not current defects.

## NOT_PROVEN

**25** — `.tmp/supabase-forensic-audit/fd10-final/NOT_PROVEN_LEDGER.csv`

Evidence-state, not unfinished Product defect. Do not promote to PASS. Do not treat as current P0/P1.

## FIXTURE_BLOCKED

**7** — `FIXTURE_BLOCKED_LEDGER.csv`

Fixture absence, not Product defect.

## INTENTIONAL DIVERGENCE

**10** — `INTENTIONAL_DIVERGENCE.csv`

Includes FD4 local-only 35, blocked Call/cash migrations, multi-device allow, 409/23505 idempotency, retained orphans, unpublished empty `group_messages`, bounded polls.

## P2 / OBSERVATIONS

**7** — `P2_OBSERVATIONS.csv`

Do not repair for lock aesthetics.

## QA STATE

Executable stale callers repaired (QA-only):

- `scripts/qa/notification-p0-scenario-5-10.mjs`
- `scripts/qa/notification-p0-adb-qa.mjs`
- `scripts/qa/notification-p0-scenario-4ab.mjs`

Change: `provider` → `provider_response`, `event_id` → `notification_event_id`.  
Canonical Production schema already uses those columns. No Product code. No DeviceClass code.

QA commit `2c7175803ddbb55568922ccaffc428769a71d99a` is QA-only (3 files). Parent includes unrelated device commits. That does **not** make DeviceClass/WindowClass a Supabase Product repair. **Not pushed** — blocked by unrelated unpushed ancestors.

## LOCAL UNRELATED / DIRTY (not this lock)

- DeviceClass `15635e66` and WindowClass `b0a0f918b` — preserve exactly; do not push for Supabase
- Other worktree dirty/untracked (fingerprint, APNS, perf docs, other domain locks, `.tmp`) — do not stage with this SSOT
- FD6-specific lock files may remain local; they do not unlock FD6 Production

## REOPEN CONDITIONS

Only:

1. New Production P0/P1
2. Reproduced regression
3. Schema / security / migration authority change
4. Current error signature that contradicts this lock
5. Infra/config change that invalidates the existing evidence

Do **not** reopen because historical dashboard counts are non-zero, NOT_PROVEN became testable without a defect, DeviceClass is unpushed, or repository SSOT is local-only.

Do **not** create FD11. Do **not** restart FD1–FD10.

## REPOSITORY SSOT SHIP

| Artifact | Path |
|---|---|
| Document | `docs/dibay-supabase-final-production-hard-lock.md` (this file) |
| Cursor rule | `.cursor/rules/dibay-supabase-final-production-hard-lock.mdc` |

If origin push is blocked solely by unrelated DeviceClass ancestry:

- PRODUCT/DB PRODUCTION HARD LOCK remains **PASS**
- REPOSITORY SSOT HARD LOCK = **LOCAL COMMITTED / PUSH BLOCKED**

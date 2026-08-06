# Slice 8 — CMS STATUS

## Phase 1 Legal — LOCKED

```text
SLICE 8 LEGAL CMS PHASE 1 LOCK
```

| Item | Value |
|------|-------|
| Product + LOCK SHA | `bbc23787f2269f44e4f3472c7e997098fe4e5f31` |
| Deploy | `dpl_fm6RtnqvwVXSJizRr2G9uL39MSrW` · source=`git` |
| SSOT | `app_legal_documents` |

## Phase 2 Business — IN PROGRESS

```text
SLICE 8 BUSINESS CMS PHASE 2 AUTHORIZED
SLICE 8 BUSINESS CMS PHASE 2 CODE IN PROGRESS
```

| Item | Detail |
|------|--------|
| SSOT | `app_platform_business_info` (≠ Legal · ≠ Notices) |
| Migration | `supabase/migrations/20261019130000_app_platform_business_info.sql` |
| Admin | `/admin/app/business` · `/api/admin/app-business-info` |
| Public | `GET /api/business-info` · `/business-info` |
| Member menu | MyPage support → `/business-info` |
| Consent | unchanged (no version chain) |

### Gate remaining

1. User applies migration on prod (if Runtime `table_missing`)
2. Isolated commit · `git push origin main` · Git Auto Deploy only
3. Runtime: `SLICE8P2_TARGET_SHA=<sha> node --env-file=.env.local scripts/qa/slice8-business-cms-runtime.mjs`
4. Then `SLICE 8 BUSINESS CMS PHASE 2 LOCK`

## Out of scope

FAQ · banners · popups · notices rewrite · Slice 1–7 reopen · CLI deploy · Auth/Messenger/Call/Badge

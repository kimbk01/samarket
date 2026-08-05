# Phase implementation report — Phase 2 Notice (slice 1)

**Date:** 2026-08-05  
**Scope:** Notice SSOT only (FAQ expansion deferred within Phase 2 / later)  
**Code/migration:** yes  

## What was implemented

1. **`app_notices` SSOT migration** — `supabase/migrations/20261018120000_app_notices.sql` (title, body, is_active, starts_at, ends_at)  
2. **Settings push merge removed** — `GET /api/me/settings/notices` returns board only (`source: app_notices_ssot`)  
3. **CS list + detail** — `NoticesContent` → `/mypage/notices/[noticeId]`; `GET /api/me/settings/notices/[noticeId]`  
4. **Admin CRUD** — `/api/admin/app-notices`, create/edit pages, list via API  
5. **Chain** — Notice edit → campaign create with `deeplink` + `appNoticeId` → presentation `displayPayload.appNoticeId` → Bell/inbox link `/mypage/notices/{id}`  

## What changed (files)

- Migration `20261018120000_app_notices.sql`  
- `app/api/me/settings/notices/route.ts` (+ `[noticeId]`)  
- `app/api/admin/app-notices/**`  
- `components/my/settings/NoticesContent.tsx`, `NoticeDetailContent.tsx`  
- `app/(main)/mypage/notices/[noticeId]/page.tsx`  
- `components/admin/app/AdminAppNoticesPage.tsx`, `AdminAppNoticeForm.tsx`  
- `app/admin/app/notices/create`, `[id]/edit`  
- `inbox-events-merge.ts`, `campaign-notification-presentation.ts`, `campaign-send-user.ts`, campaign create POST/UI  
- Tests: `member-notices-ssot.test.ts`  

## Runtime

| Surface | Result |
|---------|--------|
| Unit (member-notices-ssot / paths) | PASS (vitest 3) |
| `tsc --noEmit` (filtered touch paths) | PASS (exit 0) |
| Android / iOS / Admin device | **NOT RUN** — see Runtime evidence below |

## Runtime evidence (2026-08-05 recheck)

| # | Check | Verdict | Evidence |
|---|-------|---------|----------|
| 1 | Migration / `app_notices` exists | **PASS** | REST `GET .../app_notices` → HTTP 200, `table_missing=false` (service role; 0 rows then probe write) |
| 2 | Board write | **PASS (DB only)** | REST `POST app_notices` → 201, id `0cf5833b-0713-439d-9576-4cdb842dca6c` |
| 3 | Admin UI create | **NOT_PROVEN** | No Admin browser session this run; write was service-role REST, not `/admin/app/notices` |
| 4 | CS notice list | **NOT_PROVEN** | Phase 2 code not served: local `:3000` not listening; prod/vercel not verified to include this commit |
| 5 | CS notice detail | **NOT_PROVEN** | same |
| 6 | Campaign send | **NOT_PROVEN** | not executed |
| 7 | Bell receive | **NOT_PROVEN** | not executed |
| 8 | Bell → `/mypage/notices/{id}` | **NOT_PROVEN** | not executed |
| 9 | Settings has no push rows | **NOT_PROVEN** | needs member session on Phase 2 build |
| 10 | Android / iOS / Admin PASS | **FAIL** | devices attached (`RFCY40PY2CA`, `8b37179f7d94`) but Phase 2 build/session chain not run |

**Blocked on:** Phase 2 code on a runnable host (local Next or Preview/Prod deploy) + Admin/member auth + optional Campaign send + device Bell tap.

## Exit Gates

```
Phase: 2 (Notice slice)
Date: 2026-08-05
Product Gate: PASS — board SSOT; Bell not used as notice history in Settings
Authority Gate: PASS — merge removed; Campaign carries appNoticeId for deep link
Runtime Gate: FAIL — checklist 3–10 not proven on device/Admin UI
Admin Gate: PARTIAL — CRUD code present; Admin UI path not proven
Regression Gate: PARTIAL — unit/tsc only
Cleanup Tag Gate: PASS — merge helper REPLACE예정; API no longer merges
Next Phase allowed: NO — Runtime Gate FAIL
```

## PASS/FAIL

**Phase 2 NOT complete.** Do not start Phase 3.

Remaining for Runtime Gate PASS (minimum):

1. Serve Phase 2 build (local or Preview) with migration already present (**table exists**)  
2. Admin UI: create/edit notice (or use probe id above in CS once build is live)  
3. Member: CS list + detail `/mypage/notices/{id}`  
4. Campaign from notice (deeplink + appNoticeId) → Bell → detail  
5. Settings notices: no push/Bell rows  
6. Android + iOS + Admin smoke recorded  

Probe notice id (DB): `0cf5833b-0713-439d-9576-4cdb842dca6c` — may delete after QA.
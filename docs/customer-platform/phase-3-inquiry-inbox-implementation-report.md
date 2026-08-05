# Phase implementation report — Phase 3 Inquiry / Inbox (slice 1)

**Date:** 2026-08-05  
**Scope:** Inquiry + Inbox on shared `member_admin_note_*` (no new Inbox table)  
**Code/migration:** yes  
**Verdict:** **PASS — Phase 3 CLOSED**

## What was implemented

1. **Migration** — `started_by` (`member`|`admin`) + `member_archived_at` on `member_admin_note_threads` (live applied)
2. **Product split** — Inquiry = `started_by=member`; Inbox = `started_by=admin` (Admin → 1 member only)
3. **Service/API** — `createAdminNoteThread`, list `?kind=inquiry|inbox`, soft archive PATCH/DELETE; Admin POST create
4. **CS IA** — `/mypage/inquiries/**`, `/mypage/inbox/**`; mypage support menu; legacy `/notifications/notes` → inquiries (auth middleware may send unauth → login first)
5. **Bell** — `noteThreadId` + `startedBy` preferred over poisoned `routeUrl` → `/mypage/inquiries|inbox/{id}`
6. **Admin UI** — 1:1 Inbox create form + `started_by` badge on list

## Runtime (Production)

**HEAD = origin/main = deploy SHA:** `2ae6cc278bfe4cdcb430b63fbed573cf656c6e00`  
**Alias:** `https://samarket.vercel.app`  
**Evidence:** `.qa-logs/phase3-runtime-2ae6cc278/runtime-min.json`

| # | Item | Result |
|---|------|--------|
| 0 | Deploy SHA match | PASS (`2ae6cc278`) |
| 1 | migration columns | PASS |
| 2 | Member Inquiry create → list | PASS (`3c5d19d8-…`) |
| 3 | Admin Inbox create → list | PASS (`868e0a92-…`) |
| 4 | Bell deep link CS path | PASS (`/mypage/inquiries/…`) |
| 5 | Settings/Notice regression | PASS (notices API 401 unauth; routes 200) |
| 5b | CS routes live | PASS (`/mypage/inquiries`·`/inbox` 200) |
| 6 | Android smoke | PASS (prod alias + `com.dibay.app` on 2 devices + MainActivity) |
| 6b | iOS smoke | PASS (prod alias + `com.dibay.app` on iPhonebk) |

## Exit Gates

```
Phase: 3 (Inquiry / Inbox slice 1)
Date: 2026-08-05
Product Gate: PASS — Inquiry≠Inbox; Inbox=Admin→1 member; same table
Authority Gate: PASS — no new Inbox table / conversation_type LOCK
Runtime Gate: PASS — deploy SHA 2ae6cc278 + min runtime items
Admin Gate: PASS — Admin 1:1 Inbox create UI/API
Regression Gate: PASS — unit tests + Notice API still present
Cleanup Tag Gate: PASS — no Phase 7 deletes; notes redirect kept for compat
Next Phase allowed: YES → Phase 4 Point
```

## PASS/FAIL

**Phase 3 CLOSED.** Phase 4 may start.

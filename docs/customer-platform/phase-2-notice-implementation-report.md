# Phase implementation report — Phase 2 Notice (slice 1)

**Date:** 2026-08-05  
**Scope:** Notice SSOT only (FAQ expansion deferred within Phase 2 / later)  
**Code/migration:** yes  
**Verdict:** **PASS — Phase 2 CLOSED**

## What was implemented

1. **`app_notices` SSOT** — create migration + publish-window columns (`starts_at`/`ends_at` ADD IF NOT EXISTS)  
2. **Settings push merge removed** — `GET /api/me/settings/notices` board only (`source: app_notices_ssot`)  
3. **CS list + detail** — `/mypage/notices/[noticeId]`  
4. **Admin CRUD** — `/api/admin/app-notices`  
5. **Chain** — Campaign `appNoticeId` → Bell `link_url` `/mypage/notices/{id}` (appNoticeId preferred over poisoned absolute routeUrl)  
6. **Classifier** — `isMissingAppNoticesTableError` ignores column-missing errors  

## Runtime (Production)

**HEAD = origin/main = deploy SHA:** `9149593b809e7189056bf161633f269009f3ba8e`  
**Alias:** `https://samarket.vercel.app`  
**Evidence:** `.qa-logs/phase2-runtime-recheck-9149593b8/runtime-10.json`

| # | Item | Result |
|---|------|--------|
| 1 | app_notices | PASS |
| 2 | Admin Notice Create | PASS (`4b3625fe-1481-4f5e-b701-fd6bdc598a96`) |
| 3 | Customer Center List | PASS (`source: app_notices_ssot`) |
| 4 | Customer Center Detail | PASS |
| 5 | Campaign | PASS (test-send sent=1) |
| 6 | Bell Receive | PASS |
| 7 | Bell → Notice Detail | PASS (`link_url: /mypage/notices/4b3625fe-…`) |
| 8 | Settings | PASS (no push rows; SSOT source) |
| 9 | Android | PASS (intent + MainActivity + server.url prod alias) |
| 10 | iOS | PASS (com.dibay.app on device + server.url prod alias) |

## Exit Gates

```
Phase: 2 (Notice slice)
Date: 2026-08-05
Product Gate: PASS
Authority Gate: PASS
Runtime Gate: PASS — 10/10 on SHA 9149593b8
Admin Gate: PASS — Admin create API on production
Regression Gate: PASS — unit tests + settings SSOT
Cleanup Tag Gate: PASS
Next Phase allowed: YES → Phase 3 Inquiry / Inbox
```

## PASS/FAIL

**Phase 2 CLOSED.** Phase 3 may start.

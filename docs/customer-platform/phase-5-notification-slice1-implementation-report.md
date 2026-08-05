# Phase implementation report — Phase 5 Notification Engine Slice 1 (taxonomy A)

**Date:** 2026-08-05  
**Scope:** Inquiry/Inbox Bell types split from Campaign `admin_notice` collision  
**Code/migration:** `1cbb07b1b` + `20261018170000_phase5_slice1_inquiry_inbox_event_types.sql`  
**Verdict:** **PASS — Phase 5 Slice 1 CLOSED**

## What was implemented

1. **Types/registry/policy/badge** — `inquiry_answered`, `inbox_message_received` (Bell/push parity with `admin_notice`; badge digit folded into `adminNotice`)
2. **Notes writer** — [`notifyMemberOfAdminNote`](lib/notifications/member-admin-notes-service.ts): `started_by=member` → `inquiry_answered`; `admin` → `inbox_message_received`
3. **Bell dual-read** — new types map to `admin_notice` presentation / notice pushKind; legacy `admin_notice` + `previewKind=member_admin_note` kept
4. **Campaign** — unchanged (`admin_notice` / `admin_marketing_banner`)
5. **DB** — type/category CHECK + `count_notification_events_badge` fold
6. **Phase 1.5** — `notes → type admin_notice` → **REPLACE진행**

Out of scope (unchanged): Campaign→`notice_published`, historical backfill, Admin CP menu MERGE, Phase 6 Runtime Matrix.

## Runtime (Production)

**HEAD = origin/main = deploy SHA:** `1cbb07b1b5afaec836a649e622d6cb2989fc1baf`  
**Alias:** `https://samarket.vercel.app`  
**Evidence:** `.qa-logs/phase5-slice1-runtime-1cbb07b1b/runtime-min.json`

| # | Item | Result |
|---|------|--------|
| 0 | Deploy SHA match | PASS |
| 1 | Inbox typed write → `inbox_message_received` + `/mypage/inbox/{id}` | PASS |
| 2 | Inquiry typed write → `inquiry_answered` + `/mypage/inquiries/{id}` | PASS |
| 3 | Legacy `admin_notice` + `member_admin_note` dual-read insertable | PASS |
| 4 | Campaign still `admin_notice`; notes writer no longer writes `admin_notice` | PASS |
| 5 | Android / iOS smoke (prod alias) | PASS |
| 6 | Badge RPC reachable after migration | PASS |

## Exit Gate — Slice 1

```
Phase: 5 Slice 1 (Notification taxonomy A)
Date: 2026-08-05
Product Gate: PASS — Inquiry/Inbox typed; Campaign admin_notice kept; dual-read
Authority Gate: PASS — notes writer only; Campaign untouched
Runtime Gate: PASS — SHA 1cbb07b1b
Admin Gate: PASS — no CP menu MERGE
Regression Gate: PASS — unit/contracts + Campaign mapping
Cleanup Tag Gate: PASS — notes→admin_notice REPLACE진행
Next allowed: Phase 5 further slices (e.g. Campaign notice_published) then Phase 5 Exit Gate
```

## PASS/FAIL

**Phase 5 Slice 1 CLOSED.**  
Phase 5 full Exit Gate: **not yet** (remaining slices pending).

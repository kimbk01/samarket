# P4 Android 2-device QA — runbook

**Status: QA WAITING** — second device not connected (2026-06-18)

## Snapshot

| Step | Status |
|------|--------|
| Migration | PASS |
| pg_cron | UNVERIFIED (Dashboard SQL) |
| stale-cleanup route | Code exists; **not** in `vercel.json` crons |
| Device1 `RFCY40PY2CA` | APK installed |
| Device2 | MISSING |
| A~J live QA | NOT RUN |
| P4 done | NO |

## 1. pg_cron (Dashboard SQL Editor)

```sql
SELECT jobid, jobname, schedule, command
FROM cron.job
WHERE jobname = 'cleanup_stale_cm_call_sessions';
```

Expected: `*/2 * * * *`, `SELECT public.cleanup_stale_community_messenger_call_sessions();`

If `cron.job` not found → pg_cron extension not used; rely on API route + scheduler.

## 2. When device2 connects

```bash
export PATH="$HOME/Library/Android/sdk/platform-tools:$PATH"
adb devices -l

APK=android/app/build/outputs/apk/debug/app-debug.apk
D1=RFCY40PY2CA
D2=<second-serial>

adb -s "$D1" install -r "$APK"
adb -s "$D2" install -r "$APK"

adb -s "$D1" shell am force-stop com.dibay.app
adb -s "$D2" shell am force-stop com.dibay.app
adb -s "$D1" shell monkey -p com.dibay.app 1
adb -s "$D2" shell monkey -p com.dibay.app 1

adb -s "$D1" logcat -c
adb -s "$D2" logcat -c

adb -s "$D1" logcat -s DIBAY_CALL DIBAY_CALL_LIFECYCLE DIBAY_CALL_MEDIA DIBAY_FCM DIBAY_PUSH_ROUTE \
  > docs/perf/p4-device1-logcat.txt &

adb -s "$D2" logcat -s DIBAY_CALL DIBAY_CALL_LIFECYCLE DIBAY_CALL_MEDIA DIBAY_FCM DIBAY_PUSH_ROUTE \
  > docs/perf/p4-device2-logcat.txt &
```

## 3. Accounts

- Device A: account A
- Device B: account B (not same account on both)
- Mutual chat / call allowed; push tokens registered

## 4. Scenarios A~J

Record per row: callId, mediaType, device phases, heartbeat DB, surface, cleanup reason, PASS/FAIL.

See checklist in `docs/perf/p4-active-call-device-qa.md`.

## 5. Heartbeat SQL (during active call)

```sql
SELECT id, status, answered_at,
       caller_last_heartbeat_at, callee_last_heartbeat_at, reconnecting_since,
       ended_at, ended_reason
FROM community_messenger_call_sessions
WHERE id = '<callId>';
```

## 6. stale-cleanup API (pg_cron alternative)

```
POST /api/community-messenger/calls/sessions/stale-cleanup
Authorization: Bearer <CRON_SECRET>
```

Implementation: `app/api/community-messenger/calls/sessions/stale-cleanup/route.ts`  
Vercel Cron: **not configured** in `vercel.json` as of 2026-06-18.

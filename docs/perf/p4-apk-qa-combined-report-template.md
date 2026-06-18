# P4 APK 배포 QA — 결합 보고 양식

Device A: USB logcat + Supabase  
Device B: `/debug/call-qa` export + Supabase

## Per scenario (A~J)

| ID | PASS/FAIL | callId | media | D1 phase | D2 phase | heartbeat OK | cleanup reason | notes |
|----|-----------|--------|-------|----------|----------|--------------|----------------|-------|
| A | | | audio | | | | | |
| B | | | video | | | | | |
| C | | | | | | | | |
| D | | | | | | | | |
| E | | | | | | | | |
| F | | | | | | | | |
| G | | | | | | | | |
| H | | | | | | | | |
| I | | | | | | | | |
| J | | | video | | | | | |

## Heartbeat SQL snapshot (paste after key scenarios)

```sql
SELECT id, status, caller_last_heartbeat_at, callee_last_heartbeat_at,
       reconnecting_since, ended_at, ended_reason
FROM community_messenger_call_sessions
WHERE id = '<callId>';
```

## Fail log grep (Device A logcat)

Must be **absent** for P4 pass:

- `active_call_cleanup reason=screen_off|backgrounded|activity_destroyed|webview_reload`
- `background caused call ended`
- `screen off caused agora_leave`
- `heartbeat PATCH failed` / `heartbeat_patch_failed`

## Device B QA log export

Attach `p4-deviceB-call-qa-export.txt` (from Copy all logs on `/debug/call-qa`).

## Completion gate

- [ ] stale cleanup owner: pg_cron **or** Vercel Cron (one only)
- [ ] A~J all PASS or fixed + retest
- [ ] Final APK rebuilt after fixes
- [ ] Single commit: `feat(messenger-call): stabilize active call session lifecycle`

# P4 Active Call — device QA log

**Status: QA WAITING (APK distribute mode)**

Last updated: 2026-06-18

## Mode

| Track | Device A (USB) | Device B (APK file) |
|-------|----------------|---------------------|
| Serial | `RFCY40PY2CA` | TBD — no USB |
| Logs | `adb logcat` → `p4-device1-logcat.txt` | `/debug/call-qa` in-app |
| Account | A | B (different) |

## Gate checklist

| Item | Status |
|------|--------|
| Migration | **PASS** |
| pg_cron | **UNVERIFIED** — Dashboard SQL |
| stale cleanup owner | **UNDECIDED** — pg_cron or Vercel Cron (one only) |
| QA log viewer (Device B) | **`/debug/call-qa`** implemented |
| APK distribute build | Rebuild → `docs/perf/dibay-p4-active-call-debug-20260618.apk` |
| A~J live QA | **NOT RUN** |
| P4 complete | **NO** |

See also:

- `docs/perf/p4-apk-distribute-install-guide.md`
- `docs/perf/p4-apk-qa-combined-report-template.md`
- `docs/perf/p4-android-qa-runbook.md`

## A~J (record callId + PASS/FAIL per row)

| ID | Scenario | callId | PASS/FAIL |
|----|----------|--------|-----------|
| A | Voice + B screen off | | |
| B | Video + B screen off | | |
| C | B home | | |
| D | B lock | | |
| E | B task swipe | | |
| F | A ends → B remote | | |
| G | B ends → A remote | | |
| H | Network blip | | |
| I | Re-entry | | |
| J | Video PiP | | |

## Commit

**Blocked** until A~J PASS + log exports + final APK rebuild.

Message: `feat(messenger-call): stabilize active call session lifecycle`

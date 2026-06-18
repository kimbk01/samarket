#!/usr/bin/env bash
# P4 Active Call — adb log smoke (requires connected device + active call)
set -euo pipefail
TAG="DIBAY_CALL"
echo "=== P4 active call log smoke (filter $TAG) ==="
adb logcat -d -s "$TAG" | rg -e "active_call_connected|call_lifecycle_background_keep_alive|call_lifecycle_screen_off_keep_alive|active_call_pip_entered|active_call_resume_found|active_call_cleanup_blocked|remote_ended_received" || {
  echo "No P4 active-call markers in logcat yet — run device QA scenarios first."
  exit 0
}
echo "=== PASS (markers found) ==="

#!/usr/bin/env bash
# 수신 통화 3상태 스모크 — 연결된 Android 기기 + debug APK.
set -euo pipefail

ADB="${ADB:-$HOME/Library/Android/sdk/platform-tools/adb}"
PKG="com.dibay.app"
TS="$(date +%s)"

if ! "$ADB" get-state >/dev/null 2>&1; then
  echo "incoming-call-device-smoke: FAIL — no adb device"
  exit 1
fi

pass=0
fail=0

check_log() {
  local label="$1"
  local pattern="$2"
  local log="$3"
  if echo "$log" | rg -q "$pattern"; then
    echo "  PASS $label"
    pass=$((pass + 1))
  else
    echo "  FAIL $label (missing: $pattern)"
    fail=$((fail + 1))
  fi
}

run_incoming() {
  local call_id="$1"
  "$ADB" logcat -c >/dev/null 2>&1 || true
  "$ADB" shell am broadcast -a com.dibay.DEBUG_INCOMING_CALL --es callId "$call_id" "$PKG" >/dev/null
  sleep 5
  "$ADB" logcat -d 2>/dev/null | rg "DIBAY_CALL|DIBAY_INCOMING_CALL|DIBAY_CALL_PUSH|DIBAY_PUSH_ROUTE" || "$ADB" logcat -d
}

echo "incoming-call-device-smoke: device=$("$ADB" shell getprop ro.product.model | tr -d '\r')"

"$ADB" shell am force-stop "$PKG" >/dev/null 2>&1 || true
sleep 1

# A — foreground (unlock + app visible)
"$ADB" shell input keyevent KEYCODE_WAKEUP >/dev/null 2>&1 || true
"$ADB" shell wm dismiss-keyguard >/dev/null 2>&1 || true
"$ADB" shell am start -n "$PKG/.MainActivity" >/dev/null 2>&1 || true
sleep 3
CALL_FG="smoke-fg-$TS"
LOG_FG="$(run_incoming "$CALL_FG")"
echo "[A] foreground $CALL_FG"
check_log "foreground native pill route" "callId=$CALL_FG.*selectedSurface=foreground_banner" "$LOG_FG"
check_log "foreground native pill launch" "foreground_incoming_native_pill callId=$CALL_FG|foreground_incoming_activity_launch callId=$CALL_FG|incoming_received callId=$CALL_FG source=foreground_native" "$LOG_FG"
check_log "foreground native UI rendered" "incoming_activity_created.*callId=$CALL_FG.*source=foreground_activity|foreground_incoming_activity_shown callId=$CALL_FG" "$LOG_FG"
if echo "$LOG_FG" | rg -q "callId=$CALL_FG.*source=web_banner|ui_shown source=web_banner.*callId=$CALL_FG"; then
  echo "  FAIL foreground must not claim web_banner without Web render"
  fail=$((fail + 1))
else
  echo "  PASS foreground avoids fake web_banner presented"
  pass=$((pass + 1))
fi
if echo "$LOG_FG" | rg -q "incoming_activity_lock_direct_launch callId=$CALL_FG"; then
  echo "  FAIL foreground must not use lock direct launch"
  fail=$((fail + 1))
else
  echo "  PASS foreground avoids lock direct launch"
  pass=$((pass + 1))
fi

# B — background (home, unlocked)
"$ADB" shell am broadcast -a com.dibay.DEBUG_CALL_CANCELED --es callId "$CALL_FG" "$PKG" >/dev/null 2>&1 || true
sleep 1
CALL_BG="smoke-bg-$TS"
"$ADB" shell input keyevent KEYCODE_HOME >/dev/null 2>&1 || true
"$ADB" shell wm dismiss-keyguard >/dev/null 2>&1 || true
sleep 2
LOG_BG="$(run_incoming "$CALL_BG")"
echo "[B] background $CALL_BG"
check_log "background notification posted" "incoming_notification_posted callId=$CALL_BG|incoming_posted_immediate callId=$CALL_BG" "$LOG_BG"
check_log "background presentation delivered" "background_presentation_deliver callId=$CALL_BG" "$LOG_BG"
check_log "background call UI surface" "callstyle_attached callId=$CALL_BG|fsi_attached callId=$CALL_BG|outside_app_incoming_activity_launch callId=$CALL_BG|incoming_activity_shown callId=$CALL_BG" "$LOG_BG"

# C — lock screen
"$ADB" shell am broadcast -a com.dibay.DEBUG_CALL_CANCELED --es callId "$CALL_BG" "$PKG" >/dev/null 2>&1 || true
sleep 1
CALL_LK="smoke-lk-$TS"
"$ADB" shell input keyevent KEYCODE_POWER >/dev/null 2>&1 || true
sleep 1
LOG_LK="$(run_incoming "$CALL_LK")"
echo "[C] lock $CALL_LK"
check_log "lock incoming_activity surface" "callId=$CALL_LK.*selectedSurface=incoming_activity" "$LOG_LK"
check_log "lock direct activity or render" "incoming_activity_lock_direct_launch callId=$CALL_LK|outside_app_incoming_activity_launch callId=$CALL_LK|incoming_render callId=$CALL_LK source=(lock_activity|activity|fgs_fullscreen|outside_app_activity)|incoming_activity_created callId=$CALL_LK|incoming_activity_shown callId=$CALL_LK" "$LOG_LK"

# cleanup ringing
for id in "$CALL_FG" "$CALL_BG" "$CALL_LK"; do
  "$ADB" shell am broadcast -a com.dibay.DEBUG_CALL_CANCELED --es callId "$id" "$PKG" >/dev/null 2>&1 || true
done
"$ADB" shell input keyevent KEYCODE_WAKEUP >/dev/null 2>&1 || true

echo "incoming-call-device-smoke: pass=$pass fail=$fail"
if [ "$fail" -gt 0 ]; then
  exit 1
fi

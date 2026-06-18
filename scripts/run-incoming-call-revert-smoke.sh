#!/usr/bin/env bash
# Reverted baseline (30fc7fb4) — 3-state incoming call smoke on connected device.
set -euo pipefail

ADB="${ADB:-$HOME/Library/Android/sdk/platform-tools/adb}"
PKG="com.dibay.app"
TS="$(date +%s)"

if ! "$ADB" get-state >/dev/null 2>&1; then
  echo "revert-smoke: FAIL — no adb device"
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

check_top_activity() {
  local label="$1"
  local pattern="$2"
  local top
  top="$("$ADB" shell dumpsys activity activities 2>/dev/null | tr -d '\r' || true)"
  if echo "$top" | rg -q "$pattern"; then
    echo "  PASS $label"
    pass=$((pass + 1))
  else
    echo "  FAIL $label (top activity missing: $pattern)"
    fail=$((fail + 1))
  fi
}

run_incoming() {
  local call_id="$1"
  "$ADB" logcat -c >/dev/null 2>&1 || true
  "$ADB" shell am broadcast -a com.dibay.DEBUG_INCOMING_CALL --es callId "$call_id" "$PKG" >/dev/null
  sleep 5
  "$ADB" logcat -d 2>/dev/null | rg "DIBAY_CALL|DIBAY_INCOMING_CALL|DIBAY_CALL_PUSH|DIBAY_FCM|DIBAY_PUSH_ROUTE" || "$ADB" logcat -d
}

echo "revert-smoke: device=$("$ADB" shell getprop ro.product.model | tr -d '\r')"

"$ADB" shell am force-stop "$PKG" >/dev/null 2>&1 || true
sleep 1

# A — foreground
"$ADB" shell input keyevent KEYCODE_WAKEUP >/dev/null 2>&1 || true
"$ADB" shell wm dismiss-keyguard >/dev/null 2>&1 || true
"$ADB" shell am start -n "$PKG/.MainActivity" >/dev/null 2>&1 || true
sleep 3
CALL_FG="rv-fg-$TS"
LOG_FG="$(run_incoming "$CALL_FG")"
echo "[A] foreground $CALL_FG"
check_log "foreground FCM path" "incoming_call_foreground_native_ui callId=$CALL_FG" "$LOG_FG"
check_log "foreground native pill launch" "foreground_incoming_activity_launch callId=$CALL_FG|foreground_incoming_native_pill callId=$CALL_FG" "$LOG_FG"
check_log "foreground UI rendered" "incoming_activity_created.*callId=$CALL_FG.*source=foreground_activity|foreground_incoming_activity_shown callId=$CALL_FG" "$LOG_FG"
check_top_activity "foreground IncomingCallActivity on screen" "IncomingCallActivity.*$CALL_FG|ForegroundIncomingCallActivity"

# B — background (home)
"$ADB" shell am broadcast -a com.dibay.DEBUG_CALL_CANCELED --es callId "$CALL_FG" "$PKG" >/dev/null 2>&1 || true
sleep 1
CALL_BG="rv-bg-$TS"
"$ADB" shell input keyevent KEYCODE_HOME >/dev/null 2>&1 || true
"$ADB" shell wm dismiss-keyguard >/dev/null 2>&1 || true
sleep 2
LOG_BG="$(run_incoming "$CALL_BG")"
echo "[B] background $CALL_BG"
check_log "background FCM path" "incoming_call_native_notification callId=$CALL_BG|background_ui_deferred_to_fgs callId=$CALL_BG" "$LOG_BG"
check_log "background presentation delivered" "background_presentation_deliver callId=$CALL_BG" "$LOG_BG"
check_log "background notification posted" "incoming_notification_posted callId=$CALL_BG|incoming_posted_immediate callId=$CALL_BG" "$LOG_BG"
check_log "background UI surface" "outside_app_incoming_activity_launch callId=$CALL_BG|incoming_posted_immediate callId=$CALL_BG|incoming_notification_posted callId=$CALL_BG|fsi_attached callId=$CALL_BG" "$LOG_BG"
if echo "$LOG_BG" | rg -q "fsi_attached callId=$CALL_BG.*fgsDelivery=true"; then
  echo "  PASS background FSI from FGS (UI without channel sound)"
  pass=$((pass + 1))
else
  echo "  FAIL background FSI from FGS missing"
  fail=$((fail + 1))
fi
RING_BG_COUNT="$(echo "$LOG_BG" | rg "ring_start callId=$CALL_BG" | wc -l | tr -d ' ')"
if [ "${RING_BG_COUNT:-0}" -eq 1 ]; then
  echo "  PASS background single ring_start"
  pass=$((pass + 1))
else
  echo "  FAIL background ring_start count=$RING_BG_COUNT (expected 1)"
  fail=$((fail + 1))
fi
NOTIF_BG="$("$ADB" shell dumpsys notification --noredact 2>/dev/null | tr -d '\r' | rg "callId=$CALL_BG|$CALL_BG|Debug Caller" || true)"
if [ -n "$NOTIF_BG" ]; then
  echo "  PASS background notification visible in dumpsys"
  pass=$((pass + 1))
else
  echo "  FAIL background notification visible in dumpsys"
  fail=$((fail + 1))
fi

# C — lock
"$ADB" shell am broadcast -a com.dibay.DEBUG_CALL_CANCELED --es callId "$CALL_BG" "$PKG" >/dev/null 2>&1 || true
sleep 1
CALL_LK="rv-lk-$TS"
"$ADB" shell input keyevent KEYCODE_POWER >/dev/null 2>&1 || true
sleep 2
LOG_LK="$(run_incoming "$CALL_LK")"
echo "[C] lock $CALL_LK"
check_log "lock FCM path" "incoming_call_native_notification callId=$CALL_LK|lock_presentation_immediate callId=$CALL_LK" "$LOG_LK"
check_log "lock notification posted" "incoming_posted_immediate callId=$CALL_LK|incoming_notification_posted callId=$CALL_LK" "$LOG_LK"
check_log "lock UI launch or FSI" "incoming_activity_lock_launch callId=$CALL_LK|fsi_attached callId=$CALL_LK|incoming_activity_created callId=$CALL_LK|incoming_activity_shown callId=$CALL_LK" "$LOG_LK"
RING_LK_COUNT="$(echo "$LOG_LK" | rg "ring_start callId=$CALL_LK" | wc -l | tr -d ' ')"
if [ "${RING_LK_COUNT:-0}" -eq 1 ]; then
  echo "  PASS lock single ring_start"
  pass=$((pass + 1))
else
  echo "  FAIL lock ring_start count=$RING_LK_COUNT (expected 1)"
  fail=$((fail + 1))
fi
TOP_LK="$("$ADB" shell dumpsys activity activities 2>/dev/null | tr -d '\r' || true)"
if echo "$TOP_LK" | rg -q "IncomingCallActivity"; then
  echo "  PASS lock IncomingCallActivity in activity stack"
  pass=$((pass + 1))
else
  NOTIF_LK="$("$ADB" shell dumpsys notification --noredact 2>/dev/null | tr -d '\r' | rg "$CALL_LK|Debug Caller" || true)"
  if [ -n "$NOTIF_LK" ]; then
    echo "  PASS lock notification present (FSI may defer activity)"
    pass=$((pass + 1))
  else
    echo "  FAIL lock no IncomingCallActivity and no notification"
    fail=$((fail + 1))
  fi
fi

for id in "$CALL_FG" "$CALL_BG" "$CALL_LK"; do
  "$ADB" shell am broadcast -a com.dibay.DEBUG_CALL_CANCELED --es callId "$id" "$PKG" >/dev/null 2>&1 || true
done
"$ADB" shell input keyevent KEYCODE_WAKEUP >/dev/null 2>&1 || true

echo "revert-smoke: pass=$pass fail=$fail"
if [ "$fail" -gt 0 ]; then
  exit 1
fi

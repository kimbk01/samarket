#!/usr/bin/env bash
# Isolated Kakao SDK M1–M4 probe on Xiaomi — does NOT change Product login.
# Usage: DEVICE=8b37179f7d94 bash scripts/qa/kakao-sdk-method-probe-matrix.sh [talk|account|account_login|account_select|all]
set -euo pipefail
DEVICE="${DEVICE:-8b37179f7d94}"
METHOD="${1:-all}"
PKG=com.dibay.app
ACTIVITY=com.dibay.app/.KakaoSdkMethodProbeActivity
TAG=DIBAY_KAKAO_PROBE
OUT_DIR="${OUT_DIR:-/tmp/kakao-sdk-probe}"
mkdir -p "$OUT_DIR"

run_one() {
  local m="$1"
  echo "==== PROBE method=$m ===="
  adb -s "$DEVICE" logcat -c || true
  adb -s "$DEVICE" shell am force-stop "$PKG" || true
  sleep 1
  adb -s "$DEVICE" shell am start -n "$ACTIVITY" --es method "$m"
  # Capture UI while Kakao sheet may be visible
  sleep 3
  adb -s "$DEVICE" shell uiautomator dump /sdcard/kakao_probe_ui.xml >/dev/null 2>&1 || true
  adb -s "$DEVICE" pull /sdcard/kakao_probe_ui.xml "$OUT_DIR/${m}-ui.xml" >/dev/null 2>&1 || true
  # Wait for probe_result (silent Talk may finish quickly; Account may need user)
  local waited=0
  local max=90
  while (( waited < max )); do
    if adb -s "$DEVICE" logcat -d -s "$TAG" | rg -q "probe_result method=$m"; then
      break
    fi
    sleep 2
    waited=$((waited + 2))
  done
  adb -s "$DEVICE" logcat -d -s "$TAG" | tee "$OUT_DIR/${m}-logcat.txt"
  echo "UI dump: $OUT_DIR/${m}-ui.xml"
  if [[ -f "$OUT_DIR/${m}-ui.xml" ]]; then
    rg -o 'text="[^"]{0,80}"' "$OUT_DIR/${m}-ui.xml" | head -40 || true
  fi
}

case "$METHOD" in
  talk|account|account_login|account_select)
    run_one "$METHOD"
    ;;
  all)
    for m in talk account account_login account_select; do
      run_one "$m"
      echo
      echo ">>> If Account UI is open, complete/cancel on device before next method (15s)…"
      sleep 15
    done
    ;;
  *)
    echo "usage: $0 [talk|account|account_login|account_select|all]"
    exit 2
    ;;
esac

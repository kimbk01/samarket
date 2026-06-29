/**
 * ScreenAwakeBridge connected-video lease contract (bridge-only LOCK-SAFE fix).
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const bridgePath = "android/app/src/main/java/com/dibay/app/call/ScreenAwakeBridge.java";
let failed = false;

function fail(message) {
  console.error(`verify:screen-awake-bridge-contract FAIL - ${message}`);
  failed = true;
}

function pass(message) {
  console.log(`  OK ${message}`);
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

const bridge = read(bridgePath);

const requiredMarkers = [
  "APPLY_RETRY_DELAYS_MS = {100L, 300L, 700L}",
  "resolveApplyTargetActivity",
  "screen_awake_apply_missing_activity",
  "screen_awake_apply_retry_scheduled",
  "screen_awake_apply_retry_success",
  "screen_awake_apply_retry_giveup",
  "cancelPendingApplyRetriesLocked",
  "reapply_on_resume_fallback",
  "isApplyTargetValid",
  "isDestroyed()",
];

for (const marker of requiredMarkers) {
  if (!bridge.includes(marker)) {
    fail(`ScreenAwakeBridge missing marker: ${marker}`);
  }
}

const forbiddenNativeActivityMarkers = [
  "NativeVideoCallActivity",
  "shouldProtectScreenAwakeClear",
  "syncKeepScreenOnForState",
];

for (const marker of forbiddenNativeActivityMarkers) {
  if (bridge.includes(marker)) {
    fail(`ScreenAwakeBridge must not reference native activity hold: ${marker}`);
  }
}

if (bridge.includes("applyToActivity(activity, marker);\n    // silent")) {
  fail("silent apply return path must not remain");
}

if (!failed) {
  pass("ScreenAwakeBridge retry + missing-activity contract markers present");
  pass("ScreenAwakeBridge has no native Activity direct-hold coupling");
  console.log("verify:screen-awake-bridge-contract PASS");
  process.exit(0);
}

process.exit(1);

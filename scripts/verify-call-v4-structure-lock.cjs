/**
 * Call V4 structure lock — prevent legacy lane leaks into production V4 path.
 * Usage: npm run verify:call-v4-structure-lock
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

let failed = false;

function fail(msg) {
  console.error(`verify:call-v4-structure-lock FAIL — ${msg}`);
  failed = true;
}

function pass(msg) {
  console.log(`  OK ${msg}`);
}

const sheet = read("components/community-messenger/call-v4/CallV4IncomingSheet.tsx");
const surface = read("lib/community-messenger/call-v4/call-v4-incoming-surface.ts");
const delivery = read("android/app/src/main/java/com/dibay/app/IncomingCallPushDelivery.java");
const telegram = read("lib/community-messenger/call-v4/call-v4-telegram-incoming-surface.ts");

if (sheet.includes("buildIncomingCallPreviewHref")) {
  fail("CallV4IncomingSheet must not link V3 preview route");
} else {
  pass("V4 sheet expand is V4-only");
}

if (surface.includes("resolveSuppressReasonLegacy")) {
  fail("resolveSuppressReasonLegacy dead suppress must be removed");
} else {
  pass("no resolveSuppressReasonLegacy");
}

const sheetGate = surface.match(/export function canRenderWebIncomingSheet[\s\S]*?^}/m)?.[0] ?? "";
if (sheetGate.includes("document.visibilityState") || sheetGate.includes("visibilityState")) {
  fail("canRenderWebIncomingSheet must not use document.visibilityState");
} else {
  pass("sheet gate owner-only");
}

if (delivery.includes("ForegroundIncomingCallActivity") || delivery.includes("IncomingCallForegroundUiLauncher")) {
  fail("PushDelivery must not reference legacy foreground pill");
} else {
  pass("PushDelivery has no foreground pill");
}

if (!telegram.includes("unknown_pending")) {
  fail("telegram incoming surface contract must document unknown_pending owner");
} else {
  pass("unknown_pending in contract");
}

const notifier = read("android/app/src/main/java/com/dibay/app/IncomingCallBackgroundNotifier.java");
if (notifier.includes('fgsDelivery, "lock"') || notifier.includes(', "lock")')) {
  fail('IncomingCallBackgroundNotifier visibility tag must be "locked" not "lock"');
} else {
  pass("lock visibility tag uses locked");
}

const lockFsiMethod =
  notifier.match(/private static void presentV4LockFsiOnlyIncoming[\s\S]*?^  \}/m)?.[0] ?? "";
const backgroundMethod =
  notifier.match(/private static void presentV4BackgroundActivityFirstIncoming[\s\S]*?^  \}/m)?.[0] ?? "";

if (!notifier.includes("presentV4LockFsiOnlyIncoming") || !notifier.includes("lock_incoming_fsi_only")) {
  fail("Policy A: lock/sleep must use presentV4LockFsiOnlyIncoming");
} else {
  pass("Policy A lock FSI-only entry");
}

if (lockFsiMethod.includes("launchIncomingActivity")) {
  fail("Policy A: lock path must not call launchIncomingActivity (manual startActivity forbidden)");
} else {
  pass("Policy A no manual startActivity on lock path");
}

if (lockFsiMethod.includes("showIncomingCall")) {
  pass("Policy A posts CallStyle+FSI on lock path");
} else {
  fail("Policy A lock path must post CallStyle+FSI via showIncomingCall");
}

if (!notifier.includes("presentV4BackgroundActivityFirstIncoming")) {
  fail("Policy B: background must use Activity-first entry");
} else {
  pass("Policy B background Activity-first entry");
}

if (!backgroundMethod.includes("scheduleLaunchVisibilityVerify")) {
  fail("Policy B: background must schedule incoming_activity_shown verification");
} else {
  pass("Policy B launch visibility verify scheduled");
}

if (!notifier.includes("LAUNCH_VISIBILITY_VERIFY_MS = 2_500L")) {
  fail("Policy B: verify window must be 2.5s");
} else {
  pass("Policy B 2.5s verify window");
}

if (backgroundMethod.includes("showIncomingCall")) {
  fail("Policy B: background path must not post CallStyle+FSI in parallel with Activity");
} else {
  pass("Policy B no parallel CallStyle on background path");
}

if (
  backgroundMethod.includes("activityLaunched")
  && backgroundMethod.match(/if \(activityLaunched\)[\s\S]*transitionIncomingOwner/)
) {
  fail("Policy B: must not treat launch success as UI success (no owner transition on launch alone)");
} else {
  pass("Policy B launch result is not UI success");
}

if (!notifier.includes("launch_unverified_fallback") || !notifier.includes("activity_not_shown")) {
  fail("Policy B: must fallback when incoming_activity_shown missing");
} else {
  pass("Policy B fallback on activity_not_shown");
}

if (!notifier.includes("foreground_web_ssot")) {
  fail("Policy C: notifier must block native UI when foreground web SSOT");
} else {
  pass("Policy C foreground web SSOT block in notifier");
}

const activity = read("android/app/src/main/java/com/dibay/app/IncomingCallActivity.java");
if (!activity.includes("isWebInAppOwner") || !activity.includes("foreground_web_ssot")) {
  fail("Policy C: IncomingCallActivity must finish when web_in_app owner");
} else {
  pass("Policy C Activity guard for web_in_app");
}

if (!activity.includes("onIncomingActivityShown")) {
  fail("IncomingCallActivity must notify notifier on incoming_activity_shown");
} else {
  pass("incoming_activity_shown hooks notifier verify");
}

const coordinator = read("android/app/src/main/java/com/dibay/app/IncomingCallActionCoordinator.java");
if (!coordinator.includes('complete(sid, "accept")')) {
  fail("accept must complete terminal to block missed_timeout");
} else {
  pass("accept completes terminal");
}
if (!coordinator.includes("cancelMissedTimeout")) {
  fail("missed timeout must be cancellable on accept/reject");
} else {
  pass("missed timeout cancellable");
}
if (
  !coordinator.includes('purgeCallPresentation(app, sid, "missed")') &&
  !coordinator.includes('clearOwner(app, sid, "missed")')
) {
  fail("missed must clear surface owner for redial gate");
} else {
  pass("missed clears surface owner");
}

if (failed) {
  process.exit(1);
}
console.log("verify:call-v4-structure-lock PASS");

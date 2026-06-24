/**
 * Android 수신 통화 PushDelivery SSOT — 구조 회귀 탐지.
 * 규칙: .cursor/rules/incoming-call-push-delivery-contract.mdc
 *
 * 사용: npm run verify:incoming-call-push-delivery-contract
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

let failed = false;

function fail(msg) {
  console.error(`verify:incoming-call-push-delivery-contract FAIL — ${msg}`);
  failed = true;
}

function pass(msg) {
  console.log(`  OK ${msg}`);
}

const delivery = read("android/app/src/main/java/com/dibay/app/IncomingCallPushDelivery.java");
const fcm = read("android/app/src/main/java/com/dibay/app/DibayFirebaseMessagingService.java");
const debug = read("android/app/src/debug/java/com/dibay/app/DibayCallDebugCommandReceiver.java");
const notifier = read("android/app/src/main/java/com/dibay/app/IncomingCallBackgroundNotifier.java");
const main = read("android/app/src/main/java/com/dibay/app/MainActivity.java");
const ringOwnerTs = read("lib/community-messenger/incoming-call/ring-owner.ts");
const notifBuilder = read("android/app/src/main/java/com/dibay/app/IncomingCallNotificationBuilder.java");

if (!delivery.includes("IncomingCallRingOwner.start")) {
  fail("IncomingCallPushDelivery must start ring at push boundary");
} else {
  pass("PushDelivery starts IncomingCallRingOwner");
}

if (!delivery.includes("source=push_delivery")) {
  fail("PushDelivery must log source=push_delivery");
} else {
  pass("PushDelivery ring log source");
}

if (!fcm.includes("IncomingCallPushDelivery.deliver")) {
  fail("DibayFirebaseMessagingService must delegate to IncomingCallPushDelivery");
} else {
  pass("FCM delegates to PushDelivery");
}

if (!debug.includes("IncomingCallPushDelivery.deliver")) {
  fail("DibayCallDebugCommandReceiver must delegate to IncomingCallPushDelivery");
} else {
  pass("Debug receiver delegates to PushDelivery");
}

const notifierParallelRing =
  notifier.includes("IncomingCallRingOwner.start") &&
  notifier.includes("source=push_ui_parallel");
if (notifier.includes("startNativeRingOnce")) {
  fail("IncomingCallBackgroundNotifier must not start ring via legacy startNativeRingOnce");
} else if (notifier.includes("IncomingCallRingOwner.start") && !notifierParallelRing) {
  fail("IncomingCallBackgroundNotifier ring must be push_ui_parallel only (PushDelivery SSOT elsewhere)");
} else if (notifierParallelRing) {
  pass("BackgroundNotifier parallel ring via push_ui_parallel");
} else {
  pass("BackgroundNotifier has no ring start");
}

if (main.includes("IncomingCallRingOwner.start")) {
  fail("MainActivity must not start ring (PushDelivery SSOT)");
} else {
  pass("MainActivity has no IncomingCallRingOwner.start");
}

if (
  ringOwnerTs.includes("else if (useNativeRingOwner())") &&
  ringOwnerTs.match(/syncIncomingCallRing[\s\S]*?else if \(useNativeRingOwner\(\)\)/)
) {
  fail("ring-owner sync(null) must not blind-stop native in else branch");
} else {
  pass("ring-owner sync(null) no native blind-stop branch");
}

if (!ringOwnerTs.includes("must not blind-stop native ring")) {
  fail("ring-owner must document native blind-stop prohibition");
} else {
  pass("ring-owner blind-stop contract comment");
}

if (!notifBuilder.includes("dibay_calls_incoming_v7")) {
  fail("notification channel must use silent incoming channel id");
} else {
  pass("silent notification channel id");
}

if (notifBuilder.includes("setDefaults(Notification.DEFAULT_ALL)")) {
  fail("incoming notification must not use DEFAULT_ALL (double ring)");
} else {
  pass("no DEFAULT_ALL on incoming notification");
}

if (!delivery.includes("incoming_call_foreground_web_ssot")) {
  fail("PushDelivery foreground must log incoming_call_foreground_web_ssot");
} else {
  pass("PushDelivery foreground web SSOT log");
}

if (delivery.includes("IncomingCallForegroundUiLauncher.showUi")) {
  fail("PushDelivery foreground must not launch native pill (Web banner SSOT)");
} else {
  pass("PushDelivery no foreground native pill");
}

if (!notifier.includes("presentV4NonForegroundIncoming")) {
  fail("BackgroundNotifier must use V4 owner presentation helper");
} else {
  pass("BackgroundNotifier V4 owner presentation");
}

if (!notifier.includes("presentV4LockFsiOnlyIncoming")
    || !notifier.includes("presentV4BackgroundActivityFirstIncoming")) {
  fail("BackgroundNotifier must use A/B split (lock FSI-only + background Activity-first)");
} else {
  pass("BackgroundNotifier A/B policy paths");
}

if (notifier.includes("showIncomingCallActionOnly(context, payload")) {
  fail("BackgroundNotifier must not post action-only before Activity is visible");
} else {
  pass("BackgroundNotifier no premature action-only");
}

if (!notifBuilder.includes("showIncomingCallActionOnly")) {
  fail("NotificationBuilder must support action-only incoming mode");
} else {
  pass("NotificationBuilder action-only mode");
}

if (!fs.existsSync(path.join(root, "android/app/src/main/java/com/dibay/app/IncomingCallSurfaceOwner.java"))) {
  fail("IncomingCallSurfaceOwner must exist for V4 visible owner SSOT");
} else {
  pass("IncomingCallSurfaceOwner present");
}

const legacyPill = path.join(root, "android/app/src/main/java/com/dibay/app/ForegroundIncomingCallActivity.java");
if (fs.existsSync(legacyPill)) {
  fail("ForegroundIncomingCallActivity must be removed (Web IncomingCallSurface SSOT)");
} else {
  pass("legacy ForegroundIncomingCallActivity removed");
}

if (failed) {
  process.exit(1);
}

console.log("verify:incoming-call-push-delivery-contract PASS");

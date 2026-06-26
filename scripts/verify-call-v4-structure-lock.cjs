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
  pass("Policy A lock FSI entry");
}

if (lockFsiMethod.includes("launchIncomingActivity")) {
  fail("Policy A: lock path must not call launchIncomingActivity (manual startActivity forbidden)");
} else {
  pass("Policy A no manual startActivity on lock path");
}

if (lockFsiMethod.includes("showIncomingCallFsiBridge") && notifier.includes("scheduleLockFsiVisibilityWatchdog")) {
  pass("Policy A FSI bridge with visible fallback watchdog");
} else {
  fail("Policy A lock path must use showIncomingCallFsiBridge and fallback watchdog");
}

if (!lockFsiMethod.includes("lock_incoming_native_fsi_activity_only")) {
  fail("Policy A lock path must log lock_incoming_native_fsi_activity_only");
} else {
  pass("Policy A native FSI activity-only marker");
}

if (!notifier.includes("incoming_notification_fallback_visible")) {
  fail("Policy A fallback must log incoming_notification_fallback_visible");
} else {
  pass("fallback visible notification marker");
}

if (!notifier.includes("fsi_denied") || !notifier.includes("fsi_watchdog_timeout")) {
  fail("Policy A fallback must cover FSI denied and missing activity ack");
} else {
  pass("Policy A FSI denied/watchdog fallback");
}

const notificationBuilder = read("android/app/src/main/java/com/dibay/app/IncomingCallNotificationBuilder.java");
const activity = read("android/app/src/main/java/com/dibay/app/IncomingCallActivity.java");
if (!notificationBuilder.includes("showIncomingCallFsiBridge")) {
  fail("IncomingCallNotificationBuilder must expose showIncomingCallFsiBridge");
} else {
  pass("FSI bridge notification entry");
}

if (!notificationBuilder.includes("incoming_callstyle_suppressed_native_fsi")) {
  fail("IncomingCallNotificationBuilder must suppress CallStyle for native_fsi owner");
} else {
  pass("native_fsi CallStyle suppression guard");
}

if (!activity.includes("incoming_activity_shown_emit")) {
  fail("IncomingCallActivity must log incoming_activity_shown_emit");
} else {
  pass("incoming_activity_shown emit marker");
}

if (!activity.includes("incoming_activity_shown_skip_duplicate")) {
  fail("IncomingCallActivity must skip duplicate incoming_activity_shown");
} else {
  pass("incoming_activity_shown dedup marker");
}

if (!read("android/app/src/main/AndroidManifest.xml").includes("android.permission.REORDER_TASKS")) {
  fail("AndroidManifest must declare REORDER_TASKS for accept handoff");
} else {
  pass("REORDER_TASKS permission declared");
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
const sessionCleanup = read("android/app/src/main/java/com/dibay/app/IncomingCallSessionCleanup.java");
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
if (!coordinator.includes("shouldSuppressMissedTimeout")) {
  fail("missed timeout must suppress when active/connecting/consumed");
} else {
  pass("missed timeout active guard");
}
if (!sessionCleanup.includes("incoming_session_purge_blocked")) {
  fail("missed purge must be blocked when active");
} else {
  pass("missed purge active guard");
}

const connecting = read("android/app/src/main/java/com/dibay/app/IncomingCallConnectingSurface.java");
if (!activity.includes("native_connecting_surface_shown") || !activity.includes("enterV4ConnectingMode")) {
  fail("V4 accept must show native connecting surface before web handoff");
} else {
  pass("V4 native connecting surface on accept");
}
if (!connecting.includes("native_connecting_surface_handoff")) {
  fail("IncomingCallConnectingSurface must hand off to web");
} else {
  pass("V4 connecting surface web handoff");
}
if (!coordinator.includes("main_activity_calls_v4_direct_start")) {
  fail("V4 accept must log main_activity_calls_v4_direct_start");
} else {
  pass("V4 direct calls-v4 route attach");
}

const capability = read("lib/community-messenger/call-v4/presentation/call-v4-presentation-capability.ts");
if (!capability.includes("ios_dock_fallback") || !capability.includes("web_floating_dock")) {
  fail("Phase 6: presentation capability must define ios_dock_fallback and web_floating_dock");
} else {
  pass("Phase 6 cross-platform presentation capability SSOT");
}

if (
  !coordinator.includes('purgeCallPresentation(app, sid, "missed")') &&
  !coordinator.includes('clearOwner(app, sid, "missed")')
) {
  fail("missed must clear surface owner for redial gate");
} else {
  pass("missed clears surface owner");
}

const mainActivity = read("android/app/src/main/java/com/dibay/app/MainActivity.java");
const exitGuard = read("lib/community-messenger/call-v4/call-v4-exit-guard.ts");
const presentationDock = read("lib/community-messenger/call-v4/presentation/call-v4-presentation-dock.ts");
if (!mainActivity.includes("accept_route_restore_start") || !mainActivity.includes("accept_handoff_deferred")) {
  fail("V4 accept must restore call route before web handoff");
} else {
  pass("V4 accept route restore on handoff");
}
if (
  !exitGuard.includes("maybeExitCallV4ScreenAfterCleanup") ||
  !exitGuard.includes("cleanup_skipped_until_call_screen_ready")
) {
  fail("call-v4-exit-guard must defer premature exit until screen ready");
} else {
  pass("V4 exit guard SSOT");
}
if (presentationDock.includes("exitCallV4ScreenAfterCleanup(")) {
  fail("presentation dock must route exit through call-v4-exit-guard");
} else {
  pass("V4 exit guard covers presentation dock");
}

if (failed) {
  process.exit(1);
}
console.log("verify:call-v4-structure-lock PASS");

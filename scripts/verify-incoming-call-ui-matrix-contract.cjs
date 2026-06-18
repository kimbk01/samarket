/**
 * 수신 통화 UI 매트릭스 회귀 — 벨만·UI 없음 / 잠금 무화면 재발 방지.
 * 사용: npm run verify:incoming-call-ui-matrix-contract
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

let failed = false;

function fail(msg) {
  console.error(`verify-incoming-call-ui-matrix-contract: ${msg}`);
  failed = true;
}

const presenter = read("lib/community-messenger/incoming-call/foreground-incoming-presenter.ts");
const global = read("components/community-messenger/GlobalCommunityMessengerIncomingCall.tsx");
const fcm = read("android/app/src/main/java/com/dibay/app/DibayFirebaseMessagingService.java");
const main = read("android/app/src/main/java/com/dibay/app/MainActivity.java");
const launcher = read("android/app/src/main/java/com/dibay/app/IncomingCallForegroundUiLauncher.java");
const foregroundActivity = read("android/app/src/main/java/com/dibay/app/ForegroundIncomingCallActivity.java");
const lock = read("android/app/src/main/java/com/dibay/app/IncomingCallLockUiLauncher.java");
const plugin = read("android/app/src/main/java/com/dibay/app/NativeIncomingCallPlugin.java");
const push = read("lib/push/send-community-messenger-incoming-call-push.ts");

// Foreground APK: native pill SSOT (Web banner for PWA only)
if (!global.includes("preferNativeAndroidForegroundIncoming: isCapacitorNativePlatform()")) {
  fail("Global must prefer native Android foreground incoming on Capacitor APK");
}
if (!presenter.includes("native_foreground_primary")) {
  fail("presenter must defer Web banner when native foreground is primary");
}
if (!global.includes("resolveIncomingAppForeground")) {
  fail("Global must resolve Capacitor native app foreground for presenter");
}
if (!plugin.includes("isAppForegroundForIncoming")) {
  fail("NativeIncomingCallPlugin must expose isAppForegroundForIncoming");
}
if (!main.includes("IncomingCallForegroundUiLauncher.showUi")) {
  fail("MainActivity foreground path must launch native incoming pill");
}
if (main.includes('onPresented(payload.callId, "web_banner")')) {
  fail("MainActivity must not fake web_banner presented before Web renders");
}
if (!launcher.includes("source=foreground_activity")) {
  fail("IncomingCallForegroundUiLauncher must log foreground_activity render");
}
if (!foregroundActivity.includes('onPresented(callId, "foreground_activity")')) {
  fail("ForegroundIncomingCallActivity must mark session presented on create");
}
if (!fcm.includes("incoming_call_foreground_native_pill")) {
  fail("FCM foreground path must log native pill delivery");
}

// Lock: direct Activity (KakaoTalk/Telegram parity)
if (!fcm.includes("IncomingCallRingingCoordinator.startRingingWithPresentation")) {
  fail("FCM background path must defer UI to ringing FGS presentation coordinator");
}
const backgroundPresentation = read("android/app/src/main/java/com/dibay/app/IncomingCallBackgroundPresentation.java");
if (!backgroundPresentation.includes("IncomingCallLockUiLauncher.launchIfNeeded")) {
  fail("Background presentation must launch lock IncomingCallActivity when required");
}
if (!lock.includes("incoming_activity_lock_direct_launch")) {
  fail("IncomingCallLockUiLauncher must log lock direct launch");
}

// Background: CallStyle fallback guarded
const notification = read("android/app/src/main/java/com/dibay/app/IncomingCallNotificationBuilder.java");
if (!notification.includes("callstyle_build_failed")) {
  fail("CallStyle build must catch failures and fallback");
}

// Outgoing → incoming: FCM payload must carry wake fields
if (!push.includes("room_id: roomId") || !push.includes("caller_id: callerId")) {
  fail("outgoing incoming push must include roomId and callerId for callee wake");
}

if (failed) {
  process.exit(1);
}
console.log("verify-incoming-call-ui-matrix-contract: PASS");

#!/usr/bin/env node
/**
 * DIBAY Notification Permission SSOT contract — no stray OS request, incoming gate, push check-only.
 * Rule: .cursor/rules/dibay-notification-permission-ssot.mdc
 *
 * Usage: npm run verify:notification-permission-ssot-contract
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

const manifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, "scripts/notification-permission-ssot-manifest.json"), "utf8"),
);

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next" || entry.name === "dist") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

const allowedRequestAbs = new Set(
  manifest.allowedOsRequestFiles.map((f) => path.join(ROOT, f)),
);
const deprecatedShimAbs = new Set(
  (manifest.deprecatedRequestShim ?? []).map((f) => path.join(ROOT, f)),
);

const osRequestPatterns = [
  { label: "Notification.requestPermission", re: /\bNotification\.requestPermission\s*\(/ },
  { label: "PushNotifications.requestPermissions", re: /\bPushNotifications\.requestPermissions\s*\(/ },
  {
    label: "requestAndroidNativeDevicePermission(notification)",
    re: /requestAndroidNativeDevicePermission\s*\(\s*["']notification["']\s*\)/,
  },
];

for (const file of walk(ROOT)) {
  if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(file)) continue;
  const rel = path.relative(ROOT, file);
  if (rel.startsWith("scripts/verify-notification-permission-ssot-contract.mjs")) continue;
  if (rel.includes("__tests__") || rel.includes(".test.")) continue;

  const src = fs.readFileSync(file, "utf8");
  for (const { label, re } of osRequestPatterns) {
    if (!re.test(src)) continue;
    if (allowedRequestAbs.has(file)) continue;
    if (deprecatedShimAbs.has(file) && label === "requestAndroidNativeDevicePermission(notification)") continue;
    failures.push(`${rel}: stray ${label} outside PermissionManager adapters`);
  }
}

const registerPush = read("lib/push/native/register-native-push-client.ts");
if (registerPush.includes("requestNativeNotificationPermissionIfNeeded")) {
  failures.push("register-native-push-client must not call requestNativeNotificationPermissionIfNeeded");
}
if (!registerPush.includes("ensureNotificationForPushRegister")) {
  failures.push("register-native-push-client must gate via ensureNotificationForPushRegister");
}

const nativePushReg = read("components/push/NativePushRegistration.tsx");
if (!nativePushReg.includes("waitForNotificationOnboardingSettled")) {
  failures.push("NativePushRegistration must wait for notification onboarding settled");
}
if (!nativePushReg.includes("ensureNotificationForPushRegister")) {
  failures.push("NativePushRegistration must check ensureNotificationForPushRegister before register");
}

const gate = read("android/app/src/main/java/com/dibay/app/NotificationReceiveGate.java");
const notifBuilder = read("android/app/src/main/java/com/dibay/app/IncomingCallNotificationBuilder.java");
const androidAdapter = read("lib/permissions/permission-manager/adapters/android-native.adapter.ts");

// receiveReady must NOT include FSI or battery
if (!gate.includes("boolean receiveReady = blockReason == null")) {
  failures.push("NotificationReceiveGate.receiveReady must be runtime+app+channel only (blockReason == null)");
}
if (/receiveReady\s*=.*fullScreenIntent|receiveReady\s*=.*fsiAllowed|receiveReady\s*=.*battery/i.test(gate)) {
  failures.push("NotificationReceiveGate.receiveReady must not reference FSI or battery");
}
const receiveReadyAssign = androidAdapter.match(/const receiveReady\s*=[^;]+;/);
if (receiveReadyAssign && /fullScreenIntent|battery/i.test(receiveReadyAssign[0])) {
  failures.push("android-native.adapter receiveReady must not include fullScreenIntentAllowed or battery");
}

// lockScreenIncomingReady MUST include FSI (+ battery tier)
if (!gate.includes("lockScreenIncomingReady")) {
  failures.push("NotificationReceiveGate must expose lockScreenIncomingReady");
}
if (!gate.includes("!fsiAllowed") || !gate.includes("full_screen_intent_disabled")) {
  failures.push("NotificationReceiveGate.lockScreenIncomingReady must block on FSI OFF");
}
if (!gate.includes("!batteryIgnored") || !gate.includes("battery_restricted")) {
  failures.push("NotificationReceiveGate.lockScreenIncomingReady must block on battery restricted");
}
if (!androidAdapter.includes("lockScreenIncomingReady")) {
  failures.push("android-native.adapter must compute lockScreenIncomingReady");
}
if (!/lockScreenIncomingReady\s*=[\s\S]*fullScreenIntentAllowed/.test(androidAdapter)) {
  failures.push("android-native.adapter lockScreenIncomingReady must include fullScreenIntentAllowed");
}

// FSI OFF — launchActivityFallback blocked
if (!notifBuilder.includes("launchActivityFallback")) {
  failures.push("IncomingCallNotificationBuilder must define launchActivityFallback");
}
if (!/launchActivityFallback[\s\S]*lockScreenIncomingReady/.test(notifBuilder)) {
  failures.push("launchActivityFallback must gate on NotificationReceiveGate.lockScreenIncomingReady");
}
if (!notifBuilder.includes("incoming_activity_fallback_blocked")) {
  failures.push("launchActivityFallback must log incoming_activity_fallback_blocked when tier blocked");
}

const delivery = read("android/app/src/main/java/com/dibay/app/IncomingCallPushDelivery.java");
if (!delivery.includes("NotificationReceiveGate.snapshot")) {
  failures.push("IncomingCallPushDelivery must call NotificationReceiveGate.snapshot before Runtime");
}
if (!delivery.includes("incoming_blocked_notification_permission")) {
  failures.push("IncomingCallPushDelivery must log incoming_blocked_notification_permission when blocked");
}
const runtimeCallIdx = delivery.indexOf("NativeVoiceCallRuntime.handleIncoming");
const gateIdx = delivery.indexOf("NotificationReceiveGate.snapshot");
const receiveReadyReturnIdx = delivery.indexOf("if (!notifGate.receiveReady)");
if (gateIdx < 0 || runtimeCallIdx < 0 || gateIdx > runtimeCallIdx) {
  failures.push("NotificationReceiveGate must run before NativeVoiceCallRuntime.handleIncoming");
}
if (receiveReadyReturnIdx < 0 || receiveReadyReturnIdx > runtimeCallIdx) {
  failures.push("IncomingCallPushDelivery must return before Runtime when !receiveReady");
}
if (!delivery.includes("return;") || !delivery.includes("incoming_blocked_notification_permission")) {
  failures.push("IncomingCallPushDelivery must early-return with incoming_blocked_notification_permission");
}

const adbQaPath = path.join(ROOT, "scripts/qa/notification-receive-gate-adb-qa.mjs");
if (!fs.existsSync(adbQaPath)) {
  failures.push("scripts/qa/notification-receive-gate-adb-qa.mjs must exist for receiveReady=false Runtime QA");
} else {
  const adbQa = fs.readFileSync(adbQaPath, "utf8");
  if (!adbQa.includes("incoming_blocked_notification_permission")) {
    failures.push("notification-receive-gate-adb-qa must assert incoming_blocked_notification_permission");
  }
}

const plugin = read("android/app/src/main/java/com/dibay/app/NativeDevicePermissionsPlugin.java");
for (const field of ["nativeVoiceChannelBlocked", "nativeVideoChannelBlocked", "batteryOptimizationIgnored"]) {
  if (!plugin.includes(field)) {
    failures.push(`NativeDevicePermissionsPlugin.checkCallReceiveSettings must expose ${field}`);
  }
}

const mainTree = read("components/layout/MainAppProviderTree.tsx");
if (!mainTree.includes("NotificationGuideModalHost")) {
  failures.push("MainAppProviderTree must mount NotificationGuideModalHost");
}
if (!mainTree.includes("NotificationPermissionSyncHost")) {
  failures.push("MainAppProviderTree must mount NotificationPermissionSyncHost");
}

const onboardingGate = read("components/permissions/DiBaYDevicePermissionOnboardingGate.tsx");
if (!onboardingGate.includes("runNotificationGuideFlow")) {
  failures.push("DiBaYDevicePermissionOnboardingGate must use runNotificationGuideFlow");
}
if (onboardingGate.includes("requestNativeNotificationPermissionIfNeeded")) {
  failures.push("DiBaYDevicePermissionOnboardingGate must not call requestNativeNotificationPermissionIfNeeded");
}

if (failures.length > 0) {
  console.error("verify-notification-permission-ssot-contract FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log("verify-notification-permission-ssot-contract PASS");

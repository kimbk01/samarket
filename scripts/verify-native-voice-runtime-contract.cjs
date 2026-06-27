/**
 * Native Voice Runtime contract.
 * Ensures Android voice runtime stays isolated from Web V4 bootstrap.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
let failed = false;

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function fail(message) {
  console.error(`verify:native-voice-runtime-contract FAIL - ${message}`);
  failed = true;
}

function pass(message) {
  console.log(`  OK ${message}`);
}

const lane = read("android/app/src/main/assets/dibay-call-lane.json");
let laneJson = {};
try {
  laneJson = JSON.parse(lane);
} catch (error) {
  fail("dibay-call-lane.json must be valid JSON");
}
if (!Object.prototype.hasOwnProperty.call(laneJson, "nativeVoiceRuntime")) {
  fail("dibay-call-lane.json must define nativeVoiceRuntime");
} else if (laneJson.nativeVoiceRuntime !== true) {
  fail("nativeVoiceRuntime must default true for the native voice lane");
} else {
  pass("nativeVoiceRuntime defaults true");
}

const nativeVoiceDir = path.join(root, "android/app/src/main/java/com/dibay/app/nativevoice");
const nativeFiles = fs
  .readdirSync(nativeVoiceDir)
  .filter((name) => name.endsWith(".java"))
  .map((name) => path.join(nativeVoiceDir, name));

const bannedNativeImports = [
  "call-v4-agora",
  "CallV4Screen",
  "call-v4-native-accept-flight",
  "call-v4-native-connecting-handoff",
  "CallV4IntentHelper",
  "CallRuntimeV4",
  "MainActivity",
];

for (const abs of nativeFiles) {
  const rel = path.relative(root, abs);
  const source = fs.readFileSync(abs, "utf8");
  for (const banned of bannedNativeImports) {
    const importPattern = new RegExp(`^\\s*import\\s+.*${banned.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "m");
    if (importPattern.test(source)) {
      fail(`${rel} must not import ${banned}`);
    }
  }
}
if (!failed) pass("nativevoice package has no Web/V4 bootstrap imports");

const delivery = read("android/app/src/main/java/com/dibay/app/IncomingCallPushDelivery.java");
if (!delivery.includes("NativeVoiceCallLane.shouldHandleIncoming")) {
  fail("IncomingCallPushDelivery must branch to NativeVoiceCallRuntime before V4 owner/handoff");
} else if (
  delivery.indexOf("NativeVoiceCallLane.shouldHandleIncoming") > delivery.indexOf("CallV4Lane.isTelegramLaneEnabled")
) {
  fail("native voice branch must run before V4 lane owner claim");
} else {
  pass("incoming delivery prioritizes native voice runtime");
}

const fcm = read("android/app/src/main/java/com/dibay/app/DibayFirebaseMessagingService.java");
if (!fcm.includes("native_voice_pending_route_skipped")) {
  fail("DibayFirebaseMessagingService must log native voice pending-route suppression");
} else if (
  fcm.indexOf("NativeVoiceCallLane.shouldHandleIncoming") > fcm.indexOf("MainActivity.persistCallPendingRoute")
) {
  fail("native voice FCM branch must run before any Web pending-route persistence");
} else if (
  fcm
    .slice(fcm.indexOf("NativeVoiceCallLane.shouldHandleIncoming"), fcm.indexOf("String pendingRoute"))
    .includes("MainActivity.tryInjectCallWakeRoute")
) {
  fail("native voice FCM branch must not inject a Web wake route");
} else {
  pass("native voice FCM path skips Web pending-route persistence");
}

const coordinator = read("android/app/src/main/java/com/dibay/app/IncomingCallActionCoordinator.java");
if (!coordinator.includes("NativeVoiceCallOwner.isNativeOwned")) {
  fail("IncomingCallActionCoordinator must block V4 handoff for native-owned calls");
} else if (
  coordinator.indexOf("NativeVoiceCallOwner.isNativeOwned") > coordinator.indexOf("native_handoff")
) {
  fail("native-owned accept must be handled before native_handoff target=main_activity");
} else {
  pass("native-owned actions bypass V4 handoff");
}

const owner = read("android/app/src/main/java/com/dibay/app/nativevoice/NativeVoiceCallOwner.java");
if (!owner.includes("reason=already_owned_native_voice")) {
  fail("NativeVoiceCallOwner must block duplicate same-callId native owner claims");
} else if (!owner.includes("reason=terminal_call_replay")) {
  fail("NativeVoiceCallOwner must block terminal same-callId replay after release");
} else if (/prev\s*==\s*null\s*\|\|\s*"native_voice"\.equals\(prev\)/.test(owner)) {
  fail("NativeVoiceCallOwner must not treat existing native_voice owner as a successful claim");
} else {
  pass("native owner duplicate claims are blocked");
}

const callV4Screen = read("components/community-messenger/call-v4/CallV4Screen.tsx");
if (!callV4Screen.includes("isNativeVoiceRuntimeEnabled")) {
  fail("CallV4Screen must check native voice runtime before accept autostart");
} else if (!callV4Screen.includes("native_voice_web_accept_autostart_blocked")) {
  fail("CallV4Screen must log native_voice_web_accept_autostart_blocked");
} else if (
  callV4Screen.indexOf("native_voice_web_accept_autostart_blocked") >
  callV4Screen.indexOf("if (!tryStartCallV4NativeAcceptAutostart")
) {
  fail("CallV4Screen must block native voice accept before tryStartCallV4NativeAcceptAutostart");
} else {
  pass("Web V4 accept autostart is blocked for native voice runtime");
}

const nativeVoiceWebFlag = read("lib/community-messenger/native-voice/native-voice-runtime-flag.ts");
if (!nativeVoiceWebFlag.includes('resolveCapacitorShellPlatform() === "android"')) {
  fail("Web native voice guard must default on inside Android Capacitor");
} else {
  pass("Web native voice guard defaults on for Android Capacitor");
}

const qaDir = path.join(root, ".qa-logs");
const bannedQaMarkers = [
  "native_handoff target=main_activity",
  "lock_accept_hydration_cold",
  "main_activity_calls_v4_cold_legacy_start",
];

function scanQa(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanQa(abs);
      continue;
    }
    if (!/\.(log|txt|json)$/.test(entry.name)) continue;
    const text = fs.readFileSync(abs, "utf8");
    if (!text.includes("[DIBAY_NATIVE_VOICE]")) continue;
    for (const marker of bannedQaMarkers) {
      if (text.includes(marker)) {
        fail(`${path.relative(root, abs)} contains native voice banned marker ${marker}`);
      }
    }
  }
}

scanQa(qaDir);
if (!failed) pass("native voice QA logs have no banned handoff markers");

if (failed) process.exit(1);
console.log("verify:native-voice-runtime-contract PASS");

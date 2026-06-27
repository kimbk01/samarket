/**
 * DIBAY Call Native Runtime SSOT contract.
 *
 * Native Voice/Video runtime code must not depend on quarantined V4/Web call establishment.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
let failed = false;

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function fail(message) {
  console.error(`verify:native-video-runtime-contract FAIL - ${message}`);
  failed = true;
}

function pass(message) {
  console.log(`  OK ${message}`);
}

function listJavaFiles(relDir) {
  const absDir = path.join(root, relDir);
  if (!fs.existsSync(absDir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
    const abs = path.join(absDir, entry.name);
    const rel = path.relative(root, abs);
    if (entry.isDirectory()) {
      out.push(...listJavaFiles(rel));
    } else if (entry.isFile() && entry.name.endsWith(".java")) {
      out.push(rel);
    }
  }
  return out;
}

const ssotDoc = "docs/dibay-call-native-runtime-ssot.md";
const ssotRule = ".cursor/rules/dibay-call-native-runtime-ssot.mdc";

if (!exists(ssotDoc)) {
  fail(`${ssotDoc} must exist`);
} else {
  const source = read(ssotDoc);
  const required = [
    "FCM -> Native Runtime -> Accept -> Native Token -> Native Agora SDK -> Connected -> End -> Cleanup",
    "Legacy V4/Web Quarantine",
    "Native Runtime Import 금지",
  ];
  for (const marker of required) {
    if (!source.includes(marker)) fail(`${ssotDoc} missing marker: ${marker}`);
  }
  if (!failed) pass("native runtime SSOT doc is present");
}

if (!exists(ssotRule)) {
  fail(`${ssotRule} must exist`);
} else {
  const source = read(ssotRule);
  if (!source.includes("alwaysApply: true")) {
    fail(`${ssotRule} must always apply`);
  } else if (!source.includes("Legacy V4/Web Quarantine")) {
    fail(`${ssotRule} must declare Legacy V4/Web quarantine`);
  } else {
    pass("native runtime SSOT rule is always applied");
  }
}

const nativeRuntimeFiles = [
  ...listJavaFiles("android/app/src/main/java/com/dibay/app/nativevoice"),
  ...listJavaFiles("android/app/src/main/java/com/dibay/app/nativevideo"),
];

const bannedImportPatterns = [
  /import\s+com\.dibay\.app\.callv4\./,
  /import\s+.*CallV4/,
  /import\s+.*callv4/,
  /import\s+.*CallRuntimeV4/,
  /import\s+.*CallV4IntentHelper/,
];

const bannedRuntimeTokens = [
  "CallV4Provider",
  "CallV4Screen",
  "call-v4-agora",
  "call-v4-video",
  "call-v4-presenter",
  "/community-messenger/calls-v4",
  "native_lock_accept",
  "native_accept",
  "pending route replay",
  "Web accept hydration",
  "remote attach",
];

for (const rel of nativeRuntimeFiles) {
  const source = read(rel);
  for (const pattern of bannedImportPatterns) {
    if (pattern.test(source)) {
      fail(`${rel} imports quarantined V4/Web runtime (${pattern})`);
    }
  }
  for (const token of bannedRuntimeTokens) {
    if (source.includes(token)) {
      fail(`${rel} references quarantined V4/Web token: ${token}`);
    }
  }
}

if (nativeRuntimeFiles.length === 0) {
  fail("Native runtime directory scan found no Java files");
} else if (!failed) {
  pass("native runtime Java files avoid quarantined V4/Web tokens");
}

const lane = JSON.parse(read("android/app/src/main/assets/dibay-call-lane.json"));
if (lane.nativeVideoRuntime !== true) {
  fail("nativeVideoRuntime must default true for the native video lane");
} else {
  pass("nativeVideoRuntime defaults true");
}

const fcm = read("android/app/src/main/java/com/dibay/app/DibayFirebaseMessagingService.java");
if (!fcm.includes("native_video_pending_route_skipped")) {
  fail("DibayFirebaseMessagingService must log native video pending-route suppression");
} else if (
  fcm.indexOf("NativeVideoCallLane.shouldHandleIncoming") > fcm.indexOf("MainActivity.persistCallPendingRoute")
) {
  fail("native video FCM branch must run before any Web pending-route persistence");
} else {
  pass("native video FCM path skips Web pending-route persistence");
}

const delivery = read("android/app/src/main/java/com/dibay/app/IncomingCallPushDelivery.java");
if (!delivery.includes("NativeVideoCallRuntime.handleIncoming")) {
  fail("IncomingCallPushDelivery must route video to NativeVideoCallRuntime");
} else if (
  delivery.indexOf("NativeVideoCallLane.shouldHandleIncoming") > delivery.indexOf("CallV4Lane.isTelegramLaneEnabled")
) {
  fail("native video branch must run before V4 lane owner claim");
} else {
  pass("incoming delivery prioritizes native video runtime");
}

const manifest = read("android/app/src/main/AndroidManifest.xml");
for (const marker of [
  ".nativevideo.NativeVideoCallActivity",
  ".nativevideo.NativeVideoCallActionReceiver",
  ".nativevideo.NativeVideoCallService",
  'android:foregroundServiceType="phoneCall|microphone|camera"',
]) {
  if (!manifest.includes(marker)) fail(`AndroidManifest missing native video marker: ${marker}`);
}
if (!failed) pass("native video Android manifest entries are present");

const nativeVideoDir = "android/app/src/main/java/com/dibay/app/nativevideo";
if (exists(nativeVideoDir)) {
  const files = listJavaFiles(nativeVideoDir);
  const requiredFiles = [
    "NativeVideoCallRuntime.java",
    "NativeVideoCallActivity.java",
    "NativeVideoCallAgoraEngine.java",
    "NativeVideoCallNotification.java",
    "NativeVideoCallService.java",
    "NativeVideoCallActionReceiver.java",
    "NativeVideoCallLane.java",
    "NativeVideoCallOwner.java",
    "NativeVideoCallApi.java",
  ];
  for (const required of requiredFiles) {
    if (!files.some((file) => file.endsWith(required))) {
      fail(`nativevideo must define ${required}`);
    }
  }
  const agora = read("android/app/src/main/java/com/dibay/app/nativevideo/NativeVideoCallAgoraEngine.java");
  for (const marker of [
    "enableVideo()",
    "setupLocalVideo",
    "setupRemoteVideo",
    "publishCameraTrack = true",
    "autoSubscribeVideo = true",
    "remote_video_render_ready",
  ]) {
    if (!agora.includes(marker)) fail(`NativeVideoCallAgoraEngine missing marker: ${marker}`);
  }
  if (!failed) pass("native video runtime implementation is present");
} else {
  fail("nativevideo runtime directory must exist");
}

if (failed) process.exit(1);
console.log("verify:native-video-runtime-contract PASS");

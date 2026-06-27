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
  ...listJavaFiles("android/app/src/main/java/com/dibay/app/nativecall"),
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

const nativeVideoRuntime = read("android/app/src/main/java/com/dibay/app/nativevideo/NativeVideoCallRuntime.java");
if (nativeVideoRuntime.includes("NativeVideoCallService.startRinging")) {
  fail("NativeVideoCallRuntime must not start FGS during handleIncoming (Voice SSOT parity)");
} else {
  pass("native video handleIncoming skips premature FGS (Voice parity)");
}
for (const marker of [
  "shouldStartForegroundVisibleActivity",
  "startForegroundVisibleActivity",
  "foreground_visible_activity_start_postcheck_failed",
  "foreground_visible_activity_fallback_to_fsi",
  "scheduleSuppressNotificationWhenActivityShown",
  "NativeVideoCallNotification.showIncoming",
  "shouldStartBackgroundUnlockedActivity",
  "startBackgroundUnlockedActivity",
  "NativeCallVisibleSurfaceOwner.logCallOwnerClaimed",
  "closeIncomingVisualsOnConnected",
  "NativeCallVisibleSurfaceOwner.markConnected",
  "NativeCallVisibleSurfaceOwner.release",
]) {
  if (!nativeVideoRuntime.includes(marker)) {
    fail(`NativeVideoCallRuntime missing Voice-parity incoming marker: ${marker}`);
  }
}

const nativeVideoNotification = read(
  "android/app/src/main/java/com/dibay/app/nativevideo/NativeVideoCallNotification.java",
);
for (const marker of [
  "setFullScreenIntent(fullScreen, true)",
  "PendingIntent.getActivity",
  "FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE",
  "NativeVideoCallActivity.class",
]) {
  if (!nativeVideoNotification.includes(marker)) {
    fail(`NativeVideoCallNotification missing Voice-parity marker: ${marker}`);
  }
}
if (!nativeVideoNotification.includes("suppressVisualOnConnected")) {
  fail("NativeVideoCallNotification must suppress connected visual notification");
}
if (!nativeVideoNotification.includes("suppressVisualAfterActivityShown")) {
  fail("NativeVideoCallNotification must suppress visual notification once Activity is shown");
}
for (const marker of [
  "cancelVisualNotification",
  "incoming_notification_cancel_start",
  "incoming_notification_cancel_done",
  "incoming_notification_cancel_failed",
  "incoming_notification_active_state",
  "buildCancelReplacement",
  "compat.notify(id, buildCancelReplacement(app))",
  "compat.cancel(id)",
  "getActiveNotifications()",
  "scheduleVerifiedVisualSuppress",
  "delayed_verify",
]) {
  if (!nativeVideoNotification.includes(marker)) {
    fail(`NativeVideoCallNotification missing verified cancel marker: ${marker}`);
  }
}

const nativeVideoActivity = read(
  "android/app/src/main/java/com/dibay/app/nativevideo/NativeVideoCallActivity.java",
);
for (const marker of [
  "setShowWhenLocked(true)",
  "setTurnScreenOn(true)",
  "incoming_activity_shown",
  "lock_screen_visible",
  "video_activity_config_changed",
  "onConfigurationChanged",
  "NativeCallVisibleSurfaceOwner.claim(callId, \"video\", \"incoming\")",
  "NativeVideoCallRuntime.accept(this, callId)",
]) {
  if (!nativeVideoActivity.includes(marker)) {
    fail(`NativeVideoCallActivity missing Voice-parity incoming marker: ${marker}`);
  }
}
if (!failed) pass("native video incoming surface matches Voice contract markers");

const nativeCallVisibleOwner = read(
  "android/app/src/main/java/com/dibay/app/nativecall/NativeCallVisibleSurfaceOwner.java",
);
for (const marker of [
  "owner_claimed_native_call",
  "visible_surface_owner_claimed",
  "visible_surface_duplicate_blocked",
  "visible_surface_released",
  "notification_visual_suppressed",
  "incoming_surface_closed_on_connected",
  "connected_surface_shown",
  "notification_visual_suppressed_connected",
]) {
  if (!nativeCallVisibleOwner.includes(marker)) {
    fail(`NativeCallVisibleSurfaceOwner missing marker: ${marker}`);
  }
}
if (!failed) pass("common native call visible surface owner is present");

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
  const log = read("android/app/src/main/java/com/dibay/app/nativevideo/NativeVideoCallLog.java");
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
  for (const marker of [
    "agora_native_video_join_start",
    "agora_native_video_join_success",
    "local_camera_publish_success",
    "remote_video_rendered",
    "caller_native_video_join_start",
    "caller_local_camera_publish_success",
  ]) {
    if (!log.includes(marker)) fail(`NativeVideoCallLog missing QA alias marker: ${marker}`);
  }
  const runtime = read("android/app/src/main/java/com/dibay/app/nativevideo/NativeVideoCallRuntime.java");
  if (!runtime.includes("handleOutgoing")) {
    fail("NativeVideoCallRuntime must define handleOutgoing caller path");
  }
  if (!runtime.includes("joinCaller")) {
    fail("NativeVideoCallRuntime must join Agora via joinCaller for outgoing path");
  }
  const agoraJoin = read("android/app/src/main/java/com/dibay/app/nativevideo/NativeVideoCallAgoraEngine.java");
  if (!agoraJoin.includes("joinCaller")) {
    fail("NativeVideoCallAgoraEngine must define joinCaller");
  }
  if (!agoraJoin.includes("caller_agora_native_join_start")) {
    fail("NativeVideoCallAgoraEngine must log caller_agora_native_join_start");
  }
  if (!agoraJoin.includes("caller_local_camera_preview_started")) {
    fail("NativeVideoCallAgoraEngine must log caller_local_camera_preview_started");
  }
  if (!agoraJoin.includes("no_ui_preview_skipped")) {
    fail("NativeVideoCallAgoraEngine must log no_ui_preview_skipped when Activity is absent");
  }
  if (!agoraJoin.includes("peekOccupantCallId")) {
    fail("NativeVideoCallAgoraEngine must expose peekOccupantCallId for engine guard");
  } else if (!agoraJoin.includes("releaseZombieEngine")) {
    fail("NativeVideoCallAgoraEngine must expose releaseZombieEngine for stale reclaim");
  }
  if (!runtime.includes("prepareJoinGuard")) {
    fail("NativeVideoCallRuntime must run prepareJoinGuard before Agora join");
  } else if (runtime.indexOf("prepareJoinGuard") > runtime.indexOf("NativeVideoCallAgoraEngine.joinCaller")) {
    fail("prepareJoinGuard must run before joinCaller in NativeVideoCallRuntime");
  }
  if (!failed) pass("native video runtime implementation is present");
} else {
  fail("nativevideo runtime directory must exist");
}

const videoBridge = read("android/app/src/main/java/com/dibay/app/nativevideo/NativeVideoCallBridge.java");
if (!videoBridge.includes("native_connected_emit")) {
  fail("NativeVideoCallBridge must emit native_connected_emit on connected sync");
} else if (!videoBridge.includes("NativeCallServicePlugin.publishNativeConnected")) {
  fail("NativeVideoCallBridge must publish native connected payload via NativeCallServicePlugin");
} else {
  pass("native video connected bridge publishes O3 native_connected_emit");
}

const videoRuntimeO3 = read("android/app/src/main/java/com/dibay/app/nativevideo/NativeVideoCallRuntime.java");
const bridgeSyncCount = (videoRuntimeO3.match(/NativeVideoCallBridge\.syncConnected/g) || []).length;
if (bridgeSyncCount < 2) {
  fail("NativeVideoCallRuntime must call NativeVideoCallBridge.syncConnected on both connected hooks");
} else {
  pass("native video runtime connected hooks call O3 bridge");
}

const endDispatcher = read("android/app/src/main/java/com/dibay/app/nativecall/NativeCallRuntimeEndDispatcher.java");
if (!endDispatcher.includes("native_end_dispatch")) {
  fail("NativeCallRuntimeEndDispatcher must log native_end_dispatch");
}
if (!endDispatcher.includes("NativeVideoCallRuntime.onRemoteTerminal")) {
  fail("NativeCallRuntimeEndDispatcher must route video terminal events to NativeVideoCallRuntime.onRemoteTerminal");
}
for (const banned of [
  "cleanup(",
  "AgoraEngine.leave",
  "CallService.stop",
  "NativeVoiceCallService.stop",
  "NativeVideoCallService.stop",
]) {
  if (endDispatcher.includes(banned)) {
    fail(`NativeCallRuntimeEndDispatcher must be a thin router and not call ${banned}`);
  }
}
if (!nativeVideoRuntime.includes("onRemoteTerminal")) {
  fail("NativeVideoCallRuntime must own O4 terminal cleanup via onRemoteTerminal");
}
for (const marker of ["runtime_cleanup_start", "NativeVideoCallAgoraEngine.leave", "native_call_service_stop", "cleanup_done"]) {
  if (!nativeVideoRuntime.includes(marker)) {
    fail(`NativeVideoCallRuntime missing O4 cleanup chain marker: ${marker}`);
  }
}
const terminalHandler = read("android/app/src/main/java/com/dibay/app/IncomingCallTerminalHandler.java");
if (!terminalHandler.includes("NativeCallRuntimeEndDispatcher.dispatch")) {
  fail("IncomingCallTerminalHandler must dispatch terminal events to Native Runtime before legacy presentation cleanup");
}
if (!failed) pass("native video O4 end ownership contract is present");

const engineOwnership = read("android/app/src/main/java/com/dibay/app/nativecall/NativeCallEngineOwnership.java");
for (const marker of [
  "native_engine_guard_start",
  "native_engine_guard_proceed",
  "native_engine_busy",
  "native_stale_engine_detected",
  "native_stale_engine_cleanup_start",
  "native_stale_engine_cleanup_done",
  "native_join_idempotent_skip",
]) {
  if (!engineOwnership.includes(marker)) {
    fail(`NativeCallEngineOwnership missing guard marker: ${marker}`);
  }
}
if (engineOwnership.includes("DibayCallConsumedStore") || engineOwnership.includes("STATE_TERMINAL")) {
  fail("NativeCallEngineOwnership must not use consumed/tombstone stale signals in v1");
} else {
  pass("native engine ownership guard SSOT is present");
}

if (failed) process.exit(1);
console.log("verify:native-video-runtime-contract PASS");

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
  fail("IncomingCallPushDelivery must branch to NativeVoiceCallRuntime before legacy Web handoff");
} else if (delivery.includes("CallV4Lane.isTelegramLaneEnabled")) {
  fail("IncomingCallPushDelivery must not run V4 lane owner claim (P2-1 detached)");
} else {
  pass("incoming delivery prioritizes native voice runtime");
}

if (delivery.includes("MainActivity.deliverCallIncomingEvent")) {
  fail("IncomingCallPushDelivery must not deliver Web pending-route foreground SSOT (P2-1 detached)");
} else if (delivery.includes("CallV4Lane.isTelegramLaneEnabled")) {
  fail("IncomingCallPushDelivery must not run V4 owner claim (P2-1 detached)");
} else if (!delivery.includes("legacy_web_pending_route_detached")) {
  fail("IncomingCallPushDelivery must log legacy_web_pending_route_detached for non-native fall-through");
} else {
  pass("PushDelivery legacy Web pending-route path detached (P2-1)");
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

const visibleOwner = read("android/app/src/main/java/com/dibay/app/nativecall/NativeCallVisibleSurfaceOwner.java");
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
  if (!visibleOwner.includes(marker)) {
    fail(`NativeCallVisibleSurfaceOwner missing marker: ${marker}`);
  }
}

const voiceRuntime = read("android/app/src/main/java/com/dibay/app/nativevoice/NativeVoiceCallRuntime.java");
for (const marker of [
  "NativeCallVisibleSurfaceOwner.logCallOwnerClaimed",
  "foreground_visible_activity_start_postcheck_failed",
  "foreground_visible_activity_fallback_to_fsi",
  "scheduleSuppressNotificationWhenActivityShown",
  "closeIncomingVisualsOnConnected",
  "NativeCallVisibleSurfaceOwner.markConnected",
  "NativeCallVisibleSurfaceOwner.release",
]) {
  if (!voiceRuntime.includes(marker)) {
    fail(`NativeVoiceCallRuntime missing visible-surface contract marker: ${marker}`);
  }
}

const voiceActivity = read("android/app/src/main/java/com/dibay/app/nativevoice/NativeVoiceCallActivity.java");
if (!voiceActivity.includes("NativeCallVisibleSurfaceOwner.claim(callId, \"voice\", \"incoming\")")) {
  fail("NativeVoiceCallActivity must claim common visible surface before showing");
}

const voiceNotification = read("android/app/src/main/java/com/dibay/app/nativevoice/NativeVoiceCallNotification.java");
if (!voiceNotification.includes("suppressVisualOnConnected")) {
  fail("NativeVoiceCallNotification must suppress connected visual notification");
}
if (!voiceNotification.includes("suppressVisualAfterActivityShown")) {
  fail("NativeVoiceCallNotification must suppress visual notification once Activity is shown");
}
for (const marker of [
  "cancelVisualNotification",
  "incoming_notification_cancel_start",
  "incoming_notification_cancel_done",
  "incoming_notification_cancel_failed",
  "compat.cancel(id)",
  "getActiveNotifications()",
  "scheduleVerifiedVisualSuppress",
]) {
  if (!voiceNotification.includes(marker)) {
    fail(`NativeVoiceCallNotification missing verified cancel marker: ${marker}`);
  }
}
if (!failed) pass("native voice visible surface contract is present");

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

const voiceApi = read("android/app/src/main/java/com/dibay/app/nativevoice/NativeVoiceCallApi.java");
const voiceAgora = read("android/app/src/main/java/com/dibay/app/nativevoice/NativeVoiceCallAgoraEngine.java");
if (!voiceRuntime.includes("handleOutgoing")) {
  fail("NativeVoiceCallRuntime must define handleOutgoing caller path");
} else if (!voiceApi.includes("startCallerJoinAsync")) {
  fail("NativeVoiceCallApi must define startCallerJoinAsync");
} else if (!voiceRuntime.includes("caller_outgoing_start")) {
  fail("NativeVoiceCallRuntime must log caller_outgoing_start");
} else if (!voiceAgora.includes("local_audio_publish_success")) {
  fail("NativeVoiceCallAgoraEngine must log local_audio_publish_success for caller join");
} else {
  pass("native voice outgoing establishment contract is present");
}

const outgoingBridge = read("lib/call/native/native-outgoing-bridge.ts");
if (!outgoingBridge.includes("startNativeOutgoingEstablishment")) {
  fail("native-outgoing-bridge must expose startNativeOutgoingEstablishment");
} else if (!outgoingBridge.includes("isNativeEstablishmentOwned")) {
  fail("native-outgoing-bridge must expose isNativeEstablishmentOwned");
} else {
  pass("Web native outgoing bridge is present");
}

const callPlugin = read("android/app/src/main/java/com/dibay/app/call/NativeCallServicePlugin.java");
if (!callPlugin.includes("startNativeOutgoingEstablishment")) {
  fail("NativeCallServicePlugin must expose startNativeOutgoingEstablishment");
} else if (!callPlugin.includes("isNativeEstablishmentOwned")) {
  fail("NativeCallServicePlugin must expose isNativeEstablishmentOwned");
} else {
  pass("Android outgoing establishment plugin methods are present");
}

const callV4Actions = read("lib/community-messenger/call-v4/call-v4-actions.ts");
if (!callV4Actions.includes("native_outgoing_handoff_start")) {
  fail("callV4CreateOutgoing must log native_outgoing_handoff_start");
} else if (!callV4Actions.includes("native_outgoing_handoff_done")) {
  fail("callV4CreateOutgoing must log native_outgoing_handoff_done on native handoff");
} else {
  pass("Web outgoing native handoff hook is present");
}

if (!callV4Actions.includes("native_outgoing_failed")) {
  fail("callV4CreateOutgoing must log native_outgoing_failed on Android native handoff failure (P2-2)");
} else if (!callV4Actions.includes("native_establishment_unavailable")) {
  fail("callV4CreateOutgoing must log native_establishment_unavailable when establishment unavailable (P2-2)");
} else if (!callV4Actions.includes("isAndroidNativeOutgoingShell")) {
  fail("callV4CreateOutgoing must gate JS Agora fallback with isAndroidNativeOutgoingShell (P2-2)");
} else {
  pass("Android native outgoing fail-fast markers present (P2-2)");
}

const androidOutgoingFailBlock =
  callV4Actions.match(/if \(isAndroidNativeOutgoingShell\(\)\) \{[\s\S]*?\n    \}/)?.[0] ?? "";
if (!androidOutgoingFailBlock.includes("native_outgoing_failed")) {
  fail("Android native outgoing fail-fast block must log native_outgoing_failed (P2-2)");
} else if (androidOutgoingFailBlock.includes("routeToCallV4Screen")) {
  fail("Android native outgoing fail-fast block must not call routeToCallV4Screen (P2-2)");
} else if (androidOutgoingFailBlock.includes("outgoing_ringing")) {
  fail("Android native outgoing fail-fast block must not set outgoing_ringing (P2-2)");
} else if (androidOutgoingFailBlock.includes("callV4PatchCancel")) {
  fail("Android native outgoing fail-fast must not PATCH cancel (P2-2 hold)");
} else {
  pass("Android native outgoing fail-fast has no JS Agora Web fallback (P2-2)");
}

const callV4Agora = read("lib/community-messenger/call-v4/call-v4-agora.ts");
if (!callV4Agora.includes("web_agora_establishment_quarantined")) {
  fail("joinCallV4Agora must quarantine JS Agora when native establishment owns call");
} else {
  pass("JS Agora establishment quarantine guard is present");
}

if (!callV4Agora.includes("legacy_web_establishment_removed")) {
  fail("joinCallV4Agora must remove Legacy Web establishment on Android Capacitor");
} else {
  pass("Legacy Web JS Agora establishment removed guard is present");
}

const legacyRemoved = read("lib/call/native/legacy-web-call-establishment-removed.ts");
if (!legacyRemoved.includes("isLegacyWebCallEstablishmentRemoved")) {
  fail("legacy-web-call-establishment-removed SSOT must export isLegacyWebCallEstablishmentRemoved");
} else {
  pass("Legacy Web establishment removed SSOT is present");
}

const callV4Route = read("lib/community-messenger/call-v4/call-v4-route.ts");
if (!callV4Route.includes("legacy_web_establishment_removed")) {
  fail("routeToCallV4Screen must remove Legacy Web establishment on Android Capacitor");
} else {
  pass("Legacy Web route establishment removed guard is present");
}

const mainActivityLegacyWeb = read("android/app/src/main/java/com/dibay/app/MainActivity.java");
if (!mainActivityLegacyWeb.includes("legacy_web_replay_removed")) {
  fail("MainActivity must remove Legacy Web pending replay routes");
} else {
  pass("MainActivity Legacy Web replay removal is present");
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

const voiceBridge = read("android/app/src/main/java/com/dibay/app/nativevoice/NativeVoiceCallBridge.java");
if (!voiceBridge.includes("native_connected_emit")) {
  fail("NativeVoiceCallBridge must emit native_connected_emit on connected sync");
} else if (!voiceBridge.includes("NativeCallServicePlugin.publishNativeConnected")) {
  fail("NativeVoiceCallBridge must publish native connected payload via NativeCallServicePlugin");
} else if (voiceBridge.includes("mode=deferred")) {
  fail("NativeVoiceCallBridge must not keep deferred web_sync_connected stub");
} else {
  pass("native voice connected bridge publishes O3 native_connected_emit");
}

const endDispatcher = read("android/app/src/main/java/com/dibay/app/nativecall/NativeCallRuntimeEndDispatcher.java");
if (!endDispatcher.includes("native_end_dispatch")) {
  fail("NativeCallRuntimeEndDispatcher must log native_end_dispatch");
}
if (!endDispatcher.includes("NativeVoiceCallRuntime.onRemoteTerminal")) {
  fail("NativeCallRuntimeEndDispatcher must route voice terminal events to NativeVoiceCallRuntime.onRemoteTerminal");
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
if (!voiceRuntime.includes("onRemoteTerminal")) {
  fail("NativeVoiceCallRuntime must own O4 terminal cleanup via onRemoteTerminal");
}
for (const marker of ["runtime_cleanup_start", "NativeVoiceCallAgoraEngine.leave", "native_call_service_stop", "cleanup_done"]) {
  if (!voiceRuntime.includes(marker)) {
    fail(`NativeVoiceCallRuntime missing O4 cleanup chain marker: ${marker}`);
  }
}
const terminalHandler = read("android/app/src/main/java/com/dibay/app/IncomingCallTerminalHandler.java");
if (!terminalHandler.includes("NativeCallRuntimeEndDispatcher.dispatch")) {
  fail("IncomingCallTerminalHandler must dispatch terminal events to Native Runtime before legacy presentation cleanup");
}
if (!failed) pass("native voice O4 end ownership contract is present");

const engineOwnership = read("android/app/src/main/java/com/dibay/app/nativecall/NativeCallEngineOwnership.java");
for (const marker of [
  "native_engine_guard_start",
  "native_engine_guard_proceed",
  "native_engine_busy",
  "native_stale_engine_detected",
  "native_stale_engine_cleanup_start",
  "native_stale_engine_cleanup_done",
  "native_join_idempotent_skip",
  "releaseZombieEngine",
  "findStaleSessionCallId",
  "findOtherLiveSessionCallId",
]) {
  if (!engineOwnership.includes(marker)) {
    fail(`NativeCallEngineOwnership missing guard marker: ${marker}`);
  }
}
if (engineOwnership.includes("DibayCallConsumedStore") || engineOwnership.includes("STATE_TERMINAL")) {
  fail("NativeCallEngineOwnership must not use consumed/tombstone stale signals in v1");
}
if (!voiceAgora.includes("peekOccupantCallId")) {
  fail("NativeVoiceCallAgoraEngine must expose peekOccupantCallId for engine guard");
} else if (!voiceAgora.includes("releaseZombieEngine")) {
  fail("NativeVoiceCallAgoraEngine must expose releaseZombieEngine for stale reclaim");
} else {
  pass("native voice Agora engine guard helpers are present");
}
if (!voiceRuntime.includes("prepareJoinGuard")) {
  fail("NativeVoiceCallRuntime must run prepareJoinGuard before Agora join");
} else if (
  voiceRuntime.indexOf("prepareJoinGuard") > voiceRuntime.indexOf("NativeVoiceCallAgoraEngine.joinCaller")
) {
  fail("prepareJoinGuard must run before joinCaller in NativeVoiceCallRuntime");
} else {
  pass("native voice join runs engine ownership guard before RtcEngine.create");
}

const mainActivity = read("android/app/src/main/java/com/dibay/app/MainActivity.java");
if (!mainActivity.includes("native_owned_pending_replay_suppressed")) {
  fail("MainActivity must log native_owned_pending_replay_suppressed for native-owned Web replay (P2-4)");
} else if (!mainActivity.includes("NativeVoiceCallOwner.isNativeOwned")) {
  fail("MainActivity must read NativeVoiceCallOwner.isNativeOwned for P2-4 replay gate");
} else if (!mainActivity.includes("NativeVideoCallOwner.isNativeOwned")) {
  fail("MainActivity must read NativeVideoCallOwner.isNativeOwned for P2-4 replay gate");
} else if (!mainActivity.includes("shouldSuppressNativeOwnedCallRouteReplay")) {
  fail("MainActivity must centralize native-owned pending replay suppression (P2-4)");
} else if (
  mainActivity.indexOf("suppressNativeOwnedCallRouteReplayIfNeeded") >
  mainActivity.indexOf("pending_route_consumed")
) {
  fail("MainActivity must gate injectWebViewRouteViaJs before pending_route_consumed (P2-4)");
} else {
  pass("MainActivity native-owned pending Web replay suppression is present (P2-4)");
}

if (failed) process.exit(1);
console.log("verify:native-voice-runtime-contract PASS");

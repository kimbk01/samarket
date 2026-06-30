#!/usr/bin/env node

const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function fail(message) {
  console.error(`[native-admin-call-ringtone-contract] FAIL: ${message}`);
  process.exitCode = 1;
}

function pass(message) {
  console.log(`[native-admin-call-ringtone-contract] PASS: ${message}`);
}

function assertContains(relativePath, needle, message) {
  const text = read(relativePath);
  if (!text.includes(needle)) {
    fail(`${message} (${relativePath})`);
    return;
  }
  pass(message);
}

function changedFiles() {
  const out = execSync("git diff --name-only", { cwd: root, encoding: "utf8" });
  return out
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

const changed = new Set(changedFiles());

const forbiddenExact = [
  "android/app/src/main/java/com/dibay/app/nativevoice/NativeVoiceCallRuntime.java",
  "android/app/src/main/java/com/dibay/app/nativevideo/NativeVideoCallRuntime.java",
  "android/app/src/main/java/com/dibay/app/IncomingCallActivity.java",
];

for (const file of forbiddenExact) {
  if (changed.has(file)) {
    fail(`forbidden native state/activity file changed: ${file}`);
  } else {
    pass(`no diff in ${file}`);
  }
}

for (const file of changed) {
  if (
    /IncomingCallWakeLock|WakeLock|Agora|FullScreenIntent|Fsi|FSI|Accept|Reject|Cleanup/.test(file)
  ) {
    fail(`forbidden FSI/WakeLock/Agora/accept/reject/cleanup related diff: ${file}`);
  }
}

assertContains(
  "android/app/src/main/java/com/dibay/app/nativevoice/NativeVoiceCallRuntime.java",
  "IncomingCallRingOwner.start(app, sid);",
  "NativeVoiceCallRuntime keeps existing RingOwner.start(app, sid) call"
);
assertContains(
  "android/app/src/main/java/com/dibay/app/nativevideo/NativeVideoCallRuntime.java",
  "IncomingCallRingOwner.start(app, sid);",
  "NativeVideoCallRuntime keeps existing RingOwner.start(app, sid) call"
);
assertContains(
  "android/app/src/main/java/com/dibay/app/DibayForegroundRingtone.java",
  "RingtoneManager.TYPE_RINGTONE",
  "OS default ringtone fallback remains"
);
assertContains(
  "android/app/src/main/java/com/dibay/app/DibayForegroundRingtone.java",
  "MediaPlayer",
  "admin ringtone uses MediaPlayer"
);
assertContains(
  "android/app/src/main/java/com/dibay/app/DibayForegroundRingtone.java",
  "activePlayer.release()",
  "MediaPlayer release exists"
);
assertContains(
  "android/app/src/main/java/com/dibay/app/DibayForegroundRingtone.java",
  "unsupported_uri_scheme",
  "invalid ringtoneUrl fallback guard exists"
);
assertContains(
  "android/app/src/main/java/com/dibay/app/DibayForegroundRingtone.java",
  "setOnErrorListener",
  "MediaPlayer error fallback exists"
);
assertContains(
  "android/app/src/main/java/com/dibay/app/DibayForegroundRingtone.java",
  "native_call_ringtone_admin_play_failed_fallback",
  "admin play failed fallback log exists"
);
assertContains(
  "android/app/src/main/java/com/dibay/app/IncomingCallRingtoneSsotCache.java",
  "native_call_ringtone_ssot_cache_put",
  "SSOT cache put log exists"
);
assertContains(
  "android/app/src/main/java/com/dibay/app/IncomingCallRingOwner.java",
  "IncomingCallRingtoneSsotCache.ringtoneUrlForCallId",
  "RingOwner resolves ringtoneUrl from cache"
);
assertContains(
  "lib/push/dispatch/fcm-data-payload-contract.ts",
  "fields.ringtoneUrl",
  "FCM data includes ringtoneUrl"
);
assertContains(
  "lib/push/dispatch/__tests__/push-sound-ssot-enrichment.test.ts",
  "call_incoming_voice",
  "call_incoming_voice eventKey test coverage exists"
);
assertContains(
  "lib/push/dispatch/__tests__/push-sound-ssot-enrichment.test.ts",
  "call_incoming_video",
  "call_incoming_video eventKey test coverage exists"
);

if (process.exitCode) {
  process.exit(process.exitCode);
}

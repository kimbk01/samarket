#!/usr/bin/env node
/**
 * DIBAY Call+Messenger Production Restore HARD LOCK — structural + unit gates.
 * @see docs/dibay-call-messenger-restore-hard-lock.md
 *
 * Usage: npm run verify:call-messenger-restore-hard-lock
 * Rule files alone are NOT PASS — this script must exit 0.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let failed = 0;

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

function assert(cond, msg) {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    failed += 1;
  } else {
    console.log(`OK: ${msg}`);
  }
}

function assertIncludes(rel, needle, msg) {
  assert(exists(rel) && read(rel).includes(needle), msg || `${rel} must include ${needle}`);
}

console.log("=== R docs / exclusions ===");
assert(exists("docs/dibay-call-messenger-restore-hard-lock.md"), "restore hard-lock doc present");
const doc = read("docs/dibay-call-messenger-restore-hard-lock.md");
assert(doc.includes("NOT_PROVEN"), "doc marks iPhone CallKit room UI NOT_PROVEN");
assert(doc.includes("DEVICE_ISSUE_DEFERRED"), "doc marks Samsung PiP DEVICE_ISSUE_DEFERRED");
assert(doc.includes("call_stub viewer direction"), "doc locks R1 direction");
assert(doc.includes("messageForBump"), "doc locks R2 messageForBump");

console.log("\n=== R1 call_stub viewer direction ===");
assertIncludes(
  "lib/community-messenger/call-stub-viewer-direction.ts",
  "resolveCallStubViewerIsCaller",
  "R1 helper resolveCallStubViewerIsCaller"
);
assertIncludes(
  "lib/community-messenger/call-stub-viewer-direction.ts",
  "initiatorUserId",
  "R1 uses initiatorUserId"
);
assertIncludes(
  "components/community-messenger/room/phase2/MessengerTimelineVirtualRow.tsx",
  "withCallStubViewerDirection",
  "R1 timeline wire withCallStubViewerDirection"
);

console.log("\n=== R2 messageForBump + empty text ghost ===");
const service = read("lib/community-messenger/service.ts");
assert(
  service.includes("messageForBump: buildCallStubMessageForBump") ||
    (service.includes("buildCallStubMessageForBump") && service.includes("messageForBump")),
  "R2 appendCommunityMessengerCallStubMessage publishes messageForBump"
);
assertIncludes(
  "lib/community-messenger/room/empty-text-timeline-ghost.ts",
  "isEmptyTextTimelineGhost",
  "R2 empty-text helper"
);
assertIncludes(
  "lib/community-messenger/room/use-messenger-room-derived-message-lists.ts",
  "isEmptyTextTimelineGhost",
  "R2 derived list filters empty text ghosts"
);
assertIncludes(
  "lib/community-messenger/stores/messenger-realtime-store.ts",
  "불완전 RT",
  "R2 realtime store rejects incomplete empty text promotion"
);

console.log("\n=== R3 Android mute / camera / AudioFocus ===");
assertIncludes(
  "android/app/src/main/res/layout/activity_native_voice_call.xml",
  "native_voice_call_mute",
  "R3 voice mute control id"
);
assertIncludes(
  "android/app/src/main/java/com/dibay/app/nativevoice/NativeVoiceCallAgoraEngine.java",
  "muteLocalAudioStream",
  "R3 voice muteLocalAudioStream"
);
assertIncludes(
  "android/app/src/main/res/layout/activity_native_video_call.xml",
  "native_video_call_camera",
  "R3 video camera control id"
);
assertIncludes(
  "android/app/src/main/java/com/dibay/app/nativevideo/NativeVideoCallAgoraEngine.java",
  "setCameraEnabled",
  "R3 setCameraEnabled"
);
assertIncludes(
  "android/app/src/main/java/com/dibay/app/nativevoice/NativeVoiceCallService.java",
  "requestAudioFocus",
  "R3 voice AudioFocus"
);
assertIncludes(
  "android/app/src/main/java/com/dibay/app/nativevideo/NativeVideoCallService.java",
  "requestAudioFocus",
  "R3 video AudioFocus"
);
// Do not require Samsung PiP PASS claims in this lock
assert(!doc.includes("Samsung PiP") || doc.includes("DEVICE_ISSUE_DEFERRED"), "R3 does not claim Samsung PiP PASS");

console.log("\n=== R4 private_group domain boundary ===");
assert(
  exists("docs/dibay-messenger-domain-group-hard-lock.md") ||
    exists(".cursor/rules/dibay-messenger-domain-group-hard-lock.mdc"),
  "R4 domain/group hard-lock doc/rule present"
);
assertIncludes(
  "lib/community-messenger/group/group-active-membership-gate.ts",
  "ACTIVE",
  "R4 group active membership gate present"
);

console.log("\n=== R5 bg→resume catch-up owners ===");
assertIncludes(
  "lib/community-messenger/room/use-messenger-room-remote-catchup.ts",
  "catchup",
  "R5 remote catch-up hook present"
);
assert(
  read("lib/community-messenger/home/use-community-messenger-home-bootstrap.ts").includes("catch-up") ||
    read("lib/community-messenger/home/use-community-messenger-home-bootstrap.ts").includes("catchup") ||
    read("lib/community-messenger/home/use-community-messenger-home-realtime-bootstrap-list.ts").includes(
      "CATCHUP"
    ),
  "R5 home/room catch-up path retained"
);

console.log("\n=== R6 account switch / logout path ===");
assert(
  exists("app/api/auth/logout/route.ts") || exists("app/api/auth/logout/route.js"),
  "R6 /api/auth/logout route present"
);

console.log("\n=== Unit contracts (vitest) ===");
const unit = spawnSync(
  "npx",
  [
    "vitest",
    "run",
    "lib/community-messenger/__tests__/call-stub-viewer-direction.test.ts",
    "lib/community-messenger/room/__tests__/empty-text-timeline-ghost.test.ts",
    "lib/community-messenger/call-authority/__tests__/call-stub-room-bump-parity.test.ts",
  ],
  { cwd: ROOT, encoding: "utf8", env: process.env }
);
process.stdout.write(unit.stdout || "");
process.stderr.write(unit.stderr || "");
if (unit.status !== 0) {
  console.error("FAIL: restore hard-lock unit contracts");
  failed += 1;
} else {
  console.log("OK: restore hard-lock unit contracts");
}

if (failed) {
  console.error(`\nFAIL: verify:call-messenger-restore-hard-lock (${failed} failure(s))`);
  process.exit(1);
}
console.log("\nPASS: verify:call-messenger-restore-hard-lock");
process.exit(0);

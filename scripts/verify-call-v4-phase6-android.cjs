#!/usr/bin/env node
/** Phase 6B Android gate — run before Android implementation commit (after APK QA). */
const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
let failed = false;

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function pass(msg) {
  console.log(`  OK ${msg}`);
}

function fail(msg) {
  failed = true;
  console.error(`  FAIL ${msg}`);
}

const mainActivity = read("android/app/src/main/java/com/dibay/app/MainActivity.java");
if (!mainActivity.includes("isVoice") || !mainActivity.includes("new Rational(16, 9)")) {
  fail("MainActivity must allow voice connected OS PiP call card");
} else {
  pass("MainActivity voice OS PiP card");
}

const agoraMedia = read("lib/community-messenger/call-v4/call-v4-agora-media.ts");
if (!agoraMedia.includes("publishCallV4LocalVideo")) {
  fail("call-v4-agora-media must publish local video on connected");
} else {
  pass("call-v4-agora-media video publish");
}

const screen = read("components/community-messenger/call-v4/CallV4Screen.tsx");
if (!screen.includes("ConnectedVideoView") || !screen.includes("useCallV4VideoPresenter")) {
  fail("CallV4Screen must wire video presenter + ConnectedVideoView");
} else {
  pass("CallV4Screen video surface");
}

if (failed) {
  process.exit(1);
}
console.log("verify:call-v4-phase6-android PASS");

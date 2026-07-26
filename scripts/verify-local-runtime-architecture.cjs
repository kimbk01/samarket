#!/usr/bin/env node
/**
 * Option A Local Runtime — static architecture gate.
 * @see docs/dibay-local-runtime-startup-rearchitecture.md
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
let failed = 0;

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function fail(msg) {
  console.error(`[verify:local-runtime] FAIL: ${msg}`);
  failed += 1;
}

function ok(msg) {
  console.log(`[verify:local-runtime] OK: ${msg}`);
}

const state = read("lib/startup/local-runtime-state.ts");
for (const s of [
  "NATIVE_LAUNCH",
  "LOCAL_RUNTIME_LOADING",
  "LOCAL_RUNTIME_PAINTED",
  "INTRO_VISIBLE",
  "LOCAL_SHELL_READY",
  "SESSION_RESTORING",
  "APP_READY",
  "INTRO_REMOVED",
  "REMOTE_DATA_SYNC",
]) {
  if (!state.includes(s)) fail(`state machine missing ${s}`);
}
if (!state.includes("REMOTE_DOCUMENT_LOADING")) fail("must list forbidden REMOTE_DOCUMENT_LOADING");
ok("state machine SSOT");

const flag = read("lib/startup/local-runtime-flag.ts");
if (!flag.includes("legacyRemoteRuntime") || !flag.includes("localRuntime")) {
  fail("runtime flag must expose local XOR legacy");
}
ok("runtime mode flag");

const markup = read("lib/startup/local-runtime-markup.ts");
if (markup.includes("beginHandoffCover")) fail("local-runtime-markup must not use Cover handoff");
if (markup.includes("__dibay-startup")) fail("local-runtime-markup must not use Hybrid boot path");
if (!markup.includes("__DIBAY_LOCAL_RUNTIME__")) fail("local-runtime-markup must set local flag");
ok("local-runtime-markup contract");

const main = read("android/app/src/main/java/com/dibay/app/MainActivity.java");
if (!main.includes("isBundledLocalRuntimeMode")) {
  fail("MainActivity must skip Hybrid boot when Local Runtime mode");
}
ok("Android Local Runtime gate");

const cap = read("capacitor.config.ts");
if (!cap.includes("DIBAY_LOCAL_RUNTIME") || !cap.includes("useLocalRuntime")) {
  fail("capacitor.config must support Local Runtime without server.url document boot");
}
ok("capacitor.config Local Runtime branch");

const entry = path.join(ROOT, "capacitor-www/local-runtime/index.html");
const mode = path.join(ROOT, "android/app/src/main/assets/dibay-runtime-mode.json");
const bundle = path.join(ROOT, "capacitor-www/local-runtime/assets/local-runtime-app.js");
if (!fs.existsSync(entry)) {
  fail("missing capacitor-www/local-runtime/index.html — run npm run build:local-runtime");
} else {
  const html = fs.readFileSync(entry, "utf8");
  if (html.includes("beginHandoffCover")) fail("built local-runtime HTML contains Cover handoff");
  if (!html.includes("data-local-runtime")) fail("built local-runtime HTML missing root marker");
  if (!html.includes("local-runtime-app.js")) fail("built local-runtime HTML missing React bundle");
  ok("built local-runtime HTML");
}
if (!fs.existsSync(bundle)) {
  fail("missing local-runtime-app.js React bundle — run npm run build:local-runtime");
} else {
  ok("local-runtime React bundle present");
}
if (!fs.existsSync(mode)) {
  fail("missing android assets dibay-runtime-mode.json — run npm run build:local-runtime");
} else {
  const modeJson = JSON.parse(fs.readFileSync(mode, "utf8"));
  if (modeJson.localRuntime !== true || modeJson.legacyRemoteRuntime !== false) {
    fail("cutover requires dibay-runtime-mode.json localRuntime=true legacyRemoteRuntime=false");
  }
  ok("runtime mode asset cutover (local default)");
}

const indexWww = path.join(ROOT, "capacitor-www/index.html");
if (!fs.existsSync(indexWww) || !fs.readFileSync(indexWww, "utf8").includes("__DIBAY_LOCAL_RUNTIME__")) {
  fail("capacitor-www/index.html must be Local Runtime after cutover");
} else {
  ok("capacitor-www/index.html is Local Runtime");
}

if (failed > 0) {
  console.error(`[verify:local-runtime] FAILED (${failed})`);
  process.exit(1);
}
console.log("[verify:local-runtime] PASS");

/**
 * Call V4 structure lock — prevent legacy lane leaks into production V4 path.
 * Usage: npm run verify:call-v4-structure-lock
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

let failed = false;

function fail(msg) {
  console.error(`verify:call-v4-structure-lock FAIL — ${msg}`);
  failed = true;
}

function pass(msg) {
  console.log(`  OK ${msg}`);
}

const sheet = read("components/community-messenger/call-v4/CallV4IncomingSheet.tsx");
const surface = read("lib/community-messenger/call-v4/call-v4-incoming-surface.ts");
const delivery = read("android/app/src/main/java/com/dibay/app/IncomingCallPushDelivery.java");
const telegram = read("lib/community-messenger/call-v4/call-v4-telegram-incoming-surface.ts");

if (sheet.includes("buildIncomingCallPreviewHref")) {
  fail("CallV4IncomingSheet must not link V3 preview route");
} else {
  pass("V4 sheet expand is V4-only");
}

if (surface.includes("resolveSuppressReasonLegacy")) {
  fail("resolveSuppressReasonLegacy dead suppress must be removed");
} else {
  pass("no resolveSuppressReasonLegacy");
}

const sheetGate = surface.match(/export function canRenderWebIncomingSheet[\s\S]*?^}/m)?.[0] ?? "";
if (sheetGate.includes("document.visibilityState") || sheetGate.includes("visibilityState")) {
  fail("canRenderWebIncomingSheet must not use document.visibilityState");
} else {
  pass("sheet gate owner-only");
}

if (delivery.includes("ForegroundIncomingCallActivity") || delivery.includes("IncomingCallForegroundUiLauncher")) {
  fail("PushDelivery must not reference legacy foreground pill");
} else {
  pass("PushDelivery has no foreground pill");
}

if (!telegram.includes("unknown_pending")) {
  fail("telegram incoming surface contract must document unknown_pending owner");
} else {
  pass("unknown_pending in contract");
}

if (failed) {
  process.exit(1);
}
console.log("verify:call-v4-structure-lock PASS");

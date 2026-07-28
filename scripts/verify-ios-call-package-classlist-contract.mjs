#!/usr/bin/env node
/**
 * HARD LOCK gate: iOS App-target packageClassList for native outgoing.
 * @see docs/dibay-call-ios-outgoing-package-classlist-hard-lock.md
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { IOS_APP_TARGET_PACKAGE_CLASSES } from "./patch-ios-capacitor-package-class-list.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

const configPath = "ios/App/App/capacitor.config.json";
let classList = [];
try {
  const parsed = JSON.parse(read(configPath));
  classList = Array.isArray(parsed.packageClassList) ? parsed.packageClassList : [];
} catch (err) {
  failures.push(`${configPath} must be valid JSON (${err instanceof Error ? err.message : String(err)})`);
}

for (const cls of IOS_APP_TARGET_PACKAGE_CLASSES) {
  if (!classList.includes(cls)) {
    failures.push(
      `${configPath} packageClassList missing ${cls} (run node scripts/patch-ios-capacitor-package-class-list.mjs)`,
    );
  }
}

const pkg = JSON.parse(read("package.json"));
const capSyncIos = String(pkg.scripts?.["cap:sync:ios"] ?? "");
if (!capSyncIos.includes("cap sync ios")) {
  failures.push('package.json scripts["cap:sync:ios"] must run "cap sync ios"');
}
if (!capSyncIos.includes("patch-ios-capacitor-package-class-list")) {
  failures.push(
    'package.json scripts["cap:sync:ios"] must run patch-ios-capacitor-package-class-list after sync',
  );
}

const syncVercel = read("scripts/sync-capacitor-vercel.mjs");
if (!syncVercel.includes("patchIosCapacitorPackageClassList")) {
  failures.push("scripts/sync-capacitor-vercel.mjs must call patchIosCapacitorPackageClassList for iOS");
}

const lockDoc = "docs/dibay-call-ios-outgoing-package-classlist-hard-lock.md";
if (!fs.existsSync(path.join(ROOT, lockDoc))) {
  failures.push(`missing lock doc ${lockDoc}`);
} else {
  const doc = read(lockDoc);
  if (!doc.includes("HARD LOCK") || !doc.includes("NativeCallServicePlugin")) {
    failures.push(`${lockDoc} must declare HARD LOCK and NativeCallServicePlugin`);
  }
}

const rulePath = ".cursor/rules/dibay-call-ios-outgoing-package-classlist-hard-lock.mdc";
if (!fs.existsSync(path.join(ROOT, rulePath))) {
  failures.push(`missing cursor rule ${rulePath}`);
}

if (failures.length > 0) {
  console.error("verify:ios-call-package-classlist-contract FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log("verify:ios-call-package-classlist-contract PASS");
console.log(`  packageClassList (${classList.length}): ${classList.join(", ")}`);

#!/usr/bin/env node
/**
 * HARD LOCK gate: iOS Call outgoing plugin registration subset only.
 * Does not own Auth/Delivery plugin registration.
 *
 * App-target plugins are registered natively (DibayRootBridgeViewController.makeAppTargetPlugins)
 * and must not appear in the CLI-generated packageClassList. Single list: scripts/ios-app-target-plugins.mjs
 * @see docs/dibay-call-ios-outgoing-package-classlist-hard-lock.md
 * @see docs/ios-capacitor-app-target-package-classlist.md
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  IOS_CALL_OUTGOING_PLUGIN_CLASSES,
  checkIosAppTargetPluginRegistration,
} from "./ios-app-target-plugins.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

const { failures: registrationFailures, classList } = checkIosAppTargetPluginRegistration(
  IOS_CALL_OUTGOING_PLUGIN_CLASSES,
);
failures.push(...registrationFailures);

const pkg = JSON.parse(read("package.json"));
const capSyncIos = String(pkg.scripts?.["cap:sync:ios"] ?? "");
if (!capSyncIos.includes("cap sync ios")) {
  failures.push('package.json scripts["cap:sync:ios"] must run "cap sync ios"');
}
if (/patch-ios-capacitor-package-class-list/.test(JSON.stringify(pkg.scripts ?? {}))) {
  failures.push("package.json must not rewrite packageClassList after cap sync (App-target plugins register natively)");
}

const syncVercel = read("scripts/sync-capacitor-vercel.mjs");
if (!syncVercel.includes("checkIosAppTargetPluginRegistration")) {
  failures.push("scripts/sync-capacitor-vercel.mjs must verify iOS App-target plugin registration");
}

const lockDoc = "docs/dibay-call-ios-outgoing-package-classlist-hard-lock.md";
if (!fs.existsSync(path.join(ROOT, lockDoc))) {
  failures.push(`missing lock doc ${lockDoc}`);
} else {
  const doc = read(lockDoc);
  if (!doc.includes("HARD LOCK") || !doc.includes("NativeCallServicePlugin")) {
    failures.push(`${lockDoc} must declare HARD LOCK and NativeCallServicePlugin`);
  }
  if (/^- `NativeOAuthLauncherPlugin`/m.test(doc)) {
    failures.push(
      `${lockDoc} must remain Call-outgoing only — NativeOAuthLauncher belongs in auth-ios-native-oauth-launcher-contract`,
    );
  }
}

const rulePath = ".cursor/rules/dibay-call-ios-outgoing-package-classlist-hard-lock.mdc";
if (!fs.existsSync(path.join(ROOT, rulePath))) {
  failures.push(`missing cursor rule ${rulePath}`);
} else {
  const rule = read(rulePath);
  if (/^- `NativeOAuthLauncherPlugin`/m.test(rule)) {
    failures.push(
      `${rulePath} must remain Call-outgoing only — do not embed Auth launcher registration`,
    );
  }
}

if (failures.length > 0) {
  console.error("verify:ios-call-package-classlist-contract FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log("verify:ios-call-package-classlist-contract PASS");
console.log(
  `  Call outgoing required (${IOS_CALL_OUTGOING_PLUGIN_CLASSES.length}): ${IOS_CALL_OUTGOING_PLUGIN_CLASSES.join(", ")}`,
);
console.log(`  registered natively; CLI packageClassList (${classList.length}): ${classList.join(", ")}`);

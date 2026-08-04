#!/usr/bin/env node
/**
 * `npx cap sync ios` only scans node_modules plugins and overwrites packageClassList,
 * dropping App-target CAPBridgedPlugin classes.
 *
 * This file is the **common merge authority** for all App-target plugins
 * (Call + Auth + Delivery). Domain HARD LOCK docs must not invent a second list.
 *
 * @see docs/ios-capacitor-app-target-package-classlist.md
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const IOS_CAP_CONFIG = path.join(ROOT, "ios/App/App/capacitor.config.json");

/** Call outgoing HARD LOCK subset — see docs/dibay-call-ios-outgoing-package-classlist-hard-lock.md */
export const IOS_CALL_OUTGOING_PACKAGE_CLASSES = [
  "NativeCallServicePlugin",
  "DibayVoipCallPlugin",
  "DibayCallPipPlugin",
];

/** Auth App-target plugins — Apple/Kakao native + Google/Kakao web OAuth launcher */
export const IOS_AUTH_PACKAGE_CLASSES = [
  "NativeAppleAuthPlugin",
  "NativeKakaoAuthPlugin",
  "NativeOAuthLauncherPlugin",
];

/** Delivery / other App-target plugins */
export const IOS_DELIVERY_PACKAGE_CLASSES = [
  "DibayAppIconDeliveryPlugin",
];

/**
 * Full App-target merge list for post-`cap sync ios` restore.
 * Domain contracts reference this list; Call HARD LOCK is a subset only.
 */
export const IOS_APP_TARGET_PACKAGE_CLASSES = [
  ...IOS_CALL_OUTGOING_PACKAGE_CLASSES,
  ...IOS_AUTH_PACKAGE_CLASSES,
  ...IOS_DELIVERY_PACKAGE_CLASSES,
];

function mergePackageClassList(existing, required) {
  const merged = [...(Array.isArray(existing) ? existing : [])];
  for (const cls of required) {
    if (!merged.includes(cls)) merged.push(cls);
  }
  return merged;
}

export function patchIosCapacitorPackageClassList({ write = true } = {}) {
  if (!fs.existsSync(IOS_CAP_CONFIG)) {
    throw new Error(`missing ${IOS_CAP_CONFIG}`);
  }
  const raw = fs.readFileSync(IOS_CAP_CONFIG, "utf8");
  const json = JSON.parse(raw);
  const before = Array.isArray(json.packageClassList) ? [...json.packageClassList] : [];
  const after = mergePackageClassList(before, IOS_APP_TARGET_PACKAGE_CLASSES);
  const changed =
    before.length !== after.length || before.some((cls, i) => cls !== after[i]);
  if (write && changed) {
    json.packageClassList = after;
    fs.writeFileSync(IOS_CAP_CONFIG, `${JSON.stringify(json, null, "\t")}\n`, "utf8");
  }
  return { before, after, changed, path: IOS_CAP_CONFIG };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const result = patchIosCapacitorPackageClassList();
  if (result.changed) {
    console.log(
      `[patch-ios-capacitor-package-class-list] merged App-target plugins (${result.before.length} -> ${result.after.length})`,
    );
    for (const cls of IOS_APP_TARGET_PACKAGE_CLASSES) {
      console.log(`  + ${cls}`);
    }
  } else {
    console.log("[patch-ios-capacitor-package-class-list] PASS — packageClassList already complete");
  }
}

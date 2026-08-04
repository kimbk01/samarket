#!/usr/bin/env node
/**
 * iOS NativeOAuthLauncher — ASWebAuthenticationSession contract.
 * Completes empty iOS launcher owner; does not add a new Google Auth path.
 * @see docs/auth-ios-native-oauth-launcher-contract.md
 * @see docs/ios-capacitor-app-target-package-classlist.md
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  IOS_AUTH_PACKAGE_CLASSES,
  IOS_APP_TARGET_PACKAGE_CLASSES,
} from "./patch-ios-capacitor-package-class-list.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

const authDoc = "docs/auth-ios-native-oauth-launcher-contract.md";
if (!exists(authDoc)) {
  failures.push(`missing ${authDoc}`);
} else {
  const doc = read(authDoc);
  if (!doc.includes("ASWebAuthenticationSession") || !doc.includes("NativeOAuthLauncherPlugin")) {
    failures.push(`${authDoc} must define ASWebAuthenticationSession NativeOAuthLauncher contract`);
  }
}

const commonDoc = "docs/ios-capacitor-app-target-package-classlist.md";
if (!exists(commonDoc)) {
  failures.push(`missing ${commonDoc} — common packageClassList merge authority`);
}

if (!IOS_AUTH_PACKAGE_CLASSES.includes("NativeOAuthLauncherPlugin")) {
  failures.push("IOS_AUTH_PACKAGE_CLASSES must include NativeOAuthLauncherPlugin");
}
if (!IOS_APP_TARGET_PACKAGE_CLASSES.includes("NativeOAuthLauncherPlugin")) {
  failures.push("IOS_APP_TARGET_PACKAGE_CLASSES must include NativeOAuthLauncherPlugin");
}

const callDoc = read("docs/dibay-call-ios-outgoing-package-classlist-hard-lock.md");
if (/^- `NativeOAuthLauncherPlugin`/m.test(callDoc)) {
  failures.push(
    "Call HARD LOCK doc must not list NativeOAuthLauncherPlugin as a required plugin",
  );
}

const swiftPath = "ios/App/App/Plugins/NativeOAuthLauncherPlugin.swift";
if (!exists(swiftPath)) {
  failures.push(`missing ${swiftPath}`);
} else {
  const swift = read(swiftPath);
  if (!swift.includes("ASWebAuthenticationSession")) {
    failures.push("iOS NativeOAuthLauncher must use ASWebAuthenticationSession");
  }
  if (!swift.includes('static let callbackScheme = "dibay"')) {
    failures.push('iOS NativeOAuthLauncher must fix callbackScheme = "dibay"');
  }
  if (!swift.includes("ASWebAuthenticationPresentationContextProviding")) {
    failures.push("iOS NativeOAuthLauncher must implement ASWebAuthenticationPresentationContextProviding");
  }
  if (!swift.includes("private var authSession")) {
    failures.push("iOS NativeOAuthLauncher must retain ASWebAuthenticationSession on instance property");
  }
  if (!swift.includes("oauth_launcher_cancelled")) {
    failures.push("iOS NativeOAuthLauncher must map canceledLogin to oauth_launcher_cancelled");
  }
  if (!swift.includes("as_web_authentication_session")) {
    failures.push('iOS NativeOAuthLauncher must resolve method "as_web_authentication_session"');
  }
  if (!swift.includes("CAPBridgedPlugin")) {
    failures.push("iOS NativeOAuthLauncher must conform to CAPBridgedPlugin");
  }
  if (!swift.includes('jsName = "NativeOAuthLauncher"')) {
    failures.push('iOS NativeOAuthLauncher jsName must be "NativeOAuthLauncher"');
  }
  for (const banned of [
    "/auth/callback",
    "exchangeCode",
    "signInWith",
    "onboarding",
    "UIApplication.shared.open",
    "SFSafariViewController",
    "window.open",
  ]) {
    if (swift.includes(banned)) {
      failures.push(`iOS NativeOAuthLauncher must not contain ${banned}`);
    }
  }
  if (swift.includes("callbackURL.absoluteString") || swift.includes("callbackURL.query")) {
    failures.push("iOS NativeOAuthLauncher must not log callback URL body/query");
  }
}

const pbx = read("ios/App/App.xcodeproj/project.pbxproj");
if (!pbx.includes("NativeOAuthLauncherPlugin.swift in Sources")) {
  failures.push("project.pbxproj must compile NativeOAuthLauncherPlugin.swift in App target");
}

const capConfig = JSON.parse(read("ios/App/App/capacitor.config.json"));
const classList = Array.isArray(capConfig.packageClassList) ? capConfig.packageClassList : [];
if (!classList.includes("NativeOAuthLauncherPlugin")) {
  failures.push("ios/App/App/capacitor.config.json packageClassList missing NativeOAuthLauncherPlugin");
}

const openNativeTab = read("lib/auth/oauth/open-native-oauth-tab.ts");
if (!openNativeTab.includes("as_web_authentication_session")) {
  failures.push("open-native-oauth-tab.ts must accept as_web_authentication_session method");
}
if (!openNativeTab.includes("oauth_launcher_cancelled")) {
  failures.push("open-native-oauth-tab.ts must map oauth_launcher_cancelled");
}
if (!openNativeTab.includes("isNativeOAuthLauncherCancelError")) {
  failures.push("open-native-oauth-tab.ts must export isNativeOAuthLauncherCancelError");
}

const useOauth = read("lib/auth/oauth/use-oauth-login.ts");
if (!useOauth.includes("isNativeOAuthLauncherCancelError")) {
  failures.push("use-oauth-login.ts must treat launcher cancel as user cancel");
}

const androidPlugin = read("android/app/src/main/java/com/dibay/app/NativeOAuthLauncherPlugin.java");
if (!androidPlugin.includes('"method", "custom_tabs"')) {
  failures.push("Android NativeOAuthLauncher must remain custom_tabs (regression guard)");
}
if (androidPlugin.includes("ACTION_VIEW") && androidPlugin.includes("setAction(Intent.ACTION_VIEW)")) {
  failures.push("Android NativeOAuthLauncher must not reintroduce ACTION_VIEW fallback");
}

const appleRoutingTest = read("lib/auth/oauth/__tests__/oauth-provider-routing.client.test.ts");
if (!appleRoutingTest.includes('shouldBlockAppleWebOAuthSafetyNet("google", "ios", "web_oauth_start")).toBe(false)')) {
  failures.push("contract test must keep iOS Google web_oauth_start allowed");
}
if (!appleRoutingTest.includes('shouldBlockAppleWebOAuthSafetyNet("apple", "ios", "web_oauth_start")).toBe(true)')) {
  failures.push("contract test must keep iOS Apple web_oauth_start blocked");
}

if (failures.length > 0) {
  console.error("verify:ios-native-oauth-launcher-contract FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log("verify:ios-native-oauth-launcher-contract PASS");

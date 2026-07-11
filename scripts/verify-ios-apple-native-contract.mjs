#!/usr/bin/env node
/**
 * iOS Apple Native Auth shell contract — Xcode project + plugin + entitlements parity.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

function exists(relPath) {
  return fs.existsSync(path.join(ROOT, relPath));
}

const pbx = read("ios/App/App.xcodeproj/project.pbxproj");
const entitlements = exists("ios/App/App/App.entitlements")
  ? read("ios/App/App/App.entitlements")
  : "";
const pluginSwift = exists("ios/App/App/Plugins/NativeAppleAuthPlugin.swift")
  ? read("ios/App/App/Plugins/NativeAppleAuthPlugin.swift")
  : "";
const capConfig = read("capacitor.config.ts");
const capConfigJson = exists("ios/App/App/capacitor.config.json")
  ? read("ios/App/App/capacitor.config.json")
  : "";

if (!exists("ios/App/App.xcodeproj/project.pbxproj")) {
  failures.push("ios/App/App.xcodeproj must exist — run npx cap add ios");
}

if (!pluginSwift.includes("NativeAppleAuthPlugin")) {
  failures.push("ios/App/App/Plugins/NativeAppleAuthPlugin.swift must define NativeAppleAuthPlugin");
}

if (!pbx.includes("NativeAppleAuthPlugin.swift in Sources")) {
  failures.push("project.pbxproj must compile NativeAppleAuthPlugin.swift in App target");
}

if (!pbx.includes("PRODUCT_BUNDLE_IDENTIFIER = com.dibay.app")) {
  failures.push("Xcode target PRODUCT_BUNDLE_IDENTIFIER must be com.dibay.app");
}

if (!entitlements.includes("com.apple.developer.applesignin")) {
  failures.push("App.entitlements must include Sign in with Apple (com.apple.developer.applesignin)");
}

if (!pbx.includes("CODE_SIGN_ENTITLEMENTS = App/App.entitlements")) {
  failures.push("project.pbxproj must set CODE_SIGN_ENTITLEMENTS = App/App.entitlements");
}

const capServerUrl = exists("lib/platform/capacitor-server-url.ts")
  ? read("lib/platform/capacitor-server-url.ts")
  : "";

if (!capConfig.includes('appId: "com.dibay.app"')) {
  failures.push("capacitor.config.ts appId must be com.dibay.app");
}

if (
  !capConfig.includes("resolveCapacitorServerUrlFromEnv") ||
  !capServerUrl.includes("https://samarket.vercel.app")
) {
  failures.push("capacitor server.url must default to https://samarket.vercel.app via resolveCapacitorServerUrlFromEnv");
}

try {
  const parsed = JSON.parse(capConfigJson);
  if (parsed.appId !== "com.dibay.app") {
    failures.push("ios capacitor.config.json appId must be com.dibay.app");
  }
  if (!String(parsed.server?.url ?? "").includes("samarket.vercel.app")) {
    failures.push("ios capacitor.config.json server.url must point to samarket.vercel.app");
  }
  const requiredIosPlugins = [
    "NativeCallServicePlugin",
    "DibayVoipCallPlugin",
    "DibayCallPipPlugin",
    "NativeAppleAuthPlugin",
    "NativeKakaoAuthPlugin",
  ];
  const classList = Array.isArray(parsed.packageClassList) ? parsed.packageClassList : [];
  for (const cls of requiredIosPlugins) {
    if (!classList.includes(cls)) {
      failures.push(`ios capacitor.config.json packageClassList must include ${cls} (run patch-ios-capacitor-package-class-list after cap sync)`);
    }
  }
} catch {
  failures.push("ios/App/App/capacitor.config.json must be valid JSON");
}

if (!pluginSwift.includes("apple_native_started")) {
  failures.push("NativeAppleAuthPlugin.swift must log apple_native_started");
}

if (!pluginSwift.includes("CAPBridgedPlugin")) {
  failures.push("NativeAppleAuthPlugin must conform to CAPBridgedPlugin for Capacitor registration");
}

if (!pluginSwift.includes('jsName = "NativeAppleAuth"')) {
  failures.push('NativeAppleAuthPlugin jsName must be "NativeAppleAuth"');
}

const jsPlugin = read("lib/auth/native/native-apple-auth-plugin.ts");
const appleLoginClient = read("lib/auth/native/start-native-apple-login.client.ts");
const appleAuthEnv = read("lib/auth/native/apple-auth-env.server.ts");

if (!appleLoginClient.includes('logOAuthNativeEvent("apple_native_started"')) {
  failures.push("start-native-apple-login.client.ts must log apple_native_started via logOAuthNativeEvent");
}
if (!appleLoginClient.includes('logOAuthNativeEvent("apple_native_exchange_success"')) {
  failures.push("start-native-apple-login.client.ts must log apple_native_exchange_success");
}
if (appleLoginClient.includes("apple_native_exchange_ok")) {
  failures.push("start-native-apple-login.client.ts must not log duplicate apple_native_exchange_ok");
}
if (appleAuthEnv.includes("AUTH_APPLE_WEB_CLIENT_ID") && appleAuthEnv.includes("resolveAppleNativeAllowedAudiences")) {
  if (/AUTH_APPLE_WEB_CLIENT_ID|APPLE_CLIENT_ID/.test(
    appleAuthEnv.slice(appleAuthEnv.indexOf("resolveAppleNativeAllowedAudiences")),
  )) {
    failures.push("resolveAppleNativeAllowedAudiences must not include AUTH_APPLE_WEB_CLIENT_ID or APPLE_CLIENT_ID");
  }
}
if (!jsPlugin.includes("nativePromise")) {
  failures.push("native-apple-auth-plugin.ts must use Capacitor.nativePromise bridge path for remote WebView");
}
if (!jsPlugin.includes("isCapacitorNativePlatform")) {
  failures.push("native-apple-auth-plugin.ts must use isCapacitorNativePlatform instead of Capacitor.isNativePlatform only");
}

if (failures.length > 0) {
  console.error("verify:ios-apple-native-contract FAIL\n");
  for (const f of failures) {
    console.error(`  - ${f}`);
  }
  process.exit(1);
}

console.log("verify:ios-apple-native-contract PASS");

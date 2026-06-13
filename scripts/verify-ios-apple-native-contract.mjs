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

if (!capConfig.includes('appId: "com.dibay.app"')) {
  failures.push("capacitor.config.ts appId must be com.dibay.app");
}

if (!capConfig.includes("https://samarket.vercel.app")) {
  failures.push("capacitor.config.ts must default server.url to https://samarket.vercel.app");
}

try {
  const parsed = JSON.parse(capConfigJson);
  if (parsed.appId !== "com.dibay.app") {
    failures.push("ios capacitor.config.json appId must be com.dibay.app");
  }
  if (!String(parsed.server?.url ?? "").includes("samarket.vercel.app")) {
    failures.push("ios capacitor.config.json server.url must point to samarket.vercel.app");
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
if (!jsPlugin.includes("apple_native_started")) {
  failures.push("native-apple-auth-plugin.ts must log apple_native_started");
}

if (failures.length > 0) {
  console.error("verify:ios-apple-native-contract FAIL\n");
  for (const f of failures) {
    console.error(`  - ${f}`);
  }
  process.exit(1);
}

console.log("verify:ios-apple-native-contract PASS");

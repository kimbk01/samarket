#!/usr/bin/env node
/**
 * Native OAuth redirect contract — Android deep link ↔ code constant parity.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

const manifest = read("android/app/src/main/AndroidManifest.xml");
const returnBridge = read("lib/auth/oauth/return-bridge.ts");
const oauthConfig = read("lib/auth/oauth/config.ts");
const layout = read("app/layout.tsx");
const startRoute = read("app/api/auth/oauth/start/route.ts");

if (!manifest.includes('android:scheme="dibay"')) {
  failures.push("AndroidManifest missing android:scheme=\"dibay\"");
}
if (!manifest.includes('android:host="auth"')) {
  failures.push("AndroidManifest missing android:host=\"auth\"");
}
if (!manifest.includes('android:pathPrefix="/callback"')) {
  failures.push("AndroidManifest missing android:pathPrefix=\"/callback\"");
}
if (!manifest.includes('android:launchMode="singleTask"')) {
  failures.push("AndroidManifest MainActivity should use launchMode=\"singleTask\"");
}

const nativeUrlMatch = oauthConfig.match(
  /export const NATIVE_OAUTH_CALLBACK_URL = "(dibay:\/\/auth\/callback)"/,
);
if (!nativeUrlMatch) {
  failures.push("NATIVE_OAUTH_CALLBACK_URL constant not found in lib/auth/oauth/config.ts");
} else if (nativeUrlMatch[1] !== "dibay://auth/callback") {
  failures.push(`NATIVE_OAUTH_CALLBACK_URL expected dibay://auth/callback, got ${nativeUrlMatch[1]}`);
}

if (!layout.includes("OAuthReturnListener")) {
  failures.push("app/layout.tsx must mount OAuthReturnListener");
}
if (!layout.includes("CapacitorNativeMarkerBootstrap")) {
  failures.push("app/layout.tsx must mount CapacitorNativeMarkerBootstrap");
}

if (!read("lib/auth/oauth/redirect-to.ts").includes("buildOAuthRedirectTo")) {
  failures.push("lib/auth/oauth/redirect-to.ts must export buildOAuthRedirectTo");
}

if (!returnBridge.includes("Browser.close")) {
  failures.push("lib/auth/oauth/return-bridge.ts must call Browser.close on appUrlOpen success path");
}

if (!read("lib/auth/oauth/log.ts").includes("[authCallback] exchange_success")) {
  failures.push("lib/auth/oauth/log.ts must log [authCallback] exchange_success");
}

if (startRoute.includes("legacy_oauth_start_disabled")) {
  failures.push("app/api/auth/oauth/start/route.ts must not return legacy_oauth_start_disabled");
}

if (!read("docs/native-oauth-device-qa.md").includes("oauth|appUrlOpen|authCallback")) {
  failures.push("docs/native-oauth-device-qa.md must document Logcat filter");
}

if (failures.length > 0) {
  console.error("verify:native-oauth-redirect-contract FAIL");
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log("verify:native-oauth-redirect-contract PASS");

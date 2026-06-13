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
const mainActivity = read("android/app/src/main/java/com/dibay/app/MainActivity.java");
const startOAuthLogin = read("lib/auth/oauth/start-oauth-login.ts");
const launchClient = read("app/auth/oauth/launch/NativeOAuthLaunchClient.tsx");
const startRoute = read("app/api/auth/oauth/start/route.ts");
const resolveNative = read("lib/auth/oauth/resolve-native-oauth-request.server.ts");
const oauthReturnListener = read("components/auth/OAuthReturnListener.tsx");
const layout = read("app/layout.tsx");
const supabaseStart = read("lib/auth/oauth/supabase-oauth-start.server.ts");

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

if (!supabaseStart.includes("dibay://auth/callback")) {
  failures.push("lib/auth/oauth/supabase-oauth-start.server.ts must use dibay://auth/callback for native redirectTo");
}

if (!startRoute.includes("runSupabaseOAuthStart")) {
  failures.push("app/api/auth/oauth/start/route.ts must use shared runSupabaseOAuthStart");
}

if (!startRoute.includes("isNativeAppOAuthRequest")) {
  failures.push("app/api/auth/oauth/start/route.ts must detect native app via dibay_app marker");
}

if (!startRoute.includes('launch === "native"')) {
  failures.push("app/api/auth/oauth/start/route.ts must support launch=native JSON for Custom Tab flow");
}

if (!startRoute.includes("native_launch_requires_json")) {
  failures.push("app/api/auth/oauth/start/route.ts must block native WebView 302 to provider");
}

if (!resolveNative.includes("persistNativeAppMarkerCookie")) {
  failures.push("resolve-native-oauth-request.server.ts must persist dibay_app cookie");
}

if (!layout.includes("OAuthReturnListener")) {
  failures.push("app/layout.tsx must mount OAuthReturnListener");
}
if (!layout.includes("CapacitorNativeMarkerBootstrap")) {
  failures.push("app/layout.tsx must mount CapacitorNativeMarkerBootstrap");
}

if (!mainActivity.includes("registerPlugin(BrowserPlugin.class)")) {
  failures.push("MainActivity must register BrowserPlugin");
}

if (!startOAuthLogin.includes("/auth/oauth/launch")) {
  failures.push("lib/auth/oauth/start-oauth-login.ts must navigate native flow to /auth/oauth/launch");
}

if (startOAuthLogin.includes("Browser.open")) {
  failures.push("lib/auth/oauth/start-oauth-login.ts must not call Browser.open directly");
}

if (!launchClient.includes("Browser.open")) {
  failures.push("NativeOAuthLaunchClient must open authorizeUrl in Custom Tab on user tap");
}

if (!launchClient.includes("fetchNativeOAuthAuthorizeUrl")) {
  failures.push("NativeOAuthLaunchClient must fetch PKCE start URL before opening Custom Tab");
}

if (startOAuthLogin.includes("/auth/oauth/native-launch")) {
  failures.push("Native OAuth must not use legacy native-launch pages");
}

if (!oauthReturnListener.includes("Browser.close")) {
  failures.push("components/auth/OAuthReturnListener.tsx must call Browser.close on appUrlOpen success path");
}

if (!oauthReturnListener.includes("window.location.replace(webCallbackUrl)")) {
  failures.push("components/auth/OAuthReturnListener.tsx must replace to /auth/callback after appUrlOpen");
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

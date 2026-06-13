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
const startOAuthLogin = read("lib/auth/oauth/start-oauth-login.ts");
const nativeLaunchRoute = read("app/auth/oauth/native-launch/route.ts");
const nativeLaunchOpenPage = read("app/auth/oauth/native-launch/open/page.tsx");
const nativeLaunchClient = read("app/auth/oauth/native-launch/NativeOAuthLaunchClient.tsx");
const oauthReturnListener = read("components/auth/OAuthReturnListener.tsx");
const layout = read("app/layout.tsx");
const startRoute = read("app/api/auth/oauth/start/route.ts");
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

if (!layout.includes("OAuthReturnListener")) {
  failures.push("app/layout.tsx must mount OAuthReturnListener");
}
if (!layout.includes("CapacitorNativeMarkerBootstrap")) {
  failures.push("app/layout.tsx must mount CapacitorNativeMarkerBootstrap");
}

if (!startOAuthLogin.includes("NATIVE_OAUTH_LAUNCH_PATH")) {
  failures.push("lib/auth/oauth/start-oauth-login.ts must navigate native OAuth to NATIVE_OAUTH_LAUNCH_PATH");
}

if (startOAuthLogin.includes("fetchWithTimeout") || startOAuthLogin.includes("Browser.open({ url: json.authorizeUrl")) {
  failures.push("Native OAuth client must not fetch-then-open; use native-launch page instead");
}

if (!nativeLaunchRoute.includes("runSupabaseOAuthStart")) {
  failures.push("app/auth/oauth/native-launch/route.ts must run Supabase OAuth start server-side");
}

if (!nativeLaunchOpenPage.includes("NativeOAuthLaunchClient")) {
  failures.push("app/auth/oauth/native-launch/open/page.tsx must render NativeOAuthLaunchClient");
}

if (!nativeLaunchClient.includes("openNativeOAuthBrowser")) {
  failures.push("NativeOAuthLaunchClient must call openNativeOAuthBrowser");
}

if (!read("lib/auth/oauth/open-native-oauth-browser.ts").includes("Browser.open({ url })")) {
  failures.push("open-native-oauth-browser must try Browser.open first");
}

if (startOAuthLogin.includes("Browser.open({ url: startPath")) {
  failures.push("Native OAuth must not Browser.open the start endpoint");
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

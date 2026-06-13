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
const nativeLauncherPlugin = read("android/app/src/main/java/com/dibay/app/NativeOAuthLauncherPlugin.java");
const appBuildGradle = read("android/app/build.gradle");
const startOAuthLogin = read("lib/auth/oauth/start-oauth-login.ts");
const launchClient = read("app/auth/oauth/launch/NativeOAuthLaunchClient.tsx");
const openNativeTab = read("lib/auth/oauth/open-native-oauth-tab.ts");
const startRoute = read("app/api/auth/oauth/start/route.ts");
const resolveNative = read("lib/auth/oauth/resolve-native-oauth-request.server.ts");
const oauthReturnListener = read("components/auth/OAuthReturnListener.tsx");
const layout = read("app/layout.tsx");
const supabaseStart = read("lib/auth/oauth/supabase-oauth-start.server.ts");
const capacitorConfig = read("capacitor.config.ts");
const capacitorConfigJson = read("android/app/src/main/assets/capacitor.config.json");

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
if (!manifest.includes("android.permission.INTERNET")) {
  failures.push("AndroidManifest must declare INTERNET permission");
}

if (!supabaseStart.includes("dibay://auth/callback")) {
  failures.push("lib/auth/oauth/supabase-oauth-start.server.ts must use dibay://auth/callback for native redirectTo");
}

if (/url:\s*withNativeAppMarker/.test(capacitorConfig)) {
  failures.push("capacitor.config.ts must not apply withNativeAppMarker to server.url (breaks Web Message Listener allowedOriginRules)");
}

if (!capacitorConfig.includes("normalizeCapacitorServerUrl")) {
  failures.push("capacitor.config.ts must normalize server.url to origin-only via normalizeCapacitorServerUrl");
}

try {
  const parsedCapConfig = JSON.parse(capacitorConfigJson);
  const capacitorServerUrl = String(parsedCapConfig?.server?.url ?? "");
  if (!capacitorServerUrl || capacitorServerUrl.includes("?") || capacitorServerUrl.includes("dibay_app")) {
    failures.push(
      "android/app/src/main/assets/capacitor.config.json server.url must be origin-only (no dibay_app query); run npm run cap:sync:android",
    );
  }
} catch {
  failures.push("android/app/src/main/assets/capacitor.config.json must be valid JSON");
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

if (!mainActivity.includes("registerPlugin(NativeOAuthLauncherPlugin.class)")) {
  failures.push("MainActivity must register NativeOAuthLauncherPlugin");
}

const registerBeforeSuper = /registerPlugin\(NativeOAuthLauncherPlugin\.class\)[\s\S]*super\.onCreate\(/m.test(
  mainActivity,
);
if (!registerBeforeSuper) {
  failures.push("MainActivity must register NativeOAuthLauncherPlugin before super.onCreate()");
}

if (!nativeLauncherPlugin.includes("CustomTabsIntent")) {
  failures.push("NativeOAuthLauncherPlugin must try CustomTabsIntent as fallback");
}

if (!nativeLauncherPlugin.includes("Intent.ACTION_VIEW")) {
  failures.push("NativeOAuthLauncherPlugin must try ACTION_VIEW external browser first");
}

if (!nativeLauncherPlugin.includes("action_view_start")) {
  failures.push("NativeOAuthLauncherPlugin must log action_view_start");
}

if (!nativeLauncherPlugin.includes("NativeOAuthLauncher.open_called")) {
  failures.push("NativeOAuthLauncherPlugin must log NativeOAuthLauncher.open_called");
}

if (!nativeLauncherPlugin.includes('"method", "custom_tabs"')) {
  failures.push("NativeOAuthLauncherPlugin must resolve custom_tabs method on success");
}

if (!nativeLauncherPlugin.includes('"method", "action_view"')) {
  failures.push("NativeOAuthLauncherPlugin must resolve action_view method on fallback success");
}

if (!appBuildGradle.includes("androidx.browser:browser")) {
  failures.push("android/app/build.gradle must depend on androidx.browser for NativeOAuthLauncherPlugin");
}

if (!openNativeTab.includes('registerPlugin<NativeOAuthLauncherPlugin>("NativeOAuthLauncher")')) {
  failures.push("open-native-oauth-tab.ts must call NativeOAuthLauncher Capacitor plugin");
}

if (openNativeTab.includes("@capacitor/browser") || openNativeTab.includes("Browser.open")) {
  failures.push("open-native-oauth-tab.ts must not use @capacitor/browser Browser.open for OAuth start");
}

if (
  openNativeTab.includes("openWithAnchor")
  || openNativeTab.includes("openWithCapacitorBrowser")
) {
  failures.push("open-native-oauth-tab.ts must not use anchor or Browser fallback helpers");
}

if (!openNativeTab.includes("waitForCapacitorBridgeReady")) {
  failures.push("open-native-oauth-tab.ts must wait for Capacitor bridge before NativeOAuthLauncher.open");
}

if (!openNativeTab.includes("oauth_bridge_not_ready")) {
  failures.push("open-native-oauth-tab.ts must block open with oauth_bridge_not_ready when bridge is unavailable");
}

if (!launchClient.includes("openNativeOAuthTab")) {
  failures.push("NativeOAuthLaunchClient must use openNativeOAuthTab");
}

if (!launchClient.includes("waitForCapacitorBridgeReady")) {
  failures.push("NativeOAuthLaunchClient must wait for Capacitor bridge before auto open");
}

if (!launchClient.includes("isOAuthNativeLaunchShell")) {
  failures.push("NativeOAuthLaunchClient must use isOAuthNativeLaunchShell for native launch shell detection");
}

if (!read("lib/platform/capacitor-native.ts").includes("isOAuthNativeLaunchShell")) {
  failures.push("capacitor-native.ts must expose isOAuthNativeLaunchShell");
}

if (launchClient.includes('from "@capacitor/browser"')) {
  failures.push("NativeOAuthLaunchClient must not import Browser directly");
}

if (!launchClient.includes("fetchNativeOAuthAuthorizeUrl")) {
  failures.push("NativeOAuthLaunchClient must fetch PKCE start URL before opening Custom Tab");
}

if (!launchClient.includes("formatNativeOAuthDevError")) {
  failures.push("NativeOAuthLaunchClient must show native OAuth dev error detail on failure");
}

if (!launchClient.includes("dispatchOAuthPendingClear")) {
  failures.push("NativeOAuthLaunchClient must clear OAuth pending on launch open failure");
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

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
const oauthCustomTabsLauncher = read("android/app/src/main/java/com/dibay/app/OAuthCustomTabsLauncher.java");
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

if (!supabaseStart.includes("NATIVE_OAUTH_CAPACITOR_RETURN_PATH")) {
  failures.push("lib/auth/oauth/supabase-oauth-start.server.ts must use /auth/oauth/capacitor-return for native Supabase redirectTo");
}

const nativeOAuthContract = read("lib/auth/oauth/native-oauth-contract.ts");
const capacitorReturnPage = read("app/auth/oauth/capacitor-return/page.tsx");
const capacitorBootstrap = read("components/platform/CapacitorNativeMarkerBootstrap.tsx");

if (!nativeOAuthContract.includes("NATIVE_OAUTH_PASS_LOG_EVENTS")) {
  failures.push("native-oauth-contract.ts must define NATIVE_OAUTH_PASS_LOG_EVENTS baseline");
}

if (!nativeOAuthContract.includes("shouldBridgeCapacitorReturnToApp")) {
  failures.push("native-oauth-contract.ts must validate capacitor-return bridge params");
}

if (!capacitorReturnPage.includes("buildValidatedNativeAppCallbackUrl")) {
  failures.push("capacitor-return/page.tsx must validate code/error before dibay:// bridge");
}

if (capacitorBootstrap.includes("preloadOAuthBrowser")) {
  failures.push("CapacitorNativeMarkerBootstrap must not preload @capacitor/browser (legacy Browser.open era)");
}

if (startOAuthLogin.includes("preloadOAuthBrowser")) {
  failures.push("start-oauth-login.ts must not preload @capacitor/browser");
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

if (!startRoute.includes("shouldUseNativeOAuthRedirect")) {
  failures.push("app/api/auth/oauth/start/route.ts must use shouldUseNativeOAuthRedirect for native capacitor-return redirectTo");
}

if (!startRoute.includes("isNativeOAuthJsonLaunch")) {
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

if (!read("lib/auth/oauth/start-oauth-login.ts").includes("isNativeOAuthSupabaseRedirectUrl")) {
  failures.push("start-oauth-login.ts must reject native OAuth when redirectTo is not /auth/oauth/capacitor-return");
}

if (!startOAuthLogin.includes("NATIVE_OAUTH_LAUNCH_PATH")) {
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

if (!oauthCustomTabsLauncher.includes("CustomTabsIntent")) {
  failures.push("OAuthCustomTabsLauncher must open OAuth via CustomTabsIntent");
}

if (!nativeLauncherPlugin.includes("OAuthCustomTabsLauncher")) {
  failures.push("NativeOAuthLauncherPlugin must delegate to OAuthCustomTabsLauncher (Capacitor Browser parity)");
}

if (!oauthCustomTabsLauncher.includes("CustomTabsClient.bindCustomTabsService")) {
  failures.push("OAuthCustomTabsLauncher must bind Custom Tabs service before launch (Capacitor Browser parity)");
}

if (!oauthCustomTabsLauncher.includes("CustomTabsClient.getPackageName")) {
  failures.push("OAuthCustomTabsLauncher must resolve Custom Tabs provider package explicitly");
}

if (!oauthCustomTabsLauncher.includes("EXTRA_REFERRER")) {
  failures.push("OAuthCustomTabsLauncher must set EXTRA_REFERRER for in-app Custom Tab task affinity");
}

if (nativeLauncherPlugin.includes("Intent.ACTION_VIEW")) {
  failures.push("NativeOAuthLauncherPlugin must not use ACTION_VIEW — it opens full Chrome app, not in-app Custom Tab");
}

if (!nativeLauncherPlugin.includes("custom_tabs_unavailable")) {
  failures.push("NativeOAuthLauncherPlugin must reject with custom_tabs_unavailable when Custom Tabs cannot launch");
}

if (!nativeLauncherPlugin.includes("NativeOAuthLauncher.open_called")) {
  failures.push("NativeOAuthLauncherPlugin must log NativeOAuthLauncher.open_called");
}

if (!nativeLauncherPlugin.includes('"method", "custom_tabs"')) {
  failures.push("NativeOAuthLauncherPlugin must resolve custom_tabs method on success");
}

if (nativeLauncherPlugin.includes('"method", "action_view"')) {
  failures.push("NativeOAuthLauncherPlugin must not resolve action_view — full Chrome fallback is removed");
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

if (!oauthReturnListener.includes("callback_app_url_open")) {
  failures.push("OAuthReturnListener must log oauth callback_app_url_open for Logcat tracing");
}

if (!oauthReturnListener.includes("callback_listener_attached")) {
  failures.push("OAuthReturnListener must log callback_listener_attached when appUrlOpen listener is ready");
}

if (!oauthReturnListener.includes("callback_navigate")) {
  failures.push("OAuthReturnListener must log callback_navigate before /auth/callback replace");
}

if (!read("components/auth/SupabaseAuthSync.tsx").includes('logOAuthNativeEvent("exchange_success"')) {
  failures.push("SupabaseAuthSync must log oauth exchange_success on SIGNED_IN");
}

if (!mainActivity.includes("DIBAY_OAuth")) {
  failures.push("MainActivity must log dibay://auth callback intents for Logcat");
}

if (!nativeLauncherPlugin.includes("oauth_external_launch")) {
  failures.push("NativeOAuthLauncherPlugin must log oauth_external_launch (Chrome/Custom Tab is expected UX)");
}

if (oauthReturnListener.includes("browserFinished")) {
  failures.push("OAuthReturnListener must not use browserFinished — Custom Tab path uses appUrlOpen only");
}

if (!oauthReturnListener.includes("window.location.replace(webCallbackUrl)")) {
  failures.push("components/auth/OAuthReturnListener.tsx must replace to /auth/callback after appUrlOpen");
}

if (startRoute.includes("legacy_oauth_start_disabled")) {
  failures.push("app/api/auth/oauth/start/route.ts must not return legacy_oauth_start_disabled");
}

if (!read("docs/native-oauth-device-qa.md").includes("NATIVE_OAUTH_PASS_LOG_EVENTS")) {
  failures.push("docs/native-oauth-device-qa.md must document A-plan PASS log baseline");
}

if (!read("docs/native-oauth-device-qa.md").includes("oauth|DIBAY_OAuth|NativeOAuthLauncher")) {
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

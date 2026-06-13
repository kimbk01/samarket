#!/usr/bin/env node
/**
 * Kakao Native Auth shell contract — Android/iOS plugin + server verify parity.
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

const androidPlugin = read("android/app/src/main/java/com/dibay/app/NativeKakaoAuthPlugin.java");
const iosPlugin = exists("ios/App/App/Plugins/NativeKakaoAuthPlugin.swift")
  ? read("ios/App/App/Plugins/NativeKakaoAuthPlugin.swift")
  : "";
const jsPlugin = read("lib/auth/native/native-kakao-auth-plugin.ts");
const kakaoStart = read("lib/auth/native/start-native-kakao-login.client.ts");
const postExchange = read("lib/auth/native/post-native-exchange.client.ts");
const useOAuth = read("lib/auth/oauth/use-oauth-login.ts");
const adapter = read("lib/auth/native/native-provider-adapter.server.ts");
const kakaoEnv = read("lib/auth/native/kakao-auth-env.server.ts");
const infoPlist = read("ios/App/App/Info.plist");
const androidGradle = read("android/app/build.gradle");
const pbx = read("ios/App/App.xcodeproj/project.pbxproj");

if (!androidPlugin.includes("loginWithKakaoTalk")) {
  failures.push("NativeKakaoAuthPlugin.java must use loginWithKakaoTalk");
}
if (!androidPlugin.includes("loginWithKakaoAccount")) {
  failures.push("NativeKakaoAuthPlugin.java must use loginWithKakaoAccount");
}
if (!androidPlugin.includes("kakao_native_talk_fallback_account")) {
  failures.push("NativeKakaoAuthPlugin.java must fallback to loginWithKakaoAccount when talk login fails");
}
if (!androidPlugin.includes("handleOnDestroy")) {
  failures.push("NativeKakaoAuthPlugin.java must reject pending signIn on handleOnDestroy");
}
if (!androidPlugin.includes("NativeKakaoAuth")) {
  failures.push("Android plugin name must be NativeKakaoAuth");
}
if (!iosPlugin.includes("loginWithKakaoTalk")) {
  failures.push("NativeKakaoAuthPlugin.swift must use loginWithKakaoTalk");
}
if (!iosPlugin.includes("kakao_native_talk_fallback_account")) {
  failures.push("NativeKakaoAuthPlugin.swift must fallback to loginWithKakaoAccount when talk login fails");
}
if (!iosPlugin.includes("jsName = \"NativeKakaoAuth\"")) {
  failures.push("iOS plugin jsName must be NativeKakaoAuth");
}
if (!jsPlugin.includes("nativePromise") && !jsPlugin.includes("invokeNativeKakaoPlugin")) {
  failures.push("native-kakao-auth-plugin.ts must use Capacitor.nativePromise bridge path");
}
if (!kakaoStart.includes("logOAuthNativeEvent(\"kakao_native_started\"")) {
  failures.push("start-native-kakao-login.client.ts must log kakao_native_started");
}
if (!read("lib/auth/client-session-wipe.ts").includes("revokeNativeKakaoSessionIfAvailable")) {
  failures.push("client-session-wipe must revoke Native Kakao session on logout");
}
if (!postExchange.includes("postNativeProviderExchange")) {
  failures.push("post-native-exchange.client.ts must define shared postNativeProviderExchange");
}
if (!useOAuth.includes("startNativeProviderLogin")) {
  failures.push("use-oauth-login.ts must route native Kakao via startNativeProviderLogin");
}
if (!read("lib/auth/native/start-native-provider-login.client.ts").includes("startNativeKakaoLogin")) {
  failures.push("start-native-provider-login.client.ts must delegate kakao to startNativeKakaoLogin");
}
if (!pbx.includes("NativeKakaoAuthPlugin.swift in Sources")) {
  failures.push("project.pbxproj must compile NativeKakaoAuthPlugin.swift");
}
if (!pbx.includes("kakao-ios-sdk")) {
  failures.push("project.pbxproj must link kakao-ios-sdk SPM package");
}
if (!infoPlist.includes("kakao$(KAKAO_NATIVE_APP_KEY)")) {
  failures.push("Info.plist CFBundleURLSchemes must use kakao$(KAKAO_NATIVE_APP_KEY)");
}
if (infoPlist.includes("<string>kakao</string>") && !infoPlist.includes("kakao$(KAKAO_NATIVE_APP_KEY)")) {
  failures.push("Info.plist must not use bare kakao URL scheme placeholder");
}
if (androidGradle.includes('"kakao"') && androidGradle.includes('kakaoNativeAppKey ? "kakao${kakaoNativeAppKey}" : "kakao"')) {
  failures.push("Android must not fallback kakao_login_scheme to bare kakao when key missing");
}
if (!androidGradle.includes("local.properties")) {
  failures.push("android/app/build.gradle must read KAKAO_NATIVE_APP_KEY from local.properties");
}
if (kakaoEnv.includes('process.env.NODE_ENV !== "production"')) {
  failures.push("kakao-auth-env must not default-disable exchange in production");
}
if (adapter.includes('createStubAdapter("kakao")')) {
  failures.push("kakao adapter must not remain a stub");
}
if (!adapter.includes("verifyKakaoNativeCredential")) {
  failures.push("kakao adapter must verify tokens server-side");
}
if (!androidPlugin.includes("kakao_native_in_flight")) {
  failures.push("NativeKakaoAuthPlugin.java must reject double-tap signIn");
}
if (!androidPlugin.includes("Kakao sign-in session changed")) {
  failures.push("NativeKakaoAuthPlugin me() must reject stale PluginCall when pendingCall changed");
}

if (failures.length > 0) {
  console.error("verify:kakao-native-contract FAIL\n");
  for (const f of failures) {
    console.error(`  - ${f}`);
  }
  process.exit(1);
}

console.log("verify:kakao-native-contract PASS");

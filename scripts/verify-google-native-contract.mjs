#!/usr/bin/env node
/**
 * Google Native Auth shell contract — Android plugin + server verify parity.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

const androidPlugin = read("android/app/src/main/java/com/dibay/app/NativeGoogleAuthPlugin.java");
const jsPlugin = read("lib/auth/native/native-google-auth-plugin.ts");
const googleStart = read("lib/auth/native/start-native-google-login.client.ts");
const googleRecoverBootstrap = read("lib/auth/native/google-native-recover-bootstrap.client.ts");
const postExchange = read("lib/auth/native/post-native-exchange.client.ts");
const useOAuth = read("lib/auth/oauth/use-oauth-login.ts");
const adapter = read("lib/auth/native/native-provider-adapter.server.ts");
const googleEnv = read("lib/auth/native/google-auth-env.server.ts");
const androidGradle = read("android/app/build.gradle");
const mainActivity = read("android/app/src/main/java/com/dibay/app/MainActivity.java");

if (!androidPlugin.includes("NativeGoogleAuth")) {
  failures.push("Android plugin name must be NativeGoogleAuth");
}
if (!androidPlugin.includes("requestIdToken")) {
  failures.push("NativeGoogleAuthPlugin.java must requestIdToken for server verify");
}
if (!androidPlugin.includes("google_native_signout_before_picker_ok")) {
  failures.push("NativeGoogleAuthPlugin signIn must signOut before account picker (Google official account chooser)");
}
if (!androidPlugin.includes("launchGoogleAccountPicker")) {
  failures.push("NativeGoogleAuthPlugin must launch account picker via dedicated helper after signOut");
}
if (androidPlugin.includes("getLastSignedInAccount")) {
  failures.push("NativeGoogleAuthPlugin must not use getLastSignedInAccount fallback (bypasses account chooser)");
}
if (!androidPlugin.includes("clearExchangePending()")) {
  failures.push("NativeGoogleAuthPlugin recover failure must clearExchangePending");
}
if (!read("lib/auth/client-session-wipe.ts").includes("revokeNativeGoogleSessionIfAvailable")) {
  failures.push("client-session-wipe must revoke Native Google session on logout");
}
if (!androidPlugin.includes("PREF_PENDING_ID_TOKEN")) {
  failures.push("NativeGoogleAuthPlugin.java must persist deferred id token for process restart recovery");
}
if (!androidPlugin.includes("recoverSignInIfPending")) {
  failures.push("NativeGoogleAuthPlugin.java must implement recoverSignInIfPending for process restart recovery");
}
if (androidPlugin.includes("rejectPendingCall(\"google_native_unavailable\", \"Activity destroyed")) {
  failures.push("NativeGoogleAuthPlugin must not reject signIn on handleOnDestroy (breaks Google account UI return)");
}
if (!mainActivity.includes("NativeGoogleAuthPlugin")) {
  failures.push("MainActivity must register NativeGoogleAuthPlugin");
}
if (!androidGradle.includes("play-services-auth")) {
  failures.push("android/app/build.gradle must include play-services-auth");
}
if (!androidGradle.includes("google_web_client_id")) {
  failures.push("android/app/build.gradle must expose google_web_client_id resValue");
}
if (!jsPlugin.includes("nativePromise")) {
  failures.push("native-google-auth-plugin.ts must use Capacitor.nativePromise bridge path");
}
if (!googleStart.includes("logOAuthNativeEvent(\"google_native_started\"")) {
  failures.push("start-native-google-login.client.ts must log google_native_started");
}
if (!googleRecoverBootstrap.includes("recoverNativeGoogleLoginIfPending")) {
  failures.push("google-native-recover-bootstrap must be sole app-wide Google recover entry");
}
if (useOAuth.includes("recoverNativeGoogleLoginIfPending")) {
  failures.push("use-oauth-login must not duplicate Google recover (bootstrap owns recover)");
}
if (!postExchange.includes("postNativeProviderExchange")) {
  failures.push("post-native-exchange.client.ts must define shared postNativeProviderExchange");
}
if (!useOAuth.includes("startNativeProviderLogin")) {
  failures.push("use-oauth-login.ts must route native Google via startNativeProviderLogin");
}
if (!read("lib/auth/native/start-native-provider-login.client.ts").includes("startNativeGoogleLogin")) {
  failures.push("start-native-provider-login.client.ts must delegate google to startNativeGoogleLogin");
}
if (adapter.includes('createStubAdapter("google")')) {
  failures.push("googleNativeProviderAdapter must not be a stub");
}
if (!googleEnv.includes("AUTH_GOOGLE_NATIVE_WEB_CLIENT_ID")) {
  failures.push("google-auth-env.server.ts must read AUTH_GOOGLE_NATIVE_WEB_CLIENT_ID");
}

if (failures.length > 0) {
  console.error("verify:google-native-contract FAIL\n");
  for (const f of failures) {
    console.error(`  - ${f}`);
  }
  process.exit(1);
}

console.log("verify:google-native-contract PASS");

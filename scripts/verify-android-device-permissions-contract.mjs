#!/usr/bin/env node
/**
 * Android device permissions contract — manifest + Capacitor plugin + JS bridge + WebView delegate.
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
const plugin = read("android/app/src/main/java/com/dibay/app/NativeDevicePermissionsPlugin.java");
const webDelegate = read("android/app/src/main/java/com/dibay/app/DibayWebViewPermissionDelegate.java");
const webChrome = read("android/app/src/main/java/com/dibay/app/DibayDelegatingWebChromeClient.java");
const tsPlugin = read("lib/permissions/native-device-permissions-plugin.ts");
const tsBridge = read("lib/permissions/android-native-device-permissions.ts");
const permManager = read("lib/permissions/device-permission-manager.ts");

for (const perm of ["RECORD_AUDIO", "CAMERA", "ACCESS_FINE_LOCATION", "POST_NOTIFICATIONS"]) {
  if (!manifest.includes(perm)) {
    failures.push(`AndroidManifest must declare ${perm}`);
  }
}

if (!mainActivity.includes("NativeDevicePermissionsPlugin.class")) {
  failures.push("MainActivity must register NativeDevicePermissionsPlugin");
}
if (!mainActivity.includes("DibayDelegatingWebChromeClient")) {
  failures.push("MainActivity must attach DibayDelegatingWebChromeClient");
}
if (!mainActivity.includes("onRequestPermissionsResult")) {
  failures.push("MainActivity must forward onRequestPermissionsResult to WebView delegate");
}

if (!plugin.includes('name = "NativeDevicePermissions"')) {
  failures.push("NativeDevicePermissionsPlugin name must be NativeDevicePermissions");
}
if (!plugin.includes("requestPermission")) {
  failures.push("NativeDevicePermissionsPlugin must expose requestPermission");
}
if (!plugin.includes("requestCallMediaPermissions")) {
  failures.push("NativeDevicePermissionsPlugin must expose requestCallMediaPermissions for voice/video calls");
}
if (!mainActivity.includes("protected void onStart()")) {
  failures.push("MainActivity must re-attach WebChromeClient in onStart");
}
if (!mainActivity.includes("handleCallMediaPermissionsResult")) {
  failures.push("MainActivity must forward call media permission results to NativeDevicePermissionsPlugin");
}

if (!webDelegate.includes("onPermissionRequest")) {
  failures.push("DibayWebViewPermissionDelegate must handle WebView onPermissionRequest");
}
if (!webDelegate.includes("onGeolocationPermissionsShowPrompt")) {
  failures.push("DibayWebViewPermissionDelegate must handle geolocation WebView prompt");
}

if (!webChrome.includes("onGeolocationPermissionsShowPrompt")) {
  failures.push("DibayDelegatingWebChromeClient must override geolocation prompt");
}

if (!tsPlugin.includes("NativeDevicePermissions")) {
  failures.push("native-device-permissions-plugin.ts must register NativeDevicePermissions");
}
if (!tsBridge.includes("ensureAndroidNativeRuntimePermissions")) {
  failures.push("android-native-device-permissions.ts must define ensureAndroidNativeRuntimePermissions");
}
if (!permManager.includes("ensureAndroidNativeRuntimePermissions")) {
  failures.push("device-permission-manager must call ensureAndroidNativeRuntimePermissions in gate");
}

if (failures.length > 0) {
  console.error("verify-android-device-permissions-contract FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log("verify-android-device-permissions-contract PASS");

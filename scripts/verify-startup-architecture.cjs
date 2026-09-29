#!/usr/bin/env node
/**
 * Startup architecture contract — 13TH ZERO.
 * OS Splash / LaunchScreen → Home. No Product Intro shell.
 * Static analysis only. Exit 1 on FAIL.
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

function fail(msg) {
  console.error(`[verify:startup-architecture] FAIL: ${msg}`);
  process.exit(1);
}

function ok(msg) {
  console.log(`[verify:startup-architecture] OK: ${msg}`);
}

const required = [
  "lib/startup/startup-config.ts",
  "lib/startup/startup-cache.ts",
  "lib/startup/startup-metrics.ts",
  "lib/startup/startup-config-client.ts",
  "lib/startup/startup-config-db.ts",
  "app/api/app/startup-config/route.ts",
  "app/api/admin/startup-config/route.ts",
  "app/admin/settings/startup-config/page.tsx",
  "ios/App/App/DibayStartupBridgeViewController.swift",
  "android/app/src/main/res/values/styles.xml",
  "ios/App/App/Base.lproj/LaunchScreen.storyboard",
];
for (const rel of required) {
  if (!exists(rel)) fail(`missing ${rel}`);
}
ok("required OS/startup files present");

// Product Intro shell must be gone
for (const rel of [
  "android/app/src/main/assets/dibay-startup.html",
  "ios/App/App/public/dibay-startup.html",
  "capacitor-www/dibay-startup.html",
  "lib/intro",
  "components/admin/intro",
  "app/admin/intro",
  "app/api/admin/intro",
  "app/api/intro",
  "android/app/src/main/java/com/dibay/app/intro",
]) {
  if (exists(rel)) fail(`product intro path must be absent: ${rel}`);
}
ok("product intro trees absent");

const styles = read("android/app/src/main/res/values/styles.xml");
if (!styles.includes("Theme.SplashScreen") && !styles.includes("AppTheme.NoActionBarLaunch")) {
  fail("Android Theme.SplashScreen / NoActionBarLaunch required");
}
ok("Android OS Splash theme present");

const launch = read("ios/App/App/Base.lproj/LaunchScreen.storyboard");
if (!launch.includes("Launch")) fail("iOS LaunchScreen required");
ok("iOS LaunchScreen present");

const capConfig = read("capacitor.config.ts");
const hasHybridServerUrl = /server:\s*\{[\s\S]*url:/.test(capConfig);
const hasLocalRuntimeBranch = capConfig.includes("useLocalRuntime") && capConfig.includes("DIBAY_LOCAL_RUNTIME");
if (!hasHybridServerUrl && !hasLocalRuntimeBranch) {
  fail("capacitor.config.ts must keep Hybrid server.url or Local Runtime branch");
}
ok(hasLocalRuntimeBranch ? "capacitor server: Hybrid url + Local Runtime branch" : "server.url retained");

const main = read("android/app/src/main/java/com/dibay/app/MainActivity.java");
if (!main.includes("loadLocalStartupShellIfReady")) fail("MainActivity must keep loadLocalStartupShellIfReady");
if (!main.includes("getPendingRoute")) fail("DibayBootBridge must expose getPendingRoute");
if (!main.includes("beginHandoffCover") || !main.includes("endHandoffCover")) {
  fail("DibayBootBridge must expose beginHandoffCover/endHandoffCover");
}
if (/SPLASH_MAX_KEEP_MS/.test(main)) fail("MainActivity must not use timed splash keep");
if (!/webSplashDismissRequested/.test(main)) fail("MainActivity must use webSplashDismissRequested");
if (/com\.dibay\.app\.intro|DibayIntro|tryStartDibayIntro|introSessionActive/.test(main)) {
  fail("MainActivity must not reference Product Intro");
}
ok("Android OS splash boot; Product Intro absent");

const iosVc = read("ios/App/App/DibayStartupBridgeViewController.swift");
if (/DibayIntro|tryStartAuthoredIntro|introSessionActive|ACTIVE Pack/.test(iosVc)) {
  fail("iOS startup VC must not reference Product Intro");
}
ok("iOS startup VC Product Intro absent");

const metrics = read("lib/startup/startup-metrics.ts");
if (!metrics.includes("markBootMetricsShellReady")) fail("startup-metrics missing shellReady");
if (!metrics.includes("markAppReady")) fail("startup-metrics missing markAppReady");
if (/splashDismissAttempted[\s\S]{0,80}setTimeout|setTimeout[\s\S]{0,80}splash|minimumSplashDuration|SPLASH_MAX_KEEP/.test(metrics)) {
  fail("startup-metrics must not use timed splash dismiss");
}
ok("startup metrics App Ready contract");

const layout = read("app/layout.tsx");
const bannedLayout = [
  "DibayStartupIntro",
  "ProductIntroHost",
  "ProductIntroMaterializeController",
  "IntroForegroundSyncHost",
];
for (const b of bannedLayout) {
  if (layout.includes(b)) fail(`app/layout must not mount ${b}`);
}
ok("layout has no Product Intro mounts");

const tree = read("components/layout/MainAppProviderTree.tsx");
if (tree.includes("IntroForegroundSyncHost") || tree.includes("lib/intro")) {
  fail("MainAppProviderTree must not wire IntroForegroundSyncHost");
}
ok("MainAppProviderTree Intro sync absent");

console.log("[verify:startup-architecture] PASS");

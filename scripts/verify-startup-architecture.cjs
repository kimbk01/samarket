#!/usr/bin/env node
/**
 * Startup architecture contract — Local First Boot Shell (Phase E).
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

// --- SSOT files ---
const required = [
  "lib/startup/startup-config.ts",
  "lib/startup/startup-cache.ts",
  "lib/startup/startup-shell-markup.ts",
  "lib/startup/startup-metrics.ts",
  "lib/startup/startup-config-client.ts",
  "lib/startup/startup-config-db.ts",
  "lib/startup/startup-detect.ts",
  "scripts/build-startup-shell.mjs",
  "android/app/src/main/assets/dibay-startup.html",
  "ios/App/App/public/dibay-startup.html",
  "capacitor-www/dibay-startup.html",
  "app/api/app/startup-config/route.ts",
  "app/api/admin/startup-config/route.ts",
  "app/admin/settings/startup-config/page.tsx",
  "components/app/DibayStartupIntro.tsx",
  "ios/App/App/DibayStartupBridgeViewController.swift",
];
for (const rel of required) {
  if (!exists(rel)) fail(`missing ${rel}`);
}
ok("required startup files present");

// --- Boot HTML self-contained + single handoff ---
const bootHtml = read("android/app/src/main/assets/dibay-startup.html");
if (!bootHtml.includes("location.replace")) fail("boot HTML missing location.replace");
if ((bootHtml.match(/location\.replace/g) || []).length !== 1) {
  fail("boot HTML must have exactly one location.replace");
}
if (/src=["']https?:\/\//.test(bootHtml) || /href=["']https?:\/\/(?!samarket)/.test(bootHtml)) {
  // remoteOrigin string in script is OK; forbid external subresource tags
}
if (/<(?:link|script)\s[^>]*(?:src|href)=["']https?:\/\//i.test(bootHtml)) {
  fail("boot HTML must not load external link/script subresources");
}
if (!bootHtml.includes("dibay-startup-nav")) fail("boot HTML missing BottomNav shell");
if (!bootHtml.includes("dibay-startup-intro") && !bootHtml.includes("dibay-startup-root")) {
  fail("boot HTML missing startup root/intro");
}
ok("boot HTML self-contained + single handoff");

// --- server.url kept ---
const capConfig = read("capacitor.config.ts");
if (!/server:\s*\{[\s\S]*url:/.test(capConfig)) fail("capacitor.config.ts must keep server.url");
ok("server.url retained");

// --- Android intercept ---
const client = read("android/app/src/main/java/com/dibay/app/DibayBridgeWebViewClient.java");
if (!client.includes("shouldInterceptRequest")) fail("WebViewClient must override shouldInterceptRequest");
if (!client.includes("__dibay-startup") && !client.includes("STARTUP_BOOT_PATH")) {
  fail("WebViewClient must intercept /__dibay-startup");
}
const main = read("android/app/src/main/java/com/dibay/app/MainActivity.java");
if (!main.includes("loadLocalStartupShellIfReady")) fail("MainActivity must load local startup shell");
if (!main.includes("getPendingRoute")) fail("DibayBootBridge must expose getPendingRoute");
if (!main.includes("showNativeHandoffCover") || !main.includes("hideNativeHandoffCover")) {
  fail("MainActivity must implement Native Handoff Cover show/hide");
}
if (!main.includes("beginHandoffCover") || !main.includes("endHandoffCover")) {
  fail("DibayBootBridge must expose beginHandoffCover/endHandoffCover");
}
if (/SPLASH_MAX_KEEP_MS/.test(main)) fail("MainActivity must not use timed splash keep");
if (!/webSplashDismissRequested/.test(main)) fail("MainActivity must use webSplashDismissRequested");
ok("Android local startup intercept + handoff cover + no timed splash");

const bootHtmlCheck = read("android/app/src/main/assets/dibay-startup.html");
if (!bootHtmlCheck.includes("beginHandoffCover")) fail("boot HTML must call beginHandoffCover before replace");
if (!bootHtmlCheck.includes("hideIntroShowShell")) fail("boot HTML must hide intro before local shell paint");
ok("boot HTML handoff cover + intro hide order");

// --- Metrics / App Ready ---
const metrics = read("lib/startup/startup-metrics.ts");
if (!metrics.includes("markBootMetricsShellReady")) fail("startup-metrics missing shellReady");
if (!metrics.includes("markAppReady")) fail("startup-metrics missing markAppReady");
if (/splashDismissAttempted[\s\S]{0,80}setTimeout|setTimeout[\s\S]{0,80}splash|minimumSplashDuration|SPLASH_MAX_KEEP/.test(metrics)) {
  fail("startup-metrics must not use timed splash dismiss");
}
ok("startup metrics App Ready contract");

// --- Single intro source ---
const markup = read("lib/startup/startup-shell-markup.ts");
if (!markup.includes("buildStartupBootDocumentHtml") || !markup.includes("buildStartupIntroMarkup")) {
  fail("startup-shell-markup must export boot + intro builders");
}
const layout = read("app/layout.tsx");
if (!layout.includes("buildStartupIntroMarkup")) fail("layout must use startup-shell-markup");
if (!layout.includes("STARTUP_HANDOFF_SESSION_KEY") && !layout.includes("dibay:startup:handoff")) {
  fail("layout must suppress intro on handoff flag");
}
if (layout.includes("DibayColdBootIntro") || layout.includes("dibay-cold-boot-intro")) {
  fail("layout must not retain legacy cold-boot intro");
}
ok("single intro source + handoff suppress");

// --- Legacy purge ---
const legacy = [
  "lib/app-boot/cold-boot-intro-config.ts",
  "lib/app-boot/cold-boot-intro-client.ts",
  "lib/app-boot/cold-boot-intro-db.ts",
  "lib/app-boot/cold-boot-constants.ts",
  "lib/app-boot/cold-boot-detect.ts",
  "lib/app-boot/dibay-boot-metrics.ts",
  "components/app/DibayColdBootIntro.tsx",
  "app/api/app/cold-boot-intro/route.ts",
  "app/api/admin/cold-boot-intro/route.ts",
  "components/admin/settings/ColdBootIntroAdminPage.tsx",
  "app/admin/settings/cold-boot-intro/page.tsx",
  "scripts/verify-cold-boot-shell-cache-first.cjs",
];
for (const rel of legacy) {
  if (exists(rel)) fail(`legacy file still present: ${rel}`);
}
ok("legacy cold-boot files removed");

console.log("[verify:startup-architecture] PASS");

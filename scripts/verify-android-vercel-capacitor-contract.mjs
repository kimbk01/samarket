#!/usr/bin/env node
/**
 * Android APK (Capacitor remote WebView) ↔ Vercel origin 계약 검증.
 *
 * Usage:
 *   npm run verify:android-vercel-capacitor-contract
 *   SAMARKET_BASE_URL=https://samarket.vercel.app npm run verify:android-vercel-capacitor-contract
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

function readJson(relPath) {
  try {
    return JSON.parse(read(relPath));
  } catch {
    return null;
  }
}

const PRODUCTION_ORIGIN = "https://samarket.vercel.app";
const expectedOrigin = (
  process.env.CAPACITOR_SERVER_URL?.trim() ||
  process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
  process.env.SAMARKET_BASE_URL?.trim() ||
  PRODUCTION_ORIGIN
)
  .replace(/\/$/, "")
  .split("?")[0]
  .split("#")[0];

const capacitorTs = read("capacitor.config.ts");
const serverUrlModule = read("lib/platform/capacitor-server-url.ts");
const runtimeTs = read("lib/env/runtime.ts");
const androidJson = readJson("android/app/src/main/assets/capacitor.config.json");
const iosJson = readJson("ios/App/App/capacitor.config.json");
const mainActivity = read("android/app/src/main/java/com/dibay/app/MainActivity.java");

if (!serverUrlModule.includes(`export const DIBAY_PRODUCTION_SITE_ORIGIN = "${PRODUCTION_ORIGIN}"`)) {
  failures.push("lib/platform/capacitor-server-url.ts must define DIBAY_PRODUCTION_SITE_ORIGIN");
}

if (!capacitorTs.includes("lib/platform/capacitor-server-url")) {
  failures.push("capacitor.config.ts must resolve server.url from lib/platform/capacitor-server-url");
}

if (!runtimeTs.includes("DIBAY_PRODUCTION_SITE_ORIGIN")) {
  failures.push("lib/env/runtime.ts getSiteOrigin must fall back to DIBAY_PRODUCTION_SITE_ORIGIN on Vercel production");
}

for (const [label, json] of [
  ["android/app/src/main/assets/capacitor.config.json", androidJson],
  ["ios/App/App/capacitor.config.json", iosJson],
]) {
  if (!json) {
    failures.push(`${label} missing or invalid — run npm run cap:sync:vercel`);
    continue;
  }
  const url = String(json?.server?.url ?? "");
  if (!url || url.includes("?") || url.includes("dibay_app")) {
    failures.push(`${label} server.url must be origin-only (no query)`);
  }
  if (url !== expectedOrigin) {
    failures.push(`${label} server.url=${url || "(empty)"} expected ${expectedOrigin} — run npm run cap:sync:vercel`);
  }
  if (json.appId !== "com.dibay.app") {
    failures.push(`${label} appId must be com.dibay.app`);
  }
}

if (!mainActivity.includes("mapHttpsDeepLinkToAppPath")) {
  failures.push("MainActivity must map https deep links to in-app paths for Vercel notification URLs");
}

if (!mainActivity.includes("resolveAppPathFromPushExtras")) {
  failures.push("MainActivity must resolve FCM extras (url / link_url_absolute) for Vercel routes");
}

const baseUrl = expectedOrigin;
try {
  const res = await fetch(baseUrl, { method: "HEAD", redirect: "follow" });
  if (!res.ok) {
    failures.push(`Vercel HEAD ${baseUrl} returned ${res.status}`);
  }
} catch (error) {
  failures.push(`Vercel HEAD ${baseUrl} failed: ${error instanceof Error ? error.message : String(error)}`);
}

if (failures.length > 0) {
  console.error("verify-android-vercel-capacitor-contract FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log("verify-android-vercel-capacitor-contract PASS");
console.log(`  origin: ${expectedOrigin}`);
console.log("  APK loads remote WebView — deploy web to Vercel; rebuild APK only for native/plugin changes");

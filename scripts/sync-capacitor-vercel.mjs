#!/usr/bin/env node
/**
 * Capacitor Android/iOS 셸을 Vercel 프로덕션 origin 과 동기화.
 *
 * Usage:
 *   npm run cap:sync:vercel
 *   npm run cap:sync:vercel -- --server-url=https://preview.example.vercel.app
 *   npm run cap:sync:vercel -- --ios
 *
 * NOTE: shell/.env 의 CAPACITOR_SERVER_URL 은 무시한다 (QA 로컬 origin 잔류 방지).
 * 로컬 dev APK: CAPACITOR_SERVER_URL=http://192.168.x.x:3000 npx cap sync android
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { patchIosCapacitorPackageClassList } from "./patch-ios-capacitor-package-class-list.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvFile(relPath) {
  const abs = path.join(ROOT, relPath);
  if (!fs.existsSync(abs)) return;
  for (const line of fs.readFileSync(abs, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

function normalizeCapacitorServerUrl(url) {
  const trimmed = url.trim().replace(/\/$/, "");
  try {
    const parsed = new URL(trimmed);
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return trimmed.split("?")[0].split("#")[0];
  }
}

const DIBAY_PRODUCTION_SITE_ORIGIN = "https://samarket.vercel.app";

function resolveServerUrl(argv) {
  const flag = argv.find((arg) => arg.startsWith("--server-url="));
  if (flag) {
    return normalizeCapacitorServerUrl(flag.slice("--server-url=".length));
  }
  return normalizeCapacitorServerUrl(DIBAY_PRODUCTION_SITE_ORIGIN);
}

function readCapacitorJson(relPath) {
  const abs = path.join(ROOT, relPath);
  if (!fs.existsSync(abs)) return null;
  try {
    return JSON.parse(fs.readFileSync(abs, "utf8"));
  } catch {
    return null;
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env.vercel.production");

const includeIos = process.argv.includes("--ios");
const serverUrl = resolveServerUrl(process.argv);
process.env.CAPACITOR_SERVER_URL = serverUrl;

console.log(`[capacitor-vercel] server.url=${serverUrl}`);

console.log(`[capacitor-vercel] build Local Boot Shell HTML`);
{
  const build = spawnSync("node", ["scripts/build-startup-shell.mjs", `--origin=${serverUrl}`], {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });
  if (build.status !== 0) {
    process.exit(build.status ?? 1);
  }
  const buildLocal = spawnSync("node", ["scripts/build-local-runtime.mjs", `--origin=${serverUrl}`], {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });
  if (buildLocal.status !== 0) {
    process.exit(buildLocal.status ?? 1);
  }
}

const ping = await fetch(serverUrl, { method: "HEAD", redirect: "follow" }).catch(() => null);
if (!ping || !ping.ok) {
  console.warn(
    `[capacitor-vercel] WARN: ${serverUrl} HEAD failed (${ping?.status ?? "network"}) — sync continues; check Vercel deploy`,
  );
} else {
  console.log(`[capacitor-vercel] Vercel reachable (${ping.status})`);
}

const targets = includeIos ? ["android", "ios"] : ["android"];
for (const platform of targets) {
  console.log(`[capacitor-vercel] npx cap sync ${platform}`);
  const result = spawnSync("npx", ["cap", "sync", platform], {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
  if (platform === "ios") {
    const patch = patchIosCapacitorPackageClassList();
    if (patch.changed) {
      console.log(
        `[capacitor-vercel] patched ios packageClassList (${patch.before.length} -> ${patch.after.length})`,
      );
    }
  }
}

const androidJson = readCapacitorJson("android/app/src/main/assets/capacitor.config.json");
const androidUrl = androidJson?.server?.url ?? "";
const localRuntimeOn = ["1", "true", "on"].includes(
  (process.env.DIBAY_LOCAL_RUNTIME ?? "").trim().toLowerCase()
);
if (localRuntimeOn) {
  if (androidUrl) {
    console.error(
      `[capacitor-vercel] FAIL: Local Runtime mode requires empty server.url, got=${androidUrl}`,
    );
    process.exit(1);
  }
  console.log("[capacitor-vercel] PASS — Local Runtime mode (no remote document server.url)");
} else if (androidUrl !== serverUrl) {
  console.error(
    `[capacitor-vercel] FAIL: android assets url mismatch expected=${serverUrl} got=${androidUrl || "(missing)"}`,
  );
  process.exit(1);
}

if (includeIos) {
  const iosJson = readCapacitorJson("ios/App/App/capacitor.config.json");
  const iosUrl = iosJson?.server?.url ?? "";
  if (localRuntimeOn) {
    if (iosUrl) {
      console.error(`[capacitor-vercel] FAIL: Local Runtime iOS requires empty server.url, got=${iosUrl}`);
      process.exit(1);
    }
  } else if (iosUrl !== serverUrl) {
    console.error(`[capacitor-vercel] FAIL: ios assets url mismatch expected=${serverUrl} got=${iosUrl || "(missing)"}`);
    process.exit(1);
  }
}

console.log(
  localRuntimeOn
    ? "[capacitor-vercel] PASS — native Local Runtime sync"
    : "[capacitor-vercel] PASS — native capacitor.config.json matches server.url",
);
console.log("[capacitor-vercel] Android Studio: open android/ → Build APK (web changes on Vercel need no APK rebuild)");

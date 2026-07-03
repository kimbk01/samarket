#!/usr/bin/env node
/**
 * Vercel remote WebView APK (debug) — cap sync + contract verify + assembleDebug.
 *
 * Usage:
 *   npm run apk:build:vercel
 *   npm run apk:build:vercel -- --label=outgoing-terminal-sync
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const labelArg = process.argv.find((arg) => arg.startsWith("--label="));
const label = labelArg?.slice("--label=".length)?.trim();

function run(label, cmd, args, opts = {}) {
  console.log(`[apk:vercel] ${label}`);
  const result = spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit", ...opts });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const commit =
  spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT, encoding: "utf8" }).stdout?.trim() ||
  "unknown";

run("cap:sync:vercel", "npm", ["run", "cap:sync:vercel"]);
run("verify:android-vercel-capacitor-contract", "npm", ["run", "verify:android-vercel-capacitor-contract"]);
run("assembleDebug", "bash", ["-lc", "cd android && ./gradlew assembleDebug"]);

const src = path.join(ROOT, "android/app/build/outputs/apk/debug/app-debug.apk");
if (!fs.existsSync(src)) {
  console.error(`[apk:vercel] FAIL missing ${src}`);
  process.exit(1);
}

const baseName = label ? `dibay-${label}-${commit}` : `dibay-vercel-${commit}`;
const dst = path.join(ROOT, "docs/perf", `${baseName}.apk`);
fs.mkdirSync(path.dirname(dst), { recursive: true });
fs.copyFileSync(src, dst);

const config = JSON.parse(
  fs.readFileSync(path.join(ROOT, "android/app/src/main/assets/capacitor.config.json"), "utf8"),
);
const serverUrl = config?.server?.url ?? "";
console.log(`[apk:vercel] PASS server.url=${serverUrl}`);
console.log(`[apk:vercel] artifact=${dst}`);
console.log(`[apk:vercel] install: adb install -r ${dst}`);

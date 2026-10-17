#!/usr/bin/env node
/**
 * Post-build gate: Release AAB must embed capacitor.config.json with Production server.url.
 * Prevents Play uploads that boot to https://localhost/ when assets sync was skipped.
 *
 * Usage:
 *   node scripts/verify-android-aab-capacitor-server-url.mjs <path-to.aab>
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PRODUCTION_ORIGIN = "https://samarket.vercel.app";
const EXPECTED_APP_ID = "com.dibay.app";
const aabPath = path.resolve(process.argv[2] || "");

if (!aabPath || !fs.existsSync(aabPath)) {
  console.error("usage: node scripts/verify-android-aab-capacitor-server-url.mjs <path-to.aab>");
  process.exit(1);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aab-cap-verify-"));
const extractDir = path.join(tmp, "out");
fs.mkdirSync(extractDir, { recursive: true });

try {
  const unzip = spawnSync(
    "unzip",
    ["-o", aabPath, "base/assets/capacitor.config.json", "-d", extractDir],
    { encoding: "utf8" }
  );
  if (unzip.status !== 0) {
    console.error("FAIL: AAB missing base/assets/capacitor.config.json (cap sync was skipped?)");
    console.error(unzip.stderr || unzip.stdout);
    process.exit(1);
  }

  const configPath = path.join(extractDir, "base/assets/capacitor.config.json");
  const json = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const url = String(json?.server?.url ?? "").replace(/\/$/, "");
  const appId = String(json?.appId ?? "");

  if (!url || /localhost/i.test(url)) {
    console.error(`FAIL: AAB server.url is localhost or empty (${url || "(empty)"})`);
    process.exit(1);
  }
  if (url !== PRODUCTION_ORIGIN) {
    console.error(`FAIL: AAB server.url=${url} expected ${PRODUCTION_ORIGIN}`);
    process.exit(1);
  }
  if (appId !== EXPECTED_APP_ID) {
    console.error(`FAIL: AAB appId=${appId || "(empty)"} expected ${EXPECTED_APP_ID}`);
    process.exit(1);
  }

  console.log(`PASS: AAB embeds server.url=${url} appId=${appId}`);
  console.log(`aab=${aabPath}`);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

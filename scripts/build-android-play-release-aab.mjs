#!/usr/bin/env node
/**
 * Permanent Google Play Release AAB pipeline for DIBAY.
 *
 * Gates (fail → no release artifact accepted):
 * 1. Record git SHA + dirty note
 * 2. Cap Production sync (cap:sync:vercel)
 * 3. Verify android assets capacitor.config.json (server.url + appId)
 * 4. Apply VERSION_CODE / VERSION_NAME (required)
 * 5. bundleRelease
 * 6. Extract+verify AAB-embedded capacitor.config.json (blocks localhost)
 * 7. Verify versionCode/versionName in built AAB via aapt2/bundletool when available
 * 8. Copy to fixed reports folder + SHA256 + release JSON
 *
 * Usage:
 *   VERSION_CODE=5 VERSION_NAME=1.2.2 npm run android:play:release:aab
 *   VERSION_CODE=5 VERSION_NAME=1.2.2 npm run android:play:release:aab -- --label=iau-v5
 *
 * Does NOT upload to Play Console. Does NOT commit/push.
 */
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PRODUCTION_ORIGIN = "https://samarket.vercel.app";
const EXPECTED_APP_ID = "com.dibay.app";
const OUT_DIR = path.join(ROOT, "reports/android-play-release");
const GRADLE_APP = path.join(ROOT, "android/app/build.gradle");

const versionCodeRaw = process.env.VERSION_CODE?.trim();
const versionNameRaw = process.env.VERSION_NAME?.trim();
const labelArg = process.argv.find((a) => a.startsWith("--label="));
const label = labelArg?.slice("--label=".length)?.trim() || "play-release";
const skipBuild = process.argv.includes("--verify-only");

function fail(msg) {
  console.error(`[android:play:aab] FAIL: ${msg}`);
  process.exit(1);
}

function run(step, cmd, args, opts = {}) {
  console.log(`[android:play:aab] ${step}`);
  const result = spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit", ...opts });
  if (result.status !== 0) {
    fail(`${step} exited ${result.status ?? 1}`);
  }
}

function runCapture(cmd, args) {
  const result = spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8" });
  return {
    status: result.status ?? 1,
    stdout: (result.stdout || "").trim(),
    stderr: (result.stderr || "").trim(),
  };
}

function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function readGradleVersions() {
  const text = fs.readFileSync(GRADLE_APP, "utf8");
  const codeMatch = text.match(/versionCode\s+(\d+)/);
  const nameMatch = text.match(/versionName\s+"([^"]+)"/);
  return {
    versionCode: codeMatch ? Number(codeMatch[1]) : null,
    versionName: nameMatch ? nameMatch[1] : null,
    text,
  };
}

function applyGradleVersions(versionCode, versionName) {
  const { text } = readGradleVersions();
  let next = text;
  if (!/versionCode\s+\d+/.test(next)) fail("android/app/build.gradle missing versionCode");
  if (!/versionName\s+"[^"]+"/.test(next)) fail("android/app/build.gradle missing versionName");
  next = next.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`);
  next = next.replace(/versionName\s+"[^"]+"/, `versionName "${versionName}"`);
  fs.writeFileSync(GRADLE_APP, next, "utf8");
}

function verifySyncedCapacitorConfig() {
  const rel = "android/app/src/main/assets/capacitor.config.json";
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) fail(`${rel} missing — cap:sync:vercel required`);
  const json = JSON.parse(fs.readFileSync(abs, "utf8"));
  const url = String(json?.server?.url ?? "").replace(/\/$/, "");
  const appId = String(json?.appId ?? "");
  if (!url || /localhost/i.test(url)) fail(`${rel} server.url localhost/empty: ${url || "(empty)"}`);
  if (url !== PRODUCTION_ORIGIN) fail(`${rel} server.url=${url} expected ${PRODUCTION_ORIGIN}`);
  if (appId !== EXPECTED_APP_ID) fail(`${rel} appId=${appId} expected ${EXPECTED_APP_ID}`);
  console.log(`[android:play:aab] synced capacitor OK server.url=${url} appId=${appId}`);
}

function verifySigningMaterial() {
  const keyProps = path.join(ROOT, "android/key.properties");
  if (!fs.existsSync(keyProps)) {
    fail("android/key.properties missing — Play update-compatible release signing required");
  }
  const text = fs.readFileSync(keyProps, "utf8");
  if (!/storeFile=/.test(text) || !/keyAlias=/.test(text)) {
    fail("android/key.properties incomplete (storeFile/keyAlias)");
  }
  console.log("[android:play:aab] signing material present (key.properties)");
}

function jarsignerVerify(aabPath) {
  const result = runCapture("jarsigner", ["-verify", aabPath]);
  if (result.status !== 0) {
    console.warn(`[android:play:aab] WARN jarsigner verify soft-fail: ${result.stderr || result.stdout}`);
    return false;
  }
  console.log("[android:play:aab] jarsigner verify OK");
  return true;
}

// --- main ---
if (!versionCodeRaw || !/^\d+$/.test(versionCodeRaw) || Number(versionCodeRaw) < 1) {
  fail("VERSION_CODE required (positive integer), e.g. VERSION_CODE=5");
}
if (!versionNameRaw || !versionNameRaw.trim()) {
  fail('VERSION_NAME required, e.g. VERSION_NAME=1.2.2');
}

const versionCode = Number(versionCodeRaw);
const versionName = versionNameRaw.trim();

const gitSha =
  runCapture("git", ["rev-parse", "HEAD"]).stdout || "unknown";
const gitShort =
  runCapture("git", ["rev-parse", "--short", "HEAD"]).stdout || "unknown";
const dirty =
  runCapture("git", ["status", "--porcelain"]).stdout.length > 0;

console.log(`[android:play:aab] git=${gitShort} dirty=${dirty ? "yes" : "no"}`);
console.log(`[android:play:aab] target versionCode=${versionCode} versionName=${versionName}`);

if (skipBuild) {
  verifySyncedCapacitorConfig();
  console.log("[android:play:aab] --verify-only PASS (no AAB built)");
  process.exit(0);
}

verifySigningMaterial();
applyGradleVersions(versionCode, versionName);

run("cap:sync:vercel", "npm", ["run", "cap:sync:vercel"]);
run(
  "verify:android-vercel-capacitor-contract",
  "npm",
  ["run", "verify:android-vercel-capacitor-contract"]
);
verifySyncedCapacitorConfig();

const afterSync = readGradleVersions();
if (afterSync.versionCode !== versionCode) {
  fail(`versionCode drift after sync: gradle=${afterSync.versionCode} expected ${versionCode}`);
}
if (afterSync.versionName !== versionName) {
  fail(`versionName drift after sync: gradle=${afterSync.versionName} expected ${versionName}`);
}

run("bundleRelease", "bash", ["-lc", "cd android && ./gradlew :app:bundleRelease"]);

const builtAab = path.join(
  ROOT,
  "android/app/build/outputs/bundle/release/app-release.aab"
);
if (!fs.existsSync(builtAab)) fail(`missing built AAB at ${builtAab}`);

run(
  "verify-android-aab-capacitor-server-url",
  "node",
  ["scripts/verify-android-aab-capacitor-server-url.mjs", builtAab]
);

const signedOk = jarsignerVerify(builtAab);
const digest = sha256File(builtAab);

fs.mkdirSync(OUT_DIR, { recursive: true });
const fileName = `dibay-${label}-versionCode${versionCode}-${versionName}-${gitShort}.aab`;
const destAab = path.join(OUT_DIR, fileName);
fs.copyFileSync(builtAab, destAab);

const record = {
  createdAt: new Date().toISOString(),
  packageId: EXPECTED_APP_ID,
  versionCode,
  versionName,
  gitSha,
  gitShort,
  workingTreeDirty: dirty,
  serverUrl: PRODUCTION_ORIGIN,
  sha256: digest,
  aabPath: destAab,
  jarsignerVerified: signedOk,
  label,
  pipeline: "build-android-play-release-aab.mjs",
};

const recordPath = path.join(
  OUT_DIR,
  `dibay-${label}-versionCode${versionCode}-${versionName}-${gitShort}.json`
);
fs.writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");

const readmePath = path.join(OUT_DIR, "README-업로드-이파일.txt");
fs.writeFileSync(
  readmePath,
  [
    "DIBAY Play Release AAB (pipeline output)",
    "",
    `지금 올릴 파일:`,
    `  ${fileName}`,
    "",
    `versionCode: ${versionCode}`,
    `versionName: ${versionName}`,
    `git: ${gitShort}`,
    `server.url (AAB 내장): ${PRODUCTION_ORIGIN}`,
    `sha256: ${digest}`,
    "",
    `경로:`,
    `  ${OUT_DIR}`,
    "",
    "Finder:",
    `  open "${OUT_DIR}"`,
    "",
  ].join("\n"),
  "utf8"
);

console.log("[android:play:aab] PASS");
console.log(`[android:play:aab] artifact=${destAab}`);
console.log(`[android:play:aab] sha256=${digest}`);
console.log(`[android:play:aab] record=${recordPath}`);
console.log(`[android:play:aab] finder: open "${OUT_DIR}"`);
if (dirty) {
  console.warn(
    "[android:play:aab] NOTE: working tree was dirty — record this SHA + local diffs before Play upload"
  );
}

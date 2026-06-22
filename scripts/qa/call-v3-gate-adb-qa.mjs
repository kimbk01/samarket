#!/usr/bin/env node
/**
 * V3 Safe Lane gate — Vercel APK only.
 * Login aaaa(A) / qqqq(B), open /community-messenger, assert [DIBAY_CALL_V3] provider_ready.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { ensureApkWebViewLogin, DIBAY_PKG } from "./lib/apk-webview-cdp.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ADB = process.env.ADB_PATH || `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`;
const PKG = DIBAY_PKG;
const ACT = `${PKG}/.MainActivity`;
const SERIAL_A = process.env.P4_DEVICE_A?.trim() || "8b37179f7d94";
const SERIAL_B = process.env.P4_DEVICE_B?.trim() || "RFCY40PY2CA";
const VERCEL = process.env.CAPACITOR_SERVER_URL?.trim() || "https://samarket.vercel.app";
const PASSWORD = process.env.E2E_TEST_PASSWORD?.trim() || "1234";
const LOGIN_A = "aaaa";
const LOGIN_B = "qqqq";
const CDP_A = Number(process.env.P4_CDP_PORT_A || 9223);
const CDP_B = Number(process.env.P4_CDP_PORT_B || 9224);

function adbObj(serial, ...args) {
  return spawnSync(ADB, ["-s", serial, ...args], { encoding: "utf8" });
}

function adb(serial, ...args) {
  return adbObj(serial, ...args).stdout ?? "";
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function loadEnvLocal() {
  for (const rel of [".env.local", ".env"]) {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i < 1) continue;
      const k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

async function openMessenger(serial) {
  adbObj(
    serial,
    "shell",
    "am",
    "start",
    "-n",
    ACT,
    "-a",
    "android.intent.action.VIEW",
    "-d",
    `${VERCEL}/community-messenger`,
    "-p",
    PKG
  );
  await sleep(8000);
}

function analyzeLog(text) {
  return {
    hasV3: text.includes("[DIBAY_CALL_V3]"),
    hasProviderReady: text.includes("provider_ready"),
    hasEngine: text.includes("[DIBAY_CALL_ENGINE]"),
    hasTerminal: text.includes("[DIBAY_CALL_TERMINAL_PIPELINE]"),
    v3Lines: text.split("\n").filter((l) => l.includes("[DIBAY_CALL_V3]")).slice(-20),
    engineLines: text.split("\n").filter((l) => l.includes("[DIBAY_CALL_ENGINE]")).slice(-10),
  };
}

async function main() {
  loadEnvLocal();
  const adbFn = (serial, ...args) => adbObj(serial, ...args);

  for (const perm of ["android.permission.RECORD_AUDIO", "android.permission.POST_NOTIFICATIONS"]) {
    adb(SERIAL_A, "shell", "pm", "grant", PKG, perm);
    adb(SERIAL_B, "shell", "pm", "grant", PKG, perm);
  }

  console.log(`[call-v3-gate] login A=${SERIAL_A}(${LOGIN_A}) B=${SERIAL_B}(${LOGIN_B}) origin=${VERCEL}`);

  const loginA = await ensureApkWebViewLogin({
    adb: adbFn,
    chromium,
    serial: SERIAL_A,
    cdpPort: CDP_A,
    act: ACT,
    pkg: PKG,
    prod: VERCEL,
    login: LOGIN_A,
    loadEnv: loadEnvLocal,
    password: PASSWORD,
    log: (m) => console.log(`[call-v3-gate] ${m}`),
    label: "device-A",
    restartForFcm: true,
  });
  const loginB = await ensureApkWebViewLogin({
    adb: adbFn,
    chromium,
    serial: SERIAL_B,
    cdpPort: CDP_B,
    act: ACT,
    pkg: PKG,
    prod: VERCEL,
    login: LOGIN_B,
    loadEnv: loadEnvLocal,
    password: PASSWORD,
    log: (m) => console.log(`[call-v3-gate] ${m}`),
    label: "device-B",
    restartForFcm: true,
  });

  adb(SERIAL_A, "logcat", "-c");
  adb(SERIAL_B, "logcat", "-c");
  await openMessenger(SERIAL_A);
  await openMessenger(SERIAL_B);
  await sleep(5000);

  const logA = adb(SERIAL_A, "logcat", "-d", "-s", "Capacitor/Console:I", "Capacitor/Console:E");
  const logB = adb(SERIAL_B, "logcat", "-d", "-s", "Capacitor/Console:I", "Capacitor/Console:E");
  const a = analyzeLog(logA);
  const b = analyzeLog(logB);

  const prodRoute = spawnSync("curl", ["-sI", `${VERCEL}/community-messenger/calls-v3/gate-probe`], {
    encoding: "utf8",
  }).stdout;
  const callsV3RouteExists = !prodRoute.includes("404") && !prodRoute.includes("x-matched-path: /_not-found");

  const report = {
    vercel: VERCEL,
    callsV3RouteOnProd: callsV3RouteExists,
    loginA: { ok: loginA.ok, userId: loginA.probe?.userId, username: loginA.probe?.username },
    loginB: { ok: loginB.ok, userId: loginB.probe?.userId, username: loginB.probe?.username },
    deviceA: a,
    deviceB: b,
    pass:
      loginA.ok &&
      loginB.ok &&
      a.hasV3 &&
      a.hasProviderReady &&
      b.hasV3 &&
      b.hasProviderReady &&
      !a.hasEngine &&
      !b.hasEngine,
  };

  const outDir = path.join(ROOT, ".qa-logs");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "call-v3-gate-a.log"), logA);
  fs.writeFileSync(path.join(outDir, "call-v3-gate-b.log"), logB);
  fs.writeFileSync(path.join(outDir, "call-v3-gate-report.json"), JSON.stringify(report, null, 2));

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

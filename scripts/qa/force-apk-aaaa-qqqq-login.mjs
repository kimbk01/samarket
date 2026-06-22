#!/usr/bin/env node
/** aaaa(발신기) / qqqq(수신기) APK WebView 세션 강제 고정 — CDP only */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { DIBAY_PKG, ensureApkWebViewLogin } from "./lib/apk-webview-cdp.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ADB = process.env.ADB_PATH || `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`;
const PKG = DIBAY_PKG;
const ACT = `${PKG}/.MainActivity`;
const VERCEL = process.env.CAPACITOR_SERVER_URL?.trim() || "https://samarket.vercel.app";
const PASSWORD = process.env.E2E_TEST_PASSWORD?.trim() || "1234";

const DEVICES = [
  {
    label: "CALLER aaaa",
    serial: process.env.P4_DEVICE_A?.trim() || "8b37179f7d94",
    login: "aaaa",
    expectedUserId: "11111111-1111-1111-1111-111111111111",
    cdpPort: Number(process.env.P4_CDP_PORT_A || 9223),
  },
  {
    label: "CALLEE qqqq",
    serial: process.env.P4_DEVICE_B?.trim() || "RFCY40PY2CA",
    login: "qqqq",
    expectedUserId: "9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8",
    cdpPort: Number(process.env.P4_CDP_PORT_B || 9224),
  },
];

function adb(serial, ...args) {
  return spawnSync(ADB, ["-s", serial, ...args], { encoding: "utf8" });
}

function loadEnv() {
  for (const rel of [".env.local", ".env"]) {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
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

async function main() {
  loadEnv();
  let failed = false;
  for (const d of DEVICES) {
    console.log(`\n=== ${d.label} (${d.serial}) ===`);
    const result = await ensureApkWebViewLogin({
      adb,
      chromium,
      serial: d.serial,
      cdpPort: d.cdpPort,
      act: ACT,
      pkg: PKG,
      prod: VERCEL,
      login: d.login,
      expectedUserId: d.expectedUserId,
      loadEnv,
      password: PASSWORD,
      log: (m) => console.log(m),
      label: d.label,
      restartForFcm: true,
    });
    if (!result.ok) {
      console.error(`FAIL ${d.label}: probe=${JSON.stringify(result.probe)}`);
      failed = true;
      continue;
    }
    const reg = [...result.registerLogcat.matchAll(/"user_id":"([^"]+)"/g)];
    const uid = reg.length ? reg[reg.length - 1][1] : "?";
    console.log(`OK username=${d.login} userId=${result.probe.userId} fcm_user=${uid}`);
    if (uid !== d.expectedUserId) {
      console.error(`FCM MISMATCH expected ${d.expectedUserId} got ${uid}`);
      failed = true;
    }
  }
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

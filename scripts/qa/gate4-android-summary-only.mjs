#!/usr/bin/env node
/**
 * Android summary residual only — number≡A+B + summary_cleared@0 (no OS tap).
 *   GATE4_ORIGIN=https://samarket.vercel.app node scripts/qa/gate4-android-summary-only.mjs
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";
import {
  ensureApkWebViewLogin,
  forwardCdp,
  connectWebView,
  navigateApkWebView,
} from "./lib/apk-webview-cdp.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(
  ROOT,
  `.qa-logs/gate4-android-summary-only-${new Date().toISOString().replace(/[:.]/g, "-")}`
);
fs.mkdirSync(OUT, { recursive: true });
const ORIGIN = (process.env.GATE4_ORIGIN || "https://samarket.vercel.app").replace(/\/$/, "");
const ADB = process.env.ADB_PATH || `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`;
const PKG = "com.dibay.app";
const ACT = `${PKG}/.MainActivity`;
const GD = process.env.P0_DIRECT_ROOM || "b19e2672-f26f-4a2e-8125-52575da4a62a";
const Q = { login: "qqqq", userId: "9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8" };
const DEVICES = [
  { label: "samsung", serial: process.env.GATE4_SAMSUNG || "RFCY40PY2CA", cdp: 9561 },
  { label: "xiaomi", serial: process.env.GATE4_XIAOMI || "8b37179f7d94", cdp: 9562 },
];

function loadEnv() {
  for (const rel of [".env.local", ".env"]) {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#") || !t.includes("=")) continue;
      const i = t.indexOf("=");
      const k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!process.env[k]) process.env[k] = v;
    }
  }
}
const log = (l) => {
  console.log(`[aso] ${l}`);
  fs.appendFileSync(path.join(OUT, "run.log"), `[aso] ${l}\n`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const n = (v) => Math.max(0, Math.floor(Number(v) || 0));
const adb = (s, ...a) => spawnSync(ADB, s ? ["-s", s, ...a] : a, { encoding: "utf8" });

async function cookie(login) {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  let session = null;
  for (const email of [`${login}@manual.local`, `${login}@dibay.local`]) {
    for (const pass of [
      process.env.E2E_TEST_PASSWORD,
      process.env.QA_MANUAL_PASSWORD,
      "DibayQa1!",
      "1234",
    ].filter(Boolean)) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
      if (!error && data.session) {
        session = data.session;
        break;
      }
    }
    if (session) break;
  }
  if (!session) throw new Error("signin " + login);
  const ref = url.match(/https:\/\/([^.]+)\./)?.[1] ?? "";
  let c = `sb-${ref}-auth-token=${encodeURIComponent(
    JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      expires_in: session.expires_in,
      token_type: session.token_type,
      user: session.user,
    })
  )}`;
  if (sk) {
    const admin = createClient(url, sk, { auth: { persistSession: false } });
    const { data: pr } = await admin
      .from("profiles")
      .select("active_session_id")
      .eq("id", session.user.id)
      .maybeSingle();
    if (pr?.active_session_id) {
      c += `; samarket_active_session_id=${encodeURIComponent(pr.active_session_id)}`;
    }
  }
  return { cookie: c, userId: session.user.id };
}

async function api(p, auth, init = {}) {
  const res = await fetch(`${ORIGIN}${p}`, {
    ...init,
    headers: {
      cookie: auth.cookie,
      accept: "application/json",
      "content-type": "application/json",
      ...(init.headers || {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

function eq(b) {
  const A = n(b?.memberUnreadNotificationCount ?? b?.projection?.bellTotal);
  const B = n(b?.memberConversationUnreadRooms ?? b?.memberUnreadRoomCount);
  const appIcon = n(b?.memberAppIconAuthority?.appIconTotal ?? b?.projection?.appIconTotal);
  return { A, B, appIcon, iconEqOk: appIcon === A + B };
}

async function snap(auth) {
  const r = await api("/api/me/notifications/badge-count?fresh=1", auth);
  return { status: r.status, ...eq(r.json) };
}

async function waitEq(auth, pred, t = 20000) {
  const t0 = Date.now();
  let last = await snap(auth);
  while (Date.now() - t0 < t) {
    if (pred(last)) return last;
    await sleep(700);
    last = await snap(auth);
  }
  return last;
}

function parse(serial) {
  // Samsung/Xiaomi NotificationRecord headers exceed ~900 chars before `number=`.
  // Narrow window falsely yields present:false → PASS_OEM_HIDDEN (not product proof).
  const text = adb(serial, "shell", "dumpsys", "notification", "--noredact").stdout || "";
  const nums = [
    ...text.matchAll(/NotificationRecord\([^\n]*id=710001[\s\S]{0,4000}?\bnumber=(-?\d+)/g),
  ].map((m) => Number(m[1]));
  return { present: nums.length > 0, number: nums.length ? nums[nums.length - 1] : null, nums };
}

async function withPage(device, fn) {
  adb(device.serial, "shell", "am", "start", "-n", ACT);
  await sleep(2500);
  forwardCdp(adb, device.serial, device.cdp);
  const { browser, page } = await connectWebView(chromium, device.cdp);
  try {
    await navigateApkWebView(page, `${ORIGIN}/community-messenger`, 4000);
    return await fn(page);
  } finally {
    await browser.close().catch(() => {});
  }
}

async function apply(page, count) {
  return page.evaluate(async (c) => {
    const p = window.Capacitor?.Plugins?.DibayAppIconDelivery;
    if (!p?.apply) return { ok: false, error: "no_plugin" };
    return { ok: true, r: await p.apply({ count: c }) };
  }, count);
}

async function runDevice(device, receiver, sender) {
  log(`=== ${device.label} ===`);
  const login = await ensureApkWebViewLogin({
    adb,
    chromium,
    serial: device.serial,
    cdpPort: device.cdp,
    act: ACT,
    pkg: PKG,
    prod: ORIGIN,
    login: Q.login,
    expectedUserId: Q.userId,
    loadEnv,
    password: process.env.E2E_TEST_PASSWORD || process.env.QA_MANUAL_PASSWORD || "1234",
    log,
    label: device.label,
    restartForFcm: true,
  });
  if (!login.ok) return { status: "FAIL", reason: "login" };

  await api(`/api/community-messenger/rooms/${GD}`, receiver, {
    method: "PATCH",
    body: JSON.stringify({ action: "mark_read", flushOpen: true }),
  });
  await sleep(800);
  const before = await snap(receiver);
  adb(device.serial, "shell", "input", "keyevent", "3");
  await sleep(600);
  await api(`/api/community-messenger/rooms/${GD}/messages`, sender, {
    method: "POST",
    body: JSON.stringify({
      content: `ASO-${device.label}-${Date.now()}`,
      clientMessageId: `aso-${Date.now()}`,
    }),
  });
  const afterSend = await waitEq(receiver, (s) => s.B >= before.B + 1);

  let sumSend = null;
  await withPage(device, async (page) => {
    await apply(page, afterSend.appIcon);
    await sleep(800);
    sumSend = parse(device.serial);
  });

  await api(`/api/community-messenger/rooms/${GD}`, receiver, {
    method: "PATCH",
    body: JSON.stringify({ action: "mark_read", flushOpen: true }),
  });
  const afterAck = await waitEq(receiver, (s) => s.B <= before.B);

  let sumAck = null;
  let sum0 = null;
  let sawCleared = false;
  let sumRest = null;
  await withPage(device, async (page) => {
    await apply(page, afterAck.appIcon);
    await sleep(800);
    sumAck = parse(device.serial);
    adb(device.serial, "logcat", "-c");
    await apply(page, 0);
    await sleep(350);
    sum0 = parse(device.serial);
    const lg = adb(device.serial, "shell", "logcat", "-d", "-s", "DIBAY_APPICON_DELIVERY").stdout || "";
    sawCleared = /summary_cleared total=0/.test(lg);
    await apply(page, afterAck.appIcon);
    await sleep(800);
    sumRest = parse(device.serial);
  });

  const recomputeSend =
    afterSend.appIcon > 0
      ? sumSend.present && sumSend.number === afterSend.appIcon
      : !sumSend.present;
  const recomputeAck =
    afterAck.appIcon > 0 ? sumAck.present && sumAck.number === afterAck.appIcon : !sumAck.present;
  const clearAt0 = sawCleared && (afterAck.appIcon === 0 ? !sum0.present : true);
  const restoreOk =
    afterAck.appIcon > 0
      ? sumRest.present && sumRest.number === afterAck.appIcon
      : !sumRest.present;
  const status =
    recomputeSend && recomputeAck && clearAt0 && restoreOk && afterSend.iconEqOk && afterAck.iconEqOk
      ? "PASS"
      : "FAIL";

  return {
    status,
    before,
    afterSend,
    afterAck,
    sumSend,
    sumAck,
    sum0,
    sumRest,
    sawCleared,
    checks: {
      recomputeSend,
      recomputeAck,
      sawCleared,
      clearAt0,
      restoreOk,
      iconEq: afterSend.iconEqOk && afterAck.iconEqOk,
    },
  };
}

async function main() {
  loadEnv();
  const receiver = await cookie("qqqq");
  const sender = await cookie("aaaa");
  const report = { out: OUT, devices: {} };
  for (const d of DEVICES) {
    try {
      report.devices[d.label] = await runDevice(d, receiver, sender);
    } catch (e) {
      report.devices[d.label] = { status: "FAIL", error: String(e) };
    }
    log(`${d.label} ${report.devices[d.label].status}`);
  }
  const androidPass = DEVICES.every((d) => report.devices[d.label]?.status === "PASS");
  report.BOARD = { Android_summary_residual: androidPass ? "PASS" : "OPEN", HARD_LOCK: "NO" };
  fs.writeFileSync(path.join(OUT, "REPORT.json"), JSON.stringify(report, null, 2));
  log(`BOARD ${JSON.stringify(report.BOARD)}`);
  process.exit(androidPass ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

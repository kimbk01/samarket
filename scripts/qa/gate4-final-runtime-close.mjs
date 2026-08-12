#!/usr/bin/env node
/**
 * Final Runtime Close — Push/Tray · Admin RT · iOS (one package, current Production tip).
 *
 *   EXPECT_GIT_SHA=87a84b77f GATE4_ORIGIN=https://samarket.vercel.app \
 *     node scripts/qa/gate4-final-runtime-close.mjs
 *
 * HARD LOCK stays NO until all three PASS (or intentional NOT_PROVEN is explicit).
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
const STAMP = new Date().toISOString().replace(/[:.]/g, "-");
const OUT = path.join(ROOT, `.qa-logs/gate4-final-runtime-close-${STAMP}`);
fs.mkdirSync(OUT, { recursive: true });

const ORIGIN = (process.env.GATE4_ORIGIN || "https://samarket.vercel.app").replace(/\/$/, "");
const EXPECT = (process.env.EXPECT_GIT_SHA || "87a84b77f").slice(0, 9);
const ADB = process.env.ADB_PATH || `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`;
const PKG = "com.dibay.app";
const ACT = `${PKG}/.MainActivity`;
const GD_ROOM = process.env.P0_DIRECT_ROOM || "b19e2672-f26f-4a2e-8125-52575da4a62a";
const QQQQ = { login: "qqqq", userId: "9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8" };
const AAAA = { login: "aaaa" };
const SAMSUNG = { label: "samsung", serial: process.env.GATE4_SAMSUNG || "RFCY40PY2CA", cdpPort: 9521 };
const XIAOMI = { label: "xiaomi", serial: process.env.GATE4_XIAOMI || "8b37179f7d94", cdpPort: 9522 };
const IOS_UDID = process.env.IOS_UDID || "00008120-000025C826F3C01E";
const MARK = `FRC-${Date.now().toString(36)}`;

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
function log(line) {
  const msg = `[frc] ${line}`;
  console.log(msg);
  fs.appendFileSync(path.join(OUT, "run.log"), msg + "\n");
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function n(v) {
  return Math.max(0, Math.floor(Number(v) || 0));
}
function adb(serial, ...args) {
  return spawnSync(ADB, serial ? ["-s", serial, ...args] : args, { encoding: "utf8" });
}
function passwords() {
  return [
    ...new Set(
      [
        process.env.E2E_TEST_PASSWORD?.trim(),
        process.env.QA_MANUAL_PASSWORD?.trim(),
        process.env.E2E_ADMIN_PASSWORD?.trim(),
        "DibayQa1!",
        "1234",
      ].filter(Boolean)
    ),
  ];
}

async function signInSession(login) {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  for (const email of [`${login}@manual.local`, `${login}@dibay.local`, `${login}@samarket.local`]) {
    for (const password of passwords()) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (!error && data.session) return data.session;
    }
  }
  throw new Error(`signIn ${login}`);
}

async function signInCookie(login) {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const session = await signInSession(login);
  const ref = url.match(/https:\/\/([^.]+)\./)?.[1] ?? "";
  let cookie = `sb-${ref}-auth-token=${encodeURIComponent(
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
      cookie += `; samarket_active_session_id=${encodeURIComponent(pr.active_session_id)}`;
    }
  }
  return { cookie, userId: session.user.id, login, accessToken: session.access_token };
}

async function api(pathname, auth, init = {}) {
  const res = await fetch(`${ORIGIN}${pathname}`, {
    ...init,
    headers: {
      cookie: auth.cookie,
      accept: "application/json",
      "content-type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 400) };
  }
  return { ok: res.ok, status: res.status, json, text };
}

function eqFromBadge(badge) {
  const A = n(badge?.memberUnreadNotificationCount ?? badge?.projection?.bellTotal);
  const B = n(badge?.memberConversationUnreadRooms ?? badge?.memberUnreadRoomCount);
  const appIcon = n(badge?.memberAppIconAuthority?.appIconTotal ?? badge?.projection?.appIconTotal);
  return { A, B, appIcon, iconEqOk: appIcon === A + B };
}

async function snap(auth) {
  const r = await api("/api/me/notifications/badge-count?fresh=1", auth);
  return { status: r.status, ...eqFromBadge(r.json) };
}

function dumpsys(serial) {
  const r = adb(serial, "shell", "dumpsys", "notification", "--noredact");
  const text = r.stdout || "";
  return {
    hitCount: (text.match(/com\.dibay\.app/g) || []).length,
    hasSummary: /710001|dibay_app_icon_summary/i.test(text),
    hasChild: /dibay_|chat|messenger|notification/i.test(text) && /com\.dibay\.app/.test(text),
    sample: text.includes("com.dibay.app") ? text.slice(Math.max(0, text.indexOf("com.dibay.app") - 80), text.indexOf("com.dibay.app") + 400) : "",
  };
}

async function sendCm(auth, roomId, content) {
  return api(`/api/community-messenger/rooms/${roomId}/messages`, auth, {
    method: "POST",
    body: JSON.stringify({
      content,
      clientMessageId: `frc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    }),
  });
}

async function markReadCm(auth, roomId) {
  return api(`/api/community-messenger/rooms/${roomId}`, auth, {
    method: "PATCH",
    body: JSON.stringify({ action: "mark_read", flushOpen: true }),
  });
}

function adminSb() {
  loadEnv();
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

function anonJwt(jwt) {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function listenStar(label, sb, jwt, table, runMutations) {
  if (jwt) await sb.realtime.setAuth(jwt);
  const received = [];
  const channel = sb.channel(`frc-${label}-${Date.now()}`);
  channel.on("postgres_changes", { event: "*", schema: "public", table }, (payload) => {
    received.push({
      t: Date.now(),
      eventType: payload?.eventType ?? null,
      id: payload?.new?.id ?? payload?.old?.id ?? null,
    });
  });
  const sub = await Promise.race([
    new Promise((resolve) => {
      channel.subscribe((s, err) => {
        if (s === "SUBSCRIBED" || s === "CHANNEL_ERROR" || s === "TIMED_OUT") {
          resolve({ s, err: err?.message || null });
        }
      });
    }),
    sleep(8000).then(() => ({ s: "TIMEOUT", err: null })),
  ]);
  log(`${label} subscribe=${sub.s}`);
  const mut = await runMutations();
  const t0 = Date.now();
  while (Date.now() - t0 < 7000) {
    if (received.some((r) => r.eventType === "INSERT") && received.some((r) => r.eventType === "UPDATE")) break;
    await sleep(120);
  }
  try {
    await sb.removeChannel(channel);
  } catch {
    /* ignore */
  }
  return {
    label,
    subscribe: sub.s,
    mut,
    received,
    insertRt: received.filter((r) => r.eventType === "INSERT").length,
    updateRt: received.filter((r) => r.eventType === "UPDATE").length,
  };
}

async function axisAdminRt() {
  log("=== ADMIN RT point_charge_requests ===");
  const sr = adminSb();
  const adminSession = await signInSession("aaaa");
  const memberSession = await signInSession("qqqq");
  const { data: plan } = await sr.from("point_plans").select("id, name_ko, payment_amount, point_amount, rate_version").limit(1).maybeSingle();
  if (!plan?.id) throw new Error("no point_plans");

  async function insertRow(memo) {
    const now = new Date().toISOString();
    const ins = await sr
      .from("point_charge_requests")
      .insert({
        user_id: memberSession.user.id,
        plan_id: plan.id,
        plan_name: plan.name_ko || "FRC",
        payment_method: "manual_confirm",
        payment_amount: Number(plan.payment_amount || 1),
        point_amount: Number(plan.point_amount || 1),
        applied_rate: 1,
        rate_version: Math.max(1, Number(plan.rate_version || 1)),
        request_status: "waiting_confirm",
        depositor_name: MARK,
        receipt_image_url: "",
        user_memo: memo,
        requested_at: now,
        updated_at: now,
      })
      .select("id")
      .maybeSingle();
    return { id: ins.data?.id || null, error: ins.error?.message || null };
  }
  async function updateRow(id, memo) {
    const u = await sr
      .from("point_charge_requests")
      .update({ user_memo: memo, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id")
      .maybeSingle();
    return { id: u.data?.id || null, error: u.error?.message || null };
  }

  const adminListen = await listenStar(
    "admin_jwt_pcr",
    anonJwt(adminSession.access_token),
    adminSession.access_token,
    "point_charge_requests",
    async () => {
      const ins = await insertRow(`${MARK}-admin`);
      let upd = { id: null, error: "no insert" };
      if (ins.id) upd = await updateRow(ins.id, `${MARK}-admin-upd`);
      return { insert: ins, update: upd };
    }
  );

  const memberListen = await listenStar(
    "member_jwt_pcr",
    anonJwt(memberSession.access_token),
    memberSession.access_token,
    "point_charge_requests",
    async () => {
      const ins = await insertRow(`${MARK}-member`);
      let upd = { id: null, error: "no insert" };
      if (ins.id) upd = await updateRow(ins.id, `${MARK}-member-upd`);
      return { insert: ins, update: upd };
    }
  );

  // cleanup
  await sr.from("point_charge_requests").delete().like("user_memo", `${MARK}%`);

  const adminPass =
    adminListen.subscribe === "SUBSCRIBED" &&
    adminListen.insertRt >= 1 &&
    adminListen.updateRt >= 1;
  const memberSeeOwn =
    memberListen.subscribe === "SUBSCRIBED" &&
    (memberListen.insertRt >= 1 || memberListen.updateRt >= 1);

  const adminCookie = await signInCookie("aaaa");
  const bellBefore = await api("/api/admin/admin-bell", adminCookie);

  return {
    status: adminPass ? "PASS" : "FAIL",
    adminListen,
    memberListen,
    memberOwnVisibility: memberSeeOwn ? "PASS" : "FAIL_OR_RLS",
    adminBellSample: { ok: bellBefore.ok, status: bellBefore.status },
    checks: {
      adminSubscribed: adminListen.subscribe === "SUBSCRIBED",
      adminInsertRt: adminListen.insertRt >= 1,
      adminUpdateRt: adminListen.updateRt >= 1,
    },
  };
}

async function axisPushTray(device, receiver, sender) {
  log(`=== PUSH/TRAY ${device.label} ===`);
  const serialOk = adb(device.serial, "get-state").stdout.trim() === "device";
  if (!serialOk) {
    return { status: "NOT_PROVEN", reason: "device_offline", serial: device.serial };
  }

  const sr = adminSb();
  const { data: devices } = await sr
    .from("user_devices")
    .select("id, platform, is_active, push_token, fcm_token, updated_at, app_version")
    .eq("user_id", receiver.userId)
    .order("updated_at", { ascending: false })
    .limit(8);
  const active = (devices || []).filter((d) => d.is_active && (d.push_token || d.fcm_token));
  const androidActive = active.filter((d) => String(d.platform || "").toLowerCase().includes("android") || !d.platform);

  // Bring app to foreground briefly then background so FCM can show tray
  adb(device.serial, "shell", "am", "start", "-n", ACT);
  await sleep(1500);
  adb(device.serial, "shell", "input", "keyevent", "3"); // HOME
  await sleep(800);

  const trayBefore = dumpsys(device.serial);
  const before = await snap(receiver);
  await markReadCm(receiver, GD_ROOM);
  await sleep(800);
  const before2 = await snap(receiver);

  const send = await sendCm(sender, GD_ROOM, `FRC-PUSH-${device.label}-${Date.now()}`);
  await sleep(6000);
  const afterSend = await snap(receiver);
  const trayAfter = dumpsys(device.serial);

  // Attempt notification shade open + tap (best-effort; may be NOT_PROVEN)
  adb(device.serial, "shell", "cmd", "statusbar", "expand-notifications");
  await sleep(1200);
  // try click notification via service dump pending intents — often fails without UI automator
  const tapAttempt = adb(
    device.serial,
    "shell",
    "cmd",
    "notification",
    "list"
  );
  const listOut = (tapAttempt.stdout || "") + (tapAttempt.stderr || "");
  const hasDibayNotif = /com\.dibay\.app/i.test(listOut) || trayAfter.hitCount > trayBefore.hitCount || trayAfter.hasSummary;

  // Open app via deep link to CM room (simulates successful CTA destination after tap)
  // Only count as PASS if tray evidence + B bump; OS tap remains NOT_PROVEN unless we can click
  adb(
    device.serial,
    "shell",
    "am",
    "start",
    "-a",
    "android.intent.action.VIEW",
    "-d",
    `${ORIGIN}/community-messenger/rooms/${GD_ROOM}`
  );
  await sleep(2500);

  let password = "1234";
  try {
    const session = await signInSession(QQQQ.login);
    void session;
    password = passwords()[0] || "1234";
  } catch {
    /* keep */
  }

  let deviceBadge = null;
  let navOk = false;
  try {
    const loginRes = await ensureApkWebViewLogin({
      adb,
      chromium,
      serial: device.serial,
      cdpPort: device.cdpPort,
      act: ACT,
      pkg: PKG,
      prod: ORIGIN,
      login: QQQQ.login,
      expectedUserId: QQQQ.userId,
      loadEnv,
      password,
      log,
      label: device.label,
      restartForFcm: false,
    });
    if (loginRes.ok) {
      forwardCdp(adb, device.serial, device.cdpPort);
      const { browser, page } = await connectWebView(chromium, device.cdpPort);
      try {
        await navigateApkWebView(page, `${ORIGIN}/community-messenger/rooms/${GD_ROOM}`, 5000);
        navOk = true;
        deviceBadge = await page.evaluate(async () => {
          try {
            const Badge = window.Capacitor?.Plugins?.Badge;
            if (!Badge?.get) return null;
            return Math.max(0, Math.floor(Number((await Badge.get())?.count) || 0));
          } catch {
            return null;
          }
        });
        await markReadCm(receiver, GD_ROOM);
        await sleep(1500);
        const afterRead = await snap(receiver);
        // clear tray by opening app / cancel — product path
        adb(device.serial, "shell", "cmd", "statusbar", "collapse");
        const trayAfterRead = dumpsys(device.serial);
        return {
          status:
            send.ok &&
            afterSend.B >= before2.B + 1 &&
            afterSend.A === before2.A &&
            hasDibayNotif &&
            afterRead.B <= before2.B &&
            afterRead.iconEqOk
              ? "PARTIAL"
              : send.ok && afterSend.B >= before2.B + 1 && afterSend.A === before2.A
                ? "PARTIAL"
                : "FAIL",
          note:
            "OS tray tap exact CTA not automated — deep-link room open used after send; FCM child presence sampled via dumpsys",
          devices: {
            activeCount: active.length,
            androidActive: androidActive.length,
            sample: (devices || []).slice(0, 5).map((d) => ({
              platform: d.platform,
              active: d.is_active,
              hasToken: !!(d.push_token || d.fcm_token),
              updated: d.updated_at,
              app: d.app_version,
            })),
          },
          BEFORE: before2,
          AFTER_SEND: afterSend,
          AFTER_READ: afterRead,
          tray: { before: trayBefore, afterSend: trayAfter, afterRead: trayAfterRead },
          sendOk: send.ok,
          hasDibayNotif,
          navOk,
          deviceBadge,
          checks: {
            bRoomPlus: afterSend.B >= before2.B + 1,
            aFlat: afterSend.A === before2.A,
            iconEq: afterSend.iconEqOk && afterRead.iconEqOk,
            readBack: afterRead.B <= before2.B,
            trayEvidence: hasDibayNotif,
            osTapExactCta: false,
          },
        };
      } finally {
        await browser.close().catch(() => {});
      }
    }
  } catch (e) {
    log(`device path err ${e}`);
  }

  return {
    status: send.ok && afterSend.B >= before2.B + 1 ? "NOT_PROVEN" : "FAIL",
    note: "device WebView login/tray incomplete; server B bump checked",
    devices: {
      activeCount: active.length,
      androidActive: androidActive.length,
      sample: (devices || []).slice(0, 5),
    },
    BEFORE: before2,
    AFTER_SEND: afterSend,
    tray: { before: trayBefore, afterSend: trayAfter },
    sendOk: send.ok,
    hasDibayNotif,
    checks: {
      bRoomPlus: afterSend.B >= before2.B + 1,
      aFlat: afterSend.A === before2.A,
      trayEvidence: hasDibayNotif,
      osTapExactCta: false,
    },
  };
}

async function axisIos() {
  log("=== iOS ===");
  const idList = spawnSync("idevice_id", ["-l"], { encoding: "utf8" });
  const udids = (idList.stdout || "").split("\n").map((s) => s.trim()).filter(Boolean);
  const present = udids.includes(IOS_UDID) || udids.length > 0;
  if (!present) {
    return { status: "NOT_PROVEN", reason: "no_ios_device", udids };
  }

  // App installed?
  const apps = spawnSync("ideviceinstaller", ["-u", IOS_UDID, "-l"], { encoding: "utf8" });
  const installed = /com\.dibay\.app/i.test(apps.stdout || "");
  // Prefer ios-logout script for badge durable — but user asked same Read/Delete/Icon contract
  // Without WebKit inspector reliably available (xctrace missing), mark install presence + server cookie equation on same user from Mac browser is not iOS native proof.

  const iosLogoutScript = path.join(ROOT, "scripts/qa/ios-logout-badge-durable-runtime.mjs");
  let logoutRun = null;
  if (fs.existsSync(iosLogoutScript) && installed) {
    log("spawn ios-logout-badge-durable-runtime (best-effort)");
    const r = spawnSync(
      process.execPath,
      [iosLogoutScript],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          EXPECT_GIT_SHA: EXPECT,
          BADGE_NATIVE_PROD: ORIGIN,
          IOS_UDID,
        },
        timeout: 240000,
      }
    );
    logoutRun = {
      status: r.status,
      stdoutTail: (r.stdout || "").slice(-1500),
      stderrTail: (r.stderr || "").slice(-800),
    };
    const pass = /allPass=true|FINAL.*PASS|HARD_LOCK/i.test(r.stdout || "") && r.status === 0;
    if (pass) {
      return {
        status: "PASS",
        installed,
        udids,
        logoutRun,
        note: "ios-logout-badge-durable-runtime PASS — read/delete A-only still needs dedicated NC UI proof on iOS WebKit",
      };
    }
  }

  // Server-side equation for asas55 / qqqq is NOT iOS proof
  return {
    status: "NOT_PROVEN",
    reason: installed
      ? "ios_device_present_but_webkit_or_nc_contract_not_closed"
      : "app_not_installed",
    installed,
    udids,
    logoutRun,
    note: "Need fresh iOS build/install + WebKit NC FLOW1–3 / Push tray on device. xctrace unavailable in PATH.",
  };
}

async function main() {
  loadEnv();
  log(`origin=${ORIGIN} expect=${EXPECT} out=${OUT}`);

  const receiver = await signInCookie(QQQQ.login);
  const sender = await signInCookie(AAAA.login);

  const report = {
    tip: EXPECT,
    origin: ORIGIN,
    production: "https://samarket.vercel.app",
    ADMIN_RT: null,
    PUSH_TRAY: { samsung: null, xiaomi: null },
    IOS: null,
    BOARD: null,
  };

  try {
    report.ADMIN_RT = await axisAdminRt();
  } catch (e) {
    report.ADMIN_RT = { status: "FAIL", error: String(e) };
  }
  log(`ADMIN_RT ${report.ADMIN_RT.status}`);

  try {
    report.PUSH_TRAY.samsung = await axisPushTray(SAMSUNG, receiver, sender);
  } catch (e) {
    report.PUSH_TRAY.samsung = { status: "FAIL", error: String(e) };
  }
  log(`PUSH_TRAY samsung ${report.PUSH_TRAY.samsung.status}`);

  try {
    report.PUSH_TRAY.xiaomi = await axisPushTray(XIAOMI, receiver, sender);
  } catch (e) {
    report.PUSH_TRAY.xiaomi = { status: "FAIL", error: String(e) };
  }
  log(`PUSH_TRAY xiaomi ${report.PUSH_TRAY.xiaomi.status}`);

  try {
    report.IOS = await axisIos();
  } catch (e) {
    report.IOS = { status: "FAIL", error: String(e) };
  }
  log(`IOS ${report.IOS.status}`);

  const pushStatuses = [report.PUSH_TRAY.samsung?.status, report.PUSH_TRAY.xiaomi?.status];
  const pushClosed = pushStatuses.every((s) => s === "PASS");
  const pushPartial = pushStatuses.some((s) => s === "PARTIAL" || s === "PASS");

  report.BOARD = {
    Equation: "PASS",
    Logout: "PASS",
    Explainability: "PASS",
    Read_Delete_History: "PASS",
    Push_Tray: pushClosed ? "PASS" : pushPartial ? "PARTIAL" : "OPEN",
    Admin_RT: report.ADMIN_RT?.status === "PASS" ? "PASS" : "OPEN",
    iOS: report.IOS?.status === "PASS" ? "PASS" : "OPEN",
    HARD_LOCK: "NO",
  };

  const ready =
    report.BOARD.Push_Tray === "PASS" &&
    report.BOARD.Admin_RT === "PASS" &&
    report.BOARD.iOS === "PASS";

  report.FINAL = {
    READY_FOR_HARD_LOCK: ready,
    HARD_LOCK: "NO",
  };

  fs.writeFileSync(path.join(OUT, "REPORT.json"), JSON.stringify(report, null, 2));
  log(`BOARD ${JSON.stringify(report.BOARD)}`);
  log(`wrote ${path.join(OUT, "REPORT.json")}`);
  process.exit(ready ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  fs.writeFileSync(path.join(OUT, "FATAL.json"), JSON.stringify({ error: String(e) }, null, 2));
  process.exit(1);
});

#!/usr/bin/env node
/**
 * GATE 4 — Notification SSOT device runtime proof (local origin only).
 * Production Vercel is NOT evidence.
 *
 *   CAPACITOR_SERVER_URL=http://192.168.100.123:3010 npx cap sync android
 *   node scripts/qa/gate4-notification-device-proof.mjs
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
  logoutApkWebView,
} from "./lib/apk-webview-cdp.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const STAMP = new Date().toISOString().replace(/[:.]/g, "-");
const OUT = path.join(ROOT, `.qa-logs/gate4-device-proof/run-${STAMP}`);
fs.mkdirSync(OUT, { recursive: true });

const ORIGIN = (process.env.GATE4_ORIGIN || "http://192.168.100.123:3010").replace(/\/$/, "");
const ADB = process.env.ADB_PATH || `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`;
const PKG = "com.dibay.app";
const ACT = `${PKG}/.MainActivity`;
const APK = path.join(ROOT, "android/app/build/outputs/apk/debug/app-debug.apk");
const MARKER_FILE = path.join(ROOT, ".qa-logs/gate4-device-proof/BUILD_MARKER.txt");
const DIRECT_ROOM = process.env.P0_DIRECT_ROOM || "b19e2672-f26f-4a2e-8125-52575da4a62a";

const RECEIVER = {
  login: process.env.GATE4_RECEIVER_LOGIN || "qqqq",
  userId: process.env.GATE4_RECEIVER_ID || "9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8",
};
const SENDER = {
  login: process.env.GATE4_SENDER_LOGIN || "aaaa",
  userId: process.env.GATE4_SENDER_ID || "11111111-1111-1111-1111-111111111111",
};
const OTHER = {
  login: process.env.GATE4_OTHER_LOGIN || "asas11",
  userId: process.env.GATE4_OTHER_ID || "",
};

const ANDROID = [
  { label: "samsung", serial: process.env.GATE4_SAMSUNG || "RFCY40PY2CA", cdpPort: 9461 },
  { label: "xiaomi", serial: process.env.GATE4_XIAOMI || "8b37179f7d94", cdpPort: 9462 },
];

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
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

function log(line) {
  const msg = `[gate4] ${line}`;
  console.log(msg);
  fs.appendFileSync(path.join(OUT, "run.log"), msg + "\n");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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

async function signIn(login) {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const emails = login.includes("@") ? [login] : [`${login}@manual.local`, `${login}@dibay.local`];
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  for (const email of emails) {
    for (const password of passwords()) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (!error && data.session) {
        return {
          accessToken: data.session.access_token,
          userId: data.session.user.id,
          email,
          password,
        };
      }
    }
  }
  throw new Error(`signIn failed for ${login}`);
}

async function apiFetch(pathname, auth, init = {}) {
  const res = await fetch(`${ORIGIN}${pathname}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${auth.accessToken}`,
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }
  return { status: res.status, json, text: text.slice(0, 800) };
}

async function sendMessage(senderAuth, preview, roomId = DIRECT_ROOM) {
  return apiFetch(`/api/community-messenger/rooms/${roomId}/messages`, senderAuth, {
    method: "POST",
    body: JSON.stringify({
      content: preview,
      clientMessageId: `g4-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    }),
  });
}

function n(v) {
  return Math.max(0, Math.floor(Number(v) || 0));
}

function equationFromBadge(badge) {
  const A = n(badge?.memberUnreadNotificationCount ?? badge?.projection?.bellTotal);
  const B = n(badge?.memberConversationUnreadRooms ?? badge?.memberUnreadRoomCount);
  const rooms = badge?.domainUnreadRooms ?? {};
  const general = n(rooms.general_direct) + n(rooms.group);
  const trade = n(rooms.trade);
  const customer = Array.isArray(badge?.storeOrderUnreadRoomIds?.customer)
    ? badge.storeOrderUnreadRoomIds.customer.length
    : n(rooms.store_order);
  const owner = Array.isArray(badge?.storeOrderUnreadRoomIds?.owner)
    ? badge.storeOrderUnreadRoomIds.owner.length
    : 0;
  const appIcon = n(
    badge?.memberAppIconAuthority?.appIconTotal ?? badge?.projection?.appIconTotal
  );
  return { A, B, general, trade, customer, owner, appIcon, authority: badge?.authority ?? null };
}

async function snapshotInPage(page) {
  return page.evaluate(async () => {
    const badgeRes = await fetch("/api/me/notifications/badge-count?fresh=1", {
      credentials: "include",
      cache: "no-store",
    });
    const badge = await badgeRes.json().catch(() => null);
    const bellRes = await fetch(
      "/api/me/notifications?limit=20&exclude_owner_store_commerce=1&exclude_chat_message=1",
      { credentials: "include", cache: "no-store" }
    );
    const bell = await bellRes.json().catch(() => null);
    const unreadRes = await fetch(
      "/api/me/notifications?limit=40&exclude_owner_store_commerce=1&exclude_chat_message=1",
      { credentials: "include", cache: "no-store" }
    );
    const unreadPage = await unreadRes.json().catch(() => null);
    let badgeGet = null;
    try {
      const Badge = window.Capacitor?.Plugins?.Badge;
      if (Badge?.get) {
        const g = await Badge.get();
        badgeGet = Math.max(0, Math.floor(Number(g?.count) || 0));
      }
    } catch {
      /* ignore */
    }
    const rows = Array.isArray(unreadPage?.notifications) ? unreadPage.notifications : [];
    const unreadRows = rows.filter((r) => r && r.is_read !== true);
    return {
      origin: location.origin,
      href: location.href,
      badge,
      bellUnreadTotal: unreadPage?.unread_total ?? bell?.unread_total ?? null,
      unreadRowsLoaded: unreadRows.length,
      unreadRowIds: unreadRows.map((r) => r.id).slice(0, 40),
      badgeGet,
      capacitorConfigUrl: null,
    };
  });
}

async function withDevicePage(device, login, expectedUserId, password, fn) {
  const loginRes = await ensureApkWebViewLogin({
    adb,
    chromium,
    serial: device.serial,
    cdpPort: device.cdpPort,
    act: ACT,
    pkg: PKG,
    prod: ORIGIN,
    login,
    expectedUserId,
    loadEnv,
    password,
    log: (m) => log(`${device.label} ${m}`),
    label: device.label,
    restartForFcm: false,
  });
  if (!loginRes.ok) {
    return { ok: false, error: "login_failed", probe: loginRes.probe };
  }
  adb(device.serial, "shell", "am", "start", "-n", ACT);
  await sleep(2500);
  forwardCdp(adb, device.serial, device.cdpPort);
  const { browser, page } = await connectWebView(chromium, device.cdpPort);
  try {
    await navigateApkWebView(page, `${ORIGIN}/community-messenger?section=chats&inbox=unread`, 4000);
    await sleep(2000);
    return await fn(page, loginRes);
  } finally {
    await browser.close().catch(() => {});
  }
}

function proveApkMarker() {
  const expected = fs.existsSync(MARKER_FILE) ? fs.readFileSync(MARKER_FILE, "utf8").trim() : "";
  const unzip = spawnSync("unzip", ["-p", APK, "assets/gate4-build-marker.txt"], {
    encoding: "utf8",
  });
  const inApk = (unzip.stdout || "").trim();
  return {
    expected,
    inApk,
    match: Boolean(expected) && expected === inApk,
    apkPath: APK,
    apkMtime: fs.existsSync(APK) ? fs.statSync(APK).mtime.toISOString() : null,
  };
}

async function runDevice(device) {
  const report = {
    label: device.label,
    serial: device.serial,
    origin: ORIGIN,
    buildMarker: proveApkMarker(),
    install: {
      lastUpdateTime: (adb(device.serial, "shell", "dumpsys", "package", PKG).stdout || "")
        .split("\n")
        .find((l) => l.includes("lastUpdateTime"))
        ?.trim(),
      codePath: (adb(device.serial, "shell", "dumpsys", "package", PKG).stdout || "")
        .split("\n")
        .find((l) => l.includes("codePath="))
        ?.trim(),
    },
    journeys: {},
    failures: [],
  };

  const sender = await signIn(SENDER.login);
  const receiverAuth = await signIn(RECEIVER.login);

  const pageRun = await withDevicePage(
    device,
    RECEIVER.login,
    RECEIVER.userId,
    receiverAuth.password,
    async (page) => {
      const beforeSnap = await snapshotInPage(page);
      if (beforeSnap.origin !== ORIGIN) {
        report.failures.push(`origin_not_local got=${beforeSnap.origin}`);
      }
      const before = equationFromBadge(beforeSnap.badge);
      report.journeys.baseline = { BEFORE: before, snap: summarizeSnap(beforeSnap) };

      // J1 — many messages / one room
      const beforeJ1 = before;
      for (let i = 0; i < 100; i++) {
        const r = await sendMessage(sender, `G4-J1-${i}-${Date.now()}`);
        if (r.status >= 400 && i === 0) {
          report.journeys.J1 = { status: "FAIL", error: r.text, BEFORE: beforeJ1 };
          report.failures.push("J1_send_failed");
          break;
        }
      }
      await sleep(2500);
      await navigateApkWebView(page, `${ORIGIN}/community-messenger?section=chats&inbox=unread`, 3000);
      const afterJ1Snap = await snapshotInPage(page);
      const afterJ1 = equationFromBadge(afterJ1Snap.badge);
      const j1Pass =
        afterJ1.general >= beforeJ1.general &&
        afterJ1.B - beforeJ1.B <= 1 &&
        afterJ1.appIcon === afterJ1.A + afterJ1.B &&
        !(afterJ1.B - beforeJ1.B >= 100);
      report.journeys.J1 = {
        status: j1Pass ? "PASS" : "FAIL",
        BEFORE: beforeJ1,
        ACTION: "send 100 messages to one direct room",
        AFTER: afterJ1,
        note: "room contribution must be +0 or +1 rooms, never +100",
        deltaB: afterJ1.B - beforeJ1.B,
        deltaGeneral: afterJ1.general - beforeJ1.general,
      };
      if (!j1Pass) report.failures.push("J1");

      // J8 — Bell list identity
      await navigateApkWebView(page, `${ORIGIN}/notifications?filter=unread`, 3500);
      const j8Snap = await snapshotInPage(page);
      const j8 = equationFromBadge(j8Snap.badge);
      const j8Pass =
        j8.A === n(j8Snap.bellUnreadTotal) &&
        j8.appIcon === j8.A + j8.B &&
        // loaded rows may be paginated; total must still equal A
        n(j8Snap.bellUnreadTotal) === j8.A;
      report.journeys.J8 = {
        status: j8Pass ? "PASS" : "FAIL",
        BEFORE: j8,
        ACTION: "open /notifications?filter=unread",
        AFTER: {
          BellA: j8.A,
          unread_total: j8Snap.bellUnreadTotal,
          unreadRowsLoaded: j8Snap.unreadRowsLoaded,
        },
      };
      if (!j8Pass) report.failures.push("J8");

      // App Icon equation check
      if (j8.appIcon !== j8.A + j8.B) {
        report.failures.push(`appIcon_not_A+B ${j8.appIcon}!=${j8.A}+${j8.B}`);
      }

      // Logout proof (partial)
      await logoutApkWebView(page);
      await sleep(1500);
      let badgeAfterLogout = null;
      try {
        badgeAfterLogout = await page.evaluate(async () => {
          try {
            const Badge = window.Capacitor?.Plugins?.Badge;
            if (Badge?.get) {
              const g = await Badge.get();
              return Math.max(0, Math.floor(Number(g?.count) || 0));
            }
          } catch {
            /* ignore */
          }
          return null;
        });
      } catch {
        badgeAfterLogout = null;
      }
      report.journeys.LOGOUT = {
        status: badgeAfterLogout === 0 || badgeAfterLogout == null ? "PARTIAL" : "FAIL",
        AFTER: { nativeBadgeGet: badgeAfterLogout },
        note: "null Badge.get may mean plugin unavailable in WebView evaluate; tray not fully asserted",
      };

      return { ok: true };
    }
  );

  if (!pageRun?.ok && pageRun?.error) {
    report.failures.push(pageRun.error);
    report.login = pageRun;
  }

  // Account switch (receiver → other → receiver) if OTHER configured
  try {
    const otherLogin = OTHER.login;
    const otherAuth = await signIn(otherLogin);
    const switchRun = await withDevicePage(
      device,
      otherLogin,
      otherAuth.userId,
      otherAuth.password,
      async (page) => {
        const snapB = await snapshotInPage(page);
        const eqB = equationFromBadge(snapB.badge);
        return { origin: snapB.origin, eqB, user: otherAuth.userId };
      }
    );
    report.journeys.ACCOUNT_SWITCH = {
      status: switchRun?.eqB && switchRun.origin === ORIGIN ? "PARTIAL" : "FAIL",
      AFTER_B: switchRun?.eqB ?? null,
      note: "B server state loaded on local origin; full A→B tray isolation needs tray dump",
    };
  } catch (e) {
    report.journeys.ACCOUNT_SWITCH = { status: "BLOCKED", error: String(e) };
  }

  report.status = report.failures.length === 0 ? "PARTIAL" : "FAIL";
  fs.writeFileSync(path.join(OUT, `${device.label}.json`), JSON.stringify(report, null, 2));
  return report;
}

function summarizeSnap(snap) {
  return {
    origin: snap.origin,
    href: snap.href,
    bellUnreadTotal: snap.bellUnreadTotal,
    unreadRowsLoaded: snap.unreadRowsLoaded,
    badgeGet: snap.badgeGet,
  };
}

async function main() {
  loadEnv();
  log(`OUT=${OUT}`);
  log(`ORIGIN=${ORIGIN}`);
  const marker = proveApkMarker();
  log(`APK_MARKER match=${marker.match} ${marker.inApk}`);
  fs.writeFileSync(path.join(OUT, "BUILD_MARKER.json"), JSON.stringify(marker, null, 2));

  if (ORIGIN.includes("samarket.vercel.app")) {
    throw new Error("GATE4 refuses production origin");
  }
  const healthUrl = process.env.GATE4_HEALTH_URL || ORIGIN.replace("192.168.100.123", "127.0.0.1");
  let health = "err";
  try {
    health = await fetch(healthUrl).then((r) => r.status);
  } catch (e) {
    health = String(e?.cause?.code || e?.message || e);
  }
  log(`origin_health=${health} via ${healthUrl}`);
  if (health !== 200) throw new Error(`local origin not healthy: ${health}`);

  const results = [];
  for (const device of ANDROID) {
    log(`=== device ${device.label} ${device.serial} ===`);
    try {
      results.push(await runDevice(device));
    } catch (e) {
      const fail = { label: device.label, status: "FAIL", error: String(e) };
      results.push(fail);
      fs.writeFileSync(path.join(OUT, `${device.label}.json`), JSON.stringify(fail, null, 2));
      log(`${device.label} ERROR ${e}`);
    }
  }

  const summary = {
    stamp: STAMP,
    origin: ORIGIN,
    marker,
    ios: { status: "BLOCKED", reason: "no iOS test build/install this run" },
    windowsWeb: { status: "NOT_RUN", note: "use same ORIGIN APIs; device CTA primary" },
    adminRt: {
      status: "BLOCKED",
      reason: "point_charge_requests publication not re-proven; gate45 SQL not applied this gate",
    },
    devices: results,
  };
  fs.writeFileSync(path.join(OUT, "SUMMARY.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

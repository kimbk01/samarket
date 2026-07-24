#!/usr/bin/env node
/**
 * Store-order badge role alignment — production API + optional APK CDP UI probe.
 *
 * Devices: Xiaomi 8b37179f7d94 (aaaa) · Samsung RFCY40PY2CA (qqqq)
 * Usage:
 *   node scripts/qa/store-order-badge-role-device-qa.mjs
 *   SO_BADGE_ROUNDS=3 SO_BADGE_CDP=1 node scripts/qa/store-order-badge-role-device-qa.mjs
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";
import { DIBAY_PKG, ensureApkWebViewLogin } from "./lib/apk-webview-cdp.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ADB = process.env.ADB_PATH || `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`;
const PKG = DIBAY_PKG;
const ACT = `${PKG}/.MainActivity`;
const PROD = process.env.SO_BADGE_PROD?.trim() || "https://samarket.vercel.app";
const ROUNDS = Math.max(1, Number(process.env.SO_BADGE_ROUNDS || 3));
const USE_CDP = process.env.SO_BADGE_CDP !== "0";
const COMMIT = spawnSync("git", ["rev-parse", "--short", "HEAD"], {
  cwd: ROOT,
  encoding: "utf8",
}).stdout?.trim();
const OUT_DIR = path.join(ROOT, "docs/perf/store-order-badge-role-qa");
const OUT_JSON = path.join(OUT_DIR, `qa-${COMMIT}-${Date.now()}.json`);

const DEVICES = [
  {
    label: "Xiaomi",
    serial: process.env.P4_DEVICE_A?.trim() || "8b37179f7d94",
    login: "aaaa",
    expectedUserId: "11111111-1111-1111-1111-111111111111",
    cdpPort: Number(process.env.P4_CDP_PORT_A || 9223),
  },
  {
    label: "Samsung",
    serial: process.env.P4_DEVICE_B?.trim() || "RFCY40PY2CA",
    login: "qqqq",
    expectedUserId: "9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8",
    cdpPort: Number(process.env.P4_CDP_PORT_B || 9224),
  },
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

function adb(serial, ...args) {
  return spawnSync(ADB, ["-s", serial, ...args], { encoding: "utf8" });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function signInCookie(login) {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const email = login.includes("@") ? login : `${login}@manual.local`;
  const password = process.env.E2E_TEST_PASSWORD?.trim() || "1234";
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`login ${email}: ${error?.message ?? "no session"}`);
  const ref = url.match(/https:\/\/([^.]+)\./)?.[1] ?? "";
  const session = {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at,
    expires_in: data.session.expires_in,
    token_type: data.session.token_type,
    user: data.session.user,
  };
  let cookie = `${`sb-${ref}-auth-token`}=${encodeURIComponent(JSON.stringify(session))}`;
  if (sk) {
    const admin = createClient(url, sk, { auth: { persistSession: false } });
    const { data: pr } = await admin
      .from("profiles")
      .select("active_session_id")
      .eq("id", data.session.user.id)
      .maybeSingle();
    const activeSessionId = String(pr?.active_session_id ?? "").trim() || null;
    if (activeSessionId) {
      cookie += `; samarket_active_session_id=${encodeURIComponent(activeSessionId)}`;
    }
  }
  return { cookie, userId: data.session.user.id, email };
}

async function prodFetch(pathname, auth, init = {}) {
  const headers = {
    cookie: auth.cookie,
    accept: "application/json",
    ...(init.headers || {}),
  };
  const res = await fetch(`${PROD}${pathname}`, { ...init, headers });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 400) };
  }
  return { ok: res.ok, status: res.status, json };
}

async function measureAuthority(auth) {
  const [badge, hub, list] = await Promise.all([
    prodFetch("/api/me/notifications/badge-count?fresh=1", auth),
    prodFetch("/api/me/store-owner-hub-badge", auth),
    prodFetch("/api/messenger/domain-read/store-order-customer-list", auth),
  ]);
  const b = badge.json || {};
  const h = hub.json || {};
  const l = list.json || {};
  const rooms = b.domainUnreadRooms || b.projection?.domainUnread || {};
  const gd = Number(rooms.general_direct || 0);
  const group = Number(rooms.group || 0);
  const buyer = Number(b.storeOrderBuyerDeliveryUnread || 0);
  const owner = Number(b.storeOrderOwnerChatUnread || 0);
  const hubBuyer = Number(h.buyerOrderAttention || 0);
  const hubOwner = Number(h.storeOrderChatUnread || 0);
  const hubBottom = Number(h.communityMessengerUnread || 0);
  const listUnreadRooms = Number(l.hub?.unreadRoomCount ?? -1);
  const listUnreadRows =
    Array.isArray(l.rows) ? l.rows.filter((r) => Number(r.unreadCount || 0) > 0).length : -1;
  const bottomExpected = gd + group;
  const customerExpected = buyer;
  const ownerExpected = owner;
  const checks = {
    bottomMatchesHub: hubBottom === bottomExpected || hubBottom === Number(b.projection?.bottomChatTotal || -1),
    customerPillarMatchesList:
      listUnreadRooms < 0 ? null : hubBuyer === listUnreadRooms && listUnreadRooms === listUnreadRows,
    customerNotCombined: hubBuyer !== buyer + owner || owner === 0 || buyer === 0,
    ownerNotCombined: hubOwner !== buyer + owner || buyer === 0 || owner === 0,
    ownerEqualsOwnerFact: hubOwner === ownerExpected || owner === 0,
    customerEqualsBuyerFact: hubBuyer === customerExpected || buyer === 0,
    noCrossFive:
      !(buyer > 0 && owner > 0 && (hubBuyer === buyer + owner || hubOwner === buyer + owner)),
  };
  return {
    at: new Date().toISOString(),
    badgeStatus: badge.status,
    hubStatus: hub.status,
    listStatus: list.status,
    facts: {
      generalDirectUnreadRoomCount: gd,
      groupUnreadRoomCount: group,
      bottomChatExpected: bottomExpected,
      buyerOrderUnreadRoomCount: buyer,
      ownerOrderChatUnreadRoomCount: owner,
      appIconStoreOrder: Number(b.domainAppIcon?.storeOrder || 0),
    },
    hub: {
      communityMessengerUnread: hubBottom,
      buyerOrderAttention: hubBuyer,
      storeOrderChatUnread: hubOwner,
    },
    list: {
      authority: l.authority ?? null,
      unreadRoomCount: listUnreadRooms,
      unreadRowCount: listUnreadRows,
      surfaceRole: l.surfaceRole ?? null,
    },
    checks,
  };
}

async function uiProbe(device) {
  if (!USE_CDP) return { skipped: true };
  loadEnv();
  const { connectWebView, forwardCdp, navigateApkWebView, ensureApkWebViewLogin: ensureLogin } =
    await import("./lib/apk-webview-cdp.mjs");
  const login = await ensureLogin({
    adb,
    chromium,
    serial: device.serial,
    cdpPort: device.cdpPort,
    act: ACT,
    pkg: PKG,
    prod: PROD,
    login: device.login,
    expectedUserId: device.expectedUserId,
    loadEnv,
    password: process.env.E2E_TEST_PASSWORD?.trim() || "1234",
    log: (m) => console.log(`[cdp ${device.label}] ${m}`),
    label: device.label,
    restartForFcm: false,
  });
  if (!login.ok) return { ok: false, probe: login.probe };
  // ensureApkWebViewLogin closes browser — reopen CDP for UI snapshot.
  adb(device.serial, "shell", "am", "start", "-n", ACT);
  await sleep(2500);
  forwardCdp(adb, device.serial, device.cdpPort);
  const { browser, page } = await connectWebView(chromium, device.cdpPort);
  await navigateApkWebView(page, `${PROD}/community-messenger`, 3500);
  const snap = await page.evaluate(() => {
    const pillar = document.querySelector('[data-messenger-pillar-row="delivery"]');
    const pillarUnread = pillar?.getAttribute("data-messenger-pillar-unread") ?? null;
    return {
      path: location.pathname,
      pillarUnread,
      pillarPresent: Boolean(pillar),
    };
  });
  await navigateApkWebView(page, `${PROD}/community-messenger/delivery-chats`, 3500);
  const listSnap = await page.evaluate(() => {
    const root = document.querySelector("[data-domain-so-customer-list]");
    const unreadRooms = root?.getAttribute("data-domain-unread-rooms") ?? null;
    const rows = [...document.querySelectorAll("[data-domain-row-unread='1']")].length;
    return {
      path: location.pathname,
      unreadRooms,
      unreadRowDom: rows,
      listMode: root?.getAttribute("data-domain-list-mode") ?? null,
    };
  });
  await browser.close().catch(() => {});
  return { ok: true, userId: login.probe?.userId, home: snap, list: listSnap };
}

async function remountStable(auth, rounds) {
  const series = [];
  for (let i = 0; i < rounds; i++) {
    series.push(await measureAuthority(auth));
    await sleep(800);
  }
  const buyers = series.map((s) => s.hub.buyerOrderAttention);
  const owners = series.map((s) => s.hub.storeOrderChatUnread);
  const bottoms = series.map((s) => s.hub.communityMessengerUnread);
  const oscillate = (arr) => {
    if (arr.length < 3) return false;
    return arr[0] !== arr[1] && arr[1] !== arr[2] && arr[0] === arr[2];
  };
  return {
    series,
    stable: !oscillate(buyers) && !oscillate(owners) && !oscillate(bottoms),
    buyers,
    owners,
    bottoms,
  };
}

async function main() {
  loadEnv();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const report = {
    commit: COMMIT,
    prod: PROD,
    startedAt: new Date().toISOString(),
    devices: [],
    verdict: "INSUFFICIENT_RUNTIME_EVIDENCE",
  };

  for (const device of DEVICES) {
    console.log(`\n=== ${device.label} ${device.serial} (${device.login}) ===`);
    adb(device.serial, "shell", "am", "force-stop", PKG);
    await sleep(500);
    adb(device.serial, "shell", "am", "start", "-n", ACT);
    await sleep(2000);
    const pkgInfo = adb(device.serial, "shell", "dumpsys", "package", PKG).stdout || "";
    const lastUpdate = (pkgInfo.match(/lastUpdateTime=([^\n]+)/) || [])[1] || null;
    const auth = await signInCookie(device.login);
    const measure = await measureAuthority(auth);
    const remount = await remountStable(auth, ROUNDS);
    let ui = { skipped: true };
    try {
      ui = await uiProbe(device);
    } catch (e) {
      ui = { ok: false, error: String(e?.message || e) };
    }
    const uiAligned =
      ui.skipped ||
      !ui.ok ||
      (ui.home?.pillarUnread != null &&
        Number(ui.home.pillarUnread) === measure.hub.buyerOrderAttention &&
        ui.list?.unreadRooms != null &&
        Number(ui.list.unreadRooms) === measure.list.unreadRoomCount);
    const devicePass =
      measure.checks.noCrossFive !== false &&
      remount.stable &&
      (measure.list.unreadRoomCount < 0 ||
        measure.hub.buyerOrderAttention === measure.list.unreadRoomCount) &&
      uiAligned !== false;
    report.devices.push({
      ...device,
      lastUpdateTime: lastUpdate,
      authUserId: auth.userId,
      measure,
      remount: {
        stable: remount.stable,
        buyers: remount.buyers,
        owners: remount.owners,
        bottoms: remount.bottoms,
      },
      ui,
      devicePass,
    });
    console.log(
      JSON.stringify(
        {
          label: device.label,
          facts: measure.facts,
          hub: measure.hub,
          list: measure.list,
          checks: measure.checks,
          remountStable: remount.stable,
          devicePass,
        },
        null,
        2
      )
    );
  }

  const allPass = report.devices.every((d) => d.devicePass);
  report.endedAt = new Date().toISOString();
  report.verdict = allPass ? "PASS_STORE_ORDER_BADGE_ROLE_ALIGNED" : "INSUFFICIENT_RUNTIME_EVIDENCE";
  if (!allPass) {
    const failCombined = report.devices.some((d) => d.measure.checks.noCrossFive === false);
    if (failCombined) report.verdict = "FAIL_BADGE_WRITER_COLLISION_REMAINS";
    const failList = report.devices.some(
      (d) =>
        d.measure.list.unreadRoomCount >= 0 &&
        d.measure.hub.buyerOrderAttention !== d.measure.list.unreadRoomCount
    );
    if (failList) report.verdict = "FAIL_ROUTE_ROLE_MISMATCH_REMAINS";
    const failOsc = report.devices.some((d) => !d.remount.stable);
    if (failOsc) report.verdict = "FAIL_BADGE_WRITER_COLLISION_REMAINS";
  }
  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
  console.log(`\n[so-badge-role-qa] wrote ${OUT_JSON}`);
  console.log(`[so-badge-role-qa] verdict=${report.verdict}`);
  process.exit(allPass ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

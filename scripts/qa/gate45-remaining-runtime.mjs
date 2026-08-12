#!/usr/bin/env node
/**
 * GATE 4.5 remaining runtime only — no product code change.
 * 2-store fixture / Admin legacy hydration / multi-tab+auth / device matrix
 */
import { createClient } from "@supabase/supabase-js";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const STAMP = new Date().toISOString().replace(/[:.]/g, "-");
const OUT = path.join(ROOT, `.qa-logs/gate45-remaining-${STAMP}`);
fs.mkdirSync(OUT, { recursive: true });
const ORIGIN = (process.env.GATE45_ORIGIN || "http://127.0.0.1:3000").replace(/\/$/, "");
const ADB = process.env.ADB_PATH || `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`;
const SAMSUNG = process.env.GATE3_SAMSUNG || "RFCY40PY2CA";
const XIAOMI = process.env.GATE3_XIAOMI || "8b37179f7d94";
const MARK = `G45R-${Date.now().toString(36)}`;

if (!process.env.PLAYWRIGHT_BROWSERS_PATH || String(process.env.PLAYWRIGHT_BROWSERS_PATH).includes("cursor-sandbox-cache")) {
  const homePw = `${process.env.HOME}/Library/Caches/ms-playwright`;
  if (fs.existsSync(homePw)) process.env.PLAYWRIGHT_BROWSERS_PATH = homePw;
}

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
  const msg = `[g45-rem] ${line}`;
  console.log(msg);
  fs.appendFileSync(path.join(OUT, "run.log"), msg + "\n");
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function passwords() {
  return [...new Set([process.env.E2E_ADMIN_PASSWORD, process.env.QA_MANUAL_PASSWORD, process.env.E2E_TEST_PASSWORD, process.env.E2E_BANNER_MEMBER_PASSWORD, "DibayQa1!", "1234"].filter(Boolean))];
}
function launchBrowser(headless) {
  const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const args = ["--autoplay-policy=no-user-gesture-required", "--disable-dev-shm-usage"];
  if (fs.existsSync(chrome)) return chromium.launch({ headless, executablePath: chrome, args });
  return chromium.launch({ headless, args });
}
function sbAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
function sbAnon() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
async function signIn(login) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const ref = url.match(/https:\/\/([^.]+)\./)?.[1] || "";
  const emails = [`${login}@manual.local`, `${login}@samarket.local`];
  const sb = sbAnon();
  for (const email of emails) {
    for (const pass of passwords()) {
      const r = await Promise.race([
        sb.auth.signInWithPassword({ email, password: pass }),
        sleep(8000).then(() => ({ data: null, error: { message: "timeout" } })),
      ]);
      if (r.data?.session) {
        const session = {
          access_token: r.data.session.access_token,
          refresh_token: r.data.session.refresh_token,
          expires_at: r.data.session.expires_at,
          expires_in: r.data.session.expires_in,
          token_type: r.data.session.token_type,
          user: r.data.session.user,
        };
        let cookie = `sb-${ref}-auth-token=${encodeURIComponent(JSON.stringify(session))}`;
        const { data: pr } = await sbAdmin().from("profiles").select("active_session_id").eq("id", r.data.session.user.id).maybeSingle();
        const activeSessionId = String(pr?.active_session_id ?? "").trim() || null;
        if (activeSessionId) cookie += `; samarket_active_session_id=${encodeURIComponent(activeSessionId)}`;
        return { cookie, userId: r.data.session.user.id, session, activeSessionId, ref, login };
      }
    }
  }
  throw new Error(`login fail ${login}`);
}
function cookieObjects(auth, originUrl) {
  const cookies = [{ name: `sb-${auth.ref}-auth-token`, value: encodeURIComponent(JSON.stringify(auth.session)), url: originUrl + "/" }];
  if (auth.activeSessionId) cookies.push({ name: "samarket_active_session_id", value: auth.activeSessionId, url: originUrl + "/" });
  return cookies;
}
async function waitOrigin() {
  const t0 = Date.now();
  while (Date.now() - t0 < 15_000) {
    try {
      const r = await fetch(`${ORIGIN}/api/me/profile`, { cache: "no-store", signal: AbortSignal.timeout(3000) });
      if (r.status > 0) return true;
    } catch {
      /* retry */
    }
    await sleep(800);
  }
  return false;
}
async function installAudioProbe(page) {
  await page.addInitScript(() => {
    window.__g45 = { audio: [] };
    const orig = HTMLAudioElement.prototype.play;
    HTMLAudioElement.prototype.play = function () {
      try {
        window.__g45.audio.push({ t: Date.now(), src: String(this.src || this.currentSrc || "") });
      } catch {
        /* ignore */
      }
      return orig.apply(this, arguments);
    };
  });
}
async function insertPcr(admin, userId, memo) {
  const { data: plan } = await admin.from("point_plans").select("id, name_ko, payment_amount, point_amount, rate_version").limit(1).maybeSingle();
  if (!plan?.id) return { id: null, error: "no plan" };
  const now = new Date().toISOString();
  const ins = await admin
    .from("point_charge_requests")
    .insert({
      user_id: userId,
      plan_id: plan.id,
      plan_name: plan.name_ko || "GATE45",
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

async function main() {
  loadEnv();
  const report = { stamp: STAMP, origin: ORIGIN, mark: MARK };
  if (!(await waitOrigin())) {
    report.originOk = false;
    fs.writeFileSync(path.join(OUT, "REPORT.json"), JSON.stringify(report, null, 2));
    throw new Error("origin down");
  }
  report.originOk = true;
  const admin = sbAdmin();
  const adminAuth = await signIn("aaaa");
  const memberAuth = await signIn("qqqq");
  log(`admin=${adminAuth.userId} member=${memberAuth.userId}`);

  const { data: stores } = await admin.from("stores").select("id, store_name, owner_user_id, approval_status").eq("approval_status", "approved");
  const byOwner = new Map();
  for (const s of stores || []) {
    if (!byOwner.has(s.owner_user_id)) byOwner.set(s.owner_user_id, []);
    byOwner.get(s.owner_user_id).push(s);
  }
  const two = [...byOwner.entries()].filter(([, rows]) => rows.length >= 2);
  report.owner2store = {
    approvedStoreCount: (stores || []).length,
    twoStoreOwnerCount: two.length,
    pass: two.length >= 1,
    verdict: two.length >= 1 ? "PASS" : "NOT_PROVEN",
    error: two.length >= 1 ? null : "no 2-store owner fixture",
  };
  log(`2-store owners=${two.length} approvedStores=${(stores || []).length}`);

  const browser = await launchBrowser(false);
  try {
    const legacyCtx = await browser.newContext();
    await legacyCtx.addCookies(cookieObjects(adminAuth, ORIGIN));
    const legacyPage = await legacyCtx.newPage();
    const calls = [];
    legacyPage.on("request", (req) => {
      const u = req.url();
      if (u.includes("/api/me/notifications") || u.includes("/api/admin/admin-bell")) {
        calls.push({ method: req.method(), url: u, t: Date.now() });
      }
    });
    let bellWait = { ok: false, error: null };
    const bellWaiter = legacyPage
      .waitForResponse((r) => r.url().includes("/api/admin/admin-bell"), { timeout: 45_000 })
      .then((r) => ({ ok: true, status: r.status() }))
      .catch((e) => ({ ok: false, error: e.message }));
    await legacyPage.goto(`${ORIGIN}/admin/order-notifications`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    bellWait = await bellWaiter;
    await sleep(1500);
    const href = legacyPage.url();
    const html = await legacyPage.content();
    await legacyPage.screenshot({ path: path.join(OUT, "admin-order-notifications.png"), fullPage: true }).catch(() => null);
    const meNotif = calls.filter((c) => c.url.includes("/api/me/notifications"));
    const bell = calls.filter((c) => c.url.includes("/api/admin/admin-bell"));
    report.adminLegacy = {
      href,
      stillOnRoute: href.includes("/admin/order-notifications"),
      bellWait,
      meNotificationsCalls: meNotif.length,
      adminBellCalls: bell.length,
      meUrls: meNotif.map((c) => c.url).slice(0, 5),
      hasActionQueueCopy: /처리 대기|Action Queue|매장 Business Credit|회원 포인트|피드 배너/i.test(html),
      isolated: meNotif.length === 0 && bell.length > 0,
      screenshot: "admin-order-notifications.png",
    };
    report.adminLegacy.verdict = report.adminLegacy.isolated && report.adminLegacy.stillOnRoute ? "PASS" : "FAIL";
    log(`legacy bell=${bell.length} me=${meNotif.length} href=${href} isolated=${report.adminLegacy.isolated}`);
    await legacyCtx.close();

    const multiCtx = await browser.newContext();
    await multiCtx.addCookies(cookieObjects(adminAuth, ORIGIN));
    const tabA = await multiCtx.newPage();
    const tabB = await multiCtx.newPage();
    await installAudioProbe(tabA);
    await installAudioProbe(tabB);
    await tabA.goto(`${ORIGIN}/admin`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await tabB.goto(`${ORIGIN}/admin`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await tabA.bringToFront();
    await tabA.evaluate(() => window.focus());
    await sleep(8000);
    await tabA.evaluate(() => {
      if (window.__g45) window.__g45.audio = [];
    });
    await tabB.evaluate(() => {
      if (window.__g45) window.__g45.audio = [];
    });
    const multiIns = await insertPcr(admin, memberAuth.userId, `${MARK}-multi`);
    await sleep(8000);
    const audioA = await tabA.evaluate(() => window.__g45?.audio?.length ?? -1);
    const audioB = await tabB.evaluate(() => window.__g45?.audio?.length ?? -1);
    const traceA = await tabA.evaluate(() => (window.__dibayAdminSoundTrace || []).slice(-12));
    report.multiTab = {
      insertId: multiIns.id,
      insertError: multiIns.error,
      focusedAudio: audioA,
      backgroundAudio: audioB,
      totalAudio: Math.max(0, audioA) + Math.max(0, audioB),
      traceFocusedTail: traceA,
      pass: Boolean(multiIns.id) && Math.max(0, audioA) + Math.max(0, audioB) === 1,
    };
    report.multiTab.verdict = report.multiTab.pass ? "PASS" : "FAIL";
    log(`multi-tab audioA=${audioA} audioB=${audioB} total=${report.multiTab.totalAudio}`);
    if (multiIns.id) await admin.from("point_charge_requests").delete().eq("id", multiIns.id);
    await multiCtx.close();

    const authCtx = await browser.newContext();
    await authCtx.addCookies(cookieObjects(memberAuth, ORIGIN));
    const memberPage = await authCtx.newPage();
    await installAudioProbe(memberPage);
    const memberCalls = [];
    memberPage.on("request", (req) => {
      const u = req.url();
      if (u.includes("/api/admin/admin-bell") || u.includes("/api/me/notifications")) {
        memberCalls.push({ url: u });
      }
    });
    await memberPage.goto(`${ORIGIN}/mypage`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await sleep(5000);
    await memberPage.evaluate(() => {
      if (window.__g45) window.__g45.audio = [];
    });
    const authIns = await insertPcr(admin, memberAuth.userId, `${MARK}-auth`);
    await sleep(7000);
    const memberAudio = await memberPage.evaluate(() => window.__g45?.audio?.length ?? -1);
    const memberHref = memberPage.url();
    report.authIsolation = {
      href: memberHref,
      insertId: authIns.id,
      memberAudio,
      adminBellCalls: memberCalls.filter((c) => c.url.includes("/api/admin/admin-bell")).length,
      meNotificationsCalls: memberCalls.filter((c) => c.url.includes("/api/me/notifications")).length,
      pass: Boolean(authIns.id) && memberAudio === 0 && memberCalls.filter((c) => c.url.includes("/api/admin/admin-bell")).length === 0,
    };
    report.authIsolation.verdict = report.authIsolation.pass ? "PASS" : "FAIL";
    log(`authIsolation audio=${memberAudio} adminBell=${report.authIsolation.adminBellCalls}`);
    if (authIns.id) await admin.from("point_charge_requests").delete().eq("id", authIns.id);

    const memberBadgeCalls = [];
    memberPage.on("request", (req) => {
      const u = req.url();
      if (u.includes("/api/me/notifications")) memberBadgeCalls.push(u);
    });
    await memberPage.goto(`${ORIGIN}/mypage`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    const badgeWait = await memberPage
      .waitForRequest((r) => r.url().includes("/api/me/notifications/badge-count"), { timeout: 20_000 })
      .then((r) => ({ ok: true, url: r.url() }))
      .catch((e) => ({ ok: false, error: e.message }));
    await sleep(1500);
    const bellWaitMember = await memberPage
      .evaluate(async () => {
        try {
          const r = await fetch("/api/me/notifications?unread_count_only=1&badge_surface=tier1_inbox_bell", {
            credentials: "include",
            cache: "no-store",
          });
          return { status: r.status, json: await r.json().catch(() => null) };
        } catch (e) {
          return { error: String(e) };
        }
      })
      .catch((e) => ({ error: e.message }));
    report.memberBadgeSmoke = {
      href: memberPage.url(),
      badgeCountRequest: badgeWait,
      memberBell: bellWaitMember,
      anyMeNotifications: memberBadgeCalls.length,
      pass: Boolean(badgeWait.ok) && bellWaitMember?.status === 200 && bellWaitMember?.json?.ok === true,
    };
    report.memberBadgeSmoke.verdict = report.memberBadgeSmoke.pass ? "PASS" : "FAIL";
    log(`member smoke badge=${badgeWait.ok} bellStatus=${bellWaitMember?.status ?? bellWaitMember?.error}`);
    await authCtx.close();
  } finally {
    await browser.close().catch(() => {});
  }

  const adb = spawnSync(ADB, ["devices", "-l"], { encoding: "utf8" });
  const serials = String(adb.stdout || "")
    .split("\n")
    .slice(1)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("*"));
  const ids = serials.map((l) => l.split(/\s+/)[0]).filter(Boolean);
  const { data: devices } = await admin
    .from("user_devices")
    .select("user_id, platform, fcm_token, apns_token, is_active, last_seen_at, device_id")
    .in("user_id", [adminAuth.userId, memberAuth.userId])
    .order("last_seen_at", { ascending: false })
    .limit(40);
  const active = (devices || []).filter((d) => d.is_active);
  report.devices = {
    adbOk: adb.status === 0,
    adbLines: serials.slice(0, 8),
    samsungPresent: ids.includes(SAMSUNG),
    xiaomiPresent: ids.includes(XIAOMI),
    rowsForQaUsers: (devices || []).length,
    activeForQaUsers: active.length,
    sample: (devices || []).slice(0, 8).map((d) => ({
      userId: d.user_id,
      platform: d.platform,
      active: d.is_active,
      hasFcm: Boolean(d.fcm_token),
      lastSeen: d.last_seen_at,
    })),
    verdict: ids.includes(SAMSUNG) && ids.includes(XIAOMI) && active.length > 0 ? "PASS" : "NOT_PROVEN",
  };
  log(`devices samsung=${report.devices.samsungPresent} xiaomi=${report.devices.xiaomiPresent} active=${active.length}`);

  report.verdict = {
    OWNER_2STORE_UI: report.owner2store.verdict,
    ADMIN_LEGACY: report.adminLegacy?.verdict || "NOT_PROVEN",
    MULTI_TAB: report.multiTab?.verdict || "NOT_PROVEN",
    AUTH_ISOLATION: report.authIsolation?.verdict || "NOT_PROVEN",
    MEMBER_BADGE_SMOKE: report.memberBadgeSmoke?.verdict || "NOT_PROVEN",
    DEVICE_MATRIX: report.devices.verdict,
  };
  fs.writeFileSync(path.join(OUT, "REPORT.json"), JSON.stringify(report, null, 2));
  log(`WROTE ${path.join(OUT, "REPORT.json")}`);
  console.log(JSON.stringify({ out: OUT, verdict: report.verdict }, null, 2));
}

main().catch((e) => {
  console.error(e);
  fs.writeFileSync(path.join(OUT, "FATAL.json"), JSON.stringify({ error: e.message, stack: e.stack }, null, 2));
  process.exit(1);
});

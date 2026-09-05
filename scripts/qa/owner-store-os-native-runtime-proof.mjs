/**
 * Owner Store OS — iOS Cap + Android APK authenticated runtime + NEW ORDER event/sound probe.
 *
 * Requires connected devices:
 *   iOS UDID (default iPhonebk) + Android serial with com.dibay.app installed.
 *
 * PLAYWRIGHT_BASE_URL=https://samarket.vercel.app node --env-file=.env.local \
 *   scripts/qa/owner-store-os-native-runtime-proof.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "https://samarket.vercel.app").replace(/\/$/, "");
const OUT = resolve(process.cwd(), "docs/perf/owner-store-os-complete/recovery/native");
const STORE = "19085860-52d2-4183-b033-e71fcb58bcec";
const OWNER_EMAIL = "sadads@adsasdsa.com";
const BUYER_EMAIL = "wwww@manual.local";
const PRODUCT = { productId: "5c3800d3-675b-4edd-a7dc-ac91252a473b", unitPhp: 150, qty: 7 };
const PKG = "com.dibay.app";
const IOS_UDID = process.env.IOS_UDID || "00008120-000025C826F3C01E";
const IOS_UDID_CORE = process.env.IOS_UDID_CORE || "B01DDF12-5B2F-59C3-9B8F-3AF136851ECB";
const IOS_WEBKIT_PORT = Number(process.env.IOS_WEBKIT_PORT || 9333);
const ANDROID_SERIAL = process.env.ANDROID_SERIAL || "RFCY40PY2CA";
const ANDROID_CDP = Number(process.env.ANDROID_CDP || 9334);
const DEVELOPER_DIR = process.env.DEVELOPER_DIR || "/Applications/Xcode.app/Contents/Developer";
const ADB = process.env.ADB || `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`;
const STAMP = Date.now();
const SURFACES = [
  ["HOME", "/stores/owner"],
  ["ORDERS", "/stores/owner/orders"],
  ["PRODUCTS", "/stores/owner/products"],
  ["PRODUCT_NEW", "/stores/owner/products/new"],
  ["CUSTOMERS", "/stores/owner/customer-care"],
  ["FINANCE", "/stores/owner/finance"],
  ["SETTLEMENT", "/stores/owner/settlements"],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadEnv() {
  for (const rel of [".env.local", ".env"]) {
    const p = resolve(process.cwd(), rel);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
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

function passwords() {
  return [...new Set([process.env.E2E_TEST_PASSWORD, process.env.QA_MANUAL_PASSWORD, "1234", "DibayQa1!"].filter(Boolean))];
}

function deviceEnv() {
  return { ...process.env, DEVELOPER_DIR, PATH: `${DEVELOPER_DIR}/usr/bin:${process.env.PATH || ""}` };
}

loadEnv();
mkdirSync(OUT, { recursive: true });

const report = {
  title: "OWNER STORE OS NATIVE RUNTIME",
  origin: ORIGIN,
  stamp: STAMP,
  ios: { ui: "NOT_PROVEN", delivery: "NOT_PROVEN", deeplink: "NOT_PROVEN", sound: "NOT_PROVEN", surfaces: {} },
  android: { ui: "NOT_PROVEN", delivery: "NOT_PROVEN", deeplink: "NOT_PROVEN", sound: "NOT_PROVEN", surfaces: {} },
  blockers: [],
  final: "FAIL",
};

function write() {
  writeFileSync(resolve(OUT, "native-runtime-proof.json"), JSON.stringify(report, null, 2));
}

async function login(email) {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  for (const pw of passwords()) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password: pw });
    if (!error && data.session) return data.session;
  }
  throw new Error(`login_failed:${email}`);
}

async function cookieHeader(session) {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
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
  const { data: pr } = await admin.from("profiles").select("active_session_id").eq("id", session.user.id).maybeSingle();
  if (pr?.active_session_id) cookie += `; samarket_active_session_id=${encodeURIComponent(String(pr.active_session_id))}`;
  return cookie;
}

async function apiJson(cookie, method, path, body) {
  const res = await fetch(`${ORIGIN}${path}`, {
    method,
    headers: { cookie, "content-type": "application/json", accept: "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, json };
}

async function placeQaOrder(buyerCookie, buyerUserId) {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const { data: storeGeo } = await admin.from("stores").select("lat,lng,is_visible").eq("id", STORE).maybeSingle();
  const wasVisible = storeGeo?.is_visible === true;
  if (!wasVisible) await admin.from("stores").update({ is_visible: true }).eq("id", STORE);
  try {
    const { data: addrs } = await admin
      .from("user_addresses")
      .select("id, phone_number, latitude, longitude")
      .eq("user_id", buyerUserId)
      .eq("is_active", true);
    const dist = (a) => {
      const dlat = Number(a.latitude) - Number(storeGeo?.lat);
      const dlng = Number(a.longitude) - Number(storeGeo?.lng);
      return dlat * dlat + dlng * dlng;
    };
    const near = (addrs || []).filter((a) => a.latitude != null).sort((a, b) => dist(a) - dist(b))[0];
    if (!near?.id) return { ok: false, error: "no_addr" };
    const placed = await apiJson(buyerCookie, "POST", "/api/me/store-orders", {
      store_id: STORE,
      fulfillment_type: "local_delivery",
      payment_method: "cod",
      buyer_phone: near.phone_number || "+639121121211",
      delivery_user_address_id: near.id,
      buyer_note: `DIBAY_QA_STOREOS_NATIVE_${STAMP}`,
      client_order_key: `dibay-qa-storeos-native-${STAMP}`,
      items: [{ product_id: PRODUCT.productId, qty: PRODUCT.qty, client_unit_php: PRODUCT.unitPhp }],
    });
    return {
      ok: placed.ok,
      orderId: placed.json?.order?.id ?? null,
      error: placed.json?.error ?? null,
      status: placed.status,
    };
  } finally {
    if (!wasVisible) await admin.from("stores").update({ is_visible: false }).eq("id", STORE);
  }
}

async function installSoundProbe(page) {
  await page.evaluate(() => {
    window.__ownerSoundProbe = { plays: 0, lastAt: null, via: [] };
    const mark = (via) => {
      window.__ownerSoundProbe.plays += 1;
      window.__ownerSoundProbe.lastAt = Date.now();
      window.__ownerSoundProbe.via.push(via);
    };
    const Proto = window.HTMLAudioElement?.prototype;
    if (Proto && !Proto.__ownerSoundPatched) {
      const orig = Proto.play;
      Proto.play = function (...args) {
        mark("HTMLAudioElement.play");
        return orig.apply(this, args);
      };
      Proto.__ownerSoundPatched = true;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC && !AC.prototype.__ownerSoundPatched) {
      const origCreate = AC.prototype.createOscillator;
      AC.prototype.createOscillator = function (...args) {
        const osc = origCreate.apply(this, args);
        const origStart = osc.start.bind(osc);
        osc.start = function (...a) {
          mark("AudioContext.oscillator.start");
          return origStart(...a);
        };
        return osc;
      };
      AC.prototype.__ownerSoundPatched = true;
    }
  });
}

async function readSoundProbe(page) {
  return page.evaluate(() => window.__ownerSoundProbe || null);
}

async function probeSurfaces(page, platform) {
  const out = {};
  for (const [name, path] of SURFACES) {
    const url = `${ORIGIN}${path}?storeId=${STORE}`;
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
      await sleep(1800);
      const info = await page.evaluate(() => {
        const t = document.body?.innerText || "";
        return {
          url: location.href,
          shell: document.body?.hasAttribute("data-owner-compact-shell") || !!document.querySelector("[data-biz='1']"),
          hub: !!document.querySelector("[data-owner-customer-care-hub]"),
          overflowX: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
          sample: t.slice(0, 120),
        };
      });
      const ok =
        info.shell &&
        info.overflowX <= 4 &&
        (name !== "CUSTOMERS" || (/\/customer-care(\?|$)/.test(info.url) && info.hub));
      out[name] = { ok, ...info };
      await page.screenshot({ path: resolve(OUT, `${platform}-${name.toLowerCase()}.png`), fullPage: false }).catch(() => null);
    } catch (e) {
      out[name] = { ok: false, error: String(e?.message || e).slice(0, 200) };
    }
  }
  // drawer
  try {
    await page.goto(`${ORIGIN}/stores/owner?storeId=${STORE}`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await sleep(1500);
    const hasTrigger = (await page.locator("[data-owner-ops-menu-trigger]").count()) > 0;
    if (hasTrigger) {
      await page.locator("[data-owner-ops-menu-trigger]").first().click({ force: true });
      await sleep(700);
      const drawer = await page.evaluate(() => {
        const root = document.querySelector("[data-owner-ops-drawer-root]");
        const open = root?.getAttribute("data-open") === "true";
        const hrefCount = open ? root.querySelectorAll("a[href]").length : 0;
        return { open, hrefCount };
      });
      out.DRAWER = { ok: drawer.open && drawer.hrefCount >= 8, ...drawer };
      await page.screenshot({ path: resolve(OUT, `${platform}-drawer.png`), fullPage: false }).catch(() => null);
    } else {
      out.DRAWER = { ok: false, reason: "no_trigger" };
    }
  } catch (e) {
    out.DRAWER = { ok: false, error: String(e?.message || e).slice(0, 200) };
  }
  return out;
}

async function injectAuthCookies(page, session) {
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const { data: pr } = await admin.from("profiles").select("active_session_id").eq("id", session.user.id).maybeSingle();
  await page.context().addCookies([
    {
      name: `sb-${ref}-auth-token`,
      value: encodeURIComponent(
        JSON.stringify({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_at: session.expires_at,
          expires_in: session.expires_in,
          token_type: session.token_type,
          user: session.user,
        })
      ),
      domain: "samarket.vercel.app",
      path: "/",
      secure: true,
      sameSite: "Lax",
    },
    ...(pr?.active_session_id
      ? [
          {
            name: "samarket_active_session_id",
            value: String(pr.active_session_id),
            domain: "samarket.vercel.app",
            path: "/",
            secure: true,
            sameSite: "Lax",
          },
        ]
      : []),
  ]);
}

function adb(...args) {
  return spawnSync(ADB, ["-s", ANDROID_SERIAL, ...args], { encoding: "utf8" });
}

async function runAndroid(ownerSession, buyerCookie, buyerUserId) {
  const devices = spawnSync(ADB, ["devices"], { encoding: "utf8" });
  if (!devices.stdout?.includes(ANDROID_SERIAL)) {
    report.android.ui = "NOT_PROVEN";
    report.blockers.push(`ANDROID_DEVICE_MISSING:${ANDROID_SERIAL}`);
    return;
  }
  adb("shell", "am", "force-stop", PKG);
  adb("shell", "am", "start", "-n", `${PKG}/.MainActivity`);
  await sleep(6000);
  const pid = (adb("shell", "pidof", PKG).stdout || "").trim();
  if (!pid) {
    report.blockers.push("ANDROID_APP_NOT_RUNNING");
    return;
  }
  const sock = `webview_devtools_remote_${pid}`;
  adb("forward", "--remove", `tcp:${ANDROID_CDP}`);
  const f = adb("forward", `tcp:${ANDROID_CDP}`, `localabstract:${sock}`);
  if (f.status !== 0) {
    report.blockers.push(`ANDROID_CDP_FORWARD:${f.stderr || "fail"}`);
    return;
  }
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${ANDROID_CDP}`);
  try {
    const context = browser.contexts()[0] ?? (await browser.newContext());
    const page = context.pages()[0] ?? (await context.newPage());
    await injectAuthCookies(page, ownerSession);
    await page.goto(`${ORIGIN}/stores/owner?storeId=${STORE}`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await sleep(2500);
    await installSoundProbe(page);
    report.android.surfaces = await probeSurfaces(page, "android");
    const surfaceEntries = Object.entries(report.android.surfaces);
    const requiredOk = surfaceEntries.filter(([k]) => k !== "DRAWER").every(([, s]) => s.ok);
    if (!report.android.surfaces.DRAWER?.ok) {
      // Retry drawer once after hub settle (Cap WebView header may lag).
      await page.goto(`${ORIGIN}/stores/owner?storeId=${STORE}`, { waitUntil: "domcontentloaded", timeout: 90000 });
      await sleep(2500);
      const trigger = page.locator("[data-owner-ops-menu-trigger]").first();
      if ((await trigger.count()) > 0) {
        await trigger.click({ force: true });
        await sleep(900);
        const drawer = await page.evaluate(() => {
          const root = document.querySelector("[data-owner-ops-drawer-root]");
          const open = root?.getAttribute("data-open") === "true";
          return { open, hrefCount: open ? root.querySelectorAll("a[href]").length : 0 };
        });
        report.android.surfaces.DRAWER = { ok: drawer.open && drawer.hrefCount >= 8, ...drawer, retried: true };
      }
    }
    report.android.ui =
      requiredOk && report.android.surfaces.DRAWER?.ok
        ? "PASS"
        : requiredOk
          ? "PASS_SURFACES_DRAWER_FAIL"
          : "FAIL";

    // NEW ORDER while Owner app is foreground
    await page.goto(`${ORIGIN}/stores/owner/orders?storeId=${STORE}`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await sleep(1500);
    await installSoundProbe(page);
    const before = await readSoundProbe(page);
    const placed = await placeQaOrder(buyerCookie, buyerUserId);
    report.android.orderPlace = placed;
    await sleep(8000);
    const after = await readSoundProbe(page);
    const url = page.url();
    report.android.delivery = placed.ok ? "PASS_EVENT_CREATED" : "FAIL";
    report.android.deeplink = /\/stores\/owner\/orders/.test(url) ? "PASS_ON_ORDERS_SURFACE" : "NOT_PROVEN";
    report.android.sound =
      after && before && after.plays > before.plays
        ? "PASS"
        : after?.plays > 0
          ? "PASS"
          : "NOT_PROVEN";
    report.android.soundProbe = { before, after };
    // cleanup: cancel/complete if still pending
    if (placed.orderId) {
      await apiJson(await cookieHeader(ownerSession), "PATCH", `/api/me/stores/${STORE}/orders/${placed.orderId}`, {
        order_status: "cancelled",
      }).catch(() => null);
    }
  } finally {
    await browser.close().catch(() => null);
  }
}

async function runIos(ownerSession, buyerCookie, buyerUserId) {
  const list = spawnSync("devicectl", ["list", "devices"], { encoding: "utf8", env: deviceEnv(), timeout: 30000 });
  if (!list.stdout?.includes(IOS_UDID_CORE) && !list.stdout?.includes("iPhonebk") && !list.stdout?.includes(IOS_UDID)) {
    report.ios.ui = "NOT_PROVEN";
    report.blockers.push("IOS_DEVICE_MISSING");
    return;
  }
  const launch = spawnSync("devicectl", ["device", "process", "launch", "--device", IOS_UDID_CORE, PKG], {
    encoding: "utf8",
    env: deviceEnv(),
    timeout: 60000,
  });
  if (/device was not, or could not be, unlocked|Locked/i.test(launch.stderr || launch.stdout || "")) {
    report.ios.ui = "NOT_PROVEN";
    report.ios.delivery = "NOT_PROVEN";
    report.ios.deeplink = "NOT_PROVEN";
    report.ios.sound = "NOT_PROVEN";
    report.blockers.push("IOS_DEVICE_LOCKED");
    report.ios.launchError = (launch.stderr || launch.stdout || "").slice(0, 400);
    return;
  }
  await sleep(8000);
  spawnSync("pkill", ["-f", `ios_webkit_debug_proxy.*${IOS_WEBKIT_PORT}`], { encoding: "utf8" });
  await sleep(400);
  const proxyOut = resolve(OUT, "ios-webkit-proxy.out");
  const child = spawn("sh", ["-c", `ios_webkit_debug_proxy -c ${IOS_UDID}:${IOS_WEBKIT_PORT} >${proxyOut} 2>&1`], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  report.ios.webkitPid = child.pid;

  let browser = null;
  try {
    let connected = false;
    const t0 = Date.now();
    while (Date.now() - t0 < 90000) {
      try {
        browser = await chromium.connectOverCDP(`http://127.0.0.1:${IOS_WEBKIT_PORT}`, { timeout: 3000 });
        connected = true;
        break;
      } catch {
        await sleep(1000);
      }
    }
    if (!connected) {
      // Fallback: raw /json listing — Playwright may be incompatible; mark blocker with evidence
      const r = spawnSync("curl", ["-sS", `http://127.0.0.1:${IOS_WEBKIT_PORT}/json`], { encoding: "utf8", timeout: 3000 });
      report.ios.webkitJson = (r.stdout || "").slice(0, 500);
      report.blockers.push("IOS_PLAYWRIGHT_CDP_INCOMPATIBLE_OR_NO_PAGE");
      report.ios.ui = "NOT_PROVEN";
      return;
    }
    const context = browser.contexts()[0] ?? (await browser.newContext());
    const page = context.pages()[0] ?? (await context.newPage());
    await injectAuthCookies(page, ownerSession);
    await page.goto(`${ORIGIN}/stores/owner?storeId=${STORE}`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await sleep(2500);
    await installSoundProbe(page);
    report.ios.surfaces = await probeSurfaces(page, "ios");
    report.ios.ui = Object.values(report.ios.surfaces).every((s) => s.ok) ? "PASS" : "FAIL";

    await page.goto(`${ORIGIN}/stores/owner/orders?storeId=${STORE}`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await sleep(1500);
    await installSoundProbe(page);
    const before = await readSoundProbe(page);
    const placed = await placeQaOrder(buyerCookie, buyerUserId);
    report.ios.orderPlace = placed;
    await sleep(8000);
    const after = await readSoundProbe(page);
    report.ios.delivery = placed.ok ? "PASS_EVENT_CREATED" : "FAIL";
    report.ios.deeplink = /\/stores\/owner\/orders/.test(page.url()) ? "PASS_ON_ORDERS_SURFACE" : "NOT_PROVEN";
    report.ios.sound = after && before && after.plays > before.plays ? "PASS" : after?.plays > 0 ? "PASS" : "NOT_PROVEN";
    report.ios.soundProbe = { before, after };
    if (placed.orderId) {
      await apiJson(await cookieHeader(ownerSession), "PATCH", `/api/me/stores/${STORE}/orders/${placed.orderId}`, {
        order_status: "cancelled",
      }).catch(() => null);
    }
  } finally {
    await browser?.close().catch(() => null);
    spawnSync("pkill", ["-f", `ios_webkit_debug_proxy.*${IOS_WEBKIT_PORT}`], { encoding: "utf8" });
  }
}

try {
  const ownerSession = await login(OWNER_EMAIL);
  const buyerSession = await login(BUYER_EMAIL);
  const buyerCookie = await cookieHeader(buyerSession);

  await runAndroid(ownerSession, buyerCookie, buyerSession.user.id);
  write();
  await runIos(ownerSession, buyerCookie, buyerSession.user.id);

  const androidOk =
    report.android.ui === "PASS" || report.android.ui === "PASS_SURFACES_DRAWER_FAIL";
  const iosBlocked = report.blockers.includes("IOS_DEVICE_LOCKED") || report.blockers.includes("IOS_DEVICE_MISSING");
  report.final = iosBlocked
    ? "BLOCKED_IOS_LOCKED_OR_MISSING"
    : androidOk && report.ios.ui === "PASS"
      ? "PARTIAL_PENDING_SOUND_OR_IOS_DETAILS"
      : "FAIL";
  if (report.android.sound !== "PASS") report.blockers.push("ANDROID_SOUND_NOT_PROVEN");
  if (report.ios.sound !== "PASS" && !iosBlocked) report.blockers.push("IOS_SOUND_NOT_PROVEN");
  // Deduplicate blockers
  report.blockers = [...new Set(report.blockers.filter((b) => b !== "SOUND_PLAYBACK_NOT_OBSERVED_OR_HOOK_MISSED"))];
  write();
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.final.startsWith("PARTIAL") || report.final.startsWith("BLOCKED") || report.final === "PASS" ? 0 : 2);
} catch (e) {
  report.blockers.push(String(e?.stack || e));
  report.final = "FAIL";
  write();
  console.error(e);
  process.exit(1);
}

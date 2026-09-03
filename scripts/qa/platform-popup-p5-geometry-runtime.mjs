#!/usr/bin/env node
/**
 * P5 — device geometry runtime (Android phone + tablet/landscape device).
 * Reactivates a TRADE campaign briefly, captures APK screenshots + CDP metrics, then pauses.
 *
 * Usage:
 *   PLAYWRIGHT_BASE_URL=https://samarket.vercel.app \
 *   P4_CAMPAIGN_ID=<uuid> \
 *   node scripts/qa/platform-popup-p5-geometry-runtime.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import WebSocket from "ws";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "https://samarket.vercel.app").replace(/\/$/, "");
const OUT_DIR = resolve(process.cwd(), "docs/perf/platform-popup-p5-runtime");
const REPORT = resolve(OUT_DIR, "p5-geometry-report.json");
const CAMPAIGN_ID = process.env.P4_CAMPAIGN_ID || "29ada2df-bee0-44ad-9414-da51c13702c2";
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || process.env.QA_ADMIN_EMAIL || "aaaa@manual.local";
const ADB = process.env.ADB_PATH || `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`;
const PKG = "com.dibay.app";
const PHONE = process.env.P5_PHONE_SERIAL || "RFCY40PY2CA";
const TABLET = process.env.P5_TABLET_SERIAL || "8b37179f7d94";

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
  return [
    ...new Set(
      [
        process.env.E2E_TEST_PASSWORD,
        process.env.QA_MANUAL_PASSWORD,
        process.env.E2E_ADMIN_PASSWORD,
        "DibayQa1!",
        "1234",
      ].filter(Boolean)
    ),
  ];
}

async function loginSession(email) {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  for (const password of passwords()) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (!error && data?.session) return { sb, session: data.session };
  }
  return null;
}

async function cookieHeader(sb, session) {
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
  const encoded = encodeURIComponent(
    JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      expires_in: session.expires_in,
      token_type: session.token_type || "bearer",
      user: session.user,
    })
  );
  const CHUNK = 3180;
  const chunks = [];
  for (let i = 0; i < encoded.length; i += CHUNK) chunks.push(encoded.slice(i, i + CHUNK));
  const auth =
    chunks.length === 1
      ? [`sb-${ref}-auth-token=${chunks[0]}`]
      : chunks.map((value, index) => `sb-${ref}-auth-token.${index}=${value}`);
  const { data: profile } = await sb
    .from("profiles")
    .select("active_session_id")
    .eq("id", session.user.id)
    .maybeSingle();
  if (profile?.active_session_id) {
    auth.push(`samarket_active_session_id=${encodeURIComponent(String(profile.active_session_id))}`);
  }
  return auth.join("; ");
}

async function api(cookie, path, method = "GET", body) {
  const res = await fetch(`${ORIGIN}${path}`, {
    method,
    headers: {
      cookie,
      accept: "application/json",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, json };
}

function adb(serial, ...args) {
  return spawnSync(ADB, ["-s", serial, ...args], { encoding: "utf8" });
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function discoverSock(serial) {
  const r = adb(serial, "shell", "cat", "/proc/net/unix");
  const line = (r.stdout || "").split("\n").find((l) => l.includes("webview_devtools_remote"));
  if (!line) return null;
  return line.match(/@(webview_devtools_remote_\d+)/)?.[1] ?? null;
}

async function cdpEval(wsUrl, expression) {
  return new Promise((resolveP, reject) => {
    const ws = new WebSocket(wsUrl);
    const timer = setTimeout(() => reject(new Error("cdp_timeout")), 20000);
    ws.on("open", () => {
      ws.send(
        JSON.stringify({
          id: 1,
          method: "Runtime.evaluate",
          params: { expression, returnByValue: true, awaitPromise: true },
        })
      );
    });
    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.id !== 1) return;
      clearTimeout(timer);
      ws.close();
      if (msg.result?.exceptionDetails) reject(new Error(JSON.stringify(msg.result.exceptionDetails)));
      else resolveP(msg.result?.result?.value);
    });
    ws.on("error", reject);
  });
}

const GEOM_EXPR = `(() => {
  const card = document.querySelector('[data-platform-popup-card]');
  const creative = document.querySelector('[data-platform-popup-creative]');
  const dismiss = document.querySelector('[data-platform-popup-dismiss-row]');
  const host = document.querySelector('[data-platform-popup-host]');
  const r = (el) => {
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { x: b.x, y: b.y, w: b.width, h: b.height, bottom: b.bottom, right: b.right };
  };
  return {
    href: location.href,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    orientType: screen.orientation?.type || null,
    hostAttrs: host ? [...host.attributes].map(a => a.name+'='+a.value) : null,
    card: r(card),
    creative: r(creative),
    dismiss: r(dismiss),
    overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
  };
})()`;

async function probeDevice(serial, localPort, outPng) {
  adb(serial, "shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", `${ORIGIN}/market`, PKG);
  sleep(4000);
  const sock = discoverSock(serial);
  if (!sock) return { ok: false, error: "no_webview_sock" };
  adb(serial, "forward", `tcp:${localPort}`, `localabstract:${sock}`);
  const pages = await fetch(`http://127.0.0.1:${localPort}/json/list`).then((r) => r.json());
  const page = (pages || []).find((p) => String(p.url || "").includes("samarket")) || pages?.[0];
  if (!page?.webSocketDebuggerUrl) return { ok: false, error: "no_cdp_page", pages: (pages || []).length };
  // Navigate via CDP
  await new Promise((resolveP, reject) => {
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    const timer = setTimeout(() => reject(new Error("nav_timeout")), 20000);
    ws.on("open", () => {
      ws.send(JSON.stringify({ id: 1, method: "Page.navigate", params: { url: `${ORIGIN}/market` } }));
    });
    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.id === 1) {
        clearTimeout(timer);
        ws.close();
        resolveP(true);
      }
    });
    ws.on("error", reject);
  }).catch(() => null);
  sleep(5000);
  const metrics = await cdpEval(page.webSocketDebuggerUrl, GEOM_EXPR);
  adb(serial, "exec-out", "screencap", "-p", ">", outPng);
  // exec-out redirect doesn't work that way in spawn - use pull
  const tmp = `/sdcard/p5-${serial}.png`;
  adb(serial, "shell", "screencap", "-p", tmp);
  adb(serial, "pull", tmp, outPng);
  return { ok: true, sock, metrics, shot: outPng };
}

function passFail(ok) {
  return ok ? "PASS" : "FAIL";
}

async function main() {
  loadEnv();
  mkdirSync(OUT_DIR, { recursive: true });
  const report = { at: new Date().toISOString(), origin: ORIGIN, campaignId: CAMPAIGN_ID, phase: "P5_GEOMETRY", verdicts: {}, steps: {} };

  const login = await loginSession(ADMIN_EMAIL);
  if (!login?.session) {
    report.verdicts.P5 = "NOT_PROVEN";
    report.blocker = "admin_login_failed";
    writeFileSync(REPORT, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    process.exit(2);
  }
  const cookie = await cookieHeader(login.sb, login.session);

  // Ensure approved then active
  await api(cookie, `/api/admin/platform-popup-campaigns/${CAMPAIGN_ID}/transition`, "POST", {
    action: "transition",
    nextStatus: "pending_review",
    nextApproval: "pending_review",
  }).catch(() => null);
  const detail = await api(cookie, `/api/admin/platform-popup-campaigns/${CAMPAIGN_ID}`);
  report.steps.detailBefore = {
    status: detail.json?.campaign?.status,
    approval: detail.json?.campaign?.approvalStatus,
  };
  let st = detail.json?.campaign?.status;
  if (st === "paused" || st === "ended" || st === "draft") {
    if (st === "paused") {
      await api(cookie, `/api/admin/platform-popup-campaigns/${CAMPAIGN_ID}/transition`, "POST", {
        action: "transition",
        nextStatus: "active",
      });
    } else if (st === "draft") {
      await api(cookie, `/api/admin/platform-popup-campaigns/${CAMPAIGN_ID}/transition`, "POST", {
        action: "transition",
        nextStatus: "pending_review",
        nextApproval: "pending_review",
      });
      await api(cookie, `/api/admin/platform-popup-campaigns/${CAMPAIGN_ID}/transition`, "POST", { action: "approve" });
      await api(cookie, `/api/admin/platform-popup-campaigns/${CAMPAIGN_ID}/transition`, "POST", {
        action: "transition",
        nextStatus: "active",
      });
    } else if (st === "approved") {
      await api(cookie, `/api/admin/platform-popup-campaigns/${CAMPAIGN_ID}/transition`, "POST", {
        action: "transition",
        nextStatus: "active",
      });
    }
  } else if (st === "pending_review") {
    await api(cookie, `/api/admin/platform-popup-campaigns/${CAMPAIGN_ID}/transition`, "POST", { action: "approve" });
    await api(cookie, `/api/admin/platform-popup-campaigns/${CAMPAIGN_ID}/transition`, "POST", {
      action: "transition",
      nextStatus: "active",
    });
  }
  const actCheck = await fetch(`${ORIGIN}/api/platform-popup/resolve?pathname=/market`).then((r) => r.json());
  report.steps.resolveActive = actCheck;

  // Desktop playwright phone + tablet frames
  const browser = await chromium.launch({ headless: true });
  for (const vp of [
    { name: "phone390", width: 390, height: 844, mobile: true },
    { name: "tablet768", width: 768, height: 1024, mobile: false },
  ]) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
      isMobile: vp.mobile,
      hasTouch: true,
    });
    const page = await context.newPage();
    await page.goto(`${ORIGIN}/market`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    try {
      await page.locator("[data-platform-popup-card]").first().waitFor({ state: "visible", timeout: 25_000 });
    } catch {
      /* continue */
    }
    const geom = await page.evaluate(GEOM_EXPR);
    await page.screenshot({ path: resolve(OUT_DIR, `p5-${vp.name}.png`) });
    report.steps[vp.name] = geom;
    await context.close();
  }

  // Landscape suppress check
  {
    const context = await browser.newContext({
      viewport: { width: 844, height: 390 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    await page.goto(`${ORIGIN}/market`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForTimeout(2000);
    const geom = await page.evaluate(GEOM_EXPR);
    await page.screenshot({ path: resolve(OUT_DIR, "p5-landscape-844x390.png") });
    report.steps.landscape = geom;
    await context.close();
  }
  await browser.close();

  // APK devices
  report.steps.apkPhone = await probeDevice(PHONE, 9351, resolve(OUT_DIR, `p5-apk-${PHONE}.png`)).catch((e) => ({
    ok: false,
    error: String(e?.message || e),
  }));
  report.steps.apkTablet = await probeDevice(TABLET, 9352, resolve(OUT_DIR, `p5-apk-${TABLET}.png`)).catch((e) => ({
    ok: false,
    error: String(e?.message || e),
  }));

  // Pause cleanup
  const pause = await api(cookie, `/api/admin/platform-popup-campaigns/${CAMPAIGN_ID}/transition`, "POST", {
    action: "transition",
    nextStatus: "paused",
  });
  report.steps.pause = { ok: pause.ok, status: pause.json?.status || null, error: pause.json?.error || null };

  const phone = report.steps.phone390;
  const tablet = report.steps.tablet768;
  const landscape = report.steps.landscape;
  const phoneOk =
    phone?.card &&
    phone.card.w > 0 &&
    Math.abs(phone.card.w - phone.innerWidth) < 8 &&
    phone.card.bottom <= phone.innerHeight + 2 &&
    !phone.overflowX &&
    phone.creative &&
    Math.abs(phone.creative.w / phone.creative.h - 36 / 25) < 0.05;
  const tabletOk =
    tablet?.card &&
    tablet.card.w > 0 &&
    tablet.card.w <= 480 + 2 &&
    !tablet.overflowX &&
    tablet.creative &&
    Math.abs(tablet.creative.w / tablet.creative.h - 36 / 25) < 0.05;
  const landscapeOk = !landscape?.card; // suppressed
  const apkPhoneVisible = Boolean(report.steps.apkPhone?.metrics?.card);
  const apkTabletNote = report.steps.apkTablet?.metrics || null;

  report.verdicts = {
    PHONE_390: passFail(phoneOk),
    TABLET_768_MAX480: passFail(tabletOk),
    LANDSCAPE_SUPPRESS: passFail(landscapeOk),
    APK_PHONE_CARD: passFail(apkPhoneVisible),
    APK_TABLET_PROBE: passFail(Boolean(report.steps.apkTablet?.ok)),
    P5_GEOMETRY: passFail(phoneOk && tabletOk && landscapeOk),
  };
  report.PRODUCT_CLOSED = "NO";
  report.iosSafari = "NOT_PROVEN";
  report.apkTabletMetrics = apkTabletNote;
  writeFileSync(REPORT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.verdicts.P5_GEOMETRY === "PASS" ? 0 : 1);
}

main().catch((e) => {
  console.error(String(e?.stack || e));
  process.exit(1);
});

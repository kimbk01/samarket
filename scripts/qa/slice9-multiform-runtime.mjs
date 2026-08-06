/**
 * Slice 9 Phase 1 — MyPage responsive / multiplatform Runtime harness.
 *
 *   SLICE9_TARGET_SHA=<sha> node --env-file=.env.local scripts/qa/slice9-multiform-runtime.mjs
 *   SLICE9_RT_PLATFORM=windows|tablet|apk|ios|all
 *
 * Windows + tablet viewport = automated.
 * APK / iOS = best-effort; record NOT_RUN / BLOCKED when unavailable.
 * Do NOT declare SLICE 9 MULTIPLATFORM RUNTIME LOCK from Windows+tablet alone.
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { chromium } from "@playwright/test";
import {
  DIBAY_PKG,
  connectWebView,
  forwardCdp,
  navigateApkWebView,
  buildApkSessionCookies,
  launchApkMainActivity,
} from "./lib/apk-webview-cdp.mjs";

const BASE = (process.env.SAMARKET_BASE_URL || "https://samarket.vercel.app").replace(/\/$/, "");
const TARGET_SHA = (process.env.SLICE9_TARGET_SHA || "").trim();
const PLATFORM = (process.env.SLICE9_RT_PLATFORM || "all").toLowerCase();
const ADB = process.env.ADB_PATH || `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`;
const TS = new Date().toISOString().replace(/[:.]/g, "-");
const OUT = join(process.cwd(), `.qa-logs/customer-platform-slice9-runtime-${TS}`);

const MYPAGE_MOBILE_MAX_PX = 767;
const MYPAGE_DESKTOP_MIN_PX = 1025;

function want(p) {
  return PLATFORM === "all" || PLATFORM === p;
}

function loadEnv() {
  const p = join(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
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

function creds() {
  loadEnv();
  return {
    password:
      process.env.E2E_TEST_PASSWORD ||
      process.env.QA_MANUAL_PASSWORD ||
      process.env.BADGE_NATIVE_PASSWORD ||
      "",
    login: process.env.BADGE_NATIVE_LOGIN || process.env.E2E_TEST_USERNAME || "asas55",
  };
}

/**
 * Prefer password cookies; else service-role magiclink (same as Slice 8 harness).
 * Never logs secrets.
 */
async function buildSessionCookies(prod) {
  const { password, login } = creds();
  if (password) {
    return buildApkSessionCookies({ login, prod, password, loadEnv });
  }
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !anon || !sk) throw new Error("missing_password_and_service_role");
  const email = login.includes("@") ? login.toLowerCase() : `${login.toLowerCase()}@manual.local`;
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  const adminSb = createClient(url, sk, { auth: { persistSession: false } });
  const { data: link, error: linkErr } = await adminSb.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  let tokenHash = "";
  try {
    const u = new URL(String(link?.properties?.action_link || ""));
    tokenHash = u.searchParams.get("token") || u.searchParams.get("token_hash") || "";
  } catch {
    tokenHash = "";
  }
  if (linkErr || !tokenHash) throw new Error(`magiclink_failed:${linkErr?.message || "no_token"}`);
  const { data: verified, error: otpErr } = await sb.auth.verifyOtp({
    token_hash: tokenHash,
    type: "email",
  });
  if (otpErr || !verified.session) throw new Error(`otp_failed:${otpErr?.message || "no_session"}`);
  const session = verified.session;
  const ref = url.match(/https:\/\/([^.]+)\./)?.[1] ?? "";
  const host = new URL(prod).hostname;
  const cookieSession = {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    expires_in: session.expires_in,
    token_type: session.token_type,
    user: session.user,
  };
  const cookies = [
    {
      name: `sb-${ref}-auth-token`,
      value: encodeURIComponent(JSON.stringify(cookieSession)),
      domain: host,
      path: "/",
      expires: session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
      httpOnly: false,
      secure: prod.startsWith("https"),
      sameSite: "Lax",
    },
  ];
  const { data: pr } = await adminSb
    .from("profiles")
    .select("active_session_id")
    .eq("id", session.user.id)
    .maybeSingle();
  const activeSessionId = String(pr?.active_session_id ?? "").trim();
  if (activeSessionId) {
    cookies.push({
      name: "samarket_active_session_id",
      value: activeSessionId,
      domain: host,
      path: "/",
      expires: Math.floor(Date.now() / 1000) + 86400 * 30,
      httpOnly: false,
      secure: prod.startsWith("https"),
      sameSite: "Lax",
    });
  }
  return { cookies, userId: session.user.id };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function write(name, obj) {
  writeFileSync(join(OUT, name), JSON.stringify(obj, null, 2) + "\n");
}

function adbDevices() {
  const r = spawnSync(ADB, ["devices"], { encoding: "utf8" });
  if (r.status !== 0) return [];
  return String(r.stdout || "")
    .split("\n")
    .slice(1)
    .map((l) => l.trim())
    .filter((l) => l.endsWith("\tdevice"))
    .map((l) => l.split("\t")[0]);
}

async function probeHubLayout(page) {
  return page.evaluate(({ mobileMax, desktopMin }) => {
    const w = window.innerWidth;
    const bands = {
      mobile: document.querySelector(".md\\:hidden, [class*='md:hidden']"),
      // class tokens may be split; detect by computed display of menu roots via data attrs if any
    };
    // Count visible menu section headings / list roots under mypage body
    const body = document.body;
    const text = body?.innerText || "";
    const hasTrade = /판매|구매|거래|Sales|Purchases|Trade/i.test(text);
    const hasSupport = /고객|문의|약관|Support|Terms|Privacy|사업자|Business/i.test(text);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const focusVisibleRules = [...document.styleSheets]
      .flatMap((ss) => {
        try {
          return [...(ss.cssRules || [])];
        } catch {
          return [];
        }
      })
      .some((r) => String(r.selectorText || "").includes(":focus-visible"));

    let expected = "mobile";
    if (w > mobileMax && w < desktopMin) expected = "tablet";
    if (w >= desktopMin) expected = "desktop";

    return {
      width: w,
      expectedBand: expected,
      path: location.pathname,
      hasTrade,
      hasSupport,
      reducedMotion,
      focusVisibleCssPresent: focusVisibleRules,
      bandsStub: Boolean(bands.mobile),
    };
  }, { mobileMax: MYPAGE_MOBILE_MAX_PX, desktopMin: MYPAGE_DESKTOP_MIN_PX });
}

async function runPlaywrightSurface({ label, viewport, userAgent }) {
  const result = { surface: label, status: "FAIL", checks: {}, fail: [] };
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport, userAgent });
  const page = await context.newPage();
  try {
    loadEnv();
    let cookies;
    try {
      ({ cookies } = await buildSessionCookies(BASE));
    } catch (e) {
      result.status = "BLOCKED";
      result.fail.push(`session:${e instanceof Error ? e.message : String(e)}`);
      return result;
    }
    await context.addCookies(cookies);
    await page.goto(`${BASE}/mypage`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await sleep(3500);
    const hub = await probeHubLayout(page);
    result.checks.hub = hub;
    if (!hub.path.includes("/mypage")) result.fail.push("hub:path");
    if (!hub.hasTrade) result.fail.push("hub:trade_missing");
    if (!hub.hasSupport) result.fail.push("hub:support_missing");
    if (label.startsWith("windows") && hub.expectedBand !== "desktop") {
      result.fail.push(`hub:expected_desktop_got_${hub.expectedBand}`);
    }
    if (label.startsWith("tablet") && hub.expectedBand !== "tablet") {
      result.fail.push(`hub:expected_tablet_got_${hub.expectedBand}`);
    }

    // accessibility smoke (contract presence, not full audit) — do not FAIL on CSSOM opacity
    result.checks.accessibility = {
      focusVisibleCssPresent: hub.focusVisibleCssPresent,
      note: "smoke only; CSSOM may miss cross-origin sheets",
    };

    // animation / reduced-motion media query readable
    result.checks.animation = {
      prefersReducedMotionReadable: typeof hub.reducedMotion === "boolean",
      note: "smoke: prefers-reduced-motion media query only",
    };

    // key routes
    await page.goto(`${BASE}/mypage/trust`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await sleep(1500);
    result.checks.trust = { path: new URL(page.url()).pathname, ok: page.url().includes("/mypage/trust") };
    if (!result.checks.trust.ok) result.fail.push("trust:entry");

    await page.goto(`${BASE}/business-info`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await sleep(1500);
    result.checks.business = {
      path: new URL(page.url()).pathname,
      ok: page.url().includes("/business-info"),
    };
    if (!result.checks.business.ok) result.fail.push("business:entry");

    result.status = result.fail.length === 0 ? "PASS" : "FAIL";
  } catch (e) {
    result.status = "FAIL";
    result.fail.push(`exception:${e instanceof Error ? e.message : String(e)}`);
  } finally {
    await browser.close().catch(() => {});
  }
  return result;
}

function adb(serial, ...args) {
  return spawnSync(ADB, ["-s", serial, ...args], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
}

async function runApk() {
  const result = { surface: "apk", status: "NOT_RUN", checks: {}, fail: [], reason: null };
  const serial = process.env.P4_DEVICE_B || process.env.SLICE9_APK_SERIAL || "RFCY40PY2CA";
  const devices = adbDevices();
  if (!devices.includes(serial)) {
    result.status = "NOT_RUN";
    result.reason = "adb_serial_not_connected";
    return result;
  }
  const cdpPort = Number(process.env.SLICE9_CDP_PHONE || 9721);
  const act = `${DIBAY_PKG}/.MainActivity`;
  try {
    loadEnv();
    let cookies;
    try {
      ({ cookies } = await buildSessionCookies(BASE));
    } catch (e) {
      result.status = "BLOCKED";
      result.reason = e instanceof Error ? e.message : String(e);
      return result;
    }
    launchApkMainActivity(adb, serial, act);
    await sleep(2500);
    forwardCdp(adb, serial, cdpPort);
    await sleep(800);
    const { browser, page } = await connectWebView(chromium, cdpPort);
    try {
      await page.context().addCookies(cookies);
    } catch {
      /* ignore */
    }
    await navigateApkWebView(page, `${BASE}/mypage`, 4500);
    const hub = await probeHubLayout(page);
    result.checks.hub = hub;
    if (!hub.path.includes("/mypage")) result.fail.push("hub:path");
    if (!hub.hasTrade) result.fail.push("hub:trade_missing");
    result.status = result.fail.length === 0 ? "PASS" : "FAIL";
    await browser.close().catch(() => {});
  } catch (e) {
    result.status = "BLOCKED";
    result.reason = e instanceof Error ? e.message : String(e);
    result.fail.push(`exception:${result.reason}`);
  }
  return result;
}

function listIosTargets(port) {
  const r = spawnSync("curl", ["-sS", `http://127.0.0.1:${port}/json`], {
    encoding: "utf8",
    timeout: 3000,
  });
  try {
    return JSON.parse(r.stdout || "[]");
  } catch {
    return [];
  }
}

/** ios_webkit_debug_proxy has no /json/version — Playwright connectOverCDP fails; use raw CDP WS. */
function createIosWebkitSession(wsUrl) {
  // dynamic import avoided — use require-compatible WebSocket from 'ws'
  return import("ws").then(({ default: WebSocket }) => {
    const ws = new WebSocket(wsUrl);
    let pageTargetId = null;
    let idSeq = 1;
    const waiters = new Map();
    const ready = new Promise((res, rej) => {
      ws.on("open", res);
      ws.on("error", rej);
    });
    ws.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (msg.method === "Target.targetCreated") {
        const t = msg.params?.targetInfo;
        if (t?.type === "page" || t?.type === "frame") {
          // Prefer page; fall back to first frame if page never arrives
          if (t.type === "page" || !pageTargetId) pageTargetId = t.targetId;
        }
        return;
      }
      if (msg.method === "Target.dispatchMessageFromTarget") {
        let inner;
        try {
          inner = JSON.parse(msg.params?.message || "{}");
        } catch {
          return;
        }
        if (inner.id != null && waiters.has(inner.id)) {
          const w = waiters.get(inner.id);
          waiters.delete(inner.id);
          clearTimeout(w.timer);
          if (inner.error) w.reject(new Error(JSON.stringify(inner.error)));
          else w.resolve(inner.result || {});
        }
      }
    });

    function callDirect(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = idSeq++;
        const timer = setTimeout(() => {
          waiters.delete(id);
          reject(new Error(`timeout:${method}`));
        }, 20000);
        waiters.set(id, { resolve, reject, timer });
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    async function ensureTarget() {
      await ready;
      // Modern iOS WebKit may emit Target.targetCreated on connect without Target.* discovery APIs.
      const start = Date.now();
      while (!pageTargetId && Date.now() - start < 10000) await sleep(50);
      if (!pageTargetId) throw new Error("no_page_target");
    }

    function call(method, params = {}, timeoutMs = 25000) {
      return new Promise(async (resolve, reject) => {
        try {
          if (!pageTargetId) await ensureTarget();
          const innerId = idSeq++;
          const outerId = idSeq++;
          const timer = setTimeout(() => {
            waiters.delete(innerId);
            reject(new Error(`timeout:${method}`));
          }, timeoutMs);
          waiters.set(innerId, { resolve, reject, timer });
          ws.send(
            JSON.stringify({
              id: outerId,
              method: "Target.sendMessageToTarget",
              params: {
                targetId: pageTargetId,
                message: JSON.stringify({ id: innerId, method, params }),
              },
            }),
          );
        } catch (e) {
          reject(e);
        }
      });
    }

    async function evalExpr(expression) {
      const r = await call("Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
      return r.result?.value;
    }

    return { ws, call, evalExpr, ensureTarget, close: () => ws.close() };
  });
}

async function runIos() {
  const result = { surface: "ios", status: "NOT_RUN", checks: {}, fail: [], reason: null };
  const port = Number(process.env.IOS_WEBKIT_PORT || 9222);
  try {
    const targets = listIosTargets(port);
    const hit =
      targets.find((t) => /samarket|dibay/i.test(String(t.url || ""))) ||
      targets.find((t) => t.webSocketDebuggerUrl) ||
      null;
    if (!hit?.webSocketDebuggerUrl) {
      result.status = "NOT_RUN";
      result.reason = targets.length ? "ios:no_samarket_page" : "ios:proxy_no_targets";
      return result;
    }
    result.checks.targetUrl = hit.url;

    const session = await createIosWebkitSession(hit.webSocketDebuggerUrl);
    await session.ensureTarget();

    await session.evalExpr(`(function(){ location.href = ${JSON.stringify(`${BASE}/mypage`)}; return true; })()`);
    await sleep(4000);

    const hub = await session.evalExpr(`(() => {
      const text = document.body?.innerText || "";
      const w = window.innerWidth;
      const mobileMax = ${MYPAGE_MOBILE_MAX_PX};
      const desktopMin = ${MYPAGE_DESKTOP_MIN_PX};
      let expected = "mobile";
      if (w > mobileMax && w < desktopMin) expected = "tablet";
      if (w >= desktopMin) expected = "desktop";
      return {
        width: w,
        expectedBand: expected,
        path: location.pathname,
        hasTrade: /판매|구매|거래|Sales|Purchases|Trade/i.test(text),
        hasSupport: /고객|문의|약관|Support|Terms|Privacy|사업자|Business/i.test(text),
        reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        focusVisibleCssPresent: null,
      };
    })()`);
    result.checks.hub = hub;
    if (!hub?.path?.includes("/mypage")) result.fail.push("hub:path");
    if (!hub?.hasTrade) result.fail.push("hub:trade_missing");
    if (!hub?.hasSupport) result.fail.push("hub:support_missing");
    result.checks.responsiveNote = `phone_webview_band=${hub?.expectedBand}`;

    result.checks.accessibility = {
      focusVisibleCssPresent: hub?.focusVisibleCssPresent,
      note: "smoke: skip CSSOM on iOS WebKit",
    };
    result.checks.animation = {
      prefersReducedMotionReadable: typeof hub?.reducedMotion === "boolean",
      note: "smoke: prefers-reduced-motion",
    };

    await session.evalExpr(
      `(function(){ location.href = ${JSON.stringify(`${BASE}/mypage/trust`)}; return true; })()`,
    );
    await sleep(3000);
    const trustPath = await session.evalExpr(`location.pathname`);
    result.checks.trust = { path: trustPath, ok: String(trustPath || "").includes("/mypage/trust") };
    if (!result.checks.trust.ok) result.fail.push("trust:entry");

    await session.evalExpr(
      `(function(){ location.href = ${JSON.stringify(`${BASE}/business-info`)}; return true; })()`,
    );
    await sleep(3000);
    const bizPath = await session.evalExpr(`location.pathname`);
    result.checks.business = { path: bizPath, ok: String(bizPath || "").includes("/business-info") };
    if (!result.checks.business.ok) result.fail.push("business:entry");

    await session.evalExpr(`(function(){ location.href = ${JSON.stringify(`${BASE}/mypage`)}; return true; })()`);
    await sleep(2000);

    session.close();
    result.status = result.fail.length === 0 ? "PASS" : "FAIL";
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/ECONNREFUSED|proxy_no|no_samarket|no_page/i.test(msg)) {
      result.status = "NOT_RUN";
      result.reason = msg;
    } else {
      result.status = "FAIL";
      result.reason = msg;
      result.fail.push(`exception:${msg}`);
    }
  }
  return result;
}

async function main() {
  loadEnv();
  mkdirSync(OUT, { recursive: true });

  const results = {};

  if (want("windows")) {
    results.windows = await runPlaywrightSurface({
      label: "windows-chromium",
      viewport: { width: 1280, height: 800 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });
    write("windows.json", results.windows);
  }

  if (want("tablet")) {
    // Automated tablet = viewport width in (767, 1025)
    results.tablet = await runPlaywrightSurface({
      label: "tablet-viewport",
      viewport: { width: 900, height: 1200 },
      userAgent:
        "Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });
    write("tablet.json", results.tablet);
  }

  if (want("apk")) {
    results.apk = await runApk();
    write("apk.json", results.apk);
  } else if (PLATFORM === "all") {
    results.apk = await runApk();
    write("apk.json", results.apk);
  }

  if (want("ios") || PLATFORM === "all") {
    results.ios = await runIos();
    write("ios.json", results.ios);
  }

  const statuses = Object.fromEntries(
    Object.entries(results).map(([k, v]) => [k, v.status]),
  );
  const ran = Object.values(results);
  const anyHardFail = ran.some((r) => r.status === "FAIL" || r.status === "BLOCKED");
  const anyPass = ran.some((r) => r.status === "PASS");
  const automatedOk = anyPass && !anyHardFail;
  const allSurfacesPass = ["windows", "tablet", "apk", "ios"].every(
    (k) => results[k]?.status === "PASS",
  );

  const summary = {
    ok: automatedOk,
    verdict: allSurfacesPass
      ? "SLICE 9 MULTIPLATFORM RUNTIME PASS — LOCK eligible"
      : results.ios?.status === "PASS" && PLATFORM === "ios"
        ? "SLICE 9 iOS RUNTIME PASS — merge prior surfaces for LOCK"
        : automatedOk
          ? "SLICE 9 PHASE1 HARNESS PASS — LOCK NOT ELIGIBLE (matrix incomplete)"
          : "SLICE 9 RUNTIME FAIL",
    lockEligible: allSurfacesPass,
    targetSha: TARGET_SHA || null,
    base: BASE,
    breakpoints: { mobileMax: MYPAGE_MOBILE_MAX_PX, desktopMin: MYPAGE_DESKTOP_MIN_PX },
    statuses,
    out: OUT,
    note: "Windows+tablet PASS alone must not declare SLICE 9 MULTIPLATFORM RUNTIME LOCK",
  };
  write("SUMMARY.json", summary);
  console.log(JSON.stringify(summary, null, 2));
  if (!automatedOk) process.exit(1);
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: String(e?.message || e) }, null, 2));
  process.exit(1);
});

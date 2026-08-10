#!/usr/bin/env node
/**
 * DIBAY Global Input UX — Android device matrix runtime (Community write primary).
 *
 * HARD LOCK: one UX contract ≠ one geometry formula.
 * Records per-row runtimeContext; navigationMode from adb secure setting (not UA).
 *
 * Usage:
 *   node scripts/qa/form-keyboard-device-matrix.mjs --serial RFCY40PY2CA --device samsung --port 9231
 *   node scripts/qa/form-keyboard-device-matrix.mjs --serial 8b37179f7d94 --device xiaomi --port 9232 --login aaaa
 *
 * Env:
 *   MATRIX_MODES=p-gesture,p-3button,l-gesture,l-3button  (default: all)
 *   SKIP_NAV_SWITCH=1  — measure current nav only (label from adb)
 *   SKIP_ORIENTATION=1 — portrait only
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";
import {
  DIBAY_PKG,
  connectWebView,
  forwardCdp,
  navigateApkWebView,
  probeApkUser,
} from "./lib/apk-webview-cdp.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ADB = process.env.ADB_PATH || `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`;
const PKG = DIBAY_PKG;
const ACT = `${PKG}/.MainActivity`;
const PROD = process.env.CAPACITOR_SERVER_URL?.trim() || "https://samarket.vercel.app";
const OUT_DIR = path.join(ROOT, ".qa-logs", `global-input-ux-matrix-${stampDay()}`);
const BLANK_MAX_PX = 24;
const FOCUS_GAP_PX = 8;

function stampDay() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function parseArgs(argv) {
  const out = { serial: "", device: "android", port: 9231, login: "aaaa" };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--serial") out.serial = argv[++i];
    else if (a === "--device") out.device = argv[++i];
    else if (a === "--port") out.port = Number(argv[++i]);
    else if (a === "--login") out.login = argv[++i];
  }
  if (!out.serial) throw new Error("--serial required");
  return out;
}

function adb(serial, ...args) {
  return spawnSync(ADB, ["-s", serial, ...args], { encoding: "utf8" });
}

function adbOk(serial, ...args) {
  const r = adb(serial, ...args);
  return { status: r.status, stdout: (r.stdout || "").trim(), stderr: (r.stderr || "").trim() };
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
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

/**
 * Passwordless APK cookie inject via service-role magic link (no E2E password).
 * Prefer MATRIX_SESSION_USERNAME (profiles.username) or MATRIX_SESSION_EMAIL.
 */
async function injectSessionCookiesViaServiceRole(page, prod) {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !anon || !sk) throw new Error("supabase env missing for service-role session");

  const admin = createClient(url, sk, { auth: { persistSession: false } });
  const anonSb = createClient(url, anon, { auth: { persistSession: false } });

  let email = process.env.MATRIX_SESSION_EMAIL?.trim() || "";
  const username = (process.env.MATRIX_SESSION_USERNAME || "tiger").trim().toLowerCase();
  if (!email) {
    const { data: pr, error } = await admin
      .from("profiles")
      .select("id, username")
      .eq("username", username)
      .maybeSingle();
    if (error || !pr?.id) throw new Error(`profile ${username} not found`);
    const { data: userData, error: uErr } = await admin.auth.admin.getUserById(pr.id);
    if (uErr || !userData?.user?.email) throw new Error(`email for ${username} missing`);
    email = userData.user.email;
  }

  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkErr) throw new Error(`generateLink: ${linkErr.message}`);
  const tokenHash =
    linkData?.properties?.hashed_token ||
    linkData?.properties?.email_otp ||
    null;
  if (!tokenHash) throw new Error("generateLink missing hashed_token");

  const { data: verified, error: vErr } = await anonSb.auth.verifyOtp({
    token_hash: tokenHash,
    type: "email",
  });
  if (vErr || !verified?.session) throw new Error(`verifyOtp: ${vErr?.message ?? "no session"}`);

  const session = verified.session;
  const ref = url.match(/https:\/\/([^.]+)\./)?.[1] ?? "";
  const host = new URL(prod).hostname;
  const cookies = [
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
      domain: host,
      path: "/",
      expires: session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
      httpOnly: false,
      secure: prod.startsWith("https"),
      sameSite: "Lax",
    },
  ];
  if (sk) {
    const { data: pr } = await admin
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
  }
  await page.context().addCookies(cookies);
  await navigateApkWebView(page, `${prod}/philife`, 3500);
  const probe = await probeApkUser(page);
  return probe;
}

/** Android: 0=3-button, 1=2-button, 2=gesture */
function readNavModeRaw(serial) {
  return adbOk(serial, "shell", "settings", "get", "secure", "navigation_mode").stdout;
}

function mapNavMode(raw) {
  if (raw === "0") return "3-button";
  if (raw === "1") return "2-button";
  if (raw === "2") return "gesture";
  return "unknown";
}

function setNavMode(serial, mode) {
  const value = mode === "gesture" ? "2" : mode === "3-button" ? "0" : null;
  if (value == null) return { ok: false, reason: "unsupported_mode" };
  const before = readNavModeRaw(serial);
  const put = adbOk(serial, "shell", "settings", "put", "secure", "navigation_mode", value);
  sleep(1500);
  const after = readNavModeRaw(serial);
  const mapped = mapNavMode(after);
  return {
    ok: mapped === mode || after === value,
    before,
    after,
    putStatus: put.status,
    mapped,
  };
}

function setOrientation(serial, orientation) {
  // 0=portrait, 1=landscape (user_rotation)
  adbOk(serial, "shell", "settings", "put", "system", "accelerometer_rotation", "0");
  const rot = orientation === "landscape" ? "1" : "0";
  adbOk(serial, "shell", "settings", "put", "system", "user_rotation", rot);
  adbOk(serial, "shell", "wm", "user-rotation", "lock", rot);
  sleep(2000);
  const dump = adbOk(serial, "shell", "dumpsys", "window").stdout;
  // dumpsys uses ROTATION_0 / ROTATION_90 / ROTATION_180 / ROTATION_270 (degrees), not 0..3
  const m = dump.match(/mCurrentRotation=ROTATION_(\d+)/);
  const degrees = m ? Number(m[1]) : null;
  const ok =
    orientation === "landscape"
      ? degrees === 90 || degrees === 270
      : degrees === 0 || degrees === 180;
  return { ok, degrees, requested: orientation };
}

function restartApp(serial) {
  adbOk(serial, "shell", "am", "force-stop", PKG);
  sleep(500);
  adbOk(serial, "shell", "am", "start", "-n", ACT);
  sleep(4500);
}

const MEASURE_EXPR = `(() => {
  const vv = window.visualViewport;
  const footer = document.querySelector("[data-form-keyboard-footer='1']");
  const surface = document.querySelector("[data-form-keyboard-surface='1']");
  const chrome = document.querySelector("[data-form-keyboard-sticky-chrome='1']");
  const focused =
    document.activeElement instanceof HTMLElement &&
    (document.activeElement.tagName === "INPUT" ||
      document.activeElement.tagName === "TEXTAREA" ||
      document.activeElement.isContentEditable)
      ? document.activeElement
      : null;
  const fr = focused?.getBoundingClientRect();
  const cr = footer?.getBoundingClientRect();
  const chromeR = chrome?.getBoundingClientRect();
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;left:0;top:0;width:0;height:0;padding-top:var(--safe-top);padding-bottom:var(--safe-bottom);visibility:hidden;pointer-events:none";
  document.documentElement.appendChild(probe);
  const cs = getComputedStyle(probe);
  const safeTop = Math.round(parseFloat(cs.paddingTop) || 0);
  const safeBottom = Math.round(parseFloat(cs.paddingBottom) || 0);
  probe.remove();
  let effectiveViewportTop = Math.max(
    Math.round(vv?.offsetTop || 0),
    chromeR ? Math.round(chromeR.bottom) : 0
  );
  const effectiveViewportBottom = vv
    ? Math.round(vv.offsetTop + vv.height)
    : Math.round(window.innerHeight);
  // CASE D mirror — tiny usable band relaxes chrome top (same contract as Form SSOT)
  if (fr) {
    const focusedNeed = focused.tagName === "TEXTAREA" ? Math.min(Math.round(fr.height), 48) : Math.round(fr.height);
    const minUsable = Math.max(120, focusedNeed + 16);
    const usable = effectiveViewportBottom - effectiveViewportTop;
    if (usable < minUsable) {
      const fitTop = effectiveViewportBottom - minUsable;
      effectiveViewportTop = Math.max(Math.round(vv?.offsetTop || 0), Math.min(effectiveViewportTop, fitTop));
    }
  }
  const pad = footer ? getComputedStyle(footer).paddingBottom : "";
  const padPx = Math.round(parseFloat(pad) || 0);
  const blankGap =
    cr && vv ? Math.max(0, Math.round(vv.offsetTop + vv.height - cr.bottom - 4)) : null;
  const topClipped = fr ? fr.top + 0.5 < effectiveViewportTop - 8 : null;
  const bottomOccluded = fr ? fr.bottom - 0.5 > effectiveViewportBottom + 8 : null;
  const ctaReachable = cr
    ? cr.bottom <= effectiveViewportBottom + 12 && cr.top >= effectiveViewportTop - 12
    : null;
  const layoutAligned =
    typeof window.innerHeight === "number" &&
    typeof vv?.height === "number" &&
    window.innerHeight <= vv.height + (vv.offsetTop || 0) + 28;
  return {
    href: location.href,
    hasForm: Boolean(document.getElementById("philife-neighborhood-write-form")),
    hasSurface: Boolean(surface),
    hasStickyChrome: Boolean(chrome),
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    visualViewportWidth: vv?.width ?? null,
    visualViewportHeight: vv?.height ?? null,
    visualViewportOffsetTop: vv?.offsetTop ?? null,
    safeTop,
    safeBottom,
    keyboardOpen: footer?.getAttribute("data-form-keyboard-open") === "true",
    keyboardOpenAttr: footer?.getAttribute("data-form-keyboard-open"),
    effectiveBottomInset: padPx,
    footerPaddingBottom: pad,
    effectiveViewportTop,
    effectiveViewportBottom,
    focusedTag: focused?.tagName ?? null,
    focusedTop: fr ? Math.round(fr.top) : null,
    focusedBottom: fr ? Math.round(fr.bottom) : null,
    ctaTop: cr ? Math.round(cr.top) : null,
    ctaBottom: cr ? Math.round(cr.bottom) : null,
    blankGap,
    topClipped,
    bottomOccluded,
    ctaReachable,
    layoutAligned,
    pressClass: footer
      ? /active:scale|FORM_INTERACTIVE|touch-manipulation/.test(footer.innerHTML) ||
        Boolean(footer.querySelector("[class*='active:scale']"))
      : null,
  };
})()`;

function verdictFromGeo(geo, meta) {
  if (meta.navigationMode === "unknown") {
    return { result: "NOT_PROVEN", reason: "navigationMode_unknown" };
  }
  if (!geo?.hasForm && !geo?.hasSurface) {
    return { result: "NOT_PROVEN", reason: "form_not_mounted" };
  }
  if (!geo.keyboardOpen && meta.requireKeyboard) {
    return { result: "NOT_PROVEN", reason: "keyboard_not_open" };
  }
  const fails = [];
  if (geo.bottomOccluded === true) fails.push("bottom_occlusion");
  if (geo.topClipped === true) fails.push("top_clipping");
  if (typeof geo.blankGap === "number" && geo.blankGap > BLANK_MAX_PX) fails.push("blank_gap");
  if (geo.ctaReachable === false) fails.push("cta_unreachable");
  if (geo.layoutAligned && geo.effectiveBottomInset >= 120) fails.push("double_compensation");
  if (geo.focusedTop != null && geo.focusedTop + FOCUS_GAP_PX < geo.effectiveViewportTop) {
    fails.push("focus_above_band");
  }
  if (geo.focusedBottom != null && geo.focusedBottom - FOCUS_GAP_PX > geo.effectiveViewportBottom) {
    fails.push("focus_below_band");
  }
  if (fails.length) return { result: "FAIL", fails, reason: fails.join(",") };
  return { result: "PASS", fails: [] };
}

async function openCommunityWrite(page) {
  await navigateApkWebView(page, `${PROD}/philife`, 3500);
  const opened = await page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll("button,a,[role='button']"));
    const btn = candidates.find((b) =>
      /글쓰기|Write|compose|작성/i.test(`${b.getAttribute("aria-label") || ""} ${b.textContent || ""}`)
    );
    if (!btn) return { ok: false };
    btn.click();
    return { ok: true, label: (btn.getAttribute("aria-label") || btn.textContent || "").slice(0, 80) };
  });
  await page.waitForTimeout(2000);
  return opened;
}

async function focusField(page, which) {
  await page.evaluate((sel) => {
    const form = document.getElementById("philife-neighborhood-write-form");
    if (!form) return;
    let el = null;
    if (sel === "title") {
      el = form.querySelector("input[type='text'], input:not([type]), input[name*='title']");
    } else if (sel === "textarea") {
      el = form.querySelector("textarea");
    } else {
      const all = Array.from(form.querySelectorAll("input, textarea"));
      el = all[Math.min(1, all.length - 1)] || all[0];
    }
    if (el instanceof HTMLElement) {
      el.focus();
      el.click();
      if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
        el.value =
          sel === "textarea"
            ? "line1\nline2\nline3\nline4\nline5"
            : el.value || "ux-matrix";
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }
  }, which);
  await page.waitForTimeout(2200);
}

async function measurePage(page) {
  return page.evaluate(MEASURE_EXPR);
}

function desiredModes() {
  const raw = process.env.MATRIX_MODES?.trim();
  const all = ["p-gesture", "p-3button", "l-gesture", "l-3button"];
  if (!raw) return all;
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function parseModeToken(token) {
  const [o, n] = token.split("-");
  const orientation = o === "l" ? "landscape" : "portrait";
  const navigationMode = n === "gesture" ? "gesture" : n === "3button" ? "3-button" : "unknown";
  return { orientation, navigationMode, token };
}

async function runRow({ serial, port, deviceLabel, login, orientation, navigationMode, token }) {
  const rowId = `${deviceLabel}_${token}`.replace(/[^a-zA-Z0-9_-]/g, "_");
  const meta = {
    device: deviceLabel,
    serial,
    os: "android",
    appSurface: "CommunityWrite",
    orientation,
    navigationMode,
    inputMode: "software-keyboard",
    token,
  };

  let navSwitch = null;
  if (process.env.SKIP_NAV_SWITCH === "1") {
    const raw = readNavModeRaw(serial);
    meta.navigationMode = mapNavMode(raw);
    if (meta.navigationMode === "unknown") {
      return { ...meta, result: "NOT_PROVEN", reason: "navigationMode_unknown", geo: null };
    }
  } else {
    navSwitch = setNavMode(serial, navigationMode);
    if (!navSwitch.ok) {
      const mapped = mapNavMode(navSwitch.after);
      if (mapped !== navigationMode) {
        return {
          ...meta,
          result: "NOT_SUPPORTED",
          reason: "nav_mode_switch_failed",
          navSwitch,
          geo: null,
        };
      }
    }
  }

  let orient = null;
  if (process.env.SKIP_ORIENTATION === "1" && orientation === "landscape") {
    return { ...meta, result: "NOT_PROVEN", reason: "orientation_skipped", geo: null };
  }
  orient = setOrientation(serial, orientation);
  if (!orient.ok) {
    return { ...meta, result: "NOT_PROVEN", reason: "orientation_lock_failed", orient, geo: null };
  }

  restartApp(serial);

  let browser;
  try {
    forwardCdp(adb, serial, port);
    const conn = await connectWebView(chromium, port);
    browser = conn.browser;
    const page = conn.page;

    let probe = await probeApkUser(page);
    if (!(probe.ok && probe.userId)) {
      console.error(`[session] injecting via service-role for ${deviceLabel}-${token}`);
      probe = await injectSessionCookiesViaServiceRole(page, PROD);
    }
    if (!(probe.ok && probe.userId)) {
      return {
        ...meta,
        result: "NOT_PROVEN",
        reason: "login_failed",
        loginProbe: probe,
        geo: null,
      };
    }
    meta.sessionUser = probe.username || probe.userId;

    const opened = await openCommunityWrite(page);
    if (!opened.ok) {
      return { ...meta, result: "NOT_PROVEN", reason: "compose_click_failed", opened, geo: null };
    }

    await focusField(page, "title");
    const geoTitle = await measurePage(page);
    const vTitle = verdictFromGeo(geoTitle, { ...meta, requireKeyboard: true });

    await focusField(page, "textarea");
    const geoText = await measurePage(page);
    const vText = verdictFromGeo(geoText, { ...meta, requireKeyboard: true });

    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    });
    adbOk(serial, "shell", "input", "keyevent", "111"); // KEYCODE_ESCAPE — prefer IME dismiss
    await page.waitForTimeout(1200);
    const geoClosed = await measurePage(page);

    const keyboardModel = geoTitle.layoutAligned
      ? "layout_resize"
      : geoTitle.visualViewportHeight != null &&
          geoTitle.viewportHeight > geoTitle.visualViewportHeight + 24
        ? "visual_overlay"
        : "unknown";

    const worst =
      vTitle.result === "FAIL" || vText.result === "FAIL"
        ? "FAIL"
        : vTitle.result === "PASS" && vText.result === "PASS"
          ? "PASS"
          : vTitle.result === "NOT_PROVEN" || vText.result === "NOT_PROVEN"
            ? "NOT_PROVEN"
            : vTitle.result;

    const row = {
      ...meta,
      navigationModeRaw: readNavModeRaw(serial),
      navSwitch,
      orient,
      keyboardModel,
      scenarios: {
        S02_title: { geo: geoTitle, verdict: vTitle },
        S04_textarea: { geo: geoText, verdict: vText },
        S07_closed: { geo: geoClosed },
      },
      result: worst,
      reason: worst === "PASS" ? null : vTitle.reason || vText.reason,
    };

    const file = path.join(OUT_DIR, `${rowId}.json`);
    fs.writeFileSync(file, JSON.stringify(row, null, 2));
    row.evidenceFile = file;
    return row;
  } catch (e) {
    const row = {
      ...meta,
      result: "NOT_PROVEN",
      reason: "runtime_error",
      error: String(e?.stack || e),
      geo: null,
    };
    const file = path.join(OUT_DIR, `${rowId}-error.json`);
    fs.writeFileSync(file, JSON.stringify(row, null, 2));
    row.evidenceFile = file;
    return row;
  } finally {
    try {
      await browser?.close();
    } catch {
      /* ignore */
    }
  }
}

async function main() {
  loadEnv();
  const args = parseArgs(process.argv);
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const modes = desiredModes().map(parseModeToken);
  const summary = {
    startedAt: new Date().toISOString(),
    device: args.device,
    serial: args.serial,
    outDir: OUT_DIR,
    rows: [],
  };

  console.log(JSON.stringify({ phase: "start", ...summary, modes: modes.map((m) => m.token) }, null, 2));

  for (const mode of modes) {
    console.error(`\n=== ROW ${args.device} ${mode.token} ===`);
    const row = await runRow({
      serial: args.serial,
      port: args.port,
      deviceLabel: args.device,
      login: args.login,
      orientation: mode.orientation,
      navigationMode: mode.navigationMode,
      token: mode.token,
    });
    summary.rows.push({
      token: mode.token,
      result: row.result,
      reason: row.reason ?? null,
      navigationMode: row.navigationMode,
      evidenceFile: row.evidenceFile ?? null,
    });
    console.log(JSON.stringify({ token: mode.token, result: row.result, reason: row.reason }, null, 2));
    // brief settle between rows
    sleep(1000);
  }

  // restore portrait + leave nav as last set
  setOrientation(args.serial, "portrait");

  summary.finishedAt = new Date().toISOString();
  const summaryFile = path.join(OUT_DIR, `SUMMARY-${args.device}-${args.serial}.json`);
  fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ summaryFile, rows: summary.rows }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

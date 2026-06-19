#!/usr/bin/env node
/**
 * Notification P0 — B APK WebView login + FCM register verify (adb CDP, not Chrome).
 * Usage: node scripts/qa/notification-p0-apk-b-login.mjs
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ADB = process.env.ADB_PATH || `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`;
const PKG = "com.dibay.app";
const ACT = `${PKG}/.MainActivity`;
const SERIAL = process.env.P0_DEVICE_B?.trim() || "RFCY40PY2CA";
const CDP_PORT = Number(process.env.P0_CDP_PORT_B || 9224);
const PROD = (process.env.P0_PROD ?? "https://samarket.vercel.app").replace(/\/$/, "");
const USER_B = "9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8";
const LOGIN = "qqqq";
const PASSWORD = process.env.E2E_TEST_PASSWORD?.trim() || "1234";
const OUT = path.join(ROOT, "docs/perf/notification-p0-apk-b-login.log");

function log(line) {
  const msg = `[p0-apk-b-login] ${line}`;
  console.log(msg);
  fs.appendFileSync(OUT, msg + "\n");
}

function adb(...args) {
  return spawnSync(ADB, ["-s", SERIAL, ...args], { encoding: "utf8" });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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

function discoverWebViewSocket() {
  const r = adb("shell", "cat", "/proc/net/unix");
  const line = (r.stdout || "").split("\n").find((l) => l.includes("webview_devtools_remote"));
  if (!line) return null;
  const m = line.match(/@(webview_devtools_remote_\d+)/);
  return m?.[1] ?? null;
}

function forwardCdp() {
  adb("forward", "--remove", `tcp:${CDP_PORT}`);
  const sock = discoverWebViewSocket();
  if (!sock) throw new Error(`webview devtools socket not found on ${SERIAL}`);
  const f = adb("forward", `tcp:${CDP_PORT}`, `localabstract:${sock}`);
  if (f.status !== 0) throw new Error(`adb forward failed: ${f.stderr}`);
  return sock;
}

async function connectWebView() {
  forwardCdp();
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`);
  const context = browser.contexts()[0] ?? (await browser.newContext());
  const page = context.pages()[0] ?? (await context.newPage());
  return { browser, page };
}

async function navigate(page, url) {
  await page.evaluate((u) => {
    window.location.href = u;
  }, url);
  await page.waitForTimeout(3000);
}

async function probeApkUser(page) {
  return page.evaluate(async () => {
    try {
      const r = await fetch("/api/me/profile", { credentials: "include", cache: "no-store" });
      if (!r.ok) return { ok: false, status: r.status };
      const j = await r.json();
      const userId = String(j?.id ?? j?.profile?.id ?? j?.user?.id ?? "").trim();
      const username = String(j?.username ?? j?.profile?.username ?? "").toLowerCase();
      return { ok: true, userId, username };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  });
}

async function logoutInApk(page) {
  await page.evaluate(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch {
      /* ignore */
    }
  });
  await page.context().clearCookies();
  await page.waitForTimeout(1000);
}

async function signInCookieForApk(email) {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const loginEmail = email.includes("@") ? email : `${email}@manual.local`;
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.signInWithPassword({
    email: loginEmail,
    password: PASSWORD,
  });
  if (error || !data.session) throw new Error(`login ${loginEmail}: ${error?.message ?? "no session"}`);
  const ref = url.match(/https:\/\/([^.]+)\./)?.[1] ?? "";
  const host = new URL(PROD).hostname;
  const session = {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at,
    expires_in: data.session.expires_in,
    token_type: data.session.token_type,
    user: data.session.user,
  };
  const cookies = [
    {
      name: `sb-${ref}-auth-token`,
      value: encodeURIComponent(JSON.stringify(session)),
      domain: host,
      path: "/",
      expires: session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
      httpOnly: false,
      secure: PROD.startsWith("https"),
      sameSite: "Lax",
    },
  ];
  let activeSessionId = null;
  if (sk) {
    const admin = createClient(url, sk, { auth: { persistSession: false } });
    const { data: pr } = await admin
      .from("profiles")
      .select("active_session_id")
      .eq("id", data.session.user.id)
      .maybeSingle();
    activeSessionId = String(pr?.active_session_id ?? "").trim() || null;
    if (activeSessionId) {
      cookies.push({
        name: "samarket_active_session_id",
        value: activeSessionId,
        domain: host,
        path: "/",
        expires: Math.floor(Date.now() / 1000) + 86400 * 30,
        httpOnly: false,
        secure: PROD.startsWith("https"),
        sameSite: "Lax",
      });
    }
  }
  return { cookies, userId: data.session.user.id, activeSessionId };
}

async function injectQqqqSession(page) {
  const { cookies, userId } = await signInCookieForApk(LOGIN);
  await page.context().addCookies(cookies);
  await navigate(page, `${PROD}/community-messenger`);
  const synced = await page.evaluate(async () => {
    try {
      const session = await fetch("/api/auth/session", { credentials: "include", cache: "no-store" });
      const profile = await fetch("/api/me/profile", { credentials: "include", cache: "no-store" });
      return {
        sessionStatus: session.status,
        sessionJson: await session.json().catch(() => null),
        profileStatus: profile.status,
        profileJson: await profile.json().catch(() => null),
      };
    } catch (e) {
      return { error: String(e) };
    }
  });
  log(`session sync=${JSON.stringify(synced)}`);
  return userId;
}

async function loginQqqqInApk(page) {
  log("inject qqqq session into APK WebView (CDP, not Chrome)");
  return injectQqqqSession(page);
}

async function queryActiveDevices() {
  loadEnv();
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const { data, error } = await sb
    .from("user_devices")
    .select("id,user_id,platform,push_provider,is_active,updated_at,device_id")
    .eq("user_id", USER_B)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(3);
  return { data: data ?? [], error: error?.message ?? null };
}

function captureRegisterLogcat() {
  const r = adb("logcat", "-d", "-s", "DIBAY_FCM", "DIBAY_PUSH_REGISTER", "DIBAY_NOTIFY");
  return r.stdout ?? "";
}

async function main() {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, "");
  log(`serial=${SERIAL} prod=${PROD} target=${USER_B}`);

  adb("shell", "input", "keyevent", "224");
  adb("shell", "input", "keyevent", "82");
  adb("shell", "am", "start", "-n", ACT);
  await sleep(3000);

  const { browser, page } = await connectWebView();
  log(`cdp connected pages=${(await page.context().pages()).length}`);

  let probe = await probeApkUser(page);
  log(`before login probe=${JSON.stringify(probe)}`);

  if (probe.ok && probe.userId === USER_B) {
    log("already qqqq — skip logout/login");
  } else {
    if (probe.ok && probe.userId) {
      log(`logout current user ${probe.userId} (${probe.username ?? "?"})`);
      await logoutInApk(page);
    }
    log("login qqqq via APK WebView session inject");
    await loginQqqqInApk(page);
    probe = await probeApkUser(page);
    log(`after login probe=${JSON.stringify(probe)}`);
    if (!probe.ok || probe.userId !== USER_B) {
      log(`FAIL APK login — expected ${USER_B}`);
      await browser.close().catch(() => {});
      process.exit(1);
    }
  }

  await browser.close().catch(() => {});
  adb("logcat", "-c");
  log("warm messenger home — capture register logcat");
  adb("shell", "am", "start", "-n", ACT);
  adb("shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", `${PROD}/community-messenger`);
  await sleep(20000);

  const logcat = captureRegisterLogcat();
  const full = adb("logcat", "-d").stdout ?? "";
  const dibayLines = full.split("\n").filter((l) => /DIBAY_PUSH_REGISTER|DIBAY_FCM|DIBAY_NOTIFY/.test(l));
  const merged = [...new Set([...logcat.split("\n"), ...dibayLines])].filter(Boolean);
  const logText = merged.join("\n");
  for (const line of merged.slice(-35)) log(`logcat ${line}`);

  const hasGranted = /permission_check.*state[=:"]+granted/i.test(logText);
  const hasToken = /registration_event.*token_len[=:"]+[1-9]/i.test(logText);
  const hasSuccess =
    logText.includes(`success user_id=${USER_B}`) ||
    (logText.includes('"step":"success"') && logText.includes(USER_B));

  const devices = await queryActiveDevices();
  log(`user_devices active rows=${devices.data.length} error=${devices.error ?? "none"}`);
  for (const row of devices.data) log(`  row ${JSON.stringify(row)}`);

  const rowFresh =
    devices.data.length > 0 &&
    Date.now() - new Date(devices.data[0].updated_at).getTime() < 10 * 60_000;

  log(`permission_granted=${hasGranted} token_registered=${hasToken} register_success=${hasSuccess} row_fresh=${rowFresh}`);
  log(`READY_FOR_SCENARIOS=${devices.data.length > 0 && (hasSuccess || rowFresh) ? "yes" : "no"}`);
}

main().catch((e) => {
  log(`FATAL ${e.message}`);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * GATE 3 — notification sound runtime (GATE 2 tree, local origin only).
 * Do not treat https://samarket.vercel.app as evidence.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";
import WebSocket from "ws";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const STAMP = new Date().toISOString().replace(/[:.]/g, "-");
const OUT = path.join(ROOT, `.qa-logs/gate3-notification-sound-${STAMP}`);
fs.mkdirSync(OUT, { recursive: true });

const ORIGIN = (process.env.GATE3_ORIGIN || "http://127.0.0.1:3000").replace(/\/$/, "");
const ANDROID_ORIGIN = (process.env.GATE3_ANDROID_ORIGIN || "http://localhost:3000").replace(/\/$/, "");
const ADB = process.env.ADB_PATH || `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`;
const PKG = "com.dibay.app";
const ACT = `${PKG}/.MainActivity`;
const SAMSUNG = process.env.GATE3_SAMSUNG || "RFCY40PY2CA";
const XIAOMI = process.env.GATE3_XIAOMI || "8b37179f7d94";
const IPHONE_UDID = process.env.GATE3_IPHONE_UDID || "00008120-000025C826F3C01E";
const DEVELOPER_DIR =
  process.env.DEVELOPER_DIR || "/Applications/Xcode.app/Contents/Developer";
const DIRECT_ROOM = process.env.P0_DIRECT_ROOM || "b19e2672-f26f-4a2e-8125-52575da4a62a";
const LISTEN_PATH = process.env.GATE3_LISTEN || "/market";
const SLICE = process.env.GATE3_SLICE || "all";
const RECEIVER_LOGIN = "qqqq";
const SENDER_LOGIN = "aaaa";
const OTHER_LOGIN = "asas11";
const ADMIN_LOGIN = "aaaa";
const USER_RECEIVER = "9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8";
const USER_SENDER = "11111111-1111-1111-1111-111111111111";

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
  const msg = `[gate3-sound] ${line}`;
  console.log(msg);
  fs.appendFileSync(path.join(OUT, "run.log"), msg + "\n");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function passwords() {
  return [
    ...new Set(
      [
        process.env.E2E_TEST_PASSWORD?.trim(),
        process.env.QA_MANUAL_PASSWORD?.trim(),
        process.env.E2E_BANNER_MEMBER_PASSWORD?.trim(),
        process.env.E2E_ADMIN_PASSWORD?.trim(),
        "DibayQa1!",
        "1234",
      ].filter(Boolean)
    ),
  ];
}

function supabaseAdmin() {
  loadEnv();
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

function adb(serial, ...args) {
  return spawnSync(ADB, serial ? ["-s", serial, ...args] : args, { encoding: "utf8" });
}

async function signIn(login) {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const emails = login.includes("@")
    ? [login]
    : [`${login}@manual.local`, `${login}@samarket.local`];
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  let data = null;
  let lastErr = null;
  for (const email of emails) {
    for (const pass of passwords()) {
      const r = await sb.auth.signInWithPassword({ email, password: pass });
      if (r.data?.session) {
        data = r.data;
        break;
      }
      lastErr = r.error?.message ?? "no session";
    }
    if (data?.session) break;
  }
  const email = data?.session?.user?.email || emails[0];
  if (!data?.session) throw new Error(`login ${emails[0]}: ${lastErr ?? "no session"}`);
  const ref = url.match(/https:\/\/([^.]+)\./)?.[1] ?? "";
  const session = {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at,
    expires_in: data.session.expires_in,
    token_type: data.session.token_type,
    user: data.session.user,
  };
  let cookie = `sb-${ref}-auth-token=${encodeURIComponent(JSON.stringify(session))}`;
  let activeSessionId = null;
  if (sk) {
    const admin = createClient(url, sk, { auth: { persistSession: false } });
    const { data: pr } = await admin
      .from("profiles")
      .select("active_session_id")
      .eq("id", data.session.user.id)
      .maybeSingle();
    activeSessionId = String(pr?.active_session_id ?? "").trim() || null;
    if (activeSessionId) cookie += `; samarket_active_session_id=${encodeURIComponent(activeSessionId)}`;
  }
  return { cookie, userId: data.session.user.id, email, session, activeSessionId, ref, sessionJson: session };
}

function cookieObjects(auth, originUrl) {
  const cookies = [
    {
      name: `sb-${auth.ref}-auth-token`,
      value: encodeURIComponent(JSON.stringify(auth.sessionJson)),
      url: originUrl + "/",
    },
  ];
  if (auth.activeSessionId) {
    cookies.push({
      name: "samarket_active_session_id",
      value: auth.activeSessionId,
      url: originUrl + "/",
    });
  }
  return cookies;
}

async function apiFetch(pathname, auth, init = {}) {
  const headers = {
    Accept: "application/json",
    Cookie: auth.cookie,
    ...(init.headers ?? {}),
  };
  if (init.body != null && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  if (auth.session?.access_token) headers.Authorization = `Bearer ${auth.session.access_token}`;
  const res = await fetch(`${ORIGIN}${pathname}`, { ...init, headers, body: init.body });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* html */
  }
  return { status: res.status, json, text: text.slice(0, 600) };
}

async function sendMessage(senderAuth, preview) {
  return apiFetch(`/api/community-messenger/rooms/${DIRECT_ROOM}/messages`, senderAuth, {
    method: "POST",
    body: JSON.stringify({
      content: preview,
      clientMessageId: `g3-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    }),
  });
}

const PROBE_SRC = `(() => {
  if (window.__gate3 && window.__gate3.installed) return true;
  const state = { installed: true, audioPlays: [], p1Enters: [], console: [] };
  window.__gate3 = state;
  const origPlay = HTMLAudioElement.prototype.play;
  HTMLAudioElement.prototype.play = function () {
    try {
      state.audioPlays.push({
        t: Date.now(),
        src: String(this.src || this.currentSrc || ""),
        vis: document.visibilityState,
        href: String(location.href || ""),
      });
    } catch (e) {}
    return origPlay.apply(this, arguments);
  };
  for (const m of ["log", "info", "debug", "warn"]) {
    const orig = console[m].bind(console);
    console[m] = function () {
      try {
        const s = Array.from(arguments).map((a) => (typeof a === "string" ? a : "")).join(" ");
        if (s.indexOf("[runtime-link-p1]") >= 0 || s.indexOf("[notification-sound]") >= 0) {
          state.console.push(s.slice(0, 500));
        }
        if (s.indexOf("playEventNotificationSound:enter") >= 0) {
          state.p1Enters.push({ t: Date.now(), s: s.slice(0, 400) });
        }
      } catch (e) {}
      return orig.apply(console, arguments);
    };
  }
  try {
    state.bc = 0;
    const bc = new BroadcastChannel("samarket:leader:notification-sound");
    bc.addEventListener("message", () => {
      state.bc += 1;
    });
  } catch (e) {}
  return true;
})()`;

async function installProbe(page) {
  await page.addInitScript(PROBE_SRC);
  await page.evaluate(PROBE_SRC).catch(() => {});
}

async function resetProbe(page) {
  await page.evaluate(() => {
    if (!window.__gate3) return;
    window.__gate3.audioPlays = [];
    window.__gate3.p1Enters = [];
    window.__gate3.console = [];
  });
}

async function readProbe(page) {
  return page.evaluate(async () => {
    const g = window.__gate3;
    let profile = null;
    try {
      const r = await fetch("/api/me/profile", { credentials: "include", cache: "no-store" });
      const j = await r.json().catch(() => null);
      profile = {
        status: r.status,
        id: String(j?.id ?? j?.profile?.id ?? j?.user?.id ?? "").trim() || null,
        username: String(j?.username ?? j?.profile?.username ?? "").trim() || null,
      };
    } catch (e) {
      profile = { error: String(e) };
    }
    return {
      origin: location.origin,
      path: location.pathname,
      vis: document.visibilityState,
      focused: typeof document.hasFocus === "function" ? document.hasFocus() : null,
      href: location.href,
      installed: !!(g && g.installed),
      audio: g ? g.audioPlays.length : -1,
      p1: g ? g.p1Enters.length : -1,
      bc: g && typeof g.bc === "number" ? g.bc : null,
      tabId: (() => {
        try {
          return sessionStorage.getItem("samarket:trade-tab-id");
        } catch {
          return null;
        }
      })(),
      profile,
      plays: g ? g.audioPlays : [],
      p1Enters: g ? g.p1Enters : [],
      consoleTail: g ? g.console.slice(-12) : [],
    };
  });
}

async function injectDocumentCookies(page, auth) {
  const pairs = [
    `sb-${auth.ref}-auth-token=${encodeURIComponent(JSON.stringify(auth.sessionJson))}; path=/`,
  ];
  if (auth.activeSessionId) {
    pairs.push(`samarket_active_session_id=${auth.activeSessionId}; path=/`);
  }
  await page.evaluate((list) => {
    for (const row of list) document.cookie = row;
  }, pairs);
}

function originOk(probe, allowed) {
  const origin = String(probe?.origin || "");
  return allowed.some((a) => origin === a || origin.startsWith(a));
}

function cell(name, expectAudio, probe, extra = {}) {
  const audio = probe?.audio;
  const pass = extra.pass != null ? extra.pass : audio === expectAudio;
  return {
    name,
    expectAudio,
    audio,
    p1: probe?.p1 ?? null,
    vis: probe?.vis ?? null,
    focused: probe?.focused ?? null,
    origin: probe?.origin ?? null,
    path: probe?.path ?? null,
    profile: probe?.profile ?? null,
    tabId: probe?.tabId ?? null,
    verdict: extra.verdict ?? (pass ? "PASS" : "FAIL"),
    pass,
    ...extra,
  };
}

async function launchBrowser(headless = true) {
  const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const args = ["--autoplay-policy=no-user-gesture-required", "--disable-dev-shm-usage"];
  if (fs.existsSync(chrome)) {
    return chromium.launch({ headless, executablePath: chrome, args });
  }
  return chromium.launch({ headless, args });
}

async function setPageHidden(page, hidden) {
  await page.evaluate((next) => {
    window.__gate3ForceHidden = !!next;
    if (!window.__gate3VisPatched) {
      window.__gate3VisPatched = true;
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => (window.__gate3ForceHidden ? "hidden" : "visible"),
      });
      Object.defineProperty(document, "hidden", {
        configurable: true,
        get: () => !!window.__gate3ForceHidden,
      });
    }
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);
}

async function openAuthedPage(browser, auth, origin, pathname) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    ignoreHTTPSErrors: true,
  });
  await context.addCookies(cookieObjects(auth, origin));
  const page = await context.newPage();
  await installProbe(page);
  await page.goto(`${origin}${pathname}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await sleep(1500);
  await page.evaluate(PROBE_SRC).catch(() => {});
  return { context, page };
}

async function waitOrigin() {
  const t0 = Date.now();
  while (Date.now() - t0 < 20_000) {
    try {
      const r = await fetch(ORIGIN, { redirect: "manual" });
      if (r.status > 0) return;
    } catch {
      /* retry */
    }
    await sleep(400);
  }
  throw new Error(`origin_down:${ORIGIN}`);
}

function discoverWebViewSocket(serial) {
  const r = adb(serial, "shell", "cat", "/proc/net/unix");
  const line = (r.stdout || "").split("\n").find((l) => l.includes("webview_devtools_remote"));
  if (!line) return null;
  const m = line.match(/@(webview_devtools_remote_\d+)/);
  return m?.[1] ?? null;
}

function forwardCdp(serial, port) {
  adb(serial, "forward", "--remove", `tcp:${port}`);
  const sock = discoverWebViewSocket(serial);
  if (!sock) throw new Error(`webview_socket_missing:${serial}`);
  const f = adb(serial, "forward", `tcp:${port}`, `localabstract:${sock}`);
  if (f.status !== 0) throw new Error(`adb_forward_failed:${serial}:${f.stderr}`);
  return sock;
}

async function connectWebView(port) {
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const context = browser.contexts()[0] ?? (await browser.newContext());
  const page = context.pages()[0] ?? (await context.newPage());
  return { browser, page };
}

function analyzeFcm(serial) {
  const dump = adb(serial, "logcat", "-d", "-s", "DIBAY_FCM", "DIBAY_PUSH", "DIBAY_NOTIFY").stdout || "";
  const gcm = adb(serial, "logcat", "-d", "-s", "GCM").stdout || "";
  const t = `${dump}\n${gcm}`;
  return {
    messageReceived: /\[fcm\] message_received/.test(t),
    nativePosted: /native_notification_posted/.test(t),
    dataTypeChat: /data_type_detected type=chat_message/.test(t),
    tail: t.split("\n").filter(Boolean).slice(-24),
  };
}

async function runWeb(sender, receiver, other) {
  log("WEB start");
  const browser = await launchBrowser(false);
  const rows = [];
  try {
    await sendMessage(sender, `G3-seed-unread ${Date.now()}`);
    await sleep(800);

    const { context, page } = await openAuthedPage(browser, receiver, ORIGIN, LISTEN_PATH);
    await sleep(4000);
    const boot = await readProbe(page);
    rows.push(
      cell("web.unread_entry_0", 0, boot, {
        pass: originOk(boot, [ORIGIN]) && boot.installed && boot.audio === 0,
        note: "existing unread hydrate must not play",
      })
    );

    await resetProbe(page);
    const msg = await sendMessage(sender, `G3-web-fg ${Date.now()}`);
    await sleep(4000);
    const fg = await readProbe(page);
    rows.push(
      cell("web.new_event_1", 1, fg, {
        pass: originOk(fg, [ORIGIN]) && fg.audio === 1,
        sendStatus: msg.status,
        sendOk: msg.json?.ok === true,
      })
    );

    await resetProbe(page);
    await setPageHidden(page, true);
    await sleep(400);
    const bgSend = await sendMessage(sender, `G3-web-bg ${Date.now()}`);
    await sleep(4000);
    const bg = await readProbe(page);
    rows.push(
      cell("web.background_js_0", 0, bg, {
        pass: bg.audio === 0,
        sendStatus: bgSend.status,
        note: "hidden tab JS must not play; OS push is device-owned",
      })
    );

    await resetProbe(page);
    await setPageHidden(page, false);
    await page.bringToFront();
    await sleep(3000);
    const resume = await readProbe(page);
    rows.push(
      cell("web.resume_0", 0, resume, {
        pass: resume.audio === 0,
        note: "resume must not replay hidden-tab event",
      })
    );

    await page.close().catch(() => {});
    const tabs = [];
    for (let i = 0; i < 3; i += 1) {
      const p = await context.newPage();
      const tabId = `g3-${i}-${Math.random().toString(16).slice(2)}`;
      await p.addInitScript((id) => {
        try {
          sessionStorage.setItem("samarket:trade-tab-id", id);
        } catch {
          /* ignore */
        }
      }, tabId);
      await installProbe(p);
      await p.goto(`${ORIGIN}${LISTEN_PATH}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await sleep(1500);
      await p.evaluate(PROBE_SRC).catch(() => {});
      tabs.push(p);
    }
    await sleep(5000);
    for (const p of tabs) await resetProbe(p);
    const multiSend = await sendMessage(sender, `G3-web-multi ${Date.now()}`);
    await sleep(4500);
    const multiReads = [];
    for (const p of tabs) multiReads.push(await readProbe(p));
    const multiAudio = multiReads.reduce((n, r) => n + Math.max(0, r.audio), 0);
    rows.push({
      name: "web.multitab_1",
      expectAudio: 1,
      audio: multiAudio,
      perTab: multiReads.map((r) => ({ audio: r.audio, p1: r.p1, bc: r.bc, vis: r.vis, tabId: r.tabId })),
      sendStatus: multiSend.status,
      pass: multiAudio === 1,
      verdict: multiAudio === 1 ? "PASS" : "FAIL",
    });
    const keep = tabs[0];
    for (const p of tabs.slice(1)) await p.close().catch(() => {});
    const page2 = keep;

    await page2.evaluate(async () => {
      try {
        await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
      } catch {
        /* ignore */
      }
    });
    await context.clearCookies();
    await context.addCookies(cookieObjects(other, ORIGIN));
    await installProbe(page2);
    await page2.goto(`${ORIGIN}${LISTEN_PATH}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await sleep(2500);
    await page2.evaluate(PROBE_SRC).catch(() => {});
    await resetProbe(page2);
    const leakSend = await sendMessage(sender, `G3-web-logout-leak ${Date.now()}`);
    await sleep(4000);
    const leak = await readProbe(page2);
    rows.push(
      cell("web.logout_contamination_0", 0, leak, {
        pass: leak.audio === 0,
        sendStatus: leakSend.status,
        viewer: OTHER_LOGIN,
        note: "aaaa→qqqq event must not play on asas11 session",
      })
    );

    await context.close();
  } finally {
    await browser.close().catch(() => {});
  }
  log(`WEB done fail=${rows.filter((r) => !r.pass).map((r) => r.name).join(",") || "none"}`);
  return rows;
}

async function runAdmin(adminAuth, memberAuth) {
  log("ADMIN start");
  const browser = await launchBrowser(false);
  const rows = [];
  let chargeId = null;
  try {
    const { context, page } = await openAuthedPage(browser, adminAuth, ORIGIN, "/admin");
    await page.bringToFront();
    await page.evaluate(() => window.focus());
    await page.mouse.click(200, 200).catch(() => {});
    const subscribeDeadline = Date.now() + 12_000;
    let subscribeStatus = null;
    while (Date.now() < subscribeDeadline) {
      subscribeStatus = await page.evaluate(() => {
        const rows = window.__dibayAdminSoundTrace || [];
        const hit = [...rows].reverse().find((r) => r && r.stage === "RT_SUBSCRIBE");
        return hit?.status ?? null;
      });
      if (subscribeStatus === "SUBSCRIBED" || subscribeStatus === "NO_AUTH") break;
      await sleep(400);
    }
    const boot = await readProbe(page);
    rows.push(
      cell("admin.hydrate_pending_0", 0, boot, {
        pass: originOk(boot, [ORIGIN]) && boot.installed && boot.audio === 0,
        path: boot.path,
      })
    );

    await page.bringToFront();
    await page.evaluate(() => window.focus());
    await resetProbe(page);
    const bellBefore = await page.evaluate(async () => {
      const r = await fetch("/api/admin/admin-bell", { credentials: "include", cache: "no-store" });
      return r.json().catch(() => null);
    });
    const plans = await apiFetch("/api/me/point-plans", memberAuth);
    const planId = plans.json?.plans?.[0]?.id || null;
    let created = { status: 0, json: null };
    if (planId) {
      created = await apiFetch("/api/me/points/charge", memberAuth, {
        method: "POST",
        body: JSON.stringify({
          planId,
          paymentMethod: "manual_confirm",
          depositorName: "GATE3",
          userMemo: "gate3-sound-runtime",
        }),
      });
      chargeId = created.json?.request?.id || created.json?.id || null;
    }
    await sleep(8000);
    const neu = await readProbe(page);
    const bellAfter = await page.evaluate(async () => {
      const r = await fetch("/api/admin/admin-bell", { credentials: "include", cache: "no-store" });
      return r.json().catch(() => null);
    });
    const adminTrace = await page.evaluate(() => (window.__dibayAdminSoundTrace || []).slice(-20));
    if (!planId || created.status !== 200 || !chargeId) {
      rows.push({
        name: "admin.new_event_1",
        expectAudio: 1,
        audio: neu.audio,
        verdict: "NOT_PROVEN",
        pass: false,
        notProven: true,
        reason: `charge_create_failed status=${created.status} planId=${planId} id=${chargeId}`,
      });
    } else {
      rows.push(
        cell("admin.new_event_1", 1, neu, {
          pass: neu.audio === 1,
          chargeId,
          bellBefore: bellBefore?.total ?? null,
          bellAfter: bellAfter?.total ?? null,
          subscribeStatus,
          adminTrace,
        })
      );
    }

    await context.close();
  } finally {
    await browser.close().catch(() => {});
    if (chargeId) {
      try {
        await supabaseAdmin().from("point_charge_requests").delete().eq("id", chargeId);
        log(`ADMIN cleaned charge ${chargeId}`);
      } catch (e) {
        log(`ADMIN cleanup failed: ${e?.message || e}`);
      }
    }
  }
  log(`ADMIN done`);
  return rows;
}

async function prepareAndroidOrigin(serial) {
  adb(serial, "reverse", "--remove", "tcp:3000");
  const rev = adb(serial, "reverse", "tcp:3000", "tcp:3000");
  if (rev.status !== 0) log(`adb reverse warn ${serial} ${rev.stderr || rev.stdout}`);
  adb(serial, "shell", "input", "keyevent", "224");
  adb(serial, "shell", "input", "keyevent", "82");
  adb(serial, "shell", "am", "force-stop", PKG);
  await sleep(800);
  adb(serial, "shell", "am", "start", "-n", ACT);
  await sleep(3500);
}

async function runAndroid(label, serial, cdpPort, sender, receiver) {
  log(`ANDROID ${label} ${serial} start`);
  const rows = [];
  try {
    await prepareAndroidOrigin(serial);
    await sendMessage(sender, `G3-${label}-seed ${Date.now()}`);
    await sleep(500);

    forwardCdp(serial, cdpPort);
    let { browser, page } = await connectWebView(cdpPort);
    await page.context().addCookies(cookieObjects(receiver, ANDROID_ORIGIN));
    await installProbe(page);
    try {
      await page.goto(`${ANDROID_ORIGIN}/market`, { waitUntil: "domcontentloaded", timeout: 20_000 });
    } catch (e) {
      log(`${label} page.goto failed: ${e?.message || e}`);
      await page.evaluate((u) => {
        window.location.href = u;
      }, `${ANDROID_ORIGIN}/market`);
      await sleep(5000);
    }
    await injectDocumentCookies(page, receiver);
    await page.reload({ waitUntil: "domcontentloaded", timeout: 20_000 }).catch(() => {});
    await sleep(4000);
    await page.evaluate(PROBE_SRC).catch(() => {});
    await injectDocumentCookies(page, receiver);
    let boot = await readProbe(page);
    if (!originOk(boot, [ANDROID_ORIGIN, ORIGIN])) {
      await browser.close().catch(() => {});
      rows.push({
        name: `${label}.unread_entry_0`,
        verdict: "NOT_PROVEN",
        pass: false,
        notProven: true,
        reason: `origin_not_gate2 origin=${boot.origin}`,
        probe: boot,
      });
      return rows;
    }
    rows.push(
      cell(`${label}.unread_entry_0`, 0, boot, {
        pass: boot.installed && boot.audio === 0,
      })
    );

    await resetProbe(page);
    const fgSend = await sendMessage(sender, `G3-${label}-fg ${Date.now()}`);
    await sleep(4500);
    const fg = await readProbe(page);
    rows.push(
      cell(`${label}.new_event_1`, 1, fg, {
        pass: fg.audio === 1,
        sendStatus: fgSend.status,
      })
    );

    await resetProbe(page);
    adb(serial, "logcat", "-c");
    adb(serial, "shell", "input", "keyevent", "3");
    await sleep(1200);
    const bgSend = await sendMessage(sender, `G3-${label}-bg ${Date.now()}`);
    await sleep(10000);
    let bgJs = { audio: null, error: null };
    try {
      forwardCdp(serial, cdpPort);
      const recon = await connectWebView(cdpPort);
      browser = recon.browser;
      page = recon.page;
      bgJs = await readProbe(page);
    } catch (e) {
      bgJs = { audio: null, error: String(e?.message || e) };
    }
    const fcm = analyzeFcm(serial);
    const osOne = fcm.nativePosted || fcm.messageReceived;
    const jsZero = bgJs.audio === 0;
    rows.push({
      name: `${label}.background_os_1`,
      expectAudio: 0,
      audio: bgJs.audio,
      osPosted: fcm.nativePosted,
      fcmReceived: fcm.messageReceived,
      sendStatus: bgSend.status,
      pass: jsZero && osOne,
      verdict: jsZero && osOne ? "PASS" : jsZero && !osOne ? "FAIL" : "FAIL",
      fcmTail: fcm.tail.slice(-8),
      jsError: bgJs.error || null,
    });

    adb(serial, "shell", "am", "start", "-n", ACT);
    await sleep(3500);
    try {
      forwardCdp(serial, cdpPort);
      const recon = await connectWebView(cdpPort);
      browser = recon.browser;
      page = recon.page;
      await page.evaluate(PROBE_SRC).catch(() => {});
    } catch {
      /* keep previous page */
    }
    const beforeResume = await readProbe(page).catch(() => ({ audio: null }));
    await sleep(3000);
    const afterResume = await readProbe(page).catch(() => ({ audio: null }));
    const resumeDelta =
      beforeResume.audio == null || afterResume.audio == null
        ? null
        : afterResume.audio - beforeResume.audio;
    rows.push({
      name: `${label}.resume_0`,
      expectAudio: 0,
      audio: resumeDelta,
      before: beforeResume.audio,
      after: afterResume.audio,
      origin: afterResume.origin,
      pass: resumeDelta === 0,
      verdict: resumeDelta === 0 ? "PASS" : afterResume.origin && !originOk(afterResume, [ANDROID_ORIGIN, ORIGIN]) ? "NOT_PROVEN" : "FAIL",
    });

    await browser.close().catch(() => {});
  } catch (e) {
    rows.push({
      name: `${label}.error`,
      verdict: "NOT_PROVEN",
      pass: false,
      notProven: true,
      reason: String(e?.message || e),
    });
  }
  log(`ANDROID ${label} done`);
  return rows;
}

async function runIos(sender, receiver) {
  log("IOS start");
  const proxyPort = 9333;
  const proxyOut = path.join(OUT, "webkit-proxy.out");
  spawnSync("pkill", ["-f", "ios_webkit_debug_proxy"], { encoding: "utf8" });
  const child = spawn(
    "sh",
    ["-c", `ios_webkit_debug_proxy -c ${IPHONE_UDID}:${proxyPort} >${proxyOut} 2>&1`],
    { detached: true, stdio: "ignore", env: { ...process.env, DEVELOPER_DIR } }
  );
  child.unref();
  await sleep(2000);

  spawnSync(
    `${DEVELOPER_DIR}/usr/bin/devicectl`,
    [
      "device",
      "process",
      "launch",
      "--device",
      IPHONE_UDID,
      "--terminate-existing",
      "--payload-url",
      `${ANDROID_ORIGIN}/market`,
      "com.dibay.app",
    ],
    { encoding: "utf8", env: { ...process.env, DEVELOPER_DIR } }
  );
  await sleep(5000);

  let pageUrl = null;
  let targets = [];
  for (let i = 0; i < 20; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${proxyPort}/json`);
      targets = await res.json();
      const hit =
        (targets || []).find((p) => (p.url || "").includes("localhost")) ||
        (targets || []).find((p) => (p.url || "").includes("127.0.0.1")) ||
        (targets || []).find((p) => !!p.webSocketDebuggerUrl);
      if (hit?.webSocketDebuggerUrl) {
        pageUrl = hit.webSocketDebuggerUrl;
        fs.writeFileSync(path.join(OUT, "iphone-targets.json"), JSON.stringify({ picked: hit, list: targets }, null, 2));
        break;
      }
    } catch {
      /* retry */
    }
    await sleep(500);
  }
  if (!pageUrl) {
    return [
      {
        name: "ios.connect",
        verdict: "NOT_PROVEN",
        pass: false,
        notProven: true,
        reason: "webkit_no_page",
        proxyOut,
      },
    ];
  }

  const ws = new WebSocket(pageUrl);
  await new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
  let idSeq = 1;
  const waiters = new Map();
  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(String(raw));
      if (msg.id != null && waiters.has(msg.id)) {
        const w = waiters.get(msg.id);
        waiters.delete(msg.id);
        clearTimeout(w.timer);
        if (msg.error) w.reject(new Error(JSON.stringify(msg.error)));
        else w.resolve(msg.result || {});
      }
    } catch {
      /* ignore */
    }
  });
  function call(method, params = {}) {
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
  async function evalExpr(expression) {
    const r = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result?.value;
  }

  const originNow = await evalExpr("location.origin").catch((e) => String(e.message || e));
  if (originNow !== ANDROID_ORIGIN && originNow !== ORIGIN) {
    ws.close();
    return [
      {
        name: "ios.origin",
        verdict: "NOT_PROVEN",
        pass: false,
        notProven: true,
        reason: `ios_not_on_gate2_origin origin=${originNow}`,
        note: "Installed iOS app still production/hybrid; GATE 2 is uncommitted local tree",
      },
    ];
  }

  await evalExpr(PROBE_SRC);
  await evalExpr(`location.href = ${JSON.stringify(`${ANDROID_ORIGIN}/market`)}`);
  await sleep(5000);
  await evalExpr(PROBE_SRC);
  const boot = await evalExpr(
    `({ origin: location.origin, path: location.pathname, audio: window.__gate3 ? window.__gate3.audioPlays.length : -1, p1: window.__gate3 ? window.__gate3.p1Enters.length : -1, installed: !!(window.__gate3 && window.__gate3.installed), vis: document.visibilityState })`
  );
  const rows = [cell("ios.unread_entry_0", 0, boot, { pass: boot?.audio === 0 && boot?.installed })];
  await evalExpr(`window.__gate3 && (window.__gate3.audioPlays=[], window.__gate3.p1Enters=[], window.__gate3.console=[])`);
  await sendMessage(sender, `G3-ios-fg ${Date.now()}`);
  await sleep(4500);
  const fg = await evalExpr(
    `({ origin: location.origin, audio: window.__gate3 ? window.__gate3.audioPlays.length : -1, p1: window.__gate3 ? window.__gate3.p1Enters.length : -1, vis: document.visibilityState })`
  );
  rows.push(cell("ios.new_event_1", 1, fg, { pass: fg?.audio === 1 }));
  ws.close();
  return rows;
}

async function runCall(sender, receiver) {
  log("CALL start");
  const browser = await launchBrowser();
  const rows = [];
  let sessionId = null;
  try {
    const { context, page } = await openAuthedPage(browser, receiver, ORIGIN, "/market");
    await sleep(2500);
    await resetProbe(page);
    const started = await apiFetch(`/api/community-messenger/rooms/${DIRECT_ROOM}/calls`, sender, {
      method: "POST",
      body: JSON.stringify({ callKind: "voice", dialIntent: "fresh" }),
    });
    sessionId = started.json?.session?.id || started.json?.id || null;
    await sleep(5000);
    const probe = await readProbe(page);
    const callP1 = (probe.p1Enters || []).filter((x) => /call/i.test(x.s || ""));
    rows.push({
      name: "call.js_oneshot_0",
      expectAudio: 0,
      audio: probe.audio,
      p1: probe.p1,
      callP1,
      startStatus: started.status,
      startError: started.json?.error || null,
      sessionId,
      pass: started.status === 200 && probe.audio === 0 && callP1.length === 0,
      verdict:
        started.status !== 200
          ? "NOT_PROVEN"
          : probe.audio === 0 && callP1.length === 0
            ? "PASS"
            : "FAIL",
      notProven: started.status !== 200,
      note: "JS notification-sound must not play for incoming call; native ring is OS-owned",
    });
    await context.close();
  } finally {
    await browser.close().catch(() => {});
    if (sessionId) {
      const ended = await apiFetch(`/api/community-messenger/calls/sessions/${sessionId}`, sender, {
        method: "PATCH",
        body: JSON.stringify({ action: "cancel" }),
      });
      log(`CALL cancel status=${ended.status}`);
    }
  }
  return rows;
}

function summarize(all) {
  const by = {};
  for (const row of all) {
    by[row.name] = row.notProven ? "NOT_PROVEN" : row.pass ? "PASS" : "FAIL";
  }
  const proven = all.filter((r) => !r.notProven && r.name !== "ios.connect" && r.name !== "ios.origin");
  const fail = proven.filter((r) => !r.pass);
  const gate =
    fail.length > 0 ? "FAIL" : proven.length === 0 ? "NOT_PROVEN" : all.some((r) => r.notProven) ? "PASS_WITH_GAPS" : "PASS";
  return { by, fail: fail.map((r) => r.name), gate };
}

async function main() {
  loadEnv();
  log(`out=${OUT}`);
  log(`origin=${ORIGIN} androidOrigin=${ANDROID_ORIGIN}`);
  await waitOrigin();
  const health = await fetch(ORIGIN);
  log(`health=${health.status}`);

  const sender = await signIn(SENDER_LOGIN);
  const receiver = await signIn(RECEIVER_LOGIN);
  const other = await signIn(OTHER_LOGIN);
  if (receiver.userId !== USER_RECEIVER) log(`WARN receiver id ${receiver.userId} expected ${USER_RECEIVER}`);
  if (sender.userId !== USER_SENDER) log(`WARN sender id ${sender.userId} expected ${USER_SENDER}`);

  const devices = adb("", "devices", "-l").stdout || "";
  log(`adb=${devices.replace(/\s+/g, " ").trim()}`);

  const web = SLICE === "admin" ? [] : await runWeb(sender, receiver, other);
  const admin = SLICE === "web" ? [] : await runAdmin(sender, receiver);
  let samsung = [];
  let xiaomi = [];
  let ios = [];
  let call = [];
  if (SLICE === "all") {
    samsung = await runAndroid("samsung", SAMSUNG, 9224, sender, receiver);
    xiaomi = await runAndroid("xiaomi", XIAOMI, 9223, sender, receiver);
    try {
      ios = await runIos(sender, receiver);
    } catch (e) {
      ios = [{ name: "ios.error", verdict: "NOT_PROVEN", pass: false, notProven: true, reason: String(e?.message || e) }];
    }
    call = await runCall(sender, receiver);
  }

  const windowsNative = [
    {
      name: "windows.native",
      verdict: "NOT_PROVEN",
      pass: false,
      notProven: true,
      reason: "no Windows native runtime on this host; desktop Chromium covered by web.* rows",
    },
  ];

  const all = [...web, ...admin, ...samsung, ...xiaomi, ...ios, ...call, ...windowsNative];
  const summary = summarize(all);
  const report = {
    stamp: STAMP,
    origin: ORIGIN,
    androidOrigin: ANDROID_ORIGIN,
    listenPath: LISTEN_PATH,
    slice: SLICE,
    headNote: "GATE 2 local tree. Production APK/WebView default origin is NOT evidence.",
    deploy: false,
    hardLock: false,
    commit: false,
    summary,
    rows: all,
  };
  fs.writeFileSync(path.join(OUT, "REPORT.json"), JSON.stringify(report, null, 2));
  log(`GATE=${summary.gate}`);
  log(`by=${JSON.stringify(summary.by)}`);
  console.log(JSON.stringify({ out: OUT, gate: summary.gate, by: summary.by }, null, 2));
}

main().catch((e) => {
  log(`FATAL ${e?.stack || e}`);
  process.exit(1);
});

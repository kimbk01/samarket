#!/usr/bin/env node
/**
 * P4 Active Call — 2-device Android QA (adb + CDP).
 * Device A (caller): aaaa@manual.local · Device B (callee): qqqq@manual.local
 *
 * Usage: node scripts/qa/p4-active-call-device-qa.mjs
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ADB = process.env.ADB_PATH || `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`;
const PKG = "com.dibay.app";
const DEVICE_A = process.env.P4_DEVICE_A?.trim() || "8b37179f7d94";
const DEVICE_B = process.env.P4_DEVICE_B?.trim() || "RFCY40PY2CA";
const CDP_A = Number(process.env.P4_CDP_PORT_A || 9223);
const CDP_B = Number(process.env.P4_CDP_PORT_B || 9224);
const PERF = path.join(ROOT, "docs/perf");

function adb(serial, ...args) {
  return spawnSync(ADB, ["-s", serial, ...args], { encoding: "utf8" });
}

function lanOrigin() {
  const port = process.env.QA_SERVER_PORT?.trim() || process.env.PORT?.trim() || "3000";
  const ip =
    spawnSync("ipconfig", ["getifaddr", "en0"], { encoding: "utf8" }).stdout?.trim() ||
    spawnSync("ipconfig", ["getifaddr", "en1"], { encoding: "utf8" }).stdout?.trim() ||
    "192.168.100.64";
  return `http://${ip}:${port}`;
}

function loadEnvLocal() {
  for (const rel of [".env.local", ".env"]) {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
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

async function signInEmail(email) {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) throw new Error("Supabase env missing");
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  const password = process.env.E2E_TEST_PASSWORD?.trim() || "1234";
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`login failed ${email}: ${error?.message ?? "no session"}`);
  return data.session;
}

async function probeWebViewUser(page) {
  return page.evaluate(async () => {
    try {
      const r = await fetch("/api/me/settings", { credentials: "include", cache: "no-store" });
      if (!r.ok) return { ok: false, status: r.status };
      const j = await r.json();
      const u = String(j?.username ?? j?.profile?.username ?? j?.user?.username ?? "").toLowerCase();
      return { ok: true, username: u || null };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  });
}

async function wakeDevice(serial) {
  adb(serial, "shell", "input", "keyevent", "224");
  adb(serial, "shell", "input", "keyevent", "82");
}

async function reconnectDevice(serial, port, prev) {
  try {
    await prev.page.evaluate(() => true);
    return prev;
  } catch {
    await prev.browser.close().catch(() => {});
  }
  wakeDevice(serial);
  await sleep(2500);
  forwardCdp(serial, port);
  const conn = await connectDevice(serial, port);
  return conn;
}

async function injectSession(page, origin, email) {
  const session = await signInEmail(email);
  const ref = process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/https:\/\/([^.]+)\./)?.[1] ?? "";
  const host = new URL(origin).hostname;
  const cookieValue = encodeURIComponent(
    JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      expires_in: session.expires_in,
      token_type: session.token_type,
      user: session.user,
    }),
  );
  await page.context().addCookies([
    {
      name: `sb-${ref}-auth-token`,
      value: cookieValue,
      domain: host,
      path: "/",
      expires: session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
      httpOnly: false,
      secure: origin.startsWith("https"),
      sameSite: "Lax",
    },
  ]);
  const probe = await page.request.get(`${origin}/api/me/settings`);
  if (!probe.ok()) throw new Error(`session probe failed ${email} status=${probe.status()}`);
  return session.user.id;
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
  if (!sock) throw new Error(`webview devtools socket not found on ${serial}`);
  const f = adb(serial, "forward", `tcp:${port}`, `localabstract:${sock}`);
  if (f.status !== 0) throw new Error(`adb forward failed ${serial}: ${f.stderr}`);
  return sock;
}

async function connectDevice(serial, port) {
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const context = browser.contexts()[0] ?? (await browser.newContext());
  const page = context.pages()[0] ?? (await context.newPage());
  return { browser, page };
}

async function navigate(page, url) {
  await page.evaluate((u) => {
    window.location.href = u;
  }, url);
  await page.waitForTimeout(2500);
}

async function dismissModals(page) {
  const modal = page.locator('[aria-labelledby="dibay-call-permission-modal-title"]');
  if (await modal.isVisible().catch(() => false)) {
    await page.getByRole("button", { name: /나중에|Not now/i }).click();
    await page.waitForTimeout(300);
  }
}

async function resolvePeerUserId(peerLogin) {
  const email = peerLogin.includes("@") ? peerLogin : `${peerLogin}@manual.local`;
  const session = await signInEmail(email);
  return String(session.user.id);
}

function tempCallHref(origin, kind, peerUserId) {
  const temp = `tmp_p4_${Date.now()}`;
  const q = new URLSearchParams({ kind, peerUserId });
  return `${origin}/community-messenger/calls/${encodeURIComponent(temp)}?${q.toString()}`;
}

async function waitForCallUrl(page, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const href = await page.evaluate(() => location.href);
    if (/\/community-messenger\/calls\/(?!tmp_)/.test(href)) {
      const m = href.match(/\/calls\/([^/?#]+)/);
      return m?.[1] ?? null;
    }
    await page.waitForTimeout(500);
  }
  return null;
}

async function acceptIncoming(page, origin, callId) {
  if (callId) {
    await navigate(page, `${origin}/community-messenger/calls/${encodeURIComponent(callId)}?action=accept`);
    await dismissModals(page);
    await page.waitForTimeout(3000);
    const href = await page.evaluate(() => location.href);
    if (href.includes(callId)) return true;
  }
  for (let i = 0; i < 90; i += 1) {
    const accept = page.getByRole("button", { name: /응답|수락|Answer|Accept/i }).first();
    if (await accept.isVisible().catch(() => false)) {
      await accept.click();
      return true;
    }
    await page.waitForTimeout(500);
  }
  return false;
}

async function waitConnected(page, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => ({
      href: location.href,
      body: (document.body?.innerText ?? "").slice(0, 400),
    }));
    if (/00:\d{2}|종료|End/i.test(state.body) && /\/calls\//.test(state.href)) return true;
    await page.waitForTimeout(1000);
  }
  return false;
}

async function endCall(page) {
  const end = page.getByRole("button", { name: /^종료$|^End$/i }).first();
  if (await end.isVisible().catch(() => false)) {
    await end.click();
    await page.waitForTimeout(1500);
    return true;
  }
  return false;
}

function logcatSnapshot(serial, patterns, tail = 400) {
  const r = adb(serial, "logcat", "-d", "-t", String(tail));
  const lines = (r.stdout || "").split("\n");
  const hits = [];
  for (const line of lines) {
    if (patterns.some((p) => (typeof p === "string" ? line.includes(p) : p.test(line)))) hits.push(line.trim());
  }
  return hits;
}

function forbiddenHits(serial) {
  const patterns = [
    /active_call_cleanup reason=(screen_off|backgrounded|activity_destroyed|webview_reload)/,
    /background caused call ended/,
    /screen off caused agora_leave/,
    /heartbeat_patch_failed|heartbeat PATCH failed/i,
  ];
  return logcatSnapshot(serial, patterns, 800);
}

function keepAliveHits(serial) {
  return logcatSnapshot(serial, [
    "call_lifecycle_background_keep_alive",
    "call_lifecycle_screen_off_keep_alive",
    "active_call_connected",
    "call_lifecycle_pip",
  ], 800);
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function runScenario(ctx, scenario) {
  const { origin, getPages, peerUserId, serialA, serialB, portA, portB, connARef, connBRef } = ctx;
  let { pageA, pageB } = getPages();
  const result = { id: scenario.id, name: scenario.name, pass: false, callId: null, notes: [] };

  adb(serialA, "logcat", "-c");
  adb(serialB, "logcat", "-c");

  await navigate(pageB, `${origin}/community-messenger?section=chats`);
  await dismissModals(pageB);
  await navigate(pageA, tempCallHref(origin, scenario.kind, peerUserId));
  await dismissModals(pageA);

  const callId = await waitForCallUrl(pageA);
  result.callId = callId;
  if (!callId) {
    result.notes.push("caller never got real session id");
    return result;
  }

  wakeDevice(serialB);
  const accepted = await acceptIncoming(pageB, origin, callId);
  if (!accepted) {
    result.notes.push("callee accept failed");
    return result;
  }
  connBRef.current = await reconnectDevice(serialB, portB, connBRef.current);
  pageB = connBRef.current.page;

  const connectedA = await waitConnected(pageA);
  const connectedB = await waitConnected(pageB);
  if (!connectedA || !connectedB) {
    result.notes.push(`connected A=${connectedA} B=${connectedB}`);
    return result;
  }

  if (scenario.action) {
    await scenario.action({ serialA, serialB, pageA, pageB, kind: scenario.kind });
    wakeDevice(serialB);
    wakeDevice(serialA);
    connARef.current = await reconnectDevice(serialA, portA, connARef.current);
    connBRef.current = await reconnectDevice(serialB, portB, connBRef.current);
    pageA = connARef.current.page;
    pageB = connBRef.current.page;
  }

  await sleep(scenario.holdMs ?? 8000);

  const forbidA = forbiddenHits(serialA);
  const forbidB = forbiddenHits(serialB);
  if (forbidA.length || forbidB.length) {
    result.notes.push(`forbidden logs A=${forbidA.length} B=${forbidB.length}`);
    result.forbidden = { A: forbidA.slice(0, 5), B: forbidB.slice(0, 5) };
    return result;
  }

  const keep = [...keepAliveHits(serialA), ...keepAliveHits(serialB)];
  if (scenario.expectKeepAlive && keep.length === 0) {
    result.notes.push("expected keep-alive markers missing");
    return result;
  }

  if (scenario.endBy === "A") await endCall(pageA);
  else if (scenario.endBy === "B") await endCall(pageB);
  else if (scenario.endBy !== "none") await endCall(pageA);

  await sleep(3000);
  result.pass = true;
  return result;
}

async function main() {
  const origin = lanOrigin();
  loadEnvLocal();

  const devs = (spawnSync(ADB, ["devices"], { encoding: "utf8" }).stdout || "")
    .split("\n")
    .filter((l) => l.endsWith("\tdevice"))
    .map((l) => l.split("\t")[0]);
  if (!devs.includes(DEVICE_A) || !devs.includes(DEVICE_B)) {
    throw new Error(`devices missing — want A=${DEVICE_A} B=${DEVICE_B}, have ${devs.join(",")}`);
  }

  console.log(`[p4-qa] origin=${origin} A=${DEVICE_A} B=${DEVICE_B}`);

  const peerUserId = await resolvePeerUserId("qqqq");
  console.log(`[p4-qa] peerUserId(qqqq)=${peerUserId}`);

  const skipAuth = process.env.P4_SKIP_AUTH !== "0";

  for (const serial of [DEVICE_A, DEVICE_B]) {
    wakeDevice(serial);
    adb(serial, "shell", "am", "start", "-n", `${PKG}/.MainActivity`);
    await sleep(4000);
  }
  forwardCdp(DEVICE_A, CDP_A);
  forwardCdp(DEVICE_B, CDP_B);

  let connA = await connectDevice(DEVICE_A, CDP_A);
  let connB = await connectDevice(DEVICE_B, CDP_B);

  const logsA = [];
  const logsB = [];
  connA.page.on("console", (m) => {
    const t = m.text();
    if (t.includes("[DIBAY_CALL]") || t.includes("dibay-call")) logsA.push(t);
  });
  connB.page.on("console", (m) => {
    const t = m.text();
    if (t.includes("[DIBAY_CALL]") || t.includes("dibay-call")) logsB.push(t);
  });

  const probeA = await probeWebViewUser(connA.page);
  const probeB = await probeWebViewUser(connB.page);
  console.log(`[p4-qa] session probe A=${JSON.stringify(probeA)} B=${JSON.stringify(probeB)}`);

  if (!skipAuth || !probeA.ok || !probeB.ok) {
    console.log("[p4-qa] injecting sessions (probe failed or P4_SKIP_AUTH=0)");
    await injectSession(connA.page, origin, "aaaa@manual.local");
    await injectSession(connB.page, origin, "qqqq@manual.local");
  } else {
    console.log("[p4-qa] using existing device logins");
  }

  const connARef = { current: connA };
  const connBRef = { current: connB };

  const ctx = {
    origin,
    getPages: () => ({ pageA: connARef.current.page, pageB: connBRef.current.page }),
    peerUserId,
    serialA: DEVICE_A,
    serialB: DEVICE_B,
    portA: CDP_A,
    portB: CDP_B,
    connARef,
    connBRef,
  };

  const scenarios = [
    {
      id: "A",
      name: "voice + B screen off",
      kind: "voice",
      expectKeepAlive: true,
      action: async ({ serialB }) => {
        adb(serialB, "shell", "input", "keyevent", "26");
        await sleep(2000);
      },
    },
    {
      id: "B",
      name: "video + B screen off",
      kind: "video",
      expectKeepAlive: true,
      action: async ({ serialB }) => {
        adb(serialB, "shell", "input", "keyevent", "26");
        await sleep(2000);
        adb(serialB, "shell", "input", "keyevent", "26");
      },
    },
    {
      id: "C",
      name: "B home",
      kind: "voice",
      expectKeepAlive: true,
      action: async ({ serialB }) => {
        adb(serialB, "shell", "input", "keyevent", "3");
      },
    },
    {
      id: "D",
      name: "B lock",
      kind: "voice",
      expectKeepAlive: true,
      action: async ({ serialB }) => {
        adb(serialB, "shell", "input", "keyevent", "26");
      },
    },
    {
      id: "E",
      name: "B task swipe (force-stop)",
      kind: "voice",
      expectKeepAlive: false,
      endBy: "none",
      action: async ({ serialB }) => {
        adb(serialB, "shell", "am", "force-stop", PKG);
      },
      holdMs: 5000,
    },
    {
      id: "F",
      name: "A ends → B remote",
      kind: "voice",
      endBy: "A",
    },
    {
      id: "G",
      name: "B ends → A remote",
      kind: "voice",
      endBy: "B",
    },
    {
      id: "H",
      name: "network blip B",
      kind: "voice",
      expectKeepAlive: true,
      action: async ({ serialB }) => {
        adb(serialB, "shell", "svc", "wifi", "disable");
        await sleep(4000);
        adb(serialB, "shell", "svc", "wifi", "enable");
      },
      holdMs: 15000,
    },
    {
      id: "I",
      name: "re-entry",
      kind: "voice",
      endBy: "A",
    },
    {
      id: "J",
      name: "video PiP B",
      kind: "video",
      expectKeepAlive: true,
      action: async ({ serialB }) => {
        adb(serialB, "shell", "input", "keyevent", "3");
        await sleep(2000);
      },
      holdMs: 10000,
    },
  ];

  const results = [];
  for (const scenario of scenarios) {
    console.log(`[p4-qa] scenario ${scenario.id} — ${scenario.name}`);
    try {
      if (scenario.id === "I") {
        await navigate(connARef.current.page, `${origin}/community-messenger`);
        await navigate(connBRef.current.page, `${origin}/community-messenger`);
        await sleep(2000);
      }
      const row = await runScenario(ctx, scenario);
      results.push(row);
      console.log(`[p4-qa] ${scenario.id}: ${row.pass ? "PASS" : "FAIL"} callId=${row.callId ?? "-"} ${row.notes.join("; ")}`);
      await sleep(4000);
      connARef.current = await reconnectDevice(DEVICE_A, CDP_A, connARef.current);
      connBRef.current = await reconnectDevice(DEVICE_B, CDP_B, connBRef.current);
      await navigate(connBRef.current.page, `${origin}/community-messenger?section=chats`);
      await navigate(connARef.current.page, `${origin}/community-messenger?section=chats`);
      await sleep(2000);
    } catch (err) {
      results.push({
        id: scenario.id,
        name: scenario.name,
        pass: false,
        notes: [err instanceof Error ? err.message : String(err)],
      });
    }
  }

  const report = {
    at: new Date().toISOString(),
    origin,
    deviceA: DEVICE_A,
    deviceB: DEVICE_B,
    peerUserId,
    results,
    passCount: results.filter((r) => r.pass).length,
    total: results.length,
    logsA: logsA.slice(-40),
    logsB: logsB.slice(-40),
  };

  const outJson = path.join(PERF, "p4-active-call-qa-report.json");
  fs.mkdirSync(PERF, { recursive: true });
  fs.writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`);

  adb(DEVICE_A, "logcat", "-d", "-t", "2000").stdout &&
    fs.writeFileSync(path.join(PERF, "p4-xiaomi-logcat-qa-final.txt"), adb(DEVICE_A, "logcat", "-d", "-t", "2000").stdout);
  adb(DEVICE_B, "logcat", "-d", "-t", "2000").stdout &&
    fs.writeFileSync(path.join(PERF, "p4-samsung-logcat-qa-final.txt"), adb(DEVICE_B, "logcat", "-d", "-t", "2000").stdout);

  console.log(`[p4-qa] report → ${outJson}`);
  console.log(JSON.stringify(report, null, 2));

  await connARef.current.browser.close().catch(() => {});
  await connBRef.current.browser.close().catch(() => {});
  process.exit(report.passCount === report.total ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

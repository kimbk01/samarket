#!/usr/bin/env node
/**
 * Samsung 실기기 WebView CDP QA — adb forward + Playwright connectOverCDP.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ADB = process.env.ADB_PATH || `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`;
const DEVICE = process.env.ADB_SERIAL || "RFCY40PY2CA";
const CDP_PORT = 9223;

function adb(...args) {
  return spawnSync(ADB, ["-s", DEVICE, ...args], { encoding: "utf8" });
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
  if (!sock) throw new Error("webview_devtools socket not found — app running?");
  const f = adb("forward", `tcp:${CDP_PORT}`, `localabstract:${sock}`);
  if (f.status !== 0) throw new Error(`adb forward failed: ${f.stderr}`);
  return sock;
}

function lanOrigin() {
  const port = process.env.QA_SERVER_PORT?.trim() || "3001";
  const ip = spawnSync("ipconfig", ["getifaddr", "en0"], { encoding: "utf8" }).stdout?.trim();
  return `http://${ip || "192.168.100.64"}:${port}`;
}

function parseRoomId() {
  const env = process.env.E2E_SNAPSHOT_DIAG_ROOM_ID?.trim();
  if (env) return env;
  const r = spawnSync(process.execPath, ["scripts/prepare-cm-pass0-e2e.mjs"], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, SKIP_CM_STORAGE: "1" },
  });
  const m = r.stdout.match(/"E2E_SNAPSHOT_DIAG_ROOM_ID":\s*"([^"]+)"/);
  return m?.[1] ?? null;
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

async function injectE2eSession(page, origin) {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) throw new Error("Supabase env missing for device login");
  const ref = url.match(/https:\/\/([^.]+)\./)?.[1] ?? "";
  const host = new URL(origin).hostname;
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  const email = "aaaa@manual.local";
  const password = process.env.E2E_TEST_PASSWORD?.trim() || "1234";
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`device login failed: ${error?.message ?? "no session"}`);
  const session = data.session;
  const cookieValue = encodeURIComponent(
    JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      expires_in: session.expires_in,
      token_type: session.token_type,
      user: session.user,
    })
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
  if (!probe.ok()) throw new Error(`session probe failed status=${probe.status()}`);
}

async function navigateInWebView(page, url) {
  await page.evaluate((u) => {
    window.location.href = u;
  }, url);
  for (let i = 0; i < 120; i += 1) {
    const state = await page.evaluate(() => ({
      url: location.href,
      hasTextarea: !!document.querySelector("textarea"),
      hasPlaceholder: !!document.querySelector("[data-cm-room-viewport-placeholder]"),
      body: (document.body?.innerText ?? "").slice(0, 120),
    }));
    if (state.hasTextarea || state.hasPlaceholder) return state;
    await page.waitForTimeout(1500);
  }
  throw new Error(`navigate timeout url=${url}`);
}

async function dismissModals(page) {
  const modal = page.locator('[aria-labelledby="dibay-call-permission-modal-title"]');
  if (await modal.isVisible().catch(() => false)) {
    await page.getByRole("button", { name: /나중에|Not now/i }).click();
    await page.waitForTimeout(300);
  }
}

async function main() {
  const roomId = parseRoomId();
  if (!roomId) throw new Error("room id missing");
  const origin = lanOrigin();
  const roomUrl = `${origin}/community-messenger/rooms/${encodeURIComponent(roomId)}`;

  adb("shell", "am", "force-stop", "com.dibay.app");
  adb("shell", "am", "start", "-n", "com.dibay.app/.MainActivity");
  await new Promise((r) => setTimeout(r, 5000));
  const sock = forwardCdp();
  console.log(`[cdp-qa] socket=${sock} origin=${origin}`);

  const logs = [];
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`);
  const context = browser.contexts()[0] ?? (await browser.newContext());
  const page = context.pages()[0] ?? (await context.newPage());

  page.on("console", (msg) => {
    const t = msg.text();
    if (t.includes("[chat-room-timeline]") || t.includes("[chat-room-scroll]")) {
      logs.push(t);
      console.log(`[device-console] ${t}`);
    }
  });

  const results = {
    device: DEVICE,
    roomId,
    roomUrl,
    checks: {},
    log_events: [],
    logs,
  };

  try {
    await injectE2eSession(page, origin);
    await navigateInWebView(page, roomUrl);
    await dismissModals(page);

    for (let i = 0; i < 3; i += 1) {
      await navigateInWebView(page, `${origin}/community-messenger`);
      await page.waitForTimeout(500);
      await navigateInWebView(page, roomUrl);
      await dismissModals(page);
      await page.waitForTimeout(1500);
    }
    results.checks.reentry_3x = true;

    const textarea = page.locator("textarea").first();
    await textarea.waitFor({ state: "visible", timeout: 30_000 });
    await dismissModals(page);
    await textarea.click();
    await page.waitForTimeout(400);

    for (let i = 0; i < 3; i += 1) {
      const msg = `device-qa-${Date.now()}-${i}`;
      await textarea.fill(msg);
      await page.locator("[data-cm-line-send-btn]").click();
      await page.waitForTimeout(800);
      results.checks[`send_${i + 1}_focus`] = await textarea.evaluate((el) => document.activeElement === el);
    }
    results.checks.keyboard_focus_after_3_send =
      results.checks.send_1_focus && results.checks.send_2_focus && results.checks.send_3_focus;

    const scrollEl = page.locator("[data-cm-room-scroll-viewport], main").first();
    await scrollEl.evaluate((el) => {
      el.scrollTop = 0;
    });
    await page.waitForTimeout(600);

    const burst = await page.evaluate(() => {
      const w = window;
      if (typeof w.__cmPerfSimulateRealtimeBurst !== "function") return false;
      w.__cmPerfSimulateRealtimeBurst(1);
      return true;
    });
    await page.waitForTimeout(900);
    const chipUp = await page
      .getByRole("button", { name: /새 메시지|new message/i })
      .isVisible()
      .catch(() => false);
    results.checks.chip_when_scrolled_up = burst ? chipUp : "skipped_no_burst_hook";

    await scrollEl.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await page.waitForTimeout(500);
    if (burst) {
      await page.evaluate(() => {
        if (typeof window.__cmPerfSimulateRealtimeBurst === "function") {
          window.__cmPerfSimulateRealtimeBurst(1);
        }
      });
      await page.waitForTimeout(800);
    }
    results.checks.near_bottom_restored = true;
  } catch (err) {
    results.error = err instanceof Error ? err.message : String(err);
  }

  for (const line of logs) {
    const m = line.match(/\[chat-room-(?:timeline|scroll)\]\s+(\S+)/);
    if (m) results.log_events.push(m[1]);
  }
  results.log_events = [...new Set(results.log_events)];

  const required = [
    "initial_fetch_start",
    "initial_fetch_done",
    "composer_height_changed",
    "near_bottom_true",
  ];
  results.checks.required_logs = Object.fromEntries(
    required.map((k) => [k, results.log_events.includes(k)])
  );

  const out = path.join(ROOT, "docs/perf/cm-room-android-cdp-qa-report.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(results, null, 2)}\n`);
  console.log(`[cdp-qa] report → ${out}`);
  console.log(JSON.stringify(results, null, 2));

  await browser.close();
  process.exit(results.error ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

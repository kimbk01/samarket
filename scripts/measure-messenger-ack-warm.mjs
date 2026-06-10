#!/usr/bin/env node
/**
 * Messenger send ACK warm-path measurement (click → POST 200).
 *
 * Discards the first send per cycle (cold compile/cache), records sends 2–3.
 * Compares warm samples against messenger-performance-targets §4 (≤200ms prod same-region).
 *
 * Usage:
 *   PLAYWRIGHT_NO_WEBSERVER=1 PLAYWRIGHT_BASE_URL=http://localhost:3000 \
 *   E2E_TEST_USERNAME=aaaa E2E_TEST_PASSWORD=1234 \
 *   node scripts/measure-messenger-ack-warm.mjs
 *
 * Prod (same Supabase region as app):
 *   PLAYWRIGHT_BASE_URL=https://your-prod-host \
 *   MESSENGER_ACK_WARM_CYCLES=3 \
 *   node scripts/measure-messenger-ack-warm.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const cycles = Math.max(1, Number(process.env.MESSENGER_ACK_WARM_CYCLES ?? "3") || 3);
const sendsPerCycle = Math.max(2, Number(process.env.MESSENGER_ACK_WARM_SENDS_PER_CYCLE ?? "3") || 3);
const targetMs = Number(process.env.MESSENGER_ACK_WARM_TARGET_MS ?? "200") || 200;
const baseUrl = (process.env.PLAYWRIGHT_BASE_URL || process.env.SAMARKET_BASE_URL || "http://localhost:3000").replace(
  /\/$/,
  ""
);
const username = process.env.E2E_TEST_USERNAME || "aaaa";
const password = process.env.E2E_TEST_PASSWORD || "1234";
const storageStatePath = path.join(root, "tests", "e2e", ".auth", "cm-storage.json");
const defaultOut =
  baseUrl.includes("samarket.vercel.app") || baseUrl.includes("vercel.app")
    ? "messenger-ack-warm-prod-latest.json"
    : "messenger-ack-warm-latest.json";
const outPath = process.env.MESSENGER_ACK_WARM_OUT || path.join(root, "docs", "perf", defaultOut);

function loadEnvLocal() {
  const envPath = path.join(root, ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

async function ensureStorageState() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) throw new Error("NEXT_PUBLIC_SUPABASE_URL / ANON_KEY required");
  const ref = url.match(/https:\/\/([^.]+)\./)?.[1] ?? "";
  if (!ref) throw new Error("invalid supabase url");
  const candidates = [
    username.includes("@") ? username : `${username}@manual.local`,
    username.includes("@") ? username : `${username}@samarket.local`,
    username,
  ];
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  let session = null;
  let usedEmail = "";
  for (const email of candidates) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (!error && data.session) {
      session = data.session;
      usedEmail = email;
      break;
    }
  }
  if (!session) throw new Error("signIn failed for test user");
  const origin = new URL(baseUrl);
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
      domain: origin.hostname,
      path: "/",
      expires: session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
      httpOnly: false,
      secure: origin.protocol === "https:",
      sameSite: "Lax",
    },
  ];
  loadEnvLocal();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (serviceKey) {
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL.trim(), serviceKey, {
      auth: { persistSession: false },
    });
    const { data: pr } = await admin
      .from("profiles")
      .select("active_session_id")
      .eq("id", session.user.id)
      .maybeSingle();
    const activeSession = String(pr?.active_session_id ?? "").trim();
    if (activeSession) {
      cookies.push({
        name: "samarket_active_session_id",
        value: encodeURIComponent(activeSession),
        domain: origin.hostname,
        path: "/",
        expires: session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
        httpOnly: false,
        secure: origin.protocol === "https:",
        sameSite: "Lax",
      });
    }
  }
  fs.mkdirSync(path.dirname(storageStatePath), { recursive: true });
  fs.writeFileSync(storageStatePath, `${JSON.stringify({ cookies, origins: [] }, null, 2)}\n`, "utf8");
  console.log(`auth: ${usedEmail}`);
  return storageStatePath;
}

function summarize(samples) {
  if (!samples.length) return { count: 0, min: null, max: null, avg: null, p95: null };
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, n) => acc + n, 0);
  const p95Idx = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return {
    count: sorted.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: Math.round(sum / sorted.length),
    p95: sorted[p95Idx],
  };
}

async function resolveFirstRoomHref(page) {
  await page.goto(`${baseUrl}/community-messenger`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page
    .locator('[data-messenger-chat-row="true"]')
    .first()
    .waitFor({ state: "visible", timeout: 45_000 });
  let firstRoomHref = await page
    .evaluate(() => {
      const link = document.querySelector(
        '[data-messenger-chat-row="true"] a[href*="/community-messenger/rooms/"]'
      );
      return link?.href ?? "";
    })
    .catch(() => "");
  if (!firstRoomHref) {
    const boot = await page
      .request.get(`${baseUrl}/api/community-messenger/bootstrap?lite=1`, { timeout: 45_000 })
      .then((r) => r.json())
      .catch(() => null);
    const roomId = boot?.chats?.find?.((room) => typeof room?.id === "string" && room.id.trim())?.id;
    if (roomId) firstRoomHref = `${baseUrl}/community-messenger/rooms/${encodeURIComponent(roomId)}`;
  }
  if (!firstRoomHref) throw new Error("no_room_for_ack_warm");
  return firstRoomHref;
}

async function sendOnce(page) {
  const textarea = page.locator("textarea").first();
  await textarea.fill(`ack-warm-${Date.now()}`);
  const resP = page.waitForResponse(
    (r) =>
      r.request().method() === "POST" &&
      r.url().includes("/api/community-messenger/rooms/") &&
      r.url().includes("/messages") &&
      !r.url().includes("/sticker"),
    { timeout: 45_000 }
  );
  const t0 = Date.now();
  await page.locator("footer button:not([disabled])").last().click();
  const res = await resP;
  const hdr = res.headers();
  const pickHdr = (name) => {
    const v = hdr[name] ?? hdr[name.toLowerCase()];
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const serverRouteMs = pickHdr("x-samarket-send-route-ms");
  const serverHandlerMs = pickHdr("x-samarket-send-handler-ms");
  const serverGateMs = pickHdr("x-samarket-send-gate-ms");
  return {
    ack_ms: Date.now() - t0,
    status: res.status(),
    server_route_ms: serverRouteMs,
    server_handler_ms: serverHandlerMs,
    server_gate_ms: serverGateMs,
  };
}

async function runCycle(page, cycleIndex) {
  const roomHref = await resolveFirstRoomHref(page);
  await page.goto(roomHref, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForURL(/\/community-messenger\/rooms\//, { timeout: 45_000 });
  await page.locator("textarea").first().waitFor({ state: "visible", timeout: 45_000 });

  const sends = [];
  for (let i = 0; i < sendsPerCycle; i += 1) {
    const result = await sendOnce(page);
    sends.push({ send_index: i + 1, ...result });
  }
  const warm = sends.slice(1).map((s) => s.ack_ms);
  return { cycle: cycleIndex + 1, room_href: roomHref, sends, warm_ack_ms: warm };
}

async function main() {
  const storageState = await ensureStorageState();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState });
  const page = await context.newPage();
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem("samarket:debug:runtime", "1");
    } catch {
      /* ignore */
    }
  });

  const cycleResults = [];
  const errors = [];
  try {
    for (let c = 0; c < cycles; c += 1) {
      try {
        cycleResults.push(await runCycle(page, c));
      } catch (error) {
        errors.push({ cycle: c + 1, message: String(error).slice(0, 500) });
      }
    }
  } finally {
    await browser.close();
  }

  const allWarm = cycleResults.flatMap((r) => r.warm_ack_ms);
  const warmSendRows = cycleResults.flatMap((r) =>
    r.sends.slice(1).map((s) => ({
      ack_ms: s.ack_ms,
      server_route_ms: s.server_route_ms,
      server_handler_ms: s.server_handler_ms,
    }))
  );
  const stats = summarize(allWarm);
  const serverRouteStats = summarize(
    warmSendRows.map((r) => r.server_route_ms).filter((n) => n != null)
  );
  const serverHandlerStats = summarize(
    warmSendRows.map((r) => r.server_handler_ms).filter((n) => n != null)
  );
  const gatePass =
    stats.count > 0 && stats.p95 != null && stats.max != null && stats.p95 <= targetMs && stats.max <= targetMs * 1.5;

  const report = {
    measured_at: new Date().toISOString(),
    base_url: baseUrl,
    cycles,
    sends_per_cycle: sendsPerCycle,
    warm_discard: "first send per cycle",
    target_ms: targetMs,
    gate: {
      prod_same_region_ack_le_target: gatePass,
      note: "PASS requires warm p95 ≤ target and max ≤ 1.5× target. Local dev may exceed prod.",
    },
    warm_ack_ms: stats,
    warm_server_route_ms: serverRouteStats,
    warm_server_handler_ms: serverHandlerStats,
    cycles_detail: cycleResults,
    errors,
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log("MESSENGER_ACK_WARM_JSON:", JSON.stringify(report));
  console.log(`wrote ${path.relative(root, outPath)}`);
  process.exit(errors.length && !allWarm.length ? 1 : gatePass ? 0 : 2);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

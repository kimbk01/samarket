#!/usr/bin/env node
/**
 * TRADE-AUDIT-3 — /market → /post → 채팅하기 → 방/compose (3 cycles).
 *
 * Usage:
 *   PLAYWRIGHT_NO_WEBSERVER=1 PLAYWRIGHT_BASE_URL=http://localhost:3000 \
 *   E2E_TEST_USERNAME=qqqq E2E_TEST_PASSWORD=1234 \
 *   node scripts/measure-trade-chat-open.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const cycles = Math.max(1, Number(process.env.TRADE_CHAT_OPEN_CYCLES ?? "3") || 3);
const baseUrl = (process.env.PLAYWRIGHT_BASE_URL || process.env.SAMARKET_BASE_URL || "http://localhost:3000").replace(
  /\/$/,
  ""
);
const outPath = process.env.TRADE_CHAT_OPEN_OUT || path.join(root, "docs", "perf", "trade-chat-open-latest.json");
const PERMISSION_GUIDE_PRESEED_KINDS = ["location", "microphone", "speaker"];
const E2E_TRADE_PHASE_KEY = "samarket:debug:e2e:tradeC2cPhaseLastMs";

function loadEnvLocal() {
  const p = path.join(root, ".env.local");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

async function signInSession() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !anon) throw new Error("NEXT_PUBLIC_SUPABASE_URL / ANON_KEY required");
  const ref = url.match(/https:\/\/([^.]+)\./)?.[1] ?? "";
  const hostname = new URL(baseUrl).hostname;
  const password = process.env.E2E_TEST_PASSWORD ?? "1234";
  const loginIds = [process.env.E2E_TEST_USERNAME?.trim(), "qqqq", "aaaa"].filter(Boolean);
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  for (const loginId of loginIds) {
    const email = loginId.includes("@") ? loginId.toLowerCase() : `${loginId.toLowerCase()}@manual.local`;
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error || !data.session) continue;
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
        domain: hostname,
        path: "/",
        sameSite: "Lax",
        secure: baseUrl.startsWith("https:"),
      },
    ];
    if (serviceKey) {
      const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
      const { data: pr } = await admin
        .from("profiles")
        .select("active_session_id")
        .eq("id", data.session.user.id)
        .maybeSingle();
      const activeSession = String(pr?.active_session_id ?? "").trim();
      if (activeSession) {
        cookies.push({
          name: "samarket_active_session_id",
          value: encodeURIComponent(activeSession),
          domain: hostname,
          path: "/",
          sameSite: "Lax",
          secure: baseUrl.startsWith("https:"),
        });
      }
    }
    return { cookies, email };
  }
  throw new Error("signIn failed");
}

function pickMs(snap, key) {
  const v = snap?.appWidePhaseLastMs?.[key] ?? snap?.e2eTradePhaseLastMs?.[key];
  return typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null;
}

async function readSnap(page) {
  return page.evaluate((sessionKey) => {
    let e2eTradePhaseLastMs = null;
    try {
      const raw = sessionStorage.getItem(sessionKey);
      if (raw) e2eTradePhaseLastMs = JSON.parse(raw);
    } catch {
      /* ignore */
    }
    const base = window.getMessengerHomeVerificationSnapshot?.() ?? null;
    if (!base) return e2eTradePhaseLastMs ? { e2eTradePhaseLastMs, appWidePhaseLastMs: {} } : null;
    return { ...base, e2eTradePhaseLastMs: e2eTradePhaseLastMs ?? {} };
  }, E2E_TRADE_PHASE_KEY);
}

function summarize(samples) {
  if (!samples.length) return { count: 0, min: null, max: null, avg: null, p95: null };
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((a, n) => a + n, 0);
  const p95Idx = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return {
    count: sorted.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: Math.round(sum / sorted.length),
    p95: sorted[p95Idx],
  };
}

async function dismissPermissionGuides(page) {
  const later = page.getByRole("button", { name: /^나중에$|^Later$/i });
  for (let i = 0; i < 3; i += 1) {
    if (!(await later.first().isVisible({ timeout: 1200 }).catch(() => false))) break;
    await later.first().click({ timeout: 4000 }).catch(() => undefined);
    await page.waitForTimeout(250);
  }
}

async function runCycle(page, cycleIndex) {
  await page.goto(`${baseUrl}/market`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  if (cycleIndex === 0) await page.waitForTimeout(2000);
  await dismissPermissionGuides(page);
  const postLink = page.locator('a[href^="/post/"]').first();
  await postLink.waitFor({ state: "visible", timeout: 45_000 });
  await postLink.click();
  await page.waitForURL(/\/post\//, { timeout: 45_000 });
  await page.locator("h2").first().waitFor({ state: "visible", timeout: 45_000 });
  await page.waitForTimeout(800);

  const chatBtn = page.getByRole("button", { name: /채팅하기|채팅 이어가기|Chat/i }).first();
  if (!(await chatBtn.isVisible({ timeout: 10_000 }).catch(() => false))) {
    throw new Error("chat_cta_not_visible");
  }
  const clickAt = Date.now();
  await chatBtn.click();
  await Promise.race([
    page.waitForURL(/\/community-messenger\/rooms\//, { timeout: 60_000 }),
    page.waitForURL(/\/mypage\/trade\/chat\/compose/, { timeout: 60_000 }),
  ]);
  await page.locator("textarea").first().waitFor({ state: "visible", timeout: 60_000 }).catch(() => undefined);
  const wallMs = Date.now() - clickAt;
  await page.waitForTimeout(1000);
  const snap = await readSnap(page);
  return {
    cycle: cycleIndex + 1,
    post_url: page.url(),
    room_url_reached: /\/community-messenger\/rooms\//.test(page.url()),
    compose_url: /\/mypage\/trade\/chat\/compose/.test(page.url()),
    trade_chat_open_total_ms: pickMs(snap, "trade_chat_open_total_ms"),
    trade_chat_bootstrap_ms: pickMs(snap, "trade_chat_bootstrap_ms"),
    chat_click_to_room_ready_ms: pickMs(snap, "chat_click_to_room_ready_ms"),
    click_to_textarea_wall_ms: wallMs,
  };
}

async function main() {
  const auth = await signInSession();
  console.log(`auth: ${auth.email}`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addCookies(auth.cookies);
  await context.addInitScript((kinds) => {
    try {
      sessionStorage.setItem("samarket:debug:runtime", "1");
      localStorage.setItem("samarket.app.language", "ko");
      for (const k of kinds) localStorage.setItem(`dibay.permission.${k}.guideSeen`, "1");
    } catch {
      /* ignore */
    }
  }, PERMISSION_GUIDE_PRESEED_KINDS);
  const page = await context.newPage();
  const rows = [];
  const errors = [];
  try {
    for (let c = 0; c < cycles; c += 1) {
      try {
        rows.push(await runCycle(page, c));
      } catch (error) {
        errors.push({ cycle: c + 1, message: String(error).slice(0, 500) });
      }
    }
  } finally {
    await browser.close();
  }
  const warm = rows.slice(1);
  const report = {
    measured_at: new Date().toISOString(),
    base_url: baseUrl,
    cycles,
    warm_discard: "cycle 1",
    trade_chat_open_total_ms_warm: summarize(warm.map((r) => r.trade_chat_open_total_ms).filter((n) => n != null)),
    click_to_textarea_wall_ms_warm: summarize(warm.map((r) => r.click_to_textarea_wall_ms).filter((n) => n != null)),
    cycles_detail: rows,
    errors,
    reference: { prior_baseline_ms: 9380, doc: "docs/trade-c2c-perf-baseline.md" },
  };
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log("TRADE_CHAT_OPEN_JSON:", JSON.stringify(report));
  process.exit(errors.length && !rows.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

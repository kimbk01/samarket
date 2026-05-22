#!/usr/bin/env node
/**
 * Owner dashboard waterfall — Playwright 1 cold + 2 warm on /stores/owner.
 * Requires `npm run dev:measure` and browser console `[owner-dashboard-waterfall]`.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseUrl = process.env.SAMARKET_BASE_URL || "http://127.0.0.1:3000";
const PASSWORD = process.env.SAMARKET_TEST_PASSWORD || process.env.E2E_TEST_PASSWORD || "1234";
const LOGIN_IDS = [process.env.E2E_TEST_USERNAME, "aaaa", "qqqq"].filter(Boolean);

function loadEnvLocal() {
  const p = path.join(root, ".env.local");
  if (!fs.existsSync(p)) return;
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
loadEnvLocal();

async function loginCookie() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Missing Supabase env");
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  const ref = url.match(/https:\/\/([^.]+)\./)?.[1] ?? "";
  const cookieName = `sb-${ref}-auth-token`;
  for (const loginId of LOGIN_IDS) {
    const email = loginId.includes("@") ? loginId.toLowerCase() : `${loginId.toLowerCase()}@manual.local`;
    const { data, error } = await sb.auth.signInWithPassword({ email, password: PASSWORD });
    if (error || !data.session) continue;
    return {
      name: cookieName,
      value: JSON.stringify({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
        expires_in: data.session.expires_in,
        token_type: data.session.token_type,
        user: data.session.user,
      }),
      domain: "127.0.0.1",
      path: "/",
    };
  }
  throw new Error("login failed");
}

function parseWaterfallLogs(lines) {
  const rows = [];
  for (const line of lines) {
    const i = line.indexOf("[owner-dashboard-waterfall]");
    if (i < 0) continue;
    const raw = line.slice(i + "[owner-dashboard-waterfall]".length).trim();
    try {
      rows.push(JSON.parse(raw));
    } catch {
      /* */
    }
  }
  return rows;
}

function pickVisit(rows, visitIndex) {
  const mounts = rows.filter((r) => r.event === "page_mount");
  if (!mounts.length) return rows;
  if (visitIndex >= mounts.length) return rows.slice(-40);
  const startIdx = rows.indexOf(mounts[visitIndex]);
  const endIdx =
    visitIndex + 1 < mounts.length ? rows.indexOf(mounts[visitIndex + 1]) : rows.length;
  return rows.slice(startIdx, endIdx);
}

function summarizeVisit(rows) {
  const shell = rows.find((r) => r.event === "first_shell_paint");
  const apis = rows.filter((r) => r.event === "api_done");
  const blocking = apis.filter((r) => r.first_paint_blocking);
  return {
    first_shell_paint_ms: shell?.first_shell_paint_ms ?? shell?.api_done_ms ?? null,
    critical_done_ms: rows.find((r) => r.critical_done_ms != null)?.critical_done_ms ?? null,
    deferred_start_ms: rows.find((r) => r.deferred_start_ms != null)?.deferred_start_ms ?? null,
    background_start_ms: rows.find((r) => r.background_start_ms != null)?.background_start_ms ?? null,
    apis_done: apis.map((a) => ({
      api: a.api_name,
      ms: a.api_duration_ms,
      priority: a.priority,
      blocking: a.first_paint_blocking,
      cold_or_warm: a.cold_or_warm,
    })),
    first_paint_blocking_apis: blocking.map((b) => b.api_name),
  };
}

async function runVisit(page, cookie, label) {
  const logs = [];
  page.on("console", (msg) => {
    const t = msg.text();
    if (t.includes("[owner-dashboard-waterfall]")) logs.push(t);
  });
  const t0 = Date.now();
  await page.goto(`${baseUrl}/stores/owner?_wf=${Date.now()}`, {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  });
  await page.waitForTimeout(2_500);
  const interactiveMs = Date.now() - t0;
  const parsed = parseWaterfallLogs(logs);
  return { label, interactiveMs, parsed, summary: summarizeVisit(parsed) };
}

async function main() {
  const cookie = await loginCookie();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addCookies([cookie]);
  const page = await context.newPage();

  console.log("\n=== owner dashboard waterfall ===\n");

  const cold = await runVisit(page, cookie, "cold");
  await page.waitForTimeout(800);
  const warm1 = await runVisit(page, cookie, "warm1");
  await page.waitForTimeout(500);
  const warm2 = await runVisit(page, cookie, "warm2");

  await browser.close();

  for (const run of [cold, warm1, warm2]) {
    console.log(`\n--- ${run.label} (client interactive ~${run.interactiveMs}ms) ---`);
    console.log(JSON.stringify(run.summary, null, 2));
  }

  const shellOk =
    cold.summary.first_shell_paint_ms != null &&
    (cold.summary.first_paint_blocking_apis?.length ?? 0) === 0;
  const criticalOk =
    cold.summary.critical_done_ms == null || cold.summary.critical_done_ms <= 500;
  console.log("\n=== Gate ===\n");
  console.log(`first_shell_paint without blocking APIs: ${shellOk ? "PASS" : "FAIL"}`);
  console.log(`critical_done_ms <= 500: ${criticalOk ? "PASS" : "WARN"} (seeded RSC may skip network)`);
  if (cold.summary.apis_done.some((a) => a.api === "orders_list" && a.blocking)) {
    console.log("FAIL: orders_list still first_paint_blocking");
  }
  if (cold.summary.apis_done.some((a) => a.api === "settlements" && a.blocking)) {
    console.log("FAIL: settlements still first_paint_blocking");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

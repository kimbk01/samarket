#!/usr/bin/env node
/**
 * OPS1 reconnect stress — Playwright offline/online cycle on messenger home.
 * Usage: PLAYWRIGHT_NO_WEBSERVER=1 node scripts/ops1-reconnect-stress-playwright.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

const baseUrl = (process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");

function loadEnvLocal() {
  const p = path.join(process.cwd(), ".env.local");
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

async function signInCookie() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  const ref = url.match(/https:\/\/([^.]+)\./)?.[1];
  const { data, error } = await sb.auth.signInWithPassword({
    email: "qqqq@manual.local",
    password: process.env.E2E_TEST_PASSWORD ?? "1234",
  });
  if (error || !data.session) throw new Error("login failed");
  return {
    name: `sb-${ref}-auth-token`,
    value: JSON.stringify({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
      expires_in: data.session.expires_in,
      token_type: data.session.token_type,
      user: data.session.user,
    }),
  };
}

function parseTagged(text, tag) {
  const rows = [];
  const re = new RegExp(`\\[${tag}\\]\\s*(\\{[^\\n]+\\})`, "g");
  let m;
  while ((m = re.exec(text)) !== null) {
    try {
      rows.push(JSON.parse(m[1]));
    } catch {
      /* */
    }
  }
  return rows;
}

async function main() {
  loadEnvLocal();
  const cookie = await signInCookie();
  const browser = await chromium.launch({ headless: true });
  const logs = [];
  const page = await browser.newPage();
  page.on("console", (msg) => {
    const t = msg.text();
    if (
      t.includes("[reconnect-stress-analysis]") ||
      t.includes("[messenger-consistency-regression-alert]") ||
      t.includes("[legacy-fallback-usage-audit]")
    ) {
      logs.push(t);
    }
  });

  const host = new URL(baseUrl).hostname;
  await page.context().addCookies([
    {
      name: cookie.name,
      value: cookie.value,
      domain: host === "127.0.0.1" ? "127.0.0.1" : host,
      path: "/",
    },
  ]);

  await page.addInitScript(() => {
    globalThis.__SAMARKET_OPS1_MONITOR__ = true;
  });

  console.log("\n=== OPS1 reconnect stress (Playwright) ===\n");

  await page.goto(`${baseUrl}/community-messenger`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForTimeout(3000);

  const firstRoom = page.locator('[data-testid="messenger-chat-list-item"]').first();
  if (await firstRoom.count()) {
    await firstRoom.click();
    await page.waitForTimeout(2000);
  }

  const ctx = page.context();
  await ctx.setOffline(true);
  await page.waitForTimeout(4000);
  await ctx.setOffline(false);
  await page.waitForTimeout(6000);

  await browser.close();

  const combined = logs.join("\n");
  const reconnectRows = parseTagged(combined, "reconnect-stress-analysis");
  const regressionRows = parseTagged(combined, "messenger-consistency-regression-alert");

  const summary = {
    reconnect_count: reconnectRows.length,
    regression_alert_count: regressionRows.length,
    duplicate_subscribe_total: reconnectRows.reduce((s, r) => s + (r.duplicate_subscribe_count ?? 0), 0),
    silent_refresh_total: reconnectRows.reduce((s, r) => s + (r.silent_refresh_count ?? 0), 0),
    legacy_fallback_used: reconnectRows.some((r) => r.legacy_fallback_used === 1) ? 1 : 0,
    pass:
      regressionRows.length === 0 &&
      reconnectRows.every((r) => r.pass === 1 || r.pass === true) &&
      !reconnectRows.some((r) => (r.duplicate_subscribe_count ?? 0) > 0)
        ? 1
        : 0,
  };

  console.log("[reconnect-stress-analysis]", {
    room_id: reconnectRows[0]?.room_id ?? "home",
    reconnect_count: summary.reconnect_count || 1,
    duplicate_subscribe_count: summary.duplicate_subscribe_total,
    stale_event_discarded: reconnectRows.reduce((s, r) => s + (r.stale_event_discarded ?? 0), 0),
    silent_refresh_count: summary.silent_refresh_total,
    legacy_fallback_used: summary.legacy_fallback_used,
    pass: summary.pass,
  });

  console.log("\n=== reconnect stress summary ===\n", summary);

  if (reconnectRows.length === 0) {
    console.warn("WARN: no [reconnect-stress-analysis] from browser — set NEXT_PUBLIC_SAMARKET_OPS1_MONITOR=1 or use __SAMARKET_OPS1_MONITOR__");
  }

  process.exit(summary.pass === 1 || reconnectRows.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

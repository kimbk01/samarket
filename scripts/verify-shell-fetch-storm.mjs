#!/usr/bin/env node
/**
 * Global shell fetch storm — prod AFTER count (/stores cold scenario).
 * Prereq: npm run build && npm run start
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = (process.env.BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");

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
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnvLocal();

async function signInSupabaseCookie() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) return null;
  const password = process.env.E2E_TEST_PASSWORD ?? "1234";
  const loginIds = [process.env.E2E_TEST_USERNAME, "aa11", "aaaa", "qqqq"].filter(Boolean);
  const ref = url.match(/https:\/\/([^.]+)\./)?.[1];
  if (!ref) return null;
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
    return {
      cookies: [
        {
          name: `sb-${ref}-auth-token`,
          value: encodeURIComponent(JSON.stringify(session)),
          domain: "127.0.0.1",
          path: "/",
          httpOnly: false,
          secure: false,
          sameSite: "Lax",
        },
      ],
    };
  }
  return null;
}

function countPath(requests, sub) {
  return requests.filter((r) => r.url.includes(sub) && r.method === "GET").length;
}

async function main() {
  const { chromium } = await import("@playwright/test");
  const auth = await signInSupabaseCookie();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  if (auth?.cookies) await context.addCookies(auth.cookies);
  const page = await context.newPage();

  const client = await context.newCDPSession(page);
  await client.send("Network.enable");
  const reqMethods = new Map();
  const requests = [];
  client.on("Network.requestWillBeSent", (p) => reqMethods.set(p.requestId, p.request.method));
  client.on("Network.responseReceived", (p) => {
    requests.push({
      url: p.response.url,
      method: reqMethods.get(p.requestId) || "GET",
    });
  });

  await page.goto(`${BASE}/stores`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page
    .waitForResponse((r) => r.url().includes("/api/stores/home-feed"), { timeout: 90_000 })
    .catch(() => null);
  await page.waitForTimeout(5000);

  const baselineHub = countPath(requests, "/api/me/store-owner-hub-badge");

  const browseLink = page.locator('a[href*="/stores/browse"]').first();
  if (await browseLink.count()) {
    await browseLink.click({ timeout: 15_000 }).catch(() => null);
    await page.waitForTimeout(2500);
    await page.goBack({ timeout: 15_000 }).catch(() => null);
    await page.waitForTimeout(1500);
  }

  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(3000);

  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: false }));
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(2000);

  const profile = countPath(requests, "/api/me/profile");
  const gate = countPath(requests, "/api/me/mandatory-address-gate");
  const hub = countPath(requests, "/api/me/store-owner-hub-badge");
  const hubAfterBrowse = Math.max(0, hub - baselineHub);

  await browser.close();

  const report = {
    measured_at: new Date().toISOString(),
    scenario: "/stores cold + browse/back + pageshow/focus/visibility",
    profile_fetch: profile,
    gate_fetch: gate,
    hub_badge_fetch: hub,
    hub_badge_fetch_after_browse_interaction: hubAfterBrowse,
    pass:
      profile <= 2 &&
      gate <= 1 &&
      hub <= 2 &&
      hubAfterBrowse <= 2,
  };
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

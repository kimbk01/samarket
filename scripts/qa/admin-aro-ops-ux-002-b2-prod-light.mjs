#!/usr/bin/env node
/**
 * ARO-OPS-UX-002-B2 — Production light (read-only).
 * Proves 4 domain dashboards render with action-required + current-state @ 1024×768.
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "https://samarket.vercel.app").replace(/\/$/, "");
const OUT = resolve(process.cwd(), "docs/perf/admin-aro-ops-ux-002-b2");
const EMAIL = process.env.E2E_ADMIN_EMAIL || process.env.QA_ADMIN_EMAIL || "aaaa@manual.local";
const EXPECT_SHA = (process.env.ARO_OPS_UX_B2_EXPECT_SHA || "").slice(0, 9);

function loadEnv() {
  for (const rel of [".env.local", ".env"]) {
    const p = resolve(process.cwd(), rel);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#") || !t.includes("=")) continue;
      const i = t.indexOf("=");
      const k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

async function loginSession(email) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon) return null;
  const sb = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const passwords = [
    ...new Set(
      [process.env.E2E_TEST_PASSWORD, process.env.QA_MANUAL_PASSWORD, process.env.E2E_ADMIN_PASSWORD, "DibayQa1!", "1234"].filter(
        Boolean
      )
    ),
  ];
  for (const password of passwords) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (!error && data?.session) return { session: data.session, method: "password" };
  }
  if (!sk) return null;
  const admin = createClient(url, sk, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  let tokenHash = "";
  try {
    const u = new URL(String(link?.properties?.action_link || ""));
    tokenHash = u.searchParams.get("token") || u.searchParams.get("token_hash") || "";
  } catch {
    tokenHash = "";
  }
  if (linkErr || !tokenHash) return null;
  const { data: verified, error: otpErr } = await sb.auth.verifyOtp({ token_hash: tokenHash, type: "email" });
  if (otpErr || !verified?.session) return null;
  return { session: verified.session, method: "magiclink" };
}

async function resolveActiveSessionId(userId) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !sk || !userId) return null;
  const admin = createClient(url, sk, { auth: { persistSession: false } });
  const { data } = await admin.from("profiles").select("active_session_id").eq("id", userId).maybeSingle();
  return String(data?.active_session_id ?? "").trim() || null;
}

function authCookies(session, activeSessionId = null) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const ref = new URL(url).hostname.split(".")[0];
  const origin = new URL(ORIGIN);
  const encoded = encodeURIComponent(
    JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      expires_in: session.expires_in,
      token_type: session.token_type || "bearer",
      user: session.user,
    })
  );
  const base = {
    domain: origin.hostname,
    path: "/",
    expires: session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
    httpOnly: false,
    secure: origin.protocol === "https:",
    sameSite: "Lax",
  };
  const cookies = [{ ...base, name: `sb-${ref}-auth-token`, value: encoded }, { ...base, name: "samarket_signup_locale", value: "ko" }];
  if (activeSessionId) {
    cookies.push({
      ...base,
      name: "samarket_active_session_id",
      value: encodeURIComponent(String(activeSessionId)),
    });
  }
  return cookies;
}

async function probeDashboard(page, path, domain, shotName) {
  const checks = {};
  await page.goto(`${ORIGIN}${path}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector(`[data-admin-domain-dashboard="${domain}"]`, { timeout: 90000 });
  await page.waitForTimeout(800);
  checks.marker = (await page.locator(`[data-aro-ops-ux-002-b2="1"]`).count()) > 0;
  checks.actionSection = (await page.locator('[data-admin-domain-section="action-required"]').count()) > 0;
  checks.stateSection = (await page.locator('[data-admin-domain-section="current-state"]').count()) > 0;
  checks.entries = (await page.locator("[data-admin-domain-entry]").count()) > 0;
  const overflow = await page.evaluate(() => {
    const el = document.documentElement;
    return el.scrollWidth > el.clientWidth + 2;
  });
  checks.noBodyXOverflow = !overflow;
  await page.screenshot({ path: resolve(OUT, shotName), fullPage: true });
  return checks;
}

async function main() {
  loadEnv();
  mkdirSync(OUT, { recursive: true });
  let headSha = "";
  try {
    headSha = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    headSha = EXPECT_SHA;
  }

  const auth = await loginSession(EMAIL);
  if (!auth?.session) {
    writeFileSync(
      resolve(OUT, "aro-ops-ux-002-b2-prod-light.json"),
      JSON.stringify({ sha: headSha, result: "FAIL", error: "auth_failed" }, null, 2)
    );
    process.exit(1);
  }

  const activeSessionId = await resolveActiveSessionId(auth.session.user?.id);
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
  });
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  await context.addCookies(authCookies(auth.session, activeSessionId));
  const page = await context.newPage();

  const domains = {
    delivery: await probeDashboard(page, "/admin/delivery", "delivery", "prod-delivery-b2.png"),
    trade: await probeDashboard(page, "/admin/trade", "trade", "prod-trade-b2.png"),
    community: await probeDashboard(page, "/admin/community", "community", "prod-community-b2.png"),
    messenger: await probeDashboard(page, "/admin/messenger", "messenger", "prod-messenger-b2.png"),
  };

  const failed = [];
  for (const [domain, checks] of Object.entries(domains)) {
    for (const [k, v] of Object.entries(checks)) if (!v) failed.push(`${domain}.${k}`);
  }

  const report = {
    cut: "ARO-OPS-UX-002-B2",
    sha: headSha.slice(0, 9),
    expectSha: EXPECT_SHA || null,
    origin: ORIGIN,
    authMethod: auth.method,
    viewport: "1024x768",
    domains,
    failed,
    result: failed.length === 0 ? "PASS" : "PARTIAL",
    destructiveProductionTest: "NONE",
    at: new Date().toISOString(),
  };
  writeFileSync(resolve(OUT, "aro-ops-ux-002-b2-prod-light.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  process.exit(failed.length === 0 ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

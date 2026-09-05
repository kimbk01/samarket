#!/usr/bin/env node
/**
 * ARO-OPS-UX-002-B3 — Production light (read-only).
 * Opens Store Financial Statement for a real store @ 1024×768.
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "https://samarket.vercel.app").replace(/\/$/, "");
const OUT = resolve(process.cwd(), "docs/perf/admin-aro-ops-ux-002-b3");
const EMAIL = process.env.E2E_ADMIN_EMAIL || process.env.QA_ADMIN_EMAIL || "aaaa@manual.local";
const EXPECT_SHA = (process.env.ARO_OPS_UX_B3_EXPECT_SHA || "").slice(0, 9);
const FORCE_STORE = (process.env.ARO_OPS_UX_B3_STORE_ID || "").trim();

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
  const cookies = [
    { ...base, name: `sb-${ref}-auth-token`, value: encoded },
    { ...base, name: "samarket_signup_locale", value: "ko" },
  ];
  if (activeSessionId) {
    cookies.push({
      ...base,
      name: "samarket_active_session_id",
      value: encodeURIComponent(String(activeSessionId)),
    });
  }
  return cookies;
}

async function pickStoreId() {
  if (FORCE_STORE) return { storeId: FORCE_STORE, how: "env" };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !sk) return { storeId: null, how: "missing_service_role" };
  const admin = createClient(url, sk, { auth: { persistSession: false } });
  const { data: stl } = await admin
    .from("store_settlements")
    .select("store_id")
    .order("created_at", { ascending: false })
    .limit(1);
  const fromStl = String(stl?.[0]?.store_id ?? "").trim();
  if (fromStl) return { storeId: fromStl, how: "store_settlements" };
  const { data: stores } = await admin.from("stores").select("id").eq("approval_status", "approved").limit(1);
  const fromStore = String(stores?.[0]?.id ?? "").trim();
  return { storeId: fromStore || null, how: fromStore ? "stores.approved" : "none" };
}

async function main() {
  loadEnv();
  mkdirSync(OUT, { recursive: true });
  const login = await loginSession(EMAIL);
  if (!login?.session) {
    writeFileSync(resolve(OUT, "prod-light-report.json"), JSON.stringify({ ok: false, error: "login_failed" }, null, 2));
    process.exit(1);
  }
  const pick = await pickStoreId();
  if (!pick.storeId) {
    writeFileSync(
      resolve(OUT, "prod-light-report.json"),
      JSON.stringify({ ok: false, error: "no_store", pick }, null, 2)
    );
    process.exit(1);
  }

  const activeSessionId = await resolveActiveSessionId(login.session.user.id);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
  await page.context().addCookies(authCookies(login.session, activeSessionId));

  const path = `/admin/finance?storeId=${encodeURIComponent(pick.storeId)}&view=statement`;
  await page.goto(`${ORIGIN}${path}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector('[data-admin-store-financial-statement="1"]', { timeout: 120000 });
  await page.waitForTimeout(1200);

  const checks = {
    marker: (await page.locator('[data-aro-ops-ux-002-b3="1"]').count()) > 0,
    summary: (await page.locator('[data-admin-store-statement-section="summary"]').count()) > 0,
    flow: (await page.locator('[data-admin-store-statement-section="flow"]').count()) > 0,
    fees: (await page.locator('[data-admin-store-statement-section="fees"]').count()) > 0,
    obligations: (await page.locator('[data-admin-store-statement-section="obligations"]').count()) > 0,
    coin: (await page.locator('[data-admin-store-statement-section="coin"]').count()) > 0,
    cash: (await page.locator('[data-admin-store-statement-section="cash"]').count()) > 0,
    settlements: (await page.locator('[data-admin-store-statement-section="settlements"]').count()) > 0,
    timeline: (await page.locator('[data-admin-store-statement-section="timeline"]').count()) > 0,
    bodyX: await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2),
  };

  await page.screenshot({ path: resolve(OUT, "statement-1024x768.png"), fullPage: true });

  // Delivery entry exists
  await page.goto(`${ORIGIN}/admin/delivery`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(800);
  checks.deliveryEntry =
    (await page.locator('[data-admin-domain-entry="store_financial_statement"]').count()) > 0;

  const shaProbe = await page.evaluate(async () => {
    try {
      const r = await fetch("/api/admin/health", { credentials: "include" });
      return { status: r.status };
    } catch (e) {
      return { error: String(e) };
    }
  }).catch(() => null);

  const ok = Object.values(checks).every(Boolean);
  const report = {
    ok,
    origin: ORIGIN,
    expectSha: EXPECT_SHA || null,
    storeId: pick.storeId,
    pickHow: pick.how,
    path,
    checks,
    shaProbe,
    loginMethod: login.method,
    at: new Date().toISOString(),
  };
  writeFileSync(resolve(OUT, "prod-light-report.json"), JSON.stringify(report, null, 2));
  await browser.close();
  console.log(JSON.stringify(report, null, 2));
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

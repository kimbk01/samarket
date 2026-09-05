#!/usr/bin/env node
/**
 * ARO-OPS-UX-002-B5 — Production light (read-only).
 * Proves Ads/Exposure Control Plane @ 1024×768. No pause/end/reject mutations.
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "https://samarket.vercel.app").replace(/\/$/, "");
const OUT = resolve(process.cwd(), "docs/perf/admin-aro-ops-ux-002-b5");
const EMAIL = process.env.E2E_ADMIN_EMAIL || process.env.QA_ADMIN_EMAIL || "aaaa@manual.local";
const EXPECT_SHA = (process.env.ARO_OPS_UX_B5_EXPECT_SHA || "51389b430").slice(0, 9);

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

async function main() {
  loadEnv();
  mkdirSync(OUT, { recursive: true });
  const login = await loginSession(EMAIL);
  if (!login?.session) {
    writeFileSync(resolve(OUT, "prod-light-report.json"), JSON.stringify({ ok: false, error: "login_failed" }, null, 2));
    process.exit(1);
  }
  const activeSessionId = await resolveActiveSessionId(login.session.user.id);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
  await page.context().addCookies(authCookies(login.session, activeSessionId));

  await page.goto(`${ORIGIN}/admin/delivery-ads#action-required`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await page.waitForSelector('[data-admin-ads-control-plane="1"]', { timeout: 120000 });
  await page.waitForTimeout(1500);

  const checks = {
    marker: (await page.locator('[data-aro-ops-ux-002-b5="1"]').count()) > 0,
    actionRequired: (await page.locator("#action-required").count()) > 0,
    execution: (await page.locator("#execution").count()) > 0,
    creatives: (await page.locator("#creatives").count()) > 0,
    placement: (await page.locator("#placement-map").count()) > 0,
    billing: (await page.locator("#billing").count()) > 0,
    entries: (await page.locator("#entries").count()) > 0,
    workQueues: (await page.locator("#work-queues").count()) > 0,
    bodyX: await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2
    ),
    placementNeBanner: (await page.getByText("Placement ≠ Banner").count()) > 0 ||
      (await page.getByText("Placement map (≠ Banner)").count()) > 0,
    feedPointNote:
      (await page.locator('[data-admin-ads-billing="feed"]').count()) > 0 &&
      ((await page.locator('[data-admin-ads-billing="feed"]').innerText()).includes("Point") ||
        (await page.locator('[data-admin-ads-billing="feed"]').innerText()).includes("POINT")),
    deliveryCashNote: (await page.locator('[data-admin-ads-billing="delivery"]').count()) > 0,
  };

  await page.screenshot({ path: resolve(OUT, "ads-1024x768.png"), fullPage: true });

  // Finance B4 ↔ B5 deeplink
  await page.goto(`${ORIGIN}/admin/finance`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector('[data-admin-finance-control-plane="1"]', { timeout: 120000 }).catch(() => null);
  await page.waitForTimeout(2000);
  const financeHtml = await page.content();
  checks.financeAdsEntry =
    (await page.locator('[data-admin-finance-entry="ads_control_plane"]').count()) > 0 ||
    (await page.locator('a[href*="delivery-ads"]').filter({ hasText: /광고|Ads|Exposure|관제/i }).count()) > 0 ||
    financeHtml.includes("ads_control_plane") ||
    financeHtml.includes("/admin/delivery-ads#action-required");

  const required = [
    "marker",
    "actionRequired",
    "execution",
    "creatives",
    "placement",
    "billing",
    "entries",
    "workQueues",
    "bodyX",
    "placementNeBanner",
    "feedPointNote",
    "deliveryCashNote",
    "financeAdsEntry",
  ];
  const ok = required.every((k) => checks[k] === true);

  const report = {
    ok,
    origin: ORIGIN,
    expectSha: EXPECT_SHA || null,
    path: "/admin/delivery-ads#action-required",
    checks,
    loginMethod: login.method,
    at: new Date().toISOString(),
  };
  writeFileSync(resolve(OUT, "prod-light-report.json"), JSON.stringify(report, null, 2));
  await browser.close();
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

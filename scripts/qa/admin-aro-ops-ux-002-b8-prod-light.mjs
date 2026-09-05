#!/usr/bin/env node
/**
 * ARO-OPS-UX-002-B8 — Production light (read-only geometry / CTA markers).
 * 1024×768 representative surfaces. No destructive mutations.
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "https://samarket.vercel.app").replace(/\/$/, "");
const OUT = resolve(process.cwd(), "docs/perf/admin-aro-ops-ux-002-b8");
const EMAIL = process.env.E2E_ADMIN_EMAIL || process.env.QA_ADMIN_EMAIL || "aaaa@manual.local";
const EXPECT_SHA = (process.env.ARO_OPS_UX_B8_EXPECT_SHA || "").slice(0, 9);

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
      expires_in: session.expires_in ?? 3600,
      expires_at: session.expires_at,
      token_type: "bearer",
      user: session.user,
    })
  );
  const cookies = [
    {
      name: `sb-${ref}-auth-token`,
      value: encoded,
      domain: origin.hostname,
      path: "/",
      httpOnly: false,
      secure: true,
      sameSite: "Lax",
    },
  ];
  if (activeSessionId) {
    cookies.push({
      name: "samarket_active_session_id",
      value: encodeURIComponent(String(activeSessionId)),
      domain: origin.hostname,
      path: "/",
      httpOnly: false,
      secure: true,
      sameSite: "Lax",
    });
  }
  return cookies;
}

async function geometry(page) {
  return page.evaluate(() => {
    const header = document.querySelector(".admin-platform-shell__header");
    const chrome = document.querySelector("[data-admin-page-chrome='1']");
    const crumb = document.querySelector("[data-admin-breadcrumb='1']");
    const main = document.querySelector("[data-admin-main-content='1'], .admin-platform-shell__content");
    const hr = header?.getBoundingClientRect();
    const cr = chrome?.getBoundingClientRect();
    const mr = main?.getBoundingClientRect();
    const bodyX =
      (document.documentElement.scrollWidth || 0) > (document.documentElement.clientWidth || 0) + 2;
    const headerOverlap =
      hr && mr ? hr.bottom > mr.top + 1 && hr.top < mr.top : false;
    return {
      bodyX,
      breadcrumb: Boolean(crumb),
      pageChrome: Boolean(chrome),
      headerH: hr ? Math.round(hr.height) : 0,
      mainTop: mr ? Math.round(mr.top) : 0,
      chromeBottom: cr ? Math.round(cr.bottom) : 0,
      headerOverlap,
    };
  });
}

const SURFACES = [
  { id: "DELIVERY", path: "/admin/delivery", shot: "delivery-1024x768.png" },
  { id: "TRADE", path: "/admin/trade", shot: "trade-1024x768.png" },
  { id: "COMMUNITY", path: "/admin/community", shot: "community-1024x768.png" },
  { id: "MESSENGER", path: "/admin/messenger", shot: "messenger-1024x768.png" },
  { id: "FINANCE", path: "/admin/finance", shot: "finance-1024x768.png" },
  { id: "ADS", path: "/admin/delivery-ads", shot: "ads-1024x768.png" },
  { id: "SUPPORT", path: "/admin/support", shot: "support-1024x768.png" },
  { id: "SYSTEM", path: "/admin/customer-platform", shot: "system-1024x768.png" },
  { id: "ORDERS", path: "/admin/stores/orders", shot: "orders-1024x768.png" },
];

async function main() {
  loadEnv();
  mkdirSync(OUT, { recursive: true });
  const login = await loginSession(EMAIL);
  if (!login?.session) {
    writeFileSync(resolve(OUT, "prod-light-report.json"), JSON.stringify({ ok: false, error: "login_failed" }, null, 2));
    process.exit(1);
  }
  const activeSessionId = await resolveActiveSessionId(login.session.user?.id);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  await context.addCookies(authCookies(login.session, activeSessionId));
  const page = await context.newPage();

  const results = [];
  for (const s of SURFACES) {
    await page.goto(`${ORIGIN}${s.path}`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForTimeout(1400);
    const g = await geometry(page);
    const title = await page.locator("h1").first().innerText().catch(() => "");
    await page.screenshot({ path: resolve(OUT, s.shot), fullPage: true });
    results.push({
      id: s.id,
      path: s.path,
      ok: !g.bodyX && !g.headerOverlap && g.breadcrumb && Boolean(title),
      title: title.slice(0, 80),
      ...g,
    });
  }

  // secondary widths smoke on finance
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${ORIGIN}/admin/finance`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(800);
  const desktop = await geometry(page);
  await page.setViewportSize({ width: 900, height: 700 });
  await page.goto(`${ORIGIN}/admin/finance`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(800);
  const narrow = await geometry(page);

  const shaOk = !EXPECT_SHA || process.env.ARO_OPS_UX_B8_DEPLOY_READY === "1";
  const surfacesOk = results.every((r) => r.ok);
  const report = {
    ok: surfacesOk && !desktop.bodyX && !narrow.bodyX && shaOk,
    cut: "ARO-OPS-UX-002-B8",
    origin: ORIGIN,
    expectSha: EXPECT_SHA || null,
    shaOk,
    surfaces: results,
    desktop,
    narrow,
    loginMethod: login.method,
    at: new Date().toISOString(),
  };
  writeFileSync(resolve(OUT, "prod-light-report.json"), JSON.stringify(report, null, 2));
  await browser.close();
  console.log(JSON.stringify({ ok: report.ok, surfacesOk, shaOk, fail: results.filter((r) => !r.ok).map((r) => r.id) }, null, 2));
  process.exit(report.ok ? 0 : 2);
}

main().catch((err) => {
  console.error(err);
  writeFileSync(resolve(OUT, "prod-light-report.json"), JSON.stringify({ ok: false, error: String(err) }, null, 2));
  process.exit(1);
});

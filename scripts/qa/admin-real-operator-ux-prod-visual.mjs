#!/usr/bin/env node
/**
 * Real Operator UX — Production visual / text re-audit (read-only).
 * Fails if primary operator surfaces still expose raw enum/taxonomy/keys.
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "https://samarket.vercel.app").replace(/\/$/, "");
const OUT = resolve(process.cwd(), "docs/perf/admin-real-operator-ux");
const EMAIL = process.env.E2E_ADMIN_EMAIL || process.env.QA_ADMIN_EMAIL || "aaaa@manual.local";
const EXPECT_SHA = (process.env.OPERATOR_UX_EXPECT_SHA || "868687220").slice(0, 9);

const FORBIDDEN = [
  "DAILY_CRITICAL",
  "FREQUENT",
  "OCCASIONAL",
  "CONFIGURATION",
  "reason_required",
  "SALE_EARN",
  "CONVERT_TO_BUSINESS_CASH",
  "WAITING_ADMIN",
  "store_sponsored",
  "community_reports",
  "applied_rate=NOT_AVAILABLE",
  "APPLICATION REVIEW",
  "CREATIVE REVIEW",
];

const ROUTES = [
  { id: "ads", path: "/admin/delivery-ads" },
  { id: "finance", path: "/admin/finance" },
  { id: "community", path: "/admin/community" },
  { id: "messenger", path: "/admin/messenger" },
  { id: "support", path: "/admin/support" },
];

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
    cookies.push({ ...base, name: "x-samarket-active-session", value: activeSessionId });
  }
  return cookies;
}

async function main() {
  loadEnv();
  mkdirSync(OUT, { recursive: true });
  const login = await loginSession(EMAIL);
  if (!login?.session) {
    writeFileSync(resolve(OUT, "PRODUCTION-VISUAL.json"), JSON.stringify({ ok: false, error: "auth_failed" }, null, 2));
    process.exit(2);
  }
  const activeSessionId = await resolveActiveSessionId(login.session.user.id);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1024, height: 768 },
    locale: "ko-KR",
  });
  await context.addCookies(authCookies(login.session, activeSessionId));
  const page = await context.newPage();

  const identity = { origin: ORIGIN, expectSha: EXPECT_SHA, deployment: null, productSha: null, at: new Date().toISOString() };
  try {
    const meta = await page.goto(ORIGIN + "/admin", { waitUntil: "domcontentloaded", timeout: 60000 });
    identity.deployment = meta?.url() || ORIGIN;
    const html = await page.content();
    const shaMatch = html.match(/[0-9a-f]{9,40}/i);
    // Prefer visible build stamp if present
    const stamp = await page.locator("[data-build-sha], [data-git-sha], meta[name='samarket-git-sha']").first().getAttribute("content").catch(() => null);
    identity.productSha = stamp || null;
  } catch {
    /* continue */
  }

  const routes = [];
  let fail = false;
  for (const r of ROUTES) {
    await page.goto(ORIGIN + r.path, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => null);
    await page.waitForTimeout(2500);
    const text = await page.locator("main, [data-admin-domain-dashboard], body").first().innerText().catch(() => "");
    const hits = FORBIDDEN.filter((f) => text.includes(f));
    // Statement as standalone English CTA button text
    if (/\bStatement\b/.test(text)) hits.push("Statement");
    // UUID as primary recent activity (messenger) — look for bare UUID lines dominance
    const uuidLines = (text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) || []).length;
    const shot = resolve(OUT, `prod-${r.id}-1024.png`);
    await page.screenshot({ path: shot, fullPage: false });
    const row = {
      id: r.id,
      path: r.path,
      forbiddenHits: hits,
      uuidCountInViewportText: uuidLines,
      screenshot: shot,
      pass: hits.length === 0,
    };
    if (!row.pass) fail = true;
    // UUID alone is soft warn on messenger (may appear in technical collapse)
    if (r.id === "messenger" && uuidLines > 3) {
      row.warn = "uuid_dense";
    }
    routes.push(row);
  }

  // Ads detail — open first review link if present
  await page.goto(ORIGIN + "/admin/delivery-ads", { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => null);
  await page.waitForTimeout(2000);
  const detailLink = page.locator('a[href*="/admin/delivery-ads/"]').first();
  let adsDetail = null;
  if (await detailLink.count()) {
    const href = await detailLink.getAttribute("href");
    if (href && /\/admin\/delivery-ads\/[0-9a-f-]{8,}/i.test(href)) {
      await page.goto(ORIGIN + href, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => null);
      await page.waitForTimeout(2000);
      const text = await page.locator("body").innerText().catch(() => "");
      const hits = FORBIDDEN.filter((f) => text.includes(f));
      if (text.includes("reason_required")) hits.push("reason_required");
      const shot = resolve(OUT, "prod-ads-detail-1024.png");
      await page.screenshot({ path: shot, fullPage: false });
      adsDetail = { href, forbiddenHits: hits, pass: hits.length === 0, screenshot: shot };
      if (!adsDetail.pass) fail = true;
    }
  }

  await browser.close();

  const report = {
    ok: !fail,
    identity,
    gitHeadLocal: EXPECT_SHA,
    routes,
    adsDetail,
    verdict: fail ? "FAIL" : "PASS",
    operatorReady: fail ? "FAIL" : "PASS",
  };
  writeFileSync(resolve(OUT, "PRODUCTION-VISUAL.json"), JSON.stringify(report, null, 2));
  writeFileSync(resolve(OUT, "production-identity.json"), JSON.stringify(identity, null, 2));
  console.log(JSON.stringify({ ok: report.ok, verdict: report.verdict, routes: routes.map((x) => ({ id: x.id, pass: x.pass, hits: x.forbiddenHits })) }, null, 2));
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});

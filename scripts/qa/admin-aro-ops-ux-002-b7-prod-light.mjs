#!/usr/bin/env node
/**
 * ARO-OPS-UX-002-B7 — Production light (read-only).
 * Proves Menu / Frequency Final IA @ 1024×768. No mutations.
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "https://samarket.vercel.app").replace(/\/$/, "");
const OUT = resolve(process.cwd(), "docs/perf/admin-aro-ops-ux-002-b7");
const EMAIL = process.env.E2E_ADMIN_EMAIL || process.env.QA_ADMIN_EMAIL || "aaaa@manual.local";
const EXPECT_SHA = (process.env.ARO_OPS_UX_B7_EXPECT_SHA || "").slice(0, 9);

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
    { name: `sb-${ref}-auth-token`, value: encoded, domain: origin.hostname, path: "/", httpOnly: false, secure: true, sameSite: "Lax" },
  ];
  if (activeSessionId) {
    cookies.push({
      name: "x-samarket-active-session",
      value: activeSessionId,
      domain: origin.hostname,
      path: "/",
      httpOnly: false,
      secure: true,
      sameSite: "Lax",
    });
  }
  return cookies;
}

async function measureOverflow(page) {
  return page.evaluate(() => {
    const body = document.body;
    const html = document.documentElement;
    return {
      bodyScrollWidth: body?.scrollWidth ?? 0,
      clientWidth: html?.clientWidth ?? 0,
      overflowX: (body?.scrollWidth ?? 0) > (html?.clientWidth ?? 0) + 2,
    };
  });
}

async function workspaceNavProbe(page) {
  return page.evaluate(() => {
    const nav = document.querySelector('[data-admin-workspace-nav], nav[aria-label*="workspace"], .admin-workspace-nav, [data-testid="admin-workspace-nav"]');
    const links = Array.from(document.querySelectorAll('a[href^="/admin"]'))
      .map((a) => ({ href: a.getAttribute("href") || "", text: (a.textContent || "").trim().slice(0, 40) }))
      .filter((x) => x.href);
    const topHints = ["운영", "배달", "거래", "커뮤니티", "채팅", "재무", "광고", "고객지원", "알림", "시스템"];
    const foundTops = topHints.filter((t) => links.some((l) => l.text.includes(t)) || document.body.innerText.includes(t));
    return {
      linkCount: links.length,
      foundTops,
      topCount: foundTops.length,
      sample: links.slice(0, 20),
      navPresent: Boolean(nav) || links.length > 5,
    };
  });
}

const SCENARIOS = [
  { id: "IA1_ORDER", path: "/admin/stores/orders", expectWs: "delivery" },
  { id: "IA2_CASH", path: "/admin/finance", expectWs: "finance" },
  { id: "IA3_ADS", path: "/admin/delivery-ads", expectWs: "ads" },
  { id: "IA4_SUPPORT", path: "/admin/support", expectWs: "support" },
  { id: "IA5_TRADE", path: "/admin/posts-management", expectWs: "trade" },
  { id: "IA6_STATEMENT", path: "/admin/finance?view=statement", expectWs: "finance" },
  { id: "IA7_POPUP", path: "/admin/platform-popup", expectWs: "ads" },
  { id: "IA8_RESET", path: "/admin/prelaunch-reset", expectWs: "system" },
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

  const deployMeta = await page.goto(`${ORIGIN}/api/health`, { waitUntil: "domcontentloaded", timeout: 60000 }).then(async (r) => {
    try {
      return await r.json();
    } catch {
      return null;
    }
  }).catch(() => null);

  const results = [];
  for (const s of SCENARIOS) {
    await page.goto(`${ORIGIN}${s.path}`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForTimeout(1200);
    const url = page.url();
    const overflow = await measureOverflow(page);
    const nav = await workspaceNavProbe(page);
    const breadcrumb = await page.locator(".admin-shell-breadcrumb, nav[aria-label*='breadcrumb'], [data-admin-breadcrumb]").count();
    const bodyText = await page.locator("body").innerText().catch(() => "");
    results.push({
      id: s.id,
      path: s.path,
      finalUrl: url,
      ok: url.includes("/admin") && !url.includes("/login"),
      overflowX: overflow.overflowX,
      breadcrumbVisible: breadcrumb > 0,
      topLevelHints: nav.foundTops,
      topCount: nav.topCount,
      expectWs: s.expectWs,
      hasContent: bodyText.length > 80,
    });
  }

  await page.goto(`${ORIGIN}/admin`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(1000);
  const homeNav = await workspaceNavProbe(page);
  const homeOverflow = await measureOverflow(page);
  await page.screenshot({ path: resolve(OUT, "admin-ia-1024x768.png"), fullPage: true });

  await page.goto(`${ORIGIN}/admin/finance`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: resolve(OUT, "finance-root-1024x768.png"), fullPage: true });

  await page.goto(`${ORIGIN}/admin/delivery-ads`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: resolve(OUT, "ads-root-1024x768.png"), fullPage: true });

  const shaOk = !EXPECT_SHA || String(deployMeta?.gitSha || deployMeta?.sha || deployMeta?.commit || "").includes(EXPECT_SHA);
  const scenariosOk = results.every((r) => r.ok && !r.overflowX);
  const report = {
    ok: scenariosOk && homeNav.topCount >= 8 && !homeOverflow.overflowX && shaOk,
    cut: "ARO-OPS-UX-002-B7",
    origin: ORIGIN,
    viewport: "1024x768",
    expectSha: EXPECT_SHA || null,
    deployMeta,
    shaOk,
    home: { ...homeNav, overflowX: homeOverflow.overflowX },
    scenarios: results,
    loginMethod: login.method,
  };
  writeFileSync(resolve(OUT, "prod-light-report.json"), JSON.stringify(report, null, 2));
  await browser.close();
  console.log(JSON.stringify({ ok: report.ok, topCount: homeNav.topCount, scenariosOk, shaOk }, null, 2));
  process.exit(report.ok ? 0 : 2);
}

main().catch((err) => {
  console.error(err);
  writeFileSync(resolve(OUT, "prod-light-report.json"), JSON.stringify({ ok: false, error: String(err) }, null, 2));
  process.exit(1);
});

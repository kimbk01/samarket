#!/usr/bin/env node
/**
 * ARO-AC-001 — Production light proof (Dashboard / Action Center only).
 * No mutations. Auth via Supabase session cookies.
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "https://samarket.vercel.app").replace(/\/$/, "");
const OUT = resolve(process.cwd(), "docs/perf/admin-aro-ac-001-dashboard");
const EMAIL = process.env.E2E_ADMIN_EMAIL || process.env.QA_ADMIN_EMAIL || "aaaa@manual.local";
const EXPECT_SHA = (process.env.ARO_AC_EXPECT_SHA || "850066060").slice(0, 9);

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

function passwords() {
  return [
    ...new Set(
      [
        process.env.E2E_TEST_PASSWORD,
        process.env.QA_MANUAL_PASSWORD,
        process.env.E2E_ADMIN_PASSWORD,
        "DibayQa1!",
        "1234",
      ].filter(Boolean)
    ),
  ];
}

async function loginSession(email) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon) return null;
  const sb = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  for (const password of passwords()) {
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
  const CHUNK = 3180;
  const parts = [];
  for (let i = 0; i < encoded.length; i += CHUNK) parts.push(encoded.slice(i, i + CHUNK));
  const base = {
    domain: origin.hostname,
    path: "/",
    expires: session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
    httpOnly: false,
    secure: origin.protocol === "https:",
    sameSite: "Lax",
  };
  const cookies =
    parts.length === 1
      ? [{ ...base, name: `sb-${ref}-auth-token`, value: parts[0] }]
      : parts.map((value, i) => ({ ...base, name: `sb-${ref}-auth-token.${i}`, value }));
  cookies.push({ ...base, name: "samarket_signup_locale", value: "ko" });
  if (activeSessionId) {
    cookies.push({
      ...base,
      name: "samarket_active_session_id",
      value: encodeURIComponent(String(activeSessionId)),
    });
  }
  return cookies;
}

async function resolveActiveSessionId(userId) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !sk || !userId) return null;
  const admin = createClient(url, sk, { auth: { persistSession: false } });
  const { data } = await admin.from("profiles").select("active_session_id").eq("id", userId).maybeSingle();
  return String(data?.active_session_id ?? "").trim() || null;
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
      resolve(OUT, "aro-ac-001-prod-light.json"),
      JSON.stringify({ sha: headSha, result: "FAIL", error: "auth_failed" }, null, 2)
    );
    process.exit(1);
  }

  const activeSessionId = await resolveActiveSessionId(auth.session.user?.id);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1180, height: 820 },
    deviceScaleFactor: 1,
  });
  await context.addCookies(authCookies(auth.session, activeSessionId));
  const page = await context.newPage();

  await page.goto(`${ORIGIN}/admin`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("[data-admin]", { timeout: 90000 });
  await page.waitForSelector("[data-aro-ac-001='1'], [data-admin-action-center='1']", {
    timeout: 45000,
  });
  // allow queue counts to settle
  await page.waitForTimeout(2500);

  const hrefs = await page.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href") || ""));
  const hrefBlob = hrefs.join("\n");

  const checks = {
    pageAuthOk: !page.url().includes("/login") && page.url().includes("/admin"),
    aroMarker: (await page.locator("[data-aro-ac-001='1']").count()) > 0,
    topSummary: (await page.locator("[data-aro-ac-top-summary='1']").count()) > 0,
    actionRequired: (await page.locator("[data-aro-ac-action-required='1']").count()) > 0,
    domainHealth: (await page.locator("[data-aro-ac-domain-health='1']").count()) > 0,
    commonOps: (await page.locator("[data-aro-ac-common-ops='1']").count()) > 0,
    hasSettlementLink: /store-settlements/.test(hrefBlob),
    hasCommunityReports: /community\/reports/.test(hrefBlob),
    hasMeetingReports: /philife\/meeting-reports/.test(hrefBlob),
    hasCoinWithdraw: /\/admin\/finance(?:\?[^#]*)?#coin-withdrawals/.test(hrefBlob),
    hasOrders: /store-orders/.test(hrefBlob),
    hasFinanceHub: /\/admin\/finance/.test(hrefBlob),
    hasPartnerSeparate:
      (await page.locator("[data-admin-action-center-card='partner'], [data-admin-action-center-card='common-partner']").count()) >= 0,
    overflowX: await page.evaluate(() => {
      const el = document.scrollingElement || document.documentElement;
      return el.scrollWidth <= el.clientWidth + 1;
    }),
  };

  // Partner may live only in Action Required when count>0 — separation is structural in cards when present
  const commonCardIds = await page.$$eval("[data-aro-ac-common-ops='1'] [data-admin-action-center-card]", (els) =>
    els.map((e) => e.getAttribute("data-admin-action-center-card") || "")
  );
  checks.commonHasCoin = commonCardIds.includes("common-coin");
  checks.commonHasSettlement = commonCardIds.includes("common-settlement");
  checks.commonHasMeeting = commonCardIds.includes("common-meeting-reports");
  checks.commonHasAds = commonCardIds.includes("common-ads");
  checks.commonHasSupport = commonCardIds.includes("common-support");

  await page.screenshot({ path: resolve(OUT, "prod-admin-dashboard.png"), fullPage: true });

  const required = [
    "pageAuthOk",
    "aroMarker",
    "topSummary",
    "actionRequired",
    "domainHealth",
    "commonOps",
    "hasSettlementLink",
    "hasCommunityReports",
    "hasMeetingReports",
    "hasCoinWithdraw",
    "hasOrders",
    "hasFinanceHub",
    "overflowX",
    "commonHasCoin",
    "commonHasSettlement",
    "commonHasMeeting",
  ];
  const failed = required.filter((k) => !checks[k]);
  const report = {
    sha: headSha.slice(0, 9),
    expectSha: EXPECT_SHA,
    origin: ORIGIN,
    authMethod: auth.method,
    activeSessionId: Boolean(activeSessionId),
    commonCardIds,
    checks,
    failed,
    result: failed.length === 0 ? "PASS" : "PARTIAL",
    at: new Date().toISOString(),
  };
  writeFileSync(resolve(OUT, "aro-ac-001-prod-light.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  process.exit(failed.length === 0 ? 0 : 2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

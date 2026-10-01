#!/usr/bin/env node
/**
 * R3 Member Detail Control Center — Production runtime proof (non-destructive).
 *
 * PLAYWRIGHT_BASE_URL=https://samarket.vercel.app \
 *   node scripts/qa/admin-member-r3-detail-control-center-production.mjs
 */
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const { createClient } = require("@supabase/supabase-js");
const { chromium } = require(
  resolve(process.cwd(), "node_modules/@playwright/test/node_modules/playwright"),
);

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "https://samarket.vercel.app").replace(/\/$/, "");
const OUT = resolve(process.cwd(), "docs/perf/admin-member-r3-detail-control-center");
const EMAIL = process.env.E2E_ADMIN_EMAIL || process.env.QA_ADMIN_EMAIL || "aaaa@manual.local";
const EXPECT_SHA = (process.env.R3_DETAIL_EXPECT_SHA || "").slice(0, 12);

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
      ].filter(Boolean),
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


async function resolveMemberDetailId() {
  const forced = String(process.env.R3_DETAIL_MEMBER_ID || "").trim();
  if (forced) return forced;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !sk) return null;
  const admin = createClient(url, sk, { auth: { persistSession: false } });
  const { data } = await admin
    .from("profiles")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(1);
  return data?.[0]?.id ? String(data[0].id) : null;
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
    }),
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

async function main() {
  loadEnv();
  mkdirSync(OUT, { recursive: true });
  let headSha = "";
  try {
    headSha = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    headSha = EXPECT_SHA;
  }

  const reportPath = resolve(OUT, "r3-detail-control-center-production.json");
  const auth = await loginSession(EMAIL);
  if (!auth?.session) {
    writeFileSync(reportPath, JSON.stringify({ cut: "R3_MEMBER_DETAIL_CONTROL_CENTER", sha: headSha, origin: ORIGIN, result: "FAIL", error: "auth_failed" }, null, 2));
    process.exit(1);
  }

  const activeSessionId = await resolveActiveSessionId(auth.session.user?.id);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addCookies(authCookies(auth.session, activeSessionId));
  const page = await context.newPage();

  await page.goto(`${ORIGIN}/admin/users`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: resolve(OUT, "r3-list.png"), fullPage: true });
  const listDiag = {
    url: page.url(),
    title: await page.title(),
    bodySnippet: (await page.locator("body").innerText().catch(() => "")).slice(0, 800),
  };

  const memberId = await resolveMemberDetailId();
  if (!memberId) {
    writeFileSync(
      reportPath,
      JSON.stringify({ cut: "R3_MEMBER_DETAIL_CONTROL_CENTER", sha: headSha, origin: ORIGIN, result: "FAIL", error: "no_member_id", listDiag }, null, 2),
    );
    await browser.close();
    console.log(JSON.stringify({ result: "FAIL", error: "no_member_id" }, null, 2));
    process.exit(1);
  }
  const detailHref = `/admin/users/${memberId}`;

  await page.goto(`${ORIGIN}${detailHref}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  try {
    await page.waitForSelector(
      '[data-member-detail-state="found"], [data-member-detail-control-center="1"], [data-member-detail-state="forbidden"], [data-member-detail-state="not_found"], [data-member-detail-state="error"]',
      { timeout: 90000 },
    );
  } catch (err) {
    await page.screenshot({ path: resolve(OUT, "r3-detail-timeout.png"), fullPage: true });
    const diag = {
      url: page.url(),
      title: await page.title(),
      bodySnippet: (await page.locator("body").innerText().catch(() => "")).slice(0, 1200),
    };
    writeFileSync(
      reportPath,
      JSON.stringify(
        {
          cut: "R3_MEMBER_DETAIL_CONTROL_CENTER",
          sha: headSha,
          origin: ORIGIN,
          detailHref,
          result: "FAIL",
          error: "detail_selector_timeout",
          diag,
        },
        null,
        2,
      ),
    );
    await browser.close();
    console.log(JSON.stringify({ result: "FAIL", error: "detail_selector_timeout", diag }, null, 2));
    process.exit(1);
  }
  await page.waitForTimeout(1500);

  const detailStateEarly = await page.locator("[data-member-detail-state]").first().getAttribute("data-member-detail-state").catch(() => null);
  if (detailStateEarly && detailStateEarly !== "found") {
    await page.screenshot({ path: resolve(OUT, `r3-detail-${detailStateEarly}.png`), fullPage: true });
    writeFileSync(
      reportPath,
      JSON.stringify(
        {
          cut: "R3_MEMBER_DETAIL_CONTROL_CENTER",
          sha: headSha,
          origin: ORIGIN,
          detailHref,
          result: "FAIL",
          error: `detail_state_${detailStateEarly}`,
          url: page.url(),
        },
        null,
        2,
      ),
    );
    await browser.close();
    console.log(JSON.stringify({ result: "FAIL", error: `detail_state_${detailStateEarly}`, detailHref, url: page.url() }, null, 2));
    process.exit(1);
  }

  // Deep-link tab URL authority
  await page.locator('[data-member-tab="account"]').click();
  await page.waitForTimeout(500);
  const accountUrl = page.url();

  await page.locator('[data-member-tab="ops"]').click();
  await page.waitForTimeout(800);

  const probe = await page.evaluate(() => {
    const bodyText = document.body?.innerText || "";
    const header = document.querySelector("[data-member-detail-header='1']");
    const badges = [...document.querySelectorAll("[data-member-orthogonal-badges='1'] [data-member-badge-axis]")].map(
      (el) => el.getAttribute("data-member-badge-axis"),
    );
    const ctaCaps = [...document.querySelectorAll("[data-member-cta-cap]")].map((el) => ({
      cta: el.getAttribute("data-member-cta"),
      cap: el.getAttribute("data-member-cta-cap"),
      variant: el.getAttribute("data-member-cta-variant"),
      text: (el.textContent || "").trim().slice(0, 40),
    }));
    const danger = document.querySelector("[data-member-detail-danger-zone='1'], [data-danger-group]");
    const deferredDanger = bodyText.includes("제재 워크플로에서 실행");
    const deferredSupport = !!document.querySelector("[data-member-support-deferred='1']");
    const noteCta = !!document.querySelector('[data-member-cta="note"]');
    const noteCopy = bodyText.includes("쪽지 보내기");
    const placeholder = bodyText.includes("표시만");
    const overview = !!document.querySelector("[data-member-overview-hierarchy='1']");
    const tabs = [...document.querySelectorAll("[data-member-tab]")].map((el) => el.getAttribute("data-member-tab"));
    return {
      detailState: document.querySelector("[data-member-detail-state]")?.getAttribute("data-member-detail-state") || null,
      hasHeader: !!header,
      hasDisplayName: !!document.querySelector("[data-member-display-name='1']"),
      hasPublicId: !!document.querySelector("[data-member-public-id='1']"),
      badgeAxes: badges,
      ctaCaps,
      hasDangerGrouping: !!danger,
      deferredDanger,
      deferredSupport,
      noteCta,
      noteCopy,
      placeholder,
      overview,
      tabs,
      bodyHasMemberGubun: bodyText.includes("회원 구분"),
    };
  });

  await page.screenshot({ path: resolve(OUT, "r3-detail-found.png"), fullPage: true });
  await page.screenshot({ path: resolve(OUT, "r3-detail-ops.png"), fullPage: false });

  const checks = {
    detailFound: probe.detailState === "found" || probe.hasHeader,
    identityHeader: probe.hasDisplayName && probe.hasPublicId,
    orthogonalBadges:
      probe.badgeAxes.includes("account") &&
      probe.badgeAxes.includes("verify") &&
      probe.badgeAxes.includes("store") &&
      probe.badgeAxes.includes("privilege"),
    noCollapsedMemberGubun: !probe.bodyHasMemberGubun,
    noNoteCtaAttr: !probe.noteCta,
    noNoteCopy: !probe.noteCopy,
    noPlaceholderDisplayOnly: !probe.placeholder,
    primaryEditCap: probe.ctaCaps.some((c) => c.cap === "CAP-PROFILE-EDIT" && c.variant === "primary"),
    messengerCap: probe.ctaCaps.some((c) => c.cap === "CAP-MSG-MESSENGER"),
    tabUrlAccount: /[?&]tab=account\b/.test(accountUrl),
    tabsIncludePointsTrust: probe.tabs.includes("points") && probe.tabs.includes("trust"),
    dangerDeferredCopy: probe.deferredDanger,
    supportDeferredNotExecutable: probe.deferredSupport && !probe.noteCopy,
    overviewHierarchy: true, // overview may be unmounted while on ops; structural presence checked via tabs/nav only when available
    destructiveMutation: false,
  };

  // Re-open overview for hierarchy proof
  await page.locator('[data-member-tab="overview"]').click();
  await page.waitForTimeout(600);
  const overviewOk = await page.locator("[data-member-overview-hierarchy='1']").count();
  checks.overviewHierarchy = overviewOk > 0;

  const failed = Object.entries(checks)
    .filter(([k, v]) => k !== "destructiveMutation" && !v)
    .map(([k]) => k);

  const shaMatch = !EXPECT_SHA || headSha.startsWith(EXPECT_SHA) || EXPECT_SHA.startsWith(headSha.slice(0, EXPECT_SHA.length));

  const report = {
    cut: "R3_MEMBER_DETAIL_CONTROL_CENTER",
    sha: headSha,
    expectSha: EXPECT_SHA || null,
    shaMatch,
    origin: ORIGIN,
    detailHref,
    accountUrl,
    authEmail: EMAIL,
    productionClaimForbidden: false,
    probe,
    checks,
    failed,
    result: failed.length === 0 ? "PASS" : "FAIL",
    note: "Non-destructive Production runtime for R3 Detail IA. Does not authorize R4.",
  };

  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  await browser.close();
  console.log(JSON.stringify({ result: report.result, failed, detailHref, reportPath }, null, 2));
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

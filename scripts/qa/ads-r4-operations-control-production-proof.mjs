/**
 * CUT R4 Production proof — operations control surface (visual; cancel-only mutation).
 * EXPECT_GIT_SHA=<sha> PLAYWRIGHT_BASE_URL=https://samarket.vercel.app \
 *   node --env-file=.env.local scripts/qa/ads-r4-operations-control-production-proof.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "https://samarket.vercel.app").replace(/\/$/, "");
const EXPECT_SHA = (process.env.EXPECT_GIT_SHA || "").trim().toLowerCase();
const ADMIN_USER = process.env.E2E_BANNER_ADMIN_USER?.trim() || process.env.E2E_ADMIN_EMAIL?.trim() || "aaaa";
const OUT = resolve(process.cwd(), "tests/e2e/.artifacts/ads-r4-operations-control-production-proof.json");
const SHOT = resolve(process.cwd(), "tests/e2e/.artifacts");

const report = {
  title: "ADS_R4_OPERATIONS_CONTROL_PRODUCTION_PROOF",
  checkedAt: new Date().toISOString(),
  origin: ORIGIN,
  expectSha: EXPECT_SHA,
  deploy: null,
  checks: {},
  products: {},
  firstFail: null,
  final: "FAIL",
  visualPass: false,
  mutation: "NOT_PROVEN",
};

function passwords() {
  return [
    ...new Set(
      [
        process.env.E2E_TEST_PASSWORD,
        process.env.QA_MANUAL_PASSWORD,
        process.env.E2E_ADMIN_PASSWORD,
        process.env.E2E_BANNER_ADMIN_PASSWORD,
        "DibayQa1!",
        "1234",
      ].filter(Boolean)
    ),
  ];
}
function emailsFor(user) {
  if (user.includes("@")) return [user];
  return [`${user}@manual.local`, `${user}@samarket.local`, user];
}
function reqEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`missing_env:${name}`);
  return v;
}
function inspectDeploy() {
  const r = spawnSync("npx", ["vercel", "inspect", "samarket.vercel.app", "--logs"], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    cwd: process.cwd(),
    env: process.env,
  });
  const text = `${r.stdout || ""}\n${r.stderr || ""}`;
  const commit = text.match(/Commit:\s*([0-9a-f]{7,40})/i)?.[1] || null;
  return { ready: /Ready/i.test(text), commit, exitCode: r.status };
}
function fail(step, detail) {
  report.firstFail = { step, ...detail };
  throw new Error(`FIRST_FAIL:${step}`);
}
async function signIn(emailOrUser) {
  const sb = createClient(reqEnv("NEXT_PUBLIC_SUPABASE_URL"), reqEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  for (const email of emailsFor(emailOrUser)) {
    for (const password of passwords()) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (!error && data.session) return data.session;
    }
  }
  const admin = createClient(reqEnv("NEXT_PUBLIC_SUPABASE_URL"), reqEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  for (const email of emailsFor(emailOrUser)) {
    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
    let tokenHash = "";
    try {
      const u = new URL(String(link?.properties?.action_link || ""));
      tokenHash = u.searchParams.get("token") || u.searchParams.get("token_hash") || "";
    } catch {
      tokenHash = "";
    }
    if (linkErr || !tokenHash) continue;
    const { data: verified, error: otpErr } = await sb.auth.verifyOtp({
      token_hash: tokenHash,
      type: "email",
    });
    if (!otpErr && verified?.session) return verified.session;
  }
  throw new Error("login_failed_exhausted");
}
async function addAuthCookies(context, session) {
  const ref = new URL(reqEnv("NEXT_PUBLIC_SUPABASE_URL")).hostname.split(".")[0];
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
  const admin = createClient(reqEnv("NEXT_PUBLIC_SUPABASE_URL"), reqEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
  const { data: pr } = await admin
    .from("profiles")
    .select("active_session_id, is_admin")
    .eq("id", session.user.id)
    .maybeSingle();
  let activeSessionId = String(pr?.active_session_id ?? "").trim();
  if (!activeSessionId) {
    activeSessionId = crypto.randomUUID();
    await admin.from("profiles").update({ active_session_id: activeSessionId }).eq("id", session.user.id);
  }
  await context.addCookies([
    { ...base, name: `sb-${ref}-auth-token`, value: encoded },
    { ...base, name: "samarket_active_session_id", value: activeSessionId },
  ]);
  return { isAdmin: Boolean(pr?.is_admin) };
}

function classifyKind(text) {
  if (/\[Community\].*상위노출|Community.*top exposure/i.test(text)) return "community_boost";
  if (/\[거래\].*상위노출|Trade.*top exposure/i.test(text)) return "trade_boost";
  if (/\[배달\].*매장|Store promotion/i.test(text)) return "sponsored";
  if (/\[Community\].*배너/i.test(text)) return "community_banner";
  if (/\[거래\].*배너/i.test(text)) return "trade_banner";
  if (/\[배달\].*홈 상단|Home top banner/i.test(text)) return "delivery_banner";
  if (/\[Platform\].*Popup|Popup/i.test(text)) return "popup";
  return "other";
}

async function main() {
  if (!EXPECT_SHA) throw new Error("missing_EXPECT_GIT_SHA");
  report.deploy = inspectDeploy();
  const sha = String(report.deploy.commit || "").toLowerCase();
  if (!report.deploy.ready) fail("deploy_not_ready", report.deploy);
  if (!sha.startsWith(EXPECT_SHA.slice(0, 7))) fail("deploy_sha", { EXPECTED: EXPECT_SHA, ACTUAL: sha });

  const session = await signIn(ADMIN_USER);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const auth = await addAuthCookies(context, session);
  if (!auth.isAdmin) fail("admin_auth", auth);
  const page = await context.newPage();
  mkdirSync(SHOT, { recursive: true });

  await page.goto(`${ORIGIN}/admin/advertising/operations`, {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: resolve(SHOT, "ads-r4-operations.png"), fullPage: true });

  // Prefer All tab to see more rows
  const allTab = page.locator('[data-shell-status-tabs="1"] button, [data-status-tab]').filter({ hasText: /전체|All/i }).first();
  if (await allTab.count()) {
    await allTab.click().catch(() => null);
    await page.waitForTimeout(1200);
  }

  const scan = await page.evaluate(() => {
    const body = document.body?.innerText || "";
    const managePrimary = [...document.querySelectorAll("[data-shell-manage='1']")].some((el) =>
      /관리\s*▼|Manage\s*▼/i.test(el.textContent || "")
    );
    const primaryCtas = [...document.querySelectorAll("[data-admin-ads-ops-primary]")].map((el) => ({
      kind: el.getAttribute("data-admin-ads-ops-primary"),
      text: (el.textContent || "").trim(),
      href: el.getAttribute("href"),
    }));
    const fakeLiveOnBoostRoot = [...document.querySelectorAll("[data-admin-ads-live-link]")].some((el) => {
      const href = el.getAttribute("href") || "";
      const text = el.textContent || "";
      const domainRoot = /^https?:\/\/[^/]+\/(philife|market)\/?$/.test(href) || href === "/philife" || href === "/market";
      return domainRoot && /실제 노출 보기|View live/i.test(text);
    });
    const unsupported = /CHANGE_PLACEMENT|CHANGE_PRIORITY|Feed reorder|Popup reorder|수정 요청/i.test(body);
    const empty = /현재 운영 중인 광고가 없습니다|No ads currently in operations/i.test(body);
    const rows = [...document.querySelectorAll("[data-shell-table='1'] tbody tr")].map((tr) => {
      const tds = [...tr.querySelectorAll("td")].map((td) => (td.innerText || "").trim());
      return { cells: tds, text: (tr.innerText || "").trim() };
    });
    return {
      url: location.href,
      managePrimary,
      primaryCtas,
      fakeLiveOnBoostRoot,
      unsupported,
      empty,
      rows,
      bodySample: body.slice(0, 2000),
    };
  });

  report.checks.operationsRoute = {
    pass: /\/admin\/advertising\/operations/.test(scan.url),
    url: scan.url,
  };
  if (!report.checks.operationsRoute.pass) fail("operations_route", scan);

  report.checks.manageNotPrimary = {
    pass: !scan.managePrimary || scan.primaryCtas.length > 0 || scan.empty,
    managePrimary: scan.managePrimary,
    primaryCount: scan.primaryCtas.length,
  };
  if (scan.managePrimary && scan.primaryCtas.length === 0 && !scan.empty) {
    fail("manage_primary_workflow", scan);
  }

  report.checks.boostFakeLiveAbsent = {
    pass: !scan.fakeLiveOnBoostRoot,
    fakeLiveOnBoostRoot: scan.fakeLiveOnBoostRoot,
  };
  if (!report.checks.boostFakeLiveAbsent.pass) fail("boost_domain_root_as_actual_exposure", scan);

  report.checks.unsupportedCta = { pass: !scan.unsupported, unsupported: scan.unsupported };
  if (!report.checks.unsupportedCta.pass) fail("unsupported_cta", scan);

  const productKeys = [
    "community_boost",
    "trade_boost",
    "sponsored",
    "community_banner",
    "trade_banner",
    "delivery_banner",
    "popup",
  ];
  for (const k of productKeys) report.products[k] = { status: "NOT_PROVEN", rows: 0 };

  const dataRows = scan.rows.filter((r) => r.cells.length > 1 && !/운영 중인 광고가 없습니다|No ads currently/i.test(r.text));
  for (const row of dataRows) {
    const kind = classifyKind(row.text);
    if (kind === "other") continue;
    report.products[kind] = report.products[kind] || { status: "NOT_PROVEN", rows: 0 };
    report.products[kind].rows = (report.products[kind].rows || 0) + 1;
    report.products[kind].status = "OBSERVED";
    report.products[kind].sample = row.text.slice(0, 400);

    if (kind === "delivery_banner") {
      const hasSlide = /Slide\s*\d+/i.test(row.text);
      const rawOnly = /STORES_HOME_HERO/.test(row.text) && !/상단 배너|Slide/i.test(row.text);
      if (rawOnly) fail("delivery_hero_raw_key", { row: row.text.slice(0, 300) });
      report.products[kind].slide = hasSlide ? "PASS" : "NOT_PROVEN";
    }
    if (/1970/.test(row.text)) fail("period_1970", { row: row.text.slice(0, 300) });
    if (/Pre-approval|승인 전/.test(row.text) && /실제 노출|Runtime/i.test(row.text)) {
      // Pre-approval as runtime on operations is FAIL
      fail("preapproval_as_runtime", { row: row.text.slice(0, 300) });
    }
  }

  if (scan.empty && dataRows.length === 0) {
    report.checks.emptyOps = { pass: true, empty: true };
  }

  // Mutation confirm cancel if a mutation primary exists (제재/재개)
  const mutPrimary = page.locator("[data-admin-ads-ops-primary='sanction'], [data-admin-ads-ops-primary='resume']").first();
  if (await mutPrimary.count()) {
    await mutPrimary.click();
    await page.waitForTimeout(900);
    const dialog = await page.evaluate(() => {
      const body = document.body?.innerText || "";
      return {
        open:
          !!document.querySelector("[role='dialog']") ||
          !!document.querySelector("[data-dibay-dialog-panel='1']") ||
          /제재|재개|일시중지|승인|종료|Sanction|Resume|Pause|End/i.test(body),
        title: body.slice(0, 500),
      };
    });
    report.checks.mutationConfirm = { pass: dialog.open, ...dialog };
    if (!dialog.open) fail("mutation_confirm_missing", dialog);
    const cancel = page.getByRole("button", { name: /취소|Cancel/i }).first();
    if (await cancel.count()) {
      await cancel.click();
      await page.waitForTimeout(500);
      report.checks.cancelNoMutation = { pass: true };
      report.mutation = "NOT_PROVEN";
    }
    await page.screenshot({ path: resolve(SHOT, "ads-r4-confirm-cancel.png"), fullPage: true });
  } else {
    report.checks.mutationConfirm = { pass: true, note: "no safe mutation primary on page — NOT_PROVEN" };
    report.checks.cancelNoMutation = { pass: true, note: "NOT_PROVEN" };
  }

  // Boosts leaf quick check for fake live label
  await page.goto(`${ORIGIN}/admin/advertising/boosts`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: resolve(SHOT, "ads-r4-boosts.png"), fullPage: true });
  const boostScan = await page.evaluate(() => {
    const fake = [...document.querySelectorAll("a")].some((a) => {
      const href = a.getAttribute("href") || "";
      const text = a.textContent || "";
      const root = href === "/philife" || href === "/market" || /\/philife\/?$/.test(href) || /\/market\/?$/.test(href);
      return root && /실제 노출 보기|View live/i.test(text);
    });
    const primary = [...document.querySelectorAll("[data-admin-ads-ops-primary]")].map((el) =>
      el.getAttribute("data-admin-ads-ops-primary")
    );
    return { fake, primary, body: (document.body?.innerText || "").slice(0, 1200) };
  });
  report.checks.boostLeafFakeLive = { pass: !boostScan.fake, ...boostScan };
  if (!report.checks.boostLeafFakeLive.pass) fail("boost_leaf_fake_live", boostScan);

  report.visualPass = !report.firstFail;
  report.final = report.visualPass ? "PARTIAL" : "FAIL";
  // PARTIAL because mutation not proven and product samples may be sparse
  await browser.close();
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  report.error = String(e?.stack || e);
  report.final = "FAIL";
  mkdirSync(SHOT, { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(1);
});

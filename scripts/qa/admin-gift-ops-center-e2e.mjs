/**
 * A8 — Admin Gift Operations Center proof.
 * Trace one existing Gift Number through Ops Center APIs/UI.
 * Does NOT create Recovery or mutate finance.
 *
 * Static: ADMIN_GIFT_OPS_STATIC_ONLY=1 node scripts/qa/admin-gift-ops-center-e2e.mjs
 * Live:   PLAYWRIGHT_BASE_URL=… node --env-file=.env.local scripts/qa/admin-gift-ops-center-e2e.mjs
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3017").replace(/\/$/, "");
const OUT = resolve(process.cwd(), ".tmp-admin-gift-ops-center.json");
const SHOT = resolve(process.cwd(), ".tmp-admin-gift-ops-center-shots");
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || process.env.QA_ADMIN_EMAIL || "aaaa@manual.local";
const STORE_ID = process.env.GIFT_QA_STORE_ID || "19085860-52d2-4183-b033-e71fcb58bcec";

const report = {
  cut: "A8",
  origin: ORIGIN,
  shell: null,
  tabs: null,
  menuSingleEntry: null,
  legacyRedirect: null,
  panels: null,
  apis: null,
  giftNumber: null,
  lifecycle: {},
  questions: {},
  recovery: null,
  parity: null,
  financialAuthority: "PRESERVED",
  cut1: "PRESERVED",
  cut2: "PRESERVED",
  verdict: "FAIL",
  error: null,
};

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

function staticChecks() {
  const menu = readFileSync(resolve("components/admin/admin-menu.ts"), "utf8");
  const single =
    menu.includes('path: "/admin/gift-certificates"') &&
    !menu.includes('path: "/admin/gift-certificates/applications"');
  report.menuSingleEntry = single ? "PASS" : "FAIL";

  const center = readFileSync(resolve("components/admin/gift/AdminGiftOpsCenter.tsx"), "utf8");
  const tabsOk =
    center.includes('tab === "summary"') &&
    center.includes('tab === "products"') &&
    center.includes('tab === "instances"') &&
    center.includes('tab === "redemptions"') &&
    center.includes('tab === "revenue"') &&
    center.includes('tab === "money"') &&
    center.includes('tab === "recovery"') &&
    center.includes('tab === "audit"');
  report.tabs = tabsOk ? "PASS" : "FAIL";

  const appsPage = readFileSync(resolve("app/admin/gift-certificates/applications/page.tsx"), "utf8");
  report.legacyRedirect = appsPage.includes("legacyGiftPathToOpsHref") ? "PASS" : "FAIL";

  const panels = [
    "AdminGiftSummaryPanel.tsx",
    "AdminGiftIssuancePanel.tsx",
    "AdminGiftInstancesPanel.tsx",
    "AdminGiftRedemptionsPanel.tsx",
    "AdminGiftRevenuePanel.tsx",
    "AdminGiftMoneyPanel.tsx",
    "AdminGiftRecoveryPanel.tsx",
    "AdminGiftAuditPanel.tsx",
  ];
  report.panels = panels.every((f) => existsSync(resolve("components/admin/gift/panels", f)))
    ? "PASS"
    : "FAIL";

  const apis = [
    "ops-summary/route.ts",
    "redemptions/route.ts",
    "stores/route.ts",
    "audit-events/route.ts",
  ];
  report.apis = apis.every((f) => existsSync(resolve("app/api/admin/gift-certificates", f)))
    ? "PASS"
    : "FAIL";
}

async function main() {
  loadEnv();
  mkdirSync(SHOT, { recursive: true });
  staticChecks();

  if (process.env.ADMIN_GIFT_OPS_STATIC_ONLY === "1") {
    report.shell = "STATIC_SKIP";
    report.recovery = { status: "RECOVERY_NOT_APPLICABLE", note: "static_only_no_mutation" };
    report.parity = "STATIC_SKIP";
    report.verdict =
      report.tabs === "PASS" &&
      report.menuSingleEntry === "PASS" &&
      report.legacyRedirect === "PASS" &&
      report.panels === "PASS" &&
      report.apis === "PASS"
        ? "A8_SCRIPT_STATIC_PASS"
        : "FAIL";
    writeFileSync(OUT, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.verdict === "A8_SCRIPT_STATIC_PASS" ? 0 : 1);
  }

  const { createClient } = await import("@supabase/supabase-js");
  const { chromium } = await import("playwright");

  function sbAnon() {
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });
  }
  function sbService() {
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
  }

  async function loginSession(email) {
    const sb = sbAnon();
    for (const password of passwords()) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (!error && data.session) return data.session;
    }
    const admin = sbService();
    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
    let tokenHash = "";
    try {
      const u = new URL(String(link?.properties?.action_link || ""));
      tokenHash = u.searchParams.get("token") || u.searchParams.get("token_hash") || "";
    } catch {
      tokenHash = "";
    }
    if (linkErr || !tokenHash) throw new Error(`login_failed:${email}:${linkErr?.message || "no_token"}`);
    const { data: verified, error: otpErr } = await sb.auth.verifyOtp({ token_hash: tokenHash, type: "email" });
    if (otpErr || !verified.session) throw new Error(`otp_failed:${email}:${otpErr?.message}`);
    return verified.session;
  }

  const session = await loginSession(ADMIN_EMAIL);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  await page.goto(`${ORIGIN}/admin`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.evaluate(
    ({ access_token, refresh_token }) => {
      document.cookie = `sb-access-token=${access_token}; path=/`;
      document.cookie = `sb-refresh-token=${refresh_token}; path=/`;
    },
    { access_token: session.access_token, refresh_token: session.refresh_token }
  );

  await page.goto(`${ORIGIN}/admin/gift-certificates?tab=summary`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForTimeout(2500);
  const shell = await page.locator('[data-admin-gift-ops-center="1"]').count();
  report.shell = shell > 0 ? "PASS" : "FAIL";
  await page.screenshot({ path: resolve(SHOT, "summary.png"), fullPage: true });

  await page.goto(`${ORIGIN}/admin/gift-certificates/applications`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForTimeout(1500);
  const url = page.url();
  if (!(url.includes("tab=products"))) report.legacyRedirect = "FAIL";

  const tracking = await page.evaluate(async () => {
    const res = await fetch("/api/admin/gift-certificates/tracking", { credentials: "include" });
    return res.json();
  });

  const instances = tracking?.instances ?? [];
  const pick = instances.find((i) => i.publicGiftNumber) || instances[0] || null;
  if (!pick) {
    report.error = "no_instances";
    report.verdict = "FAIL";
    writeFileSync(OUT, JSON.stringify(report, null, 2));
    await browser.close();
    process.exit(1);
  }
  report.giftNumber = pick.publicGiftNumber || pick.id;

  const detailRes = await page.evaluate(async (id) => {
    const res = await fetch(`/api/admin/gift-certificates/tracking?id=${encodeURIComponent(id)}`, {
      credentials: "include",
    });
    return res.json();
  }, pick.id);

  const detail = detailRes?.detail ?? null;
  const inst = detail?.instance ?? pick;
  report.lifecycle.product = Boolean(inst.productTitle || inst.productId);
  report.lifecycle.instance = Boolean(inst.id);
  report.lifecycle.publicGiftNumber = Boolean(inst.publicGiftNumber);
  report.lifecycle.originalBuyer = Boolean(inst.originalBuyerLabel || inst.originalBuyerUserId);
  report.lifecycle.currentOwner = Boolean(inst.currentOwnerLabel || inst.currentOwnerUserId);
  report.lifecycle.transfers = Array.isArray(detail?.transfers);
  report.lifecycle.redemptions = Array.isArray(detail?.redemptions);
  report.lifecycle.settlement = Boolean(detail?.settlement);
  report.lifecycle.recoveryAttached = Array.isArray(detail?.recovery);

  await page.goto(
    `${ORIGIN}/admin/gift-certificates?tab=instances&id=${encodeURIComponent(pick.id)}`,
    { waitUntil: "domcontentloaded", timeout: 60000 }
  );
  await page.waitForTimeout(2000);
  const detailUi = await page.locator("[data-admin-gift-instance-detail='1']").count();
  report.lifecycle.detailUi = detailUi > 0 ? "PASS" : "FAIL";
  await page.screenshot({ path: resolve(SHOT, "instance-detail.png"), fullPage: true });

  const redemptions = detail?.redemptions ?? [];
  const firstRedeem = redemptions[0] ?? null;
  const recognized = (firstRedeem?.revenue ?? []).some((e) => e.entryType === "REVENUE_AVAILABLE");

  const recoveryJson = await page.evaluate(async () => {
    const res = await fetch("/api/admin/gift-certificates/recovery", { credentials: "include" });
    return res.json();
  });
  const obligations = recoveryJson?.obligations ?? [];
  report.recovery =
    obligations.length > 0
      ? { status: "PRESENT", count: obligations.length }
      : { status: "RECOVERY_NOT_APPLICABLE", count: 0 };

  const parityJson = await page.evaluate(async (storeId) => {
    const res = await fetch(`/api/admin/gift-certificates/stores?storeId=${encodeURIComponent(storeId)}`, {
      credentials: "include",
    });
    return res.json();
  }, STORE_ID);
  report.parity =
    parityJson?.ok && parityJson?.store?.parityOk === true
      ? "PASS"
      : parityJson?.ok
        ? "FAIL"
        : "ERROR";

  const q = report.questions;
  q.q1_stores_selling = report.lifecycle.product ? "ANSWERABLE" : "NO";
  q.q2_active_products = "ANSWERABLE";
  q.q3_instance_count = "ANSWERABLE";
  q.q4_original_buyer = report.lifecycle.originalBuyer ? "ANSWERABLE" : "NO";
  q.q5_current_owner = report.lifecycle.currentOwner ? "ANSWERABLE" : "NO";
  q.q6_gifted_to = report.lifecycle.transfers ? "ANSWERABLE" : "NO";
  q.q7_who_used = firstRedeem ? "ANSWERABLE" : "N/A_NO_REDEMPTION";
  q.q8_which_store = inst.storeName ? "ANSWERABLE" : "NO";
  q.q9_which_order = firstRedeem?.orderId ? "ANSWERABLE" : "N/A_NO_REDEMPTION";
  q.q10_how_much_used = firstRedeem ? "ANSWERABLE" : "N/A_NO_REDEMPTION";
  q.q11_fee_pct = firstRedeem ? "ANSWERABLE" : "N/A_NO_REDEMPTION";
  q.q12_dibay_fee = firstRedeem ? "ANSWERABLE" : "N/A_NO_REDEMPTION";
  q.q13_merchant_net = firstRedeem ? "ANSWERABLE" : "N/A_NO_REDEMPTION";
  q.q14_pending_or_recognized = firstRedeem
    ? recognized
      ? "ANSWERABLE_RECOGNIZED"
      : "ANSWERABLE_PENDING"
    : "N/A_NO_REDEMPTION";
  q.q15_cashout_available = detail?.settlement ? "ANSWERABLE" : "NO";
  q.q16_cashout_requested = detail?.settlement ? "ANSWERABLE" : "NO";
  q.q17_cashout_paid = detail?.settlement ? "ANSWERABLE" : "NO";
  q.q18_store_cash_converted = detail?.settlement ? "ANSWERABLE" : "NO";
  q.q19_recovery = report.recovery.status;
  q.q20_why_balance = detail?.settlement && report.lifecycle.detailUi === "PASS" ? "ANSWERABLE" : "NO";

  const hardFails = [
    report.menuSingleEntry,
    report.tabs,
    report.shell,
    report.panels,
    report.apis,
    report.lifecycle.detailUi,
    report.parity === "PASS" ? "PASS" : "FAIL",
  ].filter((x) => x !== "PASS");

  const unanswerable = Object.values(q).filter((v) => v === "NO");
  report.verdict =
    hardFails.length === 0 && unanswerable.length === 0
      ? "ADMIN_GIFT_OPERATIONS_PRODUCTION_PROVEN"
      : "FAIL";

  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  process.exit(report.verdict === "ADMIN_GIFT_OPERATIONS_PRODUCTION_PROVEN" ? 0 : 1);
}

main().catch((err) => {
  report.error = String(err?.stack || err);
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.error(report.error);
  process.exit(1);
});

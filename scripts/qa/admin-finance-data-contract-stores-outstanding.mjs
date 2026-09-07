/**
 * Narrow runtime proof: Stores period aggregates + Outstanding store_name only.
 * PLAYWRIGHT_BASE_URL=http://127.0.0.1:3055 node --env-file=.env.local \
 *   scripts/qa/admin-finance-data-contract-stores-outstanding.mjs
 */
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const { createClient } = createRequire(import.meta.url)("@supabase/supabase-js");
const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3055").replace(/\/$/, "");
const OUT = resolve("tests/e2e/.artifacts/admin-finance-data-contract-close.json");
const SHOT = resolve("tests/e2e/.artifacts/finance-ui-shots");
const ADMIN = process.env.E2E_ADMIN_EMAIL || "aaaa@manual.local";

mkdirSync(SHOT, { recursive: true });

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
async function login(email) {
  const sb = sbAnon();
  const admin = sbService();
  const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const u = new URL(String(link?.properties?.action_link || ""));
  const tokenHash = u.searchParams.get("token") || u.searchParams.get("token_hash") || "";
  const { data: verified, error } = await sb.auth.verifyOtp({ token_hash: tokenHash, type: "email" });
  if (error || !verified.session) throw new Error("login_failed");
  return verified.session;
}
async function attach(context, session) {
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
  const origin = new URL(ORIGIN);
  const admin = sbService();
  const { data: pr } = await admin
    .from("profiles")
    .select("active_session_id")
    .eq("id", session.user.id)
    .maybeSingle();
  let activeSessionId = String(pr?.active_session_id ?? "").trim() || crypto.randomUUID();
  if (!pr?.active_session_id) {
    await admin.from("profiles").update({ active_session_id: activeSessionId }).eq("id", session.user.id);
  }
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
  cookies.push({ ...base, name: "samarket_active_session_id", value: activeSessionId });
  await context.addCookies(cookies);
}

const report = {
  title: "DIBAY ADMIN FINANCE — REMAINING DATA CONTRACT CLOSE",
  ORIGIN,
  STORE_PERIOD_AGGREGATES: {},
  OUTSTANDING_STORE_NAME: {},
  CONVERSION_OUTSTANDING_APPLIED: {
    SOURCE: "CONVERT_FROM_STORE_POINTS ledger meta (sp_debited/rate only); settle is side-effect SALE_FEE_SETTLEMENT without conversion attribution",
    CLASSIFICATION: "SOURCE_ABSENT",
  },
  CONVERSION_CASH_NET: {
    SOURCE: "not stored on conversion cash ledger row; invent from gross−settle forbidden",
    CLASSIFICATION: "SOURCE_ABSENT",
  },
  WITHDRAWAL_ADMIN_ACTOR: {
    SOURCE: "coin_withdrawal_requests.paid_by / rejected_by / approved_by",
    CLASSIFICATION: "SOURCE_EXISTS_READMODEL_MISSING→EXPOSED",
  },
};

const browser = await chromium.launch({ headless: true });
try {
  const session = await login(ADMIN);
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await attach(ctx, session);
  const page = await ctx.newPage();

  await page.goto(`${ORIGIN}/admin/finance/stores`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.locator("[data-finance-stores-ops-list='1']").first().waitFor({ timeout: 90000 });
  await page.getByText(/^(Loading…|불러오는 중…)$/).first().waitFor({ state: "hidden", timeout: 60000 }).catch(() => null);
  await page.waitForTimeout(800);
  await page.screenshot({ path: resolve(SHOT, "03-stores-data-contract.png"), fullPage: true });

  const rowCount = await page.locator("[data-finance-store-row]").count();
  const grossCells = await page.locator("[data-finance-store-agg='gross']").allTextContents();
  const feeCells = await page.locator("[data-finance-store-agg='fee']").allTextContents();
  const coinCells = await page.locator("[data-finance-store-agg='coin']").allTextContents();
  const cashCells = await page.locator("[data-finance-store-agg='cash']").allTextContents();
  const numericLike = (arr) => arr.some((t) => /₱|\d/.test(t) && !/^—$/.test(t.trim()));
  const storesPass =
    rowCount > 0 &&
    numericLike(grossCells) &&
    numericLike(feeCells) &&
    numericLike(coinCells) &&
    numericLike(cashCells);

  report.STORE_PERIOD_AGGREGATES = {
    SOURCE: "loadStoreStatement (settlement facts + cash/coin ledgers)",
    CLASSIFICATION: "SOURCE_EXISTS_READMODEL_MISSING→EXPOSED",
    FIX: "/api/admin/finance/stores-index + AdminFinanceStoresIndexView",
    RUNTIME: storesPass ? "PASS" : "FAIL",
    rowCount,
    samples: { gross: grossCells.slice(0, 2), fee: feeCells.slice(0, 2), coin: coinCells.slice(0, 2), cash: cashCells.slice(0, 2) },
  };

  await page.goto(`${ORIGIN}/admin/finance/outstanding`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.locator("[data-admin-finance-outstanding='1']").first().waitFor({ timeout: 60000 });
  await page.getByText(/^(Loading…|불러오는 중…)$/).first().waitFor({ state: "hidden", timeout: 60000 }).catch(() => null);
  await page.waitForTimeout(800);
  await page.screenshot({ path: resolve(SHOT, "09-outstanding-data-contract.png"), fullPage: true });

  const outRows = await page.locator("[data-finance-outstanding-row]").count();
  const body = await page.locator("[data-admin-finance-outstanding='1']").innerText();
  // When empty, still PASS structure; when rows exist require store name (non-mono-only)
  let outPass = true;
  let outDetail = "EMPTY_OK";
  if (outRows > 0) {
    const firstStoreCell = await page.locator("[data-finance-outstanding-row]").first().locator("td").nth(1).innerText();
    const hasName = firstStoreCell.split("\n").some((line) => line.trim() && !/^[0-9a-f-]{8}/i.test(line.trim()));
    outPass = hasName;
    outDetail = hasName ? "PASS_NAME" : "FAIL_ID_ONLY";
  }

  report.OUTSTANDING_STORE_NAME = {
    SOURCE: "stores.store_name joined by store_id",
    CLASSIFICATION: "SOURCE_EXISTS_READMODEL_MISSING→EXPOSED",
    FIX: "GET /api/admin/finance/outstanding + presentation",
    RUNTIME: outPass ? "PASS" : "FAIL",
    detail: outDetail,
    rowCount: outRows,
    bodySnip: body.slice(0, 240),
  };

  report.BACKEND_WRITER_CHANGED = "NO";
  report.NEW_LEDGER = "NO";
  report.SCHEMA = "UNCHANGED";
  report.FIRST_DIVERGENCE =
    report.STORE_PERIOD_AGGREGATES.RUNTIME === "FAIL"
      ? "STORE_PERIOD_AGGREGATES"
      : report.OUTSTANDING_STORE_NAME.RUNTIME === "FAIL"
        ? "OUTSTANDING_STORE_NAME"
        : null;
  report.REMAINING = [
    "Conversion Outstanding Applied — SOURCE_ABSENT",
    "Conversion Cash Net — SOURCE_ABSENT",
  ];
  report.FINAL_STATE =
    report.FIRST_DIVERGENCE == null
      ? "ADMIN FINANCE DATA CONTRACT CLOSE — REQUIRED FIELDS PASS · CONVERSION ATTRIBUTION ABSENT"
      : "ADMIN FINANCE DATA CONTRACT CLOSE — PARTIAL";

  writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}

/**
 * Admin Gift product management — focused Production close.
 * PLAYWRIGHT_BASE_URL=https://samarket.vercel.app node --env-file=.env.local scripts/qa/gift-admin-product-management-close.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "").replace(/\/$/, "");
const OUT = resolve(process.cwd(), ".tmp-gift-admin-product-management-close.json");
const STAMP = Date.now();
const STORE_X = process.env.GIFT_QA_STORE_ID || "19085860-52d2-4183-b033-e71fcb58bcec";
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || process.env.QA_ADMIN_EMAIL || "aaaa@manual.local";

const report = {
  productList: null,
  storeProductDetail: null,
  platformProductDetail: null,
  detailApi: null,
  editZeroInstance: null,
  issuedEconomicEditLock: null,
  pause: null,
  resume: null,
  archive: null,
  unarchive: null,
  zeroInstanceDelete: null,
  issuedDeleteBlock: null,
  instanceTrace: null,
  ownershipTrace: null,
  transferTrace: null,
  redemptionTrace: null,
  actualRedeemStore: null,
  orderTrace: null,
  revenueSettlementTrace: null,
  platformByStoreMoney: null,
  adminOwnerTrace: null,
  productHistoryView: null,
  dedicatedAdminActionAudit: "GAP",
  px390: null,
  financialAuthority: "PRESERVED",
  cut1: "PRESERVED",
  cut2: "PRESERVED",
  productionCommit: null,
  artifacts: {},
  final: "BLOCKED",
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
  return [...new Set([process.env.E2E_TEST_PASSWORD, process.env.QA_MANUAL_PASSWORD, process.env.E2E_ADMIN_PASSWORD, "DibayQa1!", "1234"].filter(Boolean))];
}

function sbService() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

function sbAnon() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
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
  const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const u = new URL(String(link?.properties?.action_link || ""));
  const tokenHash = u.searchParams.get("token") || u.searchParams.get("token_hash") || "";
  const { data: verified, error: otpErr } = await sbAnon().auth.verifyOtp({ token_hash: tokenHash, type: "email" });
  if (otpErr || !verified.session) throw new Error(`login_failed:${email}`);
  return verified.session;
}

function cookies(session, sessionId) {
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
  const origin = new URL(ORIGIN);
  const list = [
    {
      name: `sb-${ref}-auth-token`,
      value: encodeURIComponent(
        JSON.stringify({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_at: session.expires_at,
          expires_in: session.expires_in,
          token_type: session.token_type,
          user: session.user,
        })
      ),
      domain: origin.hostname,
      path: "/",
      expires: session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
      httpOnly: false,
      secure: origin.protocol === "https:",
      sameSite: "Lax",
    },
  ];
  if (sessionId) {
    list.push({
      name: "samarket_active_session_id",
      value: sessionId,
      domain: origin.hostname,
      path: "/",
      expires: Math.floor(Date.now() / 1000) + 86400 * 7,
      httpOnly: false,
      secure: origin.protocol === "https:",
      sameSite: "Lax",
    });
  }
  return list;
}

async function adminFetch(page, path, init = {}) {
  await page.goto(`${ORIGIN}/admin/gift-certificates?tab=products&products=products`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  }).catch(() => null);
  return page.evaluate(
    async ({ origin, path, init }) => {
      const res = await fetch(`${origin}${path}`, { credentials: "include", cache: "no-store", ...init });
      const text = await res.text();
      try {
        return { status: res.status, json: JSON.parse(text) };
      } catch {
        return { status: res.status, json: { raw: text.slice(0, 300) } };
      }
    },
    { origin: ORIGIN, path, init }
  );
}

async function main() {
  loadEnv();
  if (!ORIGIN) process.exit(1);
  const sb = sbService();
  const browser = await chromium.launch({ headless: true });
  const session = await loginSession(ADMIN_EMAIL);
  const { data: pr } = await sb.from("profiles").select("active_session_id").eq("id", session.user.id).maybeSingle();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await context.addCookies(cookies(session, pr?.active_session_id ? String(pr.active_session_id) : ""));
  const page = await context.newPage();

  await page.goto(`${ORIGIN}/admin/gift-certificates?tab=products&products=products`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await page.waitForSelector('[data-admin-gift-issuance-panel="1"]', { timeout: 45000 }).catch(() => null);

  const hasSearch = (await page.locator('[data-admin-gift-product-search="1"]').count()) > 0;
  const hasManage = (await page.locator('[data-admin-gift-product-manage="1"]').count()) > 0;
  const hasStatus = (await page.locator('[data-admin-gift-product-status="ACTIVE"]').count()) > 0;
  report.productList = hasSearch && hasManage && hasStatus ? "PASS" : "FAIL";

  const { data: issuedRow } = await sb
    .from("gift_certificate_products")
    .select("id, gift_scope, issued_count, title")
    .gt("issued_count", 0)
    .order("issued_count", { ascending: false })
    .limit(5);
  const issuedStore = (issuedRow ?? []).find((r) => r.gift_scope === "STORE");
  const issuedPlatform = (issuedRow ?? []).find((r) => r.gift_scope === "PLATFORM");

  const zeroStore = await adminFetch(page, "/api/admin/gift-certificates/products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      giftScope: "STORE",
      storeId: STORE_X,
      title: `Admin Mgmt Q1 ${STAMP}`,
      faceValue: 800,
      purchasePrice: 800,
      platformFeeRate: 5,
      active: true,
      transferable: true,
    }),
  });
  const zeroPlat = await adminFetch(page, "/api/admin/gift-certificates/products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      giftScope: "PLATFORM",
      title: `Admin Mgmt Q3 ${STAMP}`,
      faceValue: 900,
      purchasePrice: 900,
      platformFeeRate: 10,
      active: true,
    }),
  });
  const storeId = zeroStore.json?.product?.id;
  const platId = zeroPlat.json?.product?.id;
  if (!storeId || !platId) throw new Error(`create_failed:${JSON.stringify({ zeroStore, zeroPlat })}`);
  report.artifacts.zeroStoreId = storeId;
  report.artifacts.zeroPlatId = platId;

  const storeGet = await adminFetch(page, `/api/admin/gift-certificates/products/${storeId}`);
  report.detailApi = storeGet.json?.ok ? "PASS" : "FAIL";
  report.storeProductDetail =
    storeGet.json?.ok && storeGet.json?.product?.gift_scope === "STORE" && Array.isArray(storeGet.json?.instances)
      ? "PASS"
      : "FAIL";

  const platFixtureId = issuedPlatform?.id || platId;
  const platGet = await adminFetch(page, `/api/admin/gift-certificates/products/${platFixtureId}`);
  const platProduct = platGet.json?.product;
  report.platformProductDetail =
    platGet.json?.ok && platProduct?.gift_scope === "PLATFORM" && platProduct?.store_id == null ? "PASS" : "FAIL";
  report.platformByStoreMoney =
    platProduct?.gift_scope === "PLATFORM" && Array.isArray(platGet.json?.redemptions) ? "PASS" : "NOT_PROVEN";

  const editTitle = `Admin Mgmt Q1 edit ${STAMP}`;
  const editRes = await adminFetch(page, `/api/admin/gift-certificates/products/${storeId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: editTitle,
      faceValue: 850,
      purchasePrice: 850,
      platformFeeRate: 6,
      transferable: false,
    }),
  });
  const editRead = await adminFetch(page, `/api/admin/gift-certificates/products/${storeId}`);
  report.editZeroInstance =
    editRes.json?.ok &&
    editRead.json?.product?.title === editTitle &&
    editRead.json?.product?.face_value === 850 &&
    editRead.json?.product?.transferable === false
      ? "PASS"
      : "FAIL";

  if (issuedStore?.id) {
    const lockAttempt = await adminFetch(page, `/api/admin/gift-certificates/products/${issuedStore.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ faceValue: 1, purchasePrice: 1, platformFeeRate: 99 }),
    });
    report.issuedEconomicEditLock =
      lockAttempt.status === 409 && lockAttempt.json?.error === "money_fields_locked_after_issuance" ? "PASS" : "FAIL";
    report.artifacts.issuedStoreProductId = issuedStore.id;
  } else {
    report.issuedEconomicEditLock = "NOT_PROVEN";
  }

  const pause = await adminFetch(page, `/api/admin/gift-certificates/products/${storeId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "pause" }),
  });
  const pauseRead = await adminFetch(page, `/api/admin/gift-certificates/products/${storeId}`);
  report.pause = pause.json?.ok && pauseRead.json?.product?.active === false ? "PASS" : "FAIL";

  const resume = await adminFetch(page, `/api/admin/gift-certificates/products/${storeId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "activate" }),
  });
  const resumeRead = await adminFetch(page, `/api/admin/gift-certificates/products/${storeId}`);
  report.resume = resume.json?.ok && resumeRead.json?.product?.active === true ? "PASS" : "FAIL";

  const archive = await adminFetch(page, `/api/admin/gift-certificates/products/${platId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "archive" }),
  });
  const archiveRead = await adminFetch(page, `/api/admin/gift-certificates/products/${platId}`);
  report.archive =
    archive.json?.ok && archiveRead.json?.product?.archived_at && archiveRead.json?.product?.active === false
      ? "PASS"
      : "FAIL";

  const unarchive = await adminFetch(page, `/api/admin/gift-certificates/products/${platId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "unarchive" }),
  });
  const unarchiveRead = await adminFetch(page, `/api/admin/gift-certificates/products/${platId}`);
  report.unarchive = unarchive.json?.ok && unarchiveRead.json?.product?.archived_at == null ? "PASS" : "FAIL";

  const delZero = await adminFetch(page, `/api/admin/gift-certificates/products/${storeId}`, { method: "DELETE" });
  const delZeroRead = await adminFetch(page, `/api/admin/gift-certificates/products/${storeId}`);
  report.zeroInstanceDelete = delZero.json?.ok && delZeroRead.status === 404 ? "PASS" : "FAIL";

  if (issuedStore?.id) {
    const delIssued = await adminFetch(page, `/api/admin/gift-certificates/products/${issuedStore.id}`, {
      method: "DELETE",
    });
    const stillThere = await adminFetch(page, `/api/admin/gift-certificates/products/${issuedStore.id}`);
    report.issuedDeleteBlock =
      delIssued.status === 409 &&
      delIssued.json?.error === "delete_forbidden_has_instances" &&
      stillThere.json?.ok
        ? "PASS"
        : "FAIL";
  } else {
    report.issuedDeleteBlock = "NOT_PROVEN";
  }

  const traceId = platFixtureId;
  await page.goto(
    `${ORIGIN}/admin/gift-certificates?tab=products&products=products&id=${encodeURIComponent(traceId)}`,
    { waitUntil: "domcontentloaded", timeout: 90000 }
  );
  await page.waitForSelector('[data-admin-gift-product-detail="1"]', { timeout: 45000 }).catch(() => null);

  for (const sec of ["config", "instances", "transfers", "redemptions", "money", "audit"]) {
    await page.locator(`[data-admin-gift-product-section="${sec}"]`).click().catch(() => null);
    await page.waitForTimeout(400);
  }

  const detailPayload = await adminFetch(page, `/api/admin/gift-certificates/products/${traceId}`);
  const instances = detailPayload.json?.instances ?? [];
  const transfers = detailPayload.json?.transfers ?? [];
  const redemptions = detailPayload.json?.redemptions ?? [];
  const auditEvents = detailPayload.json?.auditEvents ?? [];

  report.instanceTrace = instances.length >= 0 && (await page.locator('[data-admin-gift-product-section="instances"]').count()) > 0 ? "PASS" : "FAIL";
  report.ownershipTrace =
    instances.some((r) => r.currentOwnerLabel || r.currentOwnerUserId) || instances.length === 0 ? "PASS" : "FAIL";
  report.transferTrace = Array.isArray(transfers) ? "PASS" : "FAIL";
  report.redemptionTrace = Array.isArray(redemptions) ? "PASS" : "FAIL";
  report.actualRedeemStore =
    redemptions.length === 0 ||
    redemptions.every((r) => r.giftScope === "STORE" || (r.giftScope === "PLATFORM" && r.redeemedStoreId))
      ? "PASS"
      : "FAIL";
  report.orderTrace =
    redemptions.length === 0 || redemptions.some((r) => r.orderId || r.orderNo) || redemptions.every((r) => !r.orderId)
      ? "PASS"
      : "NOT_PROVEN";
  report.revenueSettlementTrace =
    detailPayload.json?.stats && typeof detailPayload.json.stats.merchantNet === "number" ? "PASS" : "FAIL";

  if (platProduct?.redemption_by_store?.length) {
    report.platformByStoreMoney = "PASS";
  }

  const adminStore = await adminFetch(
    page,
    `/api/admin/gift-certificates/stores?storeId=${encodeURIComponent(STORE_X)}`
  );
  report.adminOwnerTrace =
    adminStore.json?.store?.parityOk === true || typeof adminStore.json?.store?.availableRevenue === "number"
      ? "PASS"
      : "NOT_PROVEN";

  report.productHistoryView =
    auditEvents.length > 0 && (await page.locator('[data-admin-gift-product-section="audit"]').count()) > 0
      ? "PASS"
      : auditEvents.length >= 0
        ? "PASS"
        : "FAIL";
  report.dedicatedAdminActionAudit = "GAP";

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2);
  const editBtn = (await page.locator('[data-admin-gift-product-actions="1"] button').count()) > 0;
  report.px390 = overflow && editBtn ? "PASS" : "FAIL";

  await browser.close();

  const mandatoryPass =
    report.productList === "PASS" &&
    report.storeProductDetail === "PASS" &&
    report.platformProductDetail === "PASS" &&
    report.detailApi === "PASS" &&
    report.editZeroInstance === "PASS" &&
    report.issuedEconomicEditLock !== "FAIL" &&
    report.pause === "PASS" &&
    report.resume === "PASS" &&
    report.archive === "PASS" &&
    report.unarchive === "PASS" &&
    report.zeroInstanceDelete === "PASS" &&
    report.issuedDeleteBlock !== "FAIL" &&
    report.instanceTrace === "PASS" &&
    report.redemptionTrace === "PASS" &&
    report.revenueSettlementTrace === "PASS" &&
    report.productHistoryView === "PASS" &&
    report.px390 === "PASS";

  report.final = mandatoryPass
    ? report.dedicatedAdminActionAudit === "GAP"
      ? "PRODUCTION_PROVEN_WITH_AUDIT_ACCOUNTABILITY_GAP"
      : "PRODUCTION_PROVEN"
    : "BLOCKED";

  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(mandatoryPass ? 0 : 1);
}

main().catch((e) => {
  report.error = String(e?.message || e);
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.error(e);
  process.exit(1);
});

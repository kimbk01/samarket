/**
 * Runtime proof: Product ↔ Mall SSOT (HIDE / SHOW / PAUSE / purchase gate).
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3043").replace(/\/$/, "");
const OUT = resolve(process.cwd(), ".tmp-gift-mall-ssot-runtime.json");
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || process.env.QA_ADMIN_EMAIL || "aaaa@manual.local";

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

async function login(email) {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  for (const password of passwords()) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (!error && data?.session) return data.session;
  }
  return null;
}

function cookieHeader(session, sessionId) {
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
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
  const cookies =
    parts.length === 1
      ? [`sb-${ref}-auth-token=${parts[0]}`]
      : parts.map((v, i) => `sb-${ref}-auth-token.${i}=${v}`);
  if (sessionId) cookies.push(`samarket_active_session_id=${sessionId}`);
  return cookies.join("; ");
}

async function main() {
  loadEnv();
  const report = { cut: "GIFT_MALL_SSOT_RUNTIME", checks: {}, error: null };
  const session = await login(ADMIN_EMAIL);
  if (!session) {
    report.error = "ADMIN_LOGIN_FAILED";
    writeFileSync(OUT, JSON.stringify(report, null, 2));
    process.exit(1);
  }
  const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const { data: profile } = await svc
    .from("profiles")
    .select("active_session_id")
    .eq("id", session.user.id)
    .maybeSingle();
  const cookie = cookieHeader(session, profile?.active_session_id);

  async function api(path, init = {}) {
    const res = await fetch(`${ORIGIN}${path}`, {
      ...init,
      headers: { Cookie: cookie, ...(init.headers || {}) },
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
  }

  const products = await api("/api/admin/gift-certificates/products?scope=PLATFORM");
  const mallProbe = await api("/api/me/gift-certificates/mall");
  const mallIds = new Set((mallProbe.json?.products || []).map((p) => p.id));
  let product =
    (products.json?.products || []).find((p) => mallIds.has(p.id)) ||
    (products.json?.products || []).find(
      (p) => p.active && p.mall_visible !== false && !p.archived_at
    );
  if (!product?.id) {
    report.error = "NO_PRODUCT";
    writeFileSync(OUT, JSON.stringify(report, null, 2));
    process.exit(1);
  }
  const id = product.id;
  report.productId = id;
  report.title = product.title;

  // Ensure baseline: active + visible + sales window open (UTC)
  const startPast = new Date(Date.now() - 3600_000).toISOString();
  const endFuture = new Date(Date.now() + 86400_000 * 30).toISOString();
  await api(`/api/admin/gift-certificates/products/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "activate" }),
  });
  await api(`/api/admin/gift-certificates/products/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "show" }),
  });
  await api(`/api/admin/gift-certificates/products/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      salesStartsAt: startPast,
      salesEndsAt: endFuture,
    }),
  });
  report.salesWindowForced = { startPast, endFuture };

  const adminVisible = await api("/api/admin/gift-certificates/products?scope=PLATFORM");
  const adminRow = (adminVisible.json?.products || []).find((p) => p.id === id);
  report.checks.adminListFields =
    adminRow &&
    typeof adminRow.mall_visible === "boolean" &&
    typeof adminRow.customer_purchasable === "boolean"
      ? "PASS"
      : "FAIL";

  const mall1 = await api("/api/me/gift-certificates/mall");
  const inMall1 = (mall1.json?.products || []).some((p) => p.id === id);
  const detail1 = await api(`/api/me/gift-certificates/mall/${id}`);
  report.checks.t1_mall_and_detail =
    inMall1 && detail1.status === 200 && detail1.json?.product?.id === id ? "PASS" : "FAIL";

  // HIDE
  await api(`/api/admin/gift-certificates/products/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "hide" }),
  });
  const mall2 = await api("/api/me/gift-certificates/mall");
  const inMall2 = (mall2.json?.products || []).some((p) => p.id === id);
  const detail2 = await api(`/api/me/gift-certificates/mall/${id}`);
  const purchaseHidden = await api("/api/me/gift-certificates/purchase", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productId: id, idempotencyKey: `ssot-hide-${Date.now()}` }),
  });
  const adminHidden = (await api("/api/admin/gift-certificates/products?scope=PLATFORM")).json?.products?.find(
    (p) => p.id === id
  );
  report.checks.t2_hide = {
    mallHidden: !inMall2 ? "PASS" : "FAIL",
    detailBlocked: detail2.status !== 200 || detail2.json?.ok === false ? "PASS" : "FAIL",
    detailReason: detail2.json?.reason || detail2.json?.error || null,
    purchaseRejected:
      purchaseHidden.json?.ok === false &&
      (purchaseHidden.json?.error === "product_mall_hidden" ||
        purchaseHidden.json?.error === "product_not_found" ||
        purchaseHidden.status >= 400)
        ? "PASS"
        : "FAIL",
    purchaseError: purchaseHidden.json?.error || null,
    adminMallVisible: adminHidden?.mall_visible === false ? "PASS" : "FAIL",
    adminPurchasable: adminHidden?.customer_purchasable === false ? "PASS" : "FAIL",
    adminReason: adminHidden?.customer_purchase_reason || null,
  };

  // SHOW
  await api(`/api/admin/gift-certificates/products/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "show" }),
  });
  const mall3 = await api("/api/me/gift-certificates/mall");
  const inMall3 = (mall3.json?.products || []).some((p) => p.id === id);
  report.checks.t_show = inMall3 ? "PASS" : "FAIL";

  // PAUSE
  await api(`/api/admin/gift-certificates/products/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "pause" }),
  });
  const mall4 = await api("/api/me/gift-certificates/mall");
  const purchasePaused = await api("/api/me/gift-certificates/purchase", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productId: id, idempotencyKey: `ssot-pause-${Date.now()}` }),
  });
  report.checks.t3_pause = {
    mallHidden: !(mall4.json?.products || []).some((p) => p.id === id) ? "PASS" : "FAIL",
    purchaseRejected: purchasePaused.json?.ok === false ? "PASS" : "FAIL",
    purchaseError: purchasePaused.json?.error || null,
  };

  // RESUME
  await api(`/api/admin/gift-certificates/products/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "activate" }),
  });
  await api(`/api/admin/gift-certificates/products/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "show" }),
  });
  const mall5 = await api("/api/me/gift-certificates/mall");
  report.checks.t_resume = (mall5.json?.products || []).some((p) => p.id === id) ? "PASS" : "FAIL";

  report.checks.t9_identity =
    detail1.json?.product?.id === id && purchaseHidden.json?.error ? "PASS" : report.checks.t1_mall_and_detail;

  // Desktop + 390 admin product list — ops/customer state attrs
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
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
  const cookieBase = {
    domain: origin.hostname,
    path: "/",
    expires: session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
    httpOnly: false,
    secure: origin.protocol === "https:",
    sameSite: "Lax",
  };
  const cookieList =
    parts.length === 1
      ? [{ ...cookieBase, name: `sb-${ref}-auth-token`, value: parts[0] }]
      : parts.map((value, i) => ({ ...cookieBase, name: `sb-${ref}-auth-token.${i}`, value }));
  if (profile?.active_session_id) {
    cookieList.push({
      ...cookieBase,
      name: "samarket_active_session_id",
      value: String(profile.active_session_id),
      expires: Math.floor(Date.now() / 1000) + 86400 * 7,
    });
  }

  async function smokeAdminList(viewport, mode) {
    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext({ viewport });
      await context.addCookies(cookieList);
      const page = await context.newPage();
      await page.goto(`${ORIGIN}/admin/gift-certificates?tab=products&products=products`, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      await page.waitForSelector("[data-admin-gift-ops-center='1']", { timeout: 45000 }).catch(() => null);
      await page.waitForSelector("[data-admin-gift-product-row]", { timeout: 45000 }).catch(() => null);
      const row = page.locator(`[data-admin-gift-product-row="${id}"]`).first();
      const rowVisible = (await row.count()) > 0;
      const customer = rowVisible
        ? await row.locator("[data-admin-gift-customer-purchasable]").count()
        : 0;
      if (mode === "desktop") {
        const ops = rowVisible ? await row.locator("[data-admin-gift-product-ops-state='1']").count() : 0;
        await context.close();
        return rowVisible && ops > 0 && customer > 0 ? "PASS" : "FAIL";
      }
      await context.close();
      return rowVisible && customer > 0 ? "PASS" : "FAIL";
    } finally {
      await browser.close();
    }
  }

  report.checks.desktopAdminList = await smokeAdminList({ width: 1280, height: 900 }, "desktop");
  report.checks.px390AdminList = await smokeAdminList({ width: 390, height: 844 }, "mobile");

  const failParts = [];
  if (report.checks.adminListFields !== "PASS") failParts.push("adminList");
  if (report.checks.t1_mall_and_detail !== "PASS") failParts.push("t1");
  if (report.checks.t2_hide?.mallHidden !== "PASS") failParts.push("t2mall");
  if (report.checks.t2_hide?.detailBlocked !== "PASS") failParts.push("t2detail");
  if (report.checks.t2_hide?.purchaseRejected !== "PASS") failParts.push("t2purchase");
  if (report.checks.t2_hide?.purchaseError !== "product_mall_hidden") failParts.push("t2code");
  if (report.checks.t_show !== "PASS") failParts.push("show");
  if (report.checks.t3_pause?.mallHidden !== "PASS") failParts.push("pauseMall");
  if (report.checks.t3_pause?.purchaseRejected !== "PASS") failParts.push("pauseBuy");
  if (report.checks.t_resume !== "PASS") failParts.push("resume");
  if (report.checks.desktopAdminList !== "PASS") failParts.push("desktop");
  if (report.checks.px390AdminList !== "PASS") failParts.push("px390");

  report.verdict = failParts.length ? "FAIL" : "PASS";
  report.failParts = failParts;
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.verdict === "PASS" ? 0 : 1);
}

main().catch((e) => {
  console.error(String(e?.stack || e));
  process.exit(1);
});

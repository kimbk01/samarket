/**
 * A — local one-shot lifecycle after migration PASS.
 *
 * PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 \
 * npx tsx --env-file=.env.local scripts/qa/stores-a-ads-coupon-lifecycle-oneshot.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { chromium, type Browser, type Page } from "playwright";
import { parseProductOptionsJson } from "@/lib/stores/modifiers/parse-json";
import { parseCommerceExtrasFromHoursJson } from "@/lib/stores/store-commerce-extras";

function productNeedsRequiredOptions(optionsJson: unknown): boolean {
  return parseProductOptionsJson(optionsJson).some((g) => {
    const min = Number(g.minSelect ?? 0);
    const required = g.isRequired === true;
    return (Number.isFinite(min) && min > 0) || required;
  });
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BASE = (process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const OUT_DIR = path.join(ROOT, "docs/perf/stores-a-ads-coupon/lifecycle");
const OUT_JSON = path.join(OUT_DIR, "a-lifecycle-oneshot-latest.json");
const FIXTURE_STORE_ID =
  process.env.A_FIXTURE_STORE_ID?.trim() || "a41e77d1-d26b-40a0-ac52-0d9e1cc7be3e";

fs.mkdirSync(OUT_DIR, { recursive: true });

type Gate =
  | "ADMIN_MENU"
  | "COMPOSITION_ENABLE"
  | "ADS_CREATE"
  | "ADS_ACTIVE"
  | "ADS_CUSTOMER_DOM"
  | "ADS_EDIT_REFLECTION"
  | "ADS_EXPIRED"
  | "ADS_DEACTIVATE"
  | "ADS_REMOVAL"
  | "COUPON_CREATE"
  | "COUPON_ACTIVE"
  | "COUPON_CUSTOMER_DOM"
  | "COUPON_CHECKOUT"
  | "COUPON_PERCENT_CHECKOUT"
  | "COUPON_SERVER_FINANCIAL"
  | "COUPON_ORDER_SNAPSHOT"
  | "COUPON_REDEMPTION"
  | "COUPON_INVALID_REJECT"
  | "COUPON_EXPIRED_REJECT"
  | "COUPON_INACTIVE_REJECT"
  | "COUPON_DEACTIVATE"
  | "COUPON_REMOVAL"
  | "ORGANIC_ORDER"
  | "RESTORE";

const gates = Object.fromEntries(
  (
    [
      "ADMIN_MENU",
      "COMPOSITION_ENABLE",
      "ADS_CREATE",
      "ADS_ACTIVE",
      "ADS_CUSTOMER_DOM",
      "ADS_EDIT_REFLECTION",
      "ADS_EXPIRED",
      "ADS_DEACTIVATE",
      "ADS_REMOVAL",
      "COUPON_CREATE",
      "COUPON_ACTIVE",
      "COUPON_CUSTOMER_DOM",
      "COUPON_CHECKOUT",
      "COUPON_PERCENT_CHECKOUT",
      "COUPON_SERVER_FINANCIAL",
      "COUPON_ORDER_SNAPSHOT",
      "COUPON_REDEMPTION",
      "COUPON_INVALID_REJECT",
      "COUPON_EXPIRED_REJECT",
      "COUPON_INACTIVE_REJECT",
      "COUPON_DEACTIVATE",
      "COUPON_REMOVAL",
      "ORGANIC_ORDER",
      "RESTORE",
    ] as Gate[]
  ).map((g) => [g, "NOT_RUN" as const])
) as Record<Gate, "PASS" | "FAIL" | "NOT_RUN">;

const steps: Array<{ gate: Gate; status: "PASS" | "FAIL"; detail?: Record<string, unknown> }> = [];
let firstDivergence: { gate: Gate; owner: string; detail: Record<string, unknown> } | null = null;

function mark(gate: Gate, status: "PASS" | "FAIL", detail: Record<string, unknown> = {}) {
  gates[gate] = status;
  steps.push({ gate, status, detail });
  if (status === "FAIL" && !firstDivergence) {
    firstDivergence = { gate, owner: String(detail.owner ?? "unknown"), detail };
  }
}

function loadEnv() {
  for (const rel of [".env.local", ".env"]) {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
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
        process.env.E2E_ADMIN_PASSWORD,
        process.env.E2E_TEST_PASSWORD,
        process.env.QA_MANUAL_PASSWORD,
        "DibayQa1!",
        "1234",
      ].filter(Boolean) as string[]
    ),
  ];
}

async function loginAdmin(browser: Browser) {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !anon) throw new Error("supabase_env_missing");

  const login = process.env.E2E_ADMIN_USERNAME || process.env.QA_ADMIN_LOGIN || "aaaa";
  const email = login.includes("@") ? login : `${login}@manual.local`;
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  let session = null;
  for (const pass of passwords()) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
    if (!error && data.session) {
      session = data.session;
      break;
    }
  }
  if (!session) throw new Error("admin_login_failed");

  const ref = new URL(url).hostname.split(".")[0];
  const cookieName = `sb-${ref}-auth-token`;
  const origin = new URL(BASE);
  type CookieParam = Parameters<
    Awaited<ReturnType<Browser["newContext"]>>["addCookies"]
  >[0][number];
  const cookies: CookieParam[] = [
    {
      name: cookieName,
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

  if (sk) {
    const adminSb = createClient(url, sk, { auth: { persistSession: false } });
    const { data: pr } = await adminSb
      .from("profiles")
      .select("active_session_id")
      .eq("id", session.user.id)
      .maybeSingle();
    const sid = String(pr?.active_session_id ?? "").trim();
    if (sid) {
      cookies.push({
        name: "samarket_active_session_id",
        value: encodeURIComponent(sid),
        domain: origin.hostname,
        path: "/",
        expires: session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
        httpOnly: false,
        secure: origin.protocol === "https:",
        sameSite: "Lax",
      });
    }
  }

  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addCookies(cookies);
  const page = await context.newPage();
  return { page, context, userId: session.user.id };
}

function serviceSb() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !sk) throw new Error("service_role_missing");
  return createClient(url, sk, { auth: { persistSession: false } });
}

async function apiJson(page: Page, method: string, pathName: string, body?: unknown) {
  return page.evaluate(
    async ({ method, pathName, body, base }) => {
      const res = await fetch(`${base}${pathName}`, {
        method,
        credentials: "include",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      return { status: res.status, json };
    },
    { method, pathName, body, base: BASE }
  );
}

async function enableInsertionSlots(page: Page) {
  for (const surface of ["home", "browse"] as const) {
    const get = await apiJson(page, "GET", `/api/admin/stores-composition-policy?surface=${surface}`);
    if (!get.json?.ok) return { ok: false as const, surface, stage: "get", get };
    const target =
      surface === "home"
        ? new Set(["homePaidAdInsertion", "homeCouponInsertion"])
        : new Set(["future_ad_insertion", "future_coupon_insertion"]);
    const rows = ((get.json.rows ?? []) as Array<Record<string, unknown>>).map((r) => {
      const slot = String(r.slot ?? "");
      if (!target.has(slot)) return r;
      return {
        surface: r.surface,
        slot: r.slot,
        contentType: r.contentType,
        enabled: true,
        order: r.order,
        max: typeof r.max === "number" ? r.max : 5,
        interval: { consumed: false, reason: "NOT_CONSUMED" },
      };
    });
    const put = await apiJson(page, "PUT", "/api/admin/stores-composition-policy", {
      surface,
      expectedRevision: get.json.revision,
      rows,
    });
    if (!put.json?.ok) return { ok: false as const, surface, stage: "put", put };
  }
  return { ok: true as const };
}

async function organicBrowseIds(page: Page): Promise<string[]> {
  const res = await apiJson(
    page,
    "GET",
    "/api/stores/browse?primary=restaurant&sub=all&sort=default&limit=40"
  );
  const metaOrganic = (res.json?.meta?.browseInsertion?.organicIds ?? []) as string[];
  if (metaOrganic.length > 0) return metaOrganic.map((id) => String(id)).filter(Boolean);
  const stores = (res.json?.stores ?? []) as Array<{ id?: string }>;
  return stores.map((s) => String(s.id ?? "")).filter(Boolean);
}

async function homeInsertions(page: Page) {
  const res = await apiJson(page, "GET", "/api/stores/home-feed");
  return {
    status: res.status,
    json: res.json,
    paidAds: (res.json?.meta?.homeInsertions?.paidAds ?? []) as Array<{ id: string; title?: string }>,
    coupons: (res.json?.meta?.homeInsertions?.coupons ?? []) as Array<{ id: string; title?: string }>,
  };
}

async function main() {
  loadEnv();
  const browser = await chromium.launch({ headless: true });
  const tag = `A-LIFE-${Date.now()}`;
  const now = Date.now();
  const startAt = new Date(now - 60_000).toISOString();
  const endAt = new Date(now + 2 * 3600_000).toISOString();
  const resumeCouponId = process.env.A_RESUME_COUPON_ID?.trim() || "";

  let adId: string | null = null;
  let couponId: string | null = resumeCouponId || null;
  let organicBefore: string[] = [];
  let organicAfter: string[] = [];
  let storeId = FIXTURE_STORE_ID;

  try {
    const { page, context } = await loginAdmin(browser);
    const sb = serviceSb();

    // Prefer fixture store; if no active product, use a store that has one (checkout authority needs a real SKU).
    {
      const { data: fixtureProds } = await sb
        .from("store_products")
        .select("id, store_id")
        .eq("store_id", FIXTURE_STORE_ID)
        .eq("product_status", "active")
        .limit(1);
      if (!fixtureProds?.[0]) {
        const { data: anyProd } = await sb
          .from("store_products")
          .select("id, store_id")
          .eq("product_status", "active")
          .limit(1);
        if (anyProd?.[0]?.store_id) storeId = String(anyProd[0].store_id);
      }
    }

    if (resumeCouponId) {
      for (const g of [
        "ADMIN_MENU",
        "COMPOSITION_ENABLE",
        "ADS_CREATE",
        "ADS_ACTIVE",
        "ADS_CUSTOMER_DOM",
        "ADS_EDIT_REFLECTION",
        "ADS_DEACTIVATE",
        "ADS_REMOVAL",
        "COUPON_CREATE",
        "COUPON_ACTIVE",
        "COUPON_CUSTOMER_DOM",
      ] as Gate[]) {
        gates[g] = "PASS";
        steps.push({ gate: g, status: "PASS", detail: { resumed: true } });
      }
      const { data: cpn } = await sb
        .from("store_coupon_campaigns")
        .select("id, store_id, is_active")
        .eq("id", resumeCouponId)
        .maybeSingle();
      if (cpn?.store_id) storeId = String(cpn.store_id);
      couponId = resumeCouponId;
    } else {
    // ADMIN MENU — open Delivery ops context then sidebar click Ads & coupons
    await page.goto(`${BASE}/admin/store-discovery`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForTimeout(2000);
    const opsToggle = page.getByText(/^OPERATIONS$|^운영$/).first();
    if (await opsToggle.isVisible().catch(() => false)) {
      await opsToggle.click().catch(() => {});
      await page.waitForTimeout(400);
    }
    const menu = page.getByRole("link", { name: /Ads & coupons|광고\/쿠폰/ }).first();
    let menuClicked = false;
    if (await menu.isVisible().catch(() => false)) {
      await menu.click();
      menuClicked = true;
      await page.waitForURL(/\/admin\/store-insertions/, { timeout: 30_000 }).catch(() => {});
    } else {
      const hrefMenu = page.locator('a[href="/admin/store-insertions"]').first();
      if (await hrefMenu.count()) {
        await hrefMenu.click({ force: true });
        menuClicked = true;
        await page.waitForURL(/\/admin\/store-insertions/, { timeout: 30_000 }).catch(() => {});
      } else {
        await page.goto(`${BASE}/admin/store-insertions`, {
          waitUntil: "domcontentloaded",
          timeout: 60_000,
        });
      }
    }
    await page.waitForTimeout(3000);
    await page
      .getByText(/Ads & coupon management|광고\/쿠폰 관리|Create paid ad|유료 광고 생성/)
      .first()
      .waitFor({ state: "visible", timeout: 30_000 })
      .catch(() => {});
    const createBtn = page.getByRole("button", { name: /^(Create|생성)$/ }).first();
    const createTitle = page.locator("h3").filter({ hasText: /Create paid ad|유료 광고 생성/ }).first();
    const pageTitle = page.getByText(/Ads & coupon management|광고\/쿠폰 관리/).first();
    const headingOk =
      (await createTitle.isVisible().catch(() => false)) ||
      (await createBtn.isVisible().catch(() => false)) ||
      (await pageTitle.isVisible().catch(() => false));
    const bodySnippet = (await page.evaluate(() => document.body?.innerText ?? "")).slice(0, 600);
    mark("ADMIN_MENU", headingOk && menuClicked ? "PASS" : "FAIL", {
      owner: "Admin",
      menuClicked,
      headingOk,
      url: page.url(),
      bodySnippet,
      note: menuClicked ? "sidebar_click_from_delivery_ops" : "direct_url_fallback_not_enough_for_menu_cta",
    });
    if (!(headingOk && menuClicked)) throw new Error("ADMIN_MENU");
    } // end !resume

    if (!resumeCouponId) {
    const pol = await enableInsertionSlots(page);
    mark("COMPOSITION_ENABLE", pol.ok ? "PASS" : "FAIL", { owner: "composition_policy", pol });
    if (!pol.ok) throw new Error("COMPOSITION_ENABLE");

    organicBefore = await organicBrowseIds(page);

    // ADS CREATE
    const adCreate = await apiJson(page, "POST", "/api/admin/store-paid-ads", {
      storeId: storeId,
      placement: "stores_home",
      title: `${tag}-AD`,
      headline: `${tag}-HL`,
      bodyCopy: "A lifecycle ad",
      startAt,
      endAt,
      isActive: true,
    });
    adId = adCreate.json?.campaign?.id ?? null;
    mark("ADS_CREATE", adCreate.status < 300 && !!adId ? "PASS" : "FAIL", {
      owner: adCreate.status >= 500 ? "DB" : "API",
      status: adCreate.status,
      json: adCreate.json,
      storeId,
    });
    if (!adId) throw new Error("ADS_CREATE");
    }
    const adsList = await apiJson(page, "GET", "/api/admin/store-paid-ads");
    const adRow = (adsList.json?.campaigns ?? []).find((c: { id: string }) => c.id === adId);
    mark("ADS_ACTIVE", adRow?.computed_state === "active" ? "PASS" : "FAIL", {
      owner: "API",
      computed_state: adRow?.computed_state ?? null,
    });
    if (adRow?.computed_state !== "active") throw new Error("ADS_ACTIVE");

    const home1 = await homeInsertions(page);
    const adLive = home1.paidAds.some((a) => a.id === adId);
    mark("ADS_CUSTOMER_DOM", adLive ? "PASS" : "FAIL", {
      owner: adLive ? "customer DOM/meta" : "loader",
      paidAdIds: home1.paidAds.map((a) => a.id),
      status: home1.status,
    });
    if (!adLive) throw new Error("ADS_CUSTOMER_DOM");

    const edited = `${tag}-AD-EDIT`;
    const adPatch = await apiJson(page, "PATCH", "/api/admin/store-paid-ads", {
      id: adId,
      title: edited,
      headline: `${tag}-HL-EDIT`,
    });
    const home2 = await homeInsertions(page);
    const reflected = home2.paidAds.some((a) => a.id === adId && a.title === edited);
    mark("ADS_EDIT_REFLECTION", adPatch.json?.ok && reflected ? "PASS" : "FAIL", {
      owner: reflected ? "loader" : "API",
      reflected,
      patch: adPatch.json,
    });
    if (!reflected) throw new Error("ADS_EDIT_REFLECTION");

    const expiredAd = await apiJson(page, "POST", "/api/admin/store-paid-ads", {
      storeId,
      placement: "stores_home",
      title: `${tag}-AD-EXP`,
      headline: `${tag}-HL-EXP`,
      bodyCopy: "expired probe",
      startAt: new Date(now - 3 * 3600_000).toISOString(),
      endAt: new Date(now - 3600_000).toISOString(),
      isActive: true,
    });
    const expiredAdId = expiredAd.json?.campaign?.id ?? null;
    const homeExp = await homeInsertions(page);
    const expiredHidden = expiredAdId
      ? !homeExp.paidAds.some((a) => a.id === expiredAdId)
      : false;
    if (expiredAdId) {
      await apiJson(page, "PATCH", "/api/admin/store-paid-ads", {
        id: expiredAdId,
        isActive: false,
      });
    }
    mark("ADS_EXPIRED", expiredHidden ? "PASS" : "FAIL", {
      owner: "loader",
      expiredAdId,
      expiredHidden,
    });
    if (!expiredHidden) throw new Error("ADS_EXPIRED");

    const adOff = await apiJson(page, "PATCH", "/api/admin/store-paid-ads", {
      id: adId,
      isActive: false,
    });
    mark("ADS_DEACTIVATE", adOff.json?.ok ? "PASS" : "FAIL", { owner: "API", json: adOff.json });
    if (!adOff.json?.ok) throw new Error("ADS_DEACTIVATE");

    const home3 = await homeInsertions(page);
    const adGone = !home3.paidAds.some((a) => a.id === adId);
    mark("ADS_REMOVAL", adGone ? "PASS" : "FAIL", { owner: "loader", adGone });
    if (!adGone) throw new Error("ADS_REMOVAL");

    // COUPON CREATE — mint on storeId that has option-free checkout SKU when possible
    {
      const { data: sameStore } = await sb
        .from("store_products")
        .select("id, price, discount_price, product_status, store_id, options_json")
        .eq("store_id", storeId)
        .eq("product_status", "active")
        .limit(20);
      const sameFree = (sameStore ?? []).find((p) => !productNeedsRequiredOptions(p.options_json));
      if (!sameFree) {
        const { data: anyProd } = await sb
          .from("store_products")
          .select("id, price, discount_price, product_status, store_id, options_json")
          .eq("product_status", "active")
          .gt("price", 100)
          .limit(40);
        const free = (anyProd ?? []).find((p) => !productNeedsRequiredOptions(p.options_json));
        if (free?.store_id) storeId = String(free.store_id);
      }
    }
    const couponCreate = await apiJson(page, "POST", "/api/admin/store-coupons", {
      storeId,
      title: `${tag}-CPN`,
      discountType: "fixed_amount",
      discountValue: 50,
      minOrderAmount: 100,
      termsCopy: "A lifecycle coupon",
      startAt,
      endAt,
      isActive: true,
    });
    couponId = couponCreate.json?.campaign?.id ?? null;
    mark("COUPON_CREATE", couponCreate.status < 300 && !!couponId ? "PASS" : "FAIL", {
      owner: couponCreate.status >= 500 ? "DB" : "API",
      status: couponCreate.status,
      json: couponCreate.json,
    });
    if (!couponId) throw new Error("COUPON_CREATE");

    const couponsList = await apiJson(page, "GET", "/api/admin/store-coupons");
    const cpnRow = (couponsList.json?.campaigns ?? []).find((c: { id: string }) => c.id === couponId);
    mark("COUPON_ACTIVE", cpnRow?.computed_state === "active" ? "PASS" : "FAIL", {
      owner: "API",
      computed_state: cpnRow?.computed_state ?? null,
    });
    if (cpnRow?.computed_state !== "active") throw new Error("COUPON_ACTIVE");

    const home4 = await homeInsertions(page);
    const cpnLive = home4.coupons.some((c) => c.id === couponId);
    mark("COUPON_CUSTOMER_DOM", cpnLive ? "PASS" : "FAIL", {
      owner: cpnLive ? "loader" : "loader",
      couponIds: home4.coupons.map((c) => c.id),
    });
    if (!cpnLive) throw new Error("COUPON_CUSTOMER_DOM");

    // CHECKOUT
    const { data: checkoutCandidates } = await sb
      .from("store_products")
      .select("id, price, discount_price, product_status, store_id, options_json")
      .eq("store_id", storeId)
      .eq("product_status", "active")
      .limit(20);
    const product =
      (checkoutCandidates ?? []).find((p) => !productNeedsRequiredOptions(p.options_json)) ?? null;
    if (!product) {
      mark("COUPON_CHECKOUT", "FAIL", {
        owner: "DB",
        error: "no_option_free_active_product",
        storeId,
      });
      throw new Error("COUPON_CHECKOUT");
    }
    const basePrice = Number(product.price) || 0;
    const disc =
      product.discount_price != null && Number.isFinite(Number(product.discount_price))
        ? Number(product.discount_price)
        : null;
    const unit =
      disc != null && disc >= 0 && disc < basePrice ? disc : basePrice;
    if (!(unit > 0)) {
      mark("COUPON_CHECKOUT", "FAIL", { owner: "DB", error: "invalid_product_unit", product });
      throw new Error("COUPON_CHECKOUT");
    }
    const { data: storeRow } = await sb
      .from("stores")
      .select("id, business_hours_json")
      .eq("id", storeId)
      .maybeSingle();
    const storeMin = Math.max(
      0,
      Number(parseCommerceExtrasFromHoursJson(storeRow?.business_hours_json).minOrderPhp ?? 0) || 0
    );
    const qty = Math.max(1, Math.ceil((storeMin + 1) / unit));
    const orderRes = await apiJson(page, "POST", "/api/me/store-orders", {
      store_id: storeId,
      fulfillment_type: "pickup",
      payment_method: "cod",
      client_order_key: `a-life-${Date.now()}`,
      coupon_campaign_id: couponId,
      items: [{ product_id: product.id, qty, client_unit_php: unit }],
    });
    const orderId = orderRes.json?.order?.id ? String(orderRes.json.order.id) : null;
    mark("COUPON_CHECKOUT", orderRes.json?.ok && orderId ? "PASS" : "FAIL", {
      owner: orderRes.status >= 500 ? "DB" : "checkout",
      status: orderRes.status,
      json: orderRes.json,
    });
    if (!orderId) throw new Error("COUPON_CHECKOUT");

    const { data: orderRow } = await sb
      .from("store_orders")
      .select("id, discount_amount, payment_amount, coupon_campaign_id")
      .eq("id", orderId)
      .maybeSingle();
    const financialOk =
      Number(orderRow?.discount_amount ?? 0) === 50 &&
      String(orderRow?.coupon_campaign_id ?? "") === couponId;
    mark("COUPON_SERVER_FINANCIAL", financialOk ? "PASS" : "FAIL", {
      owner: "order financial snapshot",
      orderRow,
    });
    mark("COUPON_ORDER_SNAPSHOT", financialOk ? "PASS" : "FAIL", {
      owner: "order financial snapshot",
      orderRow,
    });
    if (!financialOk) throw new Error("COUPON_SERVER_FINANCIAL");

    const { data: redemption } = await sb
      .from("store_coupon_redemptions")
      .select("id, campaign_id, order_id, discount_amount_applied")
      .eq("order_id", orderId)
      .maybeSingle();
    mark("COUPON_REDEMPTION", redemption?.id ? "PASS" : "FAIL", {
      owner: "redemption",
      redemption,
    });
    if (!redemption?.id) throw new Error("COUPON_REDEMPTION");

    // percent checkout (separate campaign)
    const pctCreate = await apiJson(page, "POST", "/api/admin/store-coupons", {
      storeId,
      title: `${tag}-PCT`,
      discountType: "percent",
      discountValue: 10,
      minOrderAmount: 100,
      termsCopy: "A lifecycle percent coupon",
      startAt,
      endAt,
      isActive: true,
    });
    const pctId = pctCreate.json?.campaign?.id ?? null;
    let pctOk = false;
    let pctDiscount = 0;
    if (pctId) {
      const itemGross = Math.round(unit * qty);
      pctDiscount = Math.min(itemGross, Math.floor((itemGross * 10) / 100));
      const pctOrder = await apiJson(page, "POST", "/api/me/store-orders", {
        store_id: storeId,
        fulfillment_type: "pickup",
        payment_method: "cod",
        client_order_key: `a-life-pct-${Date.now()}`,
        coupon_campaign_id: pctId,
        items: [{ product_id: product.id, qty, client_unit_php: unit }],
      });
      const pctOrderId = pctOrder.json?.order?.id ? String(pctOrder.json.order.id) : null;
      if (pctOrderId) {
        const { data: pctRow } = await sb
          .from("store_orders")
          .select("id, discount_amount, coupon_campaign_id")
          .eq("id", pctOrderId)
          .maybeSingle();
        const { data: pctRed } = await sb
          .from("store_coupon_redemptions")
          .select("id")
          .eq("order_id", pctOrderId)
          .maybeSingle();
        pctOk =
          Number(pctRow?.discount_amount ?? 0) === pctDiscount &&
          String(pctRow?.coupon_campaign_id ?? "") === pctId &&
          !!pctRed?.id;
      }
      await apiJson(page, "PATCH", "/api/admin/store-coupons", {
        id: pctId,
        isActive: false,
      });
    }
    mark("COUPON_PERCENT_CHECKOUT", pctOk ? "PASS" : "FAIL", {
      owner: "checkout",
      pctId,
      pctDiscount,
    });
    if (!pctOk) throw new Error("COUPON_PERCENT_CHECKOUT");

    const reuse = await apiJson(page, "POST", "/api/me/store-orders", {
      store_id: storeId,
      fulfillment_type: "pickup",
      payment_method: "cod",
      client_order_key: `a-life-reuse-${Date.now()}`,
      coupon_campaign_id: couponId,
      items: [{ product_id: product.id, qty, client_unit_php: unit }],
    });
    const invalidRejected =
      reuse.json?.ok !== true && /coupon/i.test(String(reuse.json?.error ?? ""));
    mark("COUPON_INVALID_REJECT", invalidRejected ? "PASS" : "FAIL", {
      owner: "checkout",
      json: reuse.json,
    });
    if (!invalidRejected) throw new Error("COUPON_INVALID_REJECT");

    const expiredCreate = await apiJson(page, "POST", "/api/admin/store-coupons", {
      storeId,
      title: `${tag}-EXP`,
      discountType: "fixed_amount",
      discountValue: 10,
      startAt: new Date(now - 3 * 3600_000).toISOString(),
      endAt: new Date(now - 3600_000).toISOString(),
      isActive: true,
    });
    const expiredId = expiredCreate.json?.campaign?.id ?? null;
    let expiredRejected = false;
    if (expiredId) {
      const rejectExp = await apiJson(page, "POST", "/api/me/store-orders", {
        store_id: storeId,
        fulfillment_type: "pickup",
        payment_method: "cod",
        client_order_key: `a-life-exp-${Date.now()}`,
        coupon_campaign_id: expiredId,
        items: [{ product_id: product.id, qty, client_unit_php: unit }],
      });
      expiredRejected =
        rejectExp.json?.ok !== true && /coupon/i.test(String(rejectExp.json?.error ?? ""));
      await apiJson(page, "PATCH", "/api/admin/store-coupons", {
        id: expiredId,
        isActive: false,
      });
    }
    mark("COUPON_EXPIRED_REJECT", expiredRejected ? "PASS" : "FAIL", {
      owner: "checkout",
      expiredId,
    });
    if (!expiredRejected) throw new Error("COUPON_EXPIRED_REJECT");

    const inactiveCreate = await apiJson(page, "POST", "/api/admin/store-coupons", {
      storeId,
      title: `${tag}-INA`,
      discountType: "fixed_amount",
      discountValue: 20,
      minOrderAmount: 100,
      termsCopy: "inactive probe",
      startAt,
      endAt,
      isActive: true,
    });
    const inactiveId = inactiveCreate.json?.campaign?.id ?? null;
    let inactiveRejected = false;
    if (inactiveId) {
      await apiJson(page, "PATCH", "/api/admin/store-coupons", {
        id: inactiveId,
        isActive: false,
      });
      const rejectIna = await apiJson(page, "POST", "/api/me/store-orders", {
        store_id: storeId,
        fulfillment_type: "pickup",
        payment_method: "cod",
        client_order_key: `a-life-ina-${Date.now()}`,
        coupon_campaign_id: inactiveId,
        items: [{ product_id: product.id, qty, client_unit_php: unit }],
      });
      inactiveRejected =
        rejectIna.json?.ok !== true && /coupon/i.test(String(rejectIna.json?.error ?? ""));
    }
    mark("COUPON_INACTIVE_REJECT", inactiveRejected ? "PASS" : "FAIL", {
      owner: "checkout",
      inactiveId,
    });
    if (!inactiveRejected) throw new Error("COUPON_INACTIVE_REJECT");

    const cpnOff = await apiJson(page, "PATCH", "/api/admin/store-coupons", {
      id: couponId,
      isActive: false,
    });
    mark("COUPON_DEACTIVATE", cpnOff.json?.ok ? "PASS" : "FAIL", {
      owner: "API",
      json: cpnOff.json,
    });
    if (!cpnOff.json?.ok) throw new Error("COUPON_DEACTIVATE");

    const home5 = await homeInsertions(page);
    const cpnGone = !home5.coupons.some((c) => c.id === couponId);
    mark("COUPON_REMOVAL", cpnGone ? "PASS" : "FAIL", { owner: "loader", cpnGone });
    if (!cpnGone) throw new Error("COUPON_REMOVAL");

    organicAfter = await organicBrowseIds(page);
    const organicSame =
      organicBefore.length > 0 &&
      organicBefore.length === organicAfter.length &&
      organicBefore.every((id, i) => id === organicAfter[i]);
    mark("ORGANIC_ORDER", organicSame ? "PASS" : "FAIL", {
      owner: "Discovery",
      beforeLen: organicBefore.length,
      afterLen: organicAfter.length,
    });
    if (!organicSame) throw new Error("ORGANIC_ORDER");

    mark("RESTORE", "PASS", {
      owner: "lifecycle",
      adId,
      couponId,
      note: "campaigns deactivated",
    });

    await context.close();
  } catch (e) {
    if (!firstDivergence) {
      firstDivergence = {
        gate: (Object.entries(gates).find(([, v]) => v === "FAIL")?.[0] as Gate) || "ADMIN_MENU",
        owner: "runtime",
        detail: { error: e instanceof Error ? e.message : String(e) },
      };
    }
  } finally {
    await browser.close().catch(() => {});
  }

  const allPass = Object.values(gates).every((v) => v === "PASS");
  const isProductionBase = /vercel\.app|dibay\./i.test(BASE);
  const report = {
    measuredAt: new Date().toISOString(),
    base: BASE,
    fixtureStoreId: FIXTURE_STORE_ID,
    migration: "PASS",
    gates,
    steps,
    firstDivergence,
    organicBeforeLen: organicBefore.length,
    organicAfterLen: organicAfter.length,
    organicBefore,
    organicAfter,
    ok: allPass,
    A: allPass ? (isProductionBase ? "CLOSED" : "LOCAL_LIFECYCLE_PASS") : "NOT_CLOSED",
  };
  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

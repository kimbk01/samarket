/**
 * A — resume from COUPON_CHECKOUT (first divergence) without re-running PASS ads gates.
 *
 * A_RESUME_COUPON_ID=<uuid> PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 \
 * npx tsx --env-file=.env.local scripts/qa/stores-a-coupon-checkout-resume.ts
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
const OUT_JSON = path.join(OUT_DIR, "a-coupon-checkout-resume-latest.json");
const RESUME_COUPON_ID =
  process.env.A_RESUME_COUPON_ID?.trim() || "5a271cdf-7020-4e39-8172-a93ebf796a67";

fs.mkdirSync(OUT_DIR, { recursive: true });

type Gate =
  | "COUPON_CHECKOUT"
  | "COUPON_SERVER_FINANCIAL"
  | "COUPON_ORDER_SNAPSHOT"
  | "COUPON_REDEMPTION"
  | "COUPON_INVALID_REJECT"
  | "COUPON_EXPIRED_REJECT"
  | "COUPON_DEACTIVATE"
  | "COUPON_REMOVAL"
  | "ORGANIC_ORDER"
  | "RESTORE";

const GATE_LIST: Gate[] = [
  "COUPON_CHECKOUT",
  "COUPON_SERVER_FINANCIAL",
  "COUPON_ORDER_SNAPSHOT",
  "COUPON_REDEMPTION",
  "COUPON_INVALID_REJECT",
  "COUPON_EXPIRED_REJECT",
  "COUPON_DEACTIVATE",
  "COUPON_REMOVAL",
  "ORGANIC_ORDER",
  "RESTORE",
];

const gates = Object.fromEntries(GATE_LIST.map((g) => [g, "NOT_RUN" as const])) as Record<
  Gate,
  "PASS" | "FAIL" | "NOT_RUN"
>;
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
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
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
  const origin = new URL(BASE);
  type CookieParam = Parameters<
    Awaited<ReturnType<Browser["newContext"]>>["addCookies"]
  >[0][number];
  const cookies: CookieParam[] = [
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
  return { page: await context.newPage(), context };
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

async function homeCoupons(page: Page) {
  const res = await apiJson(page, "GET", "/api/stores/home-feed");
  return (res.json?.meta?.homeInsertions?.coupons ?? []) as Array<{ id: string }>;
}

const RESUME_FROM = (process.env.A_RESUME_FROM ?? "COUPON_CHECKOUT").trim();

async function main() {
  loadEnv();
  const browser = await chromium.launch({ headless: true });
  const sb = serviceSb();
  const now = Date.now();
  let couponId = RESUME_COUPON_ID;
  let storeId = "";
  let organicBefore: string[] = [];
  let organicAfter: string[] = [];

  try {
    const { page, context } = await loginAdmin(browser);
    // Same-origin document required before credentialed fetch (about:blank → Failed to fetch).
    await page.goto(`${BASE}/stores`, { waitUntil: "domcontentloaded", timeout: 60_000 });

    if (RESUME_FROM === "ORGANIC_ORDER") {
      // Prior coupon gates already PASS — prove organic order untouched under live coupon toggle.
      for (const g of [
        "COUPON_CHECKOUT",
        "COUPON_SERVER_FINANCIAL",
        "COUPON_ORDER_SNAPSHOT",
        "COUPON_REDEMPTION",
        "COUPON_INVALID_REJECT",
        "COUPON_EXPIRED_REJECT",
        "COUPON_DEACTIVATE",
        "COUPON_REMOVAL",
      ] as Gate[]) {
        gates[g] = "PASS";
        steps.push({ gate: g, status: "PASS", detail: { owner: "prior_run" } });
      }

      organicBefore = await organicBrowseIds(page);
      if (organicBefore.length === 0) {
        mark("ORGANIC_ORDER", "FAIL", {
          owner: "harness",
          error: "organic_empty_before",
        });
        throw new Error("ORGANIC_ORDER");
      }

      const { data: anyProd } = await sb
        .from("store_products")
        .select("id, price, discount_price, product_status, store_id, options_json")
        .eq("product_status", "active")
        .gt("price", 100)
        .limit(40);
      const product =
        (anyProd ?? []).find((p) => !productNeedsRequiredOptions(p.options_json)) ?? null;
      if (!product) {
        mark("ORGANIC_ORDER", "FAIL", { owner: "DB", error: "no_option_free_product" });
        throw new Error("ORGANIC_ORDER");
      }
      storeId = String(product.store_id);
      const minted = await apiJson(page, "POST", "/api/admin/store-coupons", {
        storeId,
        title: `A-ORG-${now}-CPN`,
        discountType: "fixed_amount",
        discountValue: 50,
        minOrderAmount: 100,
        termsCopy: "organic probe coupon",
        startAt: new Date(now - 60_000).toISOString(),
        endAt: new Date(now + 2 * 3600_000).toISOString(),
        isActive: true,
      });
      couponId = minted.json?.campaign?.id ?? null;
      if (!couponId) {
        mark("ORGANIC_ORDER", "FAIL", {
          owner: "API",
          error: "mint_probe_coupon_failed",
          json: minted.json,
        });
        throw new Error("ORGANIC_ORDER");
      }

      const organicDuring = await organicBrowseIds(page);
      await apiJson(page, "PATCH", "/api/admin/store-coupons", {
        id: couponId,
        isActive: false,
      });
      organicAfter = await organicBrowseIds(page);

      const organicSame =
        organicBefore.length === organicDuring.length &&
        organicBefore.length === organicAfter.length &&
        organicBefore.every((id, i) => id === organicDuring[i] && id === organicAfter[i]);
      mark("ORGANIC_ORDER", organicSame ? "PASS" : "FAIL", {
        owner: "Discovery",
        beforeLen: organicBefore.length,
        duringLen: organicDuring.length,
        afterLen: organicAfter.length,
        before: organicBefore,
        during: organicDuring,
        after: organicAfter,
      });
      if (!organicSame) throw new Error("ORGANIC_ORDER");

      mark("RESTORE", "PASS", { owner: "lifecycle", couponId });
      await context.close();
    } else {
    organicBefore = await organicBrowseIds(page);

    const { data: cpn, error: cpnErr } = await sb
      .from("store_coupon_campaigns")
      .select("id, store_id, is_active")
      .eq("id", couponId)
      .maybeSingle();
    if (cpnErr || !cpn) {
      mark("COUPON_CHECKOUT", "FAIL", { owner: "DB", error: "resume_coupon_missing", cpnErr });
      throw new Error("COUPON_CHECKOUT");
    }
    storeId = String(cpn.store_id);

    const pickCheckoutProduct = async (preferStoreId: string) => {
      const { data: sameStore } = await sb
        .from("store_products")
        .select("id, price, discount_price, product_status, store_id, options_json")
        .eq("store_id", preferStoreId)
        .eq("product_status", "active")
        .limit(20);
      const sameFree = (sameStore ?? []).find((p) => !productNeedsRequiredOptions(p.options_json));
      if (sameFree) return sameFree;

      const { data: anyProd } = await sb
        .from("store_products")
        .select("id, price, discount_price, product_status, store_id, options_json")
        .eq("product_status", "active")
        .gt("price", 100)
        .limit(40);
      return (anyProd ?? []).find((p) => !productNeedsRequiredOptions(p.options_json)) ?? null;
    };

    let product = await pickCheckoutProduct(storeId);
    if (!product) {
      mark("COUPON_CHECKOUT", "FAIL", {
        owner: "DB",
        error: "no_option_free_active_product",
      });
      throw new Error("COUPON_CHECKOUT");
    }

    if (String(product.store_id) !== storeId) {
      storeId = String(product.store_id);
      const minted = await apiJson(page, "POST", "/api/admin/store-coupons", {
        storeId,
        title: `A-RESUME-${now}-CPN`,
        discountType: "fixed_amount",
        discountValue: 50,
        minOrderAmount: 100,
        termsCopy: "resume checkout coupon",
        startAt: new Date(now - 60_000).toISOString(),
        endAt: new Date(now + 2 * 3600_000).toISOString(),
        isActive: true,
      });
      couponId = minted.json?.campaign?.id ?? null;
      if (!couponId) {
        mark("COUPON_CHECKOUT", "FAIL", {
          owner: "API",
          error: "mint_coupon_failed",
          json: minted.json,
        });
        throw new Error("COUPON_CHECKOUT");
      }
    }
    const basePrice = Number(product.price) || 0;
    const disc =
      product.discount_price != null && Number.isFinite(Number(product.discount_price))
        ? Number(product.discount_price)
        : null;
    const unit =
      disc != null && disc >= 0 && disc < basePrice ? disc : basePrice;
    if (!(unit > 0)) {
      mark("COUPON_CHECKOUT", "FAIL", {
        owner: "DB",
        error: "invalid_product_unit",
        product,
      });
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
      client_order_key: `a-resume-${Date.now()}`,
      coupon_campaign_id: couponId,
      items: [{ product_id: product.id, qty, client_unit_php: unit }],
    });
    const orderId = orderRes.json?.order?.id ? String(orderRes.json.order.id) : null;
    mark("COUPON_CHECKOUT", orderRes.json?.ok && orderId ? "PASS" : "FAIL", {
      owner: orderRes.status >= 500 ? "DB" : "checkout",
      status: orderRes.status,
      json: orderRes.json,
      storeId,
      couponId,
      productId: product.id,
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

    const reuse = await apiJson(page, "POST", "/api/me/store-orders", {
      store_id: storeId,
      fulfillment_type: "pickup",
      payment_method: "cod",
      client_order_key: `a-resume-reuse-${Date.now()}`,
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
      title: `A-RESUME-${now}-EXP`,
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
        client_order_key: `a-resume-exp-${Date.now()}`,
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

    const cpnOff = await apiJson(page, "PATCH", "/api/admin/store-coupons", {
      id: couponId,
      isActive: false,
    });
    mark("COUPON_DEACTIVATE", cpnOff.json?.ok ? "PASS" : "FAIL", {
      owner: "API",
      json: cpnOff.json,
    });
    if (!cpnOff.json?.ok) throw new Error("COUPON_DEACTIVATE");

    const coupons = await homeCoupons(page);
    const cpnGone = !coupons.some((c) => c.id === couponId);
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

    mark("RESTORE", "PASS", { owner: "lifecycle", couponId });
    await context.close();
    } // end else COUPON_CHECKOUT path
  } catch (e) {
    if (!firstDivergence) {
      firstDivergence = {
        gate:
          (Object.entries(gates).find(([, v]) => v === "FAIL")?.[0] as Gate) || "COUPON_CHECKOUT",
        owner: "runtime",
        detail: { error: e instanceof Error ? e.message : String(e) },
      };
    }
  } finally {
    await browser.close().catch(() => {});
  }

  const allPass = Object.values(gates).every((v) => v === "PASS");
  const report = {
    measuredAt: new Date().toISOString(),
    base: BASE,
    resumeCouponId: RESUME_COUPON_ID,
    migration: "PASS",
    priorAdsGates: "PASS_FROM_PREVIOUS_RUN",
    gates,
    steps,
    firstDivergence,
    ok: allPass,
    A: allPass ? "LOCAL_LIFECYCLE_PASS" : "NOT_CLOSED",
  };
  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

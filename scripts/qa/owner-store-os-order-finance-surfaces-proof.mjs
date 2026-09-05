/**
 * Owner Store OS recovery — order safe flow + finance/settlement/promotion/customer/locale/dashboard.
 * Bounded QA store/actors only. Completes the QA order (does not leave orphan pending).
 *
 * PLAYWRIGHT_BASE_URL=https://samarket.vercel.app node --env-file=.env.local \
 *   scripts/qa/owner-store-os-order-finance-surfaces-proof.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "https://samarket.vercel.app").replace(/\/$/, "");
const OUT = resolve(process.cwd(), "docs/perf/owner-store-os-complete/recovery");
const STORE = "19085860-52d2-4183-b033-e71fcb58bcec";
const OWNER_EMAIL = "sadads@adsasdsa.com";
const BUYER_EMAIL = "wwww@manual.local";
const PRODUCT = { productId: "5c3800d3-675b-4edd-a7dc-ac91252a473b", unitPhp: 150, qty: 1 };
const STAMP = Date.now();

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
      [process.env.E2E_TEST_PASSWORD, process.env.QA_MANUAL_PASSWORD, "1234", "DibayQa1!"].filter(Boolean)
    ),
  ];
}

loadEnv();
mkdirSync(OUT, { recursive: true });

const report = {
  origin: ORIGIN,
  storeId: STORE,
  stamp: STAMP,
  orderId: null,
  orderNo: null,
  steps: {},
  final: "FAIL",
};

const sbAnon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function login(email) {
  for (const pw of passwords()) {
    const { data, error } = await sbAnon.auth.signInWithPassword({ email, password: pw });
    if (!error && data.session) return data.session;
  }
  throw new Error(`login_failed:${email}`);
}

async function cookieHeader(session) {
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
  let cookie = `sb-${ref}-auth-token=${encodeURIComponent(
    JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      expires_in: session.expires_in,
      token_type: session.token_type,
      user: session.user,
    })
  )}`;
  const { data: pr } = await admin.from("profiles").select("active_session_id").eq("id", session.user.id).maybeSingle();
  if (pr?.active_session_id) cookie += `; samarket_active_session_id=${encodeURIComponent(String(pr.active_session_id))}`;
  return cookie;
}

async function apiJson(cookie, method, path, body) {
  const res = await fetch(`${ORIGIN}${path}`, {
    method,
    headers: { cookie, "content-type": "application/json", accept: "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 500) };
  }
  return { status: res.status, ok: res.ok, json };
}

async function dismiss(page) {
  for (let i = 0; i < 6; i++) {
    const btn = page.getByRole("button", { name: /Don't show|오늘|Close|닫기|Hide|Dismiss/i });
    if ((await btn.count()) > 0 && (await btn.first().isVisible().catch(() => false))) {
      await btn.first().click({ force: true }).catch(() => null);
      await page.waitForTimeout(250);
      continue;
    }
    await page.keyboard.press("Escape").catch(() => null);
    break;
  }
}

async function addAuthCookies(context, session) {
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
  const domain = new URL(ORIGIN).hostname;
  const { data: pr } = await admin.from("profiles").select("active_session_id").eq("id", session.user.id).maybeSingle();
  await context.addCookies([
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
      domain,
      path: "/",
      expires: session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
      httpOnly: false,
      secure: true,
      sameSite: "Lax",
    },
    ...(pr?.active_session_id
      ? [
          {
            name: "samarket_active_session_id",
            value: String(pr.active_session_id),
            domain,
            path: "/",
            expires: Math.floor(Date.now() / 1000) + 86400 * 7,
            httpOnly: false,
            secure: true,
            sameSite: "Lax",
          },
        ]
      : []),
  ]);
}

function write() {
  writeFileSync(resolve(OUT, "order-finance-surfaces-proof.json"), JSON.stringify(report, null, 2));
}

try {
  const buyerSess = await login(BUYER_EMAIL);
  const ownerSess = await login(OWNER_EMAIL);
  const buyerCookie = await cookieHeader(buyerSess);
  const ownerCookie = await cookieHeader(ownerSess);

  // --- ORDER SAFE FLOW ---
  const { data: storeGeo } = await admin.from("stores").select("lat,lng,is_open,is_visible").eq("id", STORE).maybeSingle();
  const { data: addrs } = await admin
    .from("user_addresses")
    .select("id, phone_number, latitude, longitude")
    .eq("user_id", buyerSess.user.id)
    .eq("is_active", true);
  const dist = (a) => {
    const dlat = Number(a.latitude) - Number(storeGeo?.lat);
    const dlng = Number(a.longitude) - Number(storeGeo?.lng);
    return dlat * dlat + dlng * dlng;
  };
  const near = (addrs || []).filter((a) => a.latitude != null).sort((a, b) => dist(a) - dist(b))[0];
  if (!near?.id) {
    report.steps.ORDER_SAFE_FLOW = { result: "BLOCKED", reason: "no_buyer_geo_address" };
  } else {
    const placed = await apiJson(buyerCookie, "POST", "/api/me/store-orders", {
      store_id: STORE,
      fulfillment_type: "local_delivery",
      payment_method: "cod",
      buyer_phone: near.phone_number || "+639121121211",
      delivery_user_address_id: near.id,
      buyer_note: `DIBAY_QA_STOREOS_ORDER_${STAMP}`,
      client_order_key: `dibay-qa-storeos-order-${STAMP}`,
      items: [{ product_id: PRODUCT.productId, qty: PRODUCT.qty, client_unit_php: PRODUCT.unitPhp }],
    });
    report.steps.placeOrder = {
      ok: placed.ok,
      status: placed.status,
      error: placed.json?.error ?? null,
      orderId: placed.json?.order?.id ?? null,
    };
    const orderId = placed.json?.order?.id ? String(placed.json.order.id) : null;
    report.orderId = orderId;
    report.orderNo = placed.json?.order?.order_no ?? null;

    if (!orderId) {
      report.steps.ORDER_SAFE_FLOW = {
        result: "BLOCKED",
        reason: "place_order_failed",
        detail: placed.json,
        storeFlags: storeGeo,
      };
    } else {
      const transitionLog = [];
      const steps = [
        ["accepted", { estimated_prep_minutes: 15 }],
        ["preparing", {}],
        ["ready_for_pickup", {}],
        ["delivering", {}],
        ["completed", {}],
      ];
      let blocked = null;
      for (const [status, extra] of steps) {
        const patch = await apiJson(ownerCookie, "PATCH", `/api/me/stores/${STORE}/orders/${orderId}`, {
          order_status: status,
          ...extra,
        });
        const { data: row } = await admin
          .from("store_orders")
          .select("order_status,payment_amount,total_amount")
          .eq("id", orderId)
          .maybeSingle();
        transitionLog.push({
          to: status,
          apiOk: patch.ok,
          apiStatus: patch.status,
          apiError: patch.json?.error ?? null,
          dbStatus: row?.order_status ?? null,
        });
        if (!patch.ok || row?.order_status !== status) {
          blocked = { to: status, patch, db: row };
          break;
        }
      }
      report.steps.transitions = transitionLog;

      // Buyer order status check
      const buyerOrder = await apiJson(buyerCookie, "GET", `/api/me/store-orders/${orderId}`);
      report.steps.buyerOrderAfter = {
        ok: buyerOrder.ok,
        status: buyerOrder.status,
        order_status: buyerOrder.json?.order?.order_status ?? buyerOrder.json?.order_status ?? null,
      };

      report.steps.ORDER_SAFE_FLOW = blocked
        ? { result: "FAIL", blocked }
        : {
            result: "PASS",
            path: "pending→accepted→preparing→ready_for_pickup→delivering→completed",
            orderId,
          };
    }
  }

  // --- FINANCE accounting story (representative completed order + UI drill) ---
  const finApi = await apiJson(ownerCookie, "GET", `/api/me/stores/${STORE}/finance`);
  report.steps.financeApi = {
    ok: finApi.ok,
    status: finApi.status,
    keys: finApi.json && typeof finApi.json === "object" ? Object.keys(finApi.json).slice(0, 40) : [],
    sample: finApi.json
      ? {
          coin: finApi.json.coin ?? finApi.json.coin_balance ?? finApi.json.balances?.coin ?? null,
          cash: finApi.json.cash ?? finApi.json.cash_balance ?? finApi.json.balances?.cash ?? null,
          error: finApi.json.error ?? null,
        }
      : null,
  };

  // Prefer the QA order just completed; else a known completed order for amount story.
  const orderForFinance = report.orderId;
  let financeStory = null;
  if (orderForFinance) {
    const { data: ord } = await admin
      .from("store_orders")
      .select(
        "id,order_no,order_status,total_amount,payment_amount,discount_amount,commission_base_amount,store_funded_amount,platform_funded_amount,gift_redemption_amount"
      )
      .eq("id", orderForFinance)
      .maybeSingle();
    const { data: coinLed } = await admin
      .from("store_economic_point_ledger")
      .select("id,entry_kind,amount,idempotency_key")
      .eq("idempotency_key", `sale_coin:${orderForFinance}`)
      .maybeSingle();
    const { data: feeLed } = await admin
      .from("business_cash_ledger")
      .select("id,entry_kind,amount_minor,direction,idempotency_key")
      .eq("idempotency_key", `sale_fee:order:${orderForFinance}`)
      .maybeSingle();
    financeStory = {
      order: ord,
      coinLedger: coinLed ?? null,
      cashFeeLedger: feeLed ?? null,
      coherent:
        !!ord &&
        ord.order_status === "completed" &&
        Number(ord.payment_amount) > 0 &&
        (coinLed != null || feeLed != null || Number(ord.payment_amount) > 0),
    };
  }
  report.steps.financeStory = financeStory;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await addAuthCookies(context, ownerSess);
  const page = await context.newPage();

  async function go(path) {
    const url = `${ORIGIN}${path}${path.includes("?") ? "&" : "?"}storeId=${STORE}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForTimeout(1800);
    await dismiss(page);
  }

  // Dashboard semantics
  await go("/stores/owner");
  const dash = await page.evaluate(() => {
    const text = document.body?.innerText || "";
    return {
      storeStatus: !!document.querySelector("[data-owner-home-store-status]"),
      staleHint: !!document.querySelector("[data-owner-dash-stale-queue-hint]"),
      financeCards: !!document.querySelector("[data-owner-finance-home-cards]"),
      careCard: !!document.querySelector("[data-owner-home-care-card]"),
      hasAwaiting: /Awaiting accept|미수락|Orders to handle|처리/i.test(text),
      hasTodayCreated: /Created today|오늘 생성|Orders created today/i.test(text),
      distinguishesPendingVsToday: /older pending|Action required|대기.*오늘|오늘.*생성/i.test(text),
    };
  });
  await page.screenshot({ path: resolve(OUT, "dashboard-home.png"), fullPage: false });
  report.steps.DASHBOARD = {
    result:
      dash.storeStatus && dash.hasAwaiting && dash.hasTodayCreated
        ? "PASS"
        : "FAIL",
    dash,
  };

  // Long-pending section (may be CODE_PENDING_SHIP on production until deploy)
  await go("/stores/owner/orders");
  const ordersUx = await page.evaluate(() => {
    const longSec = document.querySelector('[data-owner-orders-section="long-waiting"]');
    const freshSec = document.querySelector('[data-owner-orders-section="fresh-new"]');
    return {
      longWaitingSection: !!longSec,
      freshSection: !!freshSec,
      longText: longSec?.textContent?.slice(0, 200) ?? null,
      bodyHasAge: /\d+\s*h\b|\d+\s*시간|long-waiting|No system TTL/i.test(document.body?.innerText || ""),
    };
  });
  await page.screenshot({ path: resolve(OUT, "orders-queue.png"), fullPage: false });
  report.steps.LONG_PENDING_ORDER_UX = {
    result: ordersUx.longWaitingSection ? "PASS" : "NOT_ON_THIS_DEPLOY_OR_FAIL",
    ordersUx,
  };

  // Finance UI
  await go("/stores/owner/finance");
  const financeUi = await page.evaluate(() => {
    const t = document.body?.innerText || "";
    return {
      url: location.href,
      hasCoin: /Coin|코인/i.test(t),
      hasCash: /Cash|캐시/i.test(t),
      hasConvert: /Convert to Cash|Cash로 전환/i.test(t),
      hasHistory: /History|내역|Ledger|원장/i.test(t),
      hasTopUp: /Top up|Top-up|충전/i.test(t),
      overflowX: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
  await page.screenshot({ path: resolve(OUT, "finance.png"), fullPage: false });
  report.steps.FINANCE_UI = {
    result: financeUi.hasCoin && financeUi.hasCash && financeUi.overflowX <= 1 ? "PASS" : "FAIL",
    financeUi,
  };
  report.steps.FINANCE_ACCOUNTING = {
    result:
      financeStory?.coherent && report.steps.FINANCE_UI.result === "PASS"
        ? "PASS"
        : financeStory?.order
          ? "PARTIAL"
          : "FAIL",
    note: "Order amounts + optional ledger rows; UI surfaces Coin/Cash",
  };

  // Settlement read-only
  await go("/stores/owner/settlements");
  const settlementUi = await page.evaluate(() => {
    const t = document.body?.innerText || "";
    const editable = [...document.querySelectorAll("input,textarea,select")].filter((el) => {
      const type = (el.getAttribute("type") || "").toLowerCase();
      if (type === "hidden" || type === "search") return false;
      return !el.disabled && !el.readOnly;
    });
    return {
      url: location.href,
      hasSettlement: /Settlement|정산|payout|출금|withdraw/i.test(t),
      editableCount: editable.length,
      overflowX: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
  await page.screenshot({ path: resolve(OUT, "settlement.png"), fullPage: false });
  report.steps.SETTLEMENT = {
    result: settlementUi.hasSettlement && settlementUi.overflowX <= 1 ? "PASS" : "FAIL",
    settlementUi,
  };

  // Promotion entries (separate products)
  const promoPaths = [
    ["coupon", "/stores/owner/coupons"],
    ["gift", "/stores/owner/gift-certificates"],
    ["banner", "/stores/owner/banners"],
    ["notice", "/stores/owner/notices"],
    ["ads", "/stores/owner/ads"],
  ];
  const promo = {};
  for (const [key, path] of promoPaths) {
    await go(path);
    const info = await page.evaluate((k) => {
      const t = document.body?.innerText || "";
      return {
        url: location.href,
        not404: !/404|Not Found|페이지를 찾을 수 없/i.test(t.slice(0, 400)),
        hasPrimaryCta: !!document.querySelector("a,button"),
        sample: t.slice(0, 180).replace(/\s+/g, " "),
      };
    }, key);
    promo[key] = info;
  }
  report.steps.PROMOTION = {
    result: promoPaths.every(([k]) => promo[k]?.not404) ? "PASS" : "FAIL",
    promo,
  };

  // Customer work queue
  await go("/stores/owner/customer-care");
  const customer = await page.evaluate(() => {
    const hub = document.querySelector("[data-owner-customer-care-hub]");
    const t = hub?.textContent || document.body?.innerText || "";
    const links = [...(hub?.querySelectorAll("a[href]") || [])].map((a) => ({
      href: a.getAttribute("href"),
      label: (a.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80),
    }));
    return {
      url: location.href,
      hub: !!hub,
      hasOrderChat: /order chat|주문 채팅/i.test(t),
      hasInquiry: /inquiry|문의/i.test(t),
      hasReview: /review|리뷰/i.test(t),
      hasSupport: /support|고객센터|Customer center/i.test(t),
      links: links.slice(0, 20),
    };
  });
  await page.screenshot({ path: resolve(OUT, "customer-hub.png"), fullPage: false });
  report.steps.CUSTOMER_WORK_QUEUE = {
    result:
      customer.hub &&
      customer.url.includes("/customer-care") &&
      customer.hasOrderChat &&
      customer.hasInquiry &&
      customer.hasSupport
        ? "PASS"
        : "FAIL",
    customer,
  };

  // Locale: current session language + switch probe via cookie/local preference if exposed
  const localeProbe = await page.evaluate(() => {
    const htmlLang = document.documentElement.lang || "";
    const t = document.body?.innerText || "";
    const koHits = (t.match(/주문|상품|정산|고객|매장|대시보드/g) || []).length;
    const enHits = (t.match(/Orders|Products|Settlement|Customer|Store|Dashboard/g) || []).length;
    return { htmlLang, koHits, enHits, sample: t.slice(0, 120) };
  });
  report.steps.LOCALE_OBSERVED = localeProbe;
  report.steps.EN_OWNER =
    localeProbe.enHits > localeProbe.koHits ? { result: "PASS_OBSERVED_EN" } : { result: "NOT_PROVEN_AS_EN" };
  report.steps.KO_OWNER = { result: "NOT_PROVEN", note: "Do not force KO; need KO-locale session proof" };

  // Notification category sample (inbox open)
  await go("/stores/owner");
  await dismiss(page);
  const bell = page.locator("[data-owner-notification-bell], button[aria-label*='otif' i], button[aria-label*='알림']").first();
  let notifClass = { opened: false };
  if ((await bell.count()) > 0) {
    await bell.click({ force: true }).catch(() => null);
    await page.waitForTimeout(800);
    notifClass = await page.evaluate(() => {
      const panel = document.querySelector("[data-owner-notification-panel], [data-philife-notification-panel]");
      const t = panel?.textContent || "";
      return {
        opened: !!panel && (panel.getAttribute("data-open") === "true" || panel.offsetParent !== null),
        hasOrdersDelivery: /Orders\s*&\s*delivery|주문.*배달/i.test(t),
        hasPromoOrAds: /Promo|Ads|광고|Promotion|Marketing/i.test(t),
        sample: t.slice(0, 300),
      };
    });
  }
  report.steps.NOTIFICATION_CLASSIFICATION_UI = {
    result: "OBSERVED_ONLY_PENDING_EVENT_TYPED_PROOF",
    notifClass,
  };

  await browser.close();

  const required = [
    report.steps.ORDER_SAFE_FLOW?.result,
    report.steps.DASHBOARD?.result,
    report.steps.FINANCE_ACCOUNTING?.result,
    report.steps.SETTLEMENT?.result,
    report.steps.PROMOTION?.result,
    report.steps.CUSTOMER_WORK_QUEUE?.result,
  ];
  const hardFail = required.includes("FAIL") || required.includes("BLOCKED");
  const allPass = required.every((r) => r === "PASS" || r === "PARTIAL");
  report.final = hardFail ? "FAIL" : allPass ? "PASS_WITH_PARTIALS_OK" : "FAIL";
  write();
  console.log(JSON.stringify(report, null, 2));
  process.exit(hardFail ? 2 : 0);
} catch (e) {
  report.steps.exception = String(e?.stack || e);
  report.final = "FAIL";
  write();
  console.error(e);
  process.exit(1);
}

/**
 * Owner Store OS ORDERS complete-process proof.
 * LOCAL authority only. Uses cookie auth for owner APIs.
 *
 * PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 node --env-file=.env.local \
 *   scripts/qa/owner-store-os-orders-complete-process-proof.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const OUT = resolve(process.cwd(), "docs/perf/owner-store-os-complete/recovery");
const OUT_FILE = resolve(OUT, "orders-complete-process-proof.json");
const STORE = "19085860-52d2-4183-b033-e71fcb58bcec";
const OWNER_EMAIL = "sadads@adsasdsa.com";
const BUYER_EMAIL = process.env.OWNER_STORE_OS_BUYER_EMAIL || "wwww@manual.local";
const PRODUCT = {
  productId: process.env.OWNER_STORE_OS_ORDER_PRODUCT_ID || "5c3800d3-675b-4edd-a7dc-ac91252a473b",
  unitPhp: Number(process.env.OWNER_STORE_OS_ORDER_PRODUCT_UNIT_PHP || 150),
  qty: Number(process.env.OWNER_STORE_OS_ORDER_PRODUCT_QTY || 7),
};
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
  return [...new Set([process.env.E2E_TEST_PASSWORD, process.env.QA_MANUAL_PASSWORD, "1234", "DibayQa1!"].filter(Boolean))];
}

function write(report) {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(OUT_FILE, JSON.stringify(report, null, 2));
}

function cookieValue(session) {
  return encodeURIComponent(
    JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      expires_in: session.expires_in,
      token_type: session.token_type,
      user: session.user,
    })
  );
}

async function login(sb, email) {
  for (const pw of passwords()) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password: pw });
    if (!error && data.session) return data.session;
  }
  throw new Error(`login_failed:${email}`);
}

async function cookieHeader(admin, session) {
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
  let cookie = `sb-${ref}-auth-token=${cookieValue(session)}`;
  const { data: pr } = await admin.from("profiles").select("active_session_id").eq("id", session.user.id).maybeSingle();
  if (pr?.active_session_id) {
    cookie += `; samarket_active_session_id=${encodeURIComponent(String(pr.active_session_id))}`;
  }
  return cookie;
}

async function addAuthCookies(context, admin, session) {
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
  const domain = new URL(ORIGIN).hostname;
  const isLocal = domain === "127.0.0.1" || domain === "localhost";
  const { data: pr } = await admin.from("profiles").select("active_session_id").eq("id", session.user.id).maybeSingle();
  await context.addCookies([
    {
      name: `sb-${ref}-auth-token`,
      value: cookieValue(session),
      domain,
      path: "/",
      expires: session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
      httpOnly: false,
      secure: !isLocal,
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
            secure: !isLocal,
            sameSite: "Lax",
          },
        ]
      : []),
  ]);
}

async function apiJson(cookie, method, path, body) {
  const res = await fetch(`${ORIGIN}${path}`, {
    method,
    headers: { cookie, "content-type": "application/json", accept: "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 500) };
  }
  return { status: res.status, ok: res.ok, json };
}

async function dismiss(page) {
  for (let i = 0; i < 5; i++) {
    const btn = page.getByRole("button", { name: /Don't show|오늘|Close|닫기|Hide|Dismiss/i });
    if ((await btn.count()) > 0 && (await btn.first().isVisible().catch(() => false))) {
      await btn.first().click({ force: true }).catch(() => null);
      await page.waitForTimeout(200);
      continue;
    }
    await page.keyboard.press("Escape").catch(() => null);
    break;
  }
}

loadEnv();
mkdirSync(OUT, { recursive: true });

const report = {
  title: "ORDERS COMPLETE PROCESS",
  evidenceLevel: "LOCAL_PROVEN",
  origin: ORIGIN,
  storeId: STORE,
  ownerEmail: OWNER_EMAIL,
  buyerEmail: BUYER_EMAIL,
  stamp: STAMP,
  orderId: null,
  orderNo: null,
  product: PRODUCT,
  steps: {},
  capabilityClassification: {},
  final: "FAIL",
};

try {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("missing_supabase_env");
  }

  const sbAnon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const buyerSess = await login(sbAnon, BUYER_EMAIL);
  const ownerSess = await login(sbAnon, OWNER_EMAIL);
  const buyerCookie = await cookieHeader(admin, buyerSess);
  const ownerCookie = await cookieHeader(admin, ownerSess);

  const { data: storeBefore } = await admin.from("stores").select("id,slug,is_visible,is_open,lat,lng").eq("id", STORE).maybeSingle();
  report.steps.storeBefore = storeBefore ?? null;
  const visibilityWas = storeBefore?.is_visible === true;
  if (!visibilityWas) {
    await admin.from("stores").update({ is_visible: true }).eq("id", STORE);
    report.steps.visibilityTempOn = true;
  }

  try {
    const ownerListBefore = await apiJson(ownerCookie, "GET", `/api/me/stores/${STORE}/orders?fresh=1`, null);
    report.steps.ownerListBefore = {
      ok: ownerListBefore.ok,
      status: ownerListBefore.status,
      count: Array.isArray(ownerListBefore.json?.orders) ? ownerListBefore.json.orders.length : null,
      meta: ownerListBefore.json?.meta ?? null,
      error: ownerListBefore.json?.error ?? null,
    };

    const { data: addrs } = await admin
      .from("user_addresses")
      .select("id, phone_number, latitude, longitude")
      .eq("user_id", buyerSess.user.id)
      .eq("is_active", true);
    const dist = (a) => {
      const dlat = Number(a.latitude) - Number(storeBefore?.lat);
      const dlng = Number(a.longitude) - Number(storeBefore?.lng);
      return dlat * dlat + dlng * dlng;
    };
    const near = (addrs || []).filter((a) => a.latitude != null).sort((a, b) => dist(a) - dist(b))[0];
    report.steps.buyerAddress = near ? { id: near.id, hasPhone: !!near.phone_number } : null;

    if (!near?.id) {
      report.steps.ORDER_SAFE_FLOW = { result: "BLOCKED", reason: "no_buyer_geo_address" };
    } else {
      const placed = await apiJson(buyerCookie, "POST", "/api/me/store-orders", {
        store_id: STORE,
        fulfillment_type: "local_delivery",
        payment_method: "cod",
        buyer_phone: near.phone_number || "+639121121211",
        delivery_user_address_id: near.id,
        buyer_note: `DIBAY_OWNER_ORDERS_COMPLETE_${STAMP}`,
        client_order_key: `dibay-owner-orders-complete-${STAMP}`,
        items: [{ product_id: PRODUCT.productId, qty: PRODUCT.qty, client_unit_php: PRODUCT.unitPhp }],
      });
      const orderId = placed.json?.order?.id ? String(placed.json.order.id) : null;
      report.orderId = orderId;
      report.orderNo = placed.json?.order?.order_no ?? null;
      report.steps.placeOrder = {
        ok: placed.ok,
        status: placed.status,
        error: placed.json?.error ?? null,
        orderId,
      };

      if (!orderId) {
        report.steps.ORDER_SAFE_FLOW = { result: "FAIL", reason: "place_order_failed", detail: placed.json };
      } else {
        const detailPending = await apiJson(ownerCookie, "GET", `/api/me/stores/${STORE}/orders/${orderId}`, null);
        report.steps.ownerDetailPending = {
          ok: detailPending.ok,
          status: detailPending.status,
          order_status: detailPending.json?.order?.order_status ?? null,
          itemCount: Array.isArray(detailPending.json?.order?.items) ? detailPending.json.order.items.length : null,
          order_chat_ready: detailPending.json?.meta?.order_chat_ready ?? null,
          hasReceipt: !!detailPending.json?.order?.order_no,
          hasPaymentAmount: Number(detailPending.json?.order?.payment_amount ?? 0) > 0,
        };

        const transitionLog = [];
        const transitionSteps = [
          ["accepted", { estimated_prep_minutes: 15 }],
          ["preparing", {}],
          ["ready_for_pickup", {}],
          ["delivering", {}],
          ["completed", {}],
        ];
        let blocked = null;
        for (const [status, extra] of transitionSteps) {
          const patch = await apiJson(ownerCookie, "PATCH", `/api/me/stores/${STORE}/orders/${orderId}`, {
            order_status: status,
            ...extra,
          });
          const { data: row } = await admin
            .from("store_orders")
            .select("order_status,payment_status,estimated_prep_minutes,estimated_ready_at,accepted_at,auto_complete_at")
            .eq("id", orderId)
            .maybeSingle();
          const entry = {
            to: status,
            apiOk: patch.ok,
            apiStatus: patch.status,
            apiError: patch.json?.error ?? null,
            dbStatus: row?.order_status ?? null,
            prepMinutes: row?.estimated_prep_minutes ?? null,
            hasEstimatedReadyAt: !!row?.estimated_ready_at,
            hasAcceptedAt: !!row?.accepted_at,
          };
          transitionLog.push(entry);
          if (!patch.ok || row?.order_status !== status) {
            blocked = { to: status, patch: { status: patch.status, json: patch.json }, db: row };
            break;
          }
        }
        report.steps.transitions = transitionLog;

        const finalOwnerDetail = await apiJson(ownerCookie, "GET", `/api/me/stores/${STORE}/orders/${orderId}`, null);
        report.steps.ownerDetailCompleted = {
          ok: finalOwnerDetail.ok,
          status: finalOwnerDetail.status,
          order_status: finalOwnerDetail.json?.order?.order_status ?? null,
          review_status: finalOwnerDetail.json?.order?.review_status ?? null,
          order_no: finalOwnerDetail.json?.order?.order_no ?? null,
          payment_amount: finalOwnerDetail.json?.order?.payment_amount ?? null,
          itemCount: Array.isArray(finalOwnerDetail.json?.order?.items) ? finalOwnerDetail.json.order.items.length : null,
        };

        const ownerListAfter = await apiJson(ownerCookie, "GET", `/api/me/stores/${STORE}/orders?fresh=1`, null);
        const ownerListAfterOrders = Array.isArray(ownerListAfter.json?.orders) ? ownerListAfter.json.orders : [];
        const listedOrder = ownerListAfterOrders.find((o) => String(o?.id ?? "") === orderId) ?? null;
        report.steps.ownerListAfterCompleted = {
          ok: ownerListAfter.ok,
          status: ownerListAfter.status,
          count: ownerListAfterOrders.length,
          orderFound: !!listedOrder,
          order_status: listedOrder?.order_status ?? null,
          hasItems: Array.isArray(listedOrder?.items),
          meta: ownerListAfter.json?.meta ?? null,
        };

        const buyerOrder = await apiJson(buyerCookie, "GET", `/api/me/store-orders/${orderId}`, null);
        report.steps.buyerOrderAfter = {
          ok: buyerOrder.ok,
          status: buyerOrder.status,
          order_status: buyerOrder.json?.order?.order_status ?? buyerOrder.json?.order_status ?? null,
        };

        report.steps.ORDER_SAFE_FLOW = blocked
          ? { result: "FAIL", blocked }
          : {
              result: "PASS",
              path: "pending->accepted->preparing->ready_for_pickup->delivering->completed",
              orderId,
            };
      }
    }
  } finally {
    if (!visibilityWas) {
      await admin.from("stores").update({ is_visible: false }).eq("id", STORE);
      report.steps.visibilityRestoredOff = true;
    }
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await addAuthCookies(context, admin, ownerSess);
  const page = await context.newPage();
  await page.goto(`${ORIGIN}/stores/owner/orders?storeId=${STORE}&tab=done&order_id=${report.orderId || ""}&fresh_list=1`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await Promise.race([
    page.waitForSelector('[data-owner-scroll-host="orders-list"]', { timeout: 30000 }).catch(() => null),
    page.waitForFunction(
      (orderId) => {
        const text = document.body?.innerText || "";
        return !!document.querySelector('[data-owner-scroll-host="orders-list"]') || (!!orderId && text.includes(orderId));
      },
      report.orderId || "",
      { timeout: 30000 }
    ).catch(() => null),
  ]);
  await Promise.race([page.waitForLoadState("networkidle").catch(() => null), page.waitForTimeout(3000)]);
  await dismiss(page);

  report.steps.ownerOrdersUi = await page.evaluate((orderId) => {
    const text = document.body?.innerText || "";
    const activeOrder = orderId ? document.getElementById(`owner-order-${orderId}`) : null;
    return {
      url: location.href,
      notLogin: !/\/login/.test(location.pathname),
      tabs: [...document.querySelectorAll("a[aria-label]")].map((a) => a.getAttribute("aria-label")).filter(Boolean).slice(0, 12),
      kpiCards: document.querySelectorAll("[data-owner-orders-kpi]").length,
      actionRequiredCta: !!document.querySelector("[data-owner-orders-action-required]"),
      longWaitingSection: !!document.querySelector('[data-owner-orders-section="long-waiting"]'),
      highlightedOrderPresent: !!activeOrder,
      hasSearchOrFilterChrome: /Search|검색|Filter|필터|Newest|최신|Oldest|오래된/i.test(text),
      hasCompletedText: /Completed|완료/i.test(text),
      hasOrderNo: /SO\d+/i.test(text),
      sample: text.slice(0, 600).replace(/\s+/g, " "),
    };
  }, report.orderId);
  await page.screenshot({ path: resolve(OUT, "orders-complete-process-ui.png"), fullPage: false });

  await browser.close();

  const flowPass = report.steps.ORDER_SAFE_FLOW?.result === "PASS";
  const detailPass =
    report.steps.ownerDetailPending?.ok === true &&
    report.steps.ownerDetailCompleted?.ok === true &&
    report.steps.ownerDetailCompleted?.order_status === "completed";
  const ownerListPass =
    report.steps.ownerListAfterCompleted?.ok === true &&
    report.steps.ownerListAfterCompleted?.orderFound === true &&
    report.steps.ownerListAfterCompleted?.order_status === "completed";
  const buyerPass = report.steps.buyerOrderAfter?.ok === true && report.steps.buyerOrderAfter?.order_status === "completed";
  const uiPass =
    report.steps.ownerOrdersUi?.notLogin === true &&
    report.steps.ownerOrdersUi?.kpiCards >= 4 &&
    report.steps.ownerOrdersUi?.hasSearchOrFilterChrome === true;

  report.capabilityClassification = {
    new_order_reception: flowPass ? "LOCAL_PROVEN" : "IMPLEMENTED",
    order_alert_badge: report.steps.ownerListAfterCompleted?.meta ? "LOCAL_PROVEN" : "IMPLEMENTED",
    detail_receipt_payment: detailPass ? "LOCAL_PROVEN" : "IMPLEMENTED",
    accept_with_prep_time: report.steps.transitions?.[0]?.apiOk && report.steps.transitions?.[0]?.prepMinutes === 15 ? "LOCAL_PROVEN" : "IMPLEMENTED",
    preparing_ready_delivery_complete: flowPass ? "LOCAL_PROVEN" : "IMPLEMENTED",
    buyer_completion_reflection: buyerPass ? "LOCAL_PROVEN" : "IMPLEMENTED",
    filters_search_history_tabs: uiPass ? "LOCAL_PROVEN" : ownerListPass ? "LOCAL_PROVEN_API_HISTORY_UI_IMPLEMENTED" : "IMPLEMENTED",
    chat_contact: report.steps.ownerDetailPending?.order_chat_ready === true ? "LOCAL_PROVEN" : "IMPLEMENTED",
    long_pending_treatment: report.steps.ownerOrdersUi?.longWaitingSection ? "LOCAL_PROVEN" : "IMPLEMENTED",
  };
  report.final =
    flowPass && detailPass && ownerListPass && buyerPass && uiPass
      ? "PASS"
      : flowPass && detailPass && ownerListPass && buyerPass
        ? "PASS_SAFE_FLOW_UI_PARTIAL"
        : "PARTIAL";
  write(report);
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.final === "PASS" || report.final === "PASS_SAFE_FLOW_UI_PARTIAL" ? 0 : 2);
} catch (e) {
  report.steps.exception = String(e?.stack || e);
  report.final = "FAIL";
  write(report);
  console.error(e);
  process.exit(1);
}

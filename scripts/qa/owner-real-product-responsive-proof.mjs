/**
 * Owner Admin REAL PRODUCT responsive proof (local or Production).
 * PLAYWRIGHT_BASE_URL=http://localhost:3000 node --env-file=.env.local scripts/qa/owner-real-product-responsive-proof.mjs
 * PLAYWRIGHT_BASE_URL=https://samarket.vercel.app node --env-file=.env.local scripts/qa/owner-real-product-responsive-proof.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const OUT = resolve(process.cwd(), "docs/perf/owner-real-product-close");
const STORE = "19085860-52d2-4183-b033-e71fcb58bcec";
const EMAIL = "sadads@adsasdsa.com";
const WIDTHS = (process.env.OWNER_PROOF_WIDTHS || "390,430,768,1024,1280")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n > 0);

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

async function dismiss(page) {
  for (let i = 0; i < 6; i++) {
    const btn = page.getByRole("button", { name: /Don't show|오늘|Close|닫기|Hide|Dismiss/i });
    if ((await btn.count()) > 0 && (await btn.first().isVisible().catch(() => false))) {
      await btn.first().click({ force: true }).catch(() => null);
      await page.waitForTimeout(250);
      continue;
    }
    await page.keyboard.press("Escape").catch(() => null);
    if ((await page.locator(".dibay-platform-popup-root").count()) === 0) break;
    await page.waitForTimeout(200);
  }
}

function cookieDomain(origin) {
  try {
    const host = new URL(origin).hostname;
    if (host === "localhost" || host === "127.0.0.1") return host;
    return host;
  } catch {
    return "localhost";
  }
}

loadEnv();
mkdirSync(OUT, { recursive: true });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});
const passwords = [
  ...new Set([process.env.E2E_TEST_PASSWORD, process.env.QA_MANUAL_PASSWORD, "1234", "DibayQa1!"].filter(Boolean)),
];
let session = null;
for (const pw of passwords) {
  const { data, error } = await sb.auth.signInWithPassword({ email: EMAIL, password: pw });
  if (!error && data.session) {
    session = data.session;
    break;
  }
}
if (!session) throw new Error("owner login failed");

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const { data: pr } = await admin.from("profiles").select("active_session_id").eq("id", session.user.id).maybeSingle();
const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const domain = cookieDomain(ORIGIN);
const secure = ORIGIN.startsWith("https");

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
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
    secure,
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
          secure,
          sameSite: "Lax",
        },
      ]
    : []),
]);

const page = await context.newPage();
const report = {
  origin: ORIGIN,
  storeId: STORE,
  widths: {},
  pages: {},
  badges: {},
  drawer: {},
  final: "FAIL",
  firstDivergence: null,
};

function fail(msg) {
  if (!report.firstDivergence) report.firstDivergence = msg;
}

async function go(path, { waitText } = {}) {
  const url = `${ORIGIN}${path}${path.includes("?") ? "&" : "?"}storeId=${STORE}`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page
    .waitForFunction(() => document.body?.hasAttribute("data-owner-compact-shell") || document.querySelector("[data-biz='1']"), null, {
      timeout: 60000,
    })
    .catch(() => null);
  await dismiss(page);
  // Close any leftover drawer/modal from prior navigation
  await page.keyboard.press("Escape").catch(() => null);
  await page.waitForTimeout(400);
  if (waitText) {
    await page
      .waitForFunction(
        (re) => {
          const t = document.body?.innerText || "";
          return new RegExp(re, "i").test(t) && !/Loading…|Loading\.\.\./i.test(t.slice(0, 80));
        },
        waitText,
        { timeout: 60000 }
      )
      .catch(() => null);
  } else {
    await page.waitForTimeout(600);
  }
}

async function pageMetrics(tag) {
  return page.evaluate((shotTag) => {
    const body = document.body;
    const overflowX = Math.max(0, (body?.scrollWidth || 0) - (window.innerWidth || 0));
    const verticalCtas = [];
    for (const el of document.querySelectorAll("a,button,[data-owner-cta],[data-currency-action]")) {
      const style = getComputedStyle(el);
      const text = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (!text || text.length < 2) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8) continue;
      if (rect.width > 0 && rect.height / Math.max(rect.width, 1) > 2.2 && text.length >= 4) {
        verticalCtas.push({ text: text.slice(0, 40), w: Math.round(rect.width), h: Math.round(rect.height) });
      }
      if (style.whiteSpace !== "nowrap" && /\n/.test(el.innerText || "") && (el.matches("[data-currency-action], [data-owner-cta]") || el.className?.includes?.("sam-btn"))) {
        verticalCtas.push({ text: text.slice(0, 40), reason: "newline" });
      }
    }
    const primaryDarkOnDark = [];
    for (const el of document.querySelectorAll("[data-currency-action], [data-owner-cta='primary'], .sam-btn-primary, .sam-btn--primary")) {
      const cs = getComputedStyle(el);
      const color = cs.color;
      const bg = cs.backgroundColor;
      const text = (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 32);
      if (!text) continue;
      // crude: dark-ish text on dark-ish bg
      const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      const b = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (m && b) {
        const tc = (Number(m[1]) + Number(m[2]) + Number(m[3])) / 3;
        const bc = (Number(b[1]) + Number(b[2]) + Number(b[3])) / 3;
        if (tc < 80 && bc < 80) primaryDarkOnDark.push({ text, color, bg });
      }
    }
    return {
      tag: shotTag,
      overflowX,
      verticalCtas: verticalCtas.slice(0, 8),
      primaryDarkOnDark: primaryDarkOnDark.slice(0, 8),
      homeActionFirst: !!document.querySelector("[data-owner-home-action-first]"),
      staleHint: !!document.querySelector("[data-owner-dash-stale-queue-hint]"),
      financeSection: !!document.querySelector("[data-owner-home-secondary-finance], [data-owner-finance], #coin-withdraw"),
      careHub: !!document.querySelector("[data-owner-customer-care-hub]"),
      careAction: !!document.querySelector("[data-owner-care-action-required]"),
      settlementRo: !!document.querySelector("[data-owner-settlement-readonly]"),
      ordersAction: !!document.querySelector("[data-owner-orders-action-required]"),
      bodyText: (document.body?.innerText || "").slice(0, 4000),
    };
  }, tag);
}

try {
  for (const w of WIDTHS) {
    const h = w >= 1024 ? 768 : 844;
    await page.setViewportSize({ width: w, height: h });
    const widthReport = { height: h, pages: {} };

    // HOME
    await go("/stores/owner", { waitText: "Created today|오늘 생성|Awaiting accept|미수락" });
    const home = await pageMetrics("home");
    await page.screenshot({ path: resolve(OUT, `${w}-home.png`), fullPage: false });
    const homeText = home.bodyText;
    const homeOk =
      home.overflowX <= 2 &&
      home.verticalCtas.length === 0 &&
      home.primaryDarkOnDark.length === 0 &&
      home.homeActionFirst &&
      /미수락|Awaiting accept|긴급/.test(homeText) &&
      /오늘 생성|Created today/.test(homeText);
    if (!homeOk) fail(`${w}-HOME: overflow=${home.overflowX} vert=${home.verticalCtas.length} contrast=${home.primaryDarkOnDark.length} actionFirst=${home.homeActionFirst}`);
    widthReport.pages.home = { ok: homeOk, ...home, bodyText: undefined };

    // ORDERS
    await go("/stores/owner/orders", { waitText: "Review orders|주문|Preparing|조리|New" });
    const orders = await pageMetrics("orders");
    await page.screenshot({ path: resolve(OUT, `${w}-orders.png`), fullPage: false });
    const ordersOk = orders.overflowX <= 2 && orders.verticalCtas.length === 0;
    if (!ordersOk) fail(`${w}-ORDERS overflow/vert`);
    widthReport.pages.orders = { ok: ordersOk, overflowX: orders.overflowX, verticalCtas: orders.verticalCtas, ordersAction: orders.ordersAction };

    // PRODUCTS
    await go("/stores/owner/products", { waitText: "상품|Product|Register|등록|Category|카테고리" });
    const products = await pageMetrics("products");
    await page.screenshot({ path: resolve(OUT, `${w}-products.png`), fullPage: false });
    const productsOk = products.overflowX <= 2 && products.verticalCtas.length === 0 && products.primaryDarkOnDark.length === 0;
    if (!productsOk) fail(`${w}-PRODUCTS`);
    widthReport.pages.products = { ok: productsOk, overflowX: products.overflowX, verticalCtas: products.verticalCtas };

    // CUSTOMERS — prefer hub URL; if soft-nav drifts, follow bottom-nav customers link
    await go("/stores/owner/customer-care", { waitText: "Order chat|주문 채팅|Store customers|매장 고객|DIBAY Support|고객센터" });
    if (!/\/customer-care(\/|\?|$)/.test(page.url())) {
      const careLink = page.locator('a[href*="/stores/owner/customer-care"]').first();
      if ((await careLink.count()) > 0) {
        await careLink.click({ force: true }).catch(() => null);
        await page.waitForTimeout(800);
      }
    }
    await page
      .waitForSelector("[data-owner-customer-care-hub]", { timeout: 30000 })
      .catch(() => null);
    const customers = await pageMetrics("customers");
    const customersUrl = page.url();
    await page.screenshot({ path: resolve(OUT, `${w}-customers.png`), fullPage: false });
    const customersOk =
      customers.overflowX <= 2 &&
      customers.careHub === true &&
      /\/customer-care(\/|\?|$)/.test(customersUrl);
    if (!customersOk) fail(`${w}-CUSTOMERS careHub=${customers.careHub} url=${customersUrl}`);
    widthReport.pages.customers = {
      ok: customersOk,
      careHub: customers.careHub,
      careAction: customers.careAction,
      url: customersUrl,
    };

    // FINANCE
    await go("/stores/owner/finance", { waitText: "Cash로 전환|Convert to Cash|충전|Top up|Coin" });
    const finance = await pageMetrics("finance");
    await page.screenshot({ path: resolve(OUT, `${w}-finance.png`), fullPage: false });
    const ft = finance.bodyText;
    const financeLabelsStrict =
      /Cash로 전환|Convert to Cash/.test(ft) &&
      /충전|Top up/.test(ft) &&
      /내역|History/.test(ft) &&
      (/충전 신청|미리보기|Preview|외부 출금|Withdraw|External payout|환전/.test(ft));
    const financeOk =
      finance.overflowX <= 2 &&
      finance.verticalCtas.length === 0 &&
      finance.primaryDarkOnDark.length === 0 &&
      financeLabelsStrict;
    if (!financeOk) {
      fail(
        `${w}-FINANCE labels=${financeLabelsStrict} sample=${ft.slice(0, 280).replace(/\n/g, " | ")} vert=${JSON.stringify(finance.verticalCtas)} contrast=${JSON.stringify(finance.primaryDarkOnDark)}`
      );
    }
    widthReport.pages.finance = {
      ok: financeOk,
      overflowX: finance.overflowX,
      verticalCtas: finance.verticalCtas,
      primaryDarkOnDark: finance.primaryDarkOnDark,
      financeLabels: financeLabelsStrict,
    };

    // SETTLEMENT
    await go("/stores/owner/settlements", { waitText: "Read only|조회 전용|Settlement|정산" });
    const settlement = await pageMetrics("settlement");
    await page.screenshot({ path: resolve(OUT, `${w}-settlement.png`), fullPage: false });
    const settlementOk = settlement.overflowX <= 2 && (settlement.settlementRo || /조회 전용|Read only|정산|Settlement/.test(settlement.bodyText));
    if (!settlementOk) fail(`${w}-SETTLEMENT`);
    widthReport.pages.settlement = { ok: settlementOk, settlementRo: settlement.settlementRo };

    // DRAWER (open menu)
    await go("/stores/owner", { waitText: "Created today|오늘 생성|Awaiting accept|미수락" });
    const menuBtn = page.locator('header button[aria-haspopup="dialog"], header button[aria-label*="menu" i], header button[aria-label*="메뉴" i]').first();
    if ((await menuBtn.count()) > 0) {
      await menuBtn.click({ force: true }).catch(() => null);
      await page.waitForTimeout(600);
    }
    const drawer = await page.evaluate(() => {
      const text = document.body?.innerText || "";
      const hasPromo = /프로모션|Promotions|PROMOTIONS|쿠폰|Coupons|배너|Banners|공지/.test(text);
      const hasOpsDump = /OPERATIONS|운영/.test(text);
      const hasOrders = /주문 관리|Orders|배달 주문|Delivery orders/.test(text);
      const hasProducts = /상품 관리|Product management|Products/.test(text);
      const hasProductNew = /상품 등록|Add product/.test(text);
      const hasSettlements = /정산|Settlements/.test(text);
      const open =
        !!document.querySelector('[aria-modal="true"], [data-owner-ops-drawer], [data-biz-drawer]') ||
        hasOpsDump;
      return {
        open,
        hasPromo,
        hasOpsDump,
        hasOrders,
        hasProducts,
        hasProductNew,
        hasSettlements,
        textSample: text.slice(0, 1200),
      };
    });
    await page.screenshot({ path: resolve(OUT, `${w}-drawer.png`), fullPage: false });
    const drawerOk =
      drawer.open &&
      drawer.hasPromo &&
      drawer.hasOrders &&
      drawer.hasProducts &&
      drawer.hasProductNew &&
      drawer.hasSettlements;
    if (!drawerOk) {
      fail(
        `${w}-DRAWER open=${drawer.open} promo=${drawer.hasPromo} orders=${drawer.hasOrders} products=${drawer.hasProducts} productNew=${drawer.hasProductNew} settlements=${drawer.hasSettlements}`
      );
    }
    widthReport.pages.drawer = { ok: drawerOk, ...drawer };
    await page.keyboard.press("Escape").catch(() => null);

    // BADGES on home (soft evidence)
    await go("/stores/owner", { waitText: "Created today|오늘 생성|Awaiting accept|미수락" });
    await page.waitForTimeout(1500);
    const badges = await page.evaluate(() => {
      const orderBadge = document.querySelector('[data-owner-bottom-nav-badge="orders"]');
      const custBadge = document.querySelector('[data-owner-bottom-nav-badge="customers"]');
      return {
        orderBadge: orderBadge ? (orderBadge.textContent || "").trim() : null,
        customersBadge: custBadge ? (custBadge.textContent || "").trim() : null,
        allHubBadges: [...document.querySelectorAll(".bottom-nav-hub-badge")].map((el) => el.textContent?.trim()),
      };
    });
    widthReport.badges = badges;

    report.widths[String(w)] = widthReport;
    const allOk = Object.values(widthReport.pages).every((p) => p && p.ok !== false);
    report.pages[String(w)] = allOk ? "PASS" : "FAIL";
  }

  report.final = report.firstDivergence ? "FAIL" : "PASS";
} catch (e) {
  report.final = "FAIL";
  report.firstDivergence = report.firstDivergence || String(e?.message || e);
} finally {
  writeFileSync(resolve(OUT, "responsive-report.json"), JSON.stringify(report, null, 2));
  await browser.close();
}

console.log(JSON.stringify({ final: report.final, firstDivergence: report.firstDivergence, pages: report.pages }, null, 2));
process.exit(report.final === "PASS" ? 0 : 1);

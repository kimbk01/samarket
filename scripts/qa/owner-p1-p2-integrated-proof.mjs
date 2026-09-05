/**
 * Owner Admin P1/P2 integrated local proof (affected surfaces).
 * PLAYWRIGHT_BASE_URL=http://localhost:3000 node --env-file=.env.local scripts/qa/owner-p1-p2-integrated-proof.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const OUT = resolve(process.cwd(), "docs/perf/owner-p1-p2-integrated");
const STORE = "19085860-52d2-4183-b033-e71fcb58bcec";
const EMAIL = "sadads@adsasdsa.com";

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

loadEnv();
mkdirSync(OUT, { recursive: true });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});
const { data } = await sb.auth.signInWithPassword({ email: EMAIL, password: "1234" });
const session = data.session;
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const { data: pr } = await admin.from("profiles").select("active_session_id").eq("id", session.user.id).maybeSingle();
const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
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
    domain: "localhost",
    path: "/",
    expires: session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
    httpOnly: false,
    secure: false,
    sameSite: "Lax",
  },
  ...(pr?.active_session_id
    ? [
        {
          name: "samarket_active_session_id",
          value: String(pr.active_session_id),
          domain: "localhost",
          path: "/",
          expires: Math.floor(Date.now() / 1000) + 86400 * 7,
          httpOnly: false,
          secure: false,
          sameSite: "Lax",
        },
      ]
    : []),
]);
const page = await context.newPage();
const report = { widths: {}, flows: {}, final: "FAIL" };

async function go(path) {
  await page.goto(`${ORIGIN}${path}${path.includes("?") ? "&" : "?"}storeId=${STORE}`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await page.waitForFunction(() => document.body?.hasAttribute("data-owner-compact-shell"), null, {
    timeout: 60000,
  }).catch(() => null);
  await dismiss(page);
  await page.waitForTimeout(400);
}

try {
  for (const w of [390, 768, 1024]) {
    await page.setViewportSize({ width: w, height: 900 });
    await go("/stores/owner");
    const home = await page.evaluate(() => {
      const status = !!document.querySelector("[data-owner-home-store-status]");
      const actionFirst = !!document.querySelector("[data-owner-home-action-first]");
      const financeSecondary = !!document.querySelector("[data-owner-home-secondary-finance]");
      const financeTop = document.querySelector("[data-owner-finance-home-cards]");
      const statusEl = document.querySelector("[data-owner-home-store-status]");
      const order =
        statusEl && financeTop
          ? statusEl.compareDocumentPosition(financeTop) & Node.DOCUMENT_POSITION_FOLLOWING
            ? "status_before_finance"
            : "finance_before_status"
          : "unknown";
      const nav = !!document.querySelector("nav.owner-mobile-bottom-nav");
      const header = !!document.querySelector(".owner-compact-shell__header");
      return { status, actionFirst, financeSecondary, order, nav, header };
    });
    await page.screenshot({ path: resolve(OUT, `${w}-home.png`) });

    await go("/stores/owner/orders");
    const orders = await page.evaluate(() => ({
      kpiCompact: !!document.querySelector('[data-owner-orders-kpi="compact"]'),
      stale: document.querySelectorAll("[data-owner-order-stale]").length,
      nav: !!document.querySelector("nav.owner-mobile-bottom-nav"),
    }));
    await page.screenshot({ path: resolve(OUT, `${w}-orders.png`) });

    await go("/stores/owner/customer-care");
    const care = await page.evaluate(() => ({
      entries: document.querySelectorAll("[data-owner-care-entry]").length,
      storeAud: document.querySelectorAll('[data-owner-care-audience="store_customer"]').length,
      dibayAud: document.querySelectorAll('[data-owner-care-audience="dibay_support"]').length,
    }));

    await go("/stores/owner/settings");
    const manage = await page.evaluate(() => ({
      hub: !!document.querySelector("[data-owner-manage-hub]"),
      status: !!document.querySelector("[data-owner-manage-settings]"),
      entries: document.querySelectorAll("[data-owner-manage-entry]").length,
    }));

    await go("/stores/owner/finance");
    const finance = await page.evaluate(() => ({
      root: !!document.querySelector("[data-owner-store-finance]"),
      cashManage: !!document.querySelector("#cash-manage"),
      withdraw: !!document.querySelector("#coin-withdraw"),
    }));

    report.widths[w] = {
      home,
      orders,
      care,
      manage,
      finance,
      homePass:
        home.status &&
        home.actionFirst &&
        home.financeSecondary &&
        home.order === "status_before_finance" &&
        home.nav &&
        home.header,
      ordersPass: orders.nav && orders.kpiCompact,
      carePass: care.entries >= 4 && care.storeAud >= 1 && care.dibayAud >= 1,
      managePass: manage.hub && manage.status && manage.entries >= 3,
      financePass: finance.root && finance.cashManage && finance.withdraw,
    };
  }

  await page.setViewportSize({ width: 390, height: 900 });
  await go("/stores/owner");
  await dismiss(page);
  await page.locator("nav.owner-mobile-bottom-nav a[href*='/orders']").first().click({ force: true });
  await page.waitForTimeout(800);
  report.flows.homeToOrders = page.url().includes("/orders") ? "PASS" : "FAIL";

  await go("/stores/owner/products?status=sold_out");
  report.flows.productsSoldOutFilter = page.url().includes("status=sold_out") ? "PASS" : "FAIL";
  await page.screenshot({ path: resolve(OUT, "390-products-sold-out.png") });

  await go("/stores/owner/settlements");
  report.flows.settlementReadonly =
    (await page.locator("[data-owner-settlement-readonly]").count()) > 0 ? "PASS" : "FAIL";

  const fails = [];
  for (const w of [390, 768, 1024]) {
    const r = report.widths[w];
    if (!r.homePass) fails.push(`${w}:home`);
    if (!r.ordersPass) fails.push(`${w}:orders`);
    if (!r.carePass) fails.push(`${w}:care`);
    if (!r.managePass) fails.push(`${w}:manage`);
    if (!r.financePass) fails.push(`${w}:finance`);
  }
  if (report.flows.homeToOrders !== "PASS") fails.push("flow:orders");
  if (report.flows.productsSoldOutFilter !== "PASS") fails.push("flow:products");
  if (report.flows.settlementReadonly !== "PASS") fails.push("flow:settlement");

  report.firstDivergence = fails[0] || null;
  report.final = fails.length ? "FAIL" : "PASS";
} finally {
  writeFileSync(resolve(OUT, "report.json"), JSON.stringify(report, null, 2));
  await browser.close();
}

console.log(JSON.stringify({ final: report.final, firstDivergence: report.firstDivergence }, null, 2));
if (report.final !== "PASS") process.exitCode = 1;

/**
 * P0 Owner Shell — focused visual close (dismiss overlays first).
 * PLAYWRIGHT_BASE_URL=http://localhost:3000 node --env-file=.env.local scripts/qa/owner-p0-shell-visual-close-focused.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const OUT = resolve(process.cwd(), "docs/perf/owner-p0-shell-visual");
const STORE = process.env.OWNER_P0_STORE_ID || "19085860-52d2-4183-b033-e71fcb58bcec";
const EMAIL = "sadads@adsasdsa.com";
const WIDTHS = [390, 768, 1024];

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

async function login() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  for (const password of [process.env.E2E_TEST_PASSWORD, "1234", "DibayQa1!"].filter(Boolean)) {
    const { data, error } = await sb.auth.signInWithPassword({ email: EMAIL, password });
    if (!error && data.session) return data.session;
  }
  throw new Error("login_failed");
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
      value: String(sessionId),
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

async function dismissBlockingOverlays(page) {
  for (let i = 0; i < 4; i++) {
    const close = page
      .getByRole("button", { name: /Close|닫기|Don't show|오늘 하루|Hide/i })
      .or(page.locator("button").filter({ hasText: /Close|닫기|Don't show today|오늘 하루 보지 않기/i }));
    if ((await close.count()) > 0 && (await close.first().isVisible().catch(() => false))) {
      await close.first().click({ force: true }).catch(() => null);
      await page.waitForTimeout(400);
      continue;
    }
    // Next.js issue badge
    const issue = page.locator("button").filter({ hasText: /Issue/i });
    if ((await issue.count()) > 0 && (await issue.first().isVisible().catch(() => false))) {
      await page.keyboard.press("Escape").catch(() => null);
      await page.waitForTimeout(200);
    }
    break;
  }
}

async function ready(page) {
  await page
    .waitForFunction(
      () =>
        document.body?.hasAttribute("data-owner-compact-shell") &&
        !!document.querySelector("nav.owner-mobile-bottom-nav, nav.app-bottom-nav-shell--delivery") &&
        (document.body.innerText?.trim().length || 0) > 40,
      null,
      { timeout: 90000 }
    )
    .catch(() => null);
  await dismissBlockingOverlays(page);
  await page.waitForTimeout(300);
}

async function go(page, path) {
  await page.goto(`${ORIGIN}${path}${path.includes("?") ? "&" : "?"}storeId=${STORE}`, {
    waitUntil: "commit",
    timeout: 120000,
  });
  await ready(page);
}

async function measureShell(page, width, id, path) {
  await page.setViewportSize({ width, height: 900 });
  await go(page, path);
  await dismissBlockingOverlays(page);

  const m = await page.evaluate(() => {
    const header = document.querySelector("header.owner-compact-shell__header, .owner-compact-shell__header");
    const nav = document.querySelector("nav.owner-mobile-bottom-nav, nav.app-bottom-nav-shell--delivery");
    const hr = header?.getBoundingClientRect();
    const nr = nav?.getBoundingClientRect();
    const first = document.querySelector(
      ".owner-compact-shell__scroll > *, main .owner-compact-shell__column > *, [data-owner-customer-care-hub] > *, [data-owner-store-finance]"
    );
    const fr = first?.getBoundingClientRect();
    const pbEl = document.querySelector(".owner-compact-shell__main-pb, .owner-compact-shell__main");
    const pb = pbEl ? parseFloat(getComputedStyle(pbEl).paddingBottom || "0") : 0;
    const fab = document.querySelector('[data-support-fab-host="1"]');
    const fabr = fab?.getBoundingClientRect();
    const clearance = fab?.getAttribute("data-owner-nav-clearance");
    return {
      hasHeader: !!hr && hr.height > 20,
      hasNav: !!nr && nr.height >= 48 && nr.bottom <= window.innerHeight + 2 && nr.top < window.innerHeight,
      contentBelowHeader: !hr || !fr ? true : fr.top + 1 >= hr.bottom - 2,
      bottomPad: pb,
      fab: fabr
        ? {
            top: fabr.top,
            bottom: fabr.bottom,
            clearance,
            clearOfNav: nr ? fabr.bottom <= nr.top + 1 : null,
          }
        : null,
      navTop: nr?.top ?? null,
      tabs: nav
        ? [...nav.querySelectorAll("a, button")]
            .map((el) => (el.getAttribute("aria-label") || el.textContent || "").trim())
            .filter(Boolean)
        : [],
    };
  });

  await page.screenshot({ path: resolve(OUT, `clean-${width}-${id}.png`), fullPage: false });
  return m;
}

const report = {
  localDevUrl: ORIGIN,
  codeChangeDuringVisual:
    "lib/business/owner-basic-info-guard.ts (+ contract test) — P0 primary tabs keep bottom nav",
  widths: {},
  primaryNav: {},
  customerDomainEntry: null,
  storeChipI18n: null,
  fabOwnerNav: null,
  fabDrawer: null,
  fabModal: null,
  navDuplication: null,
  headerOcclusion: null,
  bottomContentOcclusion: null,
  final: null,
  firstDivergence: null,
};

loadEnv();
mkdirSync(OUT, { recursive: true });

const session = await login();
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const { data: pr } = await admin.from("profiles").select("active_session_id").eq("id", session.user.id).maybeSingle();
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
await context.addCookies(cookies(session, pr?.active_session_id ? String(pr.active_session_id) : ""));
const page = await context.newPage();

try {
  for (const w of WIDTHS) {
    report.widths[w] = {
      HOME: await measureShell(page, w, "home", "/stores/owner"),
      ORDERS: await measureShell(page, w, "orders", "/stores/owner/orders"),
      CUSTOMERS: await measureShell(page, w, "customers", "/stores/owner/customer-care"),
      MANAGE: await measureShell(page, w, "manage", "/stores/owner/settings"),
    };
  }

  // Primary nav clicks @390
  await page.setViewportSize({ width: 390, height: 900 });
  await go(page, "/stores/owner");
  await dismissBlockingOverlays(page);
  const clicks = [
    ["ORDERS", /Orders|주문/i, "/stores/owner/orders"],
    ["PRODUCTS", /Products|상품/i, "/stores/owner/products"],
    ["HOME", /Home|홈/i, "/stores/owner"],
    ["CUSTOMERS", /Customers|고객/i, "/stores/owner/customer-care"],
    ["MANAGE", /Manage|관리|Settings/i, "/stores/owner/settings"],
  ];
  for (const [id, re, expectPath] of clicks) {
    await go(page, "/stores/owner");
    await dismissBlockingOverlays(page);
    const nav = page.locator("nav.owner-mobile-bottom-nav, nav.app-bottom-nav-shell--delivery");
    const el = nav.locator("a, button").filter({ hasText: re }).first();
    if ((await el.count()) === 0) {
      report.primaryNav[id] = { status: "FAIL", reason: "missing" };
      continue;
    }
    await el.click({ force: true });
    await page.waitForTimeout(700);
    await ready(page);
    const ok = page.url().includes(expectPath.replace(/\?.*/, ""));
    // home exact
    const pathOk =
      id === "HOME"
        ? /\/stores\/owner\/?(\?|$)/.test(page.url().replace(ORIGIN, ""))
        : page.url().includes(expectPath);
    report.primaryNav[id] = { status: pathOk || ok ? "PASS" : "FAIL", url: page.url() };
  }

  // Customer domain
  await go(page, "/stores/owner/customer-care");
  await dismissBlockingOverlays(page);
  const entries = {
    orderChat: await page.locator('[data-owner-care-entry="order-chat"]').count(),
    storeInquiry: await page.locator('[data-owner-care-entry="store-inquiry"]').count(),
    reviews: await page.locator('[data-owner-care-entry="reviews"]').count(),
    customerCenter: await page.locator('[data-owner-care-entry="customer-center"]').count(),
    storeAud: await page.locator('[data-owner-care-audience="store_customer"]').count(),
    dibayAud: await page.locator('[data-owner-care-audience="dibay_support"]').count(),
  };
  report.customerDomainEntry = {
    status:
      entries.orderChat &&
      entries.storeInquiry &&
      entries.reviews &&
      entries.customerCenter &&
      entries.storeAud &&
      entries.dibayAud
        ? "PASS"
        : "FAIL",
    entries,
  };
  await page.screenshot({ path: resolve(OUT, "clean-390-customers-domain.png") });

  // Support modal + chip
  await go(page, "/stores/owner/customer-care/customer-center");
  await dismissBlockingOverlays(page);
  const inquire = page.locator("[data-owner-support-inquire]").or(
    page.getByRole("button", { name: /문의|Inquire|Support|상담/i })
  );
  if ((await inquire.count()) > 0) {
    await inquire.first().click({ force: true });
    await page.waitForTimeout(800);
  }
  const bareStore = await page.locator("span").filter({ hasText: /^Store$/ }).count();
  const hasModal = await page.locator('[role="dialog"], [data-dibay-overlay]').count();
  const fabHidden =
    (await page.locator('[data-support-fab-host="1"]').count()) === 0 ||
    !(await page.locator('[data-support-fab-host="1"]').isVisible().catch(() => false));
  report.storeChipI18n = bareStore > 0 ? "FAIL" : "PASS";
  report.fabModal = fabHidden ? "PASS" : "FAIL";
  await page.screenshot({ path: resolve(OUT, "clean-390-support-modal.png") });
  await page.keyboard.press("Escape");

  // Drawer + duplication
  await go(page, "/stores/owner");
  await dismissBlockingOverlays(page);
  const menu = page.locator(".owner-compact-shell__header button").last();
  await menu.click({ force: true });
  await page.waitForTimeout(500);
  const drawer = page.locator(".owner-ops-drawer-panel");
  const open = (await drawer.getAttribute("data-open")) === "true";
  const text = open ? await drawer.innerText() : "";
  const dup = /운영 · 심사|Ops & review/.test(text) && /배달 운영|Delivery settings/.test(text);
  report.navDuplication = dup ? "FAIL" : "PASS";
  const drawerOk =
    open &&
    /리뷰|Reviews/.test(text) &&
    /카테고리|Categor/.test(text) &&
    /쿠폰|Coupon/.test(text) &&
    /상품권|Gift/.test(text) &&
    /배너|Banner/.test(text) &&
    /재무|Finance|COIN|캐시|Cash/.test(text) &&
    /정산|Settlement/.test(text) &&
    /광고|Ads/.test(text) &&
    /알림|Notification/.test(text);
  report.widths[390].DRAWER = { status: drawerOk && !dup ? "PASS" : "FAIL", open, dup };
  await page.screenshot({ path: resolve(OUT, "clean-390-drawer.png") });

  // FAB clearance on finance
  await go(page, "/stores/owner/finance");
  await dismissBlockingOverlays(page);
  const fabM = await page.evaluate(() => {
    const fab = document.querySelector('[data-support-fab-host="1"]');
    const nav = document.querySelector("nav.owner-mobile-bottom-nav, nav.app-bottom-nav-shell--delivery");
    if (!fab || !nav) return { ok: false, reason: !fab ? "fab_missing" : "nav_missing" };
    const fr = fab.getBoundingClientRect();
    const nr = nav.getBoundingClientRect();
    const zFab = Number(getComputedStyle(fab).zIndex) || 0;
    return {
      ok: fr.bottom <= nr.top + 1 && fab.getAttribute("data-owner-nav-clearance") === "1",
      gap: nr.top - fr.bottom,
      clearance: fab.getAttribute("data-owner-nav-clearance"),
      zFab,
    };
  });
  report.fabOwnerNav = fabM.ok ? "PASS" : "FAIL";
  report.widths[390].FAB = fabM;
  await page.screenshot({ path: resolve(OUT, "clean-390-finance-fab.png") });

  // FAB vs drawer z
  const menu2 = page.locator(".owner-compact-shell__header button").last();
  await menu2.click({ force: true });
  await page.waitForTimeout(400);
  const z = await page.evaluate(() => {
    const fab = document.querySelector('[data-support-fab-host="1"]');
    const panel = document.querySelector(".owner-ops-drawer-panel");
    return {
      zFab: fab ? Number(getComputedStyle(fab).zIndex) || 0 : null,
      zDrawer: panel ? Number(getComputedStyle(panel).zIndex) || 0 : null,
      open: panel?.getAttribute("data-open"),
    };
  });
  report.fabDrawer =
    z.zFab != null && z.zDrawer != null && z.zFab < z.zDrawer && z.open === "true" ? "PASS" : "FAIL";

  // Aggregate
  const shells = WIDTHS.flatMap((w) =>
    ["HOME", "ORDERS", "CUSTOMERS", "MANAGE"].map((k) => report.widths[w][k])
  );
  report.headerOcclusion = shells.every((s) => s.hasHeader && s.contentBelowHeader) ? "PASS" : "FAIL";
  report.bottomContentOcclusion = shells.every((s) => s.hasNav && s.bottomPad >= 50) ? "PASS" : "FAIL";

  const primaryOk = Object.values(report.primaryNav).every((v) => v.status === "PASS");
  const fails = [];
  if (report.headerOcclusion !== "PASS") fails.push("header");
  if (report.bottomContentOcclusion !== "PASS") fails.push("bottom");
  if (!primaryOk) fails.push("primary_nav");
  if (report.customerDomainEntry.status !== "PASS") fails.push("customer");
  if (report.storeChipI18n !== "PASS") fails.push("chip");
  if (report.fabOwnerNav !== "PASS") fails.push("fab_nav");
  if (report.fabDrawer !== "PASS") fails.push("fab_drawer");
  if (report.fabModal !== "PASS") fails.push("fab_modal");
  if (report.navDuplication !== "PASS") fails.push("dup");
  if (report.widths[390].DRAWER?.status !== "PASS") fails.push("drawer");

  report.firstDivergence = fails[0] || null;
  report.final = fails.length ? "FAIL" : "PASS";
} finally {
  writeFileSync(resolve(OUT, "p0-visual-focused-report.json"), JSON.stringify(report, null, 2));
  await browser.close();
}

console.log(JSON.stringify({ final: report.final, firstDivergence: report.firstDivergence }, null, 2));
if (report.final !== "PASS") process.exitCode = 1;

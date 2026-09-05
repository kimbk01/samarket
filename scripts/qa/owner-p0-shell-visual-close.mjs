/**
 * P0 Owner Shell — local visual proof ONLY (390 / 768 / 1024).
 * No domain E2E, no backend retest.
 *
 * PLAYWRIGHT_BASE_URL=http://localhost:3000 node --env-file=.env.local scripts/qa/owner-p0-shell-visual-close.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const OUT_DIR = resolve(process.cwd(), "docs/perf/owner-p0-shell-visual");
const REPORT_PATH = resolve(OUT_DIR, "p0-visual-report.json");
const STORE_ID = process.env.OWNER_P0_STORE_ID || "19085860-52d2-4183-b033-e71fcb58bcec";
const OWNER_EMAIL =
  process.env.OWNER_P0_EMAIL ||
  process.env.E2E_TEST_USERNAME ||
  "sadads@adsasdsa.com";

const WIDTHS = [390, 768, 1024];
const HEIGHT = 900;

const report = {
  head: null,
  localDevUrl: ORIGIN,
  storeId: STORE_ID,
  widths: {},
  primaryNav: {},
  fabOwnerNav: null,
  fabDrawer: null,
  fabModal: null,
  headerOcclusion: null,
  bottomContentOcclusion: null,
  customerDomainEntry: null,
  storeChipI18n: null,
  navDuplication: null,
  codeChangeDuringVisual: "NONE",
  firstDivergence: null,
  final: null,
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

async function loginSession(email) {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  for (const password of passwords()) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (!error && data.session) return data.session;
  }
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  let tokenHash = "";
  try {
    const u = new URL(String(link?.properties?.action_link || ""));
    tokenHash = u.searchParams.get("token") || u.searchParams.get("token_hash") || "";
  } catch {
    tokenHash = "";
  }
  if (linkErr || !tokenHash) throw new Error(`login_failed:${email}:${linkErr?.message || "no_token"}`);
  const { data: verified, error: otpErr } = await sb.auth.verifyOtp({ token_hash: tokenHash, type: "email" });
  if (otpErr || !verified.session) throw new Error(`otp_failed:${email}:${otpErr?.message}`);
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

function withStore(path) {
  const sep = path.includes("?") ? "&" : "?";
  return `${ORIGIN}${path}${sep}storeId=${encodeURIComponent(STORE_ID)}`;
}

async function waitReady(page) {
  await page
    .waitForFunction(
      () =>
        Boolean(document.body?.hasAttribute("data-owner-compact-shell")) &&
        Boolean(document.querySelector("nav.owner-mobile-bottom-nav, nav.app-bottom-nav-shell--delivery")) &&
        (document.body?.innerText?.trim()?.length || 0) > 40,
      null,
      { timeout: 90000 }
    )
    .catch(() => null);
  await page.waitForTimeout(500);
  const url = page.url();
  const text = await page.locator("body").innerText().catch(() => "");
  if (/\/login/.test(url) || /로그인|Sign in|auth_required/i.test(text)) {
    throw new Error(`auth_not_applied:${url}:${text.slice(0, 200)}`);
  }
}

async function gotoOwner(page, path) {
  const url = withStore(path);
  await page.goto(url, { waitUntil: "commit", timeout: 120000 });
  await waitReady(page);
}

async function box(page, sel) {
  const el = page.locator(sel).first();
  if ((await el.count()) === 0) return null;
  // scroll-hidden nav may fail isVisible — still measure box if attached
  const attached = await el.evaluate((n) => n.isConnected).catch(() => false);
  if (!attached) return null;
  return el.boundingBox();
}

async function ownerHeaderBox(page) {
  return (
    (await box(page, "body > header.owner-compact-shell__header")) ||
    (await box(page, "header.owner-compact-shell__header")) ||
    (await box(page, ".owner-compact-shell__header")) ||
    (await box(page, 'header[class*="owner-compact"]'))
  );
}

async function ownerNavBox(page) {
  return (
    (await box(page, "body > nav.owner-mobile-bottom-nav")) ||
    (await box(page, "nav.owner-mobile-bottom-nav")) ||
    (await box(page, "nav.app-bottom-nav-shell--delivery")) ||
    (await box(page, '[class*="owner-mobile-bottom-nav"]'))
  );
}

async function proveSurface(page, width, surfaceId, path) {
  await page.setViewportSize({ width, height: HEIGHT });
  await gotoOwner(page, path);

  const header = await ownerHeaderBox(page);
  const nav = await ownerNavBox(page);
  const main =
    (await box(page, ".owner-compact-shell__main")) ||
    (await box(page, "main")) ||
    (await box(page, "[data-owner-customer-care-hub]")) ||
    (await box(page, "[data-owner-store-finance]"));

  const firstContent = page.locator("main *, [data-owner-customer-care-hub] *, .owner-compact-shell__scroll *").first();
  const firstBox = (await firstContent.count()) ? await firstContent.boundingBox() : null;

  const fabHost = page.locator('[data-support-fab-host="1"]');
  const fabVisible = (await fabHost.count()) > 0 && (await fabHost.isVisible().catch(() => false));
  const fabBox = fabVisible ? await fabHost.boundingBox() : null;

  const HEADER_VISIBLE = Boolean(header && header.height > 20);
  let FIRST_CONTENT_NOT_HIDDEN = true;
  if (header && firstBox) {
    FIRST_CONTENT_NOT_HIDDEN = firstBox.y + 2 >= header.y + header.height - 1;
  }
  const BOTTOM_NAV_VISIBLE = Boolean(nav && nav.height >= 50);
  let BOTTOM_CONTENT_CLEAR = true;
  if (nav) {
    const pad = await page.evaluate(() => {
      const main = document.querySelector(".owner-compact-shell__main, .owner-compact-shell__main-pb, main");
      if (!main) return null;
      const pb = parseFloat(getComputedStyle(main).paddingBottom || "0");
      return pb;
    });
    BOTTOM_CONTENT_CLEAR = pad == null ? true : pad >= 50;
  }

  let FAB_CLEAR_OF_BOTTOM_NAV = "N/A";
  if (fabBox && nav) {
    const clear = fabBox.y + fabBox.height <= nav.y + 1;
    FAB_CLEAR_OF_BOTTOM_NAV = clear ? "PASS" : "FAIL";
  }

  const shot = resolve(OUT_DIR, `${width}-${surfaceId}.png`);
  await page.screenshot({ path: shot, fullPage: false });

  return {
    path,
    HEADER_VISIBLE: HEADER_VISIBLE ? "PASS" : "FAIL",
    FIRST_CONTENT_NOT_HIDDEN: FIRST_CONTENT_NOT_HIDDEN ? "PASS" : "FAIL",
    BOTTOM_NAV_VISIBLE: BOTTOM_NAV_VISIBLE ? "PASS" : "FAIL",
    BOTTOM_CONTENT_CLEAR: BOTTOM_CONTENT_CLEAR ? "PASS" : "FAIL",
    FAB_CLEAR_OF_BOTTOM_NAV,
    fabPresent: fabVisible,
    shot,
    metrics: {
      header,
      nav,
      fab: fabBox,
      viewport: { width, height: HEIGHT },
    },
  };
}

async function provePrimaryNav(page) {
  await page.setViewportSize({ width: 390, height: HEIGHT });
  await gotoOwner(page, "/stores/owner");

  const tabs = [
    { id: "HOME", expectPath: "/stores/owner", label: /홈|Home/i },
    { id: "ORDERS", expectPath: "/stores/owner/orders", label: /주문|Orders/i },
    { id: "PRODUCTS", expectPath: "/stores/owner/products", label: /상품|Products|Menu/i },
    { id: "CUSTOMERS", expectPath: "/stores/owner/customer-care", label: /고객|Customers/i },
    { id: "MANAGE", expectPath: "/stores/owner/settings", label: /관리|Manage|Store/i },
  ];

  const out = {};
  for (const tab of tabs) {
    const nav = page.locator("nav.owner-mobile-bottom-nav");
    const link = nav.getByRole("link", { name: tab.label }).or(nav.getByRole("button", { name: tab.label }));
    // Home may be button
    const target =
      tab.id === "HOME"
        ? nav.locator('[aria-label]').filter({ hasText: tab.label }).first()
        : nav.locator("a, button").filter({ hasText: tab.label }).first();

    if ((await target.count()) === 0) {
      out[tab.id] = { status: "FAIL", reason: "tab_not_found" };
      continue;
    }
    await target.click({ force: true });
    await page.waitForTimeout(400);
    await waitReady(page).catch(() => null);
    const url = page.url();
    const pathOk = url.includes(tab.expectPath);
    const active =
      (await target.getAttribute("data-active")) === "true" ||
      (await target.getAttribute("aria-current")) === "page";
    out[tab.id] = {
      status: pathOk ? "PASS" : "FAIL",
      url,
      active: active ? "PASS" : "UNKNOWN",
    };
  }
  return out;
}

async function proveCustomerDomain(page) {
  await page.setViewportSize({ width: 390, height: HEIGHT });
  await gotoOwner(page, "/stores/owner/customer-care");

  const entries = {
    orderChat: await page.locator('[data-owner-care-entry="order-chat"]').count(),
    storeInquiry: await page.locator('[data-owner-care-entry="store-inquiry"]').count(),
    reviews: await page.locator('[data-owner-care-entry="reviews"]').count(),
    customerCenter: await page.locator('[data-owner-care-entry="customer-center"]').count(),
  };

  const storeSection = await page.locator('[data-owner-care-audience="store_customer"]').count();
  const dibaySection = await page.locator('[data-owner-care-audience="dibay_support"]').count();

  return {
    status:
      entries.orderChat > 0 &&
      entries.storeInquiry > 0 &&
      entries.reviews > 0 &&
      entries.customerCenter > 0 &&
      storeSection > 0 &&
      dibaySection > 0
        ? "PASS"
        : "FAIL",
    entries,
    storeSection,
    dibaySection,
  };
}

async function proveSupportModal(page) {
  await page.setViewportSize({ width: 390, height: HEIGHT });
  await gotoOwner(page, "/stores/owner/customer-care/customer-center");

  const inquire = page.locator("[data-owner-support-inquire], button").filter({ hasText: /문의|Inquire|Support/i }).first();
  if ((await inquire.count()) === 0) {
    // fallback: any primary CTA
    const any = page.locator("button").filter({ hasText: /문의|상담|Support|Inquire/i }).first();
    if ((await any.count()) === 0) return { status: "FAIL", reason: "no_inquire_cta" };
    await any.click();
  } else {
    await inquire.click();
  }
  await page.waitForTimeout(700);

  const modal = page.locator('[role="dialog"], [data-dibay-overlay], .dibay-overlay-root').first();
  const modalVisible = (await modal.count()) > 0 && (await modal.isVisible().catch(() => false));
  const bodyText = await page.locator("body").innerText();
  // Hardcoded English chip alone is FAIL; i18n "매장" or "Store" via key is OK when lang=en —
  // detect the old bare chip pattern near 문의 유형: require Korean "매장" when UI is ko.
  const hasKoStoreChip = /매장/.test(bodyText);
  const hasBareEnglishOnlyChip = await page
    .locator("span")
    .filter({ hasText: /^Store$/ })
    .count();
  // If language is Korean UI, bare Store chip is FAIL
  const storeChipI18n =
    hasBareEnglishOnlyChip > 0 && !hasKoStoreChip ? "FAIL" : "PASS";

  const fabWhileModal = page.locator('[data-support-fab-host="1"]');
  const fabHidden =
    (await fabWhileModal.count()) === 0 || !(await fabWhileModal.isVisible().catch(() => false));

  const nav = await box(page, "nav.owner-mobile-bottom-nav");
  const modalBox = modalVisible ? await modal.boundingBox() : null;

  await page.screenshot({ path: resolve(OUT_DIR, "390-support-modal.png"), fullPage: false });

  // close
  const close = page.locator('button[aria-label*="닫"], button[aria-label*="Close"], button').filter({ hasText: /^×$|^X$/i }).first();
  if ((await close.count()) > 0) await close.click().catch(() => {});
  else await page.keyboard.press("Escape");

  return {
    status: modalVisible && storeChipI18n === "PASS" && fabHidden ? "PASS" : "FAIL",
    modalVisible,
    storeChipI18n,
    fabHiddenWhileModal: fabHidden ? "PASS" : "FAIL",
    modalBox,
    nav,
  };
}

async function proveDrawer(page) {
  await page.setViewportSize({ width: 390, height: HEIGHT });
  await gotoOwner(page, "/stores/owner");

  // open hamburger
  const menuBtn = page.locator('button[aria-label*="메뉴"], button[aria-label*="Menu"], button[aria-label*="운영"]').first();
  if ((await menuBtn.count()) === 0) {
    // header trailing menu icon
    const headerBtns = page.locator(".owner-compact-shell__header button");
    const n = await headerBtns.count();
    if (n > 0) await headerBtns.nth(n - 1).click();
    else return { status: "FAIL", reason: "menu_button_missing" };
  } else {
    await menuBtn.click();
  }
  await page.waitForTimeout(500);

  const panel = page.locator(".owner-ops-drawer-panel[data-open='true'], .owner-ops-drawer-panel").first();
  const panelOpen =
    (await panel.count()) > 0 &&
    ((await panel.getAttribute("data-open")) === "true" || (await panel.isVisible().catch(() => false)));

  const drawerText = panelOpen ? await panel.innerText() : "";
  const hasReviews = /리뷰|Reviews/.test(drawerText);
  const opsStatusCount = (drawerText.match(/배달 운영|Delivery settings|운영 · 심사|Ops & review/g) || []).length;
  // Should not show both delivery_ops and ops_review labels for same href
  const duplicateOps = /운영 · 심사|Ops & review/.test(drawerText) && /배달 운영|Delivery settings/.test(drawerText);

  const secondary = {
    category: /카테고리|Categor/.test(drawerText),
    coupon: /쿠폰|Coupon/.test(drawerText),
    gift: /상품권|Gift/.test(drawerText),
    banner: /배너|Banner/.test(drawerText),
    finance: /재무|Finance|COIN|캐시|Cash/.test(drawerText),
    settlement: /정산|Settlement/.test(drawerText),
    ads: /광고|Ads/.test(drawerText),
    notifications: /알림|Notification/.test(drawerText),
  };

  // FAB vs drawer: navigate finance first to mount FAB, then open drawer
  await gotoOwner(page, "/stores/owner/finance");
  const fabBefore = page.locator('[data-support-fab-host="1"]');
  const fabWasVisible = (await fabBefore.count()) > 0 && (await fabBefore.isVisible().catch(() => false));

  // reopen drawer on finance
  const headerBtns2 = page.locator(".owner-compact-shell__header button");
  const n2 = await headerBtns2.count();
  if (n2 > 0) await headerBtns2.nth(n2 - 1).click();
  await page.waitForTimeout(500);

  const panel2 = page.locator(".owner-ops-drawer-panel").first();
  const panel2Open = (await panel2.getAttribute("data-open")) === "true";
  const fabDuringDrawer = page.locator('[data-support-fab-host="1"]');
  let FAB_BELOW_DRAWER = "N/A";
  if (fabWasVisible && panel2Open) {
    const fabBox = await fabDuringDrawer.boundingBox().catch(() => null);
    const panelBox = await panel2.boundingBox();
    if (fabBox && panelBox) {
      // FAB should not paint above drawer: either hidden behind / not overlapping panel center
      const overlaps =
        fabBox.x < panelBox.x + panelBox.width &&
        fabBox.x + fabBox.width > panelBox.x &&
        fabBox.y < panelBox.y + panelBox.height &&
        fabBox.y + fabBox.height > panelBox.y;
      // With z-index contract FAB(58) < drawer(1010); if overlap visually FAB must be covered.
      // We check computed z-index.
      const zFab = await fabDuringDrawer.evaluate((el) => Number(getComputedStyle(el).zIndex) || 0);
      const zDrawer = await panel2.evaluate((el) => Number(getComputedStyle(el).zIndex) || 0);
      FAB_BELOW_DRAWER = zFab < zDrawer ? "PASS" : "FAIL";
      if (overlaps && zFab >= zDrawer) FAB_BELOW_DRAWER = "FAIL";
    }
  }

  await page.screenshot({ path: resolve(OUT_DIR, "390-drawer.png"), fullPage: false });

  const secondaryOk = Object.values(secondary).every(Boolean);

  return {
    status: panelOpen && hasReviews && !duplicateOps && secondaryOk ? "PASS" : "FAIL",
    panelOpen,
    hasReviews,
    duplicateOps: duplicateOps ? "FAIL" : "PASS",
    opsStatusLabelHits: opsStatusCount,
    secondary,
    FAB_BELOW_DRAWER,
    fabWasVisible,
  };
}

async function proveFabClearance(page) {
  // Finance enables Support FAB per registry
  await page.setViewportSize({ width: 390, height: HEIGHT });
  await gotoOwner(page, "/stores/owner/finance");

  const fab = page.locator('[data-support-fab-host="1"]');
  const nav = page.locator("nav.owner-mobile-bottom-nav");
  const fabVisible = (await fab.count()) > 0 && (await fab.isVisible().catch(() => false));
  const navVisible = (await nav.count()) > 0 && (await nav.isVisible().catch(() => false));
  if (!fabVisible || !navVisible) {
    return { status: "FAIL", reason: !fabVisible ? "fab_missing" : "nav_missing", clearanceAttr: null };
  }
  const fabBox = await fab.boundingBox();
  const navBox = await nav.boundingBox();
  const clearanceAttr = await fab.getAttribute("data-owner-nav-clearance");
  const clear = fabBox && navBox && fabBox.y + fabBox.height <= navBox.y + 1;
  await page.screenshot({ path: resolve(OUT_DIR, "390-finance-fab.png"), fullPage: false });
  return {
    status: clear && clearanceAttr === "1" ? "PASS" : "FAIL",
    clearanceAttr,
    fabBox,
    navBox,
    gapPx: fabBox && navBox ? navBox.y - (fabBox.y + fabBox.height) : null,
  };
}

async function main() {
  loadEnv();
  mkdirSync(OUT_DIR, { recursive: true });
  try {
    report.head = readFileSync(resolve(process.cwd(), ".git/HEAD"), "utf8").trim();
  } catch {
    report.head = null;
  }

  // wait for origin
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(ORIGIN);
      if (r.status > 0) break;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
    if (i === 59) throw new Error(`origin_unreachable:${ORIGIN}`);
  }

  const session = await loginSession(OWNER_EMAIL.includes("@") ? OWNER_EMAIL : `${OWNER_EMAIL}@manual.local`);
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const { data: pr } = await admin
    .from("profiles")
    .select("active_session_id")
    .eq("id", session.user.id)
    .maybeSingle();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addCookies(cookies(session, pr?.active_session_id ? String(pr.active_session_id) : ""));
  const page = await context.newPage();

  try {
    for (const width of WIDTHS) {
      report.widths[width] = {
        HOME: await proveSurface(page, width, "home", "/stores/owner"),
        ORDERS: await proveSurface(page, width, "orders", "/stores/owner/orders"),
        CUSTOMERS: await proveSurface(page, width, "customers", "/stores/owner/customer-care"),
        MANAGE: await proveSurface(page, width, "manage", "/stores/owner/settings"),
      };
    }

    report.primaryNav = await provePrimaryNav(page);
    report.customerDomainEntry = await proveCustomerDomain(page);
    const support = await proveSupportModal(page);
    report.storeChipI18n = support.storeChipI18n;
    report.fabModal = support.fabHiddenWhileModal;
    report.widths[390].SUPPORT = support;

    const drawer = await proveDrawer(page);
    report.navDuplication = drawer.duplicateOps;
    report.fabDrawer = drawer.FAB_BELOW_DRAWER;
    report.widths[390].DRAWER = drawer;

    const fab = await proveFabClearance(page);
    report.fabOwnerNav = fab.status;
    report.widths[390].FAB_FINANCE = fab;

    // Aggregate header / bottom occlusion across widths
    const allSurfaces = WIDTHS.flatMap((w) =>
      ["HOME", "ORDERS", "CUSTOMERS", "MANAGE"].map((k) => report.widths[w][k])
    );
    report.headerOcclusion = allSurfaces.every(
      (s) => s.HEADER_VISIBLE === "PASS" && s.FIRST_CONTENT_NOT_HIDDEN === "PASS"
    )
      ? "PASS"
      : "FAIL";
    report.bottomContentOcclusion = allSurfaces.every(
      (s) => s.BOTTOM_NAV_VISIBLE === "PASS" && s.BOTTOM_CONTENT_CLEAR === "PASS"
    )
      ? "PASS"
      : "FAIL";

    const primaryOk = Object.values(report.primaryNav).every((v) => v.status === "PASS");
    const widthOk = WIDTHS.every((w) =>
      ["HOME", "ORDERS", "CUSTOMERS", "MANAGE"].every((k) => {
        const s = report.widths[w][k];
        return (
          s.HEADER_VISIBLE === "PASS" &&
          s.FIRST_CONTENT_NOT_HIDDEN === "PASS" &&
          s.BOTTOM_NAV_VISIBLE === "PASS" &&
          s.BOTTOM_CONTENT_CLEAR === "PASS"
        );
      })
    );

    const fails = [];
    if (!widthOk) fails.push("surface_geometry");
    if (!primaryOk) fails.push("primary_nav");
    if (report.customerDomainEntry.status !== "PASS") fails.push("customer_domain");
    if (report.storeChipI18n !== "PASS") fails.push("store_chip");
    if (report.fabOwnerNav !== "PASS") fails.push("fab_nav");
    if (report.fabDrawer !== "PASS" && report.fabDrawer !== "N/A") fails.push("fab_drawer");
    if (report.fabModal !== "PASS") fails.push("fab_modal");
    if (report.navDuplication !== "PASS") fails.push("nav_duplication");
    if (drawer.status !== "PASS") fails.push("drawer");
    if (support.status !== "PASS") fails.push("support_modal");

    report.firstDivergence = fails[0] || null;
    report.final = fails.length === 0 ? "PASS" : "FAIL";
  } finally {
    writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    await browser.close();
  }

  console.log(JSON.stringify({ final: report.final, firstDivergence: report.firstDivergence, report: REPORT_PATH }, null, 2));
  if (report.final !== "PASS") process.exitCode = 1;
}

main().catch((err) => {
  report.final = "FAIL";
  report.firstDivergence = String(err?.message || err);
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.error(err);
  process.exit(1);
});

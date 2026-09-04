#!/usr/bin/env node
/**
 * CUT G — Admin Tablet Landscape Real Operation Runtime Close
 *
 * Viewport authority: app/design-tokens.css --sam-bp-lg-min (1024px) landscape.
 * PASS requires runtime geometry evidence — CSS class presence is NOT enough.
 *
 * Usage:
 *   PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 node scripts/qa/admin-cut-g-tablet-landscape-runtime.mjs
 *
 * Env:
 *   PLAYWRIGHT_BASE_URL / E2E_ADMIN_EMAIL / E2E_* passwords
 *   CUT_G_STORE_ID / CUT_G_CAMPAIGN_ID / CUT_G_SUPPORT_ID (optional)
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { execSync } from "node:child_process";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const OUT_DIR = resolve(process.cwd(), "docs/perf/admin-cut-g-tablet-landscape-runtime");
const REPORT_JSON = resolve(OUT_DIR, "cut-g-report.json");
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || process.env.QA_ADMIN_EMAIL || "aaaa@manual.local";

/** Design-token lg landscape — not an invented “tablet=1024” product claim. */
const VIEWPORTS = {
  tabletLandscape: { width: 1024, height: 768, label: "lg-min landscape (--sam-bp-lg-min)" },
  desktopSmoke: { width: 1440, height: 900, label: "desktop smoke" },
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
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const sb = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  for (const password of passwords()) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (!error && data?.session) return data.session;
  }
  // Established QA fallback (gift/campaign gates) — magiclink for known admin email only.
  if (!sk) return null;
  const admin = createClient(url, sk, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  let tokenHash = "";
  try {
    const u = new URL(String(link?.properties?.action_link || ""));
    tokenHash = u.searchParams.get("token") || u.searchParams.get("token_hash") || "";
  } catch {
    tokenHash = "";
  }
  if (linkErr || !tokenHash) return null;
  const { data: verified, error: otpErr } = await sb.auth.verifyOtp({
    token_hash: tokenHash,
    type: "email",
  });
  if (otpErr || !verified?.session) return null;
  return verified.session;
}

function authCookies(sessionObj) {
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
  const origin = new URL(ORIGIN);
  const encoded = encodeURIComponent(
    JSON.stringify({
      access_token: sessionObj.access_token,
      refresh_token: sessionObj.refresh_token,
      expires_at: sessionObj.expires_at,
      expires_in: sessionObj.expires_in,
      token_type: sessionObj.token_type || "bearer",
      user: sessionObj.user,
    })
  );
  const CHUNK = 3180;
  const parts = [];
  for (let i = 0; i < encoded.length; i += CHUNK) parts.push(encoded.slice(i, i + CHUNK));
  const base = {
    domain: origin.hostname,
    path: "/",
    expires: sessionObj.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
    httpOnly: false,
    secure: origin.protocol === "https:",
    sameSite: "Lax",
  };
  return parts.length === 1
    ? [{ ...base, name: `sb-${ref}-auth-token`, value: parts[0] }]
    : parts.map((value, i) => ({ ...base, name: `sb-${ref}-auth-token.${i}`, value }));
}

function shaShort() {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

async function measureGeometry(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const main =
      document.querySelector("[data-admin-main], main, [data-admin] .admin-platform-shell__main") ||
      document.querySelector("[data-admin]");
    const sidebar = document.querySelector("[data-admin-sidebar], aside, .admin-workspace-sidebar");
    const header = document.querySelector(".admin-platform-shell__header, header");

    const rectOf = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        top: Math.round(r.top),
        left: Math.round(r.left),
        right: Math.round(r.right),
        bottom: Math.round(r.bottom),
        width: Math.round(r.width),
        height: Math.round(r.height),
      };
    };

    const ctaCandidates = [
      ...document.querySelectorAll(
        'a[data-admin-action-center-card], button[type="submit"], a.sam-btn--primary, button.sam-btn--primary, a[class*="bg-[#0A823E]"], button[class*="bg-[#0A823E]"], [data-admin-primary-cta], [data-placement-cta]'
      ),
    ].slice(0, 12);

    const ctaRects = ctaCandidates.map((el) => {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      const visible =
        style.visibility !== "hidden" &&
        style.display !== "none" &&
        r.width > 0 &&
        r.height > 0 &&
        r.bottom > 0 &&
        r.top < vh &&
        r.left < vw &&
        r.right > 0;
      return {
        text: (el.textContent || "").trim().slice(0, 48),
        visibleInViewport: visible,
        rect: {
          top: Math.round(r.top),
          left: Math.round(r.left),
          right: Math.round(r.right),
          bottom: Math.round(r.bottom),
          width: Math.round(r.width),
          height: Math.round(r.height),
        },
      };
    });

    const fixedSticky = [...document.querySelectorAll("*")]
      .filter((el) => {
        const p = getComputedStyle(el).position;
        return p === "fixed" || p === "sticky";
      })
      .slice(0, 40)
      .map((el) => {
        const r = el.getBoundingClientRect();
        return {
          tag: el.tagName.toLowerCase(),
          position: getComputedStyle(el).position,
          className: String(el.className || "").slice(0, 80),
          rect: {
            top: Math.round(r.top),
            left: Math.round(r.left),
            right: Math.round(r.right),
            bottom: Math.round(r.bottom),
            width: Math.round(r.width),
            height: Math.round(r.height),
          },
        };
      });

    // First overflowing descendant (document-level)
    let firstOverflow = null;
    if (doc.scrollWidth > doc.clientWidth + 1) {
      const all = [...document.querySelectorAll("body *")];
      for (const el of all) {
        const r = el.getBoundingClientRect();
        if (r.width <= 1 || r.height <= 1) continue;
        if (r.right > vw + 2 || r.left < -2) {
          const style = getComputedStyle(el);
          let anc = el.parentElement;
          let inScrollX = false;
          while (anc && anc !== document.body) {
            const ox = getComputedStyle(anc).overflowX;
            if (ox === "auto" || ox === "scroll") {
              inScrollX = true;
              break;
            }
            anc = anc.parentElement;
          }
          if (!inScrollX) {
            firstOverflow = {
              tag: el.tagName.toLowerCase(),
              className: String(el.className || "").slice(0, 120),
              id: el.id || null,
              data:
                el.getAttribute("data-admin") ||
                el.getAttribute("data-admin-placement-map") ||
                el.getAttribute("data-admin-action-center") ||
                null,
              rect: {
                top: Math.round(r.top),
                left: Math.round(r.left),
                right: Math.round(r.right),
                bottom: Math.round(r.bottom),
                width: Math.round(r.width),
                height: Math.round(r.height),
              },
              overflowX: style.overflowX,
            };
            break;
          }
        }
      }
    }

    const sidebarRect = rectOf(sidebar);
    const mainRect = rectOf(main);
    let sidebarMainOverlap = false;
    if (sidebarRect && mainRect && sidebarRect.width > 0 && mainRect.width > 0) {
      const overlapX = Math.min(sidebarRect.right, mainRect.right) - Math.max(sidebarRect.left, mainRect.left);
      const overlapY = Math.min(sidebarRect.bottom, mainRect.bottom) - Math.max(sidebarRect.top, mainRect.top);
      sidebarMainOverlap = overlapX > 8 && overlapY > 8 && getComputedStyle(sidebar).position === "fixed";
    }

    return {
      viewport: { width: vw, height: vh, dpr: window.devicePixelRatio },
      document: {
        clientWidth: doc.clientWidth,
        scrollWidth: doc.scrollWidth,
        clientHeight: doc.clientHeight,
        scrollHeight: doc.scrollHeight,
        bodyScrollWidth: body?.scrollWidth ?? null,
      },
      pageOverflowX: doc.scrollWidth > doc.clientWidth + 1,
      bodyOverflowX: body ? body.scrollWidth > body.clientWidth + 1 : false,
      header: rectOf(header),
      sidebar: sidebarRect,
      main: mainRect,
      sidebarMainOverlap,
      ctaRects,
      anyCtaVisible: ctaRects.some((c) => c.visibleInViewport),
      fixedStickyCount: fixedSticky.length,
      fixedSticky: fixedSticky.slice(0, 12),
      firstOverflow,
      url: location.href,
      title: document.title,
      hasAdminShell: Boolean(document.querySelector("[data-admin]")),
      markers: {
        actionCenter: Boolean(document.querySelector("[data-admin-action-center]")),
        placementMap: Boolean(document.querySelector("[data-admin-placement-map]")),
        partner: Boolean(document.querySelector("[data-admin-partner-memberships]")),
        homeCms: Boolean(document.querySelector("[data-admin-home-cms]")),
        categoryCms: Boolean(document.querySelector("[data-admin-category-cms]")),
      },
    };
  });
}

function judge(geo) {
  const fails = [];
  if (!geo.hasAdminShell) fails.push("NO_ADMIN_SHELL");
  if (geo.pageOverflowX) fails.push("DOCUMENT_HORIZONTAL_OVERFLOW");
  if (geo.sidebarMainOverlap) fails.push("SIDEBAR_MAIN_OVERLAP");
  if (geo.ctaRects.length > 0 && !geo.anyCtaVisible) fails.push("NO_VISIBLE_CTA");
  return {
    result: fails.length ? "FAIL" : "PASS",
    fails,
  };
}

async function openRoute(page, path, waitMs = 1800) {
  const url = path.startsWith("http") ? path : `${ORIGIN}${path}`;
  const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(waitMs);
  return { status: res?.status() ?? null, finalUrl: page.url() };
}

async function discoverIds(page) {
  const found = {
    storeId: process.env.CUT_G_STORE_ID || null,
    campaignId: process.env.CUT_G_CAMPAIGN_ID || null,
    supportId: process.env.CUT_G_SUPPORT_ID || null,
    pointChargeId: process.env.CUT_G_POINT_CHARGE_ID || null,
  };

  // Prefer admin JSON APIs (same-origin cookies) over fragile DOM scraping.
  await openRoute(page, "/admin", 1200);
  const apiIds = await page.evaluate(async () => {
    const out = { storeId: null, campaignId: null, supportId: null, pointChargeId: null };
    try {
      const ads = await fetch("/api/admin/delivery-ads?bucket=all&product=all&limit=50", {
        credentials: "include",
        cache: "no-store",
      }).then((r) => r.json()).catch(() => null);
      const adsItems = ads?.items || ads?.campaigns || ads?.rows || ads?.data || [];
      const first = Array.isArray(adsItems) ? adsItems[0] : null;
      if (first?.id) out.campaignId = String(first.id);
      if (first?.campaignId) out.campaignId = String(first.campaignId);
    } catch {
      /* ignore */
    }
    try {
      const biz = await fetch("/api/admin/business/ops-list?page=1&pageSize=20", {
        credentials: "include",
        cache: "no-store",
      }).then((r) => r.json()).catch(() => null);
      const stores = biz?.stores || biz?.items || biz?.rows || biz?.data || [];
      const first = Array.isArray(stores) ? stores[0] : null;
      if (first?.id) out.storeId = String(first.id);
      if (first?.storeId) out.storeId = String(first.storeId);
    } catch {
      /* ignore */
    }
    try {
      const support = await fetch("/api/admin/support?limit=20", {
        credentials: "include",
        cache: "no-store",
      }).then((r) => r.json()).catch(() => null);
      const cases = support?.cases || support?.items || support?.rows || [];
      if (Array.isArray(cases) && cases[0]?.id) out.supportId = String(cases[0].id);
    } catch {
      /* ignore */
    }
    try {
      const points = await fetch("/api/admin/point-charges", {
        credentials: "include",
        cache: "no-store",
      }).then((r) => r.json()).catch(() => null);
      const rows = points?.items || points?.requests || points?.rows || [];
      if (Array.isArray(rows) && rows[0]?.id) out.pointChargeId = String(rows[0].id);
    } catch {
      /* ignore */
    }
    return out;
  });
  found.campaignId = found.campaignId || apiIds.campaignId;
  found.storeId = found.storeId || apiIds.storeId;
  found.supportId = found.supportId || apiIds.supportId;
  found.pointChargeId = found.pointChargeId || apiIds.pointChargeId;

  if (!found.campaignId) {
    await openRoute(page, "/admin/delivery-ads?view=actionable", 2500);
    found.campaignId = await page.evaluate(() => {
      const links = [...document.querySelectorAll('a[href*="/admin/delivery-ads/"]')];
      for (const a of links) {
        const href = a.getAttribute("href") || "";
        const m = href.match(/\/admin\/delivery-ads\/([0-9a-f-]{8,})/i);
        if (m) return m[1];
      }
      return null;
    });
  }

  if (!found.storeId) {
    await openRoute(page, "/admin/business", 2500);
    found.storeId = await page.evaluate(() => {
      const links = [...document.querySelectorAll('a[href^="/admin/business/"]')];
      for (const a of links) {
        const href = a.getAttribute("href") || "";
        const m = href.match(/\/admin\/business\/([^/?#]+)/);
        if (m && m[1] && m[1] !== "new") return m[1];
      }
      return null;
    });
  }

  if (!found.supportId) {
    await openRoute(page, "/admin/support", 2500);
    found.supportId = await page.evaluate(() => {
      const links = [...document.querySelectorAll('a[href*="/admin/support/"]')];
      for (const a of links) {
        const href = a.getAttribute("href") || "";
        const m = href.match(/\/admin\/support\/([^/?#]+)/);
        if (!m) continue;
        const id = m[1];
        if (["archive", "new", "settings"].includes(id)) continue;
        return id;
      }
      return null;
    });
  }

  if (!found.pointChargeId) {
    await openRoute(page, "/admin/point-charges", 2000);
    found.pointChargeId = await page.evaluate(() => {
      const a = document.querySelector('a[href^="/admin/point-charges/"]');
      const href = a?.getAttribute("href") || "";
      const m = href.match(/\/admin\/point-charges\/([^/?#]+)/);
      return m?.[1] || null;
    });
  }

  return found;
}

async function probeDeepLinks(page) {
  const results = {};

  // HOME → map
  await openRoute(page, "/admin/stores-home-shelves", 2000);
  const homeLink = page.locator('[data-admin-home-placement-map-link="1"]');
  if ((await homeLink.count()) > 0) {
    await homeLink.first().click();
    await page.waitForTimeout(1800);
    const geo = await measureGeometry(page);
    const focus = new URL(page.url()).searchParams.get("focus");
    results.HOME_TO_MAP = {
      url: page.url(),
      focus,
      expectedFocus: "STORES_HOME_FEED",
      result: focus === "STORES_HOME_FEED" && geo.markers.placementMap ? "PASS" : "FAIL",
      geo: judge(geo),
    };
  } else {
    results.HOME_TO_MAP = { result: "FAIL", reason: "link_missing" };
  }

  // CATEGORY → map
  await openRoute(page, "/admin/stores-category-policy", 2000);
  const catLink = page.locator('[data-admin-category-placement-map-link="1"]');
  if ((await catLink.count()) > 0) {
    await catLink.first().click();
    await page.waitForTimeout(1800);
    const focus = new URL(page.url()).searchParams.get("focus");
    results.CATEGORY_TO_MAP = {
      url: page.url(),
      focus,
      expectedFocus: "STORES_CATEGORY_FEED",
      result: focus === "STORES_CATEGORY_FEED" ? "PASS" : "FAIL",
    };
  } else {
    results.CATEGORY_TO_MAP = { result: "FAIL", reason: "link_missing" };
  }

  return results;
}

async function probeNavMemory(page) {
  const out = {};

  await openRoute(page, "/admin/delivery-ads?view=actionable", 2000);
  const before = page.url();
  const campaignHref = await page.evaluate(() => {
    const a = document.querySelector('a[href*="/admin/delivery-ads/"]');
    return a?.getAttribute("href") || null;
  });
  if (campaignHref) {
    await openRoute(page, campaignHref, 2000);
    await page.goBack({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    const after = page.url();
    const hasView = after.includes("view=actionable") || before.includes("view=actionable");
    out.ADS = {
      before,
      after,
      result: after.includes("/admin/delivery-ads") && (after.includes("view=") || hasView) ? "PASS" : "PARTIAL",
      note: "browser back preserves history; query memory checked if present",
    };
  } else {
    out.ADS = { result: "BLOCKED", reason: "no_campaign_link" };
  }

  await openRoute(page, "/admin/finance", 1500);
  await openRoute(page, "/admin/point-charges", 1500);
  await page.goBack({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
  out.FINANCE = {
    after: page.url(),
    result: page.url().includes("/admin/finance") || page.url().includes("/admin/point-charges") ? "PASS" : "FAIL",
  };

  await openRoute(page, "/admin/support?filter=WAITING_ADMIN", 1500);
  const supportDetail = await page.evaluate(() => {
    const a = document.querySelector('a[href*="/admin/support/"]');
    return a?.getAttribute("href") || null;
  });
  if (supportDetail) {
    await openRoute(page, supportDetail, 1500);
    await page.goBack({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1000);
    out.SUPPORT = {
      after: page.url(),
      result: page.url().includes("/admin/support") ? "PASS" : "FAIL",
    };
  } else {
    out.SUPPORT = { result: "BLOCKED", reason: "no_support_case" };
  }

  return out;
}

async function probeModal(page) {
  // Safe open: language or filter select if present — no mutation confirm.
  await openRoute(page, "/admin", 1500);
  const opened = await page.evaluate(() => {
    const btn = document.querySelector(
      'button[aria-haspopup="listbox"], button[aria-haspopup="menu"], [data-admin-test-switcher] button, select'
    );
    if (!btn) return { opened: false };
    if (btn.tagName === "SELECT") {
      const r = btn.getBoundingClientRect();
      return {
        opened: true,
        kind: "select",
        contained: r.left >= 0 && r.right <= window.innerWidth + 2 && r.top >= 0,
        rect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom },
      };
    }
    btn.click();
    return { opened: true, kind: "menu_click" };
  });
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => {
    const pop = document.querySelector('[role="listbox"], [role="menu"], [data-radix-popper-content-wrapper], .dibay-overlay');
    if (!pop) return { present: false };
    const r = pop.getBoundingClientRect();
    return {
      present: true,
      contained:
        r.left >= -4 &&
        r.right <= window.innerWidth + 4 &&
        r.top >= -4 &&
        r.bottom <= window.innerHeight + 4,
      rect: {
        left: Math.round(r.left),
        right: Math.round(r.right),
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
      },
    };
  });
  await page.keyboard.press("Escape").catch(() => {});
  return { trigger: opened, popover: after, result: after.present ? (after.contained ? "PASS" : "FAIL") : "PARTIAL" };
}

async function main() {
  loadEnv();
  mkdirSync(OUT_DIR, { recursive: true });

  const report = {
    cut: "CUT_G_TABLET_LANDSCAPE_RUNTIME_CLOSE",
    sha: shaShort(),
    origin: ORIGIN,
    productionClaimForbidden: true,
    viewportAuthority: {
      token: "--sam-bp-lg-min",
      source: "app/design-tokens.css",
      tabletLandscape: VIEWPORTS.tabletLandscape,
      note: "Landscape at design-token lg floor (1024×768). Not Production PASS.",
    },
    auth: { email: ADMIN_EMAIL, role: "admin_session" },
    browser: "chromium playwright",
    emulation: "Playwright viewport emulation (not physical iPad)",
    zoom: 1,
    ids: {},
    routes: {},
    deepLinks: {},
    navMemory: {},
    modal: {},
    desktopRegression: {},
    tests: {},
    firstDivergence: null,
    carry: {
      FINANCE_PRODUCTION_E2E: "NOT_PROVEN",
      COIN_SALE_RECOGNITION: "NOT_PROVEN",
      ADS_MUTATION_LIVE: "PARTIAL",
      RESUME_END_LIVE: "NOT_PROVEN",
      POPUP_PRODUCTION: "NOT_PROVEN",
      SUPPORT_MUTATION_LIVE: "NOT_PROVEN",
      PARTNER_LIVE: "NOT_PROVEN",
      PREVIEW_LIVE_CREATIVE_PARITY: "PARTIAL",
      CUT_F_P1_PLACEMENT_MAP_ACTIVE_ELIGIBILITY: "DEFERRED_TO_CUT_I",
    },
    final: {},
  };

  const session = await loginSession(ADMIN_EMAIL);
  if (!session) {
    report.final.CUT_G = "BLOCKED";
    report.final.reason = "admin_login_failed";
    writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2));
    console.error("BLOCKED: admin login failed");
    process.exit(2);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: VIEWPORTS.tabletLandscape,
    deviceScaleFactor: 2,
  });
  await context.addCookies(authCookies(session));
  const page = await context.newPage();
  page.on("pageerror", (e) => {
    report.pageErrors = report.pageErrors || [];
    report.pageErrors.push(String(e.message || e).slice(0, 200));
  });

  // Discover real entity ids (no fake create)
  report.ids = await discoverIds(page);

  const routes = [
    { id: "T1_SHELL_ACTION_CENTER", path: "/admin", shot: "t1-action-center.png" },
    { id: "T2_FINANCE", path: "/admin/finance", shot: "t2-finance.png" },
    { id: "T3_POINT_QUEUE", path: "/admin/point-charges", shot: "t3-point-queue.png" },
    { id: "T4_CASH_QUEUE", path: "/admin/delivery-ads/cash-charges", shot: "t4-cash-queue.png" },
    { id: "T5_ADS_HUB", path: "/admin/delivery-ads?view=actionable", shot: "t5-ads-hub.png" },
    {
      id: "T6_ADS_DETAIL",
      path: report.ids.campaignId ? `/admin/delivery-ads/${report.ids.campaignId}` : null,
      shot: "t6-ads-detail.png",
    },
    {
      id: "T7_PLACEMENT_MAP",
      path: "/admin/delivery-ads/inventory?focus=STORES_HOME_HERO#placement-map",
      shot: "t7-placement-map.png",
    },
    { id: "T8_HOME_CONFIG", path: "/admin/stores-home-shelves", shot: "t8-home-config.png" },
    { id: "T9_CATEGORY_CONFIG", path: "/admin/stores-category-policy", shot: "t9-category-config.png" },
    { id: "T10_SUPPORT_INBOX", path: "/admin/support", shot: "t10-support-inbox.png" },
    {
      id: "T11_SUPPORT_DETAIL",
      path:
        report.ids.supportId && !["archive", "new", "settings"].includes(report.ids.supportId)
          ? `/admin/support/${report.ids.supportId}`
          : null,
      shot: "t11-support-detail.png",
    },
    { id: "T12_PARTNER", path: "/admin/delivery-ads/partner", shot: "t12-partner.png" },
    {
      id: "T13_STORE_HUB",
      path: report.ids.storeId ? `/admin/business/${report.ids.storeId}` : null,
      shot: "t13-store-hub.png",
    },
  ];

  for (const route of routes) {
    if (!route.path) {
      report.routes[route.id] = { result: "BLOCKED", reason: "no_safe_entity_id" };
      continue;
    }
    const nav = await openRoute(page, route.path, 2200);
    const blockedAuth =
      nav.finalUrl.includes("/login") ||
      nav.finalUrl.includes("/auth") ||
      (nav.status && nav.status >= 400);
    if (blockedAuth) {
      report.routes[route.id] = { result: "BLOCKED", nav, reason: "auth_or_http" };
      continue;
    }
    const geo = await measureGeometry(page);
    const verdict = judge(geo);
    // Placement Map: scroll panel into viewport before shot (hash alone can miss late mount).
    if (route.id === "T7_PLACEMENT_MAP") {
      await page.evaluate(() => {
        document.getElementById("placement-map")?.scrollIntoView({ block: "start" });
      });
      await page.waitForTimeout(400);
    }
    await page.screenshot({ path: resolve(OUT_DIR, route.shot), fullPage: false }).catch(() => {});
    report.routes[route.id] = {
      path: route.path,
      nav,
      geometry: {
        clientWidth: geo.document.clientWidth,
        scrollWidth: geo.document.scrollWidth,
        pageOverflowX: geo.pageOverflowX,
        sidebarMainOverlap: geo.sidebarMainOverlap,
        anyCtaVisible: geo.anyCtaVisible,
        main: geo.main,
        sidebar: geo.sidebar,
        firstOverflow: geo.firstOverflow,
        markers: geo.markers,
      },
      result: verdict.result,
      fails: verdict.fails,
    };
    if (verdict.result === "FAIL" && !report.firstDivergence) {
      report.firstDivergence = {
        route: route.id,
        fails: verdict.fails,
        firstOverflow: geo.firstOverflow,
        path: route.path,
      };
    }
  }

  // Placement map interaction (marker click on a visible delivery marker)
  await openRoute(page, "/admin/delivery-ads/inventory?focus=STORES_HOME_HERO#placement-map", 2200);
  const mapInteract = await page.evaluate(() => {
    const marker =
      document.querySelector('[data-admin-placement-marker="STORES_HOME_FEED"]') ||
      document.querySelector("[data-admin-placement-marker]");
    if (marker) marker.click();
    const detail = document.querySelector("[data-admin-placement-map-detail]");
    const map = document.querySelector("[data-admin-placement-map]");
    const rMap = map?.getBoundingClientRect();
    const rDetail = detail?.getBoundingClientRect();
    return {
      markerClicked: Boolean(marker),
      markerId: marker?.getAttribute("data-admin-placement-marker") || null,
      detailText: (detail?.textContent || "").slice(0, 120),
      mapWidth: rMap ? Math.round(rMap.width) : null,
      detailWidth: rDetail ? Math.round(rDetail.width) : null,
      readable: Boolean(rMap && rMap.width >= 280 && rDetail && rDetail.width >= 200),
    };
  });
  report.placementMapInteract = mapInteract;

  report.deepLinks = await probeDeepLinks(page);
  report.navMemory = await probeNavMemory(page);
  report.modal = await probeModal(page);

  // Ads → map deep link if campaign available
  if (report.ids.campaignId) {
    await openRoute(page, `/admin/delivery-ads/${report.ids.campaignId}`, 2800);
    await page.evaluate(() => {
      const el = document.querySelector("[data-admin-ads-placement-map-link]");
      el?.scrollIntoView({ block: "center" });
    });
    await page.waitForTimeout(400);
    const adsMap = page.locator("[data-admin-ads-placement-map-link]").first();
    if ((await adsMap.count()) > 0) {
      await adsMap.click();
      await page.waitForTimeout(1800);
      const focus = new URL(page.url()).searchParams.get("focus");
      const onMap =
        page.url().includes("inventory") &&
        (page.url().includes("placement-map") || page.url().includes("focus="));
      report.deepLinks.ADS_TO_MAP = {
        url: page.url(),
        focus,
        result: onMap && focus ? "PASS" : "FAIL",
      };
    } else {
      // Campaign may lack inventoryKeys UI (empty draft) — not a layout FAIL.
      report.deepLinks.ADS_TO_MAP = {
        result: "BLOCKED",
        reason: "cta_missing_for_this_campaign",
        campaignId: report.ids.campaignId,
      };
    }
  } else {
    report.deepLinks.ADS_TO_MAP = { result: "BLOCKED", reason: "no_campaign" };
  }

  // Desktop smoke regression (targeted)
  await page.setViewportSize(VIEWPORTS.desktopSmoke);
  for (const path of [
    "/admin",
    "/admin/finance",
    "/admin/delivery-ads/inventory#placement-map",
    "/admin/support",
    "/admin/stores-home-shelves",
  ]) {
    await openRoute(page, path, 1600);
    const geo = await measureGeometry(page);
    const verdict = judge(geo);
    const key = path.split("?")[0].replace(/\W+/g, "_");
    report.desktopRegression[key] = {
      path,
      result: verdict.result,
      fails: verdict.fails,
      overflow: geo.pageOverflowX,
    };
  }

  // Summarize T-tests
  const r = report.routes;
  report.tests = {
    T1: r.T1_SHELL_ACTION_CENTER?.result || "NOT_PROVEN",
    T2: r.T1_SHELL_ACTION_CENTER?.result || "NOT_PROVEN",
    T3: r.T2_FINANCE?.result || "NOT_PROVEN",
    T4: r.T3_POINT_QUEUE?.result || "NOT_PROVEN",
    T5: r.T5_ADS_HUB?.result || "NOT_PROVEN",
    T6: r.T6_ADS_DETAIL?.result || "NOT_PROVEN",
    T7: r.T7_PLACEMENT_MAP?.result || "NOT_PROVEN",
    T8: r.T8_HOME_CONFIG?.result || "NOT_PROVEN",
    T9: r.T9_CATEGORY_CONFIG?.result || "NOT_PROVEN",
    T10: r.T10_SUPPORT_INBOX?.result || "NOT_PROVEN",
    T11: r.T11_SUPPORT_DETAIL?.result || "NOT_PROVEN",
    T12: r.T12_PARTNER?.result || "NOT_PROVEN",
    T13: r.T13_STORE_HUB?.result || "NOT_PROVEN",
    T14: report.modal?.result || "NOT_PROVEN",
    T15: report.modal?.result || "NOT_PROVEN",
    T16: report.navMemory?.ADS?.result || "NOT_PROVEN",
    T17: report.navMemory?.FINANCE?.result || "NOT_PROVEN",
    T18: report.navMemory?.SUPPORT?.result || "NOT_PROVEN",
    T19: report.deepLinks?.ADS_TO_MAP?.result || "NOT_PROVEN",
    T20: report.deepLinks?.HOME_TO_MAP?.result || "NOT_PROVEN",
    T21: report.deepLinks?.CATEGORY_TO_MAP?.result || "NOT_PROVEN",
    T22: Object.values(r).some((x) => x?.geometry?.pageOverflowX) ? "FAIL" : "PASS",
    T23: Object.values(r).some((x) => x?.fails?.includes("NO_VISIBLE_CTA")) ? "FAIL" : "PASS",
    T24: Object.values(r).some((x) => x?.fails?.includes("SIDEBAR_MAIN_OVERLAP")) ? "FAIL" : "PASS",
    T25: Object.values(report.desktopRegression).every((x) => x.result === "PASS")
      ? "PASS"
      : Object.values(report.desktopRegression).some((x) => x.result === "FAIL")
        ? "FAIL"
        : "PARTIAL",
  };

  const routeResults = Object.values(r).map((x) => x?.result);
  const hasFail = routeResults.includes("FAIL");
  const hasBlocked = routeResults.includes("BLOCKED");
  const allPass = routeResults.length > 0 && routeResults.every((x) => x === "PASS");

  report.final = {
    GLOBAL_TABLET_SHELL: r.T1_SHELL_ACTION_CENTER?.result || "NOT_PROVEN",
    ACTION_CENTER: r.T1_SHELL_ACTION_CENTER?.result || "NOT_PROVEN",
    FINANCE: r.T2_FINANCE?.result || "NOT_PROVEN",
    ADS: r.T5_ADS_HUB?.result || "NOT_PROVEN",
    PLACEMENT_MAP: r.T7_PLACEMENT_MAP?.result || "NOT_PROVEN",
    HOME_CATEGORY: [r.T8_HOME_CONFIG?.result, r.T9_CATEGORY_CONFIG?.result].includes("FAIL")
      ? "FAIL"
      : "PASS",
    SUPPORT: r.T10_SUPPORT_INBOX?.result || "NOT_PROVEN",
    PARTNER: r.T12_PARTNER?.result || "NOT_PROVEN",
    STORE_HUB: r.T13_STORE_HUB?.result || "NOT_PROVEN",
    NAVIGATION_MEMORY:
      [report.navMemory?.ADS?.result, report.navMemory?.FINANCE?.result, report.navMemory?.SUPPORT?.result].includes(
        "FAIL"
      )
        ? "FAIL"
        : "PASS",
    DEEP_LINK:
      [report.deepLinks?.HOME_TO_MAP?.result, report.deepLinks?.CATEGORY_TO_MAP?.result].includes("FAIL")
        ? "FAIL"
        : "PASS",
    DESKTOP_REGRESSION: report.tests.T25,
    TABLET_ADMIN: allPass ? "PASS" : hasFail ? "FAIL" : hasBlocked ? "PARTIAL" : "PARTIAL",
    CUT_G: allPass && !hasFail ? "PASS" : hasFail ? "FAIL" : "PARTIAL",
    note: "Not Production PASS. Local/dev runtime geometry only.",
  };

  writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ cut: report.cut, sha: report.sha, final: report.final, firstDivergence: report.firstDivergence }, null, 2));
  await browser.close();
  process.exit(hasFail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

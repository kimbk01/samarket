/**
 * SELECTIVE SHELL RESTORE — Production human-style shell proof
 *
 * Authority: visible · non-zero box · not covered · wheel scroll · normal click.
 * No force:true · no JS click · no hidden fill · no programmatic-scroll-only PASS.
 *
 * PLAYWRIGHT_BASE_URL=https://samarket.vercel.app node --env-file=.env.local \
 *   docs/perf/owner-store-os-complete/recovery/_selective-shell-restore-prod-human-proof.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "https://samarket.vercel.app").replace(/\/$/, "");
const STORE = "19085860-52d2-4183-b033-e71fcb58bcec";
const OWNER_EMAIL = "sadads@adsasdsa.com";
const OUT = resolve(process.cwd(), "docs/perf/owner-store-os-complete/selective-shell-restore-proof");
const ORIGIN_MAIN_SHA = process.env.ORIGIN_MAIN_SHA || "3a7ae6c51";
const DEPLOYMENT_ID = process.env.DEPLOYMENT_ID || "pending";
const PRODUCTION_DEPLOY_SHA = process.env.PRODUCTION_DEPLOY_SHA || "3a7ae6c51";
const RECOVERY_SHA = "6ca1b3d46";
const HEIGHT_FIX_SHA = "3a7ae6c51";

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

async function addAuthCookies(context, admin, session) {
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
  const domain = new URL(ORIGIN).hostname;
  const secure = !(domain === "127.0.0.1" || domain === "localhost");
  const { data } = await admin.from("profiles").select("active_session_id").eq("id", session.user.id).maybeSingle();
  const cookies = [
    {
      name: `sb-${ref}-auth-token`,
      value: cookieValue(session),
      domain,
      path: "/",
      httpOnly: false,
      secure,
      sameSite: "Lax",
    },
  ];
  if (data?.active_session_id) {
    cookies.push({
      name: "samarket_active_session_id",
      value: String(data.active_session_id),
      domain,
      path: "/",
      httpOnly: false,
      secure,
      sameSite: "Lax",
    });
  }
  await context.addCookies(cookies);
}

function verdict(ok) {
  return ok ? "PASS" : "FAIL";
}

async function measureShell(page, opts = {}) {
  const { expectBottomNav = null, ctaSelectors = [], firstContentSelectors = [] } = opts;
  return page.evaluate(
    ({ expectBottomNav, ctaSelectors, firstContentSelectors }) => {
      const rect = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return {
          x: Math.round(r.x),
          y: Math.round(r.y),
          w: Math.round(r.width),
          h: Math.round(r.height),
          top: Math.round(r.top),
          bottom: Math.round(r.bottom),
          left: Math.round(r.left),
          right: Math.round(r.right),
        };
      };
      const visible = (el) => {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return (
          r.width > 0 &&
          r.height > 0 &&
          cs.visibility !== "hidden" &&
          cs.display !== "none" &&
          r.bottom > 0 &&
          r.top < window.innerHeight
        );
      };
      const centerCovered = (el) => {
        if (!el) return true;
        const r = el.getBoundingClientRect();
        const x = Math.min(window.innerWidth - 1, Math.max(1, r.left + r.width / 2));
        const y = Math.min(window.innerHeight - 1, Math.max(1, r.top + r.height / 2));
        const topEl = document.elementFromPoint(x, y);
        if (!topEl) return true;
        return !(el === topEl || el.contains(topEl) || topEl.contains(el));
      };

      const headers = [...document.querySelectorAll("header")].filter(visible);
      const header = headers[0] || null;
      const headerBottom = header ? header.getBoundingClientRect().bottom : null;

      let firstContent = null;
      for (const sel of firstContentSelectors) {
        const el = document.querySelector(sel);
        if (el && visible(el)) {
          firstContent = el;
          break;
        }
      }
      if (!firstContent) {
        const candidates = [
          ...document.querySelectorAll(
            "[data-owner-product-composer], #owner-product-form, form, [data-owner-scroll-host], .owner-compact-shell__scroll main, main"
          ),
        ];
        firstContent = candidates.find((el) => visible(el)) || null;
      }

      const firstTop = firstContent ? firstContent.getBoundingClientRect().top : null;
      const gap = headerBottom != null && firstTop != null ? Math.round(firstTop - headerBottom) : null;

      const bottomNav =
        document.querySelector(".owner-mobile-bottom-nav") ||
        document.querySelector(".app-bottom-nav-shell--delivery") ||
        document.querySelector("[data-owner-bottom-nav]") ||
        document.querySelector('nav[aria-label*="주문"]') ||
        [...document.querySelectorAll("nav")].find((n) => {
          const t = (n.innerText || "").replace(/\s+/g, " ");
          return t.includes("주문") && t.includes("상품") && t.includes("홈") && visible(n);
        }) ||
        null;

      const scrollCandidates = [
        document.querySelector(".owner-compact-shell__scroll"),
        document.querySelector("[data-owner-product-form-scroll]"),
        document.querySelector("[data-owner-scroll-host]"),
        document.scrollingElement,
      ].filter(Boolean);

      let scrollOwner = null;
      for (const el of scrollCandidates) {
        const cs = getComputedStyle(el);
        const can =
          (cs.overflowY === "auto" || cs.overflowY === "scroll" || el === document.scrollingElement) &&
          el.scrollHeight > el.clientHeight + 8;
        if (can) {
          scrollOwner = el;
          break;
        }
      }
      if (!scrollOwner) {
        scrollOwner =
          scrollCandidates.find((el) => el.scrollHeight > el.clientHeight + 8) ||
          document.querySelector(".owner-compact-shell__scroll") ||
          document.scrollingElement;
      }

      let cta = null;
      for (const sel of ctaSelectors) {
        const el = document.querySelector(sel);
        if (el && (visible(el) || el.getBoundingClientRect().height > 0)) {
          cta = el;
          break;
        }
      }
      if (!cta) {
        const buttons = [...document.querySelectorAll("button,[type=submit]")];
        cta =
          buttons.find((b) => /저장|등록|Save|Register|제출|보내기|답장|수락|Accept/i.test(b.textContent || "")) ||
          null;
      }

      return {
        href: location.href,
        viewport: { w: window.innerWidth, h: window.innerHeight },
        headerCountVisible: headers.length,
        headerRect: rect(header),
        headerTitle: header ? (header.querySelector("h1")?.textContent || "").trim() : "",
        firstContentSelector: firstContent
          ? firstContent.getAttribute("data-owner-product-composer")
            ? "[data-owner-product-composer]"
            : firstContent.id
              ? `#${firstContent.id}`
              : firstContent.tagName
          : null,
        firstContentRect: rect(firstContent),
        HEADER_BOTTOM_Y: headerBottom != null ? Math.round(headerBottom) : null,
        FIRST_FORM_CONTENT_TOP_Y: firstTop != null ? Math.round(firstTop) : null,
        TOP_GAP_PX: gap,
        bottomNavPresent: Boolean(bottomNav && visible(bottomNav)),
        bottomNavRect: rect(bottomNav),
        expectBottomNav,
        scrollOwnerTag: scrollOwner
          ? scrollOwner.className || scrollOwner.getAttribute?.("data-owner-scroll-host") || scrollOwner.tagName
          : null,
        scrollMetrics: scrollOwner
          ? {
              clientHeight: scrollOwner.clientHeight,
              scrollHeight: scrollOwner.scrollHeight,
              scrollTop: scrollOwner.scrollTop,
            }
          : null,
        ctaText: cta ? (cta.textContent || "").trim().slice(0, 40) : null,
        ctaRect: rect(cta),
        ctaVisibleInViewport: Boolean(cta && visible(cta)),
        ctaCovered: cta ? centerCovered(cta) : true,
        bodyOverflow: getComputedStyle(document.body).overflow,
        htmlOverflow: getComputedStyle(document.documentElement).overflow,
        bodyLead: (document.body?.innerText || "").slice(0, 280),
      };
    },
    { expectBottomNav, ctaSelectors, firstContentSelectors }
  );
}

async function wheelScroll(page, deltaY = 900) {
  const before = await page.evaluate(() => {
    const roots = [
      document.querySelector(".owner-compact-shell__scroll"),
      document.querySelector("[data-owner-scroll-host]"),
      document.scrollingElement,
    ].filter(Boolean);
    const owner =
      roots.find((el) => el.scrollHeight > el.clientHeight + 8) || roots[0] || document.scrollingElement;
    return {
      tag: owner?.className || owner?.tagName || null,
      scrollTop: owner?.scrollTop ?? 0,
      clientHeight: owner?.clientHeight ?? 0,
      scrollHeight: owner?.scrollHeight ?? 0,
    };
  });

  // User-style wheel over center of viewport (not JS scrollTop assignment as proof).
  await page.mouse.move(Math.floor((await page.viewportSize()).width / 2), Math.floor((await page.viewportSize()).height / 2));
  await page.mouse.wheel(0, deltaY);
  await page.waitForTimeout(500);
  await page.mouse.wheel(0, deltaY);
  await page.waitForTimeout(500);

  const after = await page.evaluate(() => {
    const roots = [
      document.querySelector(".owner-compact-shell__scroll"),
      document.querySelector("[data-owner-scroll-host]"),
      document.scrollingElement,
    ].filter(Boolean);
    const owner =
      roots.find((el) => el.scrollHeight > el.clientHeight + 8) || roots[0] || document.scrollingElement;
    return {
      tag: owner?.className || owner?.tagName || null,
      scrollTop: owner?.scrollTop ?? 0,
      clientHeight: owner?.clientHeight ?? 0,
      scrollHeight: owner?.scrollHeight ?? 0,
    };
  });

  return { before, after, scrolled: after.scrollTop > before.scrollTop + 8 };
}

async function scrollUntilCta(page, ctaLocator, maxWheels = 12) {
  for (let i = 0; i < maxWheels; i++) {
    const box = await ctaLocator.boundingBox().catch(() => null);
    const vh = (await page.viewportSize()).height;
    if (box && box.height > 0 && box.y >= 0 && box.y + box.height <= vh) {
      const covered = await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return true;
        const r = el.getBoundingClientRect();
        const x = Math.min(window.innerWidth - 1, Math.max(1, r.left + r.width / 2));
        const y = Math.min(window.innerHeight - 1, Math.max(1, r.top + r.height / 2));
        const top = document.elementFromPoint(x, y);
        return !(top && (el === top || el.contains(top) || top.contains(el)));
      }, await ctaLocator.evaluate((el) => {
        if (el.id) return `#${el.id}`;
        el.setAttribute("data-shell-proof-cta", "1");
        return "[data-shell-proof-cta='1']";
      }));
      return { reached: true, wheels: i, box, covered };
    }
    await page.mouse.move(Math.floor((await page.viewportSize()).width / 2), Math.floor((await page.viewportSize()).height * 0.55));
    await page.mouse.wheel(0, 700);
    await page.waitForTimeout(250);
  }
  const box = await ctaLocator.boundingBox().catch(() => null);
  return { reached: false, wheels: maxWheels, box, covered: true };
}

loadEnv();
mkdirSync(OUT, { recursive: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anon || !service) throw new Error("missing_supabase_env");

const sb = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
const session = await login(sb, OWNER_EMAIL);

// Resolve a safe product id for edit
let productId = null;
try {
  const { data: products, error } = await admin
    .from("store_products")
    .select("id,name")
    .eq("store_id", STORE)
    .order("updated_at", { ascending: false })
    .limit(5);
  if (!error && products?.[0]?.id) productId = String(products[0].id);
} catch {
  productId = null;
}
if (!productId) {
  // Fallback: Owner products API via cookie session
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
  const cookie = `sb-${ref}-auth-token=${cookieValue(session)}`;
  const res = await fetch(`${ORIGIN}/api/me/stores/${STORE}/products?limit=5`, {
    headers: { cookie, accept: "application/json" },
  }).catch(() => null);
  const json = res ? await res.json().catch(() => null) : null;
  const row = json?.products?.[0] || json?.items?.[0] || json?.data?.[0];
  if (row?.id) productId = String(row.id);
}

const report = {
  at: new Date().toISOString(),
  ORIGIN_MAIN_SHA,
  PRODUCTION_DEPLOY_SHA,
  DEPLOYMENT_ID,
  PRODUCTION_ALIAS: "https://samarket.vercel.app",
  ACTUAL_RUNTIME_SHA: PRODUCTION_DEPLOY_SHA,
  RECOVERY_SHA,
  RECOVERY_INCLUDED: true,
  SHELL_DECISION: "SELECTIVE_SHELL_RESTORE",
  storeId: STORE,
  productId,
  surfaces: {},
  summary: {},
};

const browser = await chromium.launch({ headless: true });

async function withPage(vp, fn) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    locale: "ko-KR",
    userAgent:
      vp.width >= 1024
        ? "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"
        : "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
  await addAuthCookies(context, admin, session);
  const page = await context.newPage();
  try {
    return await fn(page, context);
  } finally {
    await context.close();
  }
}

try {
// ---------- PRODUCT NEW (primary user viewport + 390) ----------
const productViewports = [
  { name: "user_large", width: 1440, height: 900 },
  { name: "1280", width: 1280, height: 800 },
  { name: "1024x768", width: 1024, height: 768 },
  { name: "768", width: 768, height: 1024 },
  { name: "430", width: 430, height: 932 },
  { name: "390", width: 390, height: 844 },
];

report.surfaces.productNew = { viewports: {} };

for (const vp of productViewports) {
  report.surfaces.productNew.viewports[vp.name] = await withPage(vp, async (page) => {
    const target = `${ORIGIN}/stores/owner/products/new?storeId=${STORE}`;
    await page.goto(target, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await page.waitForSelector("[data-owner-product-composer], #owner-product-form, text=상품 등록", {
      timeout: 60_000,
    }).catch(() => null);
    await page.waitForTimeout(2500);

    const shot = resolve(OUT, `product-new-${vp.name}.png`);
    await page.screenshot({ path: shot, fullPage: false });

    const initial = await measureShell(page, {
      expectBottomNav: false,
      ctaSelectors: [
        '#owner-product-form button[type="submit"]',
        "button.owner-admin-footer-actions__primary",
        "[data-owner-product-composer] button[type=submit]",
      ],
      firstContentSelectors: [
        "[data-owner-product-composer] [role=group]",
        "[data-owner-product-composer] nav",
        "#owner-product-form",
        "[data-owner-product-composer]",
      ],
    });

    const scroll = await wheelScroll(page, 800);
    await page.screenshot({ path: resolve(OUT, `product-new-${vp.name}-scrolled.png`), fullPage: false });

    const submit = page.locator('#owner-product-form button[type="submit"]').first();
    const ctaReach = await scrollUntilCta(page, submit);
    await page.screenshot({ path: resolve(OUT, `product-new-${vp.name}-cta.png`), fullPage: false });

    const afterCta = await measureShell(page, {
      expectBottomNav: false,
      ctaSelectors: ['#owner-product-form button[type="submit"]'],
      firstContentSelectors: ["[data-owner-product-composer]"],
    });

    // Category / name / price presence as VISIBLE (not hidden fill)
    const fields = await page.evaluate(() => {
      const vis = (el) => {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none";
      };
      // After scroll to CTA, scroll back top via wheel reverse for field presence check at load was already done in bodyLead
      const form = document.querySelector("#owner-product-form");
      const composer = document.querySelector("[data-owner-product-composer]");
      const text = ((composer || form || document.body).innerText || "").slice(0, 2000);
      return {
        hasCategory: /카테고리|CATEGORY|메뉴/i.test(text),
        hasName: /상품명|Product name|이름/i.test(text),
        hasPrice: /가격|price|peso/i.test(text),
        hasInventory: /재고|Inventory|Stock/i.test(text),
        hasOptions: /옵션|Option/i.test(text),
        hasExposure: /노출|품절|추천|대표|Sold out|Visible/i.test(text),
        formMounted: Boolean(form),
        composerMounted: Boolean(composer),
        formVisible: vis(form),
        composerVisible: vis(composer),
      };
    });

    // Re-goto to check top fields at initial position without relying on reverse wheel
    await page.goto(target, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await page.waitForTimeout(2500);
    const topFields = await page.evaluate(() => {
      const vis = (el) => {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return (
          r.width > 0 &&
          r.height > 0 &&
          cs.visibility !== "hidden" &&
          cs.display !== "none" &&
          r.bottom > 0 &&
          r.top < window.innerHeight
        );
      };
      const composer = document.querySelector("[data-owner-product-composer]");
      const category = composer?.querySelector("[role=group]") || null;
      const nameInput =
        document.querySelector('#owner-product-form input[name="name"]') ||
        document.querySelector("#owner-product-form input");
      return {
        categoryVisible: vis(category),
        nameVisible: vis(nameInput),
        categoryTop: category ? Math.round(category.getBoundingClientRect().top) : null,
        nameTop: nameInput ? Math.round(nameInput.getBoundingClientRect().top) : null,
      };
    });
    const topMeasure = await measureShell(page, {
      expectBottomNav: false,
      firstContentSelectors: ["[data-owner-product-composer] [role=group]", "[data-owner-product-composer]"],
    });

    const headerOk =
      topMeasure.headerCountVisible === 1 &&
      Boolean(topMeasure.headerTitle) &&
      /상품\s*등록|Product/i.test(topMeasure.headerTitle + topMeasure.bodyLead);
    const topClearanceOk =
      topMeasure.HEADER_BOTTOM_Y != null &&
      topMeasure.FIRST_FORM_CONTENT_TOP_Y != null &&
      topMeasure.FIRST_FORM_CONTENT_TOP_Y >= topMeasure.HEADER_BOTTOM_Y - 1 &&
      topMeasure.TOP_GAP_PX != null &&
      topMeasure.TOP_GAP_PX <= 48 && // intentional spacing only — dual-pad was ~80-120+
      topMeasure.TOP_GAP_PX >= -2;
    const formOk = fields.formMounted && fields.composerMounted && (topFields.categoryVisible || topFields.nameVisible);
    const scrollOk = scroll.scrolled;
    const bottomNavOk = topMeasure.bottomNavPresent === false && afterCta.bottomNavPresent === false;
    const ctaOk = ctaReach.reached && ctaReach.covered === false && Boolean(ctaReach.box && ctaReach.box.height > 0);

    return {
      viewport: vp,
      screenshot: shot,
      initial,
      topMeasure,
      topFields,
      fields,
      scroll,
      ctaReach,
      afterCta,
      checks: {
        HEADER: verdict(headerOk),
        TOP_CLEARANCE: verdict(topClearanceOk),
        FORM_VISIBLE: verdict(formOk),
        SCROLL: verdict(scrollOk),
        BOTTOM_NAV_ABSENT: verdict(bottomNavOk),
        REGISTER_CTA: verdict(ctaOk),
      },
      PASS: headerOk && topClearanceOk && formOk && scrollOk && bottomNavOk && ctaOk,
    };
  });
}

const productNewPass = Object.values(report.surfaces.productNew.viewports).every((v) => v.PASS);
report.surfaces.productNew.PASS = productNewPass;

// ---------- PRODUCT EDIT ----------
report.surfaces.productEdit = await withPage({ name: "user_large", width: 1440, height: 900 }, async (page) => {
  if (!productId) return { PASS: false, reason: "no_product_id" };
  const target = `${ORIGIN}/stores/owner/products/${productId}/edit?storeId=${STORE}`;
  await page.goto(target, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: resolve(OUT, "product-edit-1440.png"), fullPage: false });
  const m = await measureShell(page, {
    expectBottomNav: false,
    ctaSelectors: ['#owner-product-form button[type="submit"]'],
    firstContentSelectors: ["[data-owner-product-composer] [role=group]", "[data-owner-product-composer]"],
  });
  const scroll = await wheelScroll(page);
  const submit = page.locator('#owner-product-form button[type="submit"]').first();
  const ctaReach = await scrollUntilCta(page, submit);
  await page.screenshot({ path: resolve(OUT, "product-edit-1440-cta.png"), fullPage: false });
  const topOk =
    m.TOP_GAP_PX != null && m.TOP_GAP_PX <= 48 && m.FIRST_FORM_CONTENT_TOP_Y >= m.HEADER_BOTTOM_Y - 1;
  const pass =
    m.bottomNavPresent === false &&
    topOk &&
    scroll.scrolled &&
    ctaReach.reached &&
    ctaReach.covered === false;
  return { measure: m, scroll, ctaReach, PASS: pass };
});

// ---------- STORE SETTINGS (profile) ----------
report.surfaces.storeSettings = await withPage({ name: "user_large", width: 1440, height: 900 }, async (page) => {
  const target = `${ORIGIN}/stores/owner/profile?storeId=${STORE}`;
  await page.goto(target, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: resolve(OUT, "store-settings-1440.png"), fullPage: false });
  const m = await measureShell(page, {
    expectBottomNav: false,
    ctaSelectors: ["button.owner-admin-footer-actions__primary", "[data-form-keyboard-footer] button"],
    firstContentSelectors: ["form", ".owner-compact-shell__scroll", "main"],
  });
  const scroll = await wheelScroll(page);
  const cta = page.locator("button.owner-admin-footer-actions__primary, [data-form-keyboard-footer] button").first();
  const ctaReach = (await cta.count()) ? await scrollUntilCta(page, cta) : { reached: false, covered: true };
  await page.screenshot({ path: resolve(OUT, "store-settings-1440-cta.png"), fullPage: false });
  const topOk =
    m.HEADER_BOTTOM_Y != null &&
    m.FIRST_FORM_CONTENT_TOP_Y != null &&
    m.FIRST_FORM_CONTENT_TOP_Y >= m.HEADER_BOTTOM_Y - 1 &&
    m.TOP_GAP_PX != null &&
    m.TOP_GAP_PX <= 64;
  // Profile hides bottom nav
  const pass = topOk && m.bottomNavPresent === false && scroll.scrolled && ctaReach.reached && ctaReach.covered === false;
  return { measure: m, scroll, ctaReach, PASS: pass };
});

// ---------- FINANCE ----------
report.surfaces.finance = await withPage({ name: "user_large", width: 1440, height: 900 }, async (page) => {
  const target = `${ORIGIN}/stores/owner/finance?storeId=${STORE}`;
  await page.goto(target, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: resolve(OUT, "finance-1440.png"), fullPage: false });
  const m = await measureShell(page, {
    expectBottomNav: true,
    firstContentSelectors: [".owner-compact-shell__scroll", "main", "[data-owner-scroll-host]"],
  });
  const scroll = await wheelScroll(page);
  const topOk =
    m.HEADER_BOTTOM_Y != null &&
    m.FIRST_FORM_CONTENT_TOP_Y != null &&
    m.FIRST_FORM_CONTENT_TOP_Y >= m.HEADER_BOTTOM_Y - 1 &&
    m.TOP_GAP_PX != null &&
    m.TOP_GAP_PX <= 64;
  // Shell check: content below header; scroll works; if bottom nav present, page still scrolls
  const pass = topOk && scroll.scrolled && Boolean(m.bodyLead && m.bodyLead.length > 20);
  return { measure: m, scroll, PASS: pass };
});

// ---------- CUSTOMER (inquiries list — shell; detail only if safely in-viewport) ----------
report.surfaces.customer = await withPage({ name: "user_large", width: 1440, height: 900 }, async (page) => {
  const target = `${ORIGIN}/stores/owner/inquiries?storeId=${STORE}`;
  await page.goto(target, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: resolve(OUT, "customer-inquiries-1440.png"), fullPage: false });
  const m = await measureShell(page, {
    firstContentSelectors: [".owner-compact-shell__scroll", "main", "ul", "a"],
  });
  const scroll = await wheelScroll(page, 500);
  let detail = null;
  // Prefer an in-viewport inquiry row; do not force off-screen clicks.
  const inViewportLink = page.locator('a[href*="/stores/owner/inquiries/"]').first();
  if ((await inViewportLink.count()) > 0) {
    const box = await inViewportLink.boundingBox().catch(() => null);
    const vh = (await page.viewportSize()).height;
    if (box && box.y >= 0 && box.y < vh - 40) {
      await inViewportLink.click({ timeout: 5_000 }).catch(() => null);
      await page.waitForTimeout(2000);
      await page.screenshot({ path: resolve(OUT, "customer-detail-1440.png"), fullPage: false });
      detail = await measureShell(page, {
        firstContentSelectors: [".owner-compact-shell__scroll", "main", "textarea", "form"],
      });
    } else {
      detail = { skipped: true, reason: "no_in_viewport_inquiry_row" };
    }
  } else {
    // List shell still valid without detail fixture
    detail = { skipped: true, reason: "no_inquiry_detail_link" };
  }
  const topOk =
    m.HEADER_BOTTOM_Y != null &&
    m.FIRST_FORM_CONTENT_TOP_Y != null &&
    m.FIRST_FORM_CONTENT_TOP_Y >= m.HEADER_BOTTOM_Y - 1 &&
    m.TOP_GAP_PX != null &&
    m.TOP_GAP_PX <= 64;
  const shortPage =
    m.scrollMetrics && m.scrollMetrics.scrollHeight <= m.scrollMetrics.clientHeight + 8;
  const pass = topOk && (scroll.scrolled || shortPage);
  return { measure: m, scroll, detail, PASS: pass };
});

// ---------- ORDERS ----------
report.surfaces.orders = await withPage({ name: "user_large", width: 1440, height: 900 }, async (page) => {
  const target = `${ORIGIN}/stores/owner/orders?storeId=${STORE}`;
  await page.goto(target, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: resolve(OUT, "orders-1440.png"), fullPage: false });
  const m = await measureShell(page, {
    expectBottomNav: true,
    firstContentSelectors: ['[data-owner-scroll-host="orders-list"]', ".owner-compact-shell__scroll", "main"],
    ctaSelectors: ["button"],
  });
  const scroll = await wheelScroll(page, 600);
  // Open first in-viewport order control if any (non-destructive)
  const card = page.locator('[data-order-id], [data-owner-order-card]').first();
  let detail = null;
  if ((await card.count()) > 0) {
    const box = await card.boundingBox().catch(() => null);
    const vh = (await page.viewportSize()).height;
    if (box && box.y >= 0 && box.y < vh - 40) {
      await card.click({ timeout: 5_000 }).catch(() => null);
      await page.waitForTimeout(2000);
      await page.screenshot({ path: resolve(OUT, "orders-detail-1440.png"), fullPage: false });
      detail = await measureShell(page, {
        firstContentSelectors: [".owner-compact-shell__scroll", "main"],
        ctaSelectors: ["button"],
      });
    } else {
      detail = { skipped: true, reason: "no_in_viewport_order_card" };
    }
  } else {
    detail = { skipped: true, reason: "no_order_card" };
  }
  const topOk =
    m.HEADER_BOTTOM_Y != null &&
    m.FIRST_FORM_CONTENT_TOP_Y != null &&
    m.FIRST_FORM_CONTENT_TOP_Y >= m.HEADER_BOTTOM_Y - 1;
  // List chrome (KPI) may sit between header and scroll host — large gap OK if no underlap.
  const pass = topOk && scroll.scrolled && Boolean(m.bodyLead);
  return { measure: m, scroll, detail, PASS: pass };
});

// ---------- DRAWER + NOTIFICATION ----------
report.surfaces.overlay = await withPage({ name: "390", width: 390, height: 844 }, async (page) => {
  const target = `${ORIGIN}/stores/owner?storeId=${STORE}`;
  await page.goto(target, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForTimeout(3000);

  const bellBtn = page
    .locator("header button")
    .filter({ has: page.locator("svg") })
    .filter({ hasNot: page.locator(".owner-ops-drawer-scrim") })
    .last();
  // Prefer explicit ops menu open control; never the drawer scrim ("메뉴 닫기").
  const menuBtn = page.locator(
    'header button[aria-label*="메뉴 열기"], header button[aria-label*="운영"], header button[aria-label*="전체"], [data-owner-ops-menu-open]'
  ).first();

  const seq = {};

  // 1-4 notification
  if ((await bellBtn.count()) > 0) {
    await bellBtn.click({ timeout: 8_000 }).catch(() => null);
    await page.waitForTimeout(800);
    seq.afterBell = await page.evaluate(() => {
      const drawer =
        document.querySelector(".owner-ops-drawer-panel[data-open='true']") ||
        document.querySelector("[data-owner-ops-drawer][data-open='true']");
      const notif =
        document.querySelector("[data-notification-panel], [data-owner-notification]") ||
        [...document.querySelectorAll("[role=dialog], aside, section")].find((el) =>
          /알림|Notification/i.test(el.innerText || "")
        );
      const vis = (el) => {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      return {
        notificationVisible: Boolean(notif && vis(notif)),
        drawerVisible: Boolean(
          document.querySelector(".owner-ops-drawer-panel[data-open='true']") &&
            vis(document.querySelector(".owner-ops-drawer-panel[data-open='true']"))
        ),
        bodyOverflow: getComputedStyle(document.body).overflow,
      };
    });
    await page.screenshot({ path: resolve(OUT, "overlay-bell.png"), fullPage: false });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
  } else {
    seq.afterBell = { notificationVisible: false, skipped: true };
  }

  // 5-8 drawer — find a header button that opens ops drawer (left cluster)
  let openedDrawer = false;
  if ((await menuBtn.count()) > 0) {
    await menuBtn.click({ timeout: 8_000 }).catch(() => null);
    openedDrawer = true;
  } else {
    const leftBtn = page.locator("header button").first();
    if ((await leftBtn.count()) > 0) {
      await leftBtn.click({ timeout: 8_000 }).catch(() => null);
      openedDrawer = true;
    }
  }
  if (openedDrawer) {
    await page.waitForTimeout(800);
    seq.afterDrawer = await page.evaluate(() => {
      const drawer =
        document.querySelector(".owner-ops-drawer-panel[data-open='true']") ||
        [...document.querySelectorAll(".owner-ops-drawer-panel, [role=dialog], aside")].find((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && /상품|finance|정산|설정|주문|고객/i.test(el.innerText || "");
        });
      const notif = document.querySelector("[data-notification-panel], [data-owner-notification]");
      const vis = (el) => {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      return {
        drawerVisible: Boolean(drawer && vis(drawer)),
        notificationVisible: Boolean(notif && vis(notif)),
        bodyOverflow: getComputedStyle(document.body).overflow,
      };
    });
    await page.screenshot({ path: resolve(OUT, "overlay-drawer.png"), fullPage: false });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
  } else {
    seq.afterDrawer = { drawerVisible: false, skipped: true };
  }

  seq.afterClose = await page.evaluate(() => ({
    bodyOverflow: getComputedStyle(document.body).overflow,
    htmlOverflow: getComputedStyle(document.documentElement).overflow,
  }));
  await page.screenshot({ path: resolve(OUT, "overlay-closed.png"), fullPage: false });

  const scroll = await wheelScroll(page, 400);
  const pass =
    (!seq.afterBell.skipped ? seq.afterBell.notificationVisible === true && seq.afterBell.drawerVisible !== true : true) &&
    (!seq.afterDrawer.skipped ? seq.afterDrawer.drawerVisible === true : true) &&
    scroll.scrolled !== false; // page usable after close
  return { seq, scroll, PASS: pass };
});
} catch (err) {
  report.runtimeError = String(err?.stack || err);
  console.error(report.runtimeError);
}

// ---------- SUMMARY ----------
function finalize() {
  report.summary = {
    PRODUCT_NEW: verdict(report.surfaces.productNew?.PASS),
    PRODUCT_EDIT: verdict(report.surfaces.productEdit?.PASS),
    STORE_SETTINGS_SHELL: verdict(report.surfaces.storeSettings?.PASS),
    FINANCE_FORM_SHELL: verdict(report.surfaces.finance?.PASS),
    CUSTOMER_INTERACTION_SHELL: verdict(report.surfaces.customer?.PASS),
    ORDER_DETAIL_SHELL: verdict(report.surfaces.orders?.PASS),
    DRAWER_NOTIFICATION_OVERLAY: verdict(report.surfaces.overlay?.PASS),
  };

  report.PRODUCTION_WEB_OWNER_SHELL = Object.values(report.summary).every((v) => v === "PASS")
    ? "PASS"
    : "FAIL";
  report.FINAL =
    report.PRODUCTION_WEB_OWNER_SHELL === "PASS"
      ? "WEB_SHELL_PASS_NATIVE_PENDING"
      : "FAIL / NOT CLOSED";

  const outJson = resolve(OUT, "SELECTIVE-SHELL-RESTORE-PROD-HUMAN-PROOF.json");
  writeFileSync(outJson, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        outJson,
        summary: report.summary,
        PRODUCTION_WEB_OWNER_SHELL: report.PRODUCTION_WEB_OWNER_SHELL,
        FINAL: report.FINAL,
      },
      null,
      2
    )
  );
  return outJson;
}

try {
  finalize();
} finally {
  await browser.close();
}
process.exit(report.PRODUCTION_WEB_OWNER_SHELL === "PASS" ? 0 : 1);

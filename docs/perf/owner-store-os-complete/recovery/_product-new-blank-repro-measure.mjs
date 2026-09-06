import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = "https://samarket.vercel.app";
const STORE = "19085860-52d2-4183-b033-e71fcb58bcec";
const USER = "sadads@adsasdsa.com";
const PASS = "1234";
const OUT_DIR = "/Users/bkkim/projects/samarket/docs/perf/owner-store-os-complete/recovery";
const SCREENSHOT = `${OUT_DIR}/product-new-blank-repro.png`;
const JSON_OUT = `${OUT_DIR}/product-new-blank-repro.json`;

mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
});

const page = await context.newPage();
const consoleErrors = [];
const pageErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", (err) => pageErrors.push(String(err?.stack || err?.message || err)));

// Login
await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 90_000 });
await page.waitForTimeout(1000);
const email = page.locator('input[type="text"], input[type="email"], input:not([type])').first();
await email.waitFor({ state: "visible", timeout: 30_000 });
await email.fill(USER);
await page.locator('input[type="password"]').first().fill(PASS);
const submit = page.getByRole("button", { name: /로그인|Log in|Login/i }).first();
await Promise.all([
  page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 90_000 }),
  submit.click(),
]);
console.log("LOGIN_OK", page.url());

// Goto product new
const target = `${BASE}/stores/owner/products/new?storeId=${STORE}`;
await page.goto(target, { waitUntil: "domcontentloaded", timeout: 90_000 });
await page.waitForTimeout(5000);

await page.screenshot({ path: SCREENSHOT, fullPage: true });

const dom = await page.evaluate(() => {
  const qs = (s) => document.querySelector(s);
  const qsa = (s) => [...document.querySelectorAll(s)];

  const bodyText = document.body?.innerText || "";
  const form = qs("#owner-product-form");
  const options = qs("[data-owner-product-options]");

  const fileInputs = qsa('input[type="file"]').map((el) => ({
    accept: el.accept,
    multiple: el.multiple,
    id: el.id || null,
    className: String(el.className || "").slice(0, 120),
    rect: (() => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height, top: r.top, bottom: r.bottom };
    })(),
  }));

  const imageAcceptInputs = fileInputs.filter((f) => /image/i.test(f.accept || ""));

  const imageMarkers = {
    dataOwnerProductImages: Boolean(qs("[data-owner-product-images]")),
    dataOwnerProductImagesBlock: Boolean(qs("[data-owner-product-images-block]")),
    testIdOwnerProductImages: Boolean(qs("[data-testid='owner-product-images']")),
    textProductImages: /Product images|상품 이미지|제품 이미지/i.test(bodyText),
    textRecommended512: /512/.test(bodyText),
  };

  const rectOf = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height, top: r.top, bottom: r.bottom, left: r.left, right: r.right };
  };

  const main = qs("main");

  // flex-1 scroll containers
  const flex1Scroll = qsa("*")
    .filter((el) => {
      const cl = String(el.className || "");
      const cs = getComputedStyle(el);
      const isFlex1 =
        cl.includes("flex-1") || cs.flexGrow === "1" || Number(cs.flexGrow) >= 1;
      const scrolls =
        cs.overflowY === "auto" ||
        cs.overflowY === "scroll" ||
        cs.overflow === "auto" ||
        cs.overflow === "scroll" ||
        (cl.includes("min-h-0") && cl.includes("flex-1"));
      return isFlex1 && (scrolls || cl.includes("min-h-0"));
    })
    .slice(0, 20)
    .map((el) => {
      const cs = getComputedStyle(el);
      return {
        tag: el.tagName,
        id: el.id || null,
        className: String(el.className || "").slice(0, 220),
        rect: rectOf(el),
        overflow: cs.overflow,
        overflowY: cs.overflowY,
        flexGrow: cs.flexGrow,
        minHeight: cs.minHeight,
        height: cs.height,
        visibility: cs.visibility,
        opacity: cs.opacity,
        display: cs.display,
      };
    });

  // sticky / fixed category strip
  const stickyCategory = qsa("*")
    .filter((el) => {
      const t = (el.textContent || "").trim();
      if (!t || t.length > 120) return false;
      if (!/CATEGORY|카테고리/i.test(t)) return false;
      const cs = getComputedStyle(el);
      return cs.position === "sticky" || cs.position === "fixed";
    })
    .slice(0, 10)
    .map((el) => {
      const cs = getComputedStyle(el);
      const r = rectOf(el);
      const vh = window.innerHeight;
      const offscreen =
        !r ||
        r.height === 0 ||
        r.bottom <= 0 ||
        r.top >= vh ||
        r.width === 0;
      return {
        tag: el.tagName,
        text: (el.textContent || "").trim().slice(0, 100),
        position: cs.position,
        top: cs.top,
        zIndex: cs.zIndex,
        visibility: cs.visibility,
        opacity: cs.opacity,
        display: cs.display,
        rect: r,
        heightZero: r ? r.height === 0 : true,
        offscreen,
      };
    });

  // Also look for sticky strips by class/data even without short text
  const stickyByClass = qsa("[class*='sticky'], [class*='Sticky'], [data-sticky], [data-category-strip]")
    .slice(0, 15)
    .map((el) => {
      const cs = getComputedStyle(el);
      const r = rectOf(el);
      const vh = window.innerHeight;
      return {
        tag: el.tagName,
        className: String(el.className || "").slice(0, 200),
        position: cs.position,
        text: (el.textContent || "").trim().slice(0, 80),
        rect: r,
        heightZero: r ? r.height === 0 : true,
        offscreen: !r || r.height === 0 || r.bottom <= 0 || r.top >= vh || r.width === 0,
      };
    });

  const reactOverlay =
    qs("nextjs-portal") ||
    qs("#__next-build-error") ||
    qs("[data-nextjs-dialog]") ||
    qs("[data-nextjs-toast]");
  let reactOverlayText = null;
  if (reactOverlay) {
    reactOverlayText = (reactOverlay.innerText || reactOverlay.textContent || "").slice(0, 800);
  }
  // Next.js error overlay often in shadow DOM / iframe
  const portals = qsa("nextjs-portal, iframe");
  const portalTexts = portals.map((p) => (p.innerText || p.textContent || "").slice(0, 200)).filter(Boolean);

  return {
    title: document.title,
    url: location.href,
    bodyInnerTextLength: bodyText.length,
    bodyInnerTextFirst500: bodyText.slice(0, 500),
    presence: {
      ownerProductForm: Boolean(form),
      dataOwnerProductOptions: Boolean(options),
      imageMarkers,
      fileInputCount: fileInputs.length,
      imageAcceptFileInputCount: imageAcceptInputs.length,
      fileInputs,
    },
    counts: {
      inputs: qsa("input").length,
      buttons: qsa("button").length,
      labels: qsa("label").length,
      textareas: qsa("textarea").length,
      selects: qsa("select").length,
    },
    layout: {
      main: rectOf(main),
      form: rectOf(form),
      flex1ScrollContainers: flex1Scroll,
    },
    stickyCategory,
    stickyByClass,
    reactOverlayText,
    portalTexts,
    viewport: { w: window.innerWidth, h: window.innerHeight },
  };
});

const result = {
  measuredAt: new Date().toISOString(),
  viewport: { width: 390, height: 844 },
  waitMs: 5000,
  screenshot: SCREENSHOT,
  pageUrl: page.url(),
  consoleErrors,
  pageErrors,
  ...dom,
};

writeFileSync(JSON_OUT, JSON.stringify(result, null, 2));

// Print exact numbers for the parent agent
console.log("=== PRODUCT NEW BLANK REPRO MEASUREMENT ===");
console.log(JSON.stringify({
  title: result.title,
  url: result.url,
  bodyInnerTextLength: result.bodyInnerTextLength,
  bodyInnerTextFirst500: result.bodyInnerTextFirst500,
  presence: result.presence,
  counts: result.counts,
  layout: result.layout,
  stickyCategory: result.stickyCategory,
  stickyByClass: result.stickyByClass,
  reactOverlayText: result.reactOverlayText,
  portalTexts: result.portalTexts,
  consoleErrors: result.consoleErrors,
  pageErrors: result.pageErrors,
  screenshot: SCREENSHOT,
}, null, 2));

await browser.close();

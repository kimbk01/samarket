/**
 * Feed Ad Geometry DOM measurement — NO product CSS changes.
 * CONTRACT: docs/dibay-paid-exposure-feed-ad-master-contract.md
 *
 * Run:
 *   PLAYWRIGHT_NO_WEBSERVER=1 npx playwright test tests/e2e/feed-ad-geometry-dom-measure.spec.ts --reporter=line
 */
import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { playwrightOriginFromEnv } from "./helpers/playwright-origin-and-session";

const OUT_DIR = path.join(
  process.cwd(),
  ".qa-logs",
  `feed-ad-geometry-dom-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`
);

type Box = {
  x: number;
  y: number;
  width: number;
  height: number;
  top: number;
  right: number;
  bottom: number;
  left: number;
};

type RowMeasure = {
  outer: Box | null;
  thumb: Box | null;
  media: Box | null;
  label: Box | null;
  pager: Box | null;
  padding: { top: number; right: number; bottom: number; left: number } | null;
  gapAfter: number | null;
  hasPrevChevron: boolean;
  hasNextChevron: boolean;
  slideButtons: number;
};

type SurfaceMeasure = {
  surface: string;
  url: string;
  viewport: { width: number; height: number };
  sequence: string[];
  normal: RowMeasure | null;
  ad: RowMeasure | null;
  viewportHeight: number;
  screenshot: string;
};

const VIEWPORTS: { name: string; width: number; height: number }[] = [
  { name: "phone-360", width: 360, height: 780 },
  { name: "phone-390", width: 390, height: 844 },
  { name: "phone-430", width: 430, height: 932 },
  { name: "phone-469", width: 469, height: 932 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "desktop-1280", width: 1280, height: 800 },
];

const SURFACES: { key: string; path: string }[] = [
  { key: "trade-home", path: "/market" },
  { key: "trade-category", path: "/market/trade" },
  { key: "community-home", path: "/philife" },
  { key: "community-topic", path: "/philife?category=recommended" },
];

function roundBox(b: Box | null): Box | null {
  if (!b) return null;
  const r = (n: number) => Math.round(n * 10) / 10;
  return {
    x: r(b.x),
    y: r(b.y),
    width: r(b.width),
    height: r(b.height),
    top: r(b.top),
    right: r(b.right),
    bottom: r(b.bottom),
    left: r(b.left),
  };
}

async function measureBox(page: Page, selector: string): Promise<Box | null> {
  const loc = page.locator(selector).first();
  if ((await loc.count()) === 0) return null;
  const handle = await loc.elementHandle();
  if (!handle) return null;
  return page.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return {
      x: r.x,
      y: r.y,
      width: r.width,
      height: r.height,
      top: r.top,
      right: r.right,
      bottom: r.bottom,
      left: r.left,
    };
  }, handle);
}

async function measureComputedPadding(
  page: Page,
  selector: string
): Promise<{ top: number; right: number; bottom: number; left: number } | null> {
  const loc = page.locator(selector).first();
  if ((await loc.count()) === 0) return null;
  const handle = await loc.elementHandle();
  if (!handle) return null;
  return page.evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      top: parseFloat(s.paddingTop) || 0,
      right: parseFloat(s.paddingRight) || 0,
      bottom: parseFloat(s.paddingBottom) || 0,
      left: parseFloat(s.paddingLeft) || 0,
    };
  }, handle);
}

async function waitForFeed(page: Page, surface: string): Promise<void> {
  if (surface.startsWith("trade")) {
    await expect(page.locator('a[href^="/post/"]').first()).toBeVisible({ timeout: 45_000 });
  } else {
    await expect(
      page.locator('a[href*="/philife/"], article, [data-community-card]').first()
    ).toBeVisible({ timeout: 45_000 });
  }
  // Ad may load async after posts
  await page.waitForTimeout(1200);
}

async function collectSequence(page: Page, surface: string): Promise<string[]> {
  return page.evaluate((surf) => {
    const out: string[] = [];
    const list =
      document.querySelector("ul") ||
      document.querySelector("[data-feed-list]") ||
      document.body;
    const items = Array.from(list.querySelectorAll(":scope > li, :scope > [data-feed-row]"));
    const nodes = items.length > 0 ? items : Array.from(document.querySelectorAll("li"));
    for (const li of nodes.slice(0, 12)) {
      if (li.hasAttribute("data-feed-ad-slot") || li.querySelector("[data-feed-ad-slot]")) {
        out.push("AD");
        continue;
      }
      const text = (li.textContent || "").toLowerCase();
      const promoted =
        text.includes("홍보") ||
        text.includes("promoted") ||
        !!li.querySelector("[data-promoted], .promotion, [class*='promo']");
      if (surf.startsWith("trade")) {
        if (li.querySelector('a[href^="/post/"]')) out.push(promoted ? "PROMOTED" : "NORMAL");
      } else if (li.querySelector("a, article, img, p")) {
        out.push(promoted ? "PROMOTED" : "NORMAL");
      }
    }
    return out;
  }, surface);
}

async function measureTradeNormal(page: Page): Promise<RowMeasure> {
  const outerSel = 'li:has(a[href^="/post/"]):not([data-feed-ad-slot])';
  const outer = roundBox(await measureBox(page, outerSel));
  const thumb = roundBox(
    await measureBox(page, `${outerSel} img, ${outerSel} [class*="thumb"], ${outerSel} picture`)
  );
  const padding = await measureComputedPadding(page, outerSel);
  const gapAfter = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const next = el.nextElementSibling as HTMLElement | null;
    if (!next) return null;
    const a = el.getBoundingClientRect();
    const b = next.getBoundingClientRect();
    return Math.round((b.top - a.bottom) * 10) / 10;
  }, outerSel);
  return {
    outer,
    thumb,
    media: thumb,
    label: null,
    pager: null,
    padding,
    gapAfter,
    hasPrevChevron: false,
    hasNextChevron: false,
    slideButtons: 0,
  };
}

async function measureCommunityNormal(page: Page): Promise<RowMeasure> {
  const outerSel = "ul li:not([data-feed-ad-slot])";
  const outer = roundBox(await measureBox(page, outerSel));
  const media = roundBox(await measureBox(page, `${outerSel} img`));
  const padding = await measureComputedPadding(page, outerSel);
  const gapAfter = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const next = el.nextElementSibling as HTMLElement | null;
    if (!next) return null;
    const a = el.getBoundingClientRect();
    const b = next.getBoundingClientRect();
    return Math.round((b.top - a.bottom) * 10) / 10;
  }, outerSel);
  return {
    outer,
    thumb: media,
    media,
    label: null,
    pager: null,
    padding,
    gapAfter,
    hasPrevChevron: false,
    hasNextChevron: false,
    slideButtons: 0,
  };
}

async function measureAd(page: Page): Promise<RowMeasure | null> {
  const adRoot = page.locator("[data-feed-ad-slot]").first();
  if ((await adRoot.count()) === 0) return null;
  await adRoot.scrollIntoViewIfNeeded().catch(() => null);
  await page.waitForTimeout(300);
  const outer = roundBox(await measureBox(page, "[data-feed-ad-slot]"));
  const media = roundBox(await measureBox(page, "[data-feed-ad-slot] img"));
  const label = roundBox(
    await measureBox(page, "[data-feed-ad-slot] span, [data-feed-ad-slot] :text('Ad'), [data-feed-ad-slot] :text('광고')")
  );
  // Prefer the label chip in the header row
  const labelAlt = roundBox(
    await measureBox(page, "[data-feed-ad-slot] .sam-text-helper, [data-feed-ad-slot] span.rounded")
  );
  const pager = roundBox(
    await measureBox(page, "[data-feed-ad-slot] button[aria-label^='slide']")
  );
  const padding = await measureComputedPadding(page, "[data-feed-ad-slot] > div");
  const gapAfter = await page.evaluate(() => {
    const el = document.querySelector("[data-feed-ad-slot]");
    if (!el) return null;
    const next = el.nextElementSibling as HTMLElement | null;
    if (!next) return null;
    const a = el.getBoundingClientRect();
    const b = next.getBoundingClientRect();
    return Math.round((b.top - a.bottom) * 10) / 10;
  });
  const chevrons = await page.evaluate(() => {
    const root = document.querySelector("[data-feed-ad-slot]");
    if (!root) return { prev: false, next: false, slides: 0 };
    const text = root.textContent || "";
    const buttons = Array.from(root.querySelectorAll("button"));
    const slideBtns = buttons.filter((b) =>
      (b.getAttribute("aria-label") || "").startsWith("slide")
    ).length;
    return {
      prev: text.includes("‹") || buttons.some((b) => (b.textContent || "").includes("‹")),
      next: text.includes("›") || buttons.some((b) => (b.textContent || "").includes("›")),
      slides: slideBtns,
    };
  });
  return {
    outer,
    thumb: null,
    media,
    label: label || labelAlt,
    pager,
    padding,
    gapAfter,
    hasPrevChevron: chevrons.prev,
    hasNextChevron: chevrons.next,
    slideButtons: chevrons.slides,
  };
}

async function measureAdHeightAcrossSlides(page: Page): Promise<number[] | null> {
  const root = page.locator("[data-feed-ad-slot]").first();
  if ((await root.count()) === 0) return null;
  const buttons = root.locator("button[aria-label^='slide']");
  const n = await buttons.count();
  if (n < 2) {
    const h = (await measureBox(page, "[data-feed-ad-slot]"))?.height ?? null;
    return h == null ? null : [Math.round(h * 10) / 10];
  }
  const heights: number[] = [];
  for (let i = 0; i < n; i++) {
    await buttons.nth(i).click();
    await page.waitForTimeout(200);
    const box = await measureBox(page, "[data-feed-ad-slot]");
    heights.push(Math.round((box?.height ?? 0) * 10) / 10);
  }
  return heights;
}

test.describe("Feed Ad Geometry DOM measure (no CSS change)", () => {
  test.setTimeout(600_000);

  test("measure all surfaces × viewports", async ({ page }) => {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const origin = playwrightOriginFromEnv();
    const results: SurfaceMeasure[] = [];
    const slideHeights: Record<string, number[] | null> = {};

    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      for (const surface of SURFACES) {
        const url = `${origin}${surface.path}`;
        await page.goto(url, { waitUntil: "domcontentloaded" });
        await waitForFeed(page, surface.key).catch(() => null);

        // Scroll until ad is in DOM if present later in list
        for (let i = 0; i < 10; i++) {
          if ((await page.locator("[data-feed-ad-slot]").count()) > 0) break;
          await page.mouse.wheel(0, 700);
          await page.waitForTimeout(500);
        }
        // Extra settle for slower tablet/desktop shells
        if ((await page.locator("[data-feed-ad-slot]").count()) === 0) {
          await page.waitForTimeout(2000);
          await page.mouse.wheel(0, 900);
          await page.waitForTimeout(800);
        }

        const sequence = await collectSequence(page, surface.key);
        const normal = surface.key.startsWith("trade")
          ? await measureTradeNormal(page)
          : await measureCommunityNormal(page);
        const ad = await measureAd(page);

        const shotName = `${vp.name}__${surface.key}.png`;
        const shotPath = path.join(OUT_DIR, shotName);
        // Prefer framing that includes posts around ad
        if (ad?.outer) {
          await page.locator("[data-feed-ad-slot]").first().scrollIntoViewIfNeeded();
          await page.waitForTimeout(200);
        }
        await page.screenshot({ path: shotPath, fullPage: false });

        if (vp.name === "phone-390" && ad) {
          slideHeights[surface.key] = await measureAdHeightAcrossSlides(page);
        }

        results.push({
          surface: surface.key,
          url: surface.path,
          viewport: { width: vp.width, height: vp.height },
          sequence,
          normal,
          ad,
          viewportHeight: vp.height,
          screenshot: shotName,
        });
      }
    }

    // Empty ad surface — category/topic without campaign
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${origin}/market/jobs`, { waitUntil: "domcontentloaded" }).catch(() => null);
    await page.waitForTimeout(1500);
    const emptyAdCount = await page.locator("[data-feed-ad-slot]").count();

    const summary = {
      outDir: OUT_DIR,
      provisionalAspect: "12:5",
      provisionalMaxH: "132~148",
      slotCanonical: 4,
      emptyAdJobsSurfaceCount: emptyAdCount,
      slideHeightsAt390: slideHeights,
      rows: results.map((r) => {
        const nW = r.normal?.outer?.width ?? null;
        const nH = r.normal?.outer?.height ?? null;
        const aW = r.ad?.outer?.width ?? null;
        const aH = r.ad?.outer?.height ?? null;
        return {
          surface: r.surface,
          viewport: r.viewport.width,
          sequence: r.sequence,
          normalW: nW,
          normalH: nH,
          normalThumbW: r.normal?.thumb?.width ?? null,
          normalThumbH: r.normal?.thumb?.height ?? null,
          adW: aW,
          adH: aH,
          adMediaW: r.ad?.media?.width ?? null,
          adMediaH: r.ad?.media?.height ?? null,
          widthDiff: nW != null && aW != null ? Math.round((aW - nW) * 10) / 10 : null,
          heightRatio: nH && aH ? Math.round((aH / nH) * 100) / 100 : null,
          adViewportRatio: aH ? Math.round((aH / r.viewportHeight) * 1000) / 1000 : null,
          adSlideButtons: r.ad?.slideButtons ?? 0,
          chevrons: r.ad
            ? { prev: r.ad.hasPrevChevron, next: r.ad.hasNextChevron }
            : null,
          screenshot: r.screenshot,
        };
      }),
    };

    fs.writeFileSync(path.join(OUT_DIR, "REPORT.json"), JSON.stringify(summary, null, 2));
    fs.writeFileSync(path.join(OUT_DIR, "RAW.json"), JSON.stringify(results, null, 2));
    console.log(JSON.stringify(summary, null, 2));

    // Soft assertions — measurement must produce numbers for at least category+topic ads
    const cat390 = summary.rows.find(
      (r) => r.surface === "trade-category" && r.viewport === 390
    );
    expect(cat390?.normalH).toBeTruthy();
    expect(cat390?.adH).toBeTruthy();
  });
});

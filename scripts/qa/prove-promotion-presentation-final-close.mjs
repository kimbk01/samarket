/**
 * Capture Presentation Final Close screenshots via Playwright.
 * Uses actual Next proof route with production renderers.
 *
 * Usage (dev server must be running on PROOF_BASE_URL):
 *   PROOF_BASE_URL=http://127.0.0.1:3000 node scripts/qa/prove-promotion-presentation-final-close.mjs
 */
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.PROOF_BASE_URL || "http://127.0.0.1:3000";
const OUT = join(process.cwd(), ".tmp/promotion-presentation-final-close");

const VIEWPORTS = {
  phone: { width: 390, height: 844 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1280, height: 800 },
};

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.PROOF_CHROME_CHANNEL || "chrome",
  });
  const report = {
    ok: false,
    base: BASE,
    captured: /** @type {string[]} */ ([]),
    missing: /** @type {string[]} */ ([]),
    error: /** @type {string|null} */ (null),
  };

  try {
    const page = await browser.newPage();
    await page.addInitScript(() => {
      try {
        // Hide Next.js dev indicator / issue toast from visual captures.
        const style = document.createElement("style");
        style.textContent =
          "nextjs-portal,[data-next-badge-root],#__next-build-watcher,[data-nextjs-toast],[data-nextjs-dialog-overlay]{display:none!important;visibility:hidden!important;}";
        document.documentElement.appendChild(style);
      } catch {
        /* ignore */
      }
    });
    const url = `${BASE}/dev/promotion-presentation-close`;
    const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    if (!res || !res.ok()) {
      throw new Error(`proof_page_http_${res?.status() ?? "none"}`);
    }
    await page.waitForSelector('[data-promotion-proof="1"]', { timeout: 30000 });
    await page.waitForTimeout(800);

    /**
     * @param {import('@playwright/test').Locator} locator
     * @param {string} name
     */
    async function shot(locator, name) {
      await locator.scrollIntoViewIfNeeded();
      await page.waitForTimeout(150);
      await locator.screenshot({ path: join(OUT, name) });
      report.captured.push(name);
    }

    const compositions = ["artwork", "card", "sheet", "benefit"];
    const viewports = ["phone", "tablet", "desktop"];
    let n = 1;
    for (const composition of compositions) {
      await page.click(`[data-proof-composition="${composition}"]`);
      await page.waitForTimeout(250);
      for (const vp of viewports) {
        await page.click(`[data-proof-viewport="${vp}"]`);
        await page.setViewportSize(VIEWPORTS[vp]);
        await page.waitForTimeout(300);
        await page.locator('[data-proof-popup-stage="1"] img').first().waitFor({ state: "visible", timeout: 10000 }).catch(() => undefined);
        const name = `${String(n).padStart(2, "0")}_${composition}_${vp}.png`;
        await shot(page.locator('[data-proof-popup-stage="1"]'), name);
        n += 1;
      }
    }

    await page.setViewportSize(VIEWPORTS.phone);
    for (const composition of compositions) {
      await page.click(`[data-proof-composition="${composition}"]`);
      await page.waitForTimeout(150);
      const name = `${String(n).padStart(2, "0")}_admin_selector_${composition}.png`;
      await shot(page.locator('[data-proof-composition-selector="1"]'), name);
      n += 1;
    }

    for (const vp of viewports) {
      await page.click(`[data-proof-viewport="${vp}"]`);
      await page.setViewportSize(VIEWPORTS[vp]);
      await page.click('[data-proof-composition="artwork"]');
      await page.waitForTimeout(250);
      const name = `${String(n).padStart(2, "0")}_admin_preview_${vp}.png`;
      await shot(page.locator('[data-proof-popup-stage="1"]'), name);
      n += 1;
    }

    {
      const name = `${String(n).padStart(2, "0")}_popup_roundtrip_runtime.png`;
      await shot(page.locator('[data-proof-popup-stage="1"]'), name);
      n += 1;
    }

    for (const vp of viewports) {
      await page.setViewportSize(VIEWPORTS[vp]);
      await page.waitForTimeout(200);
      await page.locator('[data-proof-banner-inline="1"] img').first().waitFor({ state: "visible", timeout: 10000 });
      const inlineName = `${String(n).padStart(2, "0")}_inline_${vp}.png`;
      await shot(page.locator('[data-proof-banner-inline="1"]'), inlineName);
      n += 1;
    }
    for (const vp of viewports) {
      await page.setViewportSize(VIEWPORTS[vp]);
      await page.waitForTimeout(200);
      await page.locator('[data-proof-banner-hero="1"] img').first().waitFor({ state: "visible", timeout: 10000 });
      const heroName = `${String(n).padStart(2, "0")}_hero_${vp}.png`;
      await shot(page.locator('[data-proof-banner-hero="1"]'), heroName);
      n += 1;
    }

    {
      await page.setViewportSize(VIEWPORTS.phone);
      await page.waitForTimeout(200);
      const a = `${String(n).padStart(2, "0")}_admin_banner_inline_preview.png`;
      await shot(page.locator('[data-proof-banner-inline="1"]'), a);
      n += 1;
      const b = `${String(n).padStart(2, "0")}_admin_banner_hero_preview.png`;
      await shot(page.locator('[data-proof-banner-hero="1"]'), b);
      n += 1;
      const c = `${String(n).padStart(2, "0")}_inline_runtime_roundtrip.png`;
      await shot(page.locator('[data-proof-banner-inline="1"]'), c);
      n += 1;
      const d = `${String(n).padStart(2, "0")}_hero_runtime_roundtrip.png`;
      await shot(page.locator('[data-proof-banner-hero="1"]'), d);
      n += 1;
    }

    report.ok = report.captured.length >= 30;
    if (!report.ok) {
      report.missing.push(`expected_>=30_got_${report.captured.length}`);
    }
  } catch (e) {
    report.error = e instanceof Error ? e.message : String(e);
    report.ok = false;
  } finally {
    await browser.close();
  }

  writeFileSync(join(OUT, "REPORT.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}

main();

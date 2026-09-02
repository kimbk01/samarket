#!/usr/bin/env node
/**
 * CUT 3 — web geometry runtime proof (phone + tablet + landscape simulation).
 * Mock resolve API → measure DibayPopupAd DOM on /market.
 *
 * PLAYWRIGHT_BASE_URL=http://localhost:3000 node scripts/qa/platform-popup-cut3-geometry-runtime.mjs
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const OUT_DIR = join(ROOT, "docs/perf/platform-popup-cut3-runtime");
mkdirSync(OUT_DIR, { recursive: true });

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

const MOCK_IMAGE =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="360" height="250" viewBox="0 0 360 250"><rect width="360" height="250" fill="#085C3F"/></svg>'
  );

const MOCK_WINNER = {
  campaignId: "00000000-0000-4000-8000-000000000001",
  creativeId: "00000000-0000-4000-8000-000000000002",
  surface: "TRADE",
  creative: {
    id: "00000000-0000-4000-8000-000000000002",
    imageUrl: MOCK_IMAGE,
    altText: "CUT3 QA",
    aspectW: 36,
    aspectH: 25,
  },
  cta: { type: "internal_page", href: "/market", label: null },
  suppressionOptions: ["TODAY"],
  timezone: "Asia/Manila",
  suppressionDurationSeconds: null,
};

async function measureViewport(context, label, width, height, landscape = false) {
  const page = await context.newPage();
  try {
    await page.setViewportSize(
      landscape ? { width: height, height: width } : { width, height }
    );
    await page.goto(`${BASE_URL}/market`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    try {
      await page.waitForSelector("[data-platform-popup-card]", { timeout: 25_000 });
    } catch {
      await page.waitForTimeout(1500);
    }

    const hasCard = await page.locator("[data-platform-popup-card]").count();
    const contentWidth = await page.evaluate(() => {
      const col = document.querySelector(".app-shell") ?? document.documentElement;
      return col.getBoundingClientRect().width;
    });

    if (!hasCard) {
      return {
        label,
        viewport: `${landscape ? height : width}x${landscape ? width : height}`,
        landscape,
        rendered: false,
        contentWidth,
      };
    }

    await page.waitForSelector("[data-platform-popup-creative] img", { timeout: 5000 });

    const rects = await page.evaluate(() => {
      const card = document.querySelector("[data-platform-popup-card]");
      const creative = document.querySelector("[data-platform-popup-creative]");
      const dismiss = document.querySelector("[data-platform-popup-dismiss-row]");
      if (!card || !creative || !dismiss) return null;
      const cr = card.getBoundingClientRect();
      const cv = creative.getBoundingClientRect();
      const dr = dismiss.getBoundingClientRect();
      const style = getComputedStyle(card);
      return {
        popup: { w: cr.width, h: cr.height, bottom: cr.bottom },
        creative: { w: cv.width, h: cv.height },
        dismiss: { w: dr.width, h: dr.height },
        radiusTopLeft: style.borderTopLeftRadius,
      };
    });

    if (!rects) {
      return { label, viewport: `${width}x${height}`, landscape, rendered: false, contentWidth };
    }

    const popupH = rects.popup.h;
    return {
      label,
      viewport: `${landscape ? height : width}x${landscape ? width : height}`,
      landscape,
      rendered: true,
      contentWidth,
      popup: rects.popup,
      creative: rects.creative,
      dismiss: rects.dismiss,
      widthRatio: rects.popup.w / contentWidth,
      creativeAspect: rects.creative.w / rects.creative.h,
      creativeShare: rects.creative.h / popupH,
      dismissShare: rects.dismiss.h / popupH,
      heightEnvelopeVh: (popupH / (landscape ? width : height)) * 100,
      radiusTopLeft: rects.radiusTopLeft,
    };
  } finally {
    await page.close();
  }
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();

await context.route("**/api/platform-popup/resolve**", async (route) => {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      ok: true,
      winner: MOCK_WINNER,
      impression: false,
      surface: "TRADE",
    }),
  });
});

await context.route("**/api/platform-popup/events**", async (route) => {
  await route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
});

await context.route("**/api/platform-popup/suppress**", async (route) => {
  await route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
});

const results = [];
results.push(await measureViewport(context, "phone_portrait", 390, 844));
results.push(await measureViewport(context, "tablet_portrait", 768, 1024));
results.push(await measureViewport(context, "phone_landscape", 390, 844, true));

const shotPage = await context.newPage();
await shotPage.setViewportSize({ width: 390, height: 844 });
await shotPage.goto(`${BASE_URL}/market`, { waitUntil: "domcontentloaded", timeout: 60_000 });
await shotPage.waitForTimeout(800);
await shotPage.screenshot({ path: join(OUT_DIR, "phone-portrait-390.png"), fullPage: false });
await shotPage.close();

const report = {
  generatedAt: new Date().toISOString(),
  baseUrl: BASE_URL,
  classification: "DIBAY_IMPLEMENTATION_CALIBRATION",
  backdrop: "rgba(0, 0, 0, 0.45)",
  tabletMaxWidthPx: 480,
  radiusToken: "clamp(8px, 3cqi, 16px)",
  measurements: results,
  webOrientationSimulation: true,
};

writeFileSync(join(OUT_DIR, "cut3-geometry-report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

await browser.close();

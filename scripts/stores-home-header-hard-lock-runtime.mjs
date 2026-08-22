#!/usr/bin/env node
/**
 * `/stores` header 1·2·3 HARD LOCK runtime proof.
 * PLAYWRIGHT_BASE_URL=http://localhost:3000 node scripts/stores-home-header-hard-lock-runtime.mjs
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const origin = (process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const outDir = path.resolve(process.cwd(), "docs/perf/stores-home-header-hard-lock");
mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, `hard-lock-${Date.now()}.json`);
const latestPath = path.join(outDir, "hard-lock-latest.json");

const VIEWPORTS = [
  { name: "390", width: 390, height: 844 },
  { name: "430", width: 430, height: 932 },
  { name: "768", width: 768, height: 1024 },
  { name: "820", width: 820, height: 1180 },
  { name: "desktop", width: 1280, height: 800 },
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function sampleGeometry(page) {
  return page.evaluate(() => {
    const visible = (el) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 2 && s.visibility !== "hidden" && Number(s.opacity) > 0.05;
    };
    const rect = (sel) => {
      const el = document.querySelector(sel);
      return el ? el.getBoundingClientRect() : null;
    };
    const edge = (r) =>
      r ?
        { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), h: Math.round(r.height) }
      : null;
    const chromeInners = [...document.querySelectorAll("[data-stores-home-chrome-inner]")];
    const innerEdges = chromeInners.map((el) => {
      const r = el.getBoundingClientRect();
      return { left: Math.round(r.left), right: Math.round(r.right) };
    });
    let widthMaxDelta = 0;
    if (innerEdges.length >= 2) {
      const lefts = innerEdges.map((x) => x.left);
      const rights = innerEdges.map((x) => x.right);
      widthMaxDelta = Math.max(Math.max(...lefts) - Math.min(...lefts), Math.max(...rights) - Math.min(...rights));
    }
    const t1 = rect('[data-stores-home-tier="1"]');
    const t2 = rect('[data-stores-home-tier="2"]');
    const t3 = rect('[data-stores-home-tier="3"]');
    return {
      tier1InstanceMax: document.querySelectorAll('[data-stores-home-tier="1"]').length,
      tier2InstanceMax: document.querySelectorAll('[data-stores-home-tier="2"]').length,
      tier3InstanceMax: document.querySelectorAll('[data-stores-home-tier="3"]').length,
      tier1Visible: visible(document.querySelector('[data-stores-home-tier="1"]')),
      tier2Visible: visible(document.querySelector('[data-stores-home-tier="2"]')),
      tier3Visible: visible(document.querySelector('[data-stores-home-tier="3"]')),
      tier1Hidden: document.querySelector("[data-stores-home-tier1-shell]")?.getAttribute("data-hidden") ?? null,
      tier2Revealed: document.querySelector("[data-stores-home-tier2-reveal]")?.getAttribute("data-revealed") ?? null,
      scrollTop: document.querySelector("[data-main-hub-scroll-body]")?.scrollTop ?? 0,
      widthMaxDelta,
      chromeInnerCount: chromeInners.length,
      tier1: edge(t1),
      tier2: edge(t2),
      tier3: edge(t3),
      contentStartTop: document.querySelector("[data-stores-home-scroll-content-start]")?.getBoundingClientRect().top ?? null,
      tier3Bottom: document.querySelector("[data-stores-home-tier3-boundary]")?.getBoundingClientRect().bottom ?? null,
      counters: window.__storesHomeHeaderCounters ?? null,
    };
  });
}

async function timelineDuringScroll(page, direction, steps = 5) {
  const frames = [];
  const scrollRoot = page.locator("[data-main-hub-scroll-body]");
  const delta = direction === "down" ? 80 : -80;
  for (let i = 0; i < steps; i++) {
    await scrollRoot.evaluate((el, d) => el.scrollBy(0, d), delta);
    await sleep(50);
    frames.push({ t: i * 50, ...(await sampleGeometry(page)) });
  }
  return frames;
}

async function runViewport(browser, vp) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await ctx.newPage();
  const result = { viewport: vp.name, cases: {}, widthMaxDelta: null, fail: [] };

  await page.addInitScript(() => {
    window.__storesHomeHeaderCounters = {
      scrollCorrectionCount: 0,
      tier1HideCount: 0,
      tier1ShowCount: 0,
      tier2RevealCount: 0,
      tier2CollapseCount: 0,
    };
  });

  try {
    await page.goto(`${origin}/stores`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.locator('[data-stores-home-tier="3"]').waitFor({ state: "attached", timeout: 60_000 });
    await page.locator("[data-stores-home-chrome-inner]").first().waitFor({ state: "visible", timeout: 60_000 });
    await sleep(500);

    const cold = await sampleGeometry(page);
    result.cases.A_cold = cold;
    if (!cold.tier1Visible || cold.tier2Visible || !cold.tier3Visible) {
      result.fail.push("CASE_A: cold entry tier state");
    }
    if (cold.tier1InstanceMax > 1 || cold.tier2InstanceMax > 1 || cold.tier3InstanceMax > 1) {
      result.fail.push("CASE_A: tier instance max > 1");
    }

    const primary = page.locator('[data-stores-home-tier="3"] button[role="tab"]').first();
    if (await primary.count()) {
      await Promise.all([
        page.waitForURL(/\/stores\/browse\//, { timeout: 45_000, waitUntil: "domcontentloaded" }),
        primary.click(),
      ]);
      result.cases.B_primary_nav = { url: page.url(), pass: /\/stores\/browse\//.test(page.url()) };
      if (!result.cases.B_primary_nav.pass) result.fail.push("CASE_B: primary nav");
      await page.goBack({ waitUntil: "domcontentloaded" });
      await sleep(400);
    }

    const downFrames = await timelineDuringScroll(page, "down", 6);
    result.cases.C_scroll_down = downFrames;
    const afterDown = downFrames[downFrames.length - 1];
    if (!afterDown?.tier1Hidden || afterDown.tier1Hidden !== "true") {
      result.fail.push("CASE_C: tier1 not hidden after scroll down");
    }

    if (await primary.count()) {
      await Promise.all([
        page.waitForURL(/\/stores\/browse\//, { timeout: 45_000, waitUntil: "domcontentloaded" }),
        primary.click(),
      ]);
      result.cases.D_primary_while_tier2 = { url: page.url(), pass: /\/stores\/browse\//.test(page.url()) };
      await page.goBack({ waitUntil: "domcontentloaded" });
      await sleep(400);
    }

    const upFrames = await timelineDuringScroll(page, "up", 8);
    result.cases.E_scroll_up = upFrames;

    let oscillation = 0;
    for (let i = 0; i < 20; i++) {
      await page.locator("[data-main-hub-scroll-body]").evaluate((el, n) => el.scrollBy(0, n), i % 2 === 0 ? 120 : -100);
      await sleep(30);
      const s = await sampleGeometry(page);
      if (s.tier1Hidden === "true" && i % 2 === 1) oscillation++;
    }
    result.cases.F_rapid_swipe = { oscillation, pass: oscillation < 8 };
    if (!result.cases.F_rapid_swipe.pass) result.fail.push("CASE_F: oscillation");

    result.widthMaxDelta = cold.widthMaxDelta;
    if (cold.widthMaxDelta > 2) result.fail.push(`WIDTH_${vp.name}: delta=${cold.widthMaxDelta}`);
  } catch (e) {
    result.fail.push(String(e?.message ?? e));
  } finally {
    await ctx.close();
  }
  return result;
}

const browser = await chromium.launch({ headless: true });
const report = { origin, at: new Date().toISOString(), viewports: [], summary: { pass: true, fail: [] } };

for (const vp of VIEWPORTS) {
  const r = await runViewport(browser, vp);
  report.viewports.push(r);
  if (r.fail.length) {
    report.summary.pass = false;
    report.summary.fail.push(...r.fail.map((f) => `${vp.name}: ${f}`));
  }
}

await browser.close();
writeFileSync(outPath, JSON.stringify(report, null, 2));
writeFileSync(latestPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.summary, null, 2));
console.log(`wrote ${latestPath}`);
process.exit(report.summary.pass ? 0 : 1);

/**
 * P1-B4 Production detail close — popular vs owner recommended section semantics.
 * PLAYWRIGHT_BASE_URL=https://samarket.vercel.app node scripts/qa/p1-b4-detail-production-close.mjs
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const baseUrl = (process.env.PLAYWRIGHT_BASE_URL ?? "https://samarket.vercel.app").replace(/\/$/, "");
const outDir = path.resolve(process.cwd(), "docs/perf/p1-b4-detail-production-close");
mkdirSync(outDir, { recursive: true });

const RECOMMENDED_MENU_STRIP_MAX = 5;
const DETAIL_STORES = (process.env.P1_B4_DETAIL_STORES ?? "aa11,jtv-4cd1e71c").split(",").map((s) => s.trim()).filter(Boolean);

function buildOwnerRecommendedStripProductIds(cards, maxItems, excludeProductIds) {
  const cap = Math.min(RECOMMENDED_MENU_STRIP_MAX, Math.max(1, Math.floor(maxItems) || RECOMMENDED_MENU_STRIP_MAX));
  const excluded = new Set(excludeProductIds.map((id) => String(id ?? "").trim()).filter(Boolean));
  const pool = cards
    .filter((p) => p.is_owner_recommended && !excluded.has(p.id))
    .sort((a, b) => {
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return String(a.title).localeCompare(String(b.title), "ko");
    });
  return pool.slice(0, cap).map((p) => p.id);
}

async function fetchMenus(page, slug) {
  const q = new URLSearchParams({ fresh: "1" });
  const url = `${baseUrl}/api/stores/${encodeURIComponent(slug)}/menus?${q}`;
  const res = await page.request.get(url);
  const json = await res.json();
  return { status: res.status(), json, menusUrl: url };
}

function parseMenuProducts(json) {
  const raw = Array.isArray(json?.products) ? json.products : [];
  return raw.map((row) => {
    const o = row;
    const sortRaw = Number(o.sort_order);
    return {
      id: String(o.id ?? "").trim(),
      title: String(o.title ?? "").trim(),
      is_owner_recommended: o.is_owner_recommended === true || o.is_featured === true,
      is_representative: o.is_representative === true,
      sort_order: Number.isFinite(sortRaw) ? Math.floor(sortRaw) : 0,
    };
  }).filter((p) => p.id);
}

async function waitDetailMenus(page, timeoutMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const popular = await page.locator("section").filter({ hasText: /인기 메뉴|Popular menu/ }).count();
    const menuBoard = await page.locator("#store-menu-panel").count();
    if (popular > 0 || menuBoard > 0) {
      const titles = await page.locator("h3.delivery-store-row__title, #store-menu-panel p.line-clamp-2").count();
      if (titles > 0) return true;
    }
    await page.waitForTimeout(800);
  }
  return false;
}

async function extractDetailSections(page) {
  return page.evaluate(() => {
    const norm = (s) => (s ?? "").trim();
    const sections = [...document.querySelectorAll("section")];
    const popularSec = sections.find((s) => {
      const h = norm(s.querySelector("h2")?.textContent);
      return h === "인기 메뉴" || h === "Popular menu";
    });
    const recSec = sections.find((s) => {
      const h = norm(s.querySelector("h2")?.textContent);
      return h === "추천 메뉴" || h === "Recommended";
    });

    const popularTitles = popularSec
      ? [...popularSec.querySelectorAll("p.line-clamp-2")].map((el) => norm(el.textContent)).filter(Boolean)
      : [];

    const recTitles = recSec
      ? [...recSec.querySelectorAll("p.line-clamp-2")].map((el) => norm(el.textContent)).filter(Boolean)
      : [];

    const badgeTexts = [...document.querySelectorAll("#store-menu-panel span")]
      .map((el) => norm(el.textContent))
      .filter((t) =>
        ["인기", "Popular", "사장님 추천", "Owner's pick", "대표", "Representative"].some((k) => t.includes(k))
      );

    return {
      hasPopularSection: !!popularSec,
      hasRecommendedSection: !!recSec,
      popularTitles,
      recTitles,
      badgeTextsSample: badgeTexts.slice(0, 20),
    };
  });
}

function titlesMatchOrder(expectedTitles, actualTitles) {
  if (expectedTitles.length !== actualTitles.length) return false;
  return expectedTitles.every((t, i) => t === actualTitles[i]);
}

async function auditStore(page, slug) {
  const menus = await fetchMenus(page, slug);
  if (menus.status !== 200 || !menus.json?.ok) {
    return { slug, error: `menus ${menus.status}`, pass: false };
  }

  const products = parseMenuProducts(menus.json);
  const popIds = Array.isArray(menus.json.popularProductIds) ? menus.json.popularProductIds.map(String) : [];
  const stripCap = Math.min(
    RECOMMENDED_MENU_STRIP_MAX,
    Math.max(1, Math.floor(Number(menus.json.meta?.popular_menu?.recommended_max)) || RECOMMENDED_MENU_STRIP_MAX)
  );
  const byId = new Map(products.map((p) => [p.id, p]));
  const expectedPopularTitles = popIds.map((id) => byId.get(id)?.title).filter(Boolean);
  const expectedRecIds = buildOwnerRecommendedStripProductIds(products, stripCap, popIds);
  const expectedRecTitles = expectedRecIds.map((id) => byId.get(id)?.title).filter(Boolean);

  const overlapIds = popIds.filter((id) => byId.get(id)?.is_owner_recommended);
  const overlapInRec = expectedRecIds.filter((id) => popIds.includes(id));

  let menusRequestCount = 0;
  const onRequest = (req) => {
    if (req.url().includes(`/api/stores/${slug}/menus`) || req.url().includes(`/api/stores/${encodeURIComponent(slug)}/menus`)) {
      menusRequestCount += 1;
    }
  };
  page.on("request", onRequest);

  await page.goto(`${baseUrl}/stores/${encodeURIComponent(slug)}`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await waitDetailMenus(page);
  await page.waitForTimeout(4000);
  page.off("request", onRequest);

  const dom = await extractDetailSections(page);

  const popularPass =
    expectedPopularTitles.length === 0
      ? !dom.hasPopularSection && dom.popularTitles.length === 0
      : dom.hasPopularSection && titlesMatchOrder(expectedPopularTitles, dom.popularTitles);

  const recPass =
    expectedRecTitles.length === 0
      ? !dom.hasRecommendedSection && dom.recTitles.length === 0
      : dom.hasRecommendedSection && titlesMatchOrder(expectedRecTitles, dom.recTitles);

  const overlapDedupePass = overlapInRec.length === 0;

  const ownerOnlyInRec =
    expectedRecIds.length === 0
      ? true
      : expectedRecIds.every((id) => byId.get(id)?.is_owner_recommended);

  const popularOnlyNotInRec = popIds.every((id) => !expectedRecIds.includes(id));

  return {
    slug,
    menusStatus: menus.status,
    api: {
      popularProductIds: popIds,
      expectedRecIds,
      overlapPopularAndOwner: overlapIds,
      ownerRecommendedCount: products.filter((p) => p.is_owner_recommended).length,
    },
    expected: { popularTitles: expectedPopularTitles, recTitles: expectedRecTitles },
    dom,
    menusRequestCount,
    popularPass,
    recPass,
    overlapDedupePass,
    ownerOnlyInRec,
    popularOnlyNotInRec,
    pass: popularPass && recPass && overlapDedupePass && ownerOnlyInRec && menusRequestCount <= 2,
  };
}

async function smokeStatus(page, path) {
  const res = await page.request.get(`${baseUrl}${path}`);
  return { path, status: res.status() };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  const stores = [];
  for (const slug of DETAIL_STORES) {
    stores.push(await auditStore(page, slug));
  }

  const home = await smokeStatus(page, "/stores");
  const browse = await smokeStatus(page, "/stores/browse/restaurant?sub=all&fresh=1");

  let browsePopularLine = false;
  if (browse.status === 200) {
    await page.goto(`${baseUrl}/stores/browse/restaurant?sub=all&fresh=1`, {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
    for (let i = 0; i < 60; i++) {
      if ((await page.locator("h3.delivery-store-row__title").count()) > 0) break;
      await page.waitForTimeout(1000);
    }
    browsePopularLine = await page.evaluate(() => {
      const text = document.body.innerText || "";
      return text.includes("인기 메뉴:") || text.includes("Popular menu:");
    });
  }

  const report = {
    baseUrl,
    commit: process.env.P1_B4_COMMIT ?? "pending",
    stores,
    smoke: {
      home,
      browse,
      browsePopularLinePreserved: browsePopularLine,
    },
    summary: {
      popularSection: stores.every((s) => s.popularPass) ? "PASS" : "FAIL",
      recommendedSection: stores.every((s) => s.recPass) ? "PASS" : "FAIL",
      overlapDedupe: stores.every((s) => s.overlapDedupePass) ? "PASS" : "FAIL",
      ownerOnlyRecommended: stores.every((s) => s.ownerOnlyInRec) ? "PASS" : "FAIL",
      popularOnlyNotInRec: stores.every((s) => s.popularOnlyNotInRec) ? "PASS" : "FAIL",
      newFetch: stores.every((s) => s.menusRequestCount <= 2) ? "NONE" : "FAIL",
      home: home.status === 200 ? "PASS" : "FAIL",
      browse: browse.status === 200 && browsePopularLine ? "PASS" : "FAIL",
      allPass:
        stores.every((s) => s.pass) &&
        home.status === 200 &&
        browse.status === 200 &&
        browsePopularLine,
    },
  };

  writeFileSync(path.join(outDir, "p1-b4-detail-production-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.summary, null, 2));
  await browser.close();
  if (!report.summary.allPass) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

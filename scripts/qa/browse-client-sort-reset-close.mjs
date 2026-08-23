/**
 * BROWSE client sort reset close — mount URL sort + scope reset + API=DOM matrix.
 * PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 node scripts/qa/browse-client-sort-reset-close.mjs
 */
import { chromium } from "playwright";
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const baseUrl = (process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const outDir = path.resolve(process.cwd(), "docs/perf/browse-client-sort-reset-close");
mkdirSync(outDir, { recursive: true });

const SORT_LABELS = {
  default: ["기본순", "Default"],
  popular: ["주문 많은 순", "Most orders"],
};

async function fetchBrowse(page, sort, sub = "all") {
  const q = new URLSearchParams({
    primary: "restaurant",
    sub,
    page: "1",
    limit: "60",
    sort,
    storesBrowseBypass: "1",
    fresh: "1",
  });
  const res = await page.request.get(`${baseUrl}/api/stores/browse?${q}`);
  const json = await res.json();
  return {
    status: res.status(),
    stores: Array.isArray(json?.stores) ? json.stores : [],
  };
}

async function waitBrowseRows(page, timeoutMs = 90000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const n = await page.locator("h3.delivery-store-row__title").count();
    if (n > 0) return n;
    await page.waitForTimeout(500);
  }
  return 0;
}

async function extractDomSlugs(page) {
  return page.evaluate(() => {
    const rows = [...document.querySelectorAll("li.list-none")].filter((li) =>
      li.querySelector("h3.delivery-store-row__title")
    );
    return rows.map((li) => {
      const titleRaw = li.querySelector("h3.delivery-store-row__title")?.textContent?.trim() ?? "";
      const nameKo = titleRaw.split("★")[0]?.trim() ?? titleRaw;
      return nameKo;
    });
  });
}

function slugsFromApi(stores) {
  return stores.map((s) => s.slug);
}

function domSlugsFromNames(domNames, stores) {
  const nameToSlug = new Map(stores.map((s) => [s.nameKo?.trim(), s.slug]));
  return domNames.map((n) => nameToSlug.get(n) ?? null).filter(Boolean);
}

function orderMatch(apiStores, domNames) {
  const apiSlugs = slugsFromApi(apiStores);
  const domSlugs = domSlugsFromNames(domNames, apiStores);
  return apiSlugs.length === domSlugs.length && apiSlugs.every((s, i) => s === domSlugs[i]);
}

async function activeSortChip(page) {
  return page.evaluate((labels) => {
    const chips = [...document.querySelectorAll("button")].filter((b) => {
      const t = (b.textContent ?? "").trim();
      return labels.default.some((l) => t === l) || labels.popular.some((l) => t === l);
    });
    for (const b of chips) {
      const t = (b.textContent ?? "").trim();
      const on = (b.className || "").includes("bg-signature");
      if (on && labels.default.some((l) => t === l)) return "default";
      if (on && labels.popular.some((l) => t === l)) return "popular";
    }
    return "unknown";
  }, SORT_LABELS);
}

async function clickSortChip(page, sortId) {
  const labels = SORT_LABELS[sortId];
  const btn = page.locator("button").filter({ hasText: new RegExp(`^(${labels.join("|")})$`) }).first();
  await btn.click();
}

async function auditOrder(page, apiStores, waitMs = 5000) {
  await page.waitForTimeout(waitMs);
  const domNames = await extractDomSlugs(page);
  return {
    apiSlugs: slugsFromApi(apiStores),
    domSlugs: domSlugsFromNames(domNames, apiStores),
    pass: orderMatch(apiStores, domNames),
  };
}

async function extractBrowseEnrichment(page, apiStores) {
  const domRows = await page.evaluate(() => {
    const rows = [...document.querySelectorAll("li.list-none")].filter((li) =>
      li.querySelector("h3.delivery-store-row__title")
    );
    return rows.map((li) => {
      const titleRaw = li.querySelector("h3.delivery-store-row__title")?.textContent?.trim() ?? "";
      const nameKo = titleRaw.split("★")[0]?.trim() ?? titleRaw;
      const text = li.innerText || "";
      const popularLine =
        text
          .split("\n")
          .map((l) => l.trim())
          .find(
            (t) =>
              t.startsWith("인기 메뉴") ||
              t.startsWith("Popular menu") ||
              t.includes("인기 메뉴:") ||
              t.includes("Popular menu:")
          ) ?? null;
      const tileButtons = [...li.querySelectorAll("button")].filter((b) => {
        const cls = b.getAttribute("class") || "";
        return cls.includes("h-[116px]") && cls.includes("w-[calc((100%-8px)/3)]");
      });
      const fakePopular =
        text.includes("store_badge_menu_popular") ||
        [...li.querySelectorAll("span")].some(
          (s) => s.textContent?.trim() === "인기" || s.textContent?.trim() === "Popular"
        );
      return { nameKo, popularLine, tileCount: tileButtons.length, fakePopular };
    });
  });
  const nameToStore = new Map(apiStores.map((s) => [s.nameKo?.trim(), s]));
  const platformRows = apiStores.filter((s) => s.platformPopularProduct);
  const platformMatchPass =
    platformRows.length === 0
      ? "NOT_PROVEN"
      : platformRows.every((s) => {
          const dom = domRows.find((d) => nameToStore.get(d.nameKo)?.id === s.id);
          const domName = dom?.popularLine?.split(":").slice(1).join(":").trim() ?? null;
          return domName === s.platformPopularProduct.name;
        })
        ? "PASS"
        : "FAIL";
  const noPlatformOk = apiStores
    .filter((s) => !s.platformPopularProduct)
    .every((s) => {
      const dom = domRows.find((d) => nameToStore.get(d.nameKo)?.id === s.id);
      return !dom?.fakePopular && !dom?.popularLine;
    });
  const featuredTilesPass = apiStores.every((s) => {
    const dom = domRows.find((d) => nameToStore.get(d.nameKo)?.id === s.id);
    const withImg = (s.featuredItems ?? []).filter((x) => x.imageUrl?.trim());
    if (withImg.length === 0) return true;
    return (dom?.tileCount ?? 0) > 0;
  });
  return {
    platformMatchPass,
    noPlatformFake: noPlatformOk ? "NONE" : "FAIL",
    featuredTilesPass: featuredTilesPass ? "PRESERVED" : "FAIL",
  };
}

async function auditHome(page) {
  await page.goto(`${baseUrl}/stores`, { waitUntil: "domcontentloaded", timeout: 120000 });
  for (let i = 0; i < 60; i++) {
    if ((await page.locator(".stores-home-hub a[href*='/p/']").count()) > 0) break;
    await page.waitForTimeout(1000);
  }
  await page.waitForTimeout(2000);
  return page.evaluate(() => {
    const hub = document.querySelector(".stores-home-hub");
    if (!hub) return { pass: false, error: "no hub" };
    const slot1 = hub.querySelector("[data-stores-home-primary-row-list]");
    const slot1Count = slot1 ? slot1.querySelectorAll("h3.delivery-store-row__title").length : 0;
    const text = hub.innerText || "";
    return {
      pass:
        slot1Count > 0 &&
        !text.includes("인기 메뉴:") &&
        !text.includes("Popular menu:"),
      slot1Count,
    };
  });
}

async function findAlternateSubChip(page) {
  return page.evaluate(() => {
    const links = [...document.querySelectorAll("a.stores-browse-sub-chip-link, a[class*='stores-browse-sub-chip']")];
    for (const a of links) {
      const href = a.getAttribute("href") || "";
      if (!href.includes("sub=")) continue;
      const m = href.match(/sub=([^&]+)/);
      const sub = m ? decodeURIComponent(m[1]).toLowerCase() : "";
      if (sub && sub !== "all") {
        return { sub, href, label: (a.textContent ?? "").trim() };
      }
    }
    const any = [...document.querySelectorAll("a[href*='/stores/browse/restaurant?sub=']")].find((a) => {
      const h = a.getAttribute("href") || "";
      return !h.includes("sub=all");
    });
    if (!any) return null;
    const href = any.getAttribute("href") || "";
    const m = href.match(/sub=([^&]+)/);
    return {
      sub: m ? decodeURIComponent(m[1]).toLowerCase() : "",
      href,
      label: (any.textContent ?? "").trim(),
    };
  });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  const results = { baseUrl, viewport: "390x844", checks: {} };

  // 1) Direct popular deep link
  await page.goto(`${baseUrl}/stores/browse/restaurant?sub=all&sort=popular&fresh=1`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await page.evaluate(() => {
    try {
      sessionStorage.clear();
    } catch {
      /* cross-origin / denied */
    }
  });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 120000 });
  const apiPopularDirect = await fetchBrowse(page, "popular");
  await waitBrowseRows(page);
  const directChip = await activeSortChip(page);
  const directOrder = await auditOrder(page, apiPopularDirect.stores);
  const directEnrich = await extractBrowseEnrichment(page, apiPopularDirect.stores);
  results.checks.productionDirectPopular = {
    activeSortChip: directChip,
    chipPass: directChip === "popular",
    order: directOrder,
    ...directEnrich,
    pass: directChip === "popular" && directOrder.pass,
  };

  // 2) Default → Popular (chip click)
  const apiDefault = await fetchBrowse(page, "default");
  await page.goto(`${baseUrl}/stores/browse/restaurant?sub=all&fresh=1`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await waitBrowseRows(page);
  await clickSortChip(page, "popular");
  const apiPopularAfterClick = await fetchBrowse(page, "popular");
  const defaultToPopularChip = await activeSortChip(page);
  const defaultToPopularOrder = await auditOrder(page, apiPopularAfterClick.stores);
  results.checks.productionDefaultToPopular = {
    activeSortChip: defaultToPopularChip,
    order: defaultToPopularOrder,
    pass: defaultToPopularChip === "popular" && defaultToPopularOrder.pass,
  };

  // 3) Popular → Default (chip click)
  await clickSortChip(page, "default");
  const apiDefaultAfterClick = await fetchBrowse(page, "default");
  const popularToDefaultChip = await activeSortChip(page);
  const popularToDefaultOrder = await auditOrder(page, apiDefaultAfterClick.stores);
  results.checks.productionPopularToDefault = {
    activeSortChip: popularToDefaultChip,
    order: popularToDefaultOrder,
    pass: popularToDefaultChip === "default" && popularToDefaultOrder.pass,
  };

  // 4) Repeat direct popular (fresh navigation)
  await page.goto(`${baseUrl}/stores/browse/restaurant?sub=all&sort=popular&fresh=1`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await waitBrowseRows(page);
  const repeatOrder = await auditOrder(page, apiPopularDirect.stores);
  results.checks.productionRepeat = {
    order: repeatOrder,
    pass: repeatOrder.pass,
  };

  // 5) Scope reset — popular deep link then sub tab change → default sort + default order
  await page.goto(`${baseUrl}/stores/browse/restaurant?sub=all&sort=popular&fresh=1`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await waitBrowseRows(page);
  const altSub = await findAlternateSubChip(page);
  let scopeResetPass = false;
  let scopeResetDetail = { altSub, error: null };
  if (!altSub?.href) {
    scopeResetDetail.error = "no alternate sub chip found";
  } else {
    await page.click(`a[href="${altSub.href.replace(/"/g, '\\"')}"]`).catch(async () => {
      await page.locator(`a[href*="sub=${altSub.sub}"]`).first().click();
    });
    await page.waitForTimeout(1500);
    await waitBrowseRows(page, 60000);
    const scopeChip = await activeSortChip(page);
    const apiSubDefault = await fetchBrowse(page, "default", altSub.sub);
    const scopeOrder = await auditOrder(page, apiSubDefault.stores, 4000);
    scopeResetPass =
      scopeChip === "default" && scopeOrder.pass && !page.url().includes("sort=popular");
    scopeResetDetail = {
      altSub,
      activeSortChip: scopeChip,
      url: page.url(),
      order: scopeOrder,
      pass: scopeResetPass,
    };
  }
  results.checks.productionScopeReset = scopeResetDetail;

  // Regression surfaces
  const home = await auditHome(page);
  results.checks.home = { ...home, pass: home.pass };
  const detailStatus = (await page.request.get(`${baseUrl}/stores/aa11`)).status();
  results.checks.detail = { status: detailStatus, pass: detailStatus === 200 };

  results.summary = {
    directPopular: results.checks.productionDirectPopular.pass ? "PASS" : "FAIL",
    defaultToPopular: results.checks.productionDefaultToPopular.pass ? "PASS" : "FAIL",
    popularToDefault: results.checks.productionPopularToDefault.pass ? "PASS" : "FAIL",
    repeat: results.checks.productionRepeat.pass ? "PASS" : "FAIL",
    scopeReset: scopeResetPass ? "PASS" : "FAIL",
    platformEnrichment: results.checks.productionDirectPopular.platformMatchPass,
    featuredTiles: results.checks.productionDirectPopular.featuredTilesPass,
    home: home.pass ? "PASS" : "FAIL",
    detail: detailStatus === 200 ? "PASS" : "FAIL",
    allPass:
      results.checks.productionDirectPopular.pass &&
      results.checks.productionDefaultToPopular.pass &&
      results.checks.productionPopularToDefault.pass &&
      results.checks.productionRepeat.pass &&
      scopeResetPass &&
      results.checks.productionDirectPopular.platformMatchPass !== "FAIL" &&
      results.checks.productionDirectPopular.featuredTilesPass === "PRESERVED" &&
      home.pass &&
      detailStatus === 200,
  };

  writeFileSync(path.join(outDir, "browse-client-sort-reset-report.json"), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results.summary, null, 2));
  await browser.close();
  if (!results.summary.allPass) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

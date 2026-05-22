/**
 * browse + deferred featured-items 체감 지표 (API·선택적 브라우저).
 * Usage: node scripts/measure-browse-deferred-perf.mjs
 * Env: BASE_URL (default http://127.0.0.1:3000), RUNS (default 5)
 */

const BASE = (process.env.BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const RUNS = Math.max(3, Number(process.env.RUNS || "5"));
const BROWSE_QS =
  "primary=restaurant&sub=all&limit=20&region_id=1&city_id=1&district=all";

function stats(nums) {
  const sorted = [...nums].sort((a, b) => a - b);
  const n = sorted.length;
  const sum = sorted.reduce((a, b) => a + b, 0);
  const p = (q) => sorted[Math.min(n - 1, Math.max(0, Math.floor(q * n)))];
  return {
    n,
    min: sorted[0],
    p50: p(0.5),
    p95: p(0.95),
    max: sorted[n - 1],
    avg: Math.round((sum / n) * 10) / 10,
  };
}

async function timedFetch(url, opts = {}) {
  const t0 = performance.now();
  const res = await fetch(url, { cache: "no-store", ...opts });
  const body = await res.text();
  const ms = Math.round(performance.now() - t0);
  let json = {};
  try {
    json = JSON.parse(body);
  } catch {
    /* */
  }
  return { ms, status: res.status, json, ok: res.ok };
}

async function measureBrowse(label, qs) {
  const url = `${BASE}/api/stores/browse?${qs}`;
  const samples = [];
  let lastMeta = null;
  for (let i = 0; i < RUNS; i += 1) {
    const { ms, status, json, ok } = await timedFetch(url);
    samples.push(ms);
    lastMeta = { status, ok, storeCount: json?.stores?.length ?? null, meta: json?.meta ?? null };
    await new Promise((r) => setTimeout(r, 80));
  }
  return { label, url, samples: stats(samples), lastMeta };
}

async function measureFeaturedBatch(storeIds) {
  if (!storeIds?.length) return null;
  const qs = new URLSearchParams({ storeIds: storeIds.join(",") });
  const url = `${BASE}/api/stores/browse-featured-items?${qs}`;
  const cold = await timedFetch(`${url}&bypassCache=1`);
  const warm = [];
  for (let i = 0; i < RUNS; i += 1) {
    const r = await timedFetch(url);
    warm.push(r.ms);
    await new Promise((r) => setTimeout(r, 60));
  }
  const storeKeys = cold.json?.items ? Object.keys(cold.json.items) : [];
  return {
    url,
    storeCount: storeIds.length,
    hydratedStores: storeKeys.length,
    cold_ms: cold.ms,
    warm: stats(warm),
  };
}

async function measureBrowserIfPossible() {
  let chromium;
  try {
    ({ chromium } = await import("@playwright/test"));
  } catch {
    return { skipped: "playwright unavailable" };
  }
  const user = process.env.E2E_TEST_USERNAME?.trim();
  const pass = process.env.E2E_TEST_PASSWORD ?? "";
  if (!user || !pass) {
    return { skipped: "E2E_TEST_USERNAME/PASSWORD 없음 — API만 측정" };
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const apiBrowse = [];
  const apiFeatured = [];

  page.on("requestfinished", async (req) => {
    if (req.method() !== "GET") return;
    const u = req.url();
    if (u.includes("/api/stores/browse-featured-items")) {
      const res = await req.response().catch(() => null);
      apiFeatured.push({ url: u, ms: Math.round(req.timing().responseEnd) });
    } else if (u.includes("/api/stores/browse?")) {
      const res = await req.response().catch(() => null);
      apiBrowse.push({ url: u.split("?")[0] + "?…", ms: Math.round(req.timing().responseEnd) });
    }
  });

  const tNav0 = performance.now();
  await page.goto(`${BASE}/stores/browse/restaurant?sub=all`, {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
  if (page.url().includes("/login")) {
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    await page.locator('input[type="text"], input[type="email"]').first().fill(user);
    await page.locator('input[type="password"]').first().fill(pass);
    await page.getByRole("button", { name: "로그인", exact: true }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 45_000 });
    await page.goto(`${BASE}/stores/browse/restaurant?sub=all`, {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
  }

  await page.waitForResponse(
    (res) => res.url().includes("/api/stores/browse?") && res.request().method() === "GET",
    { timeout: 60_000 }
  ).catch(() => null);

  const domReadyMs = Math.round(performance.now() - tNav0);

  const firstCardVisible = await page
    .locator("ul.space-y-2 > li.list-none")
    .first()
    .waitFor({ state: "visible", timeout: 60_000 })
    .then(() => Math.round(performance.now() - tNav0))
    .catch(() => null);

  const browseCountBeforeScroll = apiBrowse.length;
  const featuredBeforeScroll = apiFeatured.length;

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1500);

  const featuredAfterScroll = apiFeatured.length - featuredBeforeScroll;

  const clientMetrics = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const resources = performance
      .getEntriesByType("resource")
      .filter((e) => e.name.includes("/api/stores/browse"));
    return {
      navigation_domContentLoaded_ms: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
      navigation_load_ms: nav ? Math.round(nav.loadEventEnd) : null,
      resource_browse: resources.map((e) => ({
        name: e.name.includes("featured") ? "featured-items" : "browse",
        duration_ms: Math.round(e.duration),
        transferSize: e.transferSize,
      })),
    };
  });

  await browser.close();

  return {
    dom_ready_ms: domReadyMs,
    first_store_card_visible_ms: firstCardVisible,
    browse_api_calls_on_load: browseCountBeforeScroll,
    featured_api_calls_after_scroll: featuredAfterScroll,
    featured_urls_sample: apiFeatured.slice(0, 3).map((x) => x.url),
    client: clientMetrics,
  };
}

// --- main ---
console.log(`[measure-browse-deferred] BASE=${BASE} RUNS=${RUNS}`);

const seed = await timedFetch(`${BASE}/api/stores/browse?${BROWSE_QS}`);
const storeIds = (seed.json?.stores ?? []).map((s) => s.id).filter(Boolean).slice(0, 12);

const warmBrowse = await measureBrowse("browse_warm", BROWSE_QS);
const coldBrowse = await measureBrowse("browse_cold_bypass", `${BROWSE_QS}&bypassCache=1`);
const featured = await measureFeaturedBatch(storeIds);
const browser = await measureBrowserIfPossible();

const report = {
  measured_at: new Date().toISOString(),
  base_url: BASE,
  browse_warm_ms: warmBrowse.samples,
  browse_cold_bypass_ms: coldBrowse.samples,
  browse_store_count: warmBrowse.lastMeta?.storeCount,
  featured_batch: featured,
  browser,
  checklist: {
    browse_1x_on_load: browser?.browse_api_calls_on_load != null ? browser.browse_api_calls_on_load <= 2 : "needs_login",
    featured_batch_not_per_card:
      featured && featured.storeCount > 1
        ? "api_single_request_per_batch"
        : "n/a",
  },
};

console.log(JSON.stringify(report, null, 2));

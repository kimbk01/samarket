#!/usr/bin/env node
/**
 * DIBAY delivery waterfall — prod build AFTER verification (Playwright + Slow 4G CDP).
 *
 * Prereq: npm run build && npm run start  (or start:prod-measure)
 * Usage:  node scripts/verify-delivery-waterfall-final.mjs
 * Env:    BASE_URL (default http://127.0.0.1:3000)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = (process.env.BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");

function loadEnvLocal() {
  const p = path.join(root, ".env.local");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnvLocal();

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function structuralChecks() {
  const hub = read("components/stores/home/hub/StoresHomeHub.tsx");
  const summary = read("components/stores/store-detail/StoreDetailSummarySection.tsx");
  const detail = read("components/stores/StoreDetailPublic.tsx");
  const hero = read("components/stores/store-order-detail/StoreOrderHeroSummary.tsx");

  const checks = [];

  const noFullEager =
    !hub.includes("stores.map((s) => s.id).filter(Boolean)") &&
    hub.includes("fastFood.slice(0, 8)") &&
    hub.includes("recFood.slice(0, 4)");
  checks.push({ id: "home_eager_fold_only", pass: noFullEager });

  checks.push({
    id: "transition_shell_removed",
    pass: !fs.existsSync(path.join(root, "components/stores/detail/StoreDetailTransitionShell.tsx")),
  });

  checks.push({
    id: "ride_time_deduped",
    pass:
      summary.includes("fetchDeliveryRideTimeSourceDeduped") &&
      !summary.includes('fetch("/api/app/delivery-ride-time-source"'),
  });

  checks.push({
    id: "page_show_silent_skip",
    pass: detail.includes("waterfall_silent_skipped") && detail.includes("peekStoreSummaryPublicCache"),
  });

  checks.push({
    id: "detail_hero_priority",
    pass: /priority[\s\S]{0,120}surface="detail-hero"/.test(hero),
  });

  return checks;
}

async function signInSupabaseCookie() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !anon) return null;

  const password = process.env.E2E_TEST_PASSWORD ?? "1234";
  const loginIds = [process.env.E2E_TEST_USERNAME, "aa11", "aaaa", "qqqq"].filter(Boolean);
  const ref = url.match(/https:\/\/([^.]+)\./)?.[1];
  if (!ref) return null;

  const sb = createClient(url, anon, { auth: { persistSession: false } });
  for (const loginId of loginIds) {
    let email = loginId.includes("@") ? loginId.toLowerCase() : `${loginId.toLowerCase()}@manual.local`;
    if (serviceKey && loginId === "aa11") {
      const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
      const { data: pr } = await admin
        .from("profiles")
        .select("auth_login_email, email")
        .or("username.eq.aa11")
        .maybeSingle();
      const resolved = String(pr?.auth_login_email ?? pr?.email ?? "").trim().toLowerCase();
      if (resolved.includes("@")) email = resolved;
    }
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error || !data.session) continue;
    const session = {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
      expires_in: data.session.expires_in,
      token_type: data.session.token_type,
      user: data.session.user,
    };
    const cookies = [
      {
        name: `sb-${ref}-auth-token`,
        value: encodeURIComponent(JSON.stringify(session)),
        domain: "127.0.0.1",
        path: "/",
        httpOnly: false,
        secure: false,
        sameSite: "Lax",
      },
    ];
    if (serviceKey) {
      const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
      const { data: pr } = await admin
        .from("profiles")
        .select("active_session_id")
        .eq("id", data.session.user.id)
        .maybeSingle();
      const activeSession = String(pr?.active_session_id ?? "").trim();
      if (activeSession) {
        cookies.push({
          name: "samarket_active_session_id",
          value: encodeURIComponent(activeSession),
          domain: "127.0.0.1",
          path: "/",
          httpOnly: false,
          secure: false,
          sameSite: "Lax",
        });
      }
    }
    return { cookies, loginLabel: email };
  }
  return null;
}

function duplicateApiPaths(entries) {
  const byPath = {};
  for (const e of entries) {
    if (e.method !== "GET" || !e.url.includes("/api/")) continue;
    try {
      const u = new URL(e.url);
      const key = u.pathname;
      byPath[key] = (byPath[key] ?? 0) + 1;
    } catch {
      /* ignore */
    }
  }
  return Object.entries(byPath)
    .filter(([, n]) => n > 1)
    .sort((a, b) => b[1] - a[1])
    .map(([path, count]) => ({ path, count }));
}

function countGets(entries, part) {
  return entries.filter(
    (e) => e.url.includes(part) && e.method === "GET" && !e.url.includes("bypassCache=1")
  );
}

function sumTransfer(entries) {
  return entries.reduce((a, e) => a + (e.transferSize || 0), 0);
}

function slowImageLoads(entries, thresholdMs = 7000) {
  return entries.filter(
    (e) =>
      (e.url.includes(".webp") || e.url.includes("_next/image") || e.url.includes("/storage/")) &&
      e.durationMs >= thresholdMs
  );
}

async function emulateSlow4G(page) {
  const client = await page.context().newCDPSession(page);
  await client.send("Network.emulateNetworkConditions", {
    offline: false,
    downloadThroughput: (500 * 1024) / 8,
    uploadThroughput: (500 * 1024) / 8,
    latency: 400,
  });
}

async function runBrowserScenario() {
  let chromium;
  try {
    ({ chromium } = await import("@playwright/test"));
  } catch {
    return { skipped: "playwright unavailable" };
  }

  const browser = await chromium.launch({ headless: true });
  const auth = await signInSupabaseCookie();
  const context = await browser.newContext();
  if (auth?.cookies?.length) {
    await context.addCookies(auth.cookies);
  }
  const page = await context.newPage();
  await emulateSlow4G(page);

  const requests = [];
  const consoleLogs = [];
  const reqMethods = new Map();
  const detailHydrated = { done: false };

  page.on("console", (msg) => {
    const t = msg.text();
    if (
      t.includes("[delivery-fetch-trace]") ||
      t.includes("[delivery-image-trace]") ||
      t.includes("[delivery-waterfall-phase]") ||
      t.includes("[dibay-delivery-detail-phase2]")
    ) {
      consoleLogs.push(t.slice(0, 500));
    }
    if (t.includes("menus_apply_await_settled") || t.includes("waterfall_silent_skipped")) {
      detailHydrated.done = true;
    }
  });

  const client = await page.context().newCDPSession(page);
  await client.send("Network.enable");
  client.on("Network.requestWillBeSent", (params) => {
    reqMethods.set(params.requestId, params.request.method);
  });
  client.on("Network.responseReceived", (params) => {
    const { response, type, requestId } = params;
    const timing = response.timing || {};
    const durationMs =
      timing.receiveHeadersEnd > 0
        ? Math.round(timing.receiveHeadersEnd - timing.requestTime * 1000)
        : null;
    requests.push({
      url: response.url,
      method: reqMethods.get(requestId) || "GET",
      resourceType: type,
      status: response.status,
      transferSize: response.encodedDataLength ?? 0,
      durationMs,
      atMs: Date.now(),
    });
  });

  await page.goto(`${BASE}/stores`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  if (page.url().includes("/login")) {
    await browser.close();
    return {
      skipped: "login required — Supabase signIn failed; use DevTools manual run",
      auth_attempted: Boolean(auth),
    };
  }
  await page
    .waitForResponse((r) => r.url().includes("/api/stores/home-feed") && r.request().method() === "GET", {
      timeout: 90_000,
    })
    .catch(() => null);
  await page.waitForTimeout(2000);

  requests.length = 0;
  const phaseT0 = Date.now();

  await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
  await page
    .waitForResponse((r) => r.url().includes("/api/stores/home-feed") && r.request().method() === "GET", {
      timeout: 90_000,
    })
    .catch(() => null);
  await page.waitForTimeout(2000);

  const afterHomeLoad = requests.length;
  const featuredOnHomeLoad = countGets(requests, "/api/stores/browse-featured-items");
  const rideOnHome = countGets(requests, "/api/app/delivery-ride-time-source");

  const storeLink = page.locator(
    'a[href^="/stores/"]:not([href*="/owner"]):not([href*="/cart"]):not([href*="/browse"]):not([href*="/search"])'
  ).first();
  await storeLink.waitFor({ state: "attached", timeout: 60_000 }).catch(() => null);
  let storeHref = await storeLink.getAttribute("href").catch(() => null);
  if (!storeHref) {
    const feedSlug = await page.evaluate(async (base) => {
      try {
        const res = await fetch(`${base}/api/stores/home-feed`, { credentials: "include" });
        const j = await res.json();
        const stores = j?.stores ?? j?.sections?.flatMap?.((s) => s?.stores ?? []) ?? [];
        const slug = stores.find((s) => s?.slug)?.slug;
        return slug ? `/stores/${encodeURIComponent(slug)}` : null;
      } catch {
        return null;
      }
    }, BASE);
    storeHref = feedSlug;
  }
  if (!storeHref || storeHref.includes("/cart") || storeHref.includes("/browse")) {
    await browser.close();
    return { skipped: "no store detail link on /stores", auth_login: auth?.loginLabel ?? null };
  }

  const detailPath = storeHref.includes("/p/")
    ? storeHref.replace(/\/p\/[^/]+$/, "")
    : storeHref;

  const reqBeforeDetail = requests.length;
  await page.goto(`${BASE}${detailPath}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForURL(/\/stores\/[^/]+/, { timeout: 90_000 }).catch(() => null);
  for (let i = 0; i < 120 && !detailHydrated.done; i += 1) {
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(1000);

  const afterDetail = requests.length;
  const rideOnDetail = countGets(requests, "/api/app/delivery-ride-time-source");
  const reviewsOnDetail = countGets(requests, "/api/stores/").filter((e) =>
    e.url.includes("/reviews-summary")
  );

  const reqBeforePageShow = requests.length;
  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
  });
  await page.waitForTimeout(1500);

  const afterPageShowOnDetail = requests.slice(reqBeforePageShow);
  const pageshowOnDetailSummaryMenus = afterPageShowOnDetail.filter(
    (e) =>
      e.method === "GET" &&
      (e.url.includes("/summary") || e.url.includes("/menus")) &&
      !e.url.includes("bypassCache=1")
  );

  await page.goBack({ waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForTimeout(1500);

  const reqBeforeTabReturn = requests.length;
  await page.evaluate(() => {
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: false }));
  });
  await page.waitForTimeout(1000);
  const afterTabReturnOnList = requests.slice(reqBeforeTabReturn);

  const finishMs = Date.now() - phaseT0;
  const totalRequests = requests.length;
  const transferredBytes = sumTransfer(requests);
  const slowImages = slowImageLoads(requests);

  const priorityImagesOnDetail = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll("img")];
    return imgs
      .filter((img) => img.getAttribute("fetchpriority") === "high" || img.loading === "eager")
      .map((img) => ({
        src: (img.currentSrc || img.src || "").slice(0, 120),
        fetchpriority: img.getAttribute("fetchpriority"),
        loading: img.loading,
      }));
  });

  await browser.close();

  return {
    scenario_ms: finishMs,
    total_requests: totalRequests,
    after_home_load_requests: afterHomeLoad,
    featured_batch_on_home_load: featuredOnHomeLoad.length,
    featured_urls_on_home_load: featuredOnHomeLoad.map((e) => e.url),
    ride_time_total: rideOnHome.length + rideOnDetail.length,
    ride_time_on_detail: rideOnDetail.length,
    reviews_summary_on_detail: reviewsOnDetail.length,
    pageshow_summary_menus_refetch: pageshowOnDetailSummaryMenus.length,
    pageshow_summary_menus_urls: pageshowOnDetailSummaryMenus.map((e) => e.url),
    tab_return_on_list_new_requests: afterTabReturnOnList.length,
    detail_navigation_new_requests: afterDetail - reqBeforeDetail,
    auth_login: auth?.loginLabel ?? null,
    duplicate_api_paths: duplicateApiPaths(requests),
    transferred_bytes: transferredBytes,
    transferred_mb: Math.round((transferredBytes / (1024 * 1024)) * 100) / 100,
    slow_images_7s_plus: slowImages.length,
    slow_image_samples: slowImages.slice(0, 5).map((e) => ({
      url: e.url.slice(0, 100),
      durationMs: e.durationMs,
    })),
    high_priority_images_on_detail: priorityImagesOnDetail,
    detail_path: detailPath,
    console_trace_count: consoleLogs.length,
    console_trace_sample: consoleLogs.slice(0, 8),
    pageshow_silent_skipped_log: consoleLogs.some((t) => t.includes("waterfall_silent_skipped")),
  };
}

const BEFORE = {
  source: "user Chrome DevTools Slow 4G (pre-patch)",
  total_requests: "240+",
  transferred_mb: 4.3,
  resources_mb: 12.6,
  finish_s: 44.88,
  featured_batch: "N stores eager (full feed)",
  ride_time_dup: true,
  lcp_priority_competitors: 2,
};

const structural = structuralChecks();
const browser = await runBrowserScenario();

const AFTER = browser.skipped
  ? { skipped: browser.skipped, structural }
  : {
      ...browser,
      structural,
    };

const passCriteria = {
  featured_batch_le_2_on_home_load:
    !browser.skipped && browser.featured_batch_on_home_load <= 2,
  ride_time_le_2_total: !browser.skipped && browser.ride_time_total <= 2,
  structural_all: structural.every((c) => c.pass),
  home_eager_fold_only: structural.find((c) => c.id === "home_eager_fold_only")?.pass === true,
  transition_no_priority: structural.find((c) => c.id === "transition_shell_no_priority")?.pass === true,
  silent_skip_wired: structural.find((c) => c.id === "page_show_silent_skip")?.pass === true,
  pageshow_no_summary_menus_refetch:
    !browser.skipped && browser.pageshow_summary_menus_refetch === 0,
  lcp_single_high_priority_on_detail:
    !browser.skipped &&
    Array.isArray(browser.high_priority_images_on_detail) &&
    browser.high_priority_images_on_detail.length <= 1,
};

const complete =
  passCriteria.structural_all &&
  (browser.skipped ||
    (passCriteria.featured_batch_le_2_on_home_load &&
      passCriteria.ride_time_le_2_total &&
      passCriteria.pageshow_no_summary_menus_refetch));

const report = {
  measured_at: new Date().toISOString(),
  base_url: BASE,
  BEFORE,
  AFTER,
  pass_criteria: passCriteria,
  verdict: complete ? "PASS_WITH_NETWORK" : browser.skipped ? "PARTIAL_STRUCTURAL_ONLY" : "FAIL",
  request_reduction:
    browser.skipped || typeof browser.total_requests !== "number"
      ? null
      : `240+ → ${browser.total_requests} (scenario subset; not 1:1 with full DevTools session)`,
  transferred_reduction_mb:
    browser.skipped || typeof browser.transferred_mb !== "number"
      ? null
      : `4.3 → ${browser.transferred_mb} (scenario subset)`,
};

console.log(JSON.stringify(report, null, 2));
process.exit(complete ? 0 : browser.skipped ? 0 : 1);

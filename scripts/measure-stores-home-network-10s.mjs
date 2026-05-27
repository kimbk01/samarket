#!/usr/bin/env node
/**
 * /stores cold — 네트워크(참고) + 체감 성능 지표.
 * Prereq: npm run build && npm run start
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
    const v = t.slice(eq + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnvLocal();

async function signInSupabaseCookie() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) return null;
  const password = process.env.E2E_TEST_PASSWORD ?? "1234";
  const loginIds = [process.env.E2E_TEST_USERNAME, "aa11", "aaaa", "qqqq"].filter(Boolean);
  const ref = url.match(/https:\/\/([^.]+)\./)?.[1];
  if (!ref) return null;
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  for (const loginId of loginIds) {
    const email = loginId.includes("@") ? loginId.toLowerCase() : `${loginId.toLowerCase()}@manual.local`;
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
    return {
      cookies: [
        {
          name: `sb-${ref}-auth-token`,
          value: encodeURIComponent(JSON.stringify(session)),
          domain: "127.0.0.1",
          path: "/",
          httpOnly: false,
          secure: false,
          sameSite: "Lax",
        },
      ],
    };
  }
  return null;
}

function countGet(requests, pred) {
  return requests.filter((r) => r.method === "GET" && pred(r.url)).length;
}

async function waitVisibleMs(page, selector, timeoutMs, originMs) {
  const t0 = Date.now();
  try {
    await page.waitForSelector(selector, { state: "visible", timeout: timeoutMs });
    return Date.now() - originMs;
  } catch {
    return null;
  }
}

async function main() {
  const { chromium } = await import("@playwright/test");
  const auth = await signInSupabaseCookie();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  if (auth?.cookies) await context.addCookies(auth.cookies);
  const page = await context.newPage();

  await page.addInitScript(() => {
    window.__storesHomePerf = {};
    window.__storesPerfLongTasks = [];
    window.__storesPerfLcpMs = null;
    if ("PerformanceObserver" in window) {
      try {
        const lcpObs = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const last = entries[entries.length - 1];
          if (last) window.__storesPerfLcpMs = last.startTime;
        });
        lcpObs.observe({ type: "largest-contentful-paint", buffered: true });
      } catch {
        /* noop */
      }
      try {
        const ltObs = new PerformanceObserver((list) => {
          for (const e of list.getEntries()) {
            if (e.duration < 50) continue;
            window.__storesPerfLongTasks.push({ start: e.startTime, duration: e.duration });
          }
        });
        ltObs.observe({ type: "longtask", buffered: true });
      } catch {
        /* noop */
      }
    }
  });

  const client = await context.newCDPSession(page);
  await client.send("Network.enable");
  const reqMethods = new Map();
  const requests = [];
  client.on("Network.requestWillBeSent", (p) => reqMethods.set(p.requestId, p.request.method));
  client.on("Network.responseReceived", (p) => {
    requests.push({
      url: p.response.url,
      method: reqMethods.get(p.requestId) || "GET",
    });
  });

  const navOrigin = Date.now();
  await page.goto(`${BASE}/stores`, { waitUntil: "domcontentloaded", timeout: 120_000 });

  const [firstShellMs, firstCategoryMs, firstHeroMs, scrollReadyMs] = await Promise.all([
    waitVisibleMs(page, '[data-stores-perf="shell"]', 30_000, navOrigin),
    waitVisibleMs(page, '[data-stores-perf="category"]', 30_000, navOrigin),
    waitVisibleMs(page, '[data-stores-perf="hero"]', 30_000, navOrigin),
    (async () => {
      const t0 = Date.now();
      try {
        await page.waitForFunction(
          () => {
            const root =
              document.querySelector(".main-hub-scroll-column") ??
              document.querySelector('[data-main-shell-root]') ??
              document.documentElement;
            return root.scrollHeight > root.clientHeight + 8;
          },
          { timeout: 30_000 }
        );
        return Date.now() - navOrigin;
      } catch {
        return null;
      }
    })(),
  ]);

  await page
    .waitForResponse((r) => r.url().includes("/api/stores/home-feed"), { timeout: 90_000 })
    .catch(() => null);

  let firstStoreCardMs = await waitVisibleMs(page, '[data-stores-perf="store-card"]', 30_000, navOrigin);
  if (firstStoreCardMs == null) {
    firstStoreCardMs = await waitVisibleMs(page, '[data-stores-perf="store-card-skeleton"]', 5_000, navOrigin);
  }

  const untilFeedMs = Date.now() - navOrigin;
  await page.waitForTimeout(Math.max(0, 10_000 - untilFeedMs));

  const perfClient = await page.evaluate(() => {
    const marks = window.__storesHomePerf ?? {};
    const longTasks = window.__storesPerfLongTasks ?? [];
    const lcpEntries = performance.getEntriesByType("largest-contentful-paint");
    const lastLcp = lcpEntries.length ? lcpEntries[lcpEntries.length - 1] : null;
    const lcpFromEntries = lastLcp ? lastLcp.startTime : null;
    const lcpMs = window.__storesPerfLcpMs ?? lcpFromEntries;
    const lcpEl = window.__storesHomeLcpElement ?? null;
    let maxLong = 0;
    for (const t of longTasks) {
      if (t.duration > maxLong) maxLong = t.duration;
    }
    return {
      marks,
      lcp_ms: lcpMs != null ? Math.round(lcpMs) : null,
      lcp_element: lcpEl,
      long_task_count: longTasks.length,
      max_long_task_ms: Math.round(maxLong),
    };
  });

  const gets = requests.filter((r) => r.method === "GET");
  const apiGets = gets.filter((r) => r.url.includes("/api/"));
  const nextStatic = gets.filter((r) => r.url.includes("/_next/"));
  const browseRestaurant = countGet(requests, (u) => u.includes("/stores/browse/restaurant"));
  const browseApi = countGet(requests, (u) => u.includes("/api/stores/browse"));
  const rsc = countGet(requests, (u) => u.includes("_rsc=") || u.includes("?_rsc") || u.endsWith(".rsc"));
  const notifications = countGet(requests, (u) => u.includes("/api/me/notifications"));
  const hubBadge = countGet(requests, (u) => u.includes("/api/me/store-owner-hub-badge"));
  const homeFeed = countGet(requests, (u) => u.includes("/api/stores/home-feed"));
  const taxonomy = countGet(requests, (u) => u.includes("/api/stores/taxonomy"));

  const apiPathCounts = {};
  for (const r of apiGets) {
    try {
      const u = new URL(r.url);
      const key = u.pathname + (u.search ? u.search.split("&").sort().join("&") : "");
      apiPathCounts[key] = (apiPathCounts[key] ?? 0) + 1;
    } catch {
      /* ignore */
    }
  }

  await browser.close();

  const markMs = (key) => {
    const v = perfClient.marks?.[key];
    return typeof v === "number" ? Math.round(v) : null;
  };

  const report = {
    measured_at: new Date().toISOString(),
    scenario: "/stores cold + 10s idle (perceived perf)",
    perceived: {
      first_shell_ms: firstShellMs ?? markMs("shell"),
      first_category_visible_ms: firstCategoryMs ?? markMs("category"),
      first_hero_visible_ms: firstHeroMs ?? markMs("hero"),
      first_store_card_visible_ms: firstStoreCardMs ?? markMs("store-card"),
      scroll_ready_ms: scrollReadyMs ?? markMs("scroll-ready"),
      lcp_ms: perfClient.lcp_ms,
      lcp_element: perfClient.lcp_element,
      long_task_count: perfClient.long_task_count,
      max_long_task_ms: perfClient.max_long_task_ms,
    },
    network_reference: {
      total_get: gets.length,
      api_get: apiGets.length,
      next_static_get: nextStatic.length,
      browse_restaurant_path: browseRestaurant,
      browse_api: browseApi,
      rsc_like: rsc,
      notifications,
      hub_badge: hubBadge,
      home_feed: homeFeed,
      taxonomy,
      api_path_counts: Object.fromEntries(
        Object.entries(apiPathCounts).sort((a, b) => b[1] - a[1])
      ),
    },
    goals: {
      browse_restaurant_lte_1: browseRestaurant <= 1,
      rsc_lte_8: rsc <= 8,
      notifications_lte_2: notifications <= 2,
      hub_badge_lte_1: hubBadge <= 1,
    },
  };
  console.log(JSON.stringify(report, null, 2));
  const pass =
    report.goals.browse_restaurant_lte_1 &&
    report.goals.rsc_lte_8 &&
    report.goals.notifications_lte_2 &&
    report.goals.hub_badge_lte_1;
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

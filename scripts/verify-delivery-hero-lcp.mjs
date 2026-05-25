#!/usr/bin/env node
/**
 * DIBAY detail hero LCP — prod verify (/stores → /stores/[slug] cold, Slow 4G).
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
    let v = t.slice(eq + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnvLocal();

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function structuralChecks() {
  const presets = read("lib/dibay/delivery-image-surface-presets.ts");
  const media = read("components/dibay/DeliveryMediaImage.tsx");
  const transform = read("lib/media/store-product-image-transform.ts");
  const hero = read("components/stores/store-order-detail/StoreOrderHeroSummary.tsx");

  return [
    {
      id: "detail_hero_transform_preset",
      pass: presets.includes('fetchPreset: "detailHero"') && transform.includes("buildStoreProductHeroFetchUrl"),
    },
    {
      id: "detail_hero_sizes_viewport",
      pass: presets.includes("(max-width: 768px) 100vw, 960px"),
    },
    {
      id: "lcp_direct_img_path",
      pass: media.includes("isPreOptimizedDeliveryImageSrc") && media.includes('fetchPriority="high"'),
    },
    {
      id: "detail_hero_priority_only",
      pass:
        /priority[\s\S]{0,120}surface="detail-hero"/.test(hero) &&
        media.includes('surface === "detail-hero"'),
    },
    {
      id: "transition_stays_lazy",
      pass: !read("components/stores/detail/StoreDetailTransitionShell.tsx").includes("priority"),
    },
  ];
}

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

async function emulateSlow4G(page) {
  const client = await page.context().newCDPSession(page);
  await client.send("Network.emulateNetworkConditions", {
    offline: false,
    downloadThroughput: (500 * 1024) / 8,
    uploadThroughput: (500 * 1024) / 8,
    latency: 400,
  });
}

function isHeroCandidate(url) {
  return (
    url.includes("/render/image/") ||
    url.includes("/_next/image") ||
    (url.includes("store-product-images") && url.includes(".webp"))
  );
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
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  if (auth?.cookies?.length) await context.addCookies(auth.cookies);
  const page = await context.newPage();
  await emulateSlow4G(page);

  const requests = [];
  const reqMethods = new Map();
  const client = await page.context().newCDPSession(page);
  await client.send("Network.enable");
  client.on("Network.requestWillBeSent", (p) => reqMethods.set(p.requestId, p.request.method));
  client.on("Network.responseReceived", (p) => {
    const { response, type, requestId } = p;
    const timing = response.timing || {};
    const durationMs =
      timing.receiveHeadersEnd > 0
        ? Math.round(timing.receiveHeadersEnd - timing.requestTime * 1000)
        : null;
    requests.push({
      url: response.url,
      method: reqMethods.get(requestId) || "GET",
      resourceType: type,
      transferSize: response.encodedDataLength ?? 0,
      durationMs,
    });
  });

  await page.goto(`${BASE}/stores`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  if (page.url().includes("/login")) {
    await browser.close();
    return { skipped: "login required" };
  }
  await page.waitForTimeout(1500);

  requests.length = 0;
  const navStart = Date.now();

  const storeHref = await page.evaluate(async (base) => {
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

  if (!storeHref) {
    await browser.close();
    return { skipped: "no store slug" };
  }

  await page.goto(`${BASE}${storeHref}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForSelector("#store-hero-media img, #store-hero-media", { timeout: 60_000 }).catch(() => null);
  await page.waitForTimeout(3000);

  const lcp = await page.evaluate(() => {
    return new Promise((resolve) => {
      let done = false;
      const finish = (v) => {
        if (done) return;
        done = true;
        resolve(v);
      };
      try {
        const obs = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const last = entries[entries.length - 1];
          if (last) {
            finish({
              startTime: Math.round(last.startTime),
              size: last.size ?? null,
              url: last.url?.slice(0, 200) ?? null,
              element: last.element?.id || last.element?.tagName || null,
            });
          }
        });
        obs.observe({ type: "largest-contentful-paint", buffered: true });
      } catch {
        finish(null);
      }
      setTimeout(() => finish(null), 8000);
    });
  });

  const heroDom = await page.evaluate(() => {
    const hero = document.querySelector("#store-hero-media img");
    if (!hero) return null;
    return {
      src: (hero.currentSrc || hero.src || "").slice(0, 220),
      fetchPriority: hero.getAttribute("fetchpriority"),
      loading: hero.loading,
      width: hero.naturalWidth,
      height: hero.naturalHeight,
    };
  });

  const heroRequests = requests.filter((e) => isHeroCandidate(e.url));
  const heroBest = heroRequests.reduce(
    (max, e) => (e.transferSize > max.transferSize ? e : max),
    { transferSize: 0, url: "", durationMs: null }
  );
  const nextImageHero = heroRequests.filter((e) => e.url.includes("/_next/image"));
  const transformHero = heroRequests.filter((e) => e.url.includes("/render/image/"));
  const fullObjectHero = heroRequests.filter((e) => e.url.includes("/object/public/"));

  const highPriorityCount = await page.evaluate(() => {
    return [...document.querySelectorAll("img")].filter(
      (img) => img.getAttribute("fetchpriority") === "high" || img.loading === "eager"
    ).length;
  });

  await browser.close();

  return {
    detail_path: storeHref,
    navigation_ms: Date.now() - navStart,
    hero_dom: heroDom,
    hero_request_count: heroRequests.length,
    hero_transform_count: transformHero.length,
    hero_next_image_count: nextImageHero.length,
    hero_full_object_count: fullObjectHero.length,
    hero_transferred_bytes: heroBest.transferSize,
    hero_load_duration_ms: heroBest.durationMs,
    hero_url_sample: heroBest.url.slice(0, 200),
    lcp,
    high_priority_images: highPriorityCount,
  };
}

const structural = structuralChecks();
const browser = await runBrowserScenario();

const report = {
  measured_at: new Date().toISOString(),
  scenario: "/stores → /stores/[slug] cold detail (Slow 4G, 390×844)",
  structural,
  ...browser,
  pass:
    !browser.skipped &&
    structural.every((c) => c.pass) &&
    browser.hero_transform_count >= 1 &&
    browser.hero_next_image_count === 0 &&
    browser.hero_full_object_count === 0 &&
    browser.high_priority_images <= 2 &&
    (browser.hero_transferred_bytes === 0 || browser.hero_transferred_bytes <= 250_000) &&
    (browser.hero_load_duration_ms == null || browser.hero_load_duration_ms < 12_000),
};

console.log(JSON.stringify(report, null, 2));
process.exit(report.pass ? 0 : 1);

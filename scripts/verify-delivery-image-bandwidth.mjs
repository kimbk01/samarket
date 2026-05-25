#!/usr/bin/env node
/**
 * DIBAY delivery image bandwidth — prod AFTER (/stores → browse → detail → back, Slow 4G).
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
  const thumb = read("components/stores/common/StoreProductThumbnail.tsx");
  const media = read("components/dibay/DeliveryMediaImage.tsx");
  const transform = read("lib/media/store-product-image-transform.ts");
  const hero = read("components/stores/store-order-detail/StoreOrderHeroSummary.tsx");

  return [
    {
      id: "thumbnail_transform_wired",
      pass: thumb.includes("buildStoreProductThumbnailFetchUrl"),
    },
    {
      id: "delivery_media_surface_presets",
      pass: media.includes("resolveDeliveryMediaSurfacePreset"),
    },
    {
      id: "supabase_render_transform_helper",
      pass: transform.includes("/storage/v1/render/image/public/"),
    },
    {
      id: "detail_hero_priority_only",
      pass:
        /priority[\s\S]{0,120}surface="detail-hero"/.test(hero) &&
        media.includes('surface === "detail-hero"'),
    },
    {
      id: "detail_hero_transform_preset",
      pass: read("lib/dibay/delivery-image-surface-presets.ts").includes('fetchPreset: "detailHero"'),
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

function isImageRequest(entry) {
  const u = entry.url;
  return (
    entry.resourceType === "Image" ||
    u.includes(".webp") ||
    u.includes("/storage/v1/") ||
    u.includes("/_next/image")
  );
}

function isThumbnailRequest(entry) {
  const u = entry.url;
  if (u.includes("/render/image/")) return true;
  if (u.includes("/_next/image") && !u.includes("w=3840")) return true;
  if (u.includes("store-product-images") && !u.includes("detail-hero")) return true;
  return false;
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
  await page
    .waitForResponse((r) => r.url().includes("/api/stores/home-feed"), { timeout: 90_000 })
    .catch(() => null);
  await page.waitForTimeout(2500);

  const browseLink = page.locator('a[href*="/stores/browse"]').first();
  if (await browseLink.count()) {
    await browseLink.click({ timeout: 30_000 }).catch(() => null);
    await page.waitForTimeout(2500);
  }

  const storeLink = page
    .locator(
      'a[href^="/stores/"]:not([href*="/owner"]):not([href*="/cart"]):not([href*="/browse"]):not([href*="/search"])'
    )
    .first();
  let storeHref = await storeLink.getAttribute("href").catch(() => null);
  if (!storeHref) {
    storeHref = await page.evaluate(async (base) => {
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
  }

  if (!storeHref) {
    await browser.close();
    return { skipped: "no store detail link" };
  }

  const detailPath = storeHref.includes("/p/") ? storeHref.replace(/\/p\/[^/]+$/, "") : storeHref;
  await page.goto(`${BASE}${detailPath}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForTimeout(4000);
  await page.goBack({ waitUntil: "domcontentloaded", timeout: 90_000 }).catch(() => null);
  await page.waitForTimeout(1500);

  const imageRequests = requests.filter(isImageRequest);
  const thumbRequests = imageRequests.filter(isThumbnailRequest);
  const transformRequests = imageRequests.filter((e) => e.url.includes("/render/image/"));
  const fullObjectThumbs = thumbRequests.filter((e) => e.url.includes("/object/public/store-product-images"));
  const transferred = imageRequests.reduce((a, e) => a + (e.transferSize || 0), 0);
  const largestThumb = thumbRequests.reduce(
    (max, e) => (e.transferSize > max.transferSize ? e : max),
    { transferSize: 0, url: "" }
  );
  const slowThumbs = thumbRequests.filter((e) => (e.durationMs ?? 0) >= 7000);

  const highPriorityOnDetail = await page.evaluate(() => {
    return [...document.querySelectorAll("img")].filter(
      (img) => img.getAttribute("fetchpriority") === "high" || img.loading === "eager"
    ).length;
  });

  await browser.close();

  return {
    image_count: imageRequests.length,
    thumbnail_count: thumbRequests.length,
    transform_url_count: transformRequests.length,
    full_object_thumb_count: fullObjectThumbs.length,
    image_transferred_bytes: transferred,
    image_transferred_mb: Math.round((transferred / (1024 * 1024)) * 100) / 100,
    largest_thumbnail_bytes: largestThumb.transferSize,
    largest_thumbnail_url: largestThumb.url.slice(0, 160),
    slow_thumbnails_7s_plus: slowThumbs.length,
    high_priority_images: highPriorityOnDetail,
    detail_path: detailPath,
  };
}

const structural = structuralChecks();
const browser = await runBrowserScenario();

const report = {
  measured_at: new Date().toISOString(),
  scenario: "/stores → browse → detail → back (Slow 4G)",
  structural,
  ...browser,
  pass:
    !browser.skipped &&
    structural.every((c) => c.pass) &&
    browser.transform_url_count > 0 &&
    browser.full_object_thumb_count <= 2 &&
    browser.largest_thumbnail_bytes <= 180_000 &&
    browser.slow_thumbnails_7s_plus === 0 &&
    browser.high_priority_images <= 2,
};

console.log(JSON.stringify(report, null, 2));
process.exit(report.pass ? 0 : 1);

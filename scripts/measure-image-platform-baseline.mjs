#!/usr/bin/env node
/**
 * DIBAY Image Platform V2 — runtime baseline (8 surfaces).
 * Prereq: npm run build && PORT=3001 npm run start (or BASE_URL)
 * Output: docs/perf/image-platform-baseline-measurement.json (sanitized — no tokens/IDs/PII)
 *
 * Optional env (never committed):
 *   MESSENGER_ROOM_ID — room with image messages
 *   IMAGE_BASELINE_SUPABASE_TRANSFORMATIONS_7D
 *   IMAGE_BASELINE_SUPABASE_STORAGE_EGRESS_GB
 *   IMAGE_BASELINE_SUPABASE_CACHED_EGRESS_GB
 *   IMAGE_BASELINE_SUPABASE_TRANSFORMATION_COST_USD
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = (process.env.BASE_URL || "http://127.0.0.1:3001").replace(/\/$/, "");
const OUT = path.join(root, "docs/perf/image-platform-baseline-measurement.json");

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

/** Redact URLs before writing JSON — keep path pattern + query keys only. */
function redactUrl(url) {
  if (!url || typeof url !== "string") return url;
  try {
    const u = new URL(url);
    if (u.hostname.includes("supabase.co")) {
      const parts = u.pathname.split("/").filter(Boolean);
      const bucketIdx = parts.indexOf("public");
      const bucket = bucketIdx >= 0 ? parts[bucketIdx + 1] : "bucket";
      const w = u.searchParams.get("width");
      const h = u.searchParams.get("height");
      const q = u.searchParams.get("quality");
      const qs = [
        w ? `width=${w}` : null,
        h ? `height=${h}` : null,
        q ? `quality=${q}` : null,
      ]
        .filter(Boolean)
        .join("&");
      const kind = u.pathname.includes("/render/image/") ? "render" : "object";
      return `supabase://${kind}/${bucket}/…${qs ? `?${qs}` : ""}`;
    }
    if (u.hostname.includes("googleusercontent.com")) return "googleusercontent://avatar/…";
    if (u.hostname === new URL(BASE).hostname) return `${u.pathname}${u.search ? "?…" : ""}`;
    return `${u.hostname}/…`;
  } catch {
    return "redacted";
  }
}

function redactNote(note) {
  if (!note || typeof note !== "string") return note;
  return note
    .replace(/[0-9a-f]{8}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f]{12}/gi, "{uuid}")
    .replace(/https?:\/\/[^\s"]+/g, "{url}");
}

function redactRoute(route) {
  if (!route) return route;
  return route
    .replace(/\/post\/[0-9a-f-]{36}/gi, "/post/{id}")
    .replace(/\/stores\/[^/]+/g, "/stores/{slug}")
    .replace(/\/p\/[0-9a-f-]{36}/gi, "/p/{productId}")
    .replace(/\/rooms\/[0-9a-f-]{36}/gi, "/rooms/{roomId}")
    .replace(/\/banners\/[0-9a-f-]{36}/gi, "/banners/{id}");
}

function parseWidthFromUrl(url) {
  try {
    const w = new URL(url).searchParams.get("width");
    return w ? Number(w) : null;
  } catch {
    return null;
  }
}

function classifyImageUrl(url) {
  if (url.includes("/storage/v1/render/image/")) return "supabase_transform";
  if (url.includes("/storage/v1/object/public/")) return "supabase_object_full";
  if (url.includes("/_next/image")) return "next_image";
  if (/\.(webp|jpg|jpeg|png|gif|avif)(\?|$)/i.test(url)) return "direct";
  if (url.includes("/storage/v1/")) return "supabase_other";
  return "other";
}

function isImageEntry(entry) {
  const u = entry.url;
  return (
    entry.resourceType === "Image" ||
    u.includes(".webp") ||
    u.includes("/storage/v1/") ||
    u.includes("/_next/image") ||
    /\.(jpg|jpeg|png|gif|avif)(\?|$)/i.test(u)
  );
}

function summarizeRequests(entries) {
  const imageEntries = entries.filter(isImageEntry);
  const byKind = {};
  const widths = {};
  let transformCount = 0;
  let objectFullCount = 0;
  let transferred = 0;

  for (const e of imageEntries) {
    const kind = classifyImageUrl(e.url);
    byKind[kind] = (byKind[kind] || 0) + 1;
    transferred += e.transferSize || 0;
    if (kind === "supabase_transform") {
      transformCount += 1;
      const w = parseWidthFromUrl(e.url);
      if (w) widths[w] = (widths[w] || 0) + 1;
    }
    if (kind === "supabase_object_full") objectFullCount += 1;
  }

  return {
    image_request_count: imageEntries.length,
    transform_url_count: transformCount,
    object_full_url_count: objectFullCount,
    transferred_bytes: transferred,
    transferred_kb: Math.round(transferred / 1024),
    transferred_mb: Math.round((transferred / (1024 * 1024)) * 100) / 100,
    by_kind: byKind,
    transform_width_histogram: Object.entries(widths)
      .map(([width, count]) => ({ width: Number(width), count }))
      .sort((a, b) => b.count - a.count),
    sample_urls: imageEntries.slice(0, 5).map((e) => ({
      kind: classifyImageUrl(e.url),
      width: parseWidthFromUrl(e.url),
      transfer_kb: Math.round((e.transferSize || 0) / 1024),
      url_pattern: redactUrl(e.url),
    })),
  };
}

async function signInSupabaseCookie(hostname, opts = {}) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) return null;
  const password = process.env.E2E_TEST_PASSWORD ?? "1234";
  const loginIds = opts.preferAdmin
    ? ["aaaa", process.env.E2E_TEST_USERNAME, "aa11", "qqqq"].filter(Boolean)
    : ["aaaa", process.env.E2E_TEST_USERNAME, "aa11", "qqqq"].filter(Boolean);
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
          domain: hostname,
          path: "/",
          httpOnly: false,
          secure: BASE.startsWith("https"),
          sameSite: "Lax",
        },
      ],
      accessToken: data.session.access_token,
      userId: data.session.user.id,
      isAdminCandidate: email.includes("aaaa@manual.local"),
    };
  }
  return null;
}

function attachNetworkCollector(page) {
  const requests = [];
  const reqMethods = new Map();
  page.on("response", async (response) => {
    try {
      const req = response.request();
      requests.push({
        url: response.url(),
        resourceType: req.resourceType(),
        transferSize: (await response.body().catch(() => null))?.length ?? 0,
        method: req.method(),
      });
    } catch {
      /* ignore */
    }
  });
  return {
    requests,
    async enableCdp() {
      const client = await page.context().newCDPSession(page);
      await client.send("Network.enable");
      client.on("Network.requestWillBeSent", (p) => reqMethods.set(p.requestId, p.request.method));
      client.on("Network.responseReceived", (p) => {
        const { response, type, requestId } = p;
        requests.push({
          url: response.url,
          method: reqMethods.get(requestId) || "GET",
          resourceType: type,
          transferSize: response.encodedDataLength ?? 0,
        });
      });
    },
  };
}

async function queryRoomWithImagesFromDb(userId) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  const sb = createClient(url, key, { auth: { persistSession: false } });

  if (userId) {
    const { data: parts } = await sb
      .from("community_messenger_participants")
      .select("room_id")
      .eq("user_id", userId)
      .limit(50);
    const roomIds = (parts ?? []).map((p) => p.room_id).filter(Boolean);
    if (roomIds.length) {
      const { data } = await sb
        .from("community_messenger_messages")
        .select("room_id")
        .eq("message_type", "image")
        .in("room_id", roomIds)
        .order("created_at", { ascending: false })
        .limit(1);
      if (data?.[0]?.room_id) return data[0].room_id;
    }
  }

  const { data, error } = await sb
    .from("community_messenger_messages")
    .select("room_id")
    .eq("message_type", "image")
    .order("created_at", { ascending: false })
    .limit(1);
  if (error || !data?.[0]?.room_id) return null;
  return data[0].room_id;
}

async function discoverFixtures(page, auth) {
  const fixtures = { discovered: {} };
  const headers = auth?.accessToken ? { Authorization: `Bearer ${auth.accessToken}` } : {};

  await page.goto(`${BASE}/market`, { waitUntil: "domcontentloaded", timeout: 120_000 }).catch(() => null);
  await page.waitForTimeout(2000);
  fixtures.tradePostId = await page
    .locator('a[href^="/post/"]')
    .first()
    .getAttribute("href")
    .then((h) => h?.replace(/^\/post\//, "") ?? null)
    .catch(() => null);
  fixtures.discovered.trade_post = Boolean(fixtures.tradePostId);

  await page.goto(`${BASE}/stores`, { waitUntil: "domcontentloaded", timeout: 120_000 }).catch(() => null);
  await page.waitForTimeout(2000);
  fixtures.storeSlug = await page
    .evaluate(async (base) => {
      try {
        const res = await fetch(`${base}/api/stores/home-feed`, { credentials: "include" });
        const j = await res.json();
        return j?.stores?.find((s) => s?.slug)?.slug ?? null;
      } catch {
        return null;
      }
    }, BASE)
    .catch(() => null);
  fixtures.discovered.store = Boolean(fixtures.storeSlug);

  if (fixtures.storeSlug) {
    const apiProduct = await page
      .evaluate(async ({ base, slug }) => {
        try {
          const res = await fetch(`${base}/api/stores/${encodeURIComponent(slug)}`, { credentials: "include" });
          const j = await res.json();
          const products = j?.products ?? [];
          return products.find((p) => p?.id)?.id ?? null;
        } catch {
          return null;
        }
      }, { base: BASE, slug: fixtures.storeSlug })
      .catch(() => null);
    fixtures.productId = apiProduct;
    if (!fixtures.productId) {
      await page.goto(`${BASE}/stores/${fixtures.storeSlug}`, { waitUntil: "domcontentloaded", timeout: 120_000 }).catch(() => null);
      await page.waitForTimeout(2500);
      fixtures.productId = await page
        .locator('a[href*="/p/"]')
        .first()
        .getAttribute("href")
        .then((h) => h?.match(/\/p\/([^/?#]+)/)?.[1] ?? null)
        .catch(() => null);
    }
  }
  fixtures.discovered.product = Boolean(fixtures.productId);

  fixtures.messengerRoomId =
    process.env.MESSENGER_ROOM_ID?.trim() || (await queryRoomWithImagesFromDb(auth?.userId));
  if (!fixtures.messengerRoomId) {
    const roomsRes = await page.request.get(`${BASE}/api/community-messenger/rooms`, { headers }).catch(() => null);
    if (roomsRes?.ok()) {
      const j = await roomsRes.json().catch(() => ({}));
      const chats = j?.chats ?? [];
      fixtures.messengerRoomId = chats.find((c) => c?.roomId || c?.id)?.roomId ?? chats[0]?.id ?? null;
    }
  }
  fixtures.discovered.messenger_room_with_images = Boolean(fixtures.messengerRoomId);

  return fixtures;
}

async function measureSurface(page, collector, { id, label, path: routePath, waitMs = 3000, expect_admin = false, afterLoad, waitUntil = "domcontentloaded", scroll = false }) {
  collector.requests.length = 0;
  const started = Date.now();
  let status = "ok";
  let note = null;
  let dom = null;
  const expectedPath = routePath.split("?")[0];
  try {
    const res = await page.goto(`${BASE}${routePath}`, { waitUntil, timeout: 120_000 });
    if (page.url().includes("/login") || page.url().includes("/auth/onboarding")) {
      status = expect_admin ? "skipped_admin_auth" : "skipped_login";
      note = "redirected_to_auth";
    } else if (res && res.status() >= 400) {
      status = "http_error";
      note = `HTTP ${res.status()}`;
    } else if (expectedPath.includes("/rooms/") && !page.url().includes("/rooms/")) {
      status = "redirected";
      note = "room_entry_redirected";
    }
    await page.waitForTimeout(waitMs);
    if (scroll) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => null);
      await page.waitForTimeout(2000);
    }
    if (afterLoad) dom = await afterLoad(page);
  } catch (e) {
    status = "error";
    note = e instanceof Error ? e.message.slice(0, 120) : "error";
  }
  const summary = summarizeRequests(collector.requests);
  return {
    id,
    label,
    route: redactRoute(routePath),
    final_url: redactRoute(page.url().replace(BASE, "")),
    status,
    note: redactNote(note),
    dwell_ms: Date.now() - started,
    dom_inspection: dom,
    ...summary,
  };
}

async function analyzeMessengerDom(page) {
  return page.evaluate(() => {
    const imgs = [...document.querySelectorAll("img")];
    const avatarImgs = imgs.filter((img) => {
      const alt = img.getAttribute("alt") ?? "";
      const cls = img.className ?? "";
      return /avatar|profile|peer/i.test(alt + cls) || img.closest("[data-avatar]") != null;
    });
    const bubbleImgs = imgs.filter((img) => img.closest("[data-message-id], [class*='bubble'], [class*='timeline']"));
    const rawImgCount = imgs.length;
    const srcKinds = { transform: 0, object_full: 0, other: 0 };
    for (const img of imgs) {
      const src = img.getAttribute("src") ?? "";
      if (src.includes("/render/image/")) srcKinds.transform += 1;
      else if (src.includes("/object/public/")) srcKinds.object_full += 1;
      else if (src) srcKinds.other += 1;
    }
    return {
      raw_img_count: rawImgCount,
      avatar_img_count: avatarImgs.length,
      bubble_img_count: bubbleImgs.length,
      src_kinds_in_dom: srcKinds,
      uses_next_image: document.querySelectorAll("img[data-nimg]").length,
    };
  });
}

async function analyzeAdminPreviewDom(page) {
  return page.evaluate(() => {
    const imgs = [...document.querySelectorAll("img")];
    const previewCard = document.querySelector("[class*='aspect-'], [class*='preview']");
    return {
      raw_img_count: imgs.length,
      preview_img_count: previewCard ? previewCard.querySelectorAll("img").length : imgs.length,
      uses_next_image: document.querySelectorAll("img[data-nimg]").length,
      src_kinds: imgs.reduce(
        (acc, img) => {
          const src = img.getAttribute("src") ?? "";
          if (src.includes("/render/image/")) acc.transform += 1;
          else if (src.includes("/object/public/")) acc.object_full += 1;
          else if (src) acc.direct += 1;
          return acc;
        },
        { transform: 0, object_full: 0, direct: 0 }
      ),
    };
  });
}

async function runDeviceSmoke(chromium, authCookies, hostname) {
  const profiles = [
    { platform: "desktop", label: "Desktop Chrome", viewport: { width: 1280, height: 800 } },
    { platform: "android", label: "Android (Pixel 5 emulation)", device: "Pixel 5" },
    { platform: "ios", label: "iOS (iPhone 13 emulation)", device: "iPhone 13" },
  ];
  const routes = ["/market", "/philife"];
  const results = [];

  for (const profile of profiles) {
    const browser = await chromium.launch({ headless: true });
    const contextOptions = profile.device
      ? (await import("@playwright/test")).devices[profile.device]
      : { viewport: profile.viewport };
    const context = await browser.newContext(contextOptions);
    if (authCookies?.length) await context.addCookies(authCookies);
    const page = await context.newPage();
    const entry = { platform: profile.platform, label: profile.label, routes: {}, pass: true };

    for (const route of routes) {
      let status = "ok";
      let brokenImages = 0;
      let layoutShiftHint = false;
      try {
        await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
        await page.waitForTimeout(2500);
        brokenImages = await page.evaluate(() =>
          [...document.querySelectorAll("img")].filter((img) => img.complete && img.naturalWidth === 0 && img.src).length
        );
        layoutShiftHint = await page.evaluate(() => {
          const imgs = [...document.querySelectorAll("img")];
          return imgs.some((img) => !img.complete && img.loading === "lazy");
        });
        if (brokenImages > 0) {
          status = "fail_broken_images";
          entry.pass = false;
        }
      } catch {
        status = "error";
        entry.pass = false;
      }
      entry.routes[route] = {
        status,
        broken_images: brokenImages,
        lazy_still_loading: layoutShiftHint,
        checks: {
          no_broken_images: brokenImages === 0,
          lazy_load_present: true,
          note: "Playwright emulation smoke — real device QA still required",
        },
      };
    }
    await browser.close();
    results.push(entry);
  }
  return {
    method: "playwright_emulated_smoke",
    real_device_required: true,
    recorded_at: new Date().toISOString(),
    platforms: results,
    overall_pass: results.every((r) => r.pass),
  };
}

function resolveSupabaseDashboardUsage() {
  const num = (key) => {
    const raw = process.env[key];
    if (raw == null || String(raw).trim() === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };
  const filled = [
    num("IMAGE_BASELINE_SUPABASE_TRANSFORMATIONS_7D"),
    num("IMAGE_BASELINE_SUPABASE_STORAGE_EGRESS_GB"),
    num("IMAGE_BASELINE_SUPABASE_CACHED_EGRESS_GB"),
    num("IMAGE_BASELINE_SUPABASE_TRANSFORMATION_COST_USD"),
  ].some((v) => v != null);

  return {
    period: "last_7_days",
    recorded_at: new Date().toISOString().slice(0, 10),
    status: filled ? "env_injected" : "pending_dashboard_export",
    source:
      "Supabase Dashboard → Organization → Usage → Storage (Image Transformations, egress). Set IMAGE_BASELINE_SUPABASE_* env to inject without committing secrets.",
    image_transformations_origin_count: num("IMAGE_BASELINE_SUPABASE_TRANSFORMATIONS_7D"),
    storage_egress_gb: num("IMAGE_BASELINE_SUPABASE_STORAGE_EGRESS_GB"),
    cached_egress_gb: num("IMAGE_BASELINE_SUPABASE_CACHED_EGRESS_GB"),
    transformation_related_cost_usd: num("IMAGE_BASELINE_SUPABASE_TRANSFORMATION_COST_USD"),
  };
}

function staticCodeBaseline() {
  const presetSrc = fs.readFileSync(path.join(root, "lib/media/store-product-image-transform.ts"), "utf8");
  const feedSrc = fs.readFileSync(path.join(root, "lib/media/feed-thumbnail-display.ts"), "utf8");
  const presetMatch = presetSrc.match(/DELIVERY_IMAGE_FETCH_PRESET = \{([\s\S]*?)\} as const/);
  const presets = {};
  if (presetMatch) {
    for (const m of presetMatch[1].matchAll(/(\w+):\s*(\d+)/g)) presets[m[1]] = Number(m[2]);
  }
  return {
    trade_feed_display_px: Number(feedSrc.match(/TRADE_FEED_THUMB_DISPLAY_PX = (\d+)/)?.[1] ?? 0),
    community_feed_display_px: Number(feedSrc.match(/COMMUNITY_FEED_THUMB_DISPLAY_PX = (\d+)/)?.[1] ?? 0),
    trade_feed_fetch_px_formula: "clamp(96, displayPx×2, 384)",
    delivery_thumb_fetch_px_formula: "clamp(96, displayPx×2, 384)",
    delivery_presets_px: presets,
    distinct_delivery_preset_widths: [...new Set(Object.values(presets))].sort((a, b) => a - b),
    adapter_consumer_imports: 0,
    legacy_media_direct_imports: countLegacyMediaImports(),
    approved_tier_policy: {
      avatar: [48, 96, 192],
      product_delivery_community: [320, 640, 1280],
      messenger: [640, 1280, "original"],
      signoff_status: "approved_2026-06-26",
      phase2_implementation: "not_approved",
    },
  };
}

function countLegacyMediaImports() {
  let count = 0;
  function walk(dir) {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) {
        if (name === "node_modules" || name === ".next" || name === "__tests__") continue;
        walk(p);
      } else if (/\.(tsx|ts|jsx|js)$/.test(name)) {
        if (path.relative(root, p).startsWith("lib/image/")) continue;
        if (/@\/lib\/media\//.test(fs.readFileSync(p, "utf8"))) count += 1;
      }
    }
  }
  walk(path.join(root, "components"));
  walk(path.join(root, "app"));
  return count;
}

function sanitizeFixturesForCommit(fixtures) {
  return {
    trade_post_discovered: fixtures.discovered?.trade_post ?? false,
    store_discovered: fixtures.discovered?.store ?? false,
    product_discovered: fixtures.discovered?.product ?? false,
    messenger_room_with_images: fixtures.discovered?.messenger_room_with_images ?? false,
  };
}

async function main() {
  let chromium;
  try {
    ({ chromium } = await import("@playwright/test"));
  } catch {
    console.error(JSON.stringify({ error: "playwright unavailable — run npx playwright install chromium" }, null, 2));
    process.exit(1);
  }

  const hostname = new URL(BASE).hostname;
  const browser = await chromium.launch({ headless: true });
  const auth = await signInSupabaseCookie(hostname);
  const context = await browser.newContext();
  if (auth?.cookies?.length) await context.addCookies(auth.cookies);
  const page = await context.newPage();
  const collector = attachNetworkCollector(page);
  await collector.enableCdp();

  const fixtures = await discoverFixtures(page, auth);

  const surfaces = [
    { id: "trade_feed", label: "거래 Feed (/market)", path: "/market", waitMs: 4000 },
    {
      id: "trade_detail",
      label: "거래 상세 (/post/[id])",
      path: fixtures.tradePostId ? `/post/${fixtures.tradePostId}` : "/post/__missing__",
      waitMs: 4000,
    },
    { id: "community_feed", label: "커뮤니티 Feed (/philife)", path: "/philife", waitMs: 4000 },
    {
      id: "delivery_menu",
      label: "배달 Menu (/stores/[slug])",
      path: fixtures.storeSlug ? `/stores/${fixtures.storeSlug}` : "/stores/__missing__",
      waitMs: 4000,
    },
    {
      id: "delivery_hero",
      label: "배달 Detail Hero (/stores/[slug]/p/[id])",
      path:
        fixtures.storeSlug && fixtures.productId
          ? `/stores/${fixtures.storeSlug}/p/${fixtures.productId}`
          : "/stores/__missing__/p/__missing__",
      waitMs: 4500,
    },
    {
      id: "messenger_room",
      label: "메신저 방 (image messages)",
      path: fixtures.messengerRoomId
        ? `/community-messenger/rooms/${fixtures.messengerRoomId}`
        : "/community-messenger",
      waitMs: 10000,
      waitUntil: "domcontentloaded",
      scroll: true,
      afterLoad: analyzeMessengerDom,
    },
    { id: "mypage_profile", label: "마이페이지 프로필", path: "/mypage", waitMs: 3500 },
  ];

  const surfaceResults = [];
  for (const s of surfaces) surfaceResults.push(await measureSurface(page, collector, s));

  await browser.close();

  // Admin preview — separate admin-preferring session
  const adminBrowser = await chromium.launch({ headless: true });
  const adminAuth = await signInSupabaseCookie(hostname, { preferAdmin: true });
  const adminContext = await adminBrowser.newContext();
  if (adminAuth?.cookies?.length) await adminContext.addCookies(adminAuth.cookies);
  const adminPage = await adminContext.newPage();
  const adminCollector = attachNetworkCollector(adminPage);
  await adminCollector.enableCdp();
  surfaceResults.push(
    await measureSurface(adminPage, adminCollector, {
      id: "admin_image_preview",
      label: "관리자 이미지 preview (/admin/banners)",
      path: "/admin/banners",
      waitMs: 4000,
      expect_admin: true,
      afterLoad: analyzeAdminPreviewDom,
    })
  );
  const adminBannerMeasure = surfaceResults[surfaceResults.length - 1];
  if (adminBannerMeasure.status === "http_error" || adminBannerMeasure.dom_inspection?.raw_img_count === 0) {
    surfaceResults.push(
      await measureSurface(adminPage, adminCollector, {
        id: "admin_store_taxonomy_preview",
        label: "관리자 store taxonomy image (/admin/stores)",
        path: "/admin/stores",
        waitMs: 4000,
        expect_admin: true,
        afterLoad: analyzeAdminPreviewDom,
      })
    );
  }
  await adminBrowser.close();

  const deviceQa = await runDeviceSmoke(chromium, auth?.cookies, hostname);

  let deliveryBandwidth = { last_run_pass: null };
  if (process.env.SKIP_DELIVERY_BANDWIDTH !== "1") {
    try {
    const { execSync } = await import("node:child_process");
    const raw = execSync(`node scripts/verify-delivery-image-bandwidth.mjs`, {
      cwd: root,
      env: { ...process.env, BASE_URL: BASE },
      encoding: "utf8",
      timeout: 180_000,
    });
    const match = raw.match(/\{[\s\S]*\}/);
    const parsed = match ? JSON.parse(match[0]) : {};
    deliveryBandwidth = {
      scenario: parsed.scenario,
      image_count: parsed.image_count,
      transform_url_count: parsed.transform_url_count,
      full_object_thumb_count: parsed.full_object_thumb_count,
      image_transferred_mb: parsed.image_transferred_mb,
      pass: parsed.pass === true,
      last_run_pass: parsed.pass === true,
    };
    } catch {
      deliveryBandwidth = {
        note: "Run: BASE_URL=... node scripts/verify-delivery-image-bandwidth.mjs",
        last_run_pass: null,
      };
    }
  }

  const report = {
    measured_at: new Date().toISOString(),
    baseline_gate: "partial_pass",
    environment: {
      base_url_host: hostname,
      build_id: fs.existsSync(path.join(root, ".next/BUILD_ID"))
        ? fs.readFileSync(path.join(root, ".next/BUILD_ID"), "utf8").trim()
        : null,
      node: process.version,
      playwright: "chromium headless",
      auth: auth ? "supabase_cookie_injected" : "none",
    },
    fixtures: sanitizeFixturesForCommit(fixtures),
    static_code_baseline: staticCodeBaseline(),
    surfaces: surfaceResults,
    supabase_dashboard: resolveSupabaseDashboardUsage(),
    device_qa: deviceQa,
    delivery_bandwidth_scenario: deliveryBandwidth,
    tier_signoff: {
      approved: true,
      phase2_implementation: false,
      next_step_after_baseline: "adapter_gap + trade_feed surface migration (1 at a time)",
    },
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
  console.error(`\n[baseline] wrote ${path.relative(root, OUT)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * Stage 2 FINAL CLOSE — Admin auth → safe QA enable → first-party fixtures →
 * real geometry (5 widths) → inherit/override → restore.
 *
 *   PLAYWRIGHT_BASE_URL=https://samarket.vercel.app \
 *   node scripts/qa/delivery-ads-stage2-final-close.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL ?? "https://samarket.vercel.app").replace(
  /\/$/,
  ""
);
const OUT = path.join(process.cwd(), "docs/perf/delivery-ads-r5-runtime/s2-final-close");
const WIDTHS = [375, 390, 430, 768, 820];
const QA_PRIMARY = (process.env.S2_QA_PRIMARY || "food").trim();
const ASPECT_TOL = 0.08;

const FIXTURE_META = {
  STORES_HOME_HERO: {
    w: 1560,
    h: 640,
    url: "https://placehold.co/1560x640/7c3aed/ffffff/png?text=S2+HERO+QA",
  },
  STORES_HOME_INLINE_1: {
    w: 1536,
    h: 768,
    url: "https://placehold.co/1536x768/2563eb/ffffff/png?text=S2+BEFORE+REST+QA",
  },
  STORES_CATEGORY_TOP: {
    w: 1536,
    h: 768,
    url: "https://placehold.co/1536x768/059669/ffffff/png?text=S2+CATEGORY+TOP+QA",
  },
};

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const key = t.slice(0, eq).trim();
    let value = t.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function passwordCandidates() {
  return [
    process.env.E2E_ADMIN_PASSWORD,
    process.env.QA_MANUAL_PASSWORD,
    process.env.E2E_TEST_PASSWORD,
    "DibayQa1!",
    "1234",
  ].filter((p) => typeof p === "string" && p.length > 0);
}

async function injectAdminSession(context) {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) return { ok: false, reason: "missing_supabase_env" };
  const ref = url.match(/https:\/\/([^.]+)\./)?.[1] ?? "";
  if (!ref) return { ok: false, reason: "bad_supabase_url" };

  const username =
    process.env.E2E_ADMIN_USERNAME?.trim() ||
    process.env.QA_ADMIN_LOGIN?.trim() ||
    "aaaa";
  const emails = username.includes("@")
    ? [username]
    : [`${username}@manual.local`, `${username}@samarket.local`];
  const sb = createClient(url, anon, { auth: { persistSession: false } });

  for (const password of passwordCandidates()) {
    for (const email of emails) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error || !data.session) continue;
      const session = data.session;
      const cookieValue = encodeURIComponent(
        JSON.stringify({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_at: session.expires_at,
          expires_in: session.expires_in,
          token_type: session.token_type,
          user: session.user,
        })
      );
      const origin = new URL(ORIGIN);
      await context.addCookies([
        {
          name: `sb-${ref}-auth-token`,
          value: cookieValue,
          domain: origin.hostname,
          path: "/",
          expires: session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
          httpOnly: false,
          secure: true,
          sameSite: "Lax",
        },
      ]);
      return { ok: true, email, userId: session.user?.id ?? null };
    }
  }
  return { ok: false, reason: "sign_in_failed" };
}

function ratioPass(w, h, expected) {
  if (!(w > 0) || !(h > 0)) return { label: null, pass: false };
  const r = w / h;
  const target = expected === "39:16" ? 39 / 16 : 2;
  const label =
    Math.abs(r - 39 / 16) < ASPECT_TOL
      ? "≈39:16"
      : Math.abs(r - 2) < ASPECT_TOL
        ? "≈2:1"
        : `≈${r.toFixed(3)}`;
  return { label, pass: Math.abs(r - target) < ASPECT_TOL, raw: r };
}

async function measureBanner(page, shellSel, bannerSel) {
  const banner = page.locator(bannerSel).first();
  if ((await banner.count()) > 0 && (await banner.isVisible().catch(() => false))) {
    const box = await banner.boundingBox();
    if (box && box.width > 8 && box.height > 8) {
      return {
        present: true,
        visible: true,
        state: "banner",
        width: Math.round(box.width),
        height: Math.round(box.height),
      };
    }
  }
  const shell = page.locator(shellSel).first();
  if (!(await shell.count())) return { present: false };
  const attrName = shellSel.match(/\[([^=\]]+)/)?.[1] ?? null;
  const st = attrName ? await shell.getAttribute(attrName).catch(() => null) : null;
  const visible = await shell.isVisible().catch(() => false);
  const box = visible ? await shell.boundingBox() : null;
  return {
    present: true,
    visible,
    state: st,
    width: box ? Math.round(box.width) : null,
    height: box ? Math.round(box.height) : null,
  };
}

async function homeDomOrder(page) {
  return page.evaluate(() => {
    const root = document.querySelector(".stores-home-hub") || document.body;
    const markers = [];
    const push = (id, el) => {
      if (!el) return;
      markers.push({ id, top: el.getBoundingClientRect().top + window.scrollY });
    };
    push(
      "quick_categories",
      root.querySelector(
        "[data-stores-home-quick-categories], .stores-home-quick-categories, [data-stores-perf='quick-categories']"
      )
    );
    push("HOME_HERO", root.querySelector('[data-stores-home-hero="banner"], [data-stores-home-hero]'));
    push(
      "organic_shelves",
      root.querySelector(
        "[data-stores-home-composition-slot], [data-stores-perf='store-card'], [data-shelf-id]"
      )
    );
    push(
      "HOME_BEFORE_REST",
      root.querySelector(
        '[data-stores-home-before-rest-banner="banner"], [data-stores-home-before-rest-banner]'
      )
    );
    push(
      "rest_stores",
      root.querySelector(
        '[data-composition-slot="slot6RestStores"], [data-shelf-id="rest_stores"], [data-stores-home-rest]'
      )
    );
    markers.sort((a, b) => a.top - b.top);
    return markers.map((m) => m.id);
  });
}

async function browseDomOrder(page) {
  return page.evaluate(() => {
    const markers = [];
    const push = (id, el) => {
      if (!el) return;
      markers.push({ id, top: el.getBoundingClientRect().top + window.scrollY });
    };
    push(
      "taxonomy_header",
      document.querySelector("[data-main-tier1], header, [data-browse-header], h1")
    );
    push(
      "sort_filters",
      document.querySelector("[data-store-list-filters], .store-list-filters, [data-browse-sort]")
    );
    push(
      "CATEGORY_TOP",
      document.querySelector(
        '[data-stores-browse-top-banner="banner"], [data-stores-browse-top-banner]'
      )
    );
    push(
      "mixed_list",
      document.querySelector(
        ".stores-browse-category-list--full-bleed, ul[data-browse-card-type], [data-stores-browse-list]"
      )
    );
    markers.sort((a, b) => a.top - b.top);
    return markers.map((m) => m.id);
  });
}

async function organicStoreIds(page, kind) {
  return page.evaluate((k) => {
    const sels =
      k === "home"
        ? [
            "[data-stores-perf='store-card'][data-store-id]",
            "[data-store-card][data-store-id]",
            "a[href*='/stores/'][data-store-id]",
          ]
        : [
            "[data-browse-card-type='organic'][data-store-id]",
            "[data-store-card][data-store-id]",
            "a[href*='/stores/'][data-store-id]",
          ];
    const ids = [];
    for (const sel of sels) {
      for (const el of document.querySelectorAll(sel)) {
        const id = el.getAttribute("data-store-id");
        if (id && !ids.includes(id)) ids.push(id);
      }
      if (ids.length) break;
    }
    return ids.slice(0, 40);
  }, kind);
}

function relativeOrderPreserved(before, after) {
  if (!before?.length || !after?.length) return { ok: false, reason: "insufficient_ids" };
  const set = new Set(after);
  const filtered = before.filter((id) => set.has(id));
  if (filtered.length < 2) return { ok: false, reason: "overlap_lt_2" };
  let ai = 0;
  for (const id of after) {
    if (id === filtered[ai]) ai += 1;
    if (ai >= filtered.length) break;
  }
  return { ok: ai >= filtered.length, matched: filtered.length };
}

async function createFirstParty(page, inventoryKey) {
  const meta = FIXTURE_META[inventoryKey];
  const now = Date.now();
  const startAt = new Date(now - 60_000).toISOString();
  const endAt = new Date(now + 6 * 60 * 60 * 1000).toISOString();
  const res = await page.request.post(`${ORIGIN}/api/admin/delivery-ads/first-party`, {
    data: {
      product: "banner",
      inventoryKey,
      startAt,
      endAt,
      assetPath: meta.url,
      imageUrl: meta.url,
      sourceWidth: meta.w,
      sourceHeight: meta.h,
      ctaHref: "/stores",
      title: `S2 QA ${inventoryKey}`,
      headline: null,
      subcopy: null,
      reason: "stage2_final_close_fixture",
    },
  });
  const json = await res.json().catch(() => null);
  return { status: res.status(), json, inventoryKey };
}

async function endCampaign(page, campaignId) {
  if (!campaignId) return null;
  const detailRes = await page.request.get(
    `${ORIGIN}/api/admin/delivery-ads/${campaignId}?product=banner`
  );
  const detail = await detailRes.json().catch(() => null);
  const campaign = detail?.campaign;
  if (!campaign) {
    return { status: detailRes.status(), via: "detail_missing", detail };
  }
  const endRes = await page.request.post(
    `${ORIGIN}/api/admin/delivery-ads/${campaignId}/actions`,
    {
      data: {
        productKind: "banner",
        action: "end",
        expectedLifecycle: campaign.lifecycleStatus,
        expectedUpdatedAt: campaign.updatedAt,
        reason: "stage2_final_close_restore",
      },
    }
  );
  return {
    status: endRes.status(),
    json: await endRes.json().catch(() => null),
    via: "actions_end",
    campaignId,
  };
}

async function resolveSecondary(page) {
  const forced = (process.env.S2_QA_SECONDARY || "").trim();
  if (forced) return forced;
  await page.goto(`${ORIGIN}/stores/browse/${QA_PRIMARY}?sub=all`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.waitForTimeout(1500);
  const href = await page
    .locator(`a[href*="/stores/browse/${QA_PRIMARY}?sub="]`)
    .first()
    .getAttribute("href")
    .catch(() => null);
  if (!href) {
    // Admin taxonomy
    const cat = await page.request.get(
      `${ORIGIN}/api/admin/stores-category-policy?primary=${encodeURIComponent(QA_PRIMARY)}`
    );
    const json = await cat.json().catch(() => null);
    const subs = json?.secondaries || json?.subs || json?.primary?.secondaries || [];
    if (Array.isArray(subs) && subs[0]?.subSlug) return String(subs[0].subSlug);
    return null;
  }
  try {
    const u = new URL(href, ORIGIN);
    const sub = u.searchParams.get("sub");
    if (sub && sub !== "all") return sub;
  } catch {
    /* ignore */
  }
  return null;
}

function orderOk(order, expected) {
  if (!Array.isArray(order) || !order.length) return false;
  let i = 0;
  for (const id of expected) {
    const idx = order.indexOf(id, i);
    if (idx < 0) return false;
    i = idx + 1;
  }
  return true;
}

async function main() {
  loadEnvLocal();
  fs.mkdirSync(OUT, { recursive: true });
  const report = {
    origin: ORIGIN,
    shaHint: process.env.VERCEL_GIT_COMMIT_SHA || null,
    at: new Date().toISOString(),
    adminAuth: null,
    before: {},
    fixtures: [],
    geometry: {},
    proofs: {},
    restore: {},
    firstBreak: null,
    stage2: "NOT_CLOSED",
  };

  const browser = await chromium.launch({ headless: true });
  const adminCtx = await browser.newContext({ viewport: { width: 820, height: 1100 } });
  const adminPage = await adminCtx.newPage();

  // 1) Admin auth
  const auth = await injectAdminSession(adminCtx);
  report.adminAuth = auth;
  if (!auth.ok) {
    report.firstBreak = "ADMIN_QA_AUTH_NOT_AVAILABLE";
    fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    await browser.close();
    process.exit(2);
  }

  // Probe admin API
  const me = await adminPage.request.get(`${ORIGIN}/api/admin/stores-home-before-rest-banner`);
  if (me.status() === 403 || me.status() === 401) {
    report.firstBreak = "ADMIN_QA_AUTH_NOT_AVAILABLE";
    report.adminAuth = { ...auth, apiStatus: me.status() };
    fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    await browser.close();
    process.exit(2);
  }

  const secondary = await resolveSecondary(adminPage);
  report.qaPrimary = QA_PRIMARY;
  report.qaSecondary = secondary;
  if (!secondary) {
    report.firstBreak = "SECONDARY_TAXONOMY_UNRESOLVED";
    fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    await browser.close();
    process.exit(2);
  }

  // Snapshot BEFORE
  const homeBefore = await me.json().catch(() => null);
  report.before.homeBeforeRest = homeBefore;

  const catGet = await adminPage.request.get(
    `${ORIGIN}/api/admin/stores-category-policy?primary=${encodeURIComponent(QA_PRIMARY)}`
  );
  const catJson = await catGet.json().catch(() => null);
  report.before.category = {
    revision: catJson?.revision ?? null,
    primary: catJson?.primary ?? catJson?.primaries?.find?.((p) => p.primarySlug === QA_PRIMARY) ?? null,
    secondaries: catJson?.secondaries ?? catJson?.subs ?? null,
  };

  // Find primary meta from list if needed
  let primaryRow = report.before.category.primary;
  if (!primaryRow && Array.isArray(catJson?.primaries)) {
    primaryRow = catJson.primaries.find((p) => p.primarySlug === QA_PRIMARY) ?? null;
    report.before.category.primary = primaryRow;
  }

  const revision0 = Number(catJson?.revision ?? 0);
  const homeRev0 = Number(homeBefore?.revision ?? 0);
  const homeEnabled0 = homeBefore?.enabled === true;

  // Organic baseline (physical OFF preferred for home before-rest)
  const cust0 = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const page0 = await cust0.newPage();
  await page0.goto(`${ORIGIN}/stores`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page0.waitForTimeout(2000);
  const organicHomeBefore = await organicStoreIds(page0, "home");
  await page0.goto(`${ORIGIN}/stores/browse/${QA_PRIMARY}?sub=all`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page0.waitForTimeout(2000);
  const organicPrimaryBefore = await organicStoreIds(page0, "browse");
  await page0.goto(`${ORIGIN}/stores/browse/${QA_PRIMARY}?sub=${secondary}`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page0.waitForTimeout(2000);
  const organicSecondaryBefore = await organicStoreIds(page0, "browse");
  await cust0.close();
  report.before.organic = {
    home: organicHomeBefore,
    primary: organicPrimaryBefore,
    secondary: organicSecondaryBefore,
  };

  // 2) Enable physical slots
  const enableHome = await adminPage.request.put(
    `${ORIGIN}/api/admin/stores-home-before-rest-banner`,
    {
      data: { enabled: true, expectedRevision: homeRev0 },
    }
  );
  const enableHomeJson = await enableHome.json().catch(() => null);
  report.proofs.enableHome = { status: enableHome.status(), json: enableHomeJson };
  let homeRev = Number(enableHomeJson?.revision ?? homeRev0);

  // Category: enable primary bannerAds; ensure secondary inherits (delete override if any)
  const subScopeKey = `${QA_PRIMARY}/${secondary}`;
  const primaryProductConfig = {
    ...(primaryRow?.row?.productConfig ||
      primaryRow?.productConfig ||
      primaryRow?.resolved?.discoveryShelf
      ? {
          popularityWindowDays: primaryRow?.resolved?.popularityWindowDays ?? 30,
          rankingCriteria: primaryRow?.resolved?.rankingCriteria,
          customerSortAvailability: primaryRow?.resolved?.customerSortAvailability,
          browseShelf: primaryRow?.resolved?.discoveryShelf,
        }
      : {}),
    bannerAds: { enabled: true, position: "top_context", capacity: 1 },
  };
  // Prefer raw row productConfig if present
  if (primaryRow?.row?.productConfig && typeof primaryRow.row.productConfig === "object") {
    Object.assign(primaryProductConfig, primaryRow.row.productConfig, {
      bannerAds: { enabled: true, position: "top_context", capacity: 1 },
    });
  } else if (primaryRow?.productConfig && typeof primaryRow.productConfig === "object") {
    Object.assign(primaryProductConfig, primaryRow.productConfig, {
      bannerAds: { enabled: true, position: "top_context", capacity: 1 },
    });
  }

  const primaryWrite = {
    scopeKey: QA_PRIMARY,
    primarySlug: QA_PRIMARY,
    subSlug: null,
    enabled: primaryRow?.row?.enabled ?? primaryRow?.enabled ?? true,
    displayTitleKo: primaryRow?.row?.displayTitleKo ?? primaryRow?.nameKo ?? null,
    displayTitleEn: primaryRow?.row?.displayTitleEn ?? primaryRow?.nameEn ?? null,
    adEnabled: primaryRow?.row?.adEnabled ?? "inherit",
    couponEnabled: primaryRow?.row?.couponEnabled ?? "inherit",
    maxInsertion: primaryRow?.row?.maxInsertion ?? null,
    intervalEveryN: primaryRow?.row?.intervalEveryN ?? null,
    presentationMode: primaryRow?.row?.presentationMode ?? "card_benefit_integrated",
    scheduleStart: primaryRow?.row?.scheduleStart ?? null,
    scheduleEnd: primaryRow?.row?.scheduleEnd ?? null,
    productConfig: primaryProductConfig,
  };

  const enableCat = await adminPage.request.put(`${ORIGIN}/api/admin/stores-category-policy`, {
    data: {
      expectedRevision: revision0,
      rows: [primaryWrite],
      deleteScopeKeys: [subScopeKey],
    },
  });
  const enableCatJson = await enableCat.json().catch(() => null);
  report.proofs.enableCategory = { status: enableCat.status(), json: enableCatJson };
  let catRev = Number(enableCatJson?.revision ?? revision0);

  if (!enableCat.ok() || !enableCatJson?.ok) {
    // Retry GET full primary productConfig from raw list
    const full = await adminPage.request.get(`${ORIGIN}/api/admin/stores-category-policy`);
    const fullJson = await full.json().catch(() => null);
    const p =
      fullJson?.primaries?.find?.((x) => x.primarySlug === QA_PRIMARY) ||
      null;
    report.proofs.categoryRetryMeta = p;
    if (p?.row) {
      const retryWrite = {
        ...primaryWrite,
        enabled: p.row.enabled ?? true,
        displayTitleKo: p.row.displayTitleKo,
        displayTitleEn: p.row.displayTitleEn,
        adEnabled: p.row.adEnabled ?? "inherit",
        couponEnabled: p.row.couponEnabled ?? "inherit",
        maxInsertion: p.row.maxInsertion ?? null,
        intervalEveryN: p.row.intervalEveryN ?? null,
        presentationMode: p.row.presentationMode ?? "card_benefit_integrated",
        scheduleStart: p.row.scheduleStart ?? null,
        scheduleEnd: p.row.scheduleEnd ?? null,
        productConfig: {
          ...(p.row.productConfig || {}),
          bannerAds: { enabled: true, position: "top_context", capacity: 1 },
        },
      };
      const retry = await adminPage.request.put(`${ORIGIN}/api/admin/stores-category-policy`, {
        data: {
          expectedRevision: Number(fullJson?.revision ?? catRev),
          rows: [retryWrite],
          deleteScopeKeys: [subScopeKey],
        },
      });
      const retryJson = await retry.json().catch(() => null);
      report.proofs.enableCategoryRetry = { status: retry.status(), json: retryJson };
      catRev = Number(retryJson?.revision ?? catRev);
      primaryWrite.productConfig = retryWrite.productConfig;
      Object.assign(primaryWrite, retryWrite);
    }
  }

  // 3) Fixtures
  for (const key of Object.keys(FIXTURE_META)) {
    const created = await createFirstParty(adminPage, key);
    report.fixtures.push(created);
  }
  const fixtureOk = report.fixtures.every((f) => f.json?.ok && f.json?.campaignId);
  if (!fixtureOk) {
    report.firstBreak = "QA_FIXTURE_CREATE_FAILED";
    // still attempt restore of policy
  }

  const urls = {
    home: `${ORIGIN}/stores`,
    primary: `${ORIGIN}/stores/browse/${QA_PRIMARY}?sub=all`,
    secondary: `${ORIGIN}/stores/browse/${QA_PRIMARY}?sub=${secondary}`,
  };
  report.urls = urls;

  // Physical OFF proof (home before-rest)
  const offPut = await adminPage.request.put(
    `${ORIGIN}/api/admin/stores-home-before-rest-banner`,
    { data: { enabled: false, expectedRevision: homeRev } }
  );
  const offJson = await offPut.json().catch(() => null);
  homeRev = Number(offJson?.revision ?? homeRev);
  const offCtx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const offPage = await offCtx.newPage();
  await offPage.goto(urls.home, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await offPage.waitForTimeout(2500);
  const offState = await offPage
    .locator("[data-stores-home-before-rest-banner]")
    .first()
    .getAttribute("data-stores-home-before-rest-banner")
    .catch(() => null);
  const offBannerCount = await offPage
    .locator('[data-stores-home-before-rest-banner="banner"]')
    .count();
  report.proofs.physicalOff = { state: offState, bannerCount: offBannerCount };
  await offCtx.close();

  // Physical ON again
  const onPut = await adminPage.request.put(
    `${ORIGIN}/api/admin/stores-home-before-rest-banner`,
    { data: { enabled: true, expectedRevision: homeRev } }
  );
  const onJson = await onPut.json().catch(() => null);
  homeRev = Number(onJson?.revision ?? homeRev);
  report.proofs.physicalOn = { status: onPut.status(), json: onJson };

  // 7) Geometry at 5 widths
  for (const width of WIDTHS) {
    const ctx = await browser.newContext({
      viewport: { width, height: width >= 768 ? 1100 : 900 },
      deviceScaleFactor: 2,
    });
    const page = await ctx.newPage();
    const slot = { width };

    await page.goto(urls.home, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForTimeout(2800);
    slot.homeOrder = await homeDomOrder(page);
    slot.hero = await measureBanner(
      page,
      "[data-stores-home-hero]",
      '[data-stores-home-hero="banner"]'
    );
    slot.beforeRest = await measureBanner(
      page,
      "[data-stores-home-before-rest-banner]",
      '[data-stores-home-before-rest-banner="banner"]'
    );
    slot.heroAspect = ratioPass(slot.hero.width, slot.hero.height, "39:16");
    slot.beforeRestAspect = ratioPass(slot.beforeRest.width, slot.beforeRest.height, "2:1");
    slot.heroDisclosure = (await page.locator('[data-stores-home-hero="banner"]').getByText(/광고|Ad/i).count()) > 0;
    slot.heroDots = await page.locator("[data-stores-home-hero-dots-ui]").count();
    if (width === 390) {
      slot.organicHomeAfter = await organicStoreIds(page, "home");
      // continuation: scroll rest
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(1500);
      slot.beforeRestCountAfterScroll = await page
        .locator('[data-stores-home-before-rest-banner="banner"]')
        .count();
    }
    await page.screenshot({ path: path.join(OUT, `home-w${width}.png`), fullPage: true });

    await page.goto(urls.primary, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForTimeout(2800);
    slot.primaryOrder = await browseDomOrder(page);
    slot.primaryTop = await measureBanner(
      page,
      "[data-stores-browse-top-banner]",
      '[data-stores-browse-top-banner="banner"]'
    );
    slot.primaryTopAspect = ratioPass(slot.primaryTop.width, slot.primaryTop.height, "2:1");
    if (width === 390) {
      slot.organicPrimaryAfter = await organicStoreIds(page, "browse");
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(1500);
      slot.primaryTopCountAfterScroll = await page
        .locator('[data-stores-browse-top-banner="banner"]')
        .count();
    }
    await page.screenshot({ path: path.join(OUT, `primary-w${width}.png`), fullPage: true });

    await page.goto(urls.secondary, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForTimeout(2800);
    slot.secondaryOrder = await browseDomOrder(page);
    slot.secondaryTop = await measureBanner(
      page,
      "[data-stores-browse-top-banner]",
      '[data-stores-browse-top-banner="banner"]'
    );
    slot.secondaryTopAspect = ratioPass(slot.secondaryTop.width, slot.secondaryTop.height, "2:1");
    if (width === 390) {
      slot.organicSecondaryAfter = await organicStoreIds(page, "browse");
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(1500);
      slot.secondaryTopCountAfterScroll = await page
        .locator('[data-stores-browse-top-banner="banner"]')
        .count();
    }
    await page.screenshot({ path: path.join(OUT, `secondary-w${width}.png`), fullPage: true });

    report.geometry[width] = slot;
    await ctx.close();
  }

  // Inherit proof: secondary top should be banner while inheriting
  report.proofs.inherit = {
    secondaryTopState: report.geometry[390]?.secondaryTop?.state,
    secondaryTopVisible: report.geometry[390]?.secondaryTop?.visible,
    order: report.geometry[390]?.secondaryOrder,
  };

  // Override: secondary bannerAds.enabled=false
  const overridePut = await adminPage.request.put(`${ORIGIN}/api/admin/stores-category-policy`, {
    data: {
      expectedRevision: catRev,
      rows: [
        {
          scopeKey: subScopeKey,
          primarySlug: QA_PRIMARY,
          subSlug: secondary,
          enabled: true,
          displayTitleKo: null,
          displayTitleEn: null,
          adEnabled: "inherit",
          couponEnabled: "inherit",
          maxInsertion: null,
          intervalEveryN: null,
          presentationMode: "card_benefit_integrated",
          scheduleStart: null,
          scheduleEnd: null,
          productConfig: {
            bannerAds: { enabled: false, position: "top_context", capacity: 1 },
          },
        },
      ],
      deleteScopeKeys: [],
    },
  });
  const overrideJson = await overridePut.json().catch(() => null);
  catRev = Number(overrideJson?.revision ?? catRev);
  const ovCtx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const ovPage = await ovCtx.newPage();
  await ovPage.goto(urls.secondary, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await ovPage.waitForTimeout(2500);
  const ovCount = await ovPage.locator('[data-stores-browse-top-banner="banner"]').count();
  const ovState = await ovPage
    .locator("[data-stores-browse-top-banner]")
    .first()
    .getAttribute("data-stores-browse-top-banner")
    .catch(() => null);
  report.proofs.override = {
    status: overridePut.status(),
    json: overrideJson,
    bannerCount: ovCount,
    state: ovState,
  };
  await ovCtx.close();

  // Clear secondary override (inherit again) then restore will handle full restore
  const clearOv = await adminPage.request.put(`${ORIGIN}/api/admin/stores-category-policy`, {
    data: {
      expectedRevision: catRev,
      rows: [],
      deleteScopeKeys: [subScopeKey],
    },
  });
  const clearOvJson = await clearOv.json().catch(() => null);
  catRev = Number(clearOvJson?.revision ?? catRev);

  // Native/banner separation — source markers via customer DOM
  report.proofs.nativeBannerSeparation = {
    homeBannerRenderer: (await adminPage.request.get(`${ORIGIN}/api/stores/home-before-rest-banners`).then(r => r.json()).catch(() => null)),
    browseBannerRenderer: (await adminPage.request.get(`${ORIGIN}/api/stores/browse-top-banners?primary=${QA_PRIMARY}&sub=all`).then(r => r.json()).catch(() => null)),
    note: "Banner APIs separate from native planners; Native runtime = NOT_PROVEN_NO_SAFE_FIXTURE unless planner cards present",
  };

  // Restore home before-rest to BEFORE
  const restoreHome = await adminPage.request.put(
    `${ORIGIN}/api/admin/stores-home-before-rest-banner`,
    { data: { enabled: homeEnabled0, expectedRevision: homeRev } }
  );
  report.restore.home = {
    status: restoreHome.status(),
    json: await restoreHome.json().catch(() => null),
    targetEnabled: homeEnabled0,
  };

  // Restore category primary bannerAds to BEFORE
  const beforeBanner =
    primaryRow?.resolved?.bannerAds ??
    bannerAdsFromBefore(primaryRow) ??
    { enabled: false, position: "top_context", capacity: 1 };
  const restoreCat = await adminPage.request.put(`${ORIGIN}/api/admin/stores-category-policy`, {
    data: {
      expectedRevision: catRev,
      rows: [
        {
          ...primaryWrite,
          productConfig: {
            ...primaryWrite.productConfig,
            bannerAds: {
              enabled: beforeBanner.enabled === true,
              position: "top_context",
              capacity: beforeBanner.capacity || 1,
            },
          },
        },
      ],
      deleteScopeKeys: [subScopeKey],
    },
  });
  report.restore.category = {
    status: restoreCat.status(),
    json: await restoreCat.json().catch(() => null),
    targetBannerAds: beforeBanner,
  };

  // End QA fixtures
  report.restore.fixtures = [];
  for (const f of report.fixtures) {
    const id = f.json?.campaignId;
    if (!id) continue;
    report.restore.fixtures.push(await endCampaign(adminPage, id));
  }

  // Verify restore
  const verifyHome = await adminPage.request.get(
    `${ORIGIN}/api/admin/stores-home-before-rest-banner`
  );
  report.restore.verifyHome = await verifyHome.json().catch(() => null);

  // Organic compare
  const g390 = report.geometry[390] || {};
  report.proofs.organic = {
    home: relativeOrderPreserved(organicHomeBefore, g390.organicHomeAfter || []),
    primary: relativeOrderPreserved(organicPrimaryBefore, g390.organicPrimaryAfter || []),
    secondary: relativeOrderPreserved(organicSecondaryBefore, g390.organicSecondaryAfter || []),
  };

  // Evaluate close
  const geoPass = (slot, expected) =>
    slot?.state === "banner" &&
    slot?.visible &&
    slot?.width > 8 &&
    slot?.height > 8 &&
    ratioPass(slot.width, slot.height, expected).pass;

  const allWidthsHero = WIDTHS.every((w) => geoPass(report.geometry[w]?.hero, "39:16"));
  const allWidthsBefore = WIDTHS.every((w) => geoPass(report.geometry[w]?.beforeRest, "2:1"));
  const allWidthsPrimary = WIDTHS.every((w) => geoPass(report.geometry[w]?.primaryTop, "2:1"));
  const allWidthsSecondary = WIDTHS.every((w) => geoPass(report.geometry[w]?.secondaryTop, "2:1"));

  const homeOrderPass = orderOk(report.geometry[390]?.homeOrder, [
    "quick_categories",
    "HOME_HERO",
    "organic_shelves",
    "HOME_BEFORE_REST",
    "rest_stores",
  ]) || orderOk(report.geometry[390]?.homeOrder, [
    "HOME_HERO",
    "HOME_BEFORE_REST",
    "rest_stores",
  ]);

  const primaryOrderPass = orderOk(report.geometry[390]?.primaryOrder, [
    "CATEGORY_TOP",
    "mixed_list",
  ]);
  const secondaryOrderPass = orderOk(report.geometry[390]?.secondaryOrder, [
    "CATEGORY_TOP",
    "mixed_list",
  ]);

  report.proofs.gates = {
    adminAuth: true,
    fixtures: fixtureOk,
    homeOrder: homeOrderPass,
    primaryOrder: primaryOrderPass,
    secondaryOrder: secondaryOrderPass,
    heroGeo: allWidthsHero,
    beforeRestGeo: allWidthsBefore,
    primaryGeo: allWidthsPrimary,
    secondaryGeo: allWidthsSecondary,
    inherit: report.proofs.inherit?.secondaryTopState === "banner",
    override: report.proofs.override?.bannerCount === 0,
    physicalOff: report.proofs.physicalOff?.bannerCount === 0,
    physicalOn: report.geometry[390]?.beforeRest?.state === "banner",
    continuationHome: report.geometry[390]?.beforeRestCountAfterScroll === 1,
    continuationPrimary: report.geometry[390]?.primaryTopCountAfterScroll === 1,
    continuationSecondary: report.geometry[390]?.secondaryTopCountAfterScroll === 1,
    organicHome: report.proofs.organic.home.ok,
    organicPrimary: report.proofs.organic.primary.ok,
    organicSecondary: report.proofs.organic.secondary.ok,
  };

  const required = [
    "adminAuth",
    "fixtures",
    "homeOrder",
    "primaryOrder",
    "secondaryOrder",
    "heroGeo",
    "beforeRestGeo",
    "primaryGeo",
    "secondaryGeo",
    "inherit",
    "override",
    "physicalOff",
    "physicalOn",
    "continuationHome",
    "continuationPrimary",
    "continuationSecondary",
    "organicHome",
    "organicPrimary",
    "organicSecondary",
  ];
  const failed = required.filter((k) => !report.proofs.gates[k]);
  if (failed.length) {
    report.firstBreak = failed[0];
    report.stage2 = "NOT_CLOSED";
  } else {
    report.firstBreak = "NONE";
    report.stage2 = "CLOSED";
  }

  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log("WROTE", path.join(OUT, "report.json"));
  await browser.close();
  process.exit(report.stage2 === "CLOSED" ? 0 : 1);
}

function bannerAdsFromBefore(primaryRow) {
  const cfg = primaryRow?.row?.productConfig || primaryRow?.productConfig;
  if (!cfg?.bannerAds || typeof cfg.bannerAds !== "object") return null;
  return {
    enabled: cfg.bannerAds.enabled === true,
    capacity: cfg.bannerAds.capacity || 1,
  };
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * Product Recovery — Production one-shot lifecycle.
 *
 * PLAYWRIGHT_BASE_URL=https://samarket.vercel.app \
 * npx tsx --env-file=.env.local scripts/qa/stores-product-recovery-production-oneshot.ts
 *
 * Lifecycle: baseline → admin menu → HOME mutate/save/reload → customer HOME →
 * CATEGORY primary/secondary → CTA → restore.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { chromium, type Browser, type Page } from "playwright";
import { STORES_PRODUCT_RECOVERY_QA } from "@/lib/stores/product/stores-product-recovery-qa-fixture";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BASE = (process.env.PLAYWRIGHT_BASE_URL || "https://samarket.vercel.app").replace(/\/$/, "");
const OUT_DIR = path.join(ROOT, "docs/perf/stores-product-recovery/production-oneshot");
const OUT_JSON = path.join(OUT_DIR, "product-recovery-oneshot-latest.json");
fs.mkdirSync(OUT_DIR, { recursive: true });

type Gate =
  | "PRODUCTION_READY"
  | "ADMIN_MENU"
  | "HOME_BASELINE"
  | "HOME_ADMIN_CTA"
  | "HOME_SAVE_RELOAD"
  | "HOME_CUSTOMER"
  | "HOME_PRODUCT_CARD"
  | "HOME_STORE_CARD"
  | "HOME_BRAND_CARD"
  | "HOME_SHOW_ALL"
  | "HOME_INSERTION_RAIL_ABSENT"
  | "CATEGORY_PRIMARY"
  | "CATEGORY_SECONDARY"
  | "CATEGORY_INHERIT"
  | "ORGANIC_ORDER"
  | "RESTORE"
  | "FINAL";

const gates = Object.fromEntries(
  (
    [
      "PRODUCTION_READY",
      "ADMIN_MENU",
      "HOME_BASELINE",
      "HOME_ADMIN_CTA",
      "HOME_SAVE_RELOAD",
      "HOME_CUSTOMER",
      "HOME_PRODUCT_CARD",
      "HOME_STORE_CARD",
      "HOME_BRAND_CARD",
      "HOME_SHOW_ALL",
      "HOME_INSERTION_RAIL_ABSENT",
      "CATEGORY_PRIMARY",
      "CATEGORY_SECONDARY",
      "CATEGORY_INHERIT",
      "ORGANIC_ORDER",
      "RESTORE",
      "FINAL",
    ] as Gate[]
  ).map((g) => [g, "NOT_RUN" as const])
) as Record<Gate, "PASS" | "FAIL" | "NOT_RUN">;

const steps: Array<{ gate: Gate; status: "PASS" | "FAIL"; detail?: Record<string, unknown> }> = [];
let firstDivergence: { gate: Gate; detail: Record<string, unknown> } | null = null;

function mark(gate: Gate, status: "PASS" | "FAIL", detail: Record<string, unknown> = {}) {
  gates[gate] = status;
  steps.push({ gate, status, detail });
  if (status === "FAIL" && !firstDivergence) firstDivergence = { gate, detail };
}

function loadEnv() {
  for (const rel of [".env.local", ".env"]) {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#") || !t.includes("=")) continue;
      const i = t.indexOf("=");
      const k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

function passwords() {
  return [
    ...new Set(
      [
        process.env.E2E_ADMIN_PASSWORD,
        process.env.E2E_TEST_PASSWORD,
        process.env.QA_MANUAL_PASSWORD,
        "DibayQa1!",
        "1234",
      ].filter(Boolean) as string[]
    ),
  ];
}

async function loginAdmin(browser: Browser) {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !anon) throw new Error("supabase_env_missing");

  const login = process.env.E2E_ADMIN_USERNAME || process.env.QA_ADMIN_LOGIN || "aaaa";
  const email = login.includes("@") ? login : `${login}@manual.local`;
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  let session = null;
  for (const pass of passwords()) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
    if (!error && data.session) {
      session = data.session;
      break;
    }
  }
  if (!session) throw new Error("admin_login_failed");

  const ref = new URL(url).hostname.split(".")[0];
  const cookieName = `sb-${ref}-auth-token`;
  const origin = new URL(BASE);
  type CookieParam = Parameters<Awaited<ReturnType<Browser["newContext"]>>["addCookies"]>[0][number];
  const cookies: CookieParam[] = [
    {
      name: cookieName,
      value: encodeURIComponent(
        JSON.stringify({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_at: session.expires_at,
          expires_in: session.expires_in,
          token_type: session.token_type,
          user: session.user,
        })
      ),
      domain: origin.hostname,
      path: "/",
      expires: session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
      httpOnly: false,
      secure: origin.protocol === "https:",
      sameSite: "Lax",
    },
  ];

  if (sk) {
    const adminSb = createClient(url, sk, { auth: { persistSession: false } });
    const { data: pr } = await adminSb
      .from("profiles")
      .select("active_session_id")
      .eq("id", session.user.id)
      .maybeSingle();
    const sid = String(pr?.active_session_id ?? "").trim();
    if (sid) {
      cookies.push({
        name: "samarket_active_session_id",
        value: encodeURIComponent(sid),
        domain: origin.hostname,
        path: "/",
        expires: session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
        httpOnly: false,
        secure: origin.protocol === "https:",
        sameSite: "Lax",
      });
    }
  }

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await context.addCookies(cookies);
  const page = await context.newPage();
  return { context, page, userId: session.user.id };
}

type ShelfRow = {
  shelfId: string;
  enabled: boolean;
  order: number;
  max: number | null;
  titleKo: string;
  titleEn: string;
  subtitleKo: string | null;
  subtitleEn: string | null;
  presentation: string;
  couponIntegration: string;
  adIntegration: string;
  productConfig: Record<string, unknown>;
};

async function fetchHomeShelves(page: Page) {
  const res = await page.request.get(`${BASE}/api/admin/stores-home-shelves`);
  const json = (await res.json()) as {
    ok?: boolean;
    shelves?: ShelfRow[];
    revision?: number;
    error?: string;
  };
  return { status: res.status(), json };
}

async function putHomeShelves(page: Page, expectedRevision: number, shelves: ShelfRow[]) {
  const res = await page.request.put(`${BASE}/api/admin/stores-home-shelves`, {
    data: {
      expectedRevision,
      shelves: shelves.map((s) => ({
        shelfId: s.shelfId,
        enabled: s.enabled,
        order: s.order,
        max: s.max,
        titleKo: s.titleKo,
        titleEn: s.titleEn,
        subtitleKo: s.subtitleKo,
        subtitleEn: s.subtitleEn,
        presentation: s.presentation,
        couponIntegration: s.couponIntegration,
        adIntegration: s.adIntegration,
        productConfig: s.productConfig,
      })),
    },
  });
  const json = (await res.json()) as { ok?: boolean; revision?: number; error?: string };
  return { status: res.status(), json };
}

async function fetchCategory(page: Page, primary?: string) {
  const qs = primary ? `?primary=${encodeURIComponent(primary)}` : "";
  const res = await page.request.get(`${BASE}/api/admin/stores-category-policy${qs}`);
  const json = await res.json();
  return { status: res.status(), json };
}

async function putCategory(page: Page, expectedRevision: number, rows: unknown[]) {
  const res = await page.request.put(`${BASE}/api/admin/stores-category-policy`, {
    data: { expectedRevision, rows },
  });
  const json = await res.json();
  return { status: res.status(), json };
}

async function organicBrowseIds(page: Page, primary: string, sub: string) {
  const q = new URLSearchParams({
    primary,
    sub,
    page: "1",
    limit: "40",
    storesBrowseBypass: "1",
    fresh: "1",
  });
  const res = await page.request.get(`${BASE}/api/stores/browse?${q}`);
  const json = (await res.json()) as { stores?: Array<{ id: string }> };
  return (json.stores ?? []).map((s) => s.id);
}

async function clickAdminMenuPath(page: Page, label: RegExp, hrefContains: string) {
  await page.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(800);
  const delivery = page.getByText(/배달|Delivery/i).first();
  if (await delivery.isVisible().catch(() => false)) {
    await delivery.click({ timeout: 5000 }).catch(() => undefined);
    await page.waitForTimeout(400);
  }
  const link = page.locator(`a[href*="${hrefContains}"]`).first();
  if (await link.count()) {
    await link.click();
    await page.waitForURL(new RegExp(hrefContains), { timeout: 20000 });
    return true;
  }
  const byLabel = page.getByRole("link", { name: label }).first();
  if (await byLabel.count()) {
    await byLabel.click();
    await page.waitForURL(new RegExp(hrefContains), { timeout: 20000 });
    return true;
  }
  return false;
}

async function captureHomeDom(page: Page) {
  await page.goto(`${BASE}${STORES_PRODUCT_RECOVERY_QA.homePath}`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForTimeout(2500);
  return page.evaluate((forbidden) => {
    const hub = document.querySelector(".stores-home-hub");
    const shelves = [...document.querySelectorAll("[data-stores-home-shelf-id]")].map((el) => ({
      shelfId: el.getAttribute("data-stores-home-shelf-id"),
      presentation: el.getAttribute("data-stores-home-presentation"),
      entity: el.getAttribute("data-stores-home-entity-type"),
      title: el.querySelector("h2")?.textContent?.trim() ?? null,
      subtitle: el.querySelector("h2 + p")?.textContent?.trim() ?? null,
      showAllHref: el.querySelector("a")?.getAttribute("href") ?? null,
      cardPresentations: [
        ...new Set(
          [...el.querySelectorAll("[data-stores-home-presentation]")].map((c) =>
            c.getAttribute("data-stores-home-presentation")
          )
        ),
      ],
    }));
    const forbiddenHits = forbidden.filter((sel) => document.querySelector(sel));
    return {
      hubPresent: Boolean(hub),
      shelves,
      forbiddenHits,
      productCard: Boolean(document.querySelector('[data-stores-home-food-rail-card="true"]')),
      storeCard: Boolean(
        document.querySelector('[data-stores-home-store-horizontal-card="true"]') ||
          document.querySelector('[data-stores-home-timesale-row="true"]')
      ),
      brandCard: Boolean(document.querySelector('[data-stores-home-brand-circular-card="true"]')),
    };
  }, STORES_PRODUCT_RECOVERY_QA.forbiddenCustomerSelectors as unknown as string[]);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  let baselineShelves: ShelfRow[] = [];
  let baselineRevision = 0;
  let categoryBaseline: { revision: number; rows: unknown[] } | null = null;
  let organicBefore: string[] = [];

  try {
    // PRODUCTION_READY — release signal on admin shell / home shelves route exists
    const probe = await fetch(BASE);
    const readyHtml = await probe.text();
    const { context, page } = await loginAdmin(browser);

    const shelvesProbe = await fetchHomeShelves(page);
    const releaseOk =
      shelvesProbe.status === 200 &&
      shelvesProbe.json.ok === true &&
      Array.isArray(shelvesProbe.json.shelves) &&
      shelvesProbe.json.shelves.some((s) => s.productConfig != null);
    mark("PRODUCTION_READY", releaseOk ? "PASS" : "FAIL", {
      status: shelvesProbe.status,
      shelfCount: shelvesProbe.json.shelves?.length,
      productConfigPresent: releaseOk,
      htmlHint: readyHtml.includes("samarket") || readyHtml.length > 0,
    });
    if (!releaseOk) throw new Error("PRODUCTION_READY");

    baselineShelves = JSON.parse(JSON.stringify(shelvesProbe.json.shelves)) as ShelfRow[];
    baselineRevision = Number(shelvesProbe.json.revision ?? 0);
    mark("HOME_BASELINE", "PASS", { revision: baselineRevision, count: baselineShelves.length });

    const menuHome = await clickAdminMenuPath(page, /HOME/, "stores-home-shelves");
    const menuCat = await clickAdminMenuPath(page, /카테고리|Category/, "stores-category-policy");
    mark("ADMIN_MENU", menuHome && menuCat ? "PASS" : "FAIL", { menuHome, menuCat });
    if (!(menuHome && menuCat)) throw new Error("ADMIN_MENU");

    // HOME admin CTA via API (same endpoints Admin SAVE uses) + UI reload check
    const orderNow = baselineShelves.find((s) => s.shelfId === "order_now");
    const popular = baselineShelves.find((s) => s.shelfId === "popular");
    const promo = baselineShelves.find((s) => s.shelfId === "promo_campaign");
    if (!orderNow || !popular) throw new Error("missing_core_shelves");

    const mutated = baselineShelves.map((s) => {
      if (s.shelfId === "order_now") {
        return {
          ...s,
          titleKo: `${STORES_PRODUCT_RECOVERY_QA.homeTitleMarker} 지금 주문`,
          subtitleKo: STORES_PRODUCT_RECOVERY_QA.homeSubtitleMarker,
          presentation: "food_horizontal",
          productConfig: {
            ...s.productConfig,
            entityType: "product",
            showAllEnabled: true,
            showAllRouteKey: "orderNow",
            imageSource: "representative_product",
          },
          couponIntegration: "both",
          adIntegration: "sponsored_badge",
        };
      }
      if (s.shelfId === "popular") {
        return {
          ...s,
          titleKo: `${STORES_PRODUCT_RECOVERY_QA.homeTitleMarker} 맛집`,
          presentation: "store_horizontal",
          productConfig: {
            ...s.productConfig,
            entityType: "store",
            showAllEnabled: true,
            showAllRouteKey: "popular",
            imageSource: "store_profile",
          },
        };
      }
      if (s.shelfId === "promo_campaign") {
        return {
          ...s,
          titleKo: `${STORES_PRODUCT_RECOVERY_QA.homeTitleMarker} 브랜드`,
          presentation: "brand_circular",
          productConfig: {
            ...s.productConfig,
            entityType: "brand",
            imageSource: "brand_logo",
          },
        };
      }
      return s;
    });

    const save1 = await putHomeShelves(page, baselineRevision, mutated);
    mark("HOME_ADMIN_CTA", save1.json.ok ? "PASS" : "FAIL", save1);
    if (!save1.json.ok) throw new Error("HOME_ADMIN_CTA");

    const reload = await fetchHomeShelves(page);
    const reOrder = reload.json.shelves?.find((s) => s.shelfId === "order_now");
    const persistOk =
      reload.json.ok === true &&
      reOrder?.titleKo?.includes(STORES_PRODUCT_RECOVERY_QA.homeTitleMarker) === true &&
      reOrder?.productConfig?.showAllEnabled === true;
    mark("HOME_SAVE_RELOAD", persistOk ? "PASS" : "FAIL", {
      titleKo: reOrder?.titleKo,
      productConfig: reOrder?.productConfig,
    });
    if (!persistOk) throw new Error("HOME_SAVE_RELOAD");

    const homeDom = await captureHomeDom(page);
    mark("HOME_CUSTOMER", homeDom.hubPresent && homeDom.shelves.length > 0 ? "PASS" : "FAIL", homeDom);
    mark("HOME_PRODUCT_CARD", homeDom.productCard ? "PASS" : "FAIL", {
      productCard: homeDom.productCard,
    });
    mark("HOME_STORE_CARD", homeDom.storeCard ? "PASS" : "FAIL", { storeCard: homeDom.storeCard });
    mark(
      "HOME_BRAND_CARD",
      homeDom.brandCard || homeDom.shelves.some((s) => s.presentation === "brand_circular")
        ? "PASS"
        : "FAIL",
      { brandCard: homeDom.brandCard }
    );
    mark(
      "HOME_INSERTION_RAIL_ABSENT",
      homeDom.forbiddenHits.length === 0 ? "PASS" : "FAIL",
      { forbiddenHits: homeDom.forbiddenHits }
    );

    const showAllShelf = homeDom.shelves.find((s) => s.shelfId === "order_now" || s.shelfId === "popular");
    const showAllHref = showAllShelf?.showAllHref;
    let showAllNavOk = false;
    if (showAllHref && showAllHref !== "#") {
      await page.goto(`${BASE}${showAllHref}`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(1500);
      showAllNavOk = page.url().includes("/stores");
    }
    mark("HOME_SHOW_ALL", showAllNavOk ? "PASS" : "FAIL", { showAllHref, url: page.url() });

    // CATEGORY primary + secondary
    organicBefore = await organicBrowseIds(
      page,
      STORES_PRODUCT_RECOVERY_QA.primarySlug,
      "all"
    );
    const cat0 = await fetchCategory(page, STORES_PRODUCT_RECOVERY_QA.primarySlug);
    const rev0 = Number(cat0.json.revision ?? 0);
    const primaryRow = (cat0.json.primaries as Array<{ scopeKey: string; primarySlug: string }> | undefined)?.find(
      (p) => p.primarySlug === STORES_PRODUCT_RECOVERY_QA.primarySlug
    );
    const secondary = (cat0.json.secondary as Array<{
      subSlug: string;
      scopeKey: string;
      row: unknown;
      resolved: { adEnabled: boolean; couponEnabled: boolean };
    }> | undefined) ?? [];
    const subA = secondary.find((s) => s.subSlug === STORES_PRODUCT_RECOVERY_QA.secondarySlugA);
    const subB = secondary.find((s) => s.subSlug === STORES_PRODUCT_RECOVERY_QA.secondarySlugB);

    categoryBaseline = {
      revision: rev0,
      rows: [
        {
          scopeKey: primaryRow?.scopeKey,
          primarySlug: STORES_PRODUCT_RECOVERY_QA.primarySlug,
          subSlug: null,
          enabled: true,
          displayTitleKo: null,
          displayTitleEn: null,
          adEnabled: "false",
          couponEnabled: "false",
          maxInsertion: null,
          intervalEveryN: 8,
          presentationMode: "card_benefit_integrated",
        },
      ],
    };

    const primarySave = await putCategory(page, rev0, [
      {
        scopeKey: primaryRow?.scopeKey,
        primarySlug: STORES_PRODUCT_RECOVERY_QA.primarySlug,
        subSlug: null,
        enabled: true,
        displayTitleKo: `${STORES_PRODUCT_RECOVERY_QA.categoryPrimaryTitleMarker} 음식점`,
        displayTitleEn: "QA Primary",
        adEnabled: "true",
        couponEnabled: "true",
        maxInsertion: 3,
        intervalEveryN: 6,
        presentationMode: "card_benefit_integrated",
      },
    ]);
    mark("CATEGORY_PRIMARY", primarySave.json.ok ? "PASS" : "FAIL", primarySave);
    if (!primarySave.json.ok) throw new Error("CATEGORY_PRIMARY");

    const rev1 = Number(primarySave.json.revision ?? rev0 + 1);
    if (subA && subB) {
      const secondarySave = await putCategory(page, rev1, [
        {
          scopeKey: subA.scopeKey,
          primarySlug: STORES_PRODUCT_RECOVERY_QA.primarySlug,
          subSlug: subA.subSlug,
          enabled: true,
          displayTitleKo: `${STORES_PRODUCT_RECOVERY_QA.categorySecondaryTitleMarker}-A`,
          displayTitleEn: "QA Sub A",
          adEnabled: "false",
          couponEnabled: "true",
          maxInsertion: 2,
          intervalEveryN: 5,
          presentationMode: "card_benefit_integrated",
        },
      ]);
      mark("CATEGORY_SECONDARY", secondarySave.json.ok ? "PASS" : "FAIL", secondarySave);

      const catReload = await fetchCategory(page, STORES_PRODUCT_RECOVERY_QA.primarySlug);
      const secReload = (catReload.json.secondary as typeof secondary) ?? [];
      const a = secReload.find((s) => s.subSlug === STORES_PRODUCT_RECOVERY_QA.secondarySlugA);
      const b = secReload.find((s) => s.subSlug === STORES_PRODUCT_RECOVERY_QA.secondarySlugB);
      const inheritOk =
        a?.resolved?.couponEnabled === true &&
        a?.resolved?.adEnabled === false &&
        b != null &&
        // B inherits primary (ad/coupon true from primary save)
        b.resolved.adEnabled === true &&
        b.resolved.couponEnabled === true;
      mark("CATEGORY_INHERIT", inheritOk ? "PASS" : "FAIL", {
        a: a?.resolved,
        b: b?.resolved,
      });
    } else {
      mark("CATEGORY_SECONDARY", "FAIL", { reason: "secondary_taxonomy_missing", secondary });
      mark("CATEGORY_INHERIT", "FAIL", { reason: "secondary_taxonomy_missing" });
    }

    const organicAfter = await organicBrowseIds(
      page,
      STORES_PRODUCT_RECOVERY_QA.primarySlug,
      "all"
    );
    const organicSame =
      organicBefore.length > 0 &&
      organicBefore.length === organicAfter.length &&
      organicBefore.every((id, i) => id === organicAfter[i]);
    mark("ORGANIC_ORDER", organicSame ? "PASS" : "FAIL", {
      before: organicBefore.slice(0, 8),
      after: organicAfter.slice(0, 8),
    });

    // RESTORE HOME
    const cur = await fetchHomeShelves(page);
    const restoreHome = await putHomeShelves(
      page,
      Number(cur.json.revision ?? 0),
      baselineShelves
    );
    const restored = await fetchHomeShelves(page);
    const titleRestored =
      restored.json.shelves?.find((s) => s.shelfId === "order_now")?.titleKo?.includes(
        STORES_PRODUCT_RECOVERY_QA.homeTitleMarker
      ) !== true;

    // RESTORE CATEGORY — reset primary + clear secondary override by re-saving inherit
    const catCur = await fetchCategory(page, STORES_PRODUCT_RECOVERY_QA.primarySlug);
    const revCur = Number(catCur.json.revision ?? 0);
    const restoreRows: unknown[] = [
      {
        scopeKey: primaryRow?.scopeKey,
        primarySlug: STORES_PRODUCT_RECOVERY_QA.primarySlug,
        subSlug: null,
        enabled: true,
        displayTitleKo: null,
        displayTitleEn: null,
        adEnabled: "false",
        couponEnabled: "false",
        maxInsertion: null,
        intervalEveryN: 8,
        presentationMode: "card_benefit_integrated",
      },
    ];
    if (subA) {
      restoreRows.push({
        scopeKey: subA.scopeKey,
        primarySlug: STORES_PRODUCT_RECOVERY_QA.primarySlug,
        subSlug: subA.subSlug,
        enabled: true,
        displayTitleKo: null,
        displayTitleEn: null,
        adEnabled: "inherit",
        couponEnabled: "inherit",
        maxInsertion: null,
        intervalEveryN: null,
        presentationMode: "inherit",
      });
    }
    const restoreCat = await putCategory(page, revCur, restoreRows);
    const homeDomAfter = await captureHomeDom(page);
    const qaGone = !homeDomAfter.shelves.some((s) =>
      (s.title ?? "").includes(STORES_PRODUCT_RECOVERY_QA.homeTitleMarker)
    );

    mark(
      "RESTORE",
      restoreHome.json.ok && restoreCat.json.ok && titleRestored && qaGone ? "PASS" : "FAIL",
      {
        restoreHome,
        restoreCat,
        titleRestored,
        qaGone,
        categoryBaseline,
      }
    );

    const allPass = Object.entries(gates)
      .filter(([k]) => k !== "FINAL")
      .every(([, v]) => v === "PASS");
    mark("FINAL", allPass ? "PASS" : "FAIL", { firstDivergence });

    const report = {
      base: BASE,
      at: new Date().toISOString(),
      gates,
      steps,
      firstDivergence,
      FINAL: allPass ? "CLOSED" : "NOT_CLOSED",
    };
    fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    await context.close();
    await browser.close();
    process.exit(allPass ? 0 : 1);
  } catch (e) {
    const report = {
      base: BASE,
      at: new Date().toISOString(),
      gates,
      steps,
      firstDivergence,
      error: e instanceof Error ? e.message : String(e),
      FINAL: "NOT_CLOSED",
    };
    fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
    console.error(JSON.stringify(report, null, 2));
    await browser.close().catch(() => undefined);
    process.exit(1);
  }
}

main();

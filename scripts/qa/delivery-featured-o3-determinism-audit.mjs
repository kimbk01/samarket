/**
 * Featured O3 reservation determinism audit.
 * Clean consecutive featured entries — prove PASS vs -232 vs +13 divergence.
 *
 * PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 \
 * PHONE_RUNS=10 TABLET_RUNS=5 \
 * node scripts/qa/delivery-featured-o3-determinism-audit.mjs
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const OUT_DIR = resolve("docs/perf/delivery-owner-ux-audit");
mkdirSync(OUT_DIR, { recursive: true });

const PHONE = { width: 390, height: 844 };
const TABLET = { width: 820, height: 1180 };
const PHONE_RUNS = Number(process.env.PHONE_RUNS || 10);
const TABLET_RUNS = Number(process.env.TABLET_RUNS || 5);
const TOL = 8;

function baseHead() {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

async function warmStoreRoute(page) {
  /** Cold Next compile of /stores/[slug] — not product flake; discard once. */
  await page.goto(`${ORIGIN}/stores/browse/restaurant?sub=korean`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await page.waitForTimeout(2000);
  const ok = await page
    .waitForFunction(
      () =>
        [...document.querySelectorAll("button")].some((b) =>
          /KIMBAP/i.test(b.getAttribute("aria-label") || "")
        ),
      { timeout: 60000 }
    )
    .then(() => true)
    .catch(() => false);
  if (!ok) return false;
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((el) =>
      /KIMBAP/i.test(el.getAttribute("aria-label") || "")
    );
    btn?.scrollIntoView({ block: "center" });
    btn?.click();
  });
  await page
    .waitForFunction(() => !location.pathname.includes("/browse"), { timeout: 90000 })
    .catch(() => null);
  await page.waitForTimeout(1500);
  return true;
}

async function runOnce(page, role) {
  await page.goto(`${ORIGIN}/stores/browse/restaurant?sub=korean`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await page.waitForTimeout(2000);
  const hasTarget = await page
    .waitForFunction(
      () =>
        [...document.querySelectorAll("button")].some((b) =>
          /KIMBAP/i.test(b.getAttribute("aria-label") || "")
        ),
      { timeout: 60000 }
    )
    .then(() => true)
    .catch(() => false);
  if (!hasTarget) return { ok: false, reason: "no_kimbap_target", deviceRole: role };

  return page.evaluate(async (deviceRole) => {
    const TOL_INNER = 8;

    const scrollRootEl = () =>
      document.querySelector("[data-main-hub-scroll-body]") ||
      document.querySelector("main") ||
      document.documentElement;

    const o3Dom = () => {
      const el = document.querySelector("[data-o3-effective-collapse]");
      if (!el) return null;
      return {
        live: el.getAttribute("data-o3-live-collapse"),
        pinned: el.getAttribute("data-o3-pinned-collapse"),
        effective: el.getAttribute("data-o3-effective-collapse"),
        chrome: el.getAttribute("data-o3-chrome-active"),
        featuredReady: el.getAttribute("data-store-featured-entry-ready"),
      };
    };

    const summaryHeight = () => {
      const panel = document.querySelector("#store-menu-panel");
      const summary = panel?.previousElementSibling;
      if (!(summary instanceof HTMLElement)) return null;
      return Math.round(summary.getBoundingClientRect().height * 1000) / 1000;
    };

    const fulfillmentExists = () =>
      !!document.querySelector("[data-store-fulfillment-card]");

    const snapGeo = (productId) => {
      const scrollRoot = scrollRootEl();
      const rootRect = scrollRoot?.getBoundingClientRect?.() ?? { top: 0 };
      const pinnedTabs = document.querySelector('[data-store-category-tabs="pinned"]');
      const flowTabs = document.querySelector('[data-store-category-tabs="flow"]');
      const tabs = pinnedTabs ?? flowTabs;
      const tabsRect = tabs?.getBoundingClientRect();
      const product = productId
        ? document.getElementById(`store-menu-product-${productId}`)
        : null;
      const sec = product?.closest('[id^="store-sec-"]');
      const h3 = sec?.querySelector("h3");
      const h3Rect = h3?.getBoundingClientRect();
      const productRect = product?.getBoundingClientRect();
      const pinSpacer = document.querySelector('[data-store-focus-pin-spacer="1"]');
      const headerHVar = getComputedStyle(document.documentElement).getPropertyValue(
        "--delivery-header-h"
      );
      const safeProbe = getComputedStyle(document.documentElement).getPropertyValue("--safe-top");
      const headerEl =
        document.querySelector('[data-delivery-store-chrome-host="1"]')?.querySelector("header") ||
        document.querySelector("[data-delivery-surface='store'] header");
      const headerRect = headerEl?.getBoundingClientRect();
      const scrollTop = scrollRoot instanceof HTMLElement ? scrollRoot.scrollTop : 0;
      const headerOffset =
        (headerRect?.bottom ?? 0) > 0
          ? Math.round(headerRect.bottom)
          : parseFloat(headerHVar || "48");
      const tabsBottomFinal =
        pinnedTabs && tabsRect ? tabsRect.bottom : headerOffset + Math.max(48, tabsRect?.height ?? 48);
      const vv = window.visualViewport;
      return {
        scrollTop,
        categoryTop: h3Rect?.top ?? null,
        categoryDelta: h3Rect?.top != null ? h3Rect.top - tabsBottomFinal : null,
        productGap:
          h3Rect && productRect ? productRect.top - h3Rect.bottom : null,
        tabsBottomFinal,
        tabsHeight: tabsRect?.height ?? null,
        headerBottom: headerRect?.bottom ?? null,
        pinSpacerHeight: pinSpacer?.getBoundingClientRect().height ?? null,
        safeTop: safeProbe,
        headerHeightVar: headerHVar,
        visualViewportOffsetTop: vv?.offsetTop ?? null,
        summaryHeight: summaryHeight(),
        fulfillmentExists: fulfillmentExists(),
        o3: o3Dom(),
        phase: document
          .querySelector("[data-delivery-presentation-shell]")
          ?.getAttribute("data-delivery-slide-phase"),
        chromeActive:
          document
            .querySelector("[data-delivery-presentation-shell]")
            ?.getAttribute("data-delivery-store-chrome-active") === "1",
        absH3:
          h3 && scrollRoot instanceof HTMLElement
            ? Math.round((scrollTop + (h3Rect.top - rootRect.top)) * 1000) / 1000
            : null,
      };
    };

    const btn = [...document.querySelectorAll("button")].find((el) =>
      /KIMBAP/i.test(el.getAttribute("aria-label") || "")
    );
    if (!btn) return { ok: false, reason: "no_kimbap_target", deviceRole };

    const t0 = performance.now();
    btn.scrollIntoView({ block: "center" });
    btn.click();

    for (let attempt = 0; attempt < 240; attempt++) {
      await new Promise((r) => requestAnimationFrame(r));
      if (!location.pathname.includes("/browse")) break;
      if (attempt === 40 || attempt === 120) btn.click();
    }
    if (location.pathname.includes("/browse")) {
      return { ok: false, reason: "browse_navigation_stuck", deviceRole };
    }

    let prepareSnap = null;
    let firstSlideSnap = null;
    let idleSnap = null;
    let chromeFirstWithO3 = null;
    const phaseSnaps = [];

    for (let i = 0; i < 360; i++) {
      await new Promise((r) => requestAnimationFrame(r));
      const productId = new URLSearchParams(location.search).get("focusProduct");
      const geo = snapGeo(productId);
      const ev = window.__dibayDeliveryPresentation?.events ?? [];
      const o3Ev = window.__dibayFeaturedO3Reservation;

      const preLand = ev.filter((e) => e.name === "featuredPreLandWrite").length;
      const ready = ev.filter((e) => e.name === "featuredEntryReady").length;
      const slide = ev.filter(
        (e) => e.name === "slideStart" && e.detail?.direction === "rtl-forward"
      ).length;

      if (preLand >= 1 && ready >= 1 && !prepareSnap && geo.phase === "hold_browse") {
        prepareSnap = { t: performance.now() - t0, ...geo, preLand, ready, slide };
      }
      // READY often lands on same frame as sliding_forward — capture post-write hold OR first sliding
      if (preLand >= 1 && ready >= 1 && !prepareSnap) {
        prepareSnap = { t: performance.now() - t0, ...geo, preLand, ready, slide, note: "post_ready_any_phase" };
      }
      if (geo.phase === "sliding_forward" && !firstSlideSnap) {
        firstSlideSnap = { t: performance.now() - t0, ...geo, preLand, ready, slide };
      }
      if (geo.chromeActive && geo.o3 && !chromeFirstWithO3) {
        chromeFirstWithO3 = {
          t: performance.now() - t0,
          o3: geo.o3,
          summaryHeight: geo.summaryHeight,
          fulfillmentExists: geo.fulfillmentExists,
          categoryDelta: geo.categoryDelta,
          pinnedNull: geo.o3.pinned === "null",
          effective: geo.o3.effective,
          live: geo.o3.live,
        };
      }
      if (geo.phase === "idle_store" && !idleSnap) {
        idleSnap = { t: performance.now() - t0, ...geo, preLand, ready, slide };
      }
      if (i % 12 === 0 || geo.phase === "idle_store") {
        phaseSnaps.push({
          t: Math.round(performance.now() - t0),
          phase: geo.phase,
          categoryDelta: geo.categoryDelta,
          summaryHeight: geo.summaryHeight,
          fulfillmentExists: geo.fulfillmentExists,
          o3: geo.o3,
        });
      }
      if (idleSnap && i > 180) break;
    }

    const ev = window.__dibayDeliveryPresentation?.events ?? [];
    const o3Evidence = window.__dibayFeaturedO3Reservation ?? null;
    const preLand = ev.filter((e) => e.name === "featuredPreLandWrite");
    const ready = ev.filter((e) => e.name === "featuredEntryReady");
    const slide = ev.filter(
      (e) => e.name === "slideStart" && e.detail?.direction === "rtl-forward"
    );
    const o3Events = ev.filter((e) => e.name === "o3Reservation");
    const scrollWrites = []; // count via events only
    const postSlideWrites = 0; // approximate: not instrumenting scroll here; use ready audit parity later

    const categoryDeltaIdle = idleSnap?.categoryDelta ?? firstSlideSnap?.categoryDelta ?? null;
    const categoryDeltaSlide = firstSlideSnap?.categoryDelta ?? null;
    const categoryDeltaPrepare = prepareSnap?.categoryDelta ?? null;

    const summaryPrepare = prepareSnap?.summaryHeight ?? null;
    const summarySlide = firstSlideSnap?.summaryHeight ?? null;
    const summaryIdle = idleSnap?.summaryHeight ?? null;

    const classKind = (() => {
      if (categoryDeltaIdle == null && categoryDeltaSlide == null) return "NO_GEO";
      const d = categoryDeltaIdle ?? categoryDeltaSlide;
      if (Math.abs(d + 232) <= 20) return "FAIL_NEG232";
      if (d > TOL_INNER && d <= 20) return "DRIFT_POS13";
      if (Math.abs(d) <= TOL_INNER) return "PASS";
      return "OTHER";
    })();

    const pinBeforeChrome =
      o3Evidence?.pinBeforeChrome ??
      (() => {
        const pinEv = o3Events.find((e) => e.detail?.pinnedCollapse != null);
        const chromeEv = o3Events.find((e) => e.detail?.storeChromeActive === true);
        if (!pinEv || !chromeEv) return null;
        return pinEv.at <= chromeEv.at;
      })();

    const chromeWithPinnedNull =
      o3Evidence?.chromeWithPinnedNull === true ||
      chromeFirstWithO3?.pinnedNull === true ||
      o3Events.some(
        (e) =>
          e.detail?.storeChromeActive === true &&
          e.detail?.featuredSoftHosted === true &&
          e.detail?.pinnedCollapse == null
      );

    return {
      ok: true,
      deviceRole,
      pathname: location.pathname,
      classKind,
      preLandWriteCount: preLand.length,
      readyEmitCount: ready.length,
      slideStartCount: slide.length,
      categoryDeltaPrepare,
      categoryDeltaSlide,
      categoryDeltaIdle,
      summaryPrepare,
      summarySlide,
      summaryIdle,
      summaryDeltaPrepareToSlide:
        summaryPrepare != null && summarySlide != null ? summarySlide - summaryPrepare : null,
      productGap: idleSnap?.productGap ?? firstSlideSnap?.productGap ?? prepareSnap?.productGap,
      prepareSnap,
      firstSlideSnap,
      idleSnap,
      chromeFirstWithO3,
      pinBeforeChrome,
      chromeWithPinnedNull,
      o3Evidence,
      o3EventCount: o3Events.length,
      o3Events: o3Events.slice(-20).map((e) => ({ at: e.at, ...e.detail })),
      phaseSnaps: phaseSnaps.slice(-40),
      portalEarlyExposure: false,
      postSlideWrites,
    };
  }, role);
}

function passRow(r) {
  return (
    r.ok &&
    r.pathname?.includes("/stores/") &&
    !r.pathname?.includes("/browse") &&
    r.preLandWriteCount === 1 &&
    r.readyEmitCount === 1 &&
    r.slideStartCount === 1 &&
    r.classKind === "PASS" &&
    (r.categoryDeltaIdle == null || Math.abs(r.categoryDeltaIdle) <= TOL) &&
    (r.summaryDeltaPrepareToSlide == null || Math.abs(r.summaryDeltaPrepareToSlide) <= 2)
  );
}

function summarizeCohort(rows) {
  const kinds = {};
  for (const r of rows) {
    const k = r.classKind || r.reason || "ERR";
    kinds[k] = (kinds[k] || 0) + 1;
  }
  const passN = rows.filter(passRow).length;
  const deltas = rows.map((r) => r.categoryDeltaIdle).filter((x) => x != null);
  return {
    passN,
    total: rows.length,
    kinds,
    categoryDeltaRange:
      deltas.length > 0
        ? { min: Math.min(...deltas), max: Math.max(...deltas) }
        : null,
    chromeWithPinnedNullCount: rows.filter((r) => r.chromeWithPinnedNull).length,
    pinBeforeChromeFalseCount: rows.filter((r) => r.pinBeforeChrome === false).length,
  };
}

function firstDivergence(passRun, failRun) {
  if (!passRun || !failRun) return null;
  const fields = [
    ["chromeFirstWithO3.pinnedNull", passRun.chromeFirstWithO3?.pinnedNull, failRun.chromeFirstWithO3?.pinnedNull],
    ["chromeFirstWithO3.effective", passRun.chromeFirstWithO3?.effective, failRun.chromeFirstWithO3?.effective],
    ["chromeFirstWithO3.live", passRun.chromeFirstWithO3?.live, failRun.chromeFirstWithO3?.live],
    ["chromeWithPinnedNull", passRun.chromeWithPinnedNull, failRun.chromeWithPinnedNull],
    ["pinBeforeChrome", passRun.pinBeforeChrome, failRun.pinBeforeChrome],
    ["summaryPrepare", passRun.summaryPrepare, failRun.summaryPrepare],
    ["summarySlide", passRun.summarySlide, failRun.summarySlide],
    ["summaryDelta", passRun.summaryDeltaPrepareToSlide, failRun.summaryDeltaPrepareToSlide],
    ["categoryDeltaSlide", passRun.categoryDeltaSlide, failRun.categoryDeltaSlide],
    ["categoryDeltaIdle", passRun.categoryDeltaIdle, failRun.categoryDeltaIdle],
    ["fulfillmentPrepare", passRun.prepareSnap?.fulfillmentExists, failRun.prepareSnap?.fulfillmentExists],
    ["fulfillmentSlide", passRun.firstSlideSnap?.fulfillmentExists, failRun.firstSlideSnap?.fulfillmentExists],
  ];
  const diffs = fields.filter(([, a, b]) => JSON.stringify(a) !== JSON.stringify(b));
  return {
    firstDiff: diffs[0]
      ? { field: diffs[0][0], pass: diffs[0][1], fail: diffs[0][2] }
      : null,
    allDiffs: diffs.map(([field, pass, fail]) => ({ field, pass, fail })),
  };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const results = {
    origin: ORIGIN,
    baseHead: baseHead(),
    generatedAt: new Date().toISOString(),
    phone: [],
    tablet: [],
  };

  {
    const warmPage = await browser.newPage({ viewport: PHONE });
    results.warmOk = await warmStoreRoute(warmPage);
    await warmPage.close();
  }

  for (let i = 0; i < PHONE_RUNS; i++) {
    const page = await browser.newPage({ viewport: PHONE });
    // eslint-disable-next-line no-await-in-loop
    const r = await runOnce(page, `phone-${i + 1}`);
    results.phone.push(r);
    // eslint-disable-next-line no-await-in-loop
    await page.close();
  }
  for (let i = 0; i < TABLET_RUNS; i++) {
    const page = await browser.newPage({ viewport: TABLET });
    // eslint-disable-next-line no-await-in-loop
    const r = await runOnce(page, `tablet-${i + 1}`);
    results.tablet.push(r);
    // eslint-disable-next-line no-await-in-loop
    await page.close();
  }
  await browser.close();

  const phoneSum = summarizeCohort(results.phone);
  const tabletSum = summarizeCohort(results.tablet);
  const passEx = results.phone.find((r) => r.classKind === "PASS");
  const fail232 = results.phone.find((r) => r.classKind === "FAIL_NEG232");
  const drift13 = results.phone.find((r) => r.classKind === "DRIFT_POS13");

  results.summary = {
    phone: phoneSum,
    tablet: tabletSum,
    divergenceNeg232: firstDivergence(passEx, fail232),
    divergencePos13: firstDivergence(passEx, drift13),
  };

  const outPath = resolve(OUT_DIR, "featured-o3-determinism-audit-latest.json");
  writeFileSync(outPath, JSON.stringify(results, null, 2));

  console.log(
    JSON.stringify(
      {
        outPath,
        baseHead: results.baseHead,
        PHONE: results.phone.map((r, i) => ({
          run: i + 1,
          pass: passRow(r),
          classKind: r.classKind || r.reason,
          categoryDeltaIdle: r.categoryDeltaIdle,
          summaryDelta: r.summaryDeltaPrepareToSlide,
          chromeWithPinnedNull: r.chromeWithPinnedNull,
          pinBeforeChrome: r.pinBeforeChrome,
          preLand: r.preLandWriteCount,
          ready: r.readyEmitCount,
        })),
        TABLET: results.tablet.map((r, i) => ({
          run: i + 1,
          pass: passRow(r),
          classKind: r.classKind || r.reason,
          categoryDeltaIdle: r.categoryDeltaIdle,
          summaryDelta: r.summaryDeltaPrepareToSlide,
          chromeWithPinnedNull: r.chromeWithPinnedNull,
        })),
        summary: results.summary,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});

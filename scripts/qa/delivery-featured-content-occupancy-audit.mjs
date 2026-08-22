/**
 * Featured entry — content occupancy root audit (read-only + dev-only A/B modes).
 * PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 node scripts/qa/delivery-featured-content-occupancy-audit.mjs
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const OUT_DIR = resolve("docs/perf/delivery-owner-ux-audit");
mkdirSync(OUT_DIR, { recursive: true });

const PHONE = { width: 390, height: 844 };

const OCCUPANCY_PROBE = String.raw`
(() => {
  const scrollRoot =
    document.querySelector("[data-main-hub-scroll-body]") ||
    document.querySelector("main") ||
    document.documentElement;

  function cssBox(el) {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      top: Math.round(r.top * 1000) / 1000,
      bottom: Math.round(r.bottom * 1000) / 1000,
      height: Math.round(r.height * 1000) / 1000,
      marginTop: Math.round(parseFloat(cs.marginTop) * 1000) / 1000 || 0,
      marginBottom: Math.round(parseFloat(cs.marginBottom) * 1000) / 1000 || 0,
    };
  }

  function parentGap(el) {
    if (!el?.parentElement) return null;
    const g = getComputedStyle(el.parentElement).gap;
    const n = parseFloat(g);
    return Number.isFinite(n) ? n : 0;
  }

  function measureAbsScrollTop(el) {
    if (!el || !(scrollRoot instanceof HTMLElement)) return null;
    const rootRect = scrollRoot.getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    return Math.round((scrollRoot.scrollTop + (rect.top - rootRect.top)) * 1000) / 1000;
  }

  function measureOffsetAbsScrollTop(el) {
    if (!el || !(scrollRoot instanceof HTMLElement)) return null;
    let y = 0;
    let node = el;
    while (node && node !== scrollRoot) {
      y += node.offsetTop;
      const op = node.offsetParent;
      if (!(op instanceof HTMLElement)) break;
      node = op;
    }
    return Math.round((scrollRoot.scrollTop + y) * 1000) / 1000;
  }

  function footprintBetween(prevEl, nextEl) {
    if (!prevEl || !nextEl) return null;
    const a = prevEl.getBoundingClientRect();
    const b = nextEl.getBoundingClientRect();
    return Math.round((b.top - a.bottom) * 1000) / 1000;
  }

  function tabsRegionFootprint() {
    const spacer = document.querySelector('[data-store-focus-pin-spacer="1"]');
    const sentinel = document.getElementById("store-menu-tabs-sentinel");
    const flow = document.querySelector('[data-store-category-tabs="flow"]');
    const placeholder = document.querySelector('[data-store-category-tabs-layout-placeholder="1"]');

    const prev = spacer ?? sentinel;
    const afterTabs = placeholder?.nextElementSibling ?? flow?.nextElementSibling;
    const nextTopEl = afterTabs instanceof HTMLElement ? afterTabs : null;
    const prevBottomEl = flow ?? placeholder ?? spacer ?? sentinel;

    return {
      prevBoundary: cssBox(prev),
      tabsBlockBottom: cssBox(prevBottomEl),
      flowTabs: flow ? { ...cssBox(flow), parentGap: parentGap(flow) } : null,
      placeholder: placeholder ? { ...cssBox(placeholder), parentGap: parentGap(placeholder) } : null,
      nextBoundary: cssBox(nextTopEl),
      footprintPrevToNext: footprintBetween(prev, nextTopEl),
      footprintTabsBottomToNext: footprintBetween(prevBottomEl, nextTopEl),
    };
  }

  window.__dibayOccupancySnapshot = function snapshot(label) {
    const shell = document.querySelector("[data-delivery-presentation-shell]");
    const phase = shell?.getAttribute("data-delivery-slide-phase");
    const chromeActive = shell?.getAttribute("data-delivery-store-chrome-active");
    const storeSurface = document.querySelector("[data-delivery-surface='store']");
    const chromeHost = document.querySelector("[data-delivery-store-chrome-host='1']");

    const headerInline = storeSurface?.querySelector("header");
    const headerHost = chromeHost?.querySelector("header");
    const flowTabs = document.querySelector('[data-store-category-tabs="flow"]');
    const pinnedTabs = document.querySelector('[data-store-category-tabs="pinned"]');
    const spacer = document.querySelector('[data-store-focus-pin-spacer="1"]');
    const placeholder = document.querySelector('[data-store-category-tabs-layout-placeholder="1"]');
    const summary = document.querySelector("#store-menu-panel")?.previousElementSibling;

    const productId = new URLSearchParams(location.search).get("focusProduct");
    let h3 = null;
    if (productId) {
      const product = document.getElementById("store-menu-product-" + productId);
      const sec = product?.closest('[id^="store-sec-"]');
      h3 = sec?.querySelector("h3") ?? null;
    }

    const secEl = document.querySelector("[id^='store-sec-']");

    const tabsEl = pinnedTabs ?? flowTabs;
    const tabsRect = tabsEl?.getBoundingClientRect();
    const headerEl = headerHost ?? headerInline;
    const headerOffset = (() => {
      const hb = headerEl?.getBoundingClientRect().bottom;
      if (hb != null && hb > 0) return hb;
      const hh = parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue("--delivery-header-h") || "48"
      );
      return hh;
    })();
    const tabsBottomFinal =
      pinnedTabs && tabsRect ? tabsRect.bottom : headerOffset + Math.max(48, tabsRect?.height ?? 48);

    const h3Rect = h3?.getBoundingClientRect();

    return {
      label,
      t: performance.now(),
      phase,
      chromeActive,
      auditMode: document.documentElement.getAttribute("data-dibay-occupancy-audit-mode"),
      scrollTop: scrollRoot instanceof HTMLElement ? scrollRoot.scrollTop : null,
      h3: {
        absScrollTop: measureAbsScrollTop(h3),
        offsetAbsScrollTop: measureOffsetAbsScrollTop(h3),
        viewportTop: h3Rect?.top ?? null,
        categoryDelta: h3Rect ? h3Rect.top - tabsBottomFinal : null,
      },
      menuBoardAbsoluteTop: measureAbsScrollTop(secEl),
      flowTabsExists: !!flowTabs,
      placeholderExists: !!placeholder,
      portalTabsParent: pinnedTabs?.parentElement?.getAttribute?.("data-delivery-store-chrome-host") === "1"
        ? "chrome-host"
        : pinnedTabs?.parentElement === document.body
          ? "body"
          : pinnedTabs
            ? "other"
            : "none",
      headerPortal: headerHost ? "chrome-host" : headerInline ? "inline" : "none",
      focusPinSpacer: spacer ? cssBox(spacer) : null,
      tabsPlaceholder: placeholder ? cssBox(placeholder) : null,
      flowTabsFootprint: tabsRegionFootprint(),
      summaryRect: summary instanceof HTMLElement ? cssBox(summary) : null,
      storeSurfaceTransform: storeSurface ? getComputedStyle(storeSurface).transform : null,
    };
  };
})();
`;

async function runOccupancyAudit(page, auditMode) {
  if (auditMode) {
    await page.addInitScript((mode) => {
      document.documentElement.setAttribute("data-dibay-occupancy-audit-mode", mode);
    }, auditMode);
  }

  await page.addInitScript(OCCUPANCY_PROBE);

  await page.goto(`${ORIGIN}/stores/browse/restaurant?sub=korean`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await page.waitForTimeout(2500);

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

  if (!hasTarget) {
    return { ok: false, reason: "no_kimbap_target", auditMode };
  }

  return page.evaluate(async (mode) => {
    const mutations = [];
    const snapshots = [];

    const obs = new MutationObserver((records) => {
      for (const rec of records) {
        mutations.push({
          t: performance.now(),
          type: rec.type,
          target:
            rec.target instanceof Element
              ? rec.target.tagName.toLowerCase() +
                (rec.target.getAttribute?.("data-delivery-slide-phase") ? "[shell-phase]" : "") +
                (rec.target.getAttribute?.("data-store-category-tabs")
                  ? "[tabs=" + rec.target.getAttribute("data-store-category-tabs") + "]"
                  : "") +
                (rec.target.getAttribute?.("data-store-focus-pin-spacer") ? "[pin-spacer]" : "") +
                (rec.target.getAttribute?.("data-store-category-tabs-layout-placeholder")
                  ? "[tabs-placeholder]"
                  : "")
              : "unknown",
          added: rec.addedNodes.length,
          removed: rec.removedNodes.length,
          attr: rec.attributeName,
        });
      }
    });
    obs.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: [
        "data-delivery-slide-phase",
        "data-delivery-store-chrome-active",
        "data-store-category-tabs",
        "data-store-focus-pin-spacer",
        "data-store-category-tabs-layout-placeholder",
      ],
    });

    const snap = (label) => {
      const s = window.__dibayOccupancySnapshot(label);
      snapshots.push(s);
      return s;
    };

    const btn = [...document.querySelectorAll("button")].find((el) =>
      /KIMBAP/i.test(el.getAttribute("aria-label") || "")
    );
    if (!btn) return { ok: false, reason: "no_kimbap_btn", auditMode: mode };

    btn.scrollIntoView({ block: "center" });
    btn.click();

    for (let attempt = 0; attempt < 120; attempt++) {
      await new Promise((r) => requestAnimationFrame(r));
      if (!location.pathname.includes("/browse")) break;
      if (attempt === 40) btn.click();
    }
    if (location.pathname.includes("/browse")) {
      return { ok: false, reason: "browse_navigation_stuck", auditMode: mode };
    }

    let readySnap = null;
    let preSlideSnap = null;
    let firstSlideSnap = null;
    let lastHoldSnap = null;

    for (let i = 0; i < 480; i++) {
      await new Promise((r) => requestAnimationFrame(r));
      const phase = document
        .querySelector("[data-delivery-presentation-shell]")
        ?.getAttribute("data-delivery-slide-phase");
      const ready = document.documentElement.getAttribute("data-dibay-featured-entry-ready") === "1";

      if (ready && !readySnap) readySnap = snap("T0_featuredEntryReady");
      if (phase === "hold_browse") {
        lastHoldSnap = snap("T1_hold_browse_tick");
        if (ready && !preSlideSnap) preSlideSnap = lastHoldSnap;
      }
      if (phase === "sliding_forward" && !firstSlideSnap) {
        firstSlideSnap = snap("T10_first_sliding_forward");
        snap("T8_phase_sliding_forward");
        break;
      }
    }

    obs.disconnect();

    const baselineAbsH3 = preSlideSnap?.h3?.absScrollTop ?? readySnap?.h3?.absScrollTop ?? null;
    let firstShift = null;
    if (baselineAbsH3 != null) {
      for (const s of snapshots) {
        if (s.h3.absScrollTop == null) continue;
        const delta = s.h3.absScrollTop - baselineAbsH3;
        if (Math.abs(delta) > 2 && !firstShift) {
          firstShift = {
            label: s.label,
            t: s.t,
            absH3Delta: Math.round(delta * 1000) / 1000,
            offsetAbsH3Delta:
              s.h3.offsetAbsScrollTop != null
                ? Math.round((s.h3.offsetAbsScrollTop - (preSlideSnap?.h3?.offsetAbsScrollTop ?? baselineAbsH3)) * 1000) /
                  1000
                : null,
          };
        }
      }
    }

    const prepareSnap =
      preSlideSnap ??
      [...snapshots].reverse().find((s) => s.phase === "hold_browse" && s.h3?.absScrollTop != null) ??
      readySnap;
    const slideSnap = firstSlideSnap ?? snapshots.at(-1);
    const absShift =
      prepareSnap?.h3?.absScrollTop != null && slideSnap?.h3?.absScrollTop != null
        ? Math.round((slideSnap.h3.absScrollTop - prepareSnap.h3.absScrollTop) * 1000) / 1000
        : null;

    return {
      ok: true,
      auditMode: mode,
      pathname: location.pathname,
      baselineAbsH3,
      absShiftPrepareToFirstSlide: absShift,
      offsetAbsShift:
        prepareSnap?.h3?.offsetAbsScrollTop != null && slideSnap?.h3?.offsetAbsScrollTop != null
          ? Math.round((slideSnap.h3.offsetAbsScrollTop - prepareSnap.h3.offsetAbsScrollTop) * 1000) /
            1000
          : null,
      categoryDeltaPrepare: prepareSnap?.h3?.categoryDelta ?? null,
      categoryDeltaFirstSlide: slideSnap?.h3?.categoryDelta ?? null,
      firstShift,
      prepareFootprint: prepareSnap?.flowTabsFootprint ?? null,
      slideFootprint: slideSnap?.flowTabsFootprint ?? null,
      prepare: prepareSnap,
      firstSlide: slideSnap,
      snapshots,
      mutationsNearFirstShift: firstShift
        ? mutations.filter((m) => m.t <= firstShift.t + 2).slice(-15)
        : mutations.slice(-15),
    };
  }, auditMode);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const results = {};

  for (const mode of [null, "transform-only", "header-only", "tabs-only"]) {
    const page = await browser.newPage({ viewport: PHONE });
    const label = mode ?? "baseline";
    try {
      results[label] = await runOccupancyAudit(page, mode);
    } catch (e) {
      results[label] = { ok: false, error: String(e?.message ?? e), auditMode: label };
    }
    await page.close();
  }

  const baseline = results.baseline;
  const flowFootprint =
    baseline?.prepareFootprint?.footprintPrevToNext ??
    baseline?.prepareFootprint?.footprintTabsBottomToNext ??
    null;
  const placeholderFootprint =
    baseline?.slideFootprint?.footprintPrevToNext ??
    baseline?.slideFootprint?.footprintTabsBottomToNext ??
    null;

  const report = {
    origin: ORIGIN,
    generatedAt: new Date().toISOString(),
    observedTotalShiftPx: baseline?.absShiftPrepareToFirstSlide ?? null,
    observedOffsetShiftPx: baseline?.offsetAbsShift ?? null,
    transformOnlyDeltaPx: results["transform-only"]?.absShiftPrepareToFirstSlide ?? null,
    transformOnlyOffsetDeltaPx: results["transform-only"]?.offsetAbsShift ?? null,
    headerOnlyDeltaPx: results["header-only"]?.absShiftPrepareToFirstSlide ?? null,
    tabsOnlyDeltaPx: results["tabs-only"]?.absShiftPrepareToFirstSlide ?? null,
    firstShiftMutation: baseline?.firstShift ?? null,
    flowTabsFootprintPx: flowFootprint,
    placeholderFootprintPx: placeholderFootprint,
    footprintDeltaPx:
      flowFootprint != null && placeholderFootprint != null
        ? Math.round((placeholderFootprint - flowFootprint) * 1000) / 1000
        : null,
    prepareH3Abs: baseline?.prepare?.h3?.absScrollTop ?? null,
    firstSlideH3Abs: baseline?.firstSlide?.h3?.absScrollTop ?? null,
    runs: results,
  };

  const outPath = resolve(OUT_DIR, "featured-content-occupancy-audit-latest.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2));

  console.log(JSON.stringify({ outPath, ...report }, null, 2));
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});

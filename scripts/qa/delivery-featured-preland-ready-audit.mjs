/**
 * Featured entry — pre-land target + READY emit audit (dev origin).
 * PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 node scripts/qa/delivery-featured-preland-ready-audit.mjs
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const OUT_DIR = resolve("docs/perf/delivery-owner-ux-audit");
mkdirSync(OUT_DIR, { recursive: true });

const PHONE = { width: 390, height: 844 };
const TABLET = { width: 820, height: 1180 };
const PHONE_RUNS = 3;
const TABLET_RUNS = 2;

async function runFeaturedAudit(page, role) {
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
    return { ok: false, reason: "no_kimbap_target", deviceRole: role };
  }

  return page.evaluate(async (deviceRole) => {
    const TOL = 8;
    const scrollWrites = [];
    const readyMarks = [];
    let readyEventCount = 0;

    const scrollRootEl = () =>
      document.querySelector("[data-main-hub-scroll-body]") ||
      document.querySelector("main") ||
      document.documentElement;

    const origScrollTopDesc = Object.getOwnPropertyDescriptor(
      Element.prototype,
      "scrollTop"
    );
    if (origScrollTopDesc?.set) {
      Object.defineProperty(Element.prototype, "scrollTop", {
        configurable: true,
        enumerable: origScrollTopDesc.enumerable,
        get: origScrollTopDesc.get,
        set(v) {
          const root = scrollRootEl();
          if (this === root || this === document.documentElement) {
            scrollWrites.push({
              t: performance.now(),
              source: "scrollTop",
              top: Number(v),
              phase: document
                .querySelector("[data-delivery-presentation-shell]")
                ?.getAttribute("data-delivery-slide-phase"),
              preparing: document
                .querySelector("[data-store-focus-entry-preparing]")
                ?.getAttribute("data-store-focus-entry-preparing"),
            });
          }
          return origScrollTopDesc.set.call(this, v);
        },
      });
    }
    const origScrollTo = Element.prototype.scrollTo;
    Element.prototype.scrollTo = function (...args) {
      let top = null;
      if (typeof args[0] === "number") top = args[1];
      else if (args[0] && typeof args[0] === "object") top = args[0].top;
      const root = scrollRootEl();
      if (this === root || this === document.documentElement) {
        scrollWrites.push({
          t: performance.now(),
          source: "scrollTo",
          top,
          phase: document
            .querySelector("[data-delivery-presentation-shell]")
            ?.getAttribute("data-delivery-slide-phase"),
          preparing: document
            .querySelector("[data-store-focus-entry-preparing]")
            ?.getAttribute("data-store-focus-entry-preparing"),
        });
      }
      return origScrollTo.apply(this, args);
    };

    window.addEventListener("dibay:store-featured-entry-ready", () => {
      readyEventCount += 1;
      readyMarks.push({ t: performance.now(), via: "STORE_FEATURED_ENTRY_READY_EVENT" });
    });

    const resolveSectionIndex = (productId, sectionIndex) => {
      if (sectionIndex != null && Number.isFinite(sectionIndex)) return sectionIndex;
      if (!productId) return null;
      const product = document.getElementById(`store-menu-product-${productId}`);
      const section = product?.closest('[id^="store-sec-"]');
      const match = section?.id?.match(/^store-sec-(\d+)$/);
      return match ? Number(match[1]) : null;
    };

    const snapGeometry = (productId, sectionIndex) => {
      const scrollRoot = scrollRootEl();
      const rootRect = scrollRoot?.getBoundingClientRect?.() ?? { top: 0 };
      const pinnedTabs = document.querySelector('[data-store-category-tabs="pinned"]');
      const flowTabs = document.querySelector('[data-store-category-tabs="flow"]');
      const tabs = pinnedTabs ?? flowTabs;
      const tabsRect = tabs?.getBoundingClientRect();
      const secIdx = resolveSectionIndex(productId, sectionIndex);
      const sectionEl =
        secIdx != null ? document.getElementById(`store-sec-${secIdx}`) : null;
      const h3 = sectionEl?.querySelector("h3");
      const h3Rect = h3?.getBoundingClientRect();
      const product = productId
        ? document.getElementById(`store-menu-product-${productId}`)
        : null;
      const productRect = product?.getBoundingClientRect();
      const hero = document.getElementById("store-hero-media");
      const heroRect = hero?.getBoundingClientRect();
      const pinSpacer = document.querySelector('[data-store-focus-pin-spacer="1"]');
      const safeProbe = getComputedStyle(document.documentElement).getPropertyValue(
        "--safe-top"
      );
      const headerHVar = getComputedStyle(document.documentElement).getPropertyValue(
        "--delivery-header-h"
      );
      const tabsH = tabsRect ? Math.round(tabsRect.height) : 0;
      const headerFixedChrome = document
        .querySelector('[data-delivery-store-chrome-host="1"]')
        ?.querySelector("header.fixed");
      const headerFixedStore = [...document.querySelectorAll("header.fixed")].find(
        (h) => h.closest("[data-delivery-surface='store']")
      );
      const headerFixedBody = [...document.querySelectorAll("header.fixed")].find(
        (h) => h.parentElement === document.body
      );
      const headerFixed = headerFixedChrome ?? headerFixedStore ?? headerFixedBody;
      const headerRect = headerFixed?.getBoundingClientRect();
      const scrollTop = scrollRoot instanceof HTMLElement ? scrollRoot.scrollTop : 0;
      const headerOffset =
        (headerRect?.bottom ?? 0) > 0
          ? Math.round(headerRect.bottom)
          : parseFloat(headerHVar || "48") + parseFloat(String(safeProbe).replace(/[^\d.]/g, "") || "0");
      const tabsBottomFinal =
        pinnedTabs && tabsRect
          ? tabsRect.bottom
          : headerOffset + Math.max(48, tabsH);
      const measureHeader =
        h3 && scrollRoot instanceof HTMLElement
          ? scrollTop + (h3Rect.top - rootRect.top)
          : null;
      const targetScroll =
        measureHeader != null
          ? Math.max(0, Math.floor(measureHeader - tabsBottomFinal))
          : null;

      return {
        scrollContainerTop: rootRect.top,
        scrollTop,
        tabsBottom: tabsRect?.bottom ?? null,
        tabsBottomFinal,
        tabsTop: tabsRect?.top ?? null,
        tabsMode: tabs?.getAttribute("data-store-category-tabs"),
        categoryTop: h3Rect?.top ?? null,
        categoryHeight: h3Rect?.height ?? null,
        productTop: productRect?.top ?? null,
        productHeight: productRect?.height ?? null,
        pinSpacerHeight: pinSpacer?.getBoundingClientRect().height ?? null,
        safeTop: safeProbe,
        headerHeightVar: headerHVar,
        headerBottom: headerRect?.bottom ?? null,
        heroBottom: heroRect?.bottom ?? null,
        measureHeaderScrollTop: measureHeader,
        targetScrollTopFormula: targetScroll,
        categoryDelta:
          h3Rect?.top != null ? h3Rect.top - tabsBottomFinal : null,
        productGap:
          h3Rect && productRect
            ? productRect.top - h3Rect.bottom
            : null,
        bodyHeaderInViewport: [...document.querySelectorAll("header.fixed")].some(
          (h) => {
            const r = h.getBoundingClientRect();
            return (
              h.parentElement === document.body &&
              r.bottom > 0 &&
              r.top < innerHeight &&
              r.width > 0
            );
          }
        ),
        bodyTabsInViewport: !!document.querySelector(
          '[data-store-category-tabs="pinned"]'
        )?.getBoundingClientRect &&
          (() => {
            const t = document.querySelector('[data-store-category-tabs="pinned"]');
            const r = t?.getBoundingClientRect();
            const parent = t?.parentElement;
            const chromeHost = document.querySelector('[data-delivery-store-chrome-host="1"]');
            const inChromeHost = parent === chromeHost || chromeHost?.contains(t);
            return (
              (parent === document.body || inChromeHost) &&
              r &&
              r.bottom > 0 &&
              r.top < innerHeight
            );
          })(),
        chromeHostActive:
          document
            .querySelector("[data-delivery-presentation-shell]")
            ?.getAttribute("data-delivery-store-chrome-active") === "1",
        tabsPortalParent:
          document.querySelector('[data-store-category-tabs="pinned"]')?.parentElement
            ?.getAttribute?.("data-delivery-store-chrome-host") === "1"
            ? "chrome-host"
            : document.querySelector('[data-store-category-tabs="pinned"]')?.parentElement ===
                document.body
              ? "body"
              : "inline",
      };
    };

    const btn = [...document.querySelectorAll("button")].find((el) =>
      /KIMBAP/i.test(el.getAttribute("aria-label") || "")
    );
    if (!btn) return { ok: false, reason: "no_kimbap_target", deviceRole };

    const t0 = performance.now();
    btn.scrollIntoView({ block: "center" });
    btn.click();

    for (let attempt = 0; attempt < 120; attempt++) {
      await new Promise((r) => requestAnimationFrame(r));
      if (!location.pathname.includes("/browse")) break;
      if (attempt === 40) btn.click();
    }
    if (location.pathname.includes("/browse")) {
      return { ok: false, reason: "browse_navigation_stuck", deviceRole };
    }

    const timeline = [];
    let writeBefore = null;
    let writeAfter = null;
    let writeTarget = null;
    let lastPreLandCount = 0;
    let postSlideWrites = 0;
    let slideStarted = false;
    let slideStartT = null;
    let firstFrame = null;

    for (let i = 0; i < 320; i++) {
      await new Promise((r) => requestAnimationFrame(r));
      const t = Math.round(performance.now() - t0);
      const ev = window.__dibayDeliveryPresentation?.events ?? [];
      const phase = document
        .querySelector("[data-delivery-presentation-shell]")
        ?.getAttribute("data-delivery-slide-phase");
      const productId = new URLSearchParams(location.search).get("focusProduct");
      const readySection =
        ev.filter((e) => e.name === "featuredEntryReady").at(-1)?.detail?.sectionIndex ??
        ev.filter((e) => e.name === "featuredPreLandWrite").at(-1)?.detail?.sectionIndex ??
        null;
      const geo = snapGeometry(productId, readySection);

      const counts = {
        focusTargetReady: ev.filter((e) => e.name === "focusTargetReady").length,
        featuredPinGeometryFinal: ev.filter((e) => e.name === "featuredPinGeometryFinal")
          .length,
        featuredPreLandWrite: ev.filter((e) => e.name === "featuredPreLandWrite").length,
        featuredPreLandVerified: ev.filter((e) => e.name === "featuredPreLandVerified")
          .length,
        featuredEntryReady: ev.filter((e) => e.name === "featuredEntryReady").length,
        slideStart: ev.filter((e) => e.name === "slideStart" && e.detail?.direction === "rtl-forward")
          .length,
      };

      if (counts.featuredPreLandWrite > lastPreLandCount && !writeBefore) {
        writeBefore = { t, ...geo };
        const lastWrite = ev.filter((e) => e.name === "featuredPreLandWrite").at(-1);
        writeTarget = lastWrite?.detail ?? null;
      }
      if (counts.featuredPreLandWrite > lastPreLandCount && writeBefore && !writeAfter) {
        writeAfter = { t, ...snapGeometry(productId, null) };
      }
      lastPreLandCount = counts.featuredPreLandWrite;

      if (phase === "sliding_forward" && !slideStarted) {
        slideStarted = true;
        slideStartT = t;
      }
      if (phase === "idle_store" && !firstFrame) {
        const rs =
          ev.filter((e) => e.name === "featuredEntryReady").at(-1)?.detail?.sectionIndex ??
          readySection;
        firstFrame = { t, ...snapGeometry(productId, rs) };
      }
      if (slideStarted && scrollWrites.length > postSlideWrites) {
        postSlideWrites = scrollWrites.length;
      }

      if (i % 8 === 0 || counts.featuredEntryReady > 0 || phase === "idle_store") {
        timeline.push({
          t,
          phase,
          readyAttr: document
            .querySelector("[data-store-featured-entry-ready]")
            ?.getAttribute("data-store-featured-entry-ready"),
          htmlReady: document.documentElement.getAttribute("data-dibay-featured-entry-ready"),
          counts,
          geo: {
            scrollTop: geo.scrollTop,
            categoryDelta: geo.categoryDelta,
            productGap: geo.productGap,
            tabsBottomFinal: geo.tabsBottomFinal,
            bodyHeaderInViewport: geo.bodyHeaderInViewport,
            bodyTabsInViewport: geo.bodyTabsInViewport,
            pinSpacerHeight: geo.pinSpacerHeight,
          },
        });
      }
    }

    const ev = window.__dibayDeliveryPresentation?.events ?? [];
    const readyEmit = ev.filter((e) => e.name === "featuredEntryReady");
    const verified = ev.filter((e) => e.name === "featuredPreLandVerified");
    const preLand = ev.filter((e) => e.name === "featuredPreLandWrite");
    const productIdFinal = new URLSearchParams(location.search).get("focusProduct");
    const readySectionFinal =
      readyEmit.at(-1)?.detail?.sectionIndex ??
      preLand.at(-1)?.detail?.sectionIndex ??
      null;
    const finalGeo = snapGeometry(productIdFinal, readySectionFinal);
    const verifiedDetail = verified.at(-1)?.detail ?? null;

    const verifyFailReason = (() => {
      if (verified.length > 0) return null;
      const g = finalGeo;
      if (g.categoryDelta == null) return "V7 wrong target element / missing h3";
      if (Math.abs(g.categoryDelta) > TOL) return "V1 target calculation error";
      if (g.productGap == null || Math.abs(g.productGap - 8) > TOL)
        return "V4 deferred hydration or V5 layout shift";
      if (g.heroBottom != null && g.tabsTop != null && g.heroBottom > g.tabsTop + 2)
        return "V3 spacer/layout shift";
      if (preLand.length === 0) return "V6 wrong scroll container / write blocked";
      if (readyEmit.length === 0 && preLand.length > 0) return "V2 pin geometry still changing";
      return "V8 other — see timeline";
    })();

    return {
      ok: true,
      deviceRole,
      pathname: location.pathname,
      portalEarlyExposure: timeline.some(
        (s) =>
          s.phase === "hold_browse" &&
          (s.geo.bodyHeaderInViewport || s.geo.bodyTabsInViewport)
      ),
      flowGeometryWrite:
        preLand.length > 0 &&
        ((preLand.at(-1)?.detail?.spacerHeight ?? 0) < 40 ||
          preLand.at(-1)?.detail?.effectivePinned !== true),
      preLandWriteCount: preLand.length,
      scrollWriteCount: scrollWrites.length,
      scrollWrites,
      readyAttemptCount: ev.filter((e) => e.name === "featuredPreLandVerified").length,
      readyEmitCount: readyEmit.length,
      readyEventCount,
      readyEmitReason: readyEmit.map((e) => e.detail),
      readyMarks,
      slideStartCount: ev.filter(
        (e) => e.name === "slideStart" && e.detail?.direction === "rtl-forward"
      ).length,
      writeBefore,
      writeTarget,
      writeAfter,
      verified: verified.map((e) => e.detail),
      finalGeo,
      firstFrameScrollTop: firstFrame?.scrollTop ?? null,
      categoryDelta:
        firstFrame?.categoryDelta ??
        verifiedDetail?.categoryDelta ??
        finalGeo.categoryDelta,
      productGap: firstFrame?.productGap ?? finalGeo.productGap,
      postSlideWrites: Math.max(0, scrollWrites.length - preLand.length),
      slideStartT,
      verifyFailReason,
      timeline: timeline.slice(0, 40),
      keyEvents: ev
        .filter((e) =>
          [
            "featuredPortalDeferred",
            "focusTargetReady",
            "featuredPinGeometryFinal",
            "featuredPreLandWrite",
            "featuredPreLandVerified",
            "featuredEntryReady",
            "slideStart",
          ].includes(e.name)
        )
        .slice(-30),
    };
  }, role);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const results = { origin: ORIGIN, phone: [], tablet: [], baseHead: null };

  for (let i = 0; i < PHONE_RUNS; i++) {
    const page = await browser.newPage({ viewport: PHONE });
    results.phone.push(await runFeaturedAudit(page, `phone-${i + 1}`));
    await page.close();
  }
  for (let i = 0; i < TABLET_RUNS; i++) {
    const page = await browser.newPage({ viewport: TABLET });
    results.tablet.push(await runFeaturedAudit(page, `tablet-${i + 1}`));
    await page.close();
  }

  await browser.close();

  const outPath = resolve(OUT_DIR, "featured-preland-ready-audit-latest.json");
  writeFileSync(outPath, JSON.stringify(results, null, 2));

  const pass = (r) =>
    r.ok &&
    r.pathname?.includes("/stores/") &&
    !r.pathname?.includes("/browse") &&
    r.preLandWriteCount === 1 &&
    r.scrollWriteCount === 1 &&
    r.readyEmitCount === 1 &&
    r.readyEventCount === 1 &&
    r.slideStartCount === 1 &&
    r.postSlideWrites === 0 &&
    !r.flowGeometryWrite &&
    r.categoryDelta != null &&
    Math.abs(r.categoryDelta) <= 8 &&
    r.productGap != null &&
    Math.abs(r.productGap - 8) <= 8 &&
    !r.portalEarlyExposure;

  console.log(
    JSON.stringify(
      {
        outPath,
        PHONE: results.phone.map((r, i) => ({
          run: i + 1,
          pass: pass(r),
          preLand: r.preLandWriteCount,
          ready: r.readyEmitCount,
          slide: r.slideStartCount,
          categoryDelta: r.categoryDelta,
          verify: r.verifyFailReason,
        })),
        TABLET: results.tablet.map((r, i) => ({
          run: i + 1,
          pass: pass(r),
          preLand: r.preLandWriteCount,
          ready: r.readyEmitCount,
          slide: r.slideStartCount,
          categoryDelta: r.categoryDelta,
          verify: r.verifyFailReason,
        })),
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

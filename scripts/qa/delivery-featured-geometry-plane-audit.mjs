/**
 * Featured entry — presentation geometry plane audit (read-only).
 * PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 node scripts/qa/delivery-featured-geometry-plane-audit.mjs
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const OUT_DIR = resolve("docs/perf/delivery-owner-ux-audit");
mkdirSync(OUT_DIR, { recursive: true });

const PHONE = { width: 390, height: 844 };

function planeSnapshot() {
  const scrollRoot =
    document.querySelector("[data-main-hub-scroll-body]") ||
    document.querySelector("main") ||
    document.documentElement;

  const storeSurface = document.querySelector("[data-delivery-surface='store']");
  const shell = document.querySelector("[data-delivery-presentation-shell]");
  const phase = shell?.getAttribute("data-delivery-slide-phase") ?? null;

  const headerInStore = storeSurface?.querySelector("header.fixed");
  const headerOnBody = [...document.querySelectorAll("header.fixed")].find(
    (h) => h.parentElement === document.body
  );
  const flowTabs = document.querySelector('[data-store-category-tabs="flow"]');
  const pinnedTabs = document.querySelector('[data-store-category-tabs="pinned"]');
  const spacer = document.querySelector('[data-store-focus-pin-spacer="1"]');

  const productId = new URLSearchParams(location.search).get("focusProduct");
  let sectionIndex = null;
  let h3 = null;
  if (productId) {
    const product = document.getElementById(`store-menu-product-${productId}`);
    const sec = product?.closest('[id^="store-sec-"]');
    const m = sec?.id?.match(/^store-sec-(\d+)$/);
    sectionIndex = m ? Number(m[1]) : null;
    h3 = sec?.querySelector("h3") ?? null;
  }

  const describeEl = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const parent = el.parentElement;
    return {
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      parentTag: parent?.tagName?.toLowerCase() ?? null,
      parentIsBody: parent === document.body,
      parentData: parent?.getAttribute?.("data-delivery-surface") ?? parent?.getAttribute?.("data-delivery-presentation-shell") ?? null,
      position: cs.position,
      transform: cs.transform,
      top: Math.round(r.top * 1000) / 1000,
      bottom: Math.round(r.bottom * 1000) / 1000,
      height: Math.round(r.height * 1000) / 1000,
    };
  };

  const readHeaderOffset = () => {
    const probe = getComputedStyle(document.documentElement).getPropertyValue("--safe-top");
    const headerH = getComputedStyle(document.documentElement).getPropertyValue("--delivery-header-h");
    const safe = parseFloat(String(probe).replace(/[^\d.]/g, "") || "0");
    const hh = parseFloat(String(headerH).replace(/[^\d.]/g, "") || "48");
    const headerEl = headerOnBody ?? headerInStore;
    const hb = headerEl?.getBoundingClientRect().bottom;
    if (hb != null && hb > 0) return Math.round(hb);
    return Math.round(safe + hh);
  };

  const scrollTop = scrollRoot instanceof HTMLElement ? scrollRoot.scrollTop : 0;
  const rootRect = scrollRoot?.getBoundingClientRect?.() ?? { top: 0 };
  const h3Rect = h3?.getBoundingClientRect();

  const measureAbsScrollTop = (el) => {
    if (!el || !(scrollRoot instanceof HTMLElement)) return null;
    const rect = el.getBoundingClientRect();
    return scrollTop + (rect.top - rootRect.top);
  };

  const tabsEl = pinnedTabs ?? flowTabs;
  const tabsRect = tabsEl?.getBoundingClientRect();
  const tabsH = tabsRect ? Math.round(tabsRect.height) : 0;
  const tabsBottomFinal =
    pinnedTabs && tabsRect
      ? tabsRect.bottom
      : readHeaderOffset() + Math.max(48, tabsH);

  const absH3 = measureAbsScrollTop(h3);
  const visualH3 = h3Rect?.top ?? null;
  const categoryDelta = visualH3 != null ? visualH3 - tabsBottomFinal : null;

  const transformChain = [];
  let node = storeSurface;
  while (node && node instanceof HTMLElement) {
    const t = getComputedStyle(node).transform;
    if (t && t !== "none") {
      transformChain.push({
        tag: node.tagName.toLowerCase(),
        data: node.getAttribute("data-delivery-surface") ?? node.getAttribute("data-delivery-presentation-shell") ?? node.className?.slice?.(0, 40) ?? null,
        transform: t,
      });
    }
    node = node.parentElement;
  }

  const deferAttr = document.querySelector("[data-store-featured-entry-ready]");

  return {
    t: performance.now(),
    phase,
    scrollRoot: {
      tag: scrollRoot instanceof HTMLElement ? scrollRoot.tagName.toLowerCase() : "unknown",
      isHub: scrollRoot instanceof HTMLElement && scrollRoot.hasAttribute("data-main-hub-scroll-body"),
      scrollTop,
      top: rootRect.top,
    },
    storeSurface: describeEl(storeSurface),
    transformChain,
    header: {
      inStore: describeEl(headerInStore),
      onBody: describeEl(headerOnBody),
      active: headerOnBody ? "body" : headerInStore ? "store-local" : "none",
    },
    tabs: {
      flow: describeEl(flowTabs),
      pinned: describeEl(pinnedTabs),
      mode: pinnedTabs ? "pinned-body" : flowTabs ? "flow-local" : "none",
      tabsBottom: tabsRect?.bottom ?? null,
      tabsBottomFinal,
    },
    spacer: describeEl(spacer),
    h3: {
      sectionIndex,
      visualTop: visualH3,
      absoluteScrollTop: absH3,
      height: h3Rect?.height ?? null,
      offsetParentTag: h3?.offsetParent instanceof HTMLElement ? h3.offsetParent.tagName.toLowerCase() : null,
    },
    geometry: {
      categoryDelta,
      productGap: null,
      scrollTop,
    },
    flags: {
      preparing: document.querySelector("[data-store-focus-entry-preparing]")?.getAttribute("data-store-focus-entry-preparing"),
      featuredReady: document.documentElement.getAttribute("data-dibay-featured-entry-ready"),
      deferFeaturedReadyAttr: deferAttr?.getAttribute("data-store-featured-entry-ready"),
      effectivePinnedSpacer: spacer != null,
      bodyHeaderInViewport: headerOnBody ? headerOnBody.getBoundingClientRect().bottom > 0 : false,
      bodyTabsInViewport: pinnedTabs ? pinnedTabs.getBoundingClientRect().bottom > 0 : false,
    },
  };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: PHONE });
  await page.goto(`${ORIGIN}/stores/browse/restaurant?sub=korean`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await page.waitForTimeout(2000);

  const result = await page.evaluate(async () => {
    const btn = [...document.querySelectorAll("button")].find((el) =>
      /KIMBAP/i.test(el.getAttribute("aria-label") || "")
    );
    if (!btn) return { ok: false, reason: "no_kimbap" };

    btn.scrollIntoView({ block: "center" });
    btn.click();

    for (let i = 0; i < 80; i++) {
      await new Promise((r) => requestAnimationFrame(r));
      if (!location.pathname.includes("/browse")) break;
    }
    if (location.pathname.includes("/browse")) return { ok: false, reason: "browse_stuck" };

    const t0 = performance.now();
    const samples = [];
    const mutations = [];
    let prev = null;
    let preLandSnap = null;
    let readySnap = null;
    let firstVisibleSnap = null;
    let idleSnap = null;

    const key = (s) =>
      JSON.stringify({
        phase: s.phase,
        header: s.header.active,
        tabs: s.tabs.mode,
        spacerH: s.spacer?.height ?? 0,
        scrollTop: s.scrollRoot?.scrollTop,
        storeTransform: s.storeSurface?.transform,
      });

    for (let i = 0; i < 400; i++) {
      await new Promise((r) => requestAnimationFrame(r));
      const s = planeSnapshot();
      s.dt = Math.round(performance.now() - t0);
      samples.push(s);

      const ev = window.__dibayDeliveryPresentation?.events ?? [];
      const preLandCount = ev.filter((e) => e.name === "featuredPreLandWrite").length;
      const readyCount = ev.filter((e) => e.name === "featuredEntryReady").length;

      if (preLandCount > 0 && !preLandSnap) preLandSnap = s;
      if (readyCount > 0 && !readySnap) readySnap = s;
      if (s.phase === "sliding_forward" && s.storeSurface?.transform === "none" && !firstVisibleSnap) {
        firstVisibleSnap = s;
      }
      if (s.phase === "idle_store" && !idleSnap) idleSnap = s;

      if (prev) {
        const dk = key(prev);
        const ck = key(s);
        if (dk !== ck) {
          mutations.push({
            dt: s.dt,
            from: {
              phase: prev.phase,
              header: prev.header.active,
              tabs: prev.tabs.mode,
              spacerH: prev.spacer?.height ?? 0,
              scrollTop: prev.scrollRoot?.scrollTop,
              storeTransform: prev.storeSurface?.transform,
              h3Visual: prev.h3.visualTop,
              h3Abs: prev.h3.absoluteScrollTop,
              categoryDelta: prev.geometry.categoryDelta,
            },
            to: {
              phase: s.phase,
              header: s.header.active,
              tabs: s.tabs.mode,
              spacerH: s.spacer?.height ?? 0,
              scrollTop: s.scrollRoot?.scrollTop,
              storeTransform: s.storeSurface?.transform,
              h3Visual: s.h3.visualTop,
              h3Abs: s.h3.absoluteScrollTop,
              categoryDelta: s.geometry.categoryDelta,
            },
            deltas: {
              scrollTop: s.scrollRoot.scrollTop - prev.scrollRoot.scrollTop,
              h3Visual: (s.h3.visualTop ?? 0) - (prev.h3.visualTop ?? 0),
              h3Abs: (s.h3.absoluteScrollTop ?? 0) - (prev.h3.absoluteScrollTop ?? 0),
              categoryDelta: (s.geometry.categoryDelta ?? 0) - (prev.geometry.categoryDelta ?? 0),
            },
          });
        }
      }
      prev = s;

      if (idleSnap && s.dt > idleSnap.dt + 120) break;
    }

    const ev = window.__dibayDeliveryPresentation?.events ?? [];
    return {
      ok: true,
      pathname: location.pathname,
      preLandSnap,
      readySnap,
      firstVisibleSnap,
      idleSnap,
      mutations,
      events: ev.filter((e) =>
        [
          "featuredPreLandWrite",
          "featuredPreLandVerified",
          "featuredEntryReady",
          "slideStart",
          "featuredHeaderPortalEnabled",
          "featuredTabsPortalEnabled",
          "featuredPortalDeferred",
        ].includes(e.name)
      ),
      sampleCount: samples.length,
    };
  });

  await browser.close();

  const outPath = resolve(OUT_DIR, "featured-geometry-plane-audit-latest.json");
  writeFileSync(outPath, JSON.stringify({ origin: ORIGIN, ...result }, null, 2));

  if (!result.ok) {
    console.log(JSON.stringify({ outPath, fail: result.reason }, null, 2));
    return;
  }

  const shift = (a, b) => ({
    scrollTop: (b?.scrollRoot?.scrollTop ?? 0) - (a?.scrollRoot?.scrollTop ?? 0),
    h3Visual: (b?.h3?.visualTop ?? 0) - (a?.h3?.visualTop ?? 0),
    h3Abs: (b?.h3?.absoluteScrollTop ?? 0) - (a?.h3?.absoluteScrollTop ?? 0),
    categoryDelta: (b?.geometry?.categoryDelta ?? 0) - (a?.geometry?.categoryDelta ?? 0),
  });

  console.log(
    JSON.stringify(
      {
        outPath,
        preLand: {
          phase: result.preLandSnap?.phase,
          scrollTop: result.preLandSnap?.scrollRoot?.scrollTop,
          categoryDelta: result.preLandSnap?.geometry?.categoryDelta,
          h3Abs: result.preLandSnap?.h3?.absoluteScrollTop,
          h3Visual: result.preLandSnap?.h3?.visualTop,
          header: result.preLandSnap?.header?.active,
          tabs: result.preLandSnap?.tabs?.mode,
          storeTransform: result.preLandSnap?.storeSurface?.transform,
        },
        firstVisible: {
          phase: result.firstVisibleSnap?.phase,
          scrollTop: result.firstVisibleSnap?.scrollRoot?.scrollTop,
          categoryDelta: result.firstVisibleSnap?.geometry?.categoryDelta,
          h3Abs: result.firstVisibleSnap?.h3?.absoluteScrollTop,
          h3Visual: result.firstVisibleSnap?.h3?.visualTop,
          header: result.firstVisibleSnap?.header?.active,
          tabs: result.firstVisibleSnap?.tabs?.mode,
          storeTransform: result.firstVisibleSnap?.storeSurface?.transform,
        },
        idle: {
          phase: result.idleSnap?.phase,
          scrollTop: result.idleSnap?.scrollRoot?.scrollTop,
          categoryDelta: result.idleSnap?.geometry?.categoryDelta,
          h3Abs: result.idleSnap?.h3?.absoluteScrollTop,
          h3Visual: result.idleSnap?.h3?.visualTop,
          header: result.idleSnap?.header?.active,
          tabs: result.idleSnap?.tabs?.mode,
          storeTransform: result.idleSnap?.storeSurface?.transform,
        },
        shiftPreLandToFirstVisible: shift(result.preLandSnap, result.firstVisibleSnap),
        shiftReadyToFirstVisible: shift(result.readySnap, result.firstVisibleSnap),
        topMutations: result.mutations
          .filter((m) => Math.abs(m.deltas.categoryDelta) > 20 || Math.abs(m.deltas.h3Visual) > 20)
          .slice(0, 12),
        mutationCount: result.mutations.length,
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

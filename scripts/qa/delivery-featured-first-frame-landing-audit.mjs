/**
 * FEATURED MENU — FIRST FRAME LANDING AUDIT
 *
 * Contract: FIRST USABLE FRAME = FINAL CORRECT FOCUS FRAME
 * Final focusDelta=0 alone is NOT PASS.
 * No product code changes — measurement only.
 *
 * PLAYWRIGHT_BASE_URL=https://samarket.vercel.app \
 * node scripts/qa/delivery-featured-first-frame-landing-audit.mjs
 */
import { spawnSync } from "node:child_process";
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DIBAY_PKG,
  connectWebView,
  forwardCdp,
  launchApkMainActivity,
  navigateApkWebView,
} from "./lib/apk-webview-cdp.mjs";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "https://samarket.vercel.app").replace(/\/$/, "");
const ADB = process.env.ADB_PATH || `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`;
const ACT = `${DIBAY_PKG}/.MainActivity`;
const OUT_DIR = resolve(process.cwd(), "docs/perf/delivery-owner-ux-audit");
mkdirSync(OUT_DIR, { recursive: true });

const SAMPLE_MS = [0, 50, 100, 150, 250, 400, 600, 800, 1000, 1500, 2000];
const TOLERANCE_PX = 8;

const DEVICES = (process.env.ANDROID_SERIAL
  ? [{ serial: process.env.ANDROID_SERIAL, role: process.env.DEVICE_ROLE || "device", cdpPort: 9620 }]
  : [
      { serial: "RFCY40PY2CA", role: "phone", cdpPort: 9620 },
      { serial: "8b37179f7d94", role: "tablet", cdpPort: 9621 },
    ]);

function adb(serial, ...args) {
  return spawnSync(ADB, ["-s", serial, ...args], { encoding: "utf8" });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function assertForegroundApk(serial) {
  const dump = adb(serial, "shell", "dumpsys", "activity", "activities");
  const text = `${dump.stdout || ""}\n${dump.stderr || ""}`;
  const m =
    text.match(/mResumedActivity:.*? ([a-zA-Z0-9_.]+)\/([a-zA-Z0-9_.]+)/) ||
    text.match(/topResumedActivity=ActivityRecord\{[^}]* ([a-zA-Z0-9_.]+)\/([a-zA-Z0-9_.]+)/);
  const pkg = m?.[1] || null;
  return { pkg, ok: pkg === DIBAY_PKG, raw: m?.[0]?.slice(0, 120) || null };
}

async function installLandingHooks(page) {
  await page.evaluate(() => {
    if (window.__ffHooked) return;
    window.__ffHooked = true;
    window.__ffT0 = null;
    window.__ffScrollLog = [];
    window.__ffSamples = [];
    window.__ffFocusProductId = null;

    const stackSnippet = () => {
      try {
        return String(new Error().stack || "")
          .split("\n")
          .slice(2, 10)
          .map((s) => s.trim())
          .join(" | ")
          .slice(0, 500);
      } catch {
        return "";
      }
    };

    const recordScroll = (source, detail = {}) => {
      if (window.__ffT0 == null) return;
      window.__ffScrollLog.push({
        t: performance.now() - window.__ffT0,
        source,
        detail,
        stack: stackSnippet(),
        href: location.pathname + location.search,
      });
    };

    const origScrollTo = Element.prototype.scrollTo;
    Element.prototype.scrollTo = function (...args) {
      let top = null;
      if (typeof args[0] === "number") top = args[1];
      else if (args[0] && typeof args[0] === "object") top = args[0].top;
      recordScroll("Element.scrollTo", {
        tag: this.tagName,
        id: this.id || null,
        cls: (this.className || "").toString().slice(0, 80),
        top,
      });
      return origScrollTo.apply(this, args);
    };

    const origWinScrollTo = window.scrollTo.bind(window);
    window.scrollTo = (...args) => {
      let top = null;
      if (typeof args[0] === "number") top = args[1];
      else if (args[0] && typeof args[0] === "object") top = args[0].top;
      recordScroll("window.scrollTo", { top });
      return origWinScrollTo(...args);
    };

    const desc = Object.getOwnPropertyDescriptor(Element.prototype, "scrollTop");
    if (desc?.set) {
      Object.defineProperty(Element.prototype, "scrollTop", {
        configurable: true,
        enumerable: desc.enumerable,
        get: desc.get,
        set(v) {
          recordScroll("scrollTop_setter", {
            tag: this.tagName,
            id: this.id || null,
            cls: (this.className || "").toString().slice(0, 80),
            top: Number(v),
          });
          return desc.set.call(this, v);
        },
      });
    }

    window.addEventListener(
      "scroll",
      (e) => {
        const t = e.target;
        recordScroll("scroll_event", {
          tag: t?.tagName || "window",
          id: t?.id || null,
          scrollTop: t?.scrollTop ?? window.scrollY,
        });
      },
      true
    );

    window.__ffSnap = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const q = new URLSearchParams(location.search);
      const focusId = (window.__ffFocusProductId || q.get("focusProduct") || "").trim() || null;
      const main =
        document.querySelector("main") ||
        document.querySelector("[data-main-column-scroll]") ||
        document.documentElement;
      const scrollTop = Math.round(
        main?.scrollTop || window.scrollY || document.documentElement.scrollTop || 0
      );
      const storeRoot =
        document.querySelector("[data-store-detail-root]") ||
        document.querySelector("#store-menu-panel")?.closest("div") ||
        document.querySelector("#store-menu-panel");
      const header =
        document.querySelector("[data-store-detail-header]") ||
        document.querySelector("header") ||
        document.querySelector("[data-stores-home-header]");
      const tabs =
        document.querySelector("[data-store-category-tabs]") ||
        document.querySelector('[role="tablist"]');
      const spacer = document.querySelector("[data-store-menu-focus-scroll-spacer]");
      const focusEl = focusId ? document.getElementById(`store-menu-product-${focusId}`) : null;
      const rect = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return {
          top: Math.round(r.top),
          bottom: Math.round(r.bottom),
          left: Math.round(r.left),
          right: Math.round(r.right),
          width: Math.round(r.width),
          height: Math.round(r.height),
        };
      };
      const headerR = rect(header);
      const tabsR = rect(tabs);
      const stickyBottom = Math.max(headerR?.bottom ?? 0, tabsR?.bottom ?? 0);
      const focusR = rect(focusEl);
      const delta =
        focusR && stickyBottom > 0 ? Math.round(focusR.top - stickyBottom) : null;

      const menuRows = [...document.querySelectorAll("[id^=store-menu-product-]")].map((el) => {
        const r = el.getBoundingClientRect();
        return {
          id: el.id,
          top: Math.round(r.top),
          bottom: Math.round(r.bottom),
          height: Math.round(r.height),
          inView: r.bottom > stickyBottom + 2 && r.top < vh - 2 && r.height > 8,
        };
      });
      const firstVisibleMenu = menuRows.find((m) => m.inView) || null;
      const clippedCount = menuRows.filter(
        (m) => m.height > 8 && m.top < stickyBottom - 2 && m.bottom > stickyBottom + 12
      ).length;

      const activeTab =
        tabs?.querySelector('[aria-selected="true"], [data-state="active"], .is-active') ||
        tabs?.querySelector("button[aria-current], a[aria-current]");
      const selectedCategory = (activeTab?.textContent || "").trim().slice(0, 80) || null;

      const storeRootR = rect(storeRoot);
      const spacerR = rect(spacer);
      const mainScrollH = Math.round(main?.scrollHeight || document.documentElement.scrollHeight || 0);
      const mainClientH = Math.round(main?.clientHeight || vh);
      const overflowShell =
        (storeRootR && storeRootR.height > vh + 40) ||
        (spacerR && spacerR.height > vh * 0.4) ||
        mainScrollH > vh + 200;

      const focusInCorrectSlot =
        delta != null && Math.abs(delta) <= 8 && focusR && focusR.height > 0;
      const storeChromeVisible =
        (headerR && headerR.bottom > 0 && headerR.top < vh) ||
        (tabsR && tabsR.bottom > 0 && tabsR.top < vh);
      const otherMenuVisible =
        firstVisibleMenu != null &&
        focusId != null &&
        firstVisibleMenu.id !== `store-menu-product-${focusId}`;
      const focusOffscreen =
        !focusEl ||
        !focusR ||
        focusR.bottom <= stickyBottom + 2 ||
        focusR.top >= vh - 2;
      const onStoreDetail = /^\/stores\/(?!browse(?:\/|$))[^/]+/.test(location.pathname);
      const hasFocusIntent = Boolean(focusId) || q.has("focusProduct");
      const wrongIntermediate =
        onStoreDetail &&
        hasFocusIntent &&
        storeChromeVisible &&
        (focusOffscreen || otherMenuVisible || (delta != null && Math.abs(delta) > 8));

      return {
        href: location.pathname + location.search,
        pathname: location.pathname,
        query: location.search,
        onStoreDetail,
        hasFocusIntent,
        focusProductId: focusId,
        viewport: { width: vw, height: vh },
        scrollTop,
        storeRoot: storeRootR,
        stickyHeader: headerR,
        categoryTabs: tabsR,
        selectedCategory,
        focusedProductExists: Boolean(focusEl),
        focusedProduct: focusR,
        focusedProductTop: focusR?.top ?? null,
        stickyBottom: Math.round(stickyBottom),
        delta,
        firstVisibleMenuRow: firstVisibleMenu,
        topClip: clippedCount > 0,
        clippedCount,
        viewportOverflow: Boolean(overflowShell),
        overflowHints: {
          storeRootHeight: storeRootR?.height ?? null,
          spacerHeight: spacerR?.height ?? null,
          spacerExists: Boolean(spacer),
          mainScrollHeight: mainScrollH,
          mainClientHeight: mainClientH,
          scrollMax: Math.max(0, mainScrollH - mainClientH),
        },
        focusInCorrectSlot,
        wrongIntermediate,
        storeChromeVisible,
        otherMenuVisible,
        focusOffscreen,
        menuRowCount: menuRows.length,
        scrollLogLen: (window.__ffScrollLog || []).length,
      };
    };
  });
}

async function armAndClickFeatured(page) {
  return page.evaluate(() => {
    window.__ffT0 = performance.now();
    window.__ffScrollLog = [];
    window.__ffSamples = [];

    const featuredBtn = [...document.querySelectorAll("button,a")].find((el) => {
      const aria = el.getAttribute("aria-label") || "";
      const href = el.getAttribute("href") || "";
      return (
        (href.includes("focusProduct=") || /View menu|메뉴|대표/.test(aria)) &&
        (el.querySelector("img") || href.includes("focusProduct="))
      );
    });

    let href = featuredBtn?.getAttribute?.("href") || null;
    let focusProductId = null;
    if (href && href.includes("focusProduct=")) {
      try {
        focusProductId = new URL(href, location.origin).searchParams.get("focusProduct");
      } catch {
        /* ignore */
      }
    }

    // Prefer explicit focusProduct anchors from featured menus
    const focusA = [...document.querySelectorAll("a")].find((a) =>
      (a.getAttribute("href") || "").includes("focusProduct=")
    );
    const target = focusA || featuredBtn;
    if (focusA) {
      href = focusA.getAttribute("href");
      try {
        focusProductId = new URL(href, location.origin).searchParams.get("focusProduct");
      } catch {
        /* ignore */
      }
    }

    window.__ffFocusProductId = focusProductId;
    if (!target) {
      return { ok: false, reason: "no_featured_focus_target", href: null, focusProductId: null };
    }
    target.click();
    return {
      ok: true,
      href,
      focusProductId,
      tag: target.tagName,
      aria: (target.getAttribute("aria-label") || "").slice(0, 80),
    };
  });
}

async function collectSamplesInPage(page, sampleMs) {
  return page.evaluate(
    ({ sampleMs, tolerance }) =>
      new Promise((resolve) => {
        const out = [];
        let i = 0;
        const tick = () => {
          const elapsed = performance.now() - window.__ffT0;
          while (i < sampleMs.length && elapsed + 0.5 >= sampleMs[i]) {
            const snap = window.__ffSnap();
            const actual = Math.round(performance.now() - window.__ffT0);
            const row = {
              elapsed_ms_target: sampleMs[i],
              elapsed_ms: actual,
              ...snap,
              tolerance,
            };
            window.__ffSamples.push(row);
            out.push(row);
            i += 1;
          }
          if (i >= sampleMs.length) {
            resolve(out);
            return;
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    { sampleMs, tolerance: TOLERANCE_PX }
  );
}

function analyzeDevice(samples, scrollLog, click) {
  const storeSamples = samples.filter((s) => s.onStoreDetail);
  const firstUsable =
    storeSamples.find(
      (s) =>
        s.menuRowCount > 0 ||
        s.focusedProductExists ||
        (s.categoryTabs && s.categoryTabs.height > 8 && s.hasFocusIntent)
    ) ||
    storeSamples[0] ||
    null;

  const final = samples[samples.length - 1] || null;
  const wrongFrames = samples.filter((s) => s.wrongIntermediate);
  const scrollTops = storeSamples.map((s) => s.scrollTop);
  const uniqueScrollTops = [...new Set(scrollTops)];

  // Automatic programmatic scrolls after T0 (exclude pure scroll_event noise bursts)
  const progScrolls = scrollLog.filter(
    (e) =>
      e.source === "Element.scrollTo" ||
      e.source === "window.scrollTo" ||
      e.source === "scrollTop_setter"
  );
  // Dedup near-identical tops within 16ms
  const distinctProg = [];
  for (const e of progScrolls) {
    const top = e.detail?.top;
    const last = distinctProg[distinctProg.length - 1];
    if (
      last &&
      Math.abs((last.detail?.top ?? -1) - (top ?? -2)) < 2 &&
      Math.abs(last.t - e.t) < 40
    ) {
      continue;
    }
    distinctProg.push(e);
  }

  const firstFocusDelta = firstUsable?.delta ?? null;
  const finalFocusDelta = final?.delta ?? null;
  const firstFrameScrollTop = firstUsable?.scrollTop ?? null;
  const finalScrollTop = final?.scrollTop ?? null;

  const firstEqualsFinal =
    firstUsable &&
    final &&
    firstUsable.focusInCorrectSlot === true &&
    final.focusInCorrectSlot === true &&
    Math.abs((firstUsable.scrollTop ?? 0) - (final.scrollTop ?? 0)) <= 2 &&
    Math.abs((firstUsable.delta ?? 999) - (final.delta ?? 999)) <= TOLERANCE_PX &&
    wrongFrames.length === 0 &&
    distinctProg.length <= 1;

  const overflowYes = samples.some((s) => s.viewportOverflow);
  let overflowSource = null;
  const overflowSample = samples.find((s) => s.viewportOverflow);
  if (overflowSample?.overflowHints) {
    const h = overflowSample.overflowHints;
    if (h.spacerExists && h.spacerHeight != null && h.spacerHeight > (overflowSample.viewport?.height || 0) * 0.4) {
      overflowSource = "focus_spacer_height";
    } else if (h.storeRootHeight != null && h.storeRootHeight > (overflowSample.viewport?.height || 0) + 40) {
      overflowSource = "store_root_taller_than_viewport";
    } else if (h.mainScrollHeight > h.mainClientHeight + 200) {
      overflowSource = "main_scrollHeight_gt_clientHeight";
    } else {
      overflowSource = "measured_overflow_unclassified";
    }
  }

  const firstWrong = wrongFrames[0] || null;
  let firstWrongSource = null;
  if (firstWrong) {
    if (firstWrong.focusOffscreen && firstWrong.storeChromeVisible && firstWrong.scrollTop <= 2) {
      firstWrongSource = "store_detail_top_paint_before_focus_scroll";
    } else if (firstWrong.otherMenuVisible) {
      firstWrongSource = "other_menu_rows_visible_before_focus_aligned";
    } else if (firstWrong.delta != null && Math.abs(firstWrong.delta) > TOLERANCE_PX) {
      firstWrongSource = "focus_delta_misaligned_while_chrome_visible";
    } else {
      firstWrongSource = "wrong_intermediate_unclassified";
    }
  }

  const secondOwner = distinctProg[1] || null;
  let secondCorrectionOwner = null;
  if (secondOwner) {
    const st = secondOwner.stack || "";
    if (/scrollStoreMenuProductIntoView|StoreDetailMenusSection|land\(/.test(st)) {
      secondCorrectionOwner = "focus_landing_land_or_correct";
    } else if (st) {
      secondCorrectionOwner = st.slice(0, 200);
    } else {
      secondCorrectionOwner = secondOwner.source;
    }
  }

  const doubleLanding =
    wrongFrames.length > 0 &&
    (distinctProg.length >= 2 ||
      (firstFrameScrollTop != null &&
        finalScrollTop != null &&
        Math.abs(firstFrameScrollTop - finalScrollTop) > TOLERANCE_PX));

  return {
    FEATURED_FIRST_FRAME: firstEqualsFinal ? "PASS" : "FAIL",
    WRONG_INTERMEDIATE_FRAME: wrongFrames.length > 0 ? "YES" : "NO",
    DOUBLE_LANDING: doubleLanding ? "YES" : "NO",
    AUTOMATIC_SCROLL_COUNT: distinctProg.length,
    FIRST_FRAME_SCROLLTOP: firstFrameScrollTop,
    FINAL_SCROLLTOP: finalScrollTop,
    FIRST_FOCUS_DELTA: firstFocusDelta,
    FINAL_FOCUS_DELTA: finalFocusDelta,
    VIEWPORT_OVERFLOW: overflowYes ? "YES" : "NO",
    OVERFLOW_SOURCE: overflowSource,
    FIRST_WRONG_FRAME_SOURCE: firstWrongSource,
    SECOND_CORRECTION_OWNER: secondCorrectionOwner,
    first_usable_elapsed_ms: firstUsable?.elapsed_ms ?? null,
    wrong_frame_count: wrongFrames.length,
    unique_scrollTops: uniqueScrollTops,
    click,
    distinct_programmatic_scrolls: distinctProg.map((e) => ({
      t: Math.round(e.t),
      source: e.source,
      top: e.detail?.top ?? null,
      stack_head: (e.stack || "").slice(0, 180),
    })),
    first_usable: firstUsable,
    final,
    wrong_frames_brief: wrongFrames.map((s) => ({
      elapsed_ms: s.elapsed_ms,
      scrollTop: s.scrollTop,
      delta: s.delta,
      focusOffscreen: s.focusOffscreen,
      otherMenuVisible: s.otherMenuVisible,
      spacerHeight: s.overflowHints?.spacerHeight ?? null,
    })),
  };
}

async function waitBrowseReady(page, timeoutMs = 45000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const ok = await page.evaluate(() => {
      const focusA = [...document.querySelectorAll("a")].some((a) =>
        (a.getAttribute("href") || "").includes("focusProduct=")
      );
      const featured = [...document.querySelectorAll("button,a")].some((el) => {
        const aria = el.getAttribute("aria-label") || "";
        return /View menu|메뉴/.test(aria) && el.querySelector("img");
      });
      return focusA || featured;
    });
    if (ok) return true;
    await sleep(400);
  }
  return false;
}

async function runDevice({ serial, role, cdpPort }) {
  const out = {
    serial,
    role,
    cdpPort,
    origin: ORIGIN,
    surface: "APK_WEBVIEW",
    package: DIBAY_PKG,
    errors: [],
  };

  adb(serial, "shell", "am", "force-stop", DIBAY_PKG);
  await sleep(800);
  launchApkMainActivity(adb, serial, ACT);
  adb(
    serial,
    "shell",
    "am",
    "start",
    "-a",
    "android.intent.action.VIEW",
    "-d",
    `${ORIGIN}/stores/browse/restaurant?sub=korean`,
    "-p",
    DIBAY_PKG
  );
  await sleep(6000);

  out.foreground = assertForegroundApk(serial);
  if (!out.foreground.ok) {
    out.errors.push(`foreground_not_apk: ${out.foreground.pkg}`);
    out.verdict = { FEATURED_FIRST_FRAME: "NOT_PROVEN", reason: "foreground_not_apk" };
    return out;
  }

  let sock;
  try {
    sock = forwardCdp(adb, serial, cdpPort);
  } catch (e) {
    out.errors.push(`cdp_forward: ${e.message}`);
    out.verdict = { FEATURED_FIRST_FRAME: "NOT_PROVEN", reason: "webview_devtools_missing" };
    return out;
  }
  out.webview_socket = sock;

  let browser;
  let page;
  try {
    ({ browser, page } = await connectWebView(chromium, cdpPort));
  } catch (e) {
    out.errors.push(`cdp_connect: ${e.message}`);
    out.verdict = { FEATURED_FIRST_FRAME: "NOT_PROVEN", reason: "cdp_connect_fail" };
    return out;
  }

  try {
    const path = await page.evaluate(() => location.pathname + location.search).catch(() => "");
    if (!path.includes("/stores/browse")) {
      await navigateApkWebView(page, `${ORIGIN}/stores/browse/restaurant?sub=korean`, 7000);
    }

    await installLandingHooks(page);
    const browseReady = await waitBrowseReady(page);
    out.browse_ready = browseReady;
    if (!browseReady) {
      // hard reload once
      await navigateApkWebView(page, `${ORIGIN}/stores/browse/restaurant?sub=korean`, 8000);
      await installLandingHooks(page);
      out.browse_ready = await waitBrowseReady(page);
    }
    if (!out.browse_ready) {
      out.errors.push("no_featured_focus_link");
      out.verdict = { FEATURED_FIRST_FRAME: "NOT_PROVEN", reason: "no_featured_target" };
      return out;
    }

    // Arm T0 + click + sample loop must stay in one evaluate so early frames are not lost to CDP RTT.
    const bundled = await page.evaluate(
      ({ sampleMs, tolerance }) =>
        new Promise((resolve) => {
          window.__ffT0 = performance.now();
          window.__ffScrollLog = [];
          window.__ffSamples = [];

          const featuredBtn = [...document.querySelectorAll("button,a")].find((el) => {
            const aria = el.getAttribute("aria-label") || "";
            const href = el.getAttribute("href") || "";
            return (
              (href.includes("focusProduct=") || /View menu|메뉴|대표/.test(aria)) &&
              (el.querySelector("img") || href.includes("focusProduct="))
            );
          });
          const focusA = [...document.querySelectorAll("a")].find((a) =>
            (a.getAttribute("href") || "").includes("focusProduct=")
          );
          const target = focusA || featuredBtn;
          let href = target?.getAttribute?.("href") || null;
          let focusProductId = null;
          if (href && href.includes("focusProduct=")) {
            try {
              focusProductId = new URL(href, location.origin).searchParams.get("focusProduct");
            } catch {
              /* ignore */
            }
          }
          if (!target) {
            resolve({
              click: { ok: false, reason: "no_featured_focus_target", href: null, focusProductId: null },
              samples: [],
              scroll_log: [],
            });
            return;
          }
          window.__ffFocusProductId = focusProductId;
          // Capture focus id from in-flight navigation if button has no href
          const captureFocusFromUrl = () => {
            try {
              const id = new URLSearchParams(location.search).get("focusProduct");
              if (id) window.__ffFocusProductId = id;
            } catch {
              /* ignore */
            }
          };
          const mo = new MutationObserver(captureFocusFromUrl);
          mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true });
          const urlPoll = setInterval(captureFocusFromUrl, 16);
          setTimeout(() => {
            clearInterval(urlPoll);
            mo.disconnect();
          }, 2500);

          target.click();
          const click = {
            ok: true,
            href,
            focusProductId,
            tag: target.tagName,
            aria: (target.getAttribute("aria-label") || "").slice(0, 80),
          };

          const samples = [];
          let i = 0;
          const tick = () => {
            const elapsed = performance.now() - window.__ffT0;
            while (i < sampleMs.length && elapsed + 0.5 >= sampleMs[i]) {
              const snap = window.__ffSnap();
              const actual = Math.round(performance.now() - window.__ffT0);
              const row = {
                elapsed_ms_target: sampleMs[i],
                elapsed_ms: actual,
                ...snap,
                tolerance,
              };
              window.__ffSamples.push(row);
              samples.push(row);
              i += 1;
            }
            if (i >= sampleMs.length) {
              resolve({
                click,
                samples,
                scroll_log: window.__ffScrollLog || [],
              });
              return;
            }
            requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }),
      { sampleMs: SAMPLE_MS, tolerance: TOLERANCE_PX }
    );

    out.click = bundled.click;
    if (!bundled.click?.ok) {
      out.errors.push(bundled.click?.reason || "click_fail");
      out.verdict = { FEATURED_FIRST_FRAME: "NOT_PROVEN", reason: bundled.click?.reason };
      return out;
    }

    const samples = bundled.samples || [];
    const scrollLog = bundled.scroll_log || [];
    out.samples = samples;
    out.scroll_log = scrollLog;
    out.verdict = analyzeDevice(samples, scrollLog, bundled.click);
    out.foreground_end = assertForegroundApk(serial);
  } catch (e) {
    out.errors.push(String(e?.stack || e));
    out.verdict = { FEATURED_FIRST_FRAME: "NOT_PROVEN", reason: "runtime_error" };
  } finally {
    try {
      await browser?.close();
    } catch {
      /* ignore */
    }
  }
  return out;
}

function mergeReport(results) {
  const phone = results.find((r) => r.role === "phone");
  const tablet = results.find((r) => r.role === "tablet");
  const anyFail = results.some((r) => r.verdict?.FEATURED_FIRST_FRAME === "FAIL");
  const anyNotProven = results.some(
    (r) =>
      !r.verdict?.FEATURED_FIRST_FRAME ||
      r.verdict.FEATURED_FIRST_FRAME === "NOT_PROVEN"
  );
  const allPass = results.every((r) => r.verdict?.FEATURED_FIRST_FRAME === "PASS");

  const pick = (key) => {
    const vals = results.map((r) => r.verdict?.[key]).filter((v) => v != null);
    return vals;
  };

  const rootCauseCandidates = results
    .map((r) => r.verdict?.FIRST_WRONG_FRAME_SOURCE)
    .filter(Boolean);
  const proven =
    !anyNotProven &&
    anyFail &&
    rootCauseCandidates.length > 0 &&
    rootCauseCandidates.every((c) => c === rootCauseCandidates[0]);

  return {
    FEATURED_FIRST_FRAME: allPass ? "PASS" : anyFail ? "FAIL" : "NOT_PROVEN",
    WRONG_INTERMEDIATE_FRAME: pick("WRONG_INTERMEDIATE_FRAME").includes("YES") ? "YES" : "NO",
    DOUBLE_LANDING: pick("DOUBLE_LANDING").includes("YES") ? "YES" : "NO",
    AUTOMATIC_SCROLL_COUNT: results.map((r) => ({
      role: r.role,
      count: r.verdict?.AUTOMATIC_SCROLL_COUNT ?? null,
    })),
    FIRST_FRAME_SCROLLTOP: results.map((r) => ({
      role: r.role,
      v: r.verdict?.FIRST_FRAME_SCROLLTOP ?? null,
    })),
    FINAL_SCROLLTOP: results.map((r) => ({
      role: r.role,
      v: r.verdict?.FINAL_SCROLLTOP ?? null,
    })),
    FIRST_FOCUS_DELTA: results.map((r) => ({
      role: r.role,
      v: r.verdict?.FIRST_FOCUS_DELTA ?? null,
    })),
    FINAL_FOCUS_DELTA: results.map((r) => ({
      role: r.role,
      v: r.verdict?.FINAL_FOCUS_DELTA ?? null,
    })),
    VIEWPORT_OVERFLOW: pick("VIEWPORT_OVERFLOW").includes("YES") ? "YES" : "NO",
    OVERFLOW_SOURCE: [...new Set(pick("OVERFLOW_SOURCE").filter(Boolean))],
    FIRST_WRONG_FRAME_SOURCE: [...new Set(pick("FIRST_WRONG_FRAME_SOURCE").filter(Boolean))],
    SECOND_CORRECTION_OWNER: [...new Set(pick("SECOND_CORRECTION_OWNER").filter(Boolean))],
    PHONE: phone?.verdict?.FEATURED_FIRST_FRAME ?? "NOT_RUN",
    TABLET: tablet?.verdict?.FEATURED_FIRST_FRAME ?? "NOT_RUN",
    ANDROID_APK: allPass ? "PASS" : anyFail ? "FAIL" : "NOT_PROVEN",
    ROOT_CAUSE: proven ? "PROVEN" : anyFail ? "PARTIAL" : "NOT_PROVEN",
    ROOT_CAUSE_DETAIL: rootCauseCandidates[0] || null,
    CODE_FIX_REQUIRED: anyFail ? "YES" : "NO",
    LOCK: {
      FEATURED_FOCUS_LANDING: "SUPERSEDED",
      FEATURED_FOCUS_FIRST_FRAME_LANDING: allPass
        ? "CLOSED"
        : anyFail
          ? "REOPEN_REQUIRED"
          : "NOT_PROVEN",
    },
  };
}

async function main() {
  const results = [];
  for (const d of DEVICES) {
    // eslint-disable-next-line no-console
    console.log(`[first-frame] start ${d.role} ${d.serial}`);
    const r = await runDevice(d);
    results.push(r);
    // eslint-disable-next-line no-console
    console.log(`[first-frame] done ${d.role}`, r.verdict?.FEATURED_FIRST_FRAME, r.errors);
  }
  const summary = mergeReport(results);
  const stamp = Date.now();
  const payload = {
    generatedAt: new Date().toISOString(),
    origin: ORIGIN,
    contract: "FIRST_USABLE_FRAME_EQ_FINAL_CORRECT_FOCUS_FRAME",
    sample_ms: SAMPLE_MS,
    summary,
    devices: results,
  };
  const latest = resolve(OUT_DIR, "featured-first-frame-landing-audit-latest.json");
  const stamped = resolve(OUT_DIR, `featured-first-frame-landing-audit-${stamp}.json`);
  writeFileSync(latest, JSON.stringify(payload, null, 2));
  writeFileSync(stamped, JSON.stringify(payload, null, 2));
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(summary, null, 2));
  // eslint-disable-next-line no-console
  console.log(`wrote ${latest}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * FEATURED FOCUS ENTRY — Production APK WebView gate
 * Contract: TRANSITION → FIRST STORE FRAME = FINAL CORRECT FRAME
 *
 * Separates:
 * - JS_SCROLL_API_CALL_COUNT (scrollIntoView / scrollTo / scrollTop setter)
 * - VISIBLE_VIEWPORT_CORRECTION_COUNT (scroll while !preparing && store content visible)
 *
 * PLAYWRIGHT_BASE_URL=https://samarket.vercel.app \
 * node scripts/qa/delivery-featured-focus-entry-gate.mjs
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
const RUNS = Math.max(1, Number(process.env.FOCUS_ENTRY_RUNS || 5));
const TOL = 8;
mkdirSync(OUT_DIR, { recursive: true });

const DEVICES = (process.env.ANDROID_SERIAL
  ? [{ serial: process.env.ANDROID_SERIAL, role: process.env.DEVICE_ROLE || "device", cdpPort: 9650 }]
  : [
      { serial: "RFCY40PY2CA", role: "phone", cdpPort: 9650 },
      { serial: "8b37179f7d94", role: "tablet", cdpPort: 9651 },
    ]);

function adb(serial, ...args) {
  return spawnSync(ADB, ["-s", serial, ...args], { encoding: "utf8" });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function assertForegroundApk(serial) {
  const dump = adb(serial, "shell", "dumpsys", "activity", "activities");
  const text = `${dump.stdout || ""}\n${dump.stderr || ""}`;
  const m =
    text.match(/mResumedActivity:.*? ([a-zA-Z0-9_.]+)\/([a-zA-Z0-9_.]+)/) ||
    text.match(/topResumedActivity=ActivityRecord\{[^}]* ([a-zA-Z0-9_.]+)\/([a-zA-Z0-9_.]+)/);
  const pkg = m?.[1] || null;
  return { pkg, ok: pkg === DIBAY_PKG };
}

async function installHooks(page) {
  await page.evaluate(() => {
    if (window.__feHooked) return;
    window.__feHooked = true;
    window.__feT0 = null;
    window.__feScrollLog = [];
    window.__feFocusId = null;
    window.__feMarks = { transitionFirst: null, storeFirst: null };

    const recordScroll = (source, detail = {}) => {
      if (window.__feT0 == null) return;
      const preparing = Boolean(document.querySelector('[data-store-focus-entry="preparing"]'));
      const onStore = /^\/stores\/(?!browse(?:\/|$))[^/]+/.test(location.pathname);
      window.__feScrollLog.push({
        t: performance.now() - window.__feT0,
        source,
        detail,
        preparing,
        onStore,
      });
    };

    const origScrollTo = Element.prototype.scrollTo;
    Element.prototype.scrollTo = function (...args) {
      let top = null;
      if (typeof args[0] === "number") top = args[1];
      else if (args[0] && typeof args[0] === "object") top = args[0].top;
      recordScroll("Element.scrollTo", { top, tag: this.tagName });
      return origScrollTo.apply(this, args);
    };

    const origIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (...args) {
      recordScroll("Element.scrollIntoView", { tag: this.tagName, id: this.id || null });
      return origIntoView.apply(this, args);
    };

    const w = window.scrollTo.bind(window);
    window.scrollTo = (...args) => {
      let top = null;
      if (typeof args[0] === "number") top = args[1];
      else if (args[0] && typeof args[0] === "object") top = args[0].top;
      recordScroll("window.scrollTo", { top });
      return w(...args);
    };

    const desc = Object.getOwnPropertyDescriptor(Element.prototype, "scrollTop");
    if (desc?.set) {
      Object.defineProperty(Element.prototype, "scrollTop", {
        configurable: true,
        enumerable: desc.enumerable,
        get: desc.get,
        set(v) {
          recordScroll("scrollTop_setter", { top: Number(v), tag: this.tagName });
          return desc.set.call(this, v);
        },
      });
    }

    window.__feSnap = () => {
      const vh = window.innerHeight;
      const vw = window.innerWidth;
      const preparing = Boolean(document.querySelector('[data-store-focus-entry="preparing"]'));
      const onStore = /^\/stores\/(?!browse(?:\/|$))[^/]+/.test(location.pathname);
      const q = new URLSearchParams(location.search);
      const focusId = (window.__feFocusId || q.get("focusProduct") || "").trim() || null;
      const main = document.querySelector("main") || document.documentElement;
      const scrollTop = Math.round(main?.scrollTop || window.scrollY || 0);
      const tabs =
        document.querySelector("[data-store-category-tabs]") ||
        document.querySelector('[role="tablist"]');
      const activeTab =
        tabs?.querySelector('[aria-selected="true"], [data-state="active"]') ||
        tabs?.querySelector("button[aria-current]");
      const selectedCategory = (activeTab?.textContent || "").trim().slice(0, 80) || null;
      const stickyBottom = Math.round(tabs?.getBoundingClientRect().bottom || 0);
      const focusEl = focusId ? document.getElementById(`store-menu-product-${focusId}`) : null;
      const focusR = focusEl?.getBoundingClientRect();
      const delta =
        focusR && stickyBottom > 0 ? Math.round(focusR.top - stickyBottom) : null;
      const spacer = document.querySelector("[data-store-menu-focus-scroll-spacer]");
      const spacerH = spacer ? Math.round(spacer.getBoundingClientRect().height) : null;
      const focusInView =
        !!focusR &&
        focusR.height > 0 &&
        focusR.top < vh - 2 &&
        focusR.bottom > (stickyBottom || 0) + 2;
      const overflow =
        (spacerH != null && spacerH > vh * 0.4 && scrollTop < 8 && !preparing && onStore) ||
        (stickyBottom > vh && !preparing && onStore);

      if (preparing && window.__feMarks.transitionFirst == null && window.__feT0 != null) {
        window.__feMarks.transitionFirst = performance.now() - window.__feT0;
      }
      if (
        onStore &&
        !preparing &&
        focusInView &&
        window.__feMarks.storeFirst == null &&
        window.__feT0 != null
      ) {
        window.__feMarks.storeFirst = performance.now() - window.__feT0;
      }

      return {
        href: location.pathname + location.search,
        onStore,
        preparing,
        scrollTop,
        selectedCategory,
        focusId,
        focusedProductExists: Boolean(focusEl),
        focusTop: focusR ? Math.round(focusR.top) : null,
        stickyBottom,
        delta,
        focusInView,
        spacerH,
        overflow,
        viewport: { width: vw, height: vh },
        hasFocusQuery: q.has("focusProduct"),
      };
    };
  });
}

async function waitBrowse(page, timeoutMs = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const ok = await page.evaluate(() =>
      [...document.querySelectorAll("button,a")].some((el) => {
        const aria = el.getAttribute("aria-label") || "";
        return /View menu|메뉴 보기|KIMBAP/i.test(aria);
      })
    );
    if (ok) return true;
    await sleep(400);
  }
  return false;
}

function coalesceApiScrolls(log) {
  const api = log.filter((e) =>
    /scrollIntoView|scrollTo|scrollTop_setter/.test(e.source || "")
  );
  const distinct = [];
  for (const e of api) {
    const last = distinct[distinct.length - 1];
    if (last && Math.abs(last.t - e.t) < 50) {
      last.t = e.t;
      last.source = `${last.source}+${e.source}`;
      last.detail = e.detail;
      continue;
    }
    distinct.push({ ...e });
  }
  return distinct;
}

async function runOnce(page) {
  await page.evaluate(() => {
    window.__feT0 = null;
    window.__feScrollLog = [];
    window.__feFocusId = null;
    window.__feMarks = { transitionFirst: null, storeFirst: null };
  });

  return page.evaluate(
    ({ tol }) =>
      new Promise((resolve) => {
        window.__feT0 = performance.now();
        window.__feScrollLog = [];
        window.__feMarks = { transitionFirst: null, storeFirst: null };

        const target =
          [...document.querySelectorAll("button,a")].find((el) => {
            const aria = el.getAttribute("aria-label") || "";
            return /KIMBAP/i.test(aria) && /MAN-CHOO|메뉴|View/i.test(aria);
          }) ||
          [...document.querySelectorAll("button,a")].find((el) => {
            const aria = el.getAttribute("aria-label") || "";
            return /메뉴 보기|View menu/i.test(aria);
          });

        if (!target) {
          resolve({ ok: false, reason: "no_target" });
          return;
        }

        const href = target.getAttribute("href");
        if (href?.includes("focusProduct=")) {
          try {
            window.__feFocusId = new URL(href, location.origin).searchParams.get("focusProduct");
          } catch {
            /* ignore */
          }
        }
        const urlPoll = setInterval(() => {
          const id = new URLSearchParams(location.search).get("focusProduct");
          if (id) window.__feFocusId = id;
        }, 16);

        target.click();

        const samples = [];
        const sampleAt = [0, 50, 100, 150, 250, 400, 600, 800, 1000, 1200, 1500, 2000];
        let i = 0;
        let firstStoreSnap = null;
        let preStrip = null;
        let postStrip = null;
        let sawQ = false;

        const tick = () => {
          const elapsed = performance.now() - window.__feT0;
          while (i < sampleAt.length && elapsed + 0.5 >= sampleAt[i]) {
            const snap = window.__feSnap();
            const row = { elapsed_ms: Math.round(performance.now() - window.__feT0), ...snap };
            samples.push(row);
            if (snap.hasFocusQuery && snap.focusInView) {
              sawQ = true;
              preStrip = { scrollTop: snap.scrollTop, delta: snap.delta };
            } else if (sawQ && !snap.hasFocusQuery && !postStrip && snap.focusInView) {
              postStrip = { scrollTop: snap.scrollTop, delta: snap.delta };
            }
            if (!firstStoreSnap && snap.onStore && !snap.preparing && snap.focusInView) {
              firstStoreSnap = row;
            }
            i += 1;
          }
          if (i >= sampleAt.length) {
            clearInterval(urlPoll);
            const log = window.__feScrollLog || [];
            const api = log.filter((e) =>
              /scrollIntoView|scrollTo|scrollTop_setter/.test(e.source || "")
            );
            const distinctApi = [];
            for (const e of api) {
              const last = distinctApi[distinctApi.length - 1];
              if (last && Math.abs(last.t - e.t) < 50) {
                last.t = e.t;
                last.source = `${last.source}+${e.source}`;
                continue;
              }
              distinctApi.push({ ...e });
            }
            const visibleCorrections = distinctApi.filter(
              (e) => e.onStore && e.preparing === false
            );
            const final = samples[samples.length - 1];
            const wrong = samples.some(
              (s) =>
                s.onStore &&
                !s.preparing &&
                s.scrollTop < 8 &&
                s.selectedCategory != null &&
                !s.focusInView
            );
            const urlStripChange =
              preStrip && postStrip
                ? Math.abs(preStrip.scrollTop - postStrip.scrollTop) +
                  Math.abs((preStrip.delta ?? 0) - (postStrip.delta ?? 0))
                : 0;

            resolve({
              ok: true,
              marks: window.__feMarks,
              samples,
              firstStoreSnap,
              final,
              jsScrollApiCallCount: distinctApi.length,
              visibleViewportCorrectionCount: visibleCorrections.length,
              scrolls: distinctApi.map((e) => ({
                t: Math.round(e.t),
                source: e.source,
                top: e.detail?.top ?? null,
                preparing: e.preparing,
                onStore: e.onStore,
              })),
              wrongIntermediate: wrong,
              maxStickyBottom: Math.max(
                0,
                ...samples.filter((s) => !s.preparing).map((s) => s.stickyBottom || 0)
              ),
              viewportHeight: final?.viewport?.height ?? null,
              overflow: samples.some((s) => s.overflow && s.onStore && !s.preparing),
              urlStripPositionChange: urlStripChange,
              preparingSeen: samples.some((s) => s.preparing),
              transitionImmediate:
                window.__feMarks.transitionFirst != null
                  ? window.__feMarks.transitionFirst < 400
                  : samples.some((s) => s.preparing && s.elapsed_ms < 800),
            });
            return;
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    { tol: TOL }
  );
}

function judgeRun(run) {
  if (!run?.ok) return { pass: false, reason: run?.reason || "fail" };
  const first = run.firstStoreSnap;
  const final = run.final;
  const firstDelta = first?.delta;
  const finalDelta = final?.delta;
  const visibleCorrection = (run.visibleViewportCorrectionCount || 0) > 0;
  const doubleLanding = visibleCorrection || (run.wrongIntermediate && (firstDelta != null));
  const catOk = /KIMBAP/i.test(first?.selectedCategory || "");
  const deltaClose =
    firstDelta != null &&
    finalDelta != null &&
    Math.abs(firstDelta) <= TOL &&
    Math.abs(finalDelta) <= TOL &&
    Math.abs(firstDelta - finalDelta) <= TOL;

  const pass =
    run.wrongIntermediate === false &&
    visibleCorrection === false &&
    doubleLanding === false &&
    run.overflow === false &&
    first != null &&
    catOk &&
    deltaClose &&
    (run.urlStripPositionChange ?? 0) <= 2 &&
    (run.maxStickyBottom || 0) < (run.viewportHeight || 9999);

  return {
    pass,
    TRANSITION_IMMEDIATE: run.transitionImmediate || run.preparingSeen,
    PREPARING_SEEN: run.preparingSeen,
    WRONG_INTERMEDIATE_FRAME: run.wrongIntermediate ? "YES" : "NO",
    FIRST_STORE_CATEGORY: first?.selectedCategory ?? null,
    FIRST_FOCUS_DELTA: firstDelta ?? null,
    FINAL_FOCUS_DELTA: finalDelta ?? null,
    JS_SCROLL_API_CALL_COUNT: run.jsScrollApiCallCount ?? 0,
    VISIBLE_VIEWPORT_CORRECTION_COUNT: run.visibleViewportCorrectionCount ?? 0,
    VISIBLE_SCROLL_CORRECTION: visibleCorrection ? "YES" : "NO",
    DOUBLE_LANDING: doubleLanding ? "YES" : "NO",
    URL_STRIP_POSITION_CHANGE: run.urlStripPositionChange ?? 0,
    OVERFLOW: run.overflow ? "YES" : "NO",
    MAX_STICKY_BOTTOM: run.maxStickyBottom,
    VIEWPORT_HEIGHT: run.viewportHeight,
    scrolls: run.scrolls,
  };
}

async function runDevice(device) {
  const out = { ...device, origin: ORIGIN, surface: "APK_WEBVIEW", runs: [], errors: [] };
  adb(device.serial, "shell", "am", "force-stop", DIBAY_PKG);
  await sleep(800);
  launchApkMainActivity(adb, device.serial, ACT);
  await sleep(5000);
  out.foreground = assertForegroundApk(device.serial);
  if (!out.foreground.ok) {
    out.errors.push("foreground_not_apk");
    return out;
  }

  let sock;
  try {
    sock = forwardCdp(adb, device.serial, device.cdpPort);
  } catch (e) {
    out.errors.push(String(e.message || e));
    return out;
  }
  out.webview_socket = sock;

  let browser;
  let page;
  try {
    ({ browser, page } = await connectWebView(chromium, device.cdpPort));
  } catch (e) {
    out.errors.push(`cdp: ${e.message}`);
    return out;
  }

  try {
    await navigateApkWebView(page, `${ORIGIN}/stores/browse/restaurant?sub=korean`, 10000);
    await installHooks(page);
    if (!(await waitBrowse(page))) {
      out.errors.push("browse_not_ready");
      return out;
    }

    for (let i = 0; i < RUNS; i++) {
      if (i > 0) {
        await navigateApkWebView(page, `${ORIGIN}/stores/browse/restaurant?sub=korean`, 6000);
        await installHooks(page);
        await waitBrowse(page);
      }
      const raw = await runOnce(page);
      const judged = judgeRun(raw);
      out.runs.push({ run: i + 1, ...judged });
      // eslint-disable-next-line no-console
      console.log(`[${device.role}] run ${i + 1}`, judged.pass ? "PASS" : "FAIL", judged);
      await sleep(800);
    }
  } catch (e) {
    out.errors.push(String(e?.stack || e));
  } finally {
    try {
      await browser?.close();
    } catch {
      /* ignore */
    }
  }

  const passCount = out.runs.filter((r) => r.pass).length;
  out.summary = {
    passCount,
    total: RUNS,
    pass: passCount === RUNS && out.errors.length === 0,
  };
  return out;
}

async function main() {
  const devices = [];
  for (const d of DEVICES) {
    // eslint-disable-next-line no-console
    console.log("APK gate start", d.role, ORIGIN);
    devices.push(await runDevice(d));
  }
  const phone = devices.find((d) => d.role === "phone");
  const tablet = devices.find((d) => d.role === "tablet");
  const allPass = phone?.summary?.pass && tablet?.summary?.pass;
  const report = {
    generatedAt: new Date().toISOString(),
    origin: ORIGIN,
    surface: "APK_WEBVIEW_PRODUCTION",
    metrics_contract: {
      JS_SCROLL_API_CALL_COUNT: "scrollIntoView|scrollTo|scrollTop_setter (coalesced <50ms)",
      VISIBLE_VIEWPORT_CORRECTION_COUNT: "API scrolls while onStore && !preparing",
    },
    PHONE_5_5: phone?.summary?.pass ? "PASS" : `FAIL ${phone?.summary?.passCount ?? 0}/${RUNS}`,
    TABLET_5_5: tablet?.summary?.pass ? "PASS" : `FAIL ${tablet?.summary?.passCount ?? 0}/${RUNS}`,
    ANDROID_APK: allPass ? "PASS" : "FAIL",
    GATE: allPass ? "PASS" : "FAIL",
    FEATURED_FOCUS_FIRST_FRAME_LANDING: allPass ? "CLOSED" : "REOPEN",
    devices,
  };
  const latest = resolve(OUT_DIR, "featured-focus-entry-apk-production-gate-latest.json");
  writeFileSync(latest, JSON.stringify(report, null, 2));
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        GATE: report.GATE,
        PHONE_5_5: report.PHONE_5_5,
        TABLET_5_5: report.TABLET_5_5,
        ANDROID_APK: report.ANDROID_APK,
        FEATURED_FOCUS_FIRST_FRAME_LANDING: report.FEATURED_FOCUS_FIRST_FRAME_LANDING,
      },
      null,
      2
    )
  );
  // eslint-disable-next-line no-console
  console.log("wrote", latest);
  if (report.GATE !== "PASS") process.exitCode = 2;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

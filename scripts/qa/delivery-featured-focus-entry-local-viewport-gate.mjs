/**
 * Local Playwright viewport gate for featured focus entry (dev origin).
 * Phone/tablet viewports match APK device sizes used in prior audits.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const TOL = 8;
const RUNS = Math.max(1, Number(process.env.FOCUS_ENTRY_RUNS || 5));
const OUT = resolve("docs/perf/delivery-owner-ux-audit");
mkdirSync(OUT, { recursive: true });

const DEVICES = [
  { role: "phone", viewport: { width: 384, height: 832 } },
  { role: "tablet", viewport: { width: 1006, height: 601 } },
];

async function runOnce(page) {
  await page.goto(`${ORIGIN}/stores/browse/restaurant?sub=korean`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await page.waitForTimeout(2000);
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll("button,a")].some((el) =>
        /메뉴 보기|View menu|KIMBAP/i.test(el.getAttribute("aria-label") || "")
      ) ||
      [...document.querySelectorAll("a")].some((a) =>
        (a.getAttribute("href") || "").includes("focusProduct=")
      ),
    { timeout: 45000 }
  ).catch(() => null);
  await page.waitForTimeout(500);

  return page.evaluate(({ tol }) => {
    const orig = Element.prototype.scrollTo;
    const log = [];
    Element.prototype.scrollTo = function (...args) {
      let top = null;
      if (typeof args[0] === "number") top = args[1];
      else if (args[0] && typeof args[0] === "object") top = args[0].top;
      log.push({ t: performance.now(), source: "Element.scrollTo", top });
      return orig.apply(this, args);
    };
    // also observe scrollTop writes (auto path bypasses scrollTo)
    const desc = Object.getOwnPropertyDescriptor(Element.prototype, "scrollTop");
    if (desc?.set) {
      Object.defineProperty(Element.prototype, "scrollTop", {
        configurable: true,
        enumerable: desc.enumerable,
        get: desc.get,
        set(v) {
          log.push({ t: performance.now(), source: "scrollTop", top: Number(v) });
          return desc.set.call(this, v);
        },
      });
    }

    const t0 = performance.now();
    let focusId = null;
    const target =
      [...document.querySelectorAll("button,a")].find((el) =>
        /KIMBAP/i.test(el.getAttribute("aria-label") || "")
      ) ||
      [...document.querySelectorAll("a")].find((a) =>
        (a.getAttribute("href") || "").includes("focusProduct=")
      ) ||
      [...document.querySelectorAll("button,a")].find((el) =>
        /메뉴 보기|View menu/i.test(el.getAttribute("aria-label") || "")
      );
    if (!target) {
      Element.prototype.scrollTo = orig;
      return Promise.resolve({ ok: false, reason: "no_target" });
    }
    const href = target.getAttribute("href");
    if (href?.includes("focusProduct=")) {
      try {
        focusId = new URL(href, location.origin).searchParams.get("focusProduct");
      } catch {
        /* ignore */
      }
    }
    const poll = setInterval(() => {
      const id = new URLSearchParams(location.search).get("focusProduct");
      if (id) focusId = id;
    }, 16);
    target.click();

    return new Promise((resolve) => {
      const samples = [];
      const ats = [0, 50, 100, 150, 250, 400, 600, 800, 1000, 1200, 1500, 2000];
      let i = 0;
      let firstStore = null;
      let preStrip = null;
      let postStrip = null;
      let sawQ = false;

      const snap = () => {
        const preparing = !!document.querySelector('[data-store-focus-entry="preparing"]');
        const onStore = /^\/stores\/(?!browse(?:\/|$))[^/]+/.test(location.pathname);
        const main = document.querySelector("main") || document.documentElement;
        const scrollTop = Math.round(main.scrollTop || window.scrollY || 0);
        const tabs =
          document.querySelector("[data-store-category-tabs]") ||
          document.querySelector('[role="tablist"]');
        const stickyBottom = Math.round(tabs?.getBoundingClientRect().bottom || 0);
        const active = tabs?.querySelector('[aria-selected="true"],[data-state="active"]');
        const cat = (active?.textContent || "").trim().slice(0, 80) || null;
        const el = focusId ? document.getElementById(`store-menu-product-${focusId}`) : null;
        const r = el?.getBoundingClientRect();
        const delta = r && stickyBottom > 0 ? Math.round(r.top - stickyBottom) : null;
        const vh = innerHeight;
        const focusInView =
          !!r && r.height > 0 && r.top < vh - 2 && r.bottom > stickyBottom + 2;
        const spacer = document.querySelector("[data-store-menu-focus-scroll-spacer]");
        const spacerH = spacer ? Math.round(spacer.getBoundingClientRect().height) : null;
        const overflow =
          !preparing &&
          onStore &&
          ((spacerH != null && spacerH > vh * 0.4 && scrollTop < 8) || stickyBottom > vh);
        const hasQ = new URLSearchParams(location.search).has("focusProduct");
        return {
          preparing,
          onStore,
          scrollTop,
          cat,
          delta,
          stickyBottom,
          focusInView,
          overflow,
          vh,
          hasQ,
          spacerH,
        };
      };

      const tick = () => {
        const elapsed = performance.now() - t0;
        while (i < ats.length && elapsed + 0.5 >= ats[i]) {
          const s = { elapsed_ms: Math.round(performance.now() - t0), ...snap() };
          samples.push(s);
          if (s.hasQ && s.focusInView) {
            sawQ = true;
            preStrip = { scrollTop: s.scrollTop, delta: s.delta };
          } else if (sawQ && !s.hasQ && !postStrip && s.focusInView) {
            postStrip = { scrollTop: s.scrollTop, delta: s.delta };
          }
          if (!firstStore && s.onStore && !s.preparing && s.focusInView) firstStore = s;
          i += 1;
        }
        if (i >= ats.length) {
          clearInterval(poll);
          Element.prototype.scrollTo = orig;
          const afterT0 = log
            .map((e) => ({ t: Math.round(e.t - t0), top: e.top }))
            .filter((e) => e.t >= 0);
          // coalesce landing nudge (<50ms) as one authority operation
          const distinct = [];
          for (const e of afterT0) {
            const last = distinct[distinct.length - 1];
            if (last && Math.abs(last.t - e.t) < 50) {
              last.top = e.top;
              last.t = e.t;
              continue;
            }
            distinct.push({ ...e });
          }
          const final = samples[samples.length - 1];
          const wrongVisible = samples.some(
            (s) =>
              s.onStore &&
              !s.preparing &&
              s.scrollTop < 8 &&
              s.cat != null &&
              !s.focusInView
          );
          const urlStripChange =
            preStrip && postStrip
              ? Math.abs(preStrip.scrollTop - postStrip.scrollTop) +
                Math.abs((preStrip.delta ?? 0) - (postStrip.delta ?? 0))
              : 0;
          resolve({
            ok: true,
            preparingSeen: samples.some((s) => s.preparing),
            firstStore,
            final,
            autoScrollCount: distinct.length,
            scrolls: distinct,
            wrongVisible,
            overflow: samples.some((s) => s.overflow),
            maxSticky: Math.max(0, ...samples.map((s) => s.stickyBottom || 0)),
            urlStripChange,
            storeSamples: samples
              .filter((s) => s.onStore)
              .map((s) => ({
                t: s.elapsed_ms,
                prep: s.preparing,
                st: s.scrollTop,
                d: s.delta,
                cat: s.cat,
                inv: s.focusInView,
              })),
          });
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }, { tol: TOL });
}

function judge(raw) {
  if (!raw?.ok) return { pass: false, reason: raw?.reason || "fail" };
  const first = raw.firstStore;
  const pass =
    raw.wrongVisible === false &&
    raw.autoScrollCount <= 1 &&
    first != null &&
    first.focusInView === true &&
    first.delta != null &&
    Math.abs(first.delta) <= TOL &&
    raw.final?.delta != null &&
    Math.abs(raw.final.delta) <= TOL &&
    raw.overflow === false &&
    (raw.maxSticky || 0) < (first.vh || raw.final?.vh || 9999) &&
    (raw.urlStripChange ?? 0) <= 2;
  // preparingSeen optional: READY가 빠르면 transition frame만으로 허용 (인위적 min spinner 금지)
  return {
    pass,
    preparingSeen: raw.preparingSeen,
    wrongVisible: raw.wrongVisible,
    auto: raw.autoScrollCount,
    firstDelta: first?.delta ?? null,
    finalDelta: raw.final?.delta ?? null,
    firstCat: first?.cat ?? null,
    overflow: raw.overflow,
    maxSticky: raw.maxSticky,
    urlStripChange: raw.urlStripChange,
    scrolls: raw.scrolls,
    storeSamples: raw.storeSamples,
  };
}

async function main() {
  const out = { origin: ORIGIN, surface: "playwright_local_viewport", devices: [] };
  for (const d of DEVICES) {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: d.viewport,
      isMobile: d.role === "phone",
      hasTouch: true,
    });
    const page = await context.newPage();
    const runs = [];
    for (let i = 0; i < RUNS; i++) {
      const raw = await runOnce(page);
      const j = judge(raw);
      runs.push({ run: i + 1, ...j });
      // eslint-disable-next-line no-console
      console.log(d.role, i + 1, j.pass ? "PASS" : "FAIL", JSON.stringify(j));
    }
    out.devices.push({
      role: d.role,
      viewport: d.viewport,
      passCount: runs.filter((r) => r.pass).length,
      runs,
    });
    await browser.close();
  }
  const phone = out.devices.find((d) => d.role === "phone");
  const tablet = out.devices.find((d) => d.role === "tablet");
  out.summary = {
    PHONE: `${phone?.passCount ?? 0}/${RUNS}`,
    TABLET: `${tablet?.passCount ?? 0}/${RUNS}`,
    GATE: phone?.passCount === RUNS && tablet?.passCount === RUNS ? "PASS" : "FAIL",
  };
  const path = resolve(OUT, "featured-focus-entry-local-viewport-gate-latest.json");
  writeFileSync(path, JSON.stringify(out, null, 2));
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(out.summary, null, 2));
  // eslint-disable-next-line no-console
  console.log("wrote", path);
  if (out.summary.GATE !== "PASS") process.exitCode = 2;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

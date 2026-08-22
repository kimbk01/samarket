/**
 * Post-fix /mypage scroll-hide shake proof (product default, no CSS override).
 *
 * Expect after fix:
 *   navTranslateYStd/Max = 0, navToggleCount = 0, shakeScore ≈ 0
 *
 * PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 \
 * node scripts/qa/mypage-scroll-shake-postfix-runtime.mjs
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const OUT_DIR = resolve(process.cwd(), "docs/perf/mypage-scroll-shake-runtime");
const VP = { width: 390, height: 844 };

function avg(xs) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
function stdev(xs) {
  if (xs.length < 2) return 0;
  const m = avg(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const status = await fetch(`${ORIGIN}/mypage`)
    .then((r) => r.status)
    .catch(() => 0);
  if (status !== 200) {
    console.error(JSON.stringify({ error: "server_not_ready", status, origin: ORIGIN }, null, 2));
    process.exit(2);
  }

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: VP,
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
  const page = await ctx.newPage();
  await page.goto(`${ORIGIN}/mypage`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForSelector("[data-main-hub-scroll-body]", { timeout: 60000 });
  await page.waitForTimeout(2800);

  const detail = await page.evaluate(async () => {
    const root = document.querySelector("[data-main-hub-scroll-body]");
    const header = document.querySelector("[data-app-sticky-header]");
    const nav = document.querySelector(".app-bottom-nav-shell");
    const marker =
      document.querySelector("[data-mypage-ia]") ||
      document.querySelector("[data-mypage-flow-surface]") ||
      document.querySelector("main section") ||
      document.querySelector("main a, main h1, main h2");

    const out = {
      href: location.href,
      maxScroll: 0,
      navToggleCount: 0,
      navToggles: [],
      navTranslateSamples: [],
      anchorSamples: [],
      headerTopSamples: [],
      contentResiduals: [],
      clsScore: 0,
      layoutShiftCount: 0,
      headerDomMutations: 0,
      frames: 0,
      scrollHideOuterApplied: null,
    };

    if (!(root instanceof HTMLElement) || !marker || !nav) {
      out.error = !root ? "no_scroll_root" : !marker ? "no_marker" : "no_nav";
      return out;
    }

    out.maxScroll = Math.max(0, root.scrollHeight - root.clientHeight);
    out.scrollHideOuterApplied =
      nav.classList.contains("app-bottom-nav-shell--scroll-hidden") ||
      nav.classList.contains("app-bottom-nav-shell--scroll-visible");
    if (out.maxScroll < 120) {
      out.error = "not_enough_scroll_content";
      return out;
    }

    let po = null;
    try {
      po = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          if (e.entryType !== "layout-shift" || e.hadRecentInput) continue;
          out.clsScore += e.value;
          out.layoutShiftCount += 1;
        }
      });
      po.observe({ type: "layout-shift", buffered: true });
    } catch {}

    const headerMo =
      header &&
      new MutationObserver((recs) => {
        out.headerDomMutations += recs.length;
      });
    if (header && headerMo) headerMo.observe(header, { childList: true, subtree: true, attributes: true });

    const readTy = () => {
      const tr = getComputedStyle(nav).transform;
      if (!tr || tr === "none") return 0;
      const m = tr.match(/matrix\(([^)]+)\)/);
      if (m) return Number(m[1].split(",")[5]) || 0;
      const m3 = tr.match(/matrix3d\(([^)]+)\)/);
      if (m3) return Number(m3[1].split(",")[13]) || 0;
      return 0;
    };

    let lastHidden = nav.classList.contains("app-bottom-nav-shell--scroll-hidden");
    let lastY = root.scrollTop;
    let lastMarkerTop = marker.getBoundingClientRect().top;
    const t0 = performance.now();

    const sample = () => {
      out.frames += 1;
      const y = root.scrollTop;
      const dy = y - lastY;
      const markerTop = marker.getBoundingClientRect().top;
      const residual = markerTop - (lastMarkerTop - dy);
      if (Math.abs(dy) > 0.5 && Math.abs(residual) > 1.5) {
        out.contentResiduals.push(Number(residual.toFixed(3)));
      }
      out.anchorSamples.push(Number((markerTop + y).toFixed(3)));
      if (header) out.headerTopSamples.push(Number(header.getBoundingClientRect().top.toFixed(3)));
      const hidden = nav.classList.contains("app-bottom-nav-shell--scroll-hidden");
      const ty = readTy();
      out.navTranslateSamples.push({
        t: Math.round(performance.now() - t0),
        ty: Number(ty.toFixed(2)),
        hidden,
        scrollY: Math.round(y),
      });
      if (hidden !== lastHidden) {
        out.navToggleCount += 1;
        out.navToggles.push({ t: Math.round(performance.now() - t0), hidden, scrollY: Math.round(y), ty });
        lastHidden = hidden;
      }
      lastY = y;
      lastMarkerTop = markerTop;
    };

    const target = Math.min(out.maxScroll, Math.floor(out.maxScroll * 0.9));
    for (let i = 1; i <= 48; i++) {
      root.scrollTop = Math.round((target * i) / 48);
      root.dispatchEvent(new Event("scroll"));
      sample();
      await new Promise((r) => setTimeout(r, 16));
    }
    for (let i = 0; i < 12; i++) {
      sample();
      await new Promise((r) => setTimeout(r, 16));
    }
    const upTarget = Math.max(0, Math.round(target * 0.35));
    for (let i = 1; i <= 24; i++) {
      const from = root.scrollTop;
      root.scrollTop = Math.round(from + (upTarget - from) * (i / 24));
      root.dispatchEvent(new Event("scroll"));
      sample();
      await new Promise((r) => setTimeout(r, 16));
    }

    po?.disconnect();
    headerMo?.disconnect();
    out.clsScore = Number(out.clsScore.toFixed(5));
    out.finalScrollTop = Math.round(root.scrollTop);
    out.navClassName = nav.className;
    out.navTransform = getComputedStyle(nav).transform;
    out.navTranslateSamples = out.navTranslateSamples.filter((_, i) => i % 3 === 0).slice(0, 40);
    return out;
  });

  const box = await page.locator("[data-main-hub-scroll-body]").boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.6);
    for (let i = 0; i < 12; i++) {
      await page.mouse.wheel(0, 100);
      await page.waitForTimeout(30);
    }
  }

  const afterWheel = await page.evaluate(() => {
    const nav = document.querySelector(".app-bottom-nav-shell");
    return {
      navHidden: nav?.classList.contains("app-bottom-nav-shell--scroll-hidden") ?? null,
      navVisibleClass: nav?.classList.contains("app-bottom-nav-shell--scroll-visible") ?? null,
      navTransform: nav ? getComputedStyle(nav).transform : null,
      scrollTop: document.querySelector("[data-main-hub-scroll-body]")?.scrollTop ?? null,
    };
  });

  // Control: other hubs must still enable scroll-hide (probe needs >12px steps).
  // Prefer /philife; fall back to /stores|/market if feed scroll height is too small.
  async function probeScrollHideControl(pathname) {
    await page.goto(`${ORIGIN}${pathname}`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForSelector("[data-main-hub-scroll-body]", { timeout: 60000 }).catch(() => null);
    await page.waitForTimeout(2200);
    const box = await page.locator("[data-main-hub-scroll-body]").boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.55);
      for (let i = 0; i < 16; i++) {
        await page.mouse.wheel(0, 140);
        await page.waitForTimeout(40);
      }
    }
    return page.evaluate(async () => {
      const root = document.querySelector("[data-main-hub-scroll-body]");
      const nav = document.querySelector(".app-bottom-nav-shell");
      if (!(root instanceof HTMLElement) || !nav) return { error: "missing" };
      const maxScroll = Math.max(0, root.scrollHeight - root.clientHeight);
      let toggles = 0;
      let last = nav.classList.contains("app-bottom-nav-shell--scroll-hidden");
      // Large steps so each delta clears FAB_SCROLL_MOVE_THRESHOLD_PX (12).
      const target = Math.min(maxScroll, Math.max(80, Math.floor(maxScroll * 0.85)));
      const steps = Math.max(6, Math.min(18, Math.floor(target / 24)));
      for (let i = 1; i <= steps; i++) {
        root.scrollTop = Math.round((target * i) / steps);
        root.dispatchEvent(new Event("scroll"));
        root.dispatchEvent(new WheelEvent("wheel", { deltaY: 40, bubbles: true }));
        const hidden = nav.classList.contains("app-bottom-nav-shell--scroll-hidden");
        if (hidden !== last) {
          toggles += 1;
          last = hidden;
        }
        await new Promise((r) => setTimeout(r, 20));
      }
      return {
        pathname: location.pathname,
        maxScroll,
        navToggleCount: toggles,
        finalHidden: nav.classList.contains("app-bottom-nav-shell--scroll-hidden"),
        transform: getComputedStyle(nav).transform,
        scrollHideOuterApplied: document.documentElement.hasAttribute("data-bottom-nav-scroll-hide"),
      };
    });
  }

  let philife = await probeScrollHideControl("/philife");
  for (const alt of ["/stores", "/market"]) {
    if (philife.error) break;
    if (philife.navToggleCount > 0 || philife.finalHidden === true) break;
    if ((philife.maxScroll || 0) >= 200 && philife.navToggleCount > 0) break;
    const next = await probeScrollHideControl(alt);
    if (!next.error && (next.navToggleCount > 0 || next.finalHidden === true || (next.maxScroll || 0) > (philife.maxScroll || 0))) {
      philife = { ...next, controlFallbackFrom: philife.pathname || "/philife", prior: philife };
    }
  }

  await browser.close();

  const tys = (detail.navTranslateSamples || []).map((s) => s.ty);
  const anchors = detail.anchorSamples || [];
  const headerTops = detail.headerTopSamples || [];
  const residuals = detail.contentResiduals || [];

  const metrics = {
    error: detail.error || null,
    maxScroll: detail.maxScroll,
    frames: detail.frames,
    navToggleCount: detail.navToggleCount,
    navTranslateYStd: Number(stdev(tys).toFixed(3)),
    navTranslateYMaxAbs: Number(Math.max(0, ...tys.map((v) => Math.abs(v)), 0).toFixed(3)),
    anchorStd: Number(stdev(anchors).toFixed(3)),
    headerTopStd: Number(stdev(headerTops).toFixed(3)),
    contentResidualMaxAbs: Number(Math.max(0, ...residuals.map((v) => Math.abs(v)), 0).toFixed(3)),
    clsScore: detail.clsScore,
    headerDomMutations: detail.headerDomMutations,
    scrollHideOuterApplied: detail.scrollHideOuterApplied,
    afterWheel,
  };
  metrics.shakeScore = Number(
    (
      metrics.anchorStd * 2 +
      metrics.headerTopStd * 2 +
      metrics.contentResidualMaxAbs +
      metrics.navTranslateYStd * 0.15 +
      metrics.navToggleCount * 2
    ).toFixed(3)
  );

  const mypagePass =
    !metrics.error &&
    metrics.navToggleCount === 0 &&
    metrics.navTranslateYMaxAbs < 1 &&
    metrics.anchorStd < 1.5 &&
    metrics.headerTopStd < 1.5 &&
    metrics.clsScore < 0.01 &&
    metrics.shakeScore < 1;

  const otherPreserved =
    !philife.error && (philife.navToggleCount > 0 || philife.finalHidden === true || philife.maxScroll < 80);

  let verdict = "FAIL";
  if (mypagePass && otherPreserved) verdict = "PASS";
  else if (mypagePass && philife.error) verdict = "MYPAGE_PASS_CONTROL_NOT_PROVEN";
  else if (mypagePass && !otherPreserved) verdict = "MYPAGE_PASS_OTHER_ROUTE_REGRESSION";

  const report = {
    measured_at: new Date().toISOString(),
    origin: ORIGIN,
    viewport: VP,
    method: "post-fix product-default /mypage scroll + /philife control",
    verdict,
    mypagePass,
    otherRoutePreserved: otherPreserved,
    metrics,
    philifeControl: philife,
    detail,
  };

  const outPath = resolve(OUT_DIR, "mypage-scroll-shake-postfix-latest.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        verdict,
        mypagePass,
        otherRoutePreserved: otherPreserved,
        metrics,
        philifeControl: philife,
        outPath,
      },
      null,
      2
    )
  );
  if (verdict === "FAIL" || verdict === "MYPAGE_PASS_OTHER_ROUTE_REGRESSION") process.exitCode = 2;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * ARCH B parked-surface final gate.
 * PLAYWRIGHT_BASE_URL=http://127.0.0.1:3011 node scripts/perf/delivery-arch-b-final-gate.mjs
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const origin = (process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3011").replace(/\/$/, "");
const browsePath = process.env.DELIVERY_BROWSE_PATH ?? "/stores/browse/restaurant?sub=all";
const outDir = path.resolve(process.cwd(), "docs/perf/delivery-arch-b-final-gate");
mkdirSync(outDir, { recursive: true });

async function installProbe(page) {
  await page.addInitScript(() => {
    const probe = (window.__archBFinalProbe = {
      listeners: { active: {}, adds: {}, removes: {} },
      observers: {
        IntersectionObserver: { active: 0, created: 0, disconnected: 0 },
        ResizeObserver: { active: 0, created: 0, disconnected: 0 },
        MutationObserver: { active: 0, created: 0, disconnected: 0 },
      },
      timers: { timeouts: 0, intervals: 0, rafs: 0 },
      scrollIntoView: [],
      history: [],
      errors: [],
    });

    const listenerKeys = new WeakMap();
    const originalAdd = EventTarget.prototype.addEventListener;
    const originalRemove = EventTarget.prototype.removeEventListener;
    const captureOf = (opts) => (typeof opts === "boolean" ? opts : Boolean(opts?.capture));
    const typeKey = (target, type) => {
      if (target === window) return `window:${type}`;
      if (target === document) return `document:${type}`;
      return `element:${type}`;
    };
    EventTarget.prototype.addEventListener = function (type, listener, options) {
      if (listener) {
        let perTarget = listenerKeys.get(this);
        if (!perTarget) {
          perTarget = new Map();
          listenerKeys.set(this, perTarget);
        }
        const key = `${type}:${captureOf(options) ? 1 : 0}`;
        let listeners = perTarget.get(key);
        if (!listeners) {
          listeners = new Set();
          perTarget.set(key, listeners);
        }
        if (!listeners.has(listener)) {
          listeners.add(listener);
          const metric = typeKey(this, type);
          probe.listeners.active[metric] = (probe.listeners.active[metric] || 0) + 1;
          probe.listeners.adds[metric] = (probe.listeners.adds[metric] || 0) + 1;
        }
      }
      return originalAdd.call(this, type, listener, options);
    };
    EventTarget.prototype.removeEventListener = function (type, listener, options) {
      if (listener) {
        const key = `${type}:${captureOf(options) ? 1 : 0}`;
        const listeners = listenerKeys.get(this)?.get(key);
        if (listeners?.delete(listener)) {
          const metric = typeKey(this, type);
          probe.listeners.active[metric] = Math.max(0, (probe.listeners.active[metric] || 0) - 1);
          probe.listeners.removes[metric] = (probe.listeners.removes[metric] || 0) + 1;
        }
      }
      return originalRemove.call(this, type, listener, options);
    };

    const wrapObserver = (name) => {
      const Original = window[name];
      if (typeof Original !== "function") return;
      window[name] = class extends Original {
        constructor(callback, options) {
          super(callback, options);
          this.__archBObserved = 0;
          probe.observers[name].created += 1;
        }
        observe(target, options) {
          this.__archBObserved += 1;
          probe.observers[name].active += 1;
          return super.observe(target, options);
        }
        unobserve(target) {
          if (this.__archBObserved > 0) {
            this.__archBObserved -= 1;
            probe.observers[name].active = Math.max(0, probe.observers[name].active - 1);
          }
          return super.unobserve(target);
        }
        disconnect() {
          if (this.__archBObserved > 0) {
            probe.observers[name].active = Math.max(
              0,
              probe.observers[name].active - this.__archBObserved
            );
            this.__archBObserved = 0;
          }
          probe.observers[name].disconnected += 1;
          return super.disconnect();
        }
      };
    };
    wrapObserver("IntersectionObserver");
    wrapObserver("ResizeObserver");
    wrapObserver("MutationObserver");

    const originalSetTimeout = window.setTimeout.bind(window);
    const originalClearTimeout = window.clearTimeout.bind(window);
    const timeoutIds = new Set();
    window.setTimeout = (fn, ms, ...args) => {
      let id = 0;
      const wrapped = (...cbArgs) => {
        if (timeoutIds.delete(id)) probe.timers.timeouts -= 1;
        if (typeof fn === "function") return fn(...cbArgs);
        return undefined;
      };
      id = originalSetTimeout(wrapped, ms, ...args);
      timeoutIds.add(id);
      probe.timers.timeouts += 1;
      return id;
    };
    window.clearTimeout = (id) => {
      if (timeoutIds.delete(id)) probe.timers.timeouts -= 1;
      return originalClearTimeout(id);
    };

    const originalSetInterval = window.setInterval.bind(window);
    const originalClearInterval = window.clearInterval.bind(window);
    const intervalIds = new Set();
    window.setInterval = (fn, ms, ...args) => {
      const id = originalSetInterval(fn, ms, ...args);
      intervalIds.add(id);
      probe.timers.intervals += 1;
      return id;
    };
    window.clearInterval = (id) => {
      if (intervalIds.delete(id)) probe.timers.intervals -= 1;
      return originalClearInterval(id);
    };

    const originalRaf = window.requestAnimationFrame.bind(window);
    const originalCancelRaf = window.cancelAnimationFrame.bind(window);
    const rafIds = new Set();
    window.requestAnimationFrame = (callback) => {
      let id = 0;
      id = originalRaf((time) => {
        if (rafIds.delete(id)) probe.timers.rafs -= 1;
        callback(time);
      });
      rafIds.add(id);
      probe.timers.rafs += 1;
      return id;
    };
    window.cancelAnimationFrame = (id) => {
      if (rafIds.delete(id)) probe.timers.rafs -= 1;
      return originalCancelRaf(id);
    };

    const originalScrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (options) {
      probe.scrollIntoView.push({
        at: performance.now(),
        id: this.id || null,
        options: options ?? null,
        url: location.pathname + location.search,
      });
      return originalScrollIntoView.call(this, options);
    };

    const originalReplace = history.replaceState.bind(history);
    history.replaceState = (...args) => {
      probe.history.push({ type: "replace", at: performance.now(), url: String(args[2] ?? "") });
      return originalReplace(...args);
    };
    const originalPush = history.pushState.bind(history);
    history.pushState = (...args) => {
      probe.history.push({ type: "push", at: performance.now(), url: String(args[2] ?? "") });
      return originalPush(...args);
    };
    window.addEventListener("error", (event) => {
      probe.errors.push(String(event.message || event.error || event));
    });
  });
}

function installNetwork(page) {
  const requests = [];
  page.on("request", (request) => {
    const url = request.url();
    if (!url.startsWith(origin)) return;
    let kind = "other";
    if (/\/api\/stores\/[^/]+\/menus(?:\?|$)/.test(url)) kind = "menus";
    else if (/\/api\/stores\/browse(?:\?|$)/.test(url)) kind = "browse";
    else if (/delivery-serviceability/.test(url)) kind = "serviceability";
    else if (/\/api\/.*cart/.test(url)) kind = "cart";
    else if (/\/api\/stores\/[^/?]+(?:\?|$)/.test(url)) kind = "summary";
    else if (/_next\/.*\/stores\//.test(url)) kind = "route-prefetch";
    requests.push({ at: Date.now(), kind, url });
  });
  return requests;
}

async function probeSnapshot(page) {
  return page.evaluate(() => {
    const shell = document.querySelector("[data-delivery-presentation-shell]");
    const root =
      document.querySelector("[data-main-hub-scroll-body]") ||
      document.scrollingElement ||
      document.documentElement;
    const evidence = window.__dibayDeliveryPresentation ?? null;
    return {
      url: location.pathname + location.search,
      phase: shell?.getAttribute("data-delivery-slide-phase") ?? null,
      browseCount: document.querySelectorAll('[data-delivery-surface="browse"]').length,
      storeCount: document.querySelectorAll('[data-delivery-surface="store"]').length,
      storeSlugs: [...document.querySelectorAll("[data-delivery-store-slug]")].map((el) =>
        el.getAttribute("data-delivery-store-slug")
      ),
      nextChildren: document
        .querySelector("[data-delivery-next-children]")
        ?.getAttribute("data-delivery-next-children"),
      scrollTop: root?.scrollTop ?? window.scrollY ?? 0,
      scrollMax: root ? root.scrollHeight - root.clientHeight : 0,
      bodyTextLength: (document.body?.innerText || "").length,
      ready: document
        .querySelector("[data-store-detail-ready]")
        ?.getAttribute("data-store-detail-ready"),
      dataReady: document
        .querySelector("[data-store-detail-data-ready]")
        ?.getAttribute("data-store-detail-data-ready"),
      evidence,
      probe: structuredClone(window.__archBFinalProbe),
    };
  });
}

async function waitBrowseReady(page) {
  await page.waitForFunction(
    () =>
      document.querySelectorAll('[data-delivery-surface="browse"] li button').length > 0 &&
      Boolean(document.querySelector("[data-main-hub-scroll-body]")),
    null,
    { timeout: 60_000 }
  );
}

async function setRealBrowseScroll(page) {
  return page.evaluate(() => {
    const root =
      document.querySelector("[data-main-hub-scroll-body]") ||
      document.scrollingElement ||
      document.documentElement;
    const max = Math.max(0, root.scrollHeight - root.clientHeight);
    const target = Math.min(max, Math.max(900, Math.floor(max * 0.72)));
    root.scrollTop = target;
    return new Promise((resolve) =>
      requestAnimationFrame(() =>
        requestAnimationFrame(() =>
          resolve({ target, actual: root.scrollTop, max })
        )
      )
    );
  });
}

async function featuredTarget(page, rowIndex = 0) {
  return page.evaluate((index) => {
    const rows = [...document.querySelectorAll('[data-delivery-surface="browse"] li')];
    const visibleRows = rows.filter((row) => {
      const rect = row.getBoundingClientRect();
      return rect.bottom > 120 && rect.top < window.innerHeight - 80;
    });
    const row = visibleRows[index] || visibleRows[0] || rows[index] || rows[0];
    if (!row) return null;
    const buttons = [...row.querySelectorAll("button")];
    const featured =
      buttons.find((button) => button.querySelector("img")) ||
      buttons.find((button) => /\₱|More|더보기/i.test(button.textContent || "")) ||
      buttons[0];
    if (!featured) return null;
    const image = featured.querySelector("img");
    return {
      rowIndex: rows.indexOf(row),
      buttonIndex: buttons.indexOf(featured),
      text: (featured.textContent || "").trim().slice(0, 80),
      imageAlt: image?.getAttribute("alt") || null,
    };
  }, rowIndex);
}

async function visibleTarget(page) {
  return page.evaluate(() => {
    const rows = [...document.querySelectorAll('[data-delivery-surface="browse"] li')];
    for (const row of rows) {
      const buttons = [...row.querySelectorAll("button")];
      const button = buttons.find((candidate) => {
        const rect = candidate.getBoundingClientRect();
        return rect.top >= 120 && rect.bottom <= window.innerHeight - 80 && rect.height > 20;
      });
      if (button) {
        return {
          rowIndex: rows.indexOf(row),
          buttonIndex: buttons.indexOf(button),
          text: (button.textContent || "").trim().slice(0, 80),
          imageAlt: button.querySelector("img")?.getAttribute("alt") || null,
        };
      }
    }
    return null;
  });
}

async function clickTarget(page, target) {
  const row = page.locator('[data-delivery-surface="browse"] li').nth(target.rowIndex);
  await row.locator("button").nth(target.buttonIndex).click({ timeout: 10_000 });
  await page.waitForURL(
    (url) => url.pathname.startsWith("/stores/") && !url.pathname.includes("/browse"),
    { timeout: 30_000 }
  );
  await page.waitForFunction(
    () =>
      document
        .querySelector("[data-delivery-presentation-shell]")
        ?.getAttribute("data-delivery-slide-phase") === "idle_store",
    null,
    { timeout: 20_000 }
  );
  await page
    .waitForFunction(
      () => {
        const url = new URL(location.href);
        const events = window.__dibayDeliveryPresentation?.events || [];
        return (
          !url.searchParams.has("focusProduct") &&
          events.some((event) => event.name === "focusFinal") &&
          events.some((event) => event.name === "focusUrlCleanup")
        );
      },
      null,
      { timeout: 12_000 }
    )
    .catch(() => {});
}

async function prepareTargetForClick(page, target) {
  const row = page.locator('[data-delivery-surface="browse"] li').nth(target.rowIndex);
  await row.locator("button").nth(target.buttonIndex).scrollIntoViewIfNeeded();
  await page.waitForTimeout(50);
}

async function backWithTimeline(page) {
  await page.evaluate(() => {
    const root = () =>
      document.querySelector("[data-main-hub-scroll-body]") ||
      document.scrollingElement ||
      document.documentElement;
    window.__archBBackTimeline = [];
    const started = performance.now();
    const sample = () => {
      const shell = document.querySelector("[data-delivery-presentation-shell]");
      window.__archBBackTimeline.push({
        dt: performance.now() - started,
        url: location.pathname + location.search,
        phase: shell?.getAttribute("data-delivery-slide-phase") ?? null,
        scrollTop: root()?.scrollTop ?? window.scrollY ?? 0,
        storeCount: document.querySelectorAll('[data-delivery-surface="store"]').length,
      });
      if (performance.now() - started < 1_150) requestAnimationFrame(sample);
    };
    history.back();
    requestAnimationFrame(sample);
  });
  await page.waitForURL((url) => url.pathname.includes("/stores/browse/"), { timeout: 30_000 });
  await page.waitForFunction(
    () =>
      document
        .querySelector("[data-delivery-presentation-shell]")
        ?.getAttribute("data-delivery-slide-phase") === "idle",
    null,
    { timeout: 10_000 }
  );
  await page.waitForTimeout(1_050);
  return page.evaluate(() => window.__archBBackTimeline || []);
}

function eventCounts(snapshot, fromIndex = 0) {
  const events = snapshot.evidence?.events?.slice(fromIndex) ?? [];
  const count = (name) => events.filter((event) => event.name === name).length;
  return {
    events,
    focusIntent: count("focusIntentArm"),
    focusTargetReady: count("focusTargetReady"),
    focusLand: count("focusLand"),
    focusUrlCleanup: count("focusUrlCleanup"),
    focusFinal: events.filter((event) => event.name === "focusFinal"),
  };
}

function activeResourceVector(snapshot) {
  return {
    listeners: snapshot.probe.listeners.active,
    observers: Object.fromEntries(
      Object.entries(snapshot.probe.observers).map(([key, value]) => [key, value.active])
    ),
    timers: snapshot.probe.timers,
  };
}

async function runSoftSequence(browser, viewport) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
    isMobile: viewport.width < 600,
    hasTouch: true,
  });
  const page = await context.newPage();
  await installProbe(page);
  const requests = installNetwork(page);
  await page.goto(`${origin}${browsePath}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await waitBrowseReady(page);
  const baseline = await probeSnapshot(page);
  const firstTarget = await featuredTarget(page, 0);
  if (!firstTarget) throw new Error("No featured/store target found");

  const cycles = [];
  const runCycle = async (target, label) => {
    await prepareTargetForClick(page, target);
    const before = await probeSnapshot(page);
    const eventStart = before.evidence?.events?.length ?? 0;
    const scrollIntoViewStart = before.probe.scrollIntoView.length;
    const requestStart = requests.length;
    await clickTarget(page, target);
    const entered = await probeSnapshot(page);
    const storePath = entered.url;
    const focusProduct =
      [...(entered.evidence?.events ?? [])]
        .reverse()
        .find((event) => event.name === "focusIntentArm")?.detail?.productId ?? null;
    const parkedBrowseRequests = requests
      .slice(requestStart)
      .filter((request) => request.kind === "browse");
    const duringParkedScroll = entered.scrollTop;
    const timeline = await backWithTimeline(page);
    const after = await probeSnapshot(page);
    const counts = eventCounts(after, eventStart);
    const requestWindow = requests.slice(requestStart);
    const exactCounts = requestWindow.reduce((acc, request) => {
      acc[request.url] = (acc[request.url] || 0) + 1;
      return acc;
    }, {});
    cycles.push({
      label,
      target,
      storePath,
      focusProduct,
      before,
      entered,
      after,
      duringParkedScroll,
      timeline,
      focus: {
        ...counts,
        scrollIntoView: after.probe.scrollIntoView.slice(scrollIntoViewStart).filter(
          (item) =>
            item.id?.startsWith("store-sec-") ||
            item.id?.startsWith("store-menu-product-")
        ),
      },
      requests: requestWindow,
      duplicateRequests: Object.entries(exactCounts).filter(([, count]) => count > 1),
      parkedBrowseRequests,
      resources: activeResourceVector(after),
    });
  };

  await runCycle(firstTarget, "store-a-1");
  await runCycle(firstTarget, "store-a-2");
  const scrollBefore = await setRealBrowseScroll(page);
  const secondTarget = (await visibleTarget(page)) ?? firstTarget;
  await runCycle(secondTarget, "store-b-scroll");
  const final = await probeSnapshot(page);
  await context.close();
  return { viewport, baseline, scrollBefore, cycles, final };
}

async function runHardEntry(browser, href) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await installProbe(page);
  const requests = installNetwork(page);
  await page.goto(`${origin}${href}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForFunction(
    () => Boolean(document.querySelector("[data-store-detail-ready]")),
    null,
    { timeout: 30_000 }
  );
  await page.waitForTimeout(1_200);
  const snapshot = await probeSnapshot(page);
  const counts = eventCounts(snapshot);
  await context.close();
  return { href, snapshot, focus: counts, requests };
}

function resourceGrowth(sequence) {
  const vectors = sequence.cycles.map((cycle) => cycle.resources);
  const numericGrowth = (values) =>
    values.length > 1 && values.every((value, index) => index === 0 || value > values[index - 1]);
  const listenerKeys = new Set(
    vectors
      .flatMap((vector) => Object.keys(vector.listeners))
      .filter((key) => key.startsWith("window:") || key.startsWith("document:"))
  );
  const listenerGrowth = [...listenerKeys].filter((key) =>
    numericGrowth(vectors.map((vector) => vector.listeners[key] || 0))
  );
  const observerKeys = new Set(vectors.flatMap((vector) => Object.keys(vector.observers)));
  const observerGrowth = [...observerKeys].filter((key) =>
    numericGrowth(vectors.map((vector) => vector.observers[key] || 0))
  );
  const timerKeys = ["timeouts", "intervals", "rafs"];
  const timerGrowth = timerKeys.filter((key) =>
    numericGrowth(vectors.map((vector) => vector.timers[key] || 0))
  );
  return { listenerGrowth, observerGrowth, timerGrowth, vectors };
}

function scrollVerdict(cycle, expected) {
  const browseFrames = cycle.timeline.filter((sample) => sample.url.includes("/stores/browse/"));
  const first = browseFrames[0]?.scrollTop ?? null;
  const at500 =
    browseFrames.find((sample) => sample.dt >= 500)?.scrollTop ??
    browseFrames.at(-1)?.scrollTop ??
    null;
  const at1000 =
    browseFrames.find((sample) => sample.dt >= 1000)?.scrollTop ??
    browseFrames.at(-1)?.scrollTop ??
    null;
  const values = browseFrames.map((sample) => sample.scrollTop);
  const spread = values.length ? Math.max(...values) - Math.min(...values) : Infinity;
  return {
    expected,
    first,
    at500,
    at1000,
    spread,
    finalDelta: at1000 == null ? null : at1000 - expected,
    pass:
      expected > 800 &&
      first != null &&
      at1000 != null &&
      Math.abs(first - expected) <= 48 &&
      Math.abs(at1000 - expected) <= 48 &&
      spread <= 48,
  };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const phone = await runSoftSequence(browser, { width: 390, height: 844 });
  const firstStorePath = phone.cycles[0]?.storePath?.split("?")[0];
  const focusProduct = phone.cycles[0]?.focusProduct;
  const hard = await runHardEntry(browser, firstStorePath || "/stores/aa11");
  const hardFocus = focusProduct
    ? await runHardEntry(
        browser,
        `${firstStorePath}?focusProduct=${encodeURIComponent(focusProduct)}`
      )
    : null;
  const tablet = await runSoftSequence(browser, { width: 820, height: 1180 });
  await browser.close();

  const phoneGrowth = resourceGrowth(phone);
  const tabletGrowth = resourceGrowth(tablet);
  const firstScroll = scrollVerdict(phone.cycles[2], phone.cycles[2].before.scrollTop);
  const focus = phone.cycles[0].focus;
  const focusFinalDelta = focus.focusFinal.at(-1)?.detail?.deltaPx ?? null;
  const focusPass =
    focus.focusIntent === 1 &&
    focus.focusTargetReady === 1 &&
    focus.focusLand === 1 &&
    focus.focusUrlCleanup === 1 &&
    focus.scrollIntoView.length === 1 &&
    focus.focusFinal.length === 1;
  const phoneSurfacePass = phone.cycles.every(
    (cycle) =>
      cycle.entered.browseCount === 1 &&
      cycle.entered.storeCount === 1 &&
      cycle.after.browseCount === 1 &&
      cycle.after.storeCount === 0 &&
      cycle.entered.bodyTextLength > 80 &&
      cycle.after.bodyTextLength > 80
  );
  const phoneNetworkPass = phone.cycles.every(
    (cycle) =>
      cycle.duplicateRequests.filter(([url]) =>
        /\/api\/stores\/(browse|[^/]+\/menus|[^/]+\/delivery-serviceability|[^/?]+(?:\?|$))|\/api\/.*cart/.test(
          url
        )
      ).length === 0 && cycle.parkedBrowseRequests.length === 0
  );
  const storeIds = phone.final.evidence?.storeInstanceIds ?? [];
  const storeARelease =
    (phone.cycles[0].after.evidence?.storeUnmountCount ?? 0) >= 1 &&
    phone.cycles[0].after.storeCount === 0;
  const storeBPass =
    phone.cycles[2].entered.storeCount === 1 &&
    phone.cycles[2].after.storeCount === 0 &&
    new Set(storeIds).size === storeIds.length;

  const hardPass =
    hard.snapshot.storeCount === 0 &&
    hard.snapshot.nextChildren === "visible" &&
    hard.snapshot.ready === "1" &&
    hard.snapshot.bodyTextLength > 80;
  const hardFocusPass =
    hardFocus != null &&
    hardFocus.snapshot.ready === "1" &&
    hardFocus.focus.focusLand === 1 &&
    hardFocus.focus.focusUrlCleanup === 1;
  const tabletPass = tablet.cycles.every(
    (cycle) =>
      cycle.entered.storeCount === 1 &&
      cycle.after.storeCount === 0 &&
      cycle.entered.bodyTextLength > 80 &&
      cycle.after.bodyTextLength > 80
  );

  const verdicts = {
    focusOneLand: focusPass ? "PASS" : "FAIL",
    realScrollBack: firstScroll.pass ? "PASS" : "FAIL",
    phone390: phoneSurfacePass ? "PASS" : "FAIL",
    tablet820: tabletPass ? "PASS" : "FAIL",
    listenerGrowth: phoneGrowth.listenerGrowth.length === 0 ? "NONE" : "FAIL",
    observerGrowth: phoneGrowth.observerGrowth.length === 0 ? "NONE" : "FAIL",
    timerGrowth: phoneGrowth.timerGrowth.length === 0 ? "NONE" : "FAIL",
    networkDuplication: phoneNetworkPass ? "NONE" : "FAIL",
    storeARelease: storeARelease ? "YES" : "NO",
    storeB: storeBPass ? "PASS" : "FAIL",
    hardStore: hardPass ? "PASS" : "FAIL",
    hardFocus: hardFocusPass ? "PASS" : "FAIL",
    duplicateUi: phoneSurfacePass ? "NONE" : "FAIL",
    surfaceAccumulation:
      phone.final.storeCount === 0 && phone.final.browseCount === 1 ? "NONE" : "FAIL",
  };

  const report = {
    at: new Date().toISOString(),
    origin,
    browsePath,
    verdicts,
    focus: {
      intent: focus.focusIntent,
      targetReady: focus.focusTargetReady,
      land: focus.focusLand,
      scrollIntoView: focus.scrollIntoView.length,
      correction: Math.max(0, focus.focusLand - 1),
      urlCleanup: focus.focusUrlCleanup,
      finalDeltaPx: focusFinalDelta,
    },
    scroll: firstScroll,
    phone,
    phoneGrowth,
    hard,
    hardFocus,
    tablet,
    tabletGrowth,
  };
  const outFile = path.join(outDir, "final-gate-latest.json");
  writeFileSync(outFile, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ outFile, verdicts, focus: report.focus, scroll: firstScroll }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

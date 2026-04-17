const BASE_URL = process.env.SAMARKET_BASE_URL || "http://127.0.0.1:3000";
const TEST_USERNAME = process.env.SAMARKET_TEST_USERNAME || "aaaa";
const TEST_PASSWORD = process.env.SAMARKET_TEST_PASSWORD || "1234";
const TEST_EMAIL = process.env.SAMARKET_TEST_EMAIL || "aaaa@samarket.local";
const SOAK_DURATIONS_MS = (process.env.SAMARKET_SOAK_DURATIONS_MS || "60000,300000,600000")
  .split(",")
  .map((value) => Number.parseInt(value.trim(), 10))
  .filter((value) => Number.isFinite(value) && value >= 0);
const RUN_EXTRA_SCENARIOS = process.env.SAMARKET_RUN_EXTRA_SCENARIOS !== "0";
const BROWSER_PROFILE = process.env.SAMARKET_BROWSER_PROFILE || "";
const HOME_PATH = "/community-messenger";
const HOME_URL_CHATS = `${BASE_URL}${HOME_PATH}?section=chats`;
const HOME_URL_OPEN_CHAT = `${BASE_URL}${HOME_PATH}?section=open_chat`;
const ROOM_PATH_RE = /\/community-messenger\/rooms\/[^/?#]+/;
const EVENT_NAMES = [
  "kasama:trade-chat-unread-updated",
  "kasama:owner-hub-badge-refresh",
];
const REQUEST_BUCKETS = {
  authSession: "/api/auth/session",
  ownerHubBadge: "/api/me/store-owner-hub-badge",
  roomBootstrap: "/api/community-messenger/rooms/",
  homeBootstrap: "/api/community-messenger/bootstrap",
  homeSync: "/api/community-messenger/home-sync",
};
let activeHomeUrl = HOME_URL_CHATS;
let fallbackRoomHref = null;
let usedFallbackRoomNavigation = false;

function resolveBrowserProfile() {
  const raw = BROWSER_PROFILE.trim();
  if (!raw) return null;
  const [browserRaw, profileRaw] = raw.split(":");
  const browser = (browserRaw || "chrome").trim().toLowerCase();
  const profile = (profileRaw || "Default").trim() || "Default";
  if (browser === "edge") {
    return {
      channel: "msedge",
      userDataDir: "C:\\Users\\im2pa\\AppData\\Local\\Microsoft\\Edge\\User Data",
      profile,
    };
  }
  return {
    channel: "chrome",
    userDataDir: "C:\\Users\\im2pa\\AppData\\Local\\Google\\Chrome\\User Data",
    profile,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function round(value, digits = 1) {
  if (value == null || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function classifyLatency(ms) {
  if (ms <= 180) return "즉시";
  if (ms <= 420) return "약간";
  return "느림";
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function logProgress(message) {
  console.log(`[real-usage] ${message}`);
}

function createPhaseResult(label, durationMs) {
  return {
    label,
    durationMs,
    cycles: 0,
    enterLatenciesMs: [],
    returnLatenciesMs: [],
    requestCounts: {
      authSession: 0,
      ownerHubBadge: 0,
      roomBootstrap: 0,
      homeBootstrap: 0,
      homeSync: 0,
    },
    eventCounts: {
      "kasama:trade-chat-unread-updated": 0,
      "kasama:owner-hub-badge-refresh": 0,
    },
    uniqueEventKeys: {
      "kasama:trade-chat-unread-updated": new Set(),
      "kasama:owner-hub-badge-refresh": new Set(),
    },
    heapSamplesMb: [],
    minMainHeightPx: null,
    blankSamples: 0,
    lowMainSamples: 0,
    sampleCount: 0,
    errors: [],
    listOrderBefore: [],
    listOrderAfter: [],
    scrollBefore: null,
    scrollAfter: null,
  };
}

async function getHeapMb(page) {
  return page.evaluate(() => {
    const mem = performance.memory;
    if (!mem || typeof mem.usedJSHeapSize !== "number") return null;
    return mem.usedJSHeapSize / 1024 / 1024;
  });
}

async function installMetrics(page) {
  await page.addInitScript(({ eventNames }) => {
    const state = {
      events: [],
      samples: 0,
      blankSamples: 0,
      lowMainSamples: 0,
      minMainHeight: null,
      errors: [],
    };
    window.__SAMARKET_REAL_USAGE__ = state;

    const originalDispatch = window.dispatchEvent.bind(window);
    window.dispatchEvent = (event) => {
      try {
        if (event && event.type && eventNames.includes(event.type)) {
          const detail = event.detail && typeof event.detail === "object" ? event.detail : null;
          state.events.push({
            type: event.type,
            at: Date.now(),
            source: detail?.source ?? null,
            key: detail?.key ?? null,
          });
        }
      } catch {
        /* ignore */
      }
      return originalDispatch(event);
    };

    const sample = () => {
      try {
        const main = document.querySelector("main") || document.body;
        const homeFrame = document.querySelector("[data-cm-home-frame='true']");
        const homeState = homeFrame?.getAttribute("data-cm-home-state") || null;
        const homeSkeleton = document.querySelector("[data-cm-home-skeleton]");
        const homeListMounted = document.querySelector("[data-cm-home-list-mounted='true']");
        const homeEmptyState = document.querySelector("[data-cm-home-empty-state='true']");
        const rect = main?.getBoundingClientRect();
        const homeRect = homeFrame?.getBoundingClientRect();
        const height = rect ? rect.height : 0;
        const effectiveHeight = homeRect ? Math.max(height, homeRect.height) : height;
        const elementCount = main ? main.querySelectorAll("*").length : 0;
        const textLen = (main?.textContent || "").trim().length;
        state.samples += 1;
        if (state.minMainHeight == null || effectiveHeight < state.minMainHeight) {
          state.minMainHeight = effectiveHeight;
        }
        if (effectiveHeight < 160) {
          state.lowMainSamples += 1;
        }
        const homeLooksBlank =
          homeState === "skeleton"
            ? !homeSkeleton && effectiveHeight < 220
            : homeState === "list-ready" || homeState === "list-refreshing"
              ? !homeListMounted && !homeEmptyState
              : false;
        if ((effectiveHeight < 120 && elementCount < 8 && textLen < 24) || homeLooksBlank) {
          state.blankSamples += 1;
        }
      } catch {
        /* ignore */
      }
      requestAnimationFrame(sample);
    };

    window.addEventListener("error", (event) => {
      state.errors.push({
        type: "error",
        message: String(event.message || "unknown_error"),
      });
    });

    window.addEventListener("unhandledrejection", (event) => {
      state.errors.push({
        type: "unhandledrejection",
        message: String(event.reason?.message || event.reason || "unknown_rejection"),
      });
    });

    requestAnimationFrame(sample);
  }, { eventNames: EVENT_NAMES });
}

async function loginWithTestUser(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
  const candidates = Array.from(new Set([TEST_EMAIL, TEST_USERNAME]));

  for (const candidate of candidates) {
    logProgress(`login:start candidate=${candidate}`);
    await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
    logProgress(`login:ready candidate=${candidate}`);
    await page.locator('input[autocomplete="username"]').first().fill(candidate);
    logProgress(`login:filled-email candidate=${candidate}`);
    await page.locator('input[type="password"]').first().fill(TEST_PASSWORD);
    logProgress(`login:filled-password candidate=${candidate}`);
    await page.locator("form").first().getByRole("button", { name: "로그인" }).click();
    logProgress(`login:submitted candidate=${candidate}`);
    try {
      await page.waitForURL((url) => url.pathname !== "/login", {
        timeout: 15000,
        waitUntil: "commit",
      });
      logProgress(`login:success candidate=${candidate} path=${new URL(page.url()).pathname}`);
      return;
    } catch {
      const errorText = ((await page.textContent("body")) || "").replace(/\s+/g, " ").slice(0, 240);
      logProgress(`login:retry candidate=${candidate} body=${errorText}`);
    }
  }

  throw new Error("seed_login_failed");
}

async function waitForHomeReady(page) {
  logProgress(`waitForHomeReady:start activeHomeUrl=${activeHomeUrl}`);
  const hasRoomLinks = async () =>
    page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[href^="/community-messenger/rooms/"]'));
      return links.length > 0;
    });

  const waitForRoomLinks = async (timeoutMs) => {
    await page.waitForFunction(() => {
      const links = Array.from(document.querySelectorAll('a[href^="/community-messenger/rooms/"]'));
      return links.length > 0;
    }, null, { timeout: timeoutMs });
  };

  await page.goto(activeHomeUrl, { waitUntil: "domcontentloaded" });
  try {
    await waitForRoomLinks(12000);
    logProgress("waitForHomeReady:found links in current section");
    return;
  } catch {
    /* try open chat fallback */
  }

  activeHomeUrl = HOME_URL_OPEN_CHAT;
  logProgress("waitForHomeReady:fallback open_chat");
  await page.goto(activeHomeUrl, { waitUntil: "domcontentloaded" });
  try {
    await waitForRoomLinks(12000);
    logProgress("waitForHomeReady:found links in open_chat");
    return;
  } catch {
    /* create a lightweight room if the account has no rooms yet */
  }

  logProgress("waitForHomeReady:create fallback room");
  const createResult = await page.evaluate(async () => {
    const response = await fetch("/api/community-messenger/groups/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        groupType: "open_group",
        title: `Perf Probe ${Date.now()}`,
        summary: "",
        password: "",
        memberLimit: 60,
        isDiscoverable: false,
        joinPolicy: "free",
        identityPolicy: "real_name",
        creatorIdentityMode: "real_name",
      }),
    });
    const data = await response.json().catch(() => ({}));
    return {
      ok: response.ok && Boolean(data?.ok) && typeof data?.roomId === "string" && data.roomId.length > 0,
      status: response.status,
      error: data?.error ?? null,
      roomId: typeof data?.roomId === "string" ? data.roomId : null,
    };
  });

  if (!createResult.ok) {
    const pageText = ((await page.textContent("body")) || "").replace(/\s+/g, " ").slice(0, 300);
    throw new Error(
      `home_ready_failed:create_room status=${createResult.status} error=${createResult.error ?? "unknown"} text=${pageText}`
    );
  }

  await page.goto(activeHomeUrl, { waitUntil: "domcontentloaded" });
  if (!(await hasRoomLinks())) {
    try {
      await waitForRoomLinks(8000);
      logProgress("waitForHomeReady:links appeared after room creation");
    } catch {
      fallbackRoomHref = createResult.roomId
        ? `${HOME_PATH}/rooms/${encodeURIComponent(createResult.roomId)}`
        : null;
      logProgress(`waitForHomeReady:using direct fallback room href=${fallbackRoomHref}`);
      return;
    }
  }
  logProgress("waitForHomeReady:ready");
}

async function getRoomLinks(page, limit = 5) {
  return page.evaluate((value) => {
    return Array.from(document.querySelectorAll('a[href^="/community-messenger/rooms/"]'))
      .slice(0, value)
      .map((node) => ({
        href: node.getAttribute("href") || "",
        text: (node.textContent || "").trim().replace(/\s+/g, " ").slice(0, 120),
      }));
  }, limit);
}

async function openFirstRoomAndReturn(page) {
  const firstLink = page.locator('a[href^="/community-messenger/rooms/"]').first();
  let href = await firstLink.getAttribute("href");
  if (!href) {
    if (!fallbackRoomHref) {
      throw new Error("no_room_link_found");
    }
    href = fallbackRoomHref;
  }

  const enterStart = Date.now();
  if (await firstLink.count()) {
    await firstLink.click();
  } else {
    usedFallbackRoomNavigation = true;
    await page.goto(`${BASE_URL}${href}`, { waitUntil: "domcontentloaded" });
  }
  await page.waitForURL((url) => ROOM_PATH_RE.test(url.pathname), {
    timeout: 15000,
    waitUntil: "commit",
  });
  await page.waitForFunction(() => {
    const main = document.querySelector("main");
    return Boolean(main) && main.getBoundingClientRect().height > 240;
  }, null, { timeout: 15000 });
  const enterLatencyMs = Date.now() - enterStart;

  await page.waitForTimeout(350);

  const returnStart = Date.now();
  await page.goBack({ waitUntil: "domcontentloaded" });
  await page.waitForURL((url) => url.pathname === HOME_PATH, {
    timeout: 15000,
    waitUntil: "commit",
  });
  await page.waitForFunction(() => {
    const links = Array.from(document.querySelectorAll('a[href^="/community-messenger/rooms/"]'));
    return links.length > 0;
  }, null, { timeout: 15000 });
  const returnLatencyMs = Date.now() - returnStart;

  return { href, enterLatencyMs, returnLatencyMs };
}

async function readPageMetrics(page) {
  return page.evaluate(() => {
    const state = window.__SAMARKET_REAL_USAGE__;
    if (!state) {
      return {
        events: [],
        samples: 0,
        blankSamples: 0,
        lowMainSamples: 0,
        minMainHeight: null,
        errors: [],
      };
    }
    return {
      events: Array.isArray(state.events) ? state.events.slice() : [],
      samples: state.samples ?? 0,
      blankSamples: state.blankSamples ?? 0,
      lowMainSamples: state.lowMainSamples ?? 0,
      minMainHeight: state.minMainHeight ?? null,
      errors: Array.isArray(state.errors) ? state.errors.slice() : [],
    };
  });
}

async function resetPageMetrics(page) {
  await page.evaluate(() => {
    const state = window.__SAMARKET_REAL_USAGE__;
    if (!state) return;
    state.events = [];
    state.samples = 0;
    state.blankSamples = 0;
    state.lowMainSamples = 0;
    state.minMainHeight = null;
    state.errors = [];
  });
}

function foldPageMetrics(phase, pageMetrics) {
  phase.blankSamples += pageMetrics.blankSamples || 0;
  phase.lowMainSamples += pageMetrics.lowMainSamples || 0;
  phase.sampleCount += pageMetrics.samples || 0;
  phase.minMainHeightPx =
    phase.minMainHeightPx == null
      ? pageMetrics.minMainHeight
      : Math.min(phase.minMainHeightPx, pageMetrics.minMainHeight ?? phase.minMainHeightPx);
  for (const error of pageMetrics.errors || []) {
    phase.errors.push(error);
  }
  for (const event of pageMetrics.events || []) {
    if (!phase.eventCounts[event.type]) continue;
    phase.eventCounts[event.type] += 1;
    if (event.key) {
      phase.uniqueEventKeys[event.type].add(String(event.key));
    }
  }
}

async function runHomeRoomSoak(page, phase) {
  logProgress(`phase:${phase.label}:start`);
  await waitForHomeReady(page);
  await resetPageMetrics(page);
  phase.listOrderBefore = await getRoomLinks(page, 5);
  await page.evaluate(() => window.scrollTo(0, 480));
  await page.waitForTimeout(120);
  phase.scrollBefore = await page.evaluate(() => Math.round(window.scrollY));
  phase.heapSamplesMb.push(round(await getHeapMb(page)));

  const startedAt = Date.now();
  while (Date.now() - startedAt < phase.durationMs) {
    const cycle = await openFirstRoomAndReturn(page);
    phase.cycles += 1;
    logProgress(
      `phase:${phase.label}:cycle=${phase.cycles} enter=${cycle.enterLatencyMs}ms return=${cycle.returnLatencyMs}ms`
    );
    phase.enterLatenciesMs.push(cycle.enterLatencyMs);
    phase.returnLatenciesMs.push(cycle.returnLatencyMs);
    phase.heapSamplesMb.push(round(await getHeapMb(page)));
    await page.waitForTimeout(500);
  }

  phase.listOrderAfter = await getRoomLinks(page, 5);
  phase.scrollAfter = await page.evaluate(() => Math.round(window.scrollY));
  foldPageMetrics(phase, await readPageMetrics(page));
  logProgress(`phase:${phase.label}:done cycles=${phase.cycles}`);
}

async function runBottomNavScenario(page) {
  logProgress("bottomNav:start");
  const result = {
    navs: [],
    requestCounts: {
      authSession: 0,
      ownerHubBadge: 0,
      roomBootstrap: 0,
      homeBootstrap: 0,
      homeSync: 0,
    },
  };
  const targets = ["/home", "/community-messenger", "/my"];
  await waitForHomeReady(page);

  for (let roundIndex = 0; roundIndex < 3; roundIndex += 1) {
    for (const target of targets) {
      const locator = page.locator(`a[href="${target}"]`).first();
      if ((await locator.count()) < 1) continue;
      const start = Date.now();
      await locator.click();
      await page.waitForURL((url) => url.pathname === target, {
        timeout: 15000,
        waitUntil: "commit",
      });
      await page.waitForTimeout(250);
      result.navs.push({
        target,
        latencyMs: Date.now() - start,
      });
    }
  }
  logProgress("bottomNav:done");
  return result;
}

async function runHiddenVisibleScenario(context, page) {
  logProgress("hiddenVisible:start");
  await waitForHomeReady(page);
  await resetPageMetrics(page);
  const helperPage = await context.newPage();
  await helperPage.goto("about:blank");
  await helperPage.bringToFront();
  await helperPage.waitForTimeout(2500);
  await page.bringToFront();
  await page.waitForTimeout(1200);
  const open = await openFirstRoomAndReturn(page);
  const metrics = await readPageMetrics(page);
  await helperPage.close();
  logProgress("hiddenVisible:done");
  return {
    enterLatencyMs: open.enterLatencyMs,
    returnLatencyMs: open.returnLatencyMs,
    eventCounts: metrics.events.reduce((acc, event) => {
      acc[event.type] = (acc[event.type] || 0) + 1;
      return acc;
    }, {}),
    blankSamples: metrics.blankSamples || 0,
    lowMainSamples: metrics.lowMainSamples || 0,
  };
}

async function runOwnerHubBurstScenario(page) {
  logProgress("ownerHubBurst:start");
  await waitForHomeReady(page);
  await resetPageMetrics(page);
  await page.evaluate(() => {
    for (let i = 0; i < 10; i += 1) {
      window.dispatchEvent(new Event("kasama:owner-hub-badge-refresh"));
    }
  });
  await page.waitForTimeout(900);
  const metrics = await readPageMetrics(page);
  return {
    eventCount: metrics.events.filter((event) => event.type === "kasama:owner-hub-badge-refresh").length,
  };
}

function summarizePhase(phase) {
  const enterMedian = percentile(phase.enterLatenciesMs, 50);
  const enterP95 = percentile(phase.enterLatenciesMs, 95);
  const returnMedian = percentile(phase.returnLatenciesMs, 50);
  const returnP95 = percentile(phase.returnLatenciesMs, 95);
  const heapStart = phase.heapSamplesMb.find((value) => value != null) ?? null;
  const heapEnd = [...phase.heapSamplesMb].reverse().find((value) => value != null) ?? null;
  const heapPeak = phase.heapSamplesMb.reduce((max, value) => {
    if (value == null) return max;
    return max == null ? value : Math.max(max, value);
  }, null);
  return {
    label: phase.label,
    durationMin: round(phase.durationMs / 60000, 2),
    cycles: phase.cycles,
    enterLatency: {
      medianMs: enterMedian,
      p95Ms: enterP95,
      feel: enterMedian == null ? "unknown" : classifyLatency(enterMedian),
    },
    returnLatency: {
      medianMs: returnMedian,
      p95Ms: returnP95,
      feel: returnMedian == null ? "unknown" : classifyLatency(returnMedian),
    },
    requests: phase.requestCounts,
    events: {
      totalByType: phase.eventCounts,
      uniqueKeys: {
        "kasama:trade-chat-unread-updated":
          phase.uniqueEventKeys["kasama:trade-chat-unread-updated"].size,
        "kasama:owner-hub-badge-refresh":
          phase.uniqueEventKeys["kasama:owner-hub-badge-refresh"].size,
      },
    },
    memoryMb: {
      start: heapStart,
      end: heapEnd,
      peak: heapPeak,
    },
    ux: {
      blankSamples: phase.blankSamples,
      lowMainSamples: phase.lowMainSamples,
      totalSamples: phase.sampleCount,
      minMainHeightPx: round(phase.minMainHeightPx, 0),
      listOrderChanged:
        JSON.stringify(phase.listOrderBefore.map((item) => item.href)) !==
        JSON.stringify(phase.listOrderAfter.map((item) => item.href)),
      scrollJumpPx:
        phase.scrollBefore == null || phase.scrollAfter == null
          ? null
          : Math.abs(phase.scrollAfter - phase.scrollBefore),
    },
    errors: phase.errors,
  };
}

async function runRealUsageCheck({ chromium }) {
  const browserProfile = resolveBrowserProfile();
  let browser = null;
  let context = null;
  if (browserProfile) {
    logProgress(
      `launch:persistent channel=${browserProfile.channel} profile=${browserProfile.profile}`
    );
    context = await chromium.launchPersistentContext(browserProfile.userDataDir, {
      channel: browserProfile.channel,
      headless: false,
      viewport: { width: 390, height: 844 },
      args: [`--profile-directory=${browserProfile.profile}`],
    });
  } else {
    browser = await chromium.launch({
      channel: "chrome",
      headless: true,
    });
    context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
  }
  const page = context.pages()[0] ?? (await context.newPage());
  await installMetrics(page);

  let activePhase = null;
  page.on("request", (request) => {
    if (!activePhase) return;
    const url = request.url();
    if (url.includes(REQUEST_BUCKETS.authSession)) activePhase.requestCounts.authSession += 1;
    if (url.includes(REQUEST_BUCKETS.ownerHubBadge)) activePhase.requestCounts.ownerHubBadge += 1;
    if (
      url.includes(REQUEST_BUCKETS.roomBootstrap) &&
      url.includes("/bootstrap")
    ) {
      activePhase.requestCounts.roomBootstrap += 1;
    }
    if (url.includes(REQUEST_BUCKETS.homeBootstrap)) activePhase.requestCounts.homeBootstrap += 1;
    if (url.includes(REQUEST_BUCKETS.homeSync)) activePhase.requestCounts.homeSync += 1;
  });

  try {
    if (browserProfile) {
      await page.goto(HOME_URL_CHATS, { waitUntil: "domcontentloaded" });
      if (new URL(page.url()).pathname === "/login") {
        throw new Error(`browser_profile_not_authenticated:${browserProfile.channel}:${browserProfile.profile}`);
      }
      logProgress(`profile-auth:ok path=${new URL(page.url()).pathname}`);
    } else {
      await loginWithTestUser(page);
    }
    const phases = SOAK_DURATIONS_MS.map((durationMs, index) =>
      createPhaseResult(`${round(durationMs / 60000, 2)}min#${index + 1}`, durationMs)
    );

    const summaries = [];
    for (const phase of phases) {
      activePhase = phase;
      await runHomeRoomSoak(page, phase);
      activePhase = null;
      summaries.push(summarizePhase(phase));
    }

    let bottomNav = { navs: [] };
    let hiddenVisible = {
      enterLatencyMs: null,
      returnLatencyMs: null,
      eventCounts: {},
      blankSamples: 0,
      lowMainSamples: 0,
    };
    let ownerHubBurst = { eventCount: 0 };
    let ownerHubBurstPhase = createPhaseResult("ownerHubBurst", 0);
    if (RUN_EXTRA_SCENARIOS) {
      bottomNav = await runBottomNavScenario(page);
      hiddenVisible = await runHiddenVisibleScenario(context, page);
      activePhase = ownerHubBurstPhase;
      ownerHubBurst = await runOwnerHubBurstScenario(page);
      activePhase = null;
    }

    const output = {
      ok: true,
      baseUrl: BASE_URL,
      testUser: TEST_USERNAME,
      homeRoomSoak: summaries,
      bottomNav: {
        hops: bottomNav.navs.map((item) => ({
          target: item.target,
          latencyMs: item.latencyMs,
          feel: classifyLatency(item.latencyMs),
        })),
      },
      hiddenVisible: {
        ...hiddenVisible,
        feel: classifyLatency(hiddenVisible.enterLatencyMs),
      },
      ownerHubBurst: {
        eventCount: ownerHubBurst.eventCount,
        requestCounts: ownerHubBurstPhase.requestCounts,
      },
      fallbackRoomNavigationUsed: usedFallbackRoomNavigation,
    };

    return output;
  } finally {
    await context.close();
    if (browser) {
      await browser.close();
    }
  }
}

module.exports = {
  runRealUsageCheck,
};

if (require.main === module) {
  const { chromium } = require("playwright");
  runRealUsageCheck({ chromium })
    .then((output) => {
      console.log(JSON.stringify(output, null, 2));
    })
    .catch((error) => {
      console.error(
        JSON.stringify(
          {
            ok: false,
            error: error?.message || String(error),
            stack: error?.stack || null,
          },
          null,
          2
        )
      );
      process.exitCode = 1;
    });
}

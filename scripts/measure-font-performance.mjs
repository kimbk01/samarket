import { chromium } from "@playwright/test";
import fs from "node:fs/promises";

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const pages = [
  { label: "/home", path: "/home" },
  { label: "/stores", path: "/stores" },
  { label: "/community-messenger", path: "/community-messenger" },
  { label: "/mypage", path: "/mypage" },
];
const runs = Number(process.env.FONT_PERF_RUNS ?? 3);
const e2eUsername = process.env.E2E_TEST_USERNAME?.trim() || "aaaa";
const e2ePassword = process.env.E2E_TEST_PASSWORD ?? "1234";

const mobileContext = {
  viewport: { width: 360, height: 740 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent:
    "Mozilla/5.0 (Linux; Android 13; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
};

let authMode = "unknown";

async function createAuthenticatedStorageState(browser) {
  const context = await browser.newContext(mobileContext);
  const login = await context.request.post(new URL("/api/test-login", baseUrl).toString(), {
    headers: { "Content-Type": "application/json" },
    data: { username: e2eUsername, password: e2ePassword },
  });
  if (login.ok()) {
    authMode = "api-test-login";
    const state = await context.storageState();
    await context.close();
    return state;
  }

  try {
    const page = await context.newPage();
    page.on("dialog", (dialog) => dialog.accept().catch(() => undefined));
    await page.goto(new URL("/login?next=%2Fhome", baseUrl).toString(), {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await page.getByPlaceholder("이메일 또는 로그인 ID").fill(e2eUsername);
    await page.locator('input[type="password"]').fill(e2ePassword);
    await page.getByRole("button", { name: "로그인" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 45_000 });
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
    authMode = "password-login";
    const state = await context.storageState();
    await context.close();
    return state;
  } catch {
    await context.close();
    authMode = "fake-sb-cookie-proxy-pass";
    return {
      cookies: [
        {
          name: "sb-local-auth-token",
          value: "font-perf-proxy-pass",
          domain: new URL(baseUrl).hostname,
          path: "/",
          expires: Math.floor(Date.now() / 1000) + 3600,
          httpOnly: false,
          secure: false,
          sameSite: "Lax",
        },
      ],
      origins: [],
    };
  }
}

function round(value) {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null;
}

function sum(values) {
  return values.reduce((acc, v) => acc + (Number.isFinite(v) ? v : 0), 0);
}

function median(values) {
  const nums = values.filter((v) => typeof v === "number" && Number.isFinite(v)).sort((a, b) => a - b);
  if (nums.length === 0) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

function summarizePage(label, rows) {
  const fcp = rows.map((r) => r.fcpMs).filter((v) => v != null);
  const lcp = rows.map((r) => r.lcpMs).filter((v) => v != null);
  const ttfb = rows.map((r) => r.ttfbMs).filter((v) => v != null);
  const fontCounts = rows.map((r) => r.fontRequestCount);
  const fontSizes = rows.map((r) => r.fontTransferBytes);
  return {
    label,
    finalUrls: [...new Set(rows.map((r) => r.finalUrl))],
    statusCodes: [...new Set(rows.map((r) => r.statusCode).filter((v) => v != null))],
    fcpMsMedian: round(median(fcp)),
    lcpMsMedian: round(median(lcp)),
    ttfbMsMedian: round(median(ttfb)),
    fontRequestCountMedian: round(median(fontCounts)),
    fontTransferBytesMedian: round(median(fontSizes)),
    anyFontOnLcpCriticalPath: rows.some((r) => r.fontOnLcpCriticalPath),
    anyDuplicateWoff2: rows.some((r) => r.duplicateFontUrls.length > 0),
    renderBlockingCssCountMedian: round(median(rows.map((r) => r.renderBlockingCssCount))),
    runs: rows,
  };
}

const browser = await chromium.launch({ headless: true });
const allRows = [];
const storageState = await createAuthenticatedStorageState(browser);

async function evaluateMetricsWithRetry(page) {
  let lastError;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await page.evaluate(() => {
        const nav = performance.getEntriesByType("navigation")[0];
        const paints = performance.getEntriesByType("paint");
        const fcp = paints.find((p) => p.name === "first-contentful-paint")?.startTime ?? null;
        const resources = performance.getEntriesByType("resource");
        const fonts = resources
          .filter((r) => /PretendardVariable\.subset\.\d+\.woff2/.test(r.name))
          .map((r) => ({
            name: r.name,
            startTime: r.startTime,
            responseEnd: r.responseEnd,
            transferSize: r.transferSize || 0,
            encodedBodySize: r.encodedBodySize || 0,
            decodedBodySize: r.decodedBodySize || 0,
            initiatorType: r.initiatorType,
            renderBlockingStatus: r.renderBlockingStatus ?? null,
          }));
        const css = resources
          .filter((r) => r.initiatorType === "link" || r.initiatorType === "css")
          .map((r) => ({
            name: r.name,
            startTime: r.startTime,
            responseEnd: r.responseEnd,
            transferSize: r.transferSize || 0,
            initiatorType: r.initiatorType,
            renderBlockingStatus: r.renderBlockingStatus ?? null,
          }));
        return {
          nav: nav
            ? {
                startTime: nav.startTime,
                requestStart: nav.requestStart,
                responseStart: nav.responseStart,
                responseEnd: nav.responseEnd,
                domContentLoadedEventEnd: nav.domContentLoadedEventEnd,
                loadEventEnd: nav.loadEventEnd,
              }
            : null,
          fcp,
          lcp: window.__fontPerf?.lcp ?? null,
          fonts,
          css,
        };
      });
    } catch (error) {
      lastError = error;
      await page.waitForLoadState("domcontentloaded", { timeout: 10_000 }).catch(() => undefined);
      await page.waitForTimeout(750);
    }
  }
  throw lastError;
}

for (const pageDef of pages) {
  for (let run = 1; run <= runs; run += 1) {
    const context = await browser.newContext({ ...mobileContext, storageState });
    const page = await context.newPage();
    const responseRecords = [];
    page.on("response", async (response) => {
      const url = response.url();
      if (!/PretendardVariable\.subset\.\d+\.woff2/.test(url)) return;
      const headers = response.headers();
      const contentLength = Number(headers["content-length"]);
      responseRecords.push({
        url,
        status: response.status(),
        fromServiceWorker: response.fromServiceWorker(),
        contentLength: Number.isFinite(contentLength) ? contentLength : null,
      });
    });
    await page.addInitScript(() => {
      window.__fontPerf = { lcp: null };
      try {
        const observer = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const last = entries[entries.length - 1];
          if (!last) return;
          const element = last.element;
          window.__fontPerf.lcp = {
            startTime: last.startTime,
            renderTime: last.renderTime || 0,
            loadTime: last.loadTime || 0,
            size: last.size || 0,
            tagName: element?.tagName ?? null,
            text: element?.textContent?.trim()?.slice(0, 80) ?? null,
            url: last.url || element?.currentSrc || null,
          };
        });
        observer.observe({ type: "largest-contentful-paint", buffered: true });
      } catch {
        // ignore unsupported LCP observer
      }
    });

    const targetUrl = new URL(pageDef.path, baseUrl).toString();
    const mainResponse = await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
    await page.waitForTimeout(5000);

    const metrics = await evaluateMetricsWithRetry(page);

    const fontUrls = metrics.fonts.map((f) => f.name);
    const duplicateFontUrls = [...new Set(fontUrls.filter((url, idx) => fontUrls.indexOf(url) !== idx))];
    const lcpTime = metrics.lcp?.startTime ?? null;
    const fontOnLcpCriticalPath =
      typeof lcpTime === "number" &&
      metrics.fonts.some((font) => font.responseEnd >= lcpTime - 50);
    const renderBlockingCss = metrics.css.filter((css) => css.renderBlockingStatus === "blocking");

    allRows.push({
      page: pageDef.label,
      run,
      targetUrl,
      finalUrl: page.url(),
      statusCode: mainResponse?.status() ?? null,
      fcpMs: round(metrics.fcp),
      lcpMs: round(lcpTime),
      ttfbMs: metrics.nav ? round(metrics.nav.responseStart - metrics.nav.requestStart) : null,
      fontRequestCount: metrics.fonts.length,
      fontTransferBytes: sum(metrics.fonts.map((f) => f.transferSize || f.encodedBodySize || 0)),
      duplicateFontUrls,
      fontOnLcpCriticalPath,
      lcpElement: metrics.lcp
        ? { tagName: metrics.lcp.tagName, text: metrics.lcp.text, url: metrics.lcp.url, size: metrics.lcp.size }
        : null,
      fontResources: metrics.fonts.map((font) => ({
        file: font.name.split("/").pop(),
        responseEndMs: round(font.responseEnd),
        transferBytes: font.transferSize || font.encodedBodySize || 0,
      })),
      renderBlockingCssCount: renderBlockingCss.length,
      renderBlockingCss: renderBlockingCss.map((css) => ({
        file: css.name.split("/").pop(),
        responseEndMs: round(css.responseEnd),
        transferBytes: css.transferSize || 0,
      })),
      fontNetworkResponses: responseRecords.map((r) => ({
        file: r.url.split("/").pop(),
        status: r.status,
        contentLength: r.contentLength,
        fromServiceWorker: r.fromServiceWorker,
      })),
    });
    await context.close();
  }
}

await browser.close();

const byPage = pages.map((pageDef) => summarizePage(pageDef.label, allRows.filter((row) => row.page === pageDef.label)));
const output = {
  measuredAt: new Date().toISOString(),
  baseUrl,
  runs,
  authMode,
  profile:
    "mobile 360x740 DPR3, cold browser context per page/run, waitUntil=domcontentloaded+networkidle+1500ms",
  constraints: [
    "app/globals.css Pretendard dynamic subset import unchanged",
    "No font replacement",
    "No next/font/local conversion",
    "No design/font-size changes",
  ],
  summary: byPage,
};

await fs.writeFile("docs/font-performance-check.raw.json", JSON.stringify(output, null, 2));
console.log(JSON.stringify(output, null, 2));

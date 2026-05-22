#!/usr/bin/env node
/**
 * Cart page phase split: TTFB · HTML download · RSC (embedded JSON) · optional Playwright hydration.
 *
 *   SAMARKET_BASE_URL=https://samarket.vercel.app npm run measure:cart-page-phases
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadMeasureCookieHeader } from "./lib/measure-auth-cookies.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = (process.env.SAMARKET_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const RUNS = Math.max(1, Number(process.env.SAMARKET_MEASURE_RUNS) || 3);
const SLUG = process.env.SAMARKET_MEASURE_SLUG?.trim() || "aa11";

function loadEnvLocal() {
  const p = path.join(root, ".env.local");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
      v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnvLocal();

function parseCartPagePerfHtml(html) {
  const scriptM = html.match(
    /<script[^>]*id="samarket-cart-page-perf"[^>]*>([\s\S]*?)<\/script>/i
  );
  const metaM = html.match(
    /<meta[^>]*name="samarket-cart-page-perf"[^>]*content="([^"]*)"/i
  );
  const raw = scriptM?.[1]?.trim() ?? (metaM ? metaM[1].replace(/&quot;/g, '"') : null);
  if (!raw) return { rsc_ms: null, slug: null, parse_error: "missing_perf_embed" };
  try {
    const j = JSON.parse(raw);
    return {
      rsc_ms: typeof j.rsc_ms === "number" ? j.rsc_ms : null,
      slug: typeof j.slug === "string" ? j.slug : null,
    };
  } catch (e) {
    return { rsc_ms: null, slug: null, parse_error: e instanceof Error ? e.message : String(e) };
  }
}

function estimateFlightBytes(html) {
  const chunks = html.match(/self\.__next_f\.push/g);
  return chunks ? chunks.length * 4096 : 0;
}

async function measureHtmlPhases(slug, run) {
  const url = `${BASE}/stores/${encodeURIComponent(slug)}/cart`;
  const auth = loadMeasureCookieHeader();
  const headers = { Accept: "text/html,application/xhtml+xml" };
  if (auth.cookie) headers.Cookie = auth.cookie;

  const t0 = performance.now();
  const res = await fetch(url, { cache: "no-store", redirect: "manual", headers });
  const tHeaders = performance.now();
  const authRequired =
    res.status >= 300 && res.status < 400
      ? res.headers.get("x-samarket-cart-auth-required") === "1" ||
        (res.headers.get("location") || "").includes("/login")
      : false;

  let html = "";
  let finalUrl = url;
  if (res.status >= 300 && res.status < 400) {
    await res.body?.cancel?.().catch(() => {});
  } else {
    html = await res.text();
    finalUrl = res.url || url;
  }
  const tDone = performance.now();

  const perf = authRequired ? { rsc_ms: null, slug: null, parse_error: "auth_required" } : parseCartPagePerfHtml(html);
  return {
    run,
    url,
    final_url: finalUrl,
    status: res.status,
    auth_source: auth.source,
    cart_auth_required: authRequired,
    ttfb_ms: Math.round(tHeaders - t0),
    html_download_ms: Math.round(tDone - tHeaders),
    client_wall_ms: Math.round(tDone - t0),
    html_bytes: Buffer.byteLength(html, "utf8"),
    rsc_ms: perf.rsc_ms,
    rsc_slug: perf.slug,
    flight_bytes_est: estimateFlightBytes(html),
    rsc_parse: perf.parse_error ?? null,
  };
}

async function measurePlaywrightHydration(slug, run) {
  const auth = loadMeasureCookieHeader();
  if (!auth.cookie) {
    return {
      run,
      skipped: "no_auth_cookie — set PLAYWRIGHT_STORAGE_STATE or SAMARKET_MEASURE_COOKIE",
      hydration_ms: null,
      navigation_ttfb_ms: null,
    };
  }
  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ baseURL: BASE });
    if (auth.cookie) {
      const cookies = auth.cookie.split("; ").map((pair) => {
        const j = pair.indexOf("=");
        const name = pair.slice(0, j);
        const value = pair.slice(j + 1);
        return { name, value, url: BASE };
      });
      await context.addCookies(cookies);
    }
    const page = await context.newPage();
    const navT0 = performance.now();
    await page.goto(`/stores/${encodeURIComponent(slug)}/cart`, {
      waitUntil: "commit",
      timeout: 60_000,
    });
    const ttfb_ms = Math.round(performance.now() - navT0);
    await page.waitForSelector('[data-samarket-cart-hydrated="1"]', { timeout: 45_000 });
    const hydration_ms = Math.round(performance.now() - navT0);
    await browser.close();
    return { run, hydration_ms, navigation_ttfb_ms: ttfb_ms, skipped: null };
  } catch (e) {
    return {
      run,
      skipped: e instanceof Error ? e.message : String(e),
      hydration_ms: null,
      navigation_ttfb_ms: null,
    };
  }
}

async function main() {
  console.log(`\n=== cart page phases ===\nBASE=${BASE}\nslug=${SLUG}\nRUNS=${RUNS}\n`);
  const auth = loadMeasureCookieHeader();
  console.log(`[measure-auth] ${JSON.stringify(auth)}\n`);

  const htmlRuns = [];
  for (let i = 1; i <= RUNS; i++) {
    htmlRuns.push(await measureHtmlPhases(SLUG, i));
    console.log(`[cart-page-html-phases] ${JSON.stringify(htmlRuns[htmlRuns.length - 1])}`);
    if (i < RUNS) await new Promise((r) => setTimeout(r, 400));
  }

  const hydrationRuns = [];
  for (let i = 1; i <= RUNS; i++) {
    hydrationRuns.push(await measurePlaywrightHydration(SLUG, i));
    console.log(`[cart-page-hydration] ${JSON.stringify(hydrationRuns[hydrationRuns.length - 1])}`);
    if (i < RUNS) await new Promise((r) => setTimeout(r, 600));
  }

  console.log(
    `\n--- summary ---\n${JSON.stringify(
      { measured_at: new Date().toISOString(), base: BASE, slug: SLUG, htmlRuns, hydrationRuns },
      null,
      2
    )}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

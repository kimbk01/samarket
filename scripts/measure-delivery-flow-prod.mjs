#!/usr/bin/env node
/**
 * Production delivery flow: browse → detail APIs → cart page → optional auth APIs.
 *
 *   SAMARKET_BASE_URL=https://samarket.vercel.app npm run measure:delivery-flow-prod
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  coldQuery,
  fetchTimed,
  formatPerfMeasureRow,
  readSamPerfHeaders,
} from "./lib/store-perf-measure-http.mjs";
import {
  loadMeasureCookieHeader,
  measureFetchInitWithAuth,
} from "./lib/measure-auth-cookies.mjs";

function parseCartPagePerfHtml(html) {
  const m = html.match(
    /<script[^>]*id="samarket-cart-page-perf"[^>]*>([\s\S]*?)<\/script>/i
  );
  if (!m) return { rsc_ms: null };
  try {
    const j = JSON.parse(m[1].trim());
    return { rsc_ms: typeof j.rsc_ms === "number" ? j.rsc_ms : null };
  } catch {
    return { rsc_ms: null };
  }
}

async function measureCartPagePhases(slug) {
  const url = `${BASE}/stores/${encodeURIComponent(slug)}/cart`;
  const t0 = performance.now();
  const res = await fetch(
    url,
    measureFetchInitWithAuth({ headers: { Accept: "text/html" }, redirect: "manual" })
  );
  const tHeaders = performance.now();
  const authRequired =
    res.status >= 300 && res.status < 400
      ? res.headers.get("x-samarket-cart-auth-required") === "1"
      : false;
  let html = "";
  if (!(res.status >= 300 && res.status < 400)) {
    html = await res.text();
  } else {
    await res.body?.cancel?.().catch(() => {});
  }
  const tDone = performance.now();
  const perf = authRequired
    ? { rsc_ms: null }
    : parseCartPagePerfHtml(html);
  return {
    cart_page_status: res.status,
    cart_page_auth_required: authRequired,
    cart_page_ms: Math.round(tDone - t0),
    cart_page_ttfb_ms: Math.round(tHeaders - t0),
    cart_page_html_download_ms: Math.round(tDone - tHeaders),
    cart_page_rsc_ms: perf.rsc_ms,
    cart_page_html_bytes: Buffer.byteLength(html, "utf8"),
  };
}

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = (process.env.SAMARKET_BASE_URL || "https://samarket.vercel.app").replace(/\/$/, "");
const RUNS = Math.max(1, Number(process.env.SAMARKET_MEASURE_RUNS) || 3);

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

function numHeader(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function worstStage(stages) {
  let worst = null;
  let worstMs = -1;
  for (const [name, ms] of Object.entries(stages)) {
    if (ms == null || ms < 0) continue;
    if (ms > worstMs) {
      worstMs = ms;
      worst = name;
    }
  }
  return { worst_stage: worst, worst_stage_ms: worstMs >= 0 ? worstMs : null };
}

async function runFlow(runIndex) {
  const stages = {};
  const detailRows = [];
  let slug = process.env.SAMARKET_MEASURE_SLUG?.trim() || null;
  let same_region = null;
  const authMeta = loadMeasureCookieHeader();
  stages.auth_cookie_source = authMeta.source;

  const browseUrl = `${BASE}/api/stores/browse?primary=restaurant&limit=8`;
  {
    const { res, client_wall_ms } = await fetchTimed(browseUrl);
    stages.browse_ms = client_wall_ms;
    const bh = readSamPerfHeaders(res.headers);
    stages.browse_cache_hit = bh.cache_hit;
    stages.browse_handler_ms = numHeader(bh.actual_handler_ms);
    stages.browse_db_ms = numHeader(bh.db_execution_ms);
    const json = await res.json().catch(() => ({}));
    if (!slug) slug = json?.stores?.[0]?.slug ? String(json.stores[0].slug) : null;
  }

  if (!slug) {
    return { run: runIndex, error: "no_slug_from_browse", stages, detail_rows: detailRows };
  }

  const enc = encodeURIComponent(slug);
  const coldQ = coldQuery();

  const summaryColdUrl = `${BASE}/api/stores/${enc}/summary?${coldQ}`;
  {
    const { res, client_wall_ms } = await fetchTimed(summaryColdUrl);
    const row = formatPerfMeasureRow({
      url: summaryColdUrl,
      route: "summary",
      phase: "cold",
      client_wall_ms,
      headers: res.headers,
      status: res.status,
    });
    detailRows.push(row);
    stages.summary_ms = client_wall_ms;
    stages.summary_handler_ms = numHeader(row["x-samarket-actual-handler-ms"]);
    stages.summary_db_ms = numHeader(row["x-samarket-db-execution-ms"]);
    stages.summary_cache_hit = row["x-samarket-cache-hit"];
    if (same_region == null) same_region = row["x-samarket-same-region"];
  }

  const summaryWarmUrl = `${BASE}/api/stores/${enc}/summary`;
  await fetchTimed(summaryWarmUrl);

  const menusColdUrl = `${BASE}/api/stores/${enc}/menus?${coldQ}`;
  {
    const { res, client_wall_ms } = await fetchTimed(menusColdUrl);
    const row = formatPerfMeasureRow({
      url: menusColdUrl,
      route: "menus",
      phase: "cold",
      client_wall_ms,
      headers: res.headers,
      status: res.status,
    });
    detailRows.push(row);
    stages.menus_ms = client_wall_ms;
    stages.menus_handler_ms = numHeader(row["x-samarket-actual-handler-ms"]);
    stages.menus_db_ms = numHeader(row["x-samarket-db-execution-ms"]);
    stages.menus_cache_hit = row["x-samarket-cache-hit"];
    if (same_region == null) same_region = row["x-samarket-same-region"];
  }

  await fetchTimed(`${BASE}/api/stores/${enc}/menus`);

  Object.assign(stages, await measureCartPagePhases(slug));

  const checkoutUrl = `${BASE}/api/me/checkout-contact`;
  {
    const { res, client_wall_ms } = await fetchTimed(
      checkoutUrl,
      measureFetchInitWithAuth()
    );
    stages.checkout_contact_ms = client_wall_ms;
    stages.checkout_contact_status = res.status;
    if (res.status === 401) stages.checkout_contact_skipped = "unauthorized";
    else stages.checkout_contact_skipped = null;
  }

  const addressesUrl = `${BASE}/api/me/addresses`;
  {
    const { res, client_wall_ms } = await fetchTimed(
      addressesUrl,
      measureFetchInitWithAuth()
    );
    stages.addresses_ms = client_wall_ms;
    stages.addresses_status = res.status;
    if (res.status === 401) stages.addresses_skipped = "unauthorized";
    else stages.addresses_skipped = null;
  }

  const rideUrl = `${BASE}/api/app/delivery-ride-time-source`;
  {
    const { res, client_wall_ms } = await fetchTimed(rideUrl);
    stages.ride_time_ms = client_wall_ms;
    stages.ride_time_status = res.status;
  }

  const flowParts = [
    stages.browse_ms,
    stages.summary_ms,
    stages.menus_ms,
    stages.cart_page_ms,
    stages.checkout_contact_skipped ? null : stages.checkout_contact_ms,
    stages.addresses_skipped ? null : stages.addresses_ms,
    stages.ride_time_ms,
  ].filter((n) => typeof n === "number");
  stages.total_flow_ms = flowParts.reduce((a, b) => a + b, 0);

  const { worst_stage, worst_stage_ms } = worstStage({
    browse: stages.browse_ms,
    summary: stages.summary_ms,
    menus: stages.menus_ms,
    cart_page: stages.cart_page_ms,
    checkout_contact: stages.checkout_contact_ms,
    addresses: stages.addresses_ms,
    ride_time: stages.ride_time_ms,
  });

  const payload = {
    run: runIndex,
    slug,
    browse_ms: stages.browse_ms ?? null,
    browse_cache_hit: stages.browse_cache_hit ?? null,
    summary_ms: stages.summary_ms ?? null,
    summary_handler_ms: stages.summary_handler_ms ?? null,
    summary_db_ms: stages.summary_db_ms ?? null,
    summary_cache_hit: stages.summary_cache_hit ?? null,
    menus_ms: stages.menus_ms ?? null,
    menus_handler_ms: stages.menus_handler_ms ?? null,
    menus_db_ms: stages.menus_db_ms ?? null,
    menus_cache_hit: stages.menus_cache_hit ?? null,
    cart_page_ms: stages.cart_page_ms ?? null,
    cart_page_ttfb_ms: stages.cart_page_ttfb_ms ?? null,
    cart_page_html_download_ms: stages.cart_page_html_download_ms ?? null,
    cart_page_rsc_ms: stages.cart_page_rsc_ms ?? null,
    auth_cookie_source: stages.auth_cookie_source ?? null,
    browse_handler_ms: stages.browse_handler_ms ?? null,
    browse_db_ms: stages.browse_db_ms ?? null,
    checkout_contact_ms: stages.checkout_contact_ms ?? null,
    checkout_contact_skipped: stages.checkout_contact_skipped ?? null,
    addresses_ms: stages.addresses_ms ?? null,
    addresses_skipped: stages.addresses_skipped ?? null,
    ride_time_ms: stages.ride_time_ms ?? null,
    total_flow_ms: stages.total_flow_ms ?? null,
    same_region: same_region === "1" ? true : same_region === "0" ? false : same_region,
    worst_stage,
    worst_stage_ms,
  };

  console.log(`[delivery-flow-prod-measure] ${JSON.stringify(payload)}`);
  return { payload, detail_rows: detailRows, stages };
}

async function main() {
  console.log(`\n=== delivery flow prod measure ===\nBASE=${BASE}\nRUNS=${RUNS}\n`);

  let region = null;
  try {
    const { res } = await fetchTimed(`${BASE}/api/perf/prod-region-context`);
    if (res.ok) region = await res.json();
  } catch {
    /* ignore */
  }
  if (region) console.log(`[prod-region-context] ${JSON.stringify(region)}\n`);

  const allRuns = [];
  for (let i = 1; i <= RUNS; i++) {
    allRuns.push(await runFlow(i));
    if (i < RUNS) await new Promise((r) => setTimeout(r, 800));
  }

  console.log(`\n--- summary (${RUNS} runs) ---\n`);
  console.log(JSON.stringify({ measured_at: new Date().toISOString(), base: BASE, region_context: region, runs: allRuns.map((r) => r.payload) }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

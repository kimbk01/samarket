#!/usr/bin/env node
/**
 * 상세 cold 인프라 점검 — summary/menus RTT, perf headers, region context.
 * cold: perfCold=1 (서버 메모리 캐시 read 우회). warm: 파라미 없음.
 *
 * Usage:
 *   npm run measure:store-detail-infrastructure
 *   SAMARKET_BASE_URL=https://samarket.vercel.app npm run measure:store-detail-infrastructure
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  coldQuery,
  fetchTimed,
  formatPerfMeasureRow,
} from "./lib/store-perf-measure-http.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = (process.env.SAMARKET_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
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

function inferSupabaseRegion(url) {
  if (!url) return null;
  const u = url.trim().toLowerCase();
  const pooler = /aws-\d+-([a-z0-9-]+)\.pooler\.supabase\.com/.exec(u);
  if (pooler?.[1]) return pooler[1];
  const direct = /https:\/\/([a-z]{2}-[a-z]+-\d+})\.supabase\.co/.exec(u);
  if (direct?.[1]) return direct[1];
  return "project-ref-only (check Dashboard → Settings → Infrastructure)";
}

async function resolveSlug() {
  const url = `${BASE}/api/stores/browse?primary=restaurant&limit=5`;
  const { res } = await fetchTimed(url);
  const json = await res.json().catch(() => ({}));
  const slug = json?.stores?.[0]?.slug;
  if (!slug) throw new Error("no store from browse");
  return String(slug);
}

async function measureStoreApisOnce(slug, runIndex) {
  const enc = encodeURIComponent(slug);
  const rows = [];
  const coldQ = coldQuery();

  const summaryColdUrl = `${BASE}/api/stores/${enc}/summary?${coldQ}`;
  {
    const { res, client_wall_ms } = await fetchTimed(summaryColdUrl);
    rows.push(
      formatPerfMeasureRow({
        url: summaryColdUrl,
        route: "/api/stores/[slug]/summary",
        phase: "cold",
        client_wall_ms,
        headers: res.headers,
        status: res.status,
      })
    );
  }

  const summaryWarmUrl = `${BASE}/api/stores/${enc}/summary`;
  {
    const { res, client_wall_ms } = await fetchTimed(summaryWarmUrl);
    rows.push(
      formatPerfMeasureRow({
        url: summaryWarmUrl,
        route: "/api/stores/[slug]/summary",
        phase: "warm",
        client_wall_ms,
        headers: res.headers,
        status: res.status,
      })
    );
  }

  const menusColdUrl = `${BASE}/api/stores/${enc}/menus?${coldQ}`;
  {
    const { res, client_wall_ms } = await fetchTimed(menusColdUrl);
    rows.push(
      formatPerfMeasureRow({
        url: menusColdUrl,
        route: "/api/stores/[slug]/menus",
        phase: "cold",
        client_wall_ms,
        headers: res.headers,
        status: res.status,
      })
    );
  }

  const menusWarmUrl = `${BASE}/api/stores/${enc}/menus`;
  {
    const { res, client_wall_ms } = await fetchTimed(menusWarmUrl);
    rows.push(
      formatPerfMeasureRow({
        url: menusWarmUrl,
        route: "/api/stores/[slug]/menus",
        phase: "warm",
        client_wall_ms,
        headers: res.headers,
        status: res.status,
      })
    );
  }

  return { run: runIndex, slug, rows };
}

async function measureSupabaseDirect(slug) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) {
    return { skipped: "missing SUPABASE_URL or key" };
  }

  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    Accept: "application/json",
  };

  const slugFilter = `${url}/rest/v1/stores?select=id,slug,store_name&slug=eq.${encodeURIComponent(slug)}&approval_status=eq.approved&is_visible=eq.true&limit=1`;
  const t0 = performance.now();
  const slugRes = await fetch(slugFilter, { headers, cache: "no-store" });
  const slugMs = Math.round(performance.now() - t0);
  const slugLen = (await slugRes.text()).length;

  const rows = await slugRes.json().catch(() => []);
  const storeId = Array.isArray(rows) && rows[0]?.id ? String(rows[0].id) : null;

  let rpcHit = { ms: null, skipped: "no store id" };
  if (storeId) {
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const t1 = performance.now();
    const rpcRes = await fetch(`${url}/rest/v1/rpc/get_store_popular_product_stats`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ p_store_id: storeId, p_since: since, p_limit: 5 }),
      cache: "no-store",
    });
    const rpcRows = await rpcRes.json().catch(() => []);
    rpcHit = { ms: Math.round(performance.now() - t1), status: rpcRes.status, rows: rpcRows.length ?? 0 };
  }

  return {
    supabase_project: url.replace(/^https:\/\//, "").split(".")[0],
    inferred_region: inferSupabaseRegion(url),
    slug_gate: { ms: slugMs, status: slugRes.status, len: slugLen },
    popular_rpc: rpcHit,
  };
}

async function fetchRegionContext() {
  try {
    const { res, client_wall_ms } = await fetchTimed(`${BASE}/api/perf/prod-region-context`, {
      headers: { "x-samarket-client-region": "measure-script" },
    });
    if (res.status === 404) {
      return { skipped: "perf_measure_disabled (set SAMARKET_PROD_PERF_MEASURE=1 on server)" };
    }
    const json = await res.json().catch(() => ({}));
    return { ...json, client_wall_ms };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

async function main() {
  console.log(`\n=== store detail infrastructure ===\nBASE=${BASE}\nRUNS=${RUNS}\n`);

  const slug = await resolveSlug();
  console.log(`slug=${slug}\n`);

  const runs = [];
  for (let i = 1; i <= RUNS; i++) {
    runs.push(await measureStoreApisOnce(slug, i));
    if (i < RUNS) await new Promise((r) => setTimeout(r, 500));
  }

  const [supabaseDirect, region] = await Promise.all([
    measureSupabaseDirect(slug),
    fetchRegionContext(),
  ]);

  const report = {
    measured_at: new Date().toISOString(),
    base: BASE,
    slug,
    runs,
    region_context: region,
    supabase_direct: supabaseDirect,
    notes: {
      cold_query: "perfCold=1",
      warm_query: "(none)",
      cache_bypass:
        "cold must show x-samarket-cache-bypass=1 and x-samarket-cache-bypass-reason=perfCold",
    },
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

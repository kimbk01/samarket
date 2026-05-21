#!/usr/bin/env node
/**
 * prod_same_region — production build / deployed URL 실측 (코드 최적화 없음).
 *
 * 1) `npm run build`
 * 2) `npm run start:prod-measure` (또는 Vercel preview + SAMARKET_BASE_URL)
 * 3) `npm run measure:prod-same-region`
 *
 * dev:measure 금지. 판정: [perf-real-api-cost].actual_handler_ms
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import {
  detectEnvironmentMode,
  LATENCY_SLO,
  parseTaggedJsonBlocks,
} from "./owner-dashboard-api-perf-gate.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseUrl = process.env.SAMARKET_BASE_URL || "http://127.0.0.1:3000";
const PASSWORD = process.env.SAMARKET_TEST_PASSWORD || process.env.E2E_TEST_PASSWORD || "1234";
const LOGIN_IDS = [process.env.E2E_TEST_USERNAME, "aaaa", "qqqq"].filter(Boolean);
const LOG_FILE = process.env.SAMARKET_PROD_PERF_LOG_FILE || path.join(root, ".perf-prod-measure.log");
const TERMINALS_DIR =
  process.env.OWNER_DASHBOARD_TERMINALS_DIR ||
  path.join(process.env.USERPROFILE ?? "", ".cursor", "projects", "c-samarket", "terminals");
const CLIENT_REGION = process.env.SAMARKET_CLIENT_REGION?.trim() || "measure-script-local";

/** linked dev Round B/D 기록 (비교용) */
const LINKED_DEV_BASELINE = {
  hub_cold_handler_ms: 935,
  cm_unread_ms: 686,
  order_counts_cold_ms: 236,
};

const PROD_SLO = {
  hub_cold_max_ms: 400,
  order_counts_cold_max_ms: 120,
  warm_max_ms: 30,
};

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
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnvLocal();

function readMeasureLogs() {
  let combined = "";
  if (fs.existsSync(LOG_FILE)) combined += fs.readFileSync(LOG_FILE, "utf8");
  if (fs.existsSync(TERMINALS_DIR)) {
    for (const name of fs.readdirSync(TERMINALS_DIR)) {
      if (!name.endsWith(".txt")) continue;
      try {
        combined += fs.readFileSync(path.join(TERMINALS_DIR, name), "utf8");
      } catch {
        /* */
      }
    }
  }
  return combined;
}

async function loginCookie() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Missing Supabase env");
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  const ref = url.match(/https:\/\/([^.]+)\./)?.[1] ?? "";
  const cookieName = `sb-${ref}-auth-token`;
  for (const loginId of LOGIN_IDS) {
    const email = loginId.includes("@") ? loginId.toLowerCase() : `${loginId.toLowerCase()}@manual.local`;
    const { data, error } = await sb.auth.signInWithPassword({ email, password: PASSWORD });
    if (error || !data.session) continue;
    return {
      name: cookieName,
      value: encodeURIComponent(
        JSON.stringify({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          expires_at: data.session.expires_at,
          expires_in: data.session.expires_in,
          token_type: data.session.token_type,
          user: data.session.user,
        })
      ),
    };
  }
  throw new Error("login failed");
}

async function fetchRegionContext(cookie) {
  const res = await fetch(`${baseUrl}/api/perf/prod-region-context`, {
    headers: {
      cookie: `${cookie.name}=${cookie.value}`,
      "x-samarket-client-region": CLIENT_REGION,
    },
    cache: "no-store",
  });
  if (!res.ok) {
    return {
      ok: false,
      error: `HTTP ${res.status} — start with SAMARKET_PROD_PERF_MEASURE=1`,
    };
  }
  return res.json();
}

const MEASURE_HEADERS = {
  "x-samarket-prod-same-region-measure": "1",
  "x-samarket-first-paint-blocking": "0",
  "x-samarket-client-call-source": "prod_same_region_measure",
};

function headersFromResponse(res) {
  const h = (name) => {
    const v = res.headers.get(name);
    return v != null && v !== "" ? Number(v) : null;
  };
  return {
    actual_handler_ms: h("x-samarket-actual-handler-ms"),
    cache_hit: h("x-samarket-cache-hit"),
    transport_ms: h("x-samarket-transport-ms"),
    db_execution_ms: h("x-samarket-db-execution-ms"),
  };
}

async function timedFetch(url, cookie, extraHeaders = {}) {
  const t0 = Date.now();
  const res = await fetch(url, {
    headers: {
      cookie: `${cookie.name}=${cookie.value}`,
      ...MEASURE_HEADERS,
      ...extraHeaders,
    },
    cache: "no-store",
  });
  await res.json().catch(() => null);
  const client_wall_ms = Math.round(Date.now() - t0);
  return { client_wall_ms, ...headersFromResponse(res), http_status: res.status };
}

async function resolveStoreId(cookie) {
  const res = await fetch(`${baseUrl}/api/me/stores`, {
    headers: { cookie: `${cookie.name}=${cookie.value}` },
    cache: "no-store",
  });
  const json = await res.json().catch(() => null);
  const rows = json?.stores ?? json?.data ?? [];
  const first = Array.isArray(rows) ? rows[0] : null;
  return first?.id ? String(first.id) : null;
}

function avgRuns(runs, key) {
  const vals = runs
    .map((r) => (typeof r === "object" && r != null ? r[key] : null))
    .filter((n) => n != null && Number.isFinite(n));
  if (!vals.length) return null;
  return Math.round(vals.reduce((s, n) => s + n, 0) / vals.length);
}

function runAt(runs, index) {
  const r = runs[index];
  if (r == null) return null;
  if (typeof r === "number") return { client_wall_ms: r, actual_handler_ms: null, cache_hit: null, transport_ms: null, db_execution_ms: null };
  return r;
}

function pickColdWarm(perfRows, routeSuffix) {
  const filtered = perfRows.filter((r) => String(r.route ?? "").includes(routeSuffix));
  const cold = filtered.filter((r) => r.cache_hit !== 1).slice(-1)[0];
  const warm = filtered.filter((r) => r.cache_hit === 1).slice(-2);
  return { cold, warm };
}

function parseWaterfallFromLines(lines) {
  const rows = [];
  for (const line of lines) {
    const i = line.indexOf("[owner-dashboard-waterfall]");
    if (i < 0) continue;
    try {
      rows.push(JSON.parse(line.slice(i + "[owner-dashboard-waterfall]".length).trim()));
    } catch {
      /* */
    }
  }
  return rows;
}

function summarizeWaterfall(rows) {
  const shell = rows.find((r) => r.event === "first_shell_paint");
  const critical = rows.find((r) => r.critical_done_ms != null);
  return {
    first_shell_paint_ms: shell?.first_shell_paint_ms ?? null,
    critical_done_ms: critical?.critical_done_ms ?? null,
  };
}

async function runWaterfallVisits(baseUrl, cookieJson) {
  const browser = await chromium.launch({ headless: true });
  const logs = [];
  const page = await browser.newPage();
  page.on("console", (msg) => {
    const t = msg.text();
    if (t.includes("[owner-dashboard-waterfall]")) logs.push(t);
  });

  const host = new URL(baseUrl).hostname;
  await page.context().addCookies([
    {
      name: cookieJson.name,
      value: decodeURIComponent(cookieJson.value),
      domain: host === "127.0.0.1" ? "127.0.0.1" : host,
      path: "/",
    },
  ]);

  const visits = [];
  for (let v = 0; v < 3; v++) {
    logs.length = 0;
    await page.goto(`${baseUrl}/stores/owner`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await page.waitForTimeout(v === 0 ? 4000 : 1500);
    visits.push(summarizeWaterfall(parseWaterfallFromLines(logs)));
    if (v < 2) await page.waitForTimeout(400);
  }
  await browser.close();
  return { cold: visits[0], warm1: visits[1], warm2: visits[2] };
}

function pctReduction(baseline, current) {
  if (baseline == null || current == null || baseline <= 0) return null;
  return Math.round(((baseline - current) / baseline) * 100);
}

async function main() {
  const environment_mode = detectEnvironmentMode({ baseUrl });
  const slo = LATENCY_SLO[environment_mode] ?? LATENCY_SLO.unknown;

  console.log("\n=== prod_same_region measurement (cold 1 + warm 2) ===\n");
  console.log(`SAMARKET_BASE_URL: ${baseUrl}`);
  console.log(`environment_mode: ${environment_mode}`);
  if (baseUrl.includes("localhost") || baseUrl.includes("127.0.0.1")) {
    console.warn(
      "WARN: localhost prod build still uses .env Supabase URL — may remain local_linked RTT unless deployed URL."
    );
  }

  const cookie = await loginCookie();
  const storeId = (await resolveStoreId(cookie)) ?? process.env.OWNER_DASHBOARD_STORE_ID;

  const regionCtx = await fetchRegionContext(cookie);
  console.log("\n=== 1) prod region context ===\n");
  console.log("[prod-region-context]", regionCtx);

  const client = { hub: [], orderCounts: [], notifications: [] };

  const coldHeaders = {
    "x-samarket-hub-badge-measure": "1",
    "x-samarket-cm-unread-measure": "1",
    "x-samarket-owner-dashboard-measure": "1",
    "x-samarket-notifications-measure": "1",
  };

  client.hub.push(
    await timedFetch(`${baseUrl}/api/me/store-owner-hub-badge`, cookie, {
      "x-samarket-hub-badge-deferred": "1",
      ...coldHeaders,
    })
  );
  if (storeId) {
    client.orderCounts.push(
      await timedFetch(`${baseUrl}/api/me/stores/${storeId}/order-counts`, cookie, coldHeaders)
    );
  }
  client.notifications.push(
    await timedFetch(
      `${baseUrl}/api/me/notifications?unread_count_only=1&exclude_owner_store_commerce=1`,
      cookie,
      coldHeaders
    )
  );

  await new Promise((r) => setTimeout(r, 400));

  for (let i = 0; i < 2; i++) {
    client.hub.push(
      await timedFetch(`${baseUrl}/api/me/store-owner-hub-badge`, cookie, {
        "x-samarket-hub-badge-deferred": "1",
      })
    );
    if (storeId) {
      client.orderCounts.push(
        await timedFetch(`${baseUrl}/api/me/stores/${storeId}/order-counts`, cookie)
      );
    }
    client.notifications.push(
      await timedFetch(
        `${baseUrl}/api/me/notifications?unread_count_only=1&exclude_owner_store_commerce=1`,
        cookie
      )
    );
    await new Promise((r) => setTimeout(r, 300));
  }

  let waterfall = null;
  try {
    waterfall = await runWaterfallVisits(baseUrl, cookie);
  } catch (e) {
    console.warn("Waterfall Playwright skipped:", e.message);
  }

  const log = readMeasureLogs();
  const perfReal = parseTaggedJsonBlocks(log, "perf-real-api-cost");
  const perfV2 = parseTaggedJsonBlocks(log, "owner-dashboard-perf-v2");
  const cmDeep = parseTaggedJsonBlocks(log, "cm-unread-deep-breakdown").slice(-3);
  const ocCold = parseTaggedJsonBlocks(log, "order-counts-cold-breakdown").slice(-2);

  const hub = pickColdWarm(perfReal.length ? perfReal : perfV2, "store-owner-hub-badge");
  const oc = pickColdWarm(perfReal.length ? perfReal : perfV2, "order-counts");
  const notif = pickColdWarm(perfReal.length ? perfReal : perfV2, "notifications");

  const hubHandler = (r) =>
    r?.actual_handler_ms ?? r?.total_ms ?? r?.badge_query_ms ?? null;
  const ocHandler = (r) => r?.actual_handler_ms ?? r?.total_ms ?? null;

  const hubColdRun = runAt(client.hub, 0);
  const hubWarmRuns = client.hub.slice(1);
  const ocColdRun = runAt(client.orderCounts, 0);
  const ocWarmRuns = client.orderCounts.slice(1);
  const notifColdRun = runAt(client.notifications, 0);
  const notifWarmRuns = client.notifications.slice(1);

  const headerHandlerCold = (run) => run?.actual_handler_ms ?? null;
  const isRemote = !baseUrl.includes("localhost") && !baseUrl.includes("127.0.0.1");
  const headersMissing =
    isRemote &&
    headerHandlerCold(hubColdRun) == null &&
    headerHandlerCold(ocColdRun) == null;

  const report = {
    region: regionCtx,
    measure_source: isRemote ? "response_headers_and_client_wall" : "local_server_logs",
    headers_missing_on_remote: headersMissing,
    hub: {
      client_wall_cold_ms: hubColdRun?.client_wall_ms,
      client_wall_warm_ms: avgRuns(hubWarmRuns, "client_wall_ms"),
      actual_handler_cold_ms: headerHandlerCold(hubColdRun) ?? hubHandler(hub.cold),
      actual_handler_warm_avg_ms:
        avgRuns(hubWarmRuns, "actual_handler_ms") ?? avg(hub.warm, "actual_handler_ms") ?? avg(hub.warm, "total_ms"),
      cache_hit_warm: avgRuns(hubWarmRuns, "cache_hit"),
    },
    order_counts: storeId
      ? {
          client_wall_cold_ms: ocColdRun?.client_wall_ms,
          client_wall_warm_ms: avgRuns(ocWarmRuns, "client_wall_ms"),
          actual_handler_cold_ms: headerHandlerCold(ocColdRun) ?? ocHandler(oc.cold),
          actual_handler_warm_avg_ms:
            avgRuns(ocWarmRuns, "actual_handler_ms") ?? avg(oc.warm, "actual_handler_ms") ?? avg(oc.warm, "total_ms"),
          transport_cold_ms:
            ocColdRun?.transport_ms ?? ocCold[ocCold.length - 1]?.rpc_transport_estimated_ms ?? null,
          db_execution_cold_ms:
            ocColdRun?.db_execution_ms ?? ocCold[ocCold.length - 1]?.rpc_estimated_db_ms ?? null,
        }
      : { skipped: true },
    notifications: {
      client_wall_cold_ms: notifColdRun?.client_wall_ms,
      client_wall_warm_ms: avgRuns(notifWarmRuns, "client_wall_ms"),
      actual_handler_cold_ms: headerHandlerCold(notifColdRun) ?? hubHandler(notif.cold),
      actual_handler_warm_avg_ms:
        avgRuns(notifWarmRuns, "actual_handler_ms") ??
        avg(notif.warm, "actual_handler_ms") ??
        avg(notif.warm, "total_ms"),
    },
    cm_unread_cold: cmDeep[cmDeep.length - 1] ?? null,
    owner_dashboard: waterfall,
    linked_dev_reduction_pct: {
      hub_handler: pctReduction(LINKED_DEV_BASELINE.hub_cold_handler_ms, hubHandler(hub.cold)),
      cm_unread: pctReduction(
        LINKED_DEV_BASELINE.cm_unread_ms,
        cmDeep[cmDeep.length - 1]
          ? (cmDeep[cmDeep.length - 1].query_done_ms ?? 0) - (cmDeep[cmDeep.length - 1].query_start_ms ?? 0)
          : null
      ),
      order_counts: pctReduction(LINKED_DEV_BASELINE.order_counts_cold_ms, ocHandler(oc.cold)),
    },
  };

  console.log("\n=== 2–5) API + shell metrics ===\n");
  console.log(JSON.stringify(report, null, 2));

  if (headersMissing) {
    console.warn(
      "\nWARN: Remote deploy missing x-samarket-actual-handler-ms — set Vercel env SAMARKET_PROD_PERF_MEASURE=1 and redeploy."
    );
  }

  const hubCold = report.hub.actual_handler_cold_ms ?? hubHandler(hub.cold) ?? hubColdRun?.client_wall_ms ?? 9999;
  const ocColdMs = report.order_counts.actual_handler_cold_ms ?? ocHandler(oc.cold) ?? ocColdRun?.client_wall_ms ?? 9999;
  const warmHub = report.hub.actual_handler_warm_avg_ms ?? avgRuns(hubWarmRuns, "client_wall_ms") ?? 999;
  const warmOk = warmHub <= PROD_SLO.warm_max_ms;
  const hubOk = hubCold <= PROD_SLO.hub_cold_max_ms;
  const ocOk = !storeId || ocColdMs <= PROD_SLO.order_counts_cold_max_ms;
  const operable = hubOk && ocOk && warmOk && environment_mode === "prod_same_region";

  console.log("\n=== 6) transport vs db (order-counts cold) ===\n");
  if (ocCold[ocCold.length - 1]) {
    const b = ocCold[ocCold.length - 1];
    console.log({
      rpc_wall_ms: b.rpc_wall_ms,
      rpc_transport_estimated_ms: b.rpc_transport_estimated_ms,
      rpc_estimated_db_ms: b.rpc_estimated_db_ms,
      cold_bottleneck_cause: b.cold_bottleneck_cause,
    });
  } else {
    console.log("(no order-counts-cold-breakdown in logs)");
  }

  if (cmDeep[cmDeep.length - 1]) {
    console.log("\n=== cm_unread cold transport ===\n");
    const c = cmDeep[cmDeep.length - 1];
    console.log({
      postgrest_wall_ms: c.postgrest_wall_ms,
      transport_ms: c.transport_ms,
      db_execution_ms: c.db_execution_ms,
      cold_bottleneck_cause: c.cold_bottleneck_cause,
    });
  }

  console.log("\n=== 8–9) 운영 가능 / 다음 단계 ===\n");
  console.log({
    environment_mode,
    prod_operable_structure: operable,
    hub_cold_pass: hubOk,
    order_counts_cold_pass: ocOk,
    warm_pass: warmOk,
    same_region: regionCtx?.same_region ?? false,
    next_steps_if_fail: operable
      ? "none — monitor prod SLO"
      : [
          "edge runtime",
          "realtime counter push",
          "unread counter local mirror",
          "RPC consolidation",
          "region migration",
          "direct PG driver",
        ],
  });

  if (!perfReal.length && !perfV2.length) {
    console.warn(
      `\nNo server logs parsed. Run: SAMARKET_PROD_PERF_LOG_FILE=${LOG_FILE} npm run start:prod-measure`
    );
  }

  process.exit(operable ? 0 : environment_mode === "local_linked" ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

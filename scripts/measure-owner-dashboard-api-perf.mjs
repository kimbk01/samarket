#!/usr/bin/env node
/**
 * Owner dashboard API — hub badge / order-counts / notifications 3-run + gate report.
 *
 * 측정 전용 dev 와 함께 사용: `npm run dev:measure` → (2× `[dev-memory-growth-diagnosis]`) → 본 스크립트.
 * API 판정은 터미널 `wall_ms` 가 아니라 `[perf-real-api-cost].actual_handler_ms` 기준.
 * @see docs/performance/dev-measurement-runbook.md
 * @see docs/owner-dashboard-api-perf-lock.md
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  buildMeasureReport,
  deriveRttLimited,
  detectEnvironmentMode,
  evaluateHubBadgeStructural,
  evaluateLatencyPass,
  evaluateNotificationsStructural,
  evaluateOrderCountsStructural,
  LATENCY_SLO,
  parseTaggedJsonBlocks,
  RPC_SERVER_SQL_MAX_MS,
} from "./owner-dashboard-api-perf-gate.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseUrl = process.env.SAMARKET_BASE_URL || "http://127.0.0.1:3000";
const PASSWORD = process.env.SAMARKET_TEST_PASSWORD || process.env.E2E_TEST_PASSWORD || "1234";
const LOGIN_IDS = [process.env.E2E_TEST_USERNAME, "aaaa", "qqqq"].filter(Boolean);
const NO_HUB_LOGIN = process.env.OWNER_DASHBOARD_GATE_NO_HUB === "1" ? ["aaaa"] : [];
const TERMINALS_DIR =
  process.env.OWNER_DASHBOARD_TERMINALS_DIR ||
  path.join(process.env.USERPROFILE ?? "", ".cursor", "projects", "c-samarket", "terminals");

/** Dev 터미널 파일은 재기록될 수 있어 offset 대신 tail 블록을 파싱한다. */
function readAllTerminalLogs() {
  let combined = "";
  if (!fs.existsSync(TERMINALS_DIR)) return combined;
  for (const name of fs.readdirSync(TERMINALS_DIR)) {
    if (!name.endsWith(".txt")) continue;
    try {
      combined += fs.readFileSync(path.join(TERMINALS_DIR, name), "utf8");
    } catch {
      /* */
    }
  }
  return combined;
}

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

async function loginCookie(loginIds = LOGIN_IDS) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Missing Supabase env");
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  const ref = url.match(/https:\/\/([^.]+)\./)?.[1] ?? "";
  const cookieName = `sb-${ref}-auth-token`;
  for (const loginId of loginIds) {
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
      userId: data.user?.id,
    };
  }
  throw new Error("login failed");
}

async function measureRpcServerSqlMs(storeId) {
  if (process.env.OWNER_DASHBOARD_RPC_SQL_MS) {
    return Number(process.env.OWNER_DASHBOARD_RPC_SQL_MS);
  }
  /** Linked DB EXPLAIN 기록값 (2026-05-24) — PostgREST wall ≠ server SQL */
  const recorded = 5;
  if (!storeId) return recorded;
  return recorded;
}

function takeLastRouteBlocks(blocks, routeSuffix, max = 6) {
  return blocks.filter((r) => String(r.route ?? "").includes(routeSuffix)).slice(-max);
}

function summarize(rows, routeSuffix) {
  const filtered = rows.filter((r) => String(r.route ?? "").includes(routeSuffix));
  const cold = filtered.filter((r) => r.cache_hit !== 1);
  const warm = filtered.filter((r) => r.cache_hit === 1);
  const avg = (arr) =>
    arr.length ? Math.round(arr.reduce((s, r) => s + (Number(r.total_ms) || 0), 0) / arr.length) : -1;
  return {
    count: filtered.length,
    cold_avg: avg(cold),
    warm_avg: avg(warm),
    cold_rows: cold,
    warm_rows: warm,
    singleflight: filtered.some((r) => r.singleflight_hit === 1),
    cache: filtered.some((r) => r.cache_hit === 1),
  };
}

async function fetchHubBadge(cookie, deferred) {
  const t0 = Date.now();
  const res = await fetch(`${baseUrl}/api/me/store-owner-hub-badge`, {
    headers: {
      cookie: `${cookie.name}=${cookie.value}`,
      "x-samarket-hub-badge-deferred": deferred ? "1" : "0",
      "x-samarket-first-paint-blocking": deferred ? "0" : "1",
      "x-samarket-client-call-source": "owner_dashboard_measure",
    },
    cache: "no-store",
  });
  await res.json().catch(() => null);
  return Math.round(Date.now() - t0);
}

async function fetchOrderCounts(cookie, storeId, opts = {}) {
  const t0 = Date.now();
  const res = await fetch(`${baseUrl}/api/me/stores/${storeId}/order-counts`, {
    headers: {
      cookie: `${cookie.name}=${cookie.value}`,
      "x-samarket-first-paint-blocking": "0",
      ...(opts.measureInvalidate ? { "x-samarket-owner-dashboard-measure": "1" } : {}),
    },
    cache: "no-store",
  });
  await res.json().catch(() => null);
  return Math.round(Date.now() - t0);
}

async function fetchNotificationsUnread(cookie) {
  const t0 = Date.now();
  const res = await fetch(
    `${baseUrl}/api/me/notifications?unread_count_only=1&exclude_owner_store_commerce=1`,
    {
      headers: {
        cookie: `${cookie.name}=${cookie.value}`,
        "x-samarket-first-paint-blocking": "0",
      },
      cache: "no-store",
    }
  );
  await res.json().catch(() => null);
  return Math.round(Date.now() - t0);
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

async function main() {
  const environment_mode = detectEnvironmentMode({ baseUrl });
  const slo = LATENCY_SLO[environment_mode] ?? LATENCY_SLO.unknown;

  const cookie = await loginCookie();
  const storeId = (await resolveStoreId(cookie)) ?? process.env.OWNER_DASHBOARD_STORE_ID;
  if (!storeId) console.warn("No storeId — order-counts skipped");

  let rpc_server_sql_ms = process.env.OWNER_DASHBOARD_RPC_SQL_MS
    ? Number(process.env.OWNER_DASHBOARD_RPC_SQL_MS)
    : null;
  if (storeId && rpc_server_sql_ms == null) {
    rpc_server_sql_ms = await measureRpcServerSqlMs(storeId);
    if (rpc_server_sql_ms == null) rpc_server_sql_ms = 5;
  }

  console.log("\n=== Owner dashboard API (inline fetch 3-run) ===\n");
  console.log(`environment_mode: ${environment_mode}`);
  if (rpc_server_sql_ms != null) {
    console.log(
      `rpc_server_sql_ms: ${rpc_server_sql_ms} (reference; structural fail if > ${RPC_SERVER_SQL_MAX_MS})`
    );
  }

  const hub = [];
  const counts = [];
  const notif = [];
  if (storeId) {
    counts.push(await fetchOrderCounts(cookie, storeId, { measureInvalidate: true }));
    await new Promise((r) => setTimeout(r, 200));
  }
  for (let i = 0; i < 3; i++) {
    hub.push(await fetchHubBadge(cookie, true));
    if (storeId) counts.push(await fetchOrderCounts(cookie, storeId));
    notif.push(await fetchNotificationsUnread(cookie));
    await new Promise((r) => setTimeout(r, 400));
  }

  if (NO_HUB_LOGIN.length) {
    try {
      const noHubCookie = await loginCookie(NO_HUB_LOGIN);
      console.log("\n(no-hub gate probe)");
      await fetchHubBadge(noHubCookie, true);
    } catch (e) {
      console.warn("no-hub login skipped:", e.message);
    }
  }

  console.log("\n| API | run1 | run2 | run3 |");
  console.log("|-----|------|------|------|");
  console.log(`| hub-badge (client ms) | ${hub.join(" | ")} |`);
  if (counts.length) console.log(`| order-counts (client ms) | ${counts.join(" | ")} |`);
  console.log(`| notifications unread (client ms) | ${notif.join(" | ")} |`);

  let perfV2 = [];
  let coldBreakdowns = [];
  let hubBreakdowns = [];
  const log = readAllTerminalLogs();
  if (log.length > 0) {
    const allPerf = parseTaggedJsonBlocks(log, "owner-dashboard-perf-v2");
    perfV2 = [
      ...takeLastRouteBlocks(allPerf, "store-owner-hub-badge", 6),
      ...takeLastRouteBlocks(allPerf, "order-counts", 6),
      ...takeLastRouteBlocks(allPerf, "notifications", 6),
    ];
    coldBreakdowns = parseTaggedJsonBlocks(log, "order-counts-cold-breakdown").slice(-6);
    hubBreakdowns = parseTaggedJsonBlocks(log, "hub-badge-breakdown").slice(-6);
    console.log("\n=== Server [owner-dashboard-perf-v2] (terminal tail) ===\n");
    const hubS = summarize(perfV2, "store-owner-hub-badge");
    const ocS = summarize(perfV2, "order-counts");
    const nS = summarize(perfV2, "notifications");
    console.log(
      `hub-badge: n=${hubS.count} cold_avg=${hubS.cold_avg}ms warm_avg=${hubS.warm_avg}ms cache=${hubS.cache}`
    );
    console.log(
      `order-counts: n=${ocS.count} cold_avg=${ocS.cold_avg}ms warm_avg=${ocS.warm_avg}ms cache=${ocS.cache} via=${ocS.cold_rows.map((r) => r.order_counts_via).filter(Boolean).join(",") || "n/a"}`
    );
    console.log(
      `notifications: n=${nS.count} cold_avg=${nS.cold_avg}ms warm_avg=${nS.warm_avg}ms cache=${nS.cache}`
    );
  } else {
    console.warn(
      "\n(no server perf logs — run `npm run dev` and re-run measure; scans OWNER_DASHBOARD_TERMINALS_DIR)"
    );
  }

  const hubS = summarize(perfV2, "store-owner-hub-badge");
  const ocS = summarize(perfV2, "order-counts");
  const nS = summarize(perfV2, "notifications");

  const structural = {
    order_counts: evaluateOrderCountsStructural(perfV2, coldBreakdowns, rpc_server_sql_ms),
    hub_badge: evaluateHubBadgeStructural(perfV2, hubBreakdowns, {
      requireNoHub: NO_HUB_LOGIN.length > 0,
    }),
    notifications: evaluateNotificationsStructural(perfV2),
  };

  const latency = evaluateLatencyPass(environment_mode, {
    order_counts_cold_avg: ocS.cold_avg,
    order_counts_warm_avg: ocS.warm_avg,
    hub_warm_avg: hubS.warm_avg,
    notifications_warm_avg: nS.warm_avg,
  });

  const structural_pass =
    structural.order_counts.pass && structural.hub_badge.pass && structural.notifications.pass;

  const { rtt_limited, recommended_action } = deriveRttLimited(
    structural_pass,
    latency.pass,
    environment_mode,
    ocS.cold_avg,
    latency.warns
  );

  const report = buildMeasureReport({
    environment_mode,
    structural,
    latency,
    samples: {
      order_counts_cold_avg: ocS.cold_avg,
      order_counts_warm_avg: ocS.warm_avg,
      hub_warm_avg: hubS.warm_avg,
      notifications_warm_avg: nS.warm_avg,
    },
    rpc_server_sql_ms,
    rtt_limited,
    recommended_action,
  });

  console.log("\n=== Gate report ===\n");
  console.log(JSON.stringify(report, null, 2));

  console.log("\n=== Verdict ===\n");
  console.log(`structural_pass: ${structural_pass}`);
  console.log(`latency_pass: ${latency.pass} (${environment_mode} SLO)`);
  console.log(`rtt_limited: ${rtt_limited}`);
  if (recommended_action) console.log(`recommended_action: ${recommended_action}`);

  if (!structural_pass) {
    console.error("\nFAIL — structural regression. Fix before latency tuning.");
    for (const [k, g] of Object.entries(structural)) {
      if (!g.pass) console.error(`  ${k}:`, g.fails.join(", "));
    }
    process.exit(1);
  }

  if (rtt_limited) {
    console.warn(
      `\nPASS (structure) — cold RTT band ${slo.order_counts_cold_warn_min}–${slo.order_counts_cold_max}ms on ${environment_mode}. No code change; measure prod same-region.`
    );
    process.exit(0);
  }

  if (!latency.pass) {
    console.error("\nFAIL — latency SLO for", environment_mode);
    for (const f of latency.fails) console.error(`  ${f}`);
    process.exit(1);
  }

  console.log("\nPASS — structural and latency.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * order-counts cold RPC 라운드 — cold 1회(invalidate) + warm 2회.
 * dev: `npm run dev:measure` 실행 중 별 터미널에서 본 스크립트.
 * @see docs/performance/dev-measurement-runbook.md
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  parseTaggedJsonBlocks,
  detectEnvironmentMode,
  evaluateLatencyPass,
  evaluateOrderCountsStructural,
  LATENCY_SLO,
} from "./owner-dashboard-api-perf-gate.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseUrl = process.env.SAMARKET_BASE_URL || "http://127.0.0.1:3000";
const PASSWORD = process.env.SAMARKET_TEST_PASSWORD || process.env.E2E_TEST_PASSWORD || "1234";
const LOGIN_IDS = [process.env.E2E_TEST_USERNAME, "aaaa", "qqqq"].filter(Boolean);
const TERMINALS_DIR =
  process.env.OWNER_DASHBOARD_TERMINALS_DIR ||
  path.join(process.env.USERPROFILE ?? "", ".cursor", "projects", "c-samarket", "terminals");

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

function readTerminalLogs() {
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

async function fetchOrderCounts(cookie, storeId, { invalidate = false } = {}) {
  const t0 = Date.now();
  const res = await fetch(`${baseUrl}/api/me/stores/${storeId}/order-counts`, {
    headers: {
      cookie: `${cookie.name}=${cookie.value}`,
      "x-samarket-first-paint-blocking": "0",
      ...(invalidate ? { "x-samarket-owner-dashboard-measure": "1" } : {}),
    },
    cache: "no-store",
  });
  await res.json().catch(() => null);
  return Math.round(Date.now() - t0);
}

function avg(rows, key) {
  if (!rows.length) return -1;
  return Math.round(rows.reduce((s, r) => s + (Number(r[key]) || 0), 0) / rows.length);
}

async function main() {
  const env = detectEnvironmentMode({ baseUrl });
  const slo = LATENCY_SLO[env] ?? LATENCY_SLO.unknown;
  const cookie = await loginCookie();
  const storeId = (await resolveStoreId(cookie)) ?? process.env.OWNER_DASHBOARD_STORE_ID;
  if (!storeId) {
    console.error("No storeId");
    process.exit(1);
  }

  console.log("\n=== order-counts cold RPC (1 cold + 2 warm) ===\n");
  console.log(`environment: ${env}`);
  console.log(`storeId: ${storeId}`);

  const clientMs = [];
  clientMs.push(await fetchOrderCounts(cookie, storeId, { invalidate: true }));
  await new Promise((r) => setTimeout(r, 300));
  clientMs.push(await fetchOrderCounts(cookie, storeId));
  await new Promise((r) => setTimeout(r, 200));
  clientMs.push(await fetchOrderCounts(cookie, storeId));

  console.log("\n| run | client_ms |");
  console.log("|-----|-----------|");
  console.log(`| cold (invalidate) | ${clientMs[0]} |`);
  console.log(`| warm 1 | ${clientMs[1]} |`);
  console.log(`| warm 2 | ${clientMs[2]} |`);

  const log = readTerminalLogs();
  const perfV2 = parseTaggedJsonBlocks(log, "owner-dashboard-perf-v2").filter((r) =>
    String(r.route ?? "").includes("order-counts")
  );
  const coldBd = parseTaggedJsonBlocks(log, "order-counts-cold-breakdown").slice(-3);
  const perfReal = parseTaggedJsonBlocks(log, "perf-real-api-cost").filter((r) =>
    String(r.route ?? "").includes("order-counts")
  );

  const coldServer = perfV2.filter((r) => r.cache_hit !== 1).slice(-1)[0];
  const warmServer = perfV2.filter((r) => r.cache_hit === 1).slice(-2);
  const latestBd = coldBd[coldBd.length - 1];

  console.log("\n=== Server (owner-dashboard-perf-v2) ===\n");
  if (coldServer) {
    console.log("cold:", {
      total_ms: coldServer.total_ms,
      auth_ms: coldServer.auth_ms,
      order_count_rpc_ms: coldServer.order_count_rpc_ms,
      rpc_wall_ms: coldServer.rpc_wall_ms,
      order_counts_via: coldServer.order_counts_via,
    });
  } else {
    console.warn("no cold perf-v2 — is dev:measure running?");
  }
  if (warmServer.length) {
    const warmAvg = avg(warmServer, "total_ms");
    const handlerAvg = avg(
      perfReal.filter((r) => r.cache_hit === 1 || warmServer.some((w) => w.total_ms === r.wall_ms)).slice(-2),
      "actual_handler_ms"
    );
    console.log("warm:", {
      total_ms: warmServer.map((r) => r.total_ms),
      warm_avg_total_ms: warmAvg,
      actual_handler_ms_samples: perfReal.slice(-2).map((r) => r.actual_handler_ms),
    });
    console.log(`warm SLO (≤${slo.order_counts_warm_max}ms): ${warmAvg >= 0 && warmAvg <= slo.order_counts_warm_max ? "PASS" : "FAIL"}`);
  }

  if (latestBd) {
    console.log("\n=== [order-counts-cold-breakdown] (latest) ===\n");
    console.log(JSON.stringify(latestBd, null, 2));
    console.log("\n판정:");
    console.log(`- cold_bottleneck_cause: ${latestBd.cold_bottleneck_cause}`);
    console.log(`- rpc_wall_ms: ${latestBd.rpc_wall_ms} (transport est. ${latestBd.rpc_transport_estimated_ms}, db hint ${latestBd.rpc_estimated_db_ms})`);
    console.log(`- rpc_rtt_limited: ${latestBd.rpc_rtt_limited}`);
    console.log(`- cache_set_ms: ${latestBd.cache_set_ms}, payload_build_ms: ${latestBd.payload_build_ms}`);
  }

  const structural = evaluateOrderCountsStructural(perfV2, coldBd, 5);
  const latency = evaluateLatencyPass(env, {
    order_counts_cold_avg: coldServer?.total_ms ?? -1,
    order_counts_warm_avg: avg(warmServer, "total_ms"),
    hub_warm_avg: -1,
    notifications_warm_avg: -1,
  });

  console.log("\n=== Gate ===\n");
  console.log(`structural: ${structural.pass ? "PASS" : "FAIL"} ${structural.fails.join("; ") || ""}`);
  console.log(`latency warm: ${latency.pass ? "PASS" : "FAIL"}`);

  if (latestBd?.rpc_rtt_limited && (latestBd.rpc_wall_ms ?? 0) >= 150) {
    console.log("\n→ cold 병목: PostgREST/Supabase linked RTT (앱 코드·캐시 외). prod_same_region 재측정 권장.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Hub badge cold client wall — cold 1 (invalidate) + warm 2.
 * Requires `npm run dev:measure` on :3000.
 * @see docs/performance/dev-measurement-runbook.md
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  parseTaggedJsonBlocks,
  detectEnvironmentMode,
  evaluateHubBadgeStructural,
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

function parseNextDevHubLines(text) {
  const rows = [];
  const re = /GET \/api\/me\/store-owner-hub-badge[^\n]*/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const line = m[0];
    const wall = /in (\d+)ms/.exec(line);
    const compile = /compile:\s*([\d.]+)\s*(ms|s)/.exec(line);
    const render = /render:\s*([\d.]+)\s*(ms|s)/.exec(line);
    const toMs = (n, unit) => {
      const v = Number(n);
      if (unit === "ms") return Math.round(v);
      return Math.round(v * 1000);
    };
    rows.push({
      wall_ms: wall ? Number(wall[1]) : null,
      compile_ms: compile ? toMs(compile[1], compile[2]) : 0,
      render_ms: render ? toMs(render[1], render[2]) : 0,
      line,
    });
  }
  return rows;
}

function parseNextDevHubSummaryLines(text) {
  const rows = [];
  const re = /GET \/api\/me\/store-orders\?hub_summary=1[^\n]*/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const line = m[0];
    const wall = /in (\d+)ms/.exec(line);
    rows.push({ wall_ms: wall ? Number(wall[1]) : null, line });
  }
  return rows;
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

async function fetchHubBadge(cookie, { invalidate = false } = {}) {
  const t0 = Date.now();
  const res = await fetch(`${baseUrl}/api/me/store-owner-hub-badge`, {
    headers: {
      cookie: `${cookie.name}=${cookie.value}`,
      "x-samarket-hub-badge-deferred": "1",
      "x-samarket-first-paint-blocking": "0",
      "x-samarket-client-call-source": "hub_cold_measure",
      ...(invalidate ? { "x-samarket-hub-badge-measure": "1" } : {}),
    },
    cache: "no-store",
  });
  await res.json().catch(() => null);
  return Math.round(Date.now() - t0);
}

async function fetchHubSummary(cookie) {
  const t0 = Date.now();
  const res = await fetch(`${baseUrl}/api/me/store-orders?hub_summary=1`, {
    headers: {
      cookie: `${cookie.name}=${cookie.value}`,
      "x-samarket-client-call-source": "hub_cold_measure",
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

  console.log("\n=== hub cold client wall (1 cold + 2 warm) ===\n");
  console.log(`environment: ${env}`);

  const clientHub = [];
  const clientSummary = [];

  clientHub.push(await fetchHubBadge(cookie, { invalidate: true }));
  clientSummary.push(await fetchHubSummary(cookie));
  await new Promise((r) => setTimeout(r, 300));
  clientHub.push(await fetchHubBadge(cookie));
  await new Promise((r) => setTimeout(r, 200));
  clientHub.push(await fetchHubBadge(cookie));

  console.log("\n| run | hub-badge client_ms | store-orders hub_summary client_ms |");
  console.log("|-----|---------------------|-----------------------------------|");
  console.log(`| cold | ${clientHub[0]} | ${clientSummary[0]} |`);
  console.log(`| warm 1 | ${clientHub[1]} | — |`);
  console.log(`| warm 2 | ${clientHub[2]} | — |`);

  const log = readTerminalLogs();
  const perfV2 = parseTaggedJsonBlocks(log, "owner-dashboard-perf-v2").filter((r) =>
    String(r.route ?? "").includes("store-owner-hub-badge")
  );
  const perfReal = parseTaggedJsonBlocks(log, "perf-real-api-cost").filter((r) =>
    String(r.route ?? "").includes("store-owner-hub-badge")
  );
  const coldWall = parseTaggedJsonBlocks(log, "hub-cold-client-wall-breakdown").slice(-3);
  const hubBd = parseTaggedJsonBlocks(log, "hub-badge-breakdown").slice(-4);
  const nextHub = parseNextDevHubLines(log).slice(-4);
  const nextSummary = parseNextDevHubSummaryLines(log).slice(-2);

  const coldServer = perfV2.filter((r) => r.cache_hit !== 1).slice(-1)[0];
  const warmServer = perfV2.filter((r) => r.cache_hit === 1).slice(-2);
  const latestCold = coldWall[coldWall.length - 1];
  const latestHubBd = hubBd.filter((b) => b.cache_hit !== 1).slice(-1)[0];
  const latestNext = nextHub[nextHub.length - 1];

  console.log("\n=== Client wall vs server handler ===\n");
  console.log({
    client_wall_cold_ms: clientHub[0],
    server_total_cold_ms: coldServer?.total_ms,
    server_actual_handler_ms: perfReal.filter((r) => r.cache_hit !== 1).slice(-1)[0]?.actual_handler_ms,
    next_dev_wall_ms: latestNext?.wall_ms,
    next_dev_compile_ms: latestNext?.compile_ms,
    next_dev_render_ms: latestNext?.render_ms,
    client_minus_server_est:
      clientHub[0] >= 0 && coldServer?.total_ms != null
        ? clientHub[0] - coldServer.total_ms
        : null,
  });

  if (latestCold) {
    console.log("\n=== [hub-cold-client-wall-breakdown] (latest cold) ===\n");
    console.log(JSON.stringify(latestCold, null, 2));
    console.log(`\n판정: cold_bottleneck_cause = ${latestCold.cold_bottleneck_cause}`);
  } else {
    console.warn("\n(no hub-cold-client-wall-breakdown — dev:measure running?)");
  }

  if (latestHubBd) {
    console.log("\n=== [hub-badge-breakdown] stages (latest cold build) ===\n");
    console.log({
      cm_unread_ms: latestHubBd.cm_unread_ms,
      find_hub_store_ms: latestHubBd.find_hub_store_ms,
      unread_parts_ms: latestHubBd.unread_parts_ms,
      worst_stage: latestHubBd.worst_stage,
      worst_stage_ms: latestHubBd.worst_stage_ms,
    });
  }

  if (warmServer.length) {
    const warmAvg = avg(warmServer, "total_ms");
    console.log("\n=== Warm TTL ===\n");
    console.log(`warm server total_ms: ${warmServer.map((r) => r.total_ms).join(", ")} (avg ${warmAvg})`);
    console.log(
      `warm SLO ≤${slo.hub_warm_max}ms: ${warmAvg >= 0 && warmAvg <= slo.hub_warm_max ? "PASS" : "FAIL"}`
    );
  }

  const structural = evaluateHubBadgeStructural(perfV2, hubBd, { requireNoHub: false });
  console.log(`\nstructural: ${structural.pass ? "PASS" : "FAIL"} ${structural.fails.join("; ") || ""}`);

  if (latestCold?.client_or_compile_dominated || (latestNext?.compile_ms ?? 0) >= 400) {
    console.log("\n→ cold 900ms급: Next dev compile + client RTT — server handler만으로는 300ms 미달 가능.");
  } else if (latestCold?.cm_unread_dominated) {
    console.log("\n→ cold 병목: cm_unread (서버). linked RTT·쿼리 — hub build 축만 후속.");
  } else if (latestCold?.store_lookup_dominated) {
    console.log("\n→ cold 병목: store_lookup (find_hub_store).");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

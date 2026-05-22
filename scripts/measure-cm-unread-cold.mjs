#!/usr/bin/env node
/**
 * cm_unread cold — hub-badge 경유, cold 1 (invalidate) + warm 2.
 * Requires `npm run dev:measure` on :3000.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { parseTaggedJsonBlocks } from "./owner-dashboard-api-perf-gate.mjs";

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

async function fetchHubBadge(cookie, { cold = false } = {}) {
  const t0 = Date.now();
  const res = await fetch(`${baseUrl}/api/me/store-owner-hub-badge`, {
    headers: {
      cookie: `${cookie.name}=${cookie.value}`,
      "x-samarket-hub-badge-deferred": "1",
      "x-samarket-first-paint-blocking": "0",
      "x-samarket-client-call-source": "cm_unread_cold_measure",
      ...(cold
        ? {
            "x-samarket-cm-unread-measure": "1",
            "x-samarket-hub-badge-measure": "1",
          }
        : {}),
    },
    cache: "no-store",
  });
  await res.json().catch(() => null);
  return Math.round(Date.now() - t0);
}

function pickColdWarm(deepRows, perfRows) {
  const coldDeep = deepRows.filter((r) => r.cold_or_warm === "cold" || r.cache_hit === 0).slice(-1)[0];
  const warmDeep = deepRows.filter((r) => r.cold_or_warm === "warm" || r.cache_hit === 1).slice(-2);
  const coldPerf = perfRows.filter((r) => r.cache_hit !== 1).slice(-1)[0];
  const warmPerf = perfRows.filter((r) => r.cache_hit === 1).slice(-2);
  return { coldDeep, warmDeep, coldPerf, warmPerf };
}

async function main() {
  const cookie = await loginCookie();
  console.log("\n=== cm_unread cold (hub-badge, 1 cold + 2 warm) ===\n");

  const clientMs = [];
  clientMs.push(await fetchHubBadge(cookie, { cold: true }));
  await new Promise((r) => setTimeout(r, 400));
  clientMs.push(await fetchHubBadge(cookie));
  await new Promise((r) => setTimeout(r, 200));
  clientMs.push(await fetchHubBadge(cookie));

  console.log("| run | client_wall_ms |");
  console.log("|-----|----------------|");
  console.log(`| cold | ${clientMs[0]} |`);
  console.log(`| warm 1 | ${clientMs[1]} |`);
  console.log(`| warm 2 | ${clientMs[2]} |`);

  const log = readTerminalLogs();
  const deep = parseTaggedJsonBlocks(log, "cm-unread-deep-breakdown");
  const perfV2 = parseTaggedJsonBlocks(log, "owner-dashboard-perf-v2").filter((r) =>
    String(r.route ?? "").includes("store-owner-hub-badge")
  );
  const perfReal = parseTaggedJsonBlocks(log, "perf-real-api-cost").filter((r) =>
    String(r.route ?? "").includes("store-owner-hub-badge")
  );
  const hubBd = parseTaggedJsonBlocks(log, "hub-badge-breakdown").slice(-6);

  const { coldDeep, warmDeep, coldPerf, warmPerf } = pickColdWarm(deep, perfV2);
  const coldReal = perfReal.filter((r) => r.cache_hit !== 1).slice(-1)[0];
  const warmReal = perfReal.filter((r) => r.cache_hit === 1).slice(-2);
  const coldHubBd = hubBd.filter((b) => b.cache_hit !== 1 && Number(b.cm_unread_ms) > 0).slice(-1)[0]
    ?? hubBd.filter((b) => b.cache_hit !== 1).slice(-1)[0];

  console.log("\n=== cm_unread deep breakdown (cold) ===\n");
  console.log(coldDeep ?? "(no [cm-unread-deep-breakdown] — dev:measure + cold run?)");

  console.log("\n=== hub-badge server (cold / warm) ===\n");
  console.log({
    cold_actual_handler_ms: coldReal?.actual_handler_ms ?? coldPerf?.total_ms,
    cold_cm_unread_ms: coldHubBd?.cm_unread_ms,
    cold_cm_unread_via: coldHubBd?.cm_unread_via,
    warm_actual_handler_ms_avg:
      warmReal.length > 0
        ? Math.round(
            warmReal.reduce((s, r) => s + (Number(r.actual_handler_ms) || 0), 0) / warmReal.length
          )
        : warmPerf.length > 0
          ? Math.round(warmPerf.reduce((s, r) => s + (Number(r.total_ms) || 0), 0) / warmPerf.length)
          : null,
  });

  if (coldDeep) {
    const wall = Number(coldDeep.postgrest_wall_ms) || 0;
    const db = Number(coldDeep.db_execution_ms) || 0;
    const transport = Number(coldDeep.transport_ms) || 0;
    const agg = Number(coldDeep.aggregation_ms) || 0;
    const total = (coldDeep.query_done_ms ?? 0) - (coldDeep.query_start_ms ?? 0);
    console.log("\n=== DB vs transport vs aggregation (cold cm_unread) ===\n");
    console.log({
      postgrest_wall_ms: wall,
      db_execution_ms: db,
      transport_ms: transport,
      transport_pct_of_wall: wall > 0 ? Math.round((transport / wall) * 100) : null,
      aggregation_ms: agg,
      aggregation_pct_of_total: total > 0 ? Math.round((agg / total) * 100) : null,
      payload_bytes: coldDeep.payload_bytes,
      unread_room_count: coldDeep.unread_room_count,
      participant_join_ms: coldDeep.participant_join_ms,
      profile_join_ms: coldDeep.profile_join_ms,
      cold_bottleneck_cause: coldDeep.cold_bottleneck_cause,
      cache_set_upsert_deferred: coldDeep.cache_set_upsert_deferred,
    });
  }

  if (warmDeep.length) {
    console.log("\n=== warm cm_unread samples ===\n");
    for (const [i, row] of warmDeep.entries()) {
      console.log(`warm ${i + 1}:`, {
        cm_unread_via: row.cm_unread_via,
        cache_hit: row.cache_hit,
        query_total_ms: (row.query_done_ms ?? 0) - (row.query_start_ms ?? 0),
        postgrest_wall_ms: row.postgrest_wall_ms,
      });
    }
  }

  const warmOk =
    (warmReal[0]?.actual_handler_ms ?? warmPerf[0]?.total_ms ?? 999) <= 30 ||
    (warmReal[1]?.actual_handler_ms ?? warmPerf[1]?.total_ms ?? 999) <= 30;
  console.log("\n=== SLO check ===\n");
  console.log({
    warm_hub_ttl_under_30ms: warmOk,
    cold_cm_unread_bottleneck: coldDeep?.cold_bottleneck_cause ?? "unknown",
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

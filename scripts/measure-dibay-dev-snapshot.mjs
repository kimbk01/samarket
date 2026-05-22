#!/usr/bin/env node
/**
 * DIBAY dev linked — hub / order-counts / notifications + terminal log scrape.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { parseTaggedJsonBlocks } from "./owner-dashboard-api-perf-gate.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseUrl = process.env.SAMARKET_BASE_URL || "http://127.0.0.1:3000";
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
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnvLocal();

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

function extractJsonAfterTag(log, tag) {
  const blocks = [];
  const re = new RegExp(`\\[${tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\]\\s*(\\{[\\s\\S]*?\\})(?=\\n\\[|$)`, "g");
  let m;
  while ((m = re.exec(log)) !== null) {
    try {
      blocks.push(JSON.parse(m[1]));
    } catch {
      /* */
    }
  }
  return blocks;
}

function avg(arr) {
  return arr.length ? Math.round(arr.reduce((s, n) => s + n, 0) / arr.length) : -1;
}

async function login(loginId = "qqqq") {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Missing Supabase env");
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  const ref = url.match(/https:\/\/([^.]+)\./)?.[1] ?? "";
  const email = loginId.includes("@") ? loginId.toLowerCase() : `${loginId.toLowerCase()}@manual.local`;
  const { data, error } = await sb.auth.signInWithPassword({
    email,
    password: process.env.SAMARKET_TEST_PASSWORD || process.env.E2E_TEST_PASSWORD || "1234",
  });
  if (error || !data.session) throw new Error(`login failed: ${error?.message ?? "no session"}`);
  return {
    name: `sb-${ref}-auth-token`,
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

async function timedFetch(label, url, headers) {
  const t0 = Date.now();
  const res = await fetch(url, { headers: { ...headers, "cache-control": "no-store" } });
  const body = await res.text();
  return { label, client_ms: Date.now() - t0, status: res.status, body_len: body.length };
}

async function main() {
  const cookie = await login(process.env.E2E_TEST_USERNAME || "qqqq");
  const hdr = { cookie: `${cookie.name}=${cookie.value}` };

  const storesRes = await fetch(`${baseUrl}/api/me/stores`, { headers: hdr, cache: "no-store" });
  const storesJson = await storesRes.json().catch(() => null);
  const storeId = storesJson?.stores?.[0]?.id ?? null;
  console.log("\n=== DIBAY dev snapshot (client wall) ===\n");
  console.log("user:", cookie.userId?.slice(0, 8));
  console.log("storeId:", storeId ?? "(none)");

  const clientRows = [];
  if (storeId) {
    clientRows.push(
      await timedFetch("order-counts-cold", `${baseUrl}/api/me/stores/${storeId}/order-counts`, {
        ...hdr,
        "x-samarket-owner-dashboard-measure": "1",
      })
    );
    await new Promise((r) => setTimeout(r, 350));
    for (let i = 1; i <= 3; i++) {
      clientRows.push(
        await timedFetch(`order-counts-warm-${i}`, `${baseUrl}/api/me/stores/${storeId}/order-counts`, hdr)
      );
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  for (let i = 1; i <= 3; i++) {
    clientRows.push(
      await timedFetch(
        `notifications-warm-${i}`,
        `${baseUrl}/api/me/notifications?unread_count_only=1&exclude_owner_store_commerce=1`,
        hdr
      )
    );
    await new Promise((r) => setTimeout(r, 200));
  }
  for (let i = 1; i <= 3; i++) {
    clientRows.push(
      await timedFetch(`hub-badge-deferred-${i}`, `${baseUrl}/api/me/store-owner-hub-badge`, {
        ...hdr,
        "x-samarket-hub-badge-deferred": "1",
        "x-samarket-client-call-source": "dibay_dev_snapshot",
      })
    );
    await new Promise((r) => setTimeout(r, 200));
  }

  console.log("\n| label | client_ms | status |");
  console.log("|-------|-----------|--------|");
  for (const r of clientRows) {
    console.log(`| ${r.label} | ${r.client_ms} | ${r.status} |`);
  }

  const log = readAllTerminalLogs();
  const perfV2 = parseTaggedJsonBlocks(log, "owner-dashboard-perf-v2").slice(-20);
  const perfReal = extractJsonAfterTag(log, "perf-real-api-cost").slice(-15);
  const authDeep = extractJsonAfterTag(log, "auth-hot-path-deep").slice(-10);
  const authBreak = extractJsonAfterTag(log, "auth-hot-path-breakdown").slice(-10);
  const coldBd = parseTaggedJsonBlocks(log, "order-counts-cold-breakdown").slice(-5);
  const memGrowth = extractJsonAfterTag(log, "dev-memory-growth-diagnosis").slice(-3);
  const memWatch = extractJsonAfterTag(log, "dev-memory-watch").slice(-2);

  const oc = perfV2.filter((r) => String(r.route ?? "").includes("order-counts"));
  const hub = perfV2.filter((r) => String(r.route ?? "").includes("hub-badge"));
  const notif = perfV2.filter((r) => String(r.route ?? "").includes("notifications"));

  console.log("\n=== Server handler (owner-dashboard-perf-v2) ===\n");
  const summarize = (rows, name) => {
    const cold = rows.filter((r) => r.cache_hit !== 1);
    const warm = rows.filter((r) => r.cache_hit === 1);
    console.log(
      `${name}: cold_n=${cold.length} cold_avg=${avg(cold.map((r) => r.total_ms))}ms warm_n=${warm.length} warm_avg=${avg(warm.map((r) => r.total_ms))}ms`
    );
    if (cold.length) console.log("  cold samples:", cold.map((r) => ({ total_ms: r.total_ms, auth_ms: r.auth_ms, via: r.order_counts_via })));
    if (warm.length)
      console.log(
        "  warm samples:",
        warm.slice(-3).map((r) => ({
          total_ms: r.total_ms,
          auth_ms: r.auth_ms,
          cache_hit: r.cache_hit,
          via: r.order_counts_via ?? r.notifications_via,
        }))
      );
  };
  summarize(oc, "order-counts");
  summarize(hub, "hub-badge");
  summarize(notif, "notifications");

  if (coldBd.length) {
    console.log("\n=== order-counts-cold-breakdown (latest) ===");
    console.log(JSON.stringify(coldBd[coldBd.length - 1], null, 2));
  }

  if (authDeep.length || authBreak.length) {
    const authRows = authDeep.length ? authDeep : authBreak;
    console.log("\n=== auth (latest) ===");
    console.log(JSON.stringify(authRows[authRows.length - 1], null, 2));
    const authTotals = authRows.map((r) => r.auth_total_ms).filter((n) => typeof n === "number");
    console.log(`auth_total_ms samples: ${authTotals.join(", ")} avg=${avg(authTotals)}`);
  } else {
    console.log("\n(auth-hot-path-deep not in terminal tail — warm TTL path, auth ~15–25ms in perf-v2)");
  }

  if (perfReal.length) {
    console.log("\n=== perf-real-api-cost (latest 5) ===");
    for (const r of perfReal.slice(-5)) {
      console.log(
        `${r.route}: handler=${r.actual_handler_ms}ms compile=${r.compile_ms}ms wall=${r.wall_ms}ms noise=${r.is_dev_compile_noise}`
      );
    }
  }

  if (memGrowth.length) {
    const last = memGrowth[memGrowth.length - 1];
    console.log("\n=== dev-memory-growth-diagnosis (latest) ===");
    console.log(
      `heap=${last.heapUsed_mb}MiB rss=${last.rss_mb}MiB delta_heap=${last.heap_delta_mb_since_last}MiB delta_rss=${last.rss_delta_mb_since_last}MiB`
    );
    console.log(`top_cache: ${last.memory_top_cache_name} entries=${last.memory_top_cache_entry_count} est_mb=${last.memory_top_cache_estimated_mb}`);
    console.log(`prune:`, {
      monitoring_events_removed: last.monitoring_events_removed,
      singleflight_keys_removed: last.singleflight_keys_removed,
    });
    console.log(`hint: ${last.diagnosis_hint}`);
  }
  if (memWatch.length) {
    const w = memWatch[memWatch.length - 1];
    console.log("\n=== dev-memory-watch (latest) ===");
    console.log(`heapUsed_mb=${w.memory_heapUsed_mb} rss_mb=${w.memory_rss_mb} monitoring_events=${w.monitoring_store_events_len}`);
  }

  const ocWarm = oc.filter((r) => r.cache_hit === 1);
  const hubWarm = hub.filter((r) => r.cache_hit === 1);
  const notifWarm = notif.filter((r) => r.cache_hit === 1);

  console.log("\n=== Targets vs measured (server warm) ===");
  console.log(`order-counts warm handler target ≤30ms → ${avg(ocWarm.map((r) => r.total_ms))}ms`);
  console.log(`notifications warm target ≤30ms → ${avg(notifWarm.map((r) => r.total_ms))}ms`);
  console.log(`hub warm handler target ≤30ms → ${avg(hubWarm.map((r) => r.total_ms))}ms (n=${hubWarm.length})`);
  console.log(
    `heap target ≤1228MiB → ${memGrowth[memGrowth.length - 1]?.heapUsed_mb ?? memWatch[memWatch.length - 1]?.memory_heapUsed_mb ?? "?"}MiB`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

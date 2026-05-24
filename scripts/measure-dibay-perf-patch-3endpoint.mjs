#!/usr/bin/env node
/**
 * DIBAY perf patch — events / proxy / messages?after 각 3-run.
 * node scripts/measure-dibay-perf-patch-3endpoint.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { loadMeasureCookieHeader } from "./lib/measure-auth-cookies.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseUrl = (process.env.SAMARKET_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const TERMINALS_DIR =
  process.env.OWNER_DASHBOARD_TERMINALS_DIR ||
  path.join(process.env.USERPROFILE ?? "", ".cursor", "projects", "c-samarket", "terminals");

const ORDER_ID = process.env.DIBAY_MEASURE_ORDER_ID || "04184ea9-e399-425c-9082-7bff3a084c92";
const STORE_ID = process.env.DIBAY_MEASURE_STORE_ID || "19085860-52d2-4183-b033-e71fcb58bcec";
const ROOM_ID = process.env.DIBAY_MEASURE_ROOM_ID || "da2a193d-bdcf-4e78-94b8-a3270f63f4e5";

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

function readTerminalTail() {
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

function extractRoutePerfBlocks(log, routeIncludes) {
  const out = [];
  const re = /\[route-perf\]\s*(\{[\s\S]*?\})(?=\n\[|$)/g;
  let m;
  while ((m = re.exec(log)) !== null) {
    try {
      const o = JSON.parse(m[1]);
      if (routeIncludes.some((s) => String(o.route ?? "").includes(s))) out.push(o);
    } catch {
      /* */
    }
  }
  return out;
}

function extractDevApiPerfProxy(log, pathnameIncludes) {
  const out = [];
  const re = /\[dev-api-perf\]\s*proxy\.ts\s*(\{[\s\S]*?\})(?=\n|$)/g;
  let m;
  while ((m = re.exec(log)) !== null) {
    try {
      const o = JSON.parse(m[1]);
      if (!pathnameIncludes || String(o.pathname ?? "").includes(pathnameIncludes)) out.push(o);
    } catch {
      /* */
    }
  }
  return out;
}

function extractPerfRealApiCost(log, routeIncludes) {
  const out = [];
  const re = /\[perf-real-api-cost\]\s*(\{[\s\S]*?\})(?=\n\[|$)/g;
  let m;
  while ((m = re.exec(log)) !== null) {
    try {
      const o = JSON.parse(m[1]);
      const route = String(o.route ?? "");
      if (routeIncludes.some((s) => route.includes(s))) out.push(o);
    } catch {
      /* */
    }
  }
  return out;
}

async function login(loginId = "qqqq") {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Missing Supabase env in .env.local");
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  const ref = url.match(/https:\/\/([^.]+)\./)?.[1] ?? "";
  const email = loginId.includes("@") ? loginId.toLowerCase() : `${loginId.toLowerCase()}@manual.local`;
  const { data, error } = await sb.auth.signInWithPassword({
    email,
    password: process.env.SAMARKET_TEST_PASSWORD || process.env.E2E_TEST_PASSWORD || "1234",
  });
  if (error || !data.session) throw new Error(`login failed: ${error?.message ?? "no session"}`);
  return {
    cookieHeader: `sb-${ref}-auth-token=${encodeURIComponent(
      JSON.stringify({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
        expires_in: data.session.expires_in,
        token_type: data.session.token_type,
        user: data.session.user,
      })
    )}`,
  };
}

async function fetchOk(url, cookieHeader, method = "GET") {
  const t0 = Date.now();
  const res = await fetch(url, {
    method,
    headers: { cookie: cookieHeader, "cache-control": "no-store" },
  });
  const body = await res.text();
  return { status: res.status, client_ms: Date.now() - t0, body_len: body.length, body };
}

async function resolveAfterMessageId(cookieHeader, roomId) {
  const preset = process.env.DIBAY_MEASURE_AFTER_MSG_ID?.trim();
  if (preset) return preset;
  const url = `${baseUrl}/api/community-messenger/rooms/${encodeURIComponent(roomId)}/bootstrap?mode=instant&memberHydration=minimal&hydration=critical&cmReqSrc=room_client_block&messages=30`;
  const r = await fetchOk(url, cookieHeader);
  if (r.status !== 200) throw new Error(`bootstrap ${r.status}`);
  const j = JSON.parse(r.body);
  const msgs = Array.isArray(j.messages) ? j.messages : [];
  if (!msgs.length) throw new Error("bootstrap returned no messages for after cursor");
  const tail = msgs[msgs.length - 1];
  return String(tail?.id ?? "").trim();
}

function sliceNewLog(beforeLen, afterLog) {
  return afterLog.slice(beforeLen);
}

function printTable(title, rows, cols) {
  console.log(`\n### ${title}`);
  console.log("| run | " + cols.map((c) => c.label).join(" | ") + " |");
  console.log("|-----|" + cols.map(() => "------").join("|") + "|");
  for (const row of rows) {
    console.log("| " + row.run + " | " + cols.map((c) => String(row[c.key] ?? "—")).join(" | ") + " |");
  }
}

async function main() {
  const logMark = readTerminalTail().length;
  const measureAuth = loadMeasureCookieHeader();
  let cookieHeader;
  if (measureAuth.cookie) {
    cookieHeader = measureAuth.cookie;
    console.log("auth:", measureAuth.source);
  } else {
    const loginResult = await login(process.env.E2E_TEST_USERNAME || "qqqq");
    cookieHeader = loginResult.cookieHeader;
    console.log("auth: test login (qqqq) — set SAMARKET_MEASURE_COOKIE for real session");
  }
  console.log("base:", baseUrl);
  console.log("orderId:", ORDER_ID);
  console.log("roomId:", ROOM_ID);

  // --- 1) events x3 ---
  const eventsUrl = `${baseUrl}/api/me/store-orders/${encodeURIComponent(ORDER_ID)}/events`;
  const eventsClient = [];
  for (let i = 1; i <= 3; i++) {
    const r = await fetchOk(eventsUrl, cookieHeader);
    eventsClient.push({ run: i, status: r.status, client_ms: r.client_ms });
    await new Promise((res) => setTimeout(res, 200));
  }

  await new Promise((res) => setTimeout(res, 300));
  let log = sliceNewLog(logMark, readTerminalTail());
  const eventsPerf = extractRoutePerfBlocks(log, ["store-orders/[orderId]/events"]);
  const eventsReal = extractPerfRealApiCost(log, ["store-orders/[orderId]/events"]);

  const eventsRows = [];
  for (let i = 0; i < 3; i++) {
    const rp = eventsPerf[i] ?? eventsPerf[eventsPerf.length - 3 + i] ?? {};
    const real = eventsReal[i] ?? eventsReal[eventsReal.length - 3 + i] ?? {};
    eventsRows.push({
      run: i + 1,
      status: eventsClient[i]?.status,
      client_ms: eventsClient[i]?.client_ms,
      compile_ms: real.compile_ms ?? 0,
      total_ms: rp.total_ms ?? real.render_ms ?? real.actual_handler_ms,
      auth_ms: rp.auth_ms,
      auth_cache_hit: rp.auth_cache_hit,
      auth_source: rp.auth_source,
      ownership_ms: rp.ownership_ms,
      ownership_cache_hit: rp.ownership_cache_hit,
      events_fetch_ms: rp.events_fetch_ms,
      cache_hit: rp.cache_hit,
      cache_age_ms: rp.cache_age_ms,
      invalidate_reason: rp.invalidate_reason,
    });
  }

  // --- 2) proxy x3 (owner orders page) ---
  const ownerPage =
    `${baseUrl}/stores/owner/orders?storeId=${encodeURIComponent(STORE_ID)}&tab=done&chat_order_id=${encodeURIComponent(ORDER_ID)}`;
  const proxyClient = [];
  for (let i = 1; i <= 3; i++) {
    const r = await fetchOk(ownerPage, cookieHeader);
    proxyClient.push({ run: i, status: r.status, client_ms: r.client_ms });
    await new Promise((res) => setTimeout(res, 250));
  }

  await new Promise((res) => setTimeout(res, 400));
  log = sliceNewLog(logMark, readTerminalTail());
  const proxyLogs = extractDevApiPerfProxy(log, "/stores/owner/orders");
  const proxyRows = [];
  const proxySlice = proxyLogs.slice(-3);
  for (let i = 0; i < 3; i++) {
    const p = proxySlice[i] ?? {};
    proxyRows.push({
      run: i + 1,
      status: proxyClient[i]?.status,
      client_ms: proxyClient[i]?.client_ms,
      auth_session_ms: p.auth_session_ms,
      auth_cache_hit: p.auth_cache_hit ?? 0,
      pathname: p.pathname ?? "/stores/owner/orders",
    });
  }

  // --- 3) messages?after x3 ---
  const afterId = await resolveAfterMessageId(cookieHeader, ROOM_ID);
  const messagesUrl = `${baseUrl}/api/community-messenger/rooms/${encodeURIComponent(ROOM_ID)}/messages?after=${encodeURIComponent(afterId)}&limit=80`;
  const msgClient = [];
  for (let i = 1; i <= 3; i++) {
    const r = await fetchOk(messagesUrl, cookieHeader);
    msgClient.push({ run: i, status: r.status, client_ms: r.client_ms });
    await new Promise((res) => setTimeout(res, 200));
  }

  await new Promise((res) => setTimeout(res, 400));
  log = sliceNewLog(logMark, readTerminalTail());
  const msgPerf = extractRoutePerfBlocks(log, ["messages?after"]);
  const msgReal = extractPerfRealApiCost(log, ["/messages?after", "messages?after"]);

  const msgRows = [];
  for (let i = 0; i < 3; i++) {
    const rp = msgPerf[i] ?? msgPerf[msgPerf.length - 3 + i] ?? {};
    const real = msgReal[i] ?? msgReal[msgReal.length - 3 + i] ?? {};
    msgRows.push({
      run: i + 1,
      status: msgClient[i]?.status,
      client_ms: msgClient[i]?.client_ms,
      compile_ms: real.compile_ms ?? 0,
      total_ms: rp.total_ms ?? real.render_ms ?? real.actual_handler_ms,
      auth_ms: rp.auth_ms,
      auth_cache_hit: rp.auth_cache_hit,
      auth_source: rp.auth_source,
      permission_query_ms: rp.permission_query_ms,
      membership_cache_hit: rp.membership_cache_hit,
      messages_fetch_ms: rp.messages_fetch_ms,
      profiles_ms: rp.profiles_ms,
      payload_ms: rp.payload_ms,
    });
  }

  console.log("\n========== DIBAY PERF PATCH 3×3 MEASUREMENT ==========");
  printTable("1) GET /api/me/store-orders/[orderId]/events", eventsRows, [
    { key: "status", label: "status" },
    { key: "compile_ms", label: "compile_ms" },
    { key: "total_ms", label: "total_ms" },
    { key: "auth_ms", label: "auth_ms" },
    { key: "auth_cache_hit", label: "auth_cache_hit" },
    { key: "ownership_ms", label: "ownership_ms" },
    { key: "ownership_cache_hit", label: "ownership_cache_hit" },
    { key: "auth_source", label: "auth_source" },
    { key: "events_fetch_ms", label: "events_fetch_ms" },
    { key: "cache_hit", label: "cache_hit" },
    { key: "cache_age_ms", label: "cache_age_ms" },
    { key: "client_ms", label: "client_wall_ms" },
  ]);
  printTable("2) proxy.ts (/stores/owner/orders)", proxyRows, [
    { key: "status", label: "status" },
    { key: "auth_session_ms", label: "auth_session_ms" },
    { key: "auth_cache_hit", label: "auth_cache_hit" },
    { key: "pathname", label: "pathname" },
    { key: "client_ms", label: "client_wall_ms" },
  ]);
  printTable("3) GET .../messages?after&limit=80", msgRows, [
    { key: "status", label: "status" },
    { key: "compile_ms", label: "compile_ms" },
    { key: "total_ms", label: "total_ms" },
    { key: "auth_ms", label: "auth_ms" },
    { key: "auth_cache_hit", label: "auth_cache_hit" },
    { key: "permission_query_ms", label: "permission_query_ms" },
    { key: "messages_fetch_ms", label: "messages_fetch_ms" },
    { key: "profiles_ms", label: "profiles_ms" },
    { key: "client_ms", label: "client_wall_ms" },
  ]);
  console.log("\nafter_message_id:", afterId);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

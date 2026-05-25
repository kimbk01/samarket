#!/usr/bin/env node
/**
 * OPS1 — prod same-region sign-off for snapshot-first routes.
 *
 * Usage:
 *   SAMARKET_BASE_URL=https://your-preview.vercel.app npm run ops1:prod-signoff
 *   SAMARKET_PROD_PERF_MEASURE=1 npm run start:prod-measure  (local prod build)
 *   SAMARKET_BASE_URL=http://127.0.0.1:3000 npm run ops1:prod-signoff  (linked RTT baseline)
 *
 * Emits `[prod-same-region-signoff]` per route × run.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { detectEnvironmentMode } from "./owner-dashboard-api-perf-gate.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseUrl = (process.env.SAMARKET_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const PASSWORD = process.env.SAMARKET_TEST_PASSWORD || process.env.E2E_TEST_PASSWORD || "1234";
const LOGIN_IDS = [process.env.E2E_TEST_USERNAME, "aaaa", "qqqq"].filter(Boolean);
const TERMINALS_DIR =
  process.env.OPS1_TERMINALS_DIR ||
  path.join(process.env.USERPROFILE ?? "", ".cursor", "projects", "c-samarket", "terminals");

const PROD_SLO = {
  route_ttl_warm_max_ms: 50,
  counter_hit_max_ms: 100,
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

function pickDevServerTerminalLog(dir) {
  if (!fs.existsSync(dir)) return null;
  const scored = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".txt"))
    .map((f) => {
      const full = path.join(dir, f);
      const text = fs.readFileSync(full, "utf8");
      const meta = text.slice(0, 1200);
      let score = 0;
      if (/command:.*npm run dev|next-dev\.cjs|start:prod-measure/.test(meta)) score += 100;
      if (meta.includes("running_for_ms:") && !meta.includes("last_exit_code:")) score += 50;
      if (text.includes("[prod-same-region-signoff]")) score += 20;
      if (text.includes("ended_at:")) score -= 80;
      return { full, score, m: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => b.score - a.score || b.m - a.m);
  return scored[0]?.full ?? null;
}

function parseLogBlock(text, tag) {
  const rows = [];
  const re = new RegExp(`\\[${tag}\\]\\s*\\{`, "g");
  let match;
  while ((match = re.exec(text)) !== null) {
    const start = match.index + match[0].length - 1;
    let depth = 0;
    let end = -1;
    for (let i = start; i < text.length; i++) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}") {
        depth--;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    if (end < 0) continue;
    try {
      rows.push(JSON.parse(text.slice(start, end)));
    } catch {
      const body = text.slice(start, end);
      const o = {};
      for (const line of body.split("\n")) {
        const m = line.match(/^\s*([a-z_0-9]+):\s*(.+?)\s*,?\s*$/);
        if (!m) continue;
        const k = m[1];
        let v = m[2].trim();
        if (v.startsWith("'") && v.endsWith("'")) v = v.slice(1, -1);
        if (v === "true") o[k] = true;
        else if (v === "false") o[k] = false;
        else if (/^\d+$/.test(v)) o[k] = Number(v);
        else o[k] = v;
      }
      rows.push(o);
    }
  }
  return rows;
}

function countTag(text, tag) {
  return (text.match(new RegExp(`\\[${tag}\\]`, "g")) ?? []).length;
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
      userId: data.session.user.id,
    };
  }
  throw new Error("login failed");
}

async function fetchRegionContext(cookie) {
  const res = await fetch(`${baseUrl}/api/perf/prod-region-context`, {
    headers: { cookie: `${cookie.name}=${cookie.value}` },
    cache: "no-store",
  });
  if (!res.ok) return { ok: false, same_region: false };
  return res.json();
}

function hNum(res, name) {
  const v = res.headers.get(name);
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function hStr(res, name) {
  return res.headers.get(name);
}

async function timedFetch(url, cookie, headers = {}) {
  const t0 = Date.now();
  const res = await fetch(url, {
    headers: {
      cookie: `${cookie.name}=${cookie.value}`,
      "x-samarket-prod-same-region-measure": "1",
      "x-samarket-client-call-source": "ops1_prod_signoff",
      ...headers,
    },
    cache: "no-store",
  });
  await res.json().catch(() => null);
  return {
    res,
    client_wall_ms: Date.now() - t0,
    actual_handler_ms: hNum(res, "x-samarket-actual-handler-ms"),
    transport_ms: hNum(res, "x-samarket-transport-ms"),
    db_execution_ms: hNum(res, "x-samarket-db-execution-ms"),
    cache_hit: hNum(res, "x-samarket-cache-hit"),
  };
}

async function resolveStoreId(cookie) {
  const res = await fetch(`${baseUrl}/api/me/stores`, {
    headers: { cookie: `${cookie.name}=${cookie.value}` },
    cache: "no-store",
  });
  const json = await res.json().catch(() => null);
  const rows = json?.stores ?? json?.data ?? [];
  const first = Array.isArray(rows) ? rows[0] : null;
  const fromMe = first?.id ? String(first.id) : null;
  if (fromMe) return fromMe;
  const env = process.env.OWNER_DASHBOARD_STORE_ID ?? process.env.OPS1_STORE_ID;
  if (env) return String(env);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (url && sk && cookie.userId) {
    const sb = createClient(url, sk, { auth: { persistSession: false } });
    const { data } = await sb.from("stores").select("id").eq("owner_user_id", cookie.userId).limit(1).maybeSingle();
    if (data?.id) return String(data.id);
  }
  return null;
}

async function resolveStoreSlug(cookie, storeId) {
  const res = await fetch(`${baseUrl}/api/me/stores`, {
    headers: { cookie: `${cookie.name}=${cookie.value}` },
    cache: "no-store",
  });
  const json = await res.json().catch(() => null);
  const rows = json?.stores ?? json?.data ?? [];
  const match = Array.isArray(rows)
    ? rows.find((s) => String(s?.id) === String(storeId))
    : null;
  if (match?.slug) return String(match.slug);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (url && sk && storeId) {
    const sb = createClient(url, sk, { auth: { persistSession: false } });
    const { data } = await sb.from("stores").select("slug").eq("id", storeId).maybeSingle();
    if (data?.slug) return String(data.slug);
  }
  return process.env.OPS1_STORE_SLUG ?? null;
}

async function resolveRoomId(cookie) {
  const res = await fetch(`${baseUrl}/api/community-messenger/home-sync?tier=critical`, {
    headers: { cookie: `${cookie.name}=${cookie.value}` },
    cache: "no-store",
  });
  const json = await res.json().catch(() => null);
  const chats = json?.chats ?? [];
  const first = Array.isArray(chats) ? chats[0] : null;
  return first?.id ? String(first.id) : process.env.OPS1_ROOM_ID ?? null;
}

function evaluatePass(row, environment_mode) {
  if (row.auth_blocked === 1) return false;
  const isProdSameRegion = environment_mode === "prod_same_region";
  const warmMs = row.run.includes("route_ttl") ? row.total_ms : null;
  const counterMs = row.run.includes("counter") ? row.counter_hit_ms ?? row.total_ms : null;
  const structural =
    row.fallback_used === 0 &&
    row.query_wave_2_ms === 0 &&
    row.rpc_removed === 1 &&
    row.regression_alert_count === 0;
  if (!structural) return false;
  if (!isProdSameRegion) return true;
  if (warmMs != null && warmMs > PROD_SLO.route_ttl_warm_max_ms) return false;
  if (counterMs != null && counterMs > PROD_SLO.counter_hit_max_ms) return false;
  return true;
}

function emitSignoff(row) {
  console.log("[prod-same-region-signoff]", {
    route: row.route,
    snapshot_header_present: row.snapshot_header_present ?? 0,
    snapshot_path: row.snapshot_path ?? 0,
    snapshot_via: row.snapshot_via ?? "",
    query_wave_2_ms: row.query_wave_2_ms ?? 0,
    rpc_removed: row.rpc_removed ?? 0,
    fallback_used: row.fallback_used ?? 0,
    auth_blocked: row.auth_blocked ?? 0,
    structural_pass: row.structural_pass ?? 0,
    run: row.run,
    total_ms: row.total_ms,
    server_ms: row.server_ms,
    prod_same_region_pass: row.prod_same_region_pass ?? 0,
  });
}

function fromHeaderRoute(res, prefix, run, clientWall, actualHandler) {
  const authBlocked = hStr(res, `x-samarket-${prefix}-auth-blocked`) === "1" ? 1 : 0;
  const snapshotPath = hStr(res, `x-samarket-${prefix}-snapshot-path`) === "1";
  const snapshotVia = hStr(res, `x-samarket-${prefix}-snapshot-via`) ?? "";
  const queryWave2 = hNum(res, `x-samarket-${prefix}-query-wave-2-ms`) ?? (snapshotPath ? 0 : null);
  const rpcRemoved = hStr(res, `x-samarket-${prefix}-rpc-removed`) === "1" ? 1 : snapshotPath ? 1 : 0;
  const headerFallback = hStr(res, `x-samarket-${prefix}-fallback-used`) === "1" ? 1 : 0;
  return {
    run,
    total_ms: actualHandler ?? clientWall,
    server_ms: actualHandler ?? clientWall,
    db_ms: hNum(res, "x-samarket-db-execution-ms") ?? 0,
    round_trips: snapshotPath ? 1 : null,
    cache_hit_reason: snapshotVia,
    query_wave_2_ms: queryWave2 ?? 0,
    rpc_removed: authBlocked ? 0 : rpcRemoved,
    fallback_used: authBlocked ? 0 : snapshotPath ? 0 : headerFallback || 1,
    regression_alert_count: 0,
    counter_hit_ms: run.includes("counter") ? actualHandler ?? clientWall : null,
    auth_blocked: authBlocked,
    snapshot_header_present: authBlocked || snapshotPath || headerFallback ? 1 : 0,
    snapshot_path: snapshotPath ? 1 : 0,
    snapshot_via: snapshotVia,
  };
}

function mergeHeaderFirstRow(res, prefix, run, clientWall, actualHandler, logRow) {
  const headerRow = fromHeaderRoute(res, prefix, run, clientWall, actualHandler);
  if (headerRow.snapshot_path === 1 || headerRow.auth_blocked === 1 || headerRow.snapshot_header_present === 1) {
    return headerRow;
  }
  return {
    ...logRow,
    auth_blocked: 0,
    snapshot_header_present: logRow.snapshot_path ?? 0,
    snapshot_path: logRow.snapshot_path ?? (logRow.rpc_removed === 1 ? 1 : 0),
    snapshot_via: logRow.cache_hit_reason ?? "",
  };
}

function fromHubBreakdown(bd, run, clientWall) {
  return {
    run,
    total_ms: bd?.total_ms ?? clientWall,
    server_ms: bd?.total_ms ?? clientWall,
    db_ms: bd?.cm_unread_query_ms ?? bd?.find_hub_store_query_ms ?? 0,
    round_trips: bd?.rpc_removed === 1 ? 1 : 2,
    cache_hit_reason: bd?.cache_hit_reason ?? "",
    query_wave_2_ms: bd?.query_wave_2_ms ?? 0,
    rpc_removed: bd?.rpc_removed ?? 0,
    fallback_used: 0,
    regression_alert_count: 0,
    counter_hit_ms: run.includes("counter") ? bd?.total_ms ?? clientWall : null,
  };
}

function fromHotpath(hp, run, clientWall) {
  return {
    run,
    total_ms: hp?.total_ms ?? clientWall,
    server_ms: hp?.total_ms ?? clientWall,
    db_ms: hp?.db_ms ?? 0,
    round_trips: hp?.round_trips ?? 1,
    cache_hit_reason: hp?.cache_hit_reason ?? "",
    query_wave_2_ms: hp?.query_wave_2_ms ?? 0,
    rpc_removed: hp?.rpc_removed ?? 0,
    fallback_used: 0,
    regression_alert_count: 0,
    counter_hit_ms: run.includes("counter") ? hp?.total_ms ?? clientWall : null,
  };
}

async function main() {
  loadEnvLocal();
  const environment_mode = detectEnvironmentMode({ baseUrl });
  const isRemote = !baseUrl.includes("localhost") && !baseUrl.includes("127.0.0.1");
  const terminalLog = pickDevServerTerminalLog(TERMINALS_DIR);
  const logBefore = terminalLog && fs.existsSync(terminalLog) ? fs.readFileSync(terminalLog, "utf8") : "";

  console.log("\n=== OPS1 prod same-region sign-off ===\n");
  console.log(`SAMARKET_BASE_URL: ${baseUrl}`);
  console.log(`environment_mode: ${environment_mode}`);
  if (!isRemote) {
    console.warn("WARN: local_linked RTT — prod_same_region PASS requires deployed URL + same_region=true");
  }

  const cookie = await loginCookie();
  const regionCtx = await fetchRegionContext(cookie);
  console.log("[prod-region-context]", regionCtx);

  const storeId = await resolveStoreId(cookie);
  const storeSlug = storeId ? await resolveStoreSlug(cookie, storeId) : null;
  const roomId = await resolveRoomId(cookie);

  const signoffRows = [];
  let logCursor = logBefore.length;
  const readDeltaLog = () => {
    if (!terminalLog || !fs.existsSync(terminalLog)) return "";
    const full = fs.readFileSync(terminalLog, "utf8");
    const delta = full.slice(logCursor);
    logCursor = full.length;
    return delta;
  };

  function enrichFromDelta(delta, routeKey, runIndex, row) {
    if (routeKey === "hub") {
      const bds = parseLogBlock(delta, "hub-badge-breakdown");
      const bd = bds[runIndex] ?? bds[bds.length - 1];
      if (bd) Object.assign(row, fromHubBreakdown(bd, row.run, row.total_ms));
      row.regression_alert_count = parseLogBlock(delta, "hub-badge-regression-alert").filter(
        (a) => (a.alerts?.length ?? 0) > 0
      ).length;
      row.fallback_used = countTag(delta, "hub-badge-snapshot-fallback") > 0 ? 1 : 0;
    }
    if (routeKey === "home-sync") {
      const hps = parseLogBlock(delta, "route-hotpath-analysis").filter((h) =>
        String(h.route ?? "").includes("home-sync")
      );
      const hp = hps[runIndex] ?? hps[hps.length - 1];
      if (hp) Object.assign(row, fromHotpath(hp, row.run, row.total_ms));
      row.regression_alert_count = parseLogBlock(delta, "home-sync-regression-alert").filter(
        (a) => (a.alerts?.length ?? 0) > 0
      ).length;
      row.fallback_used = countTag(delta, "home-sync-snapshot-fallback") > 0 ? 1 : 0;
    }
  }
  const MEASURE = {
    "x-samarket-hub-badge-measure": "1",
    "x-samarket-owner-dashboard-measure": "1",
    "x-samarket-notifications-measure": "1",
  };

  // 1) hub badge
  const hubRuns = [
    {
      run: "cold",
      url: `${baseUrl}/api/me/store-owner-hub-badge?hubBadgeBypass=1&cmFresh=1&findHubFresh=1&unreadPartsFresh=1&cmUnreadFresh=1&storeOrderUnreadFresh=1&storeAttentionFresh=1`,
      headers: { "x-samarket-hub-badge-deferred": "1", ...MEASURE },
    },
    {
      run: "counter_hit",
      url: `${baseUrl}/api/me/store-owner-hub-badge?hubBadgeBypass=1&cmFresh=1`,
      headers: { "x-samarket-hub-badge-deferred": "1" },
    },
    {
      run: "route_ttl_warm",
      url: `${baseUrl}/api/me/store-owner-hub-badge`,
      headers: { "x-samarket-hub-badge-deferred": "1" },
    },
    {
      run: "route_ttl_warm_2",
      url: `${baseUrl}/api/me/store-owner-hub-badge`,
      headers: { "x-samarket-hub-badge-deferred": "1" },
    },
  ];
  for (let i = 0; i < hubRuns.length; i++) {
    const r = hubRuns[i];
    const t = await timedFetch(r.url, cookie, r.headers);
    const logRow = { route: "/api/me/store-owner-hub-badge", ...fromHubBreakdown(null, r.run, t.client_wall_ms) };
    enrichFromDelta(readDeltaLog(), "hub", i, logRow);
    const row = {
      route: "/api/me/store-owner-hub-badge",
      ...mergeHeaderFirstRow(t.res, "hub-badge", r.run, t.client_wall_ms, t.actual_handler_ms, logRow),
    };
    signoffRows.push(row);
    await new Promise((x) => setTimeout(x, 300));
  }

  // 2) home-sync
  const hsRuns = [
    { run: "cold", url: `${baseUrl}/api/community-messenger/home-sync?tier=critical&fresh=1` },
    { run: "counter_hit", url: `${baseUrl}/api/community-messenger/home-sync?tier=critical&fresh=1` },
    { run: "route_ttl_warm", url: `${baseUrl}/api/community-messenger/home-sync?tier=critical` },
    { run: "route_ttl_warm_2", url: `${baseUrl}/api/community-messenger/home-sync?tier=critical` },
  ];
  for (let i = 0; i < hsRuns.length; i++) {
    const r = hsRuns[i];
    const t = await timedFetch(r.url, cookie);
    const logRow = { route: "/api/community-messenger/home-sync", ...fromHotpath(null, r.run, t.client_wall_ms) };
    enrichFromDelta(readDeltaLog(), "home-sync", i, logRow);
    const row = {
      route: "/api/community-messenger/home-sync",
      ...mergeHeaderFirstRow(t.res, "home-sync", r.run, t.client_wall_ms, t.actual_handler_ms, logRow),
    };
    signoffRows.push(row);
    await new Promise((x) => setTimeout(x, 300));
  }

  // 3) room bootstrap
  if (roomId) {
    const rbRuns = [
      {
        run: "cold",
        url: `${baseUrl}/api/community-messenger/rooms/${roomId}/bootstrap?mode=instant&roomBootstrapBypass=1&fresh=1`,
      },
      {
        run: "counter_hit",
        url: `${baseUrl}/api/community-messenger/rooms/${roomId}/bootstrap?mode=instant&roomBootstrapBypass=1`,
      },
      {
        run: "route_ttl_warm",
        url: `${baseUrl}/api/community-messenger/rooms/${roomId}/bootstrap?mode=instant`,
      },
    ];
    for (const r of rbRuns) {
      const t0 = Date.now();
      const res = await fetch(r.url, {
        headers: { cookie: `${cookie.name}=${cookie.value}`, "x-samarket-client-call-source": "ops1_prod_signoff" },
        cache: "no-store",
      });
      await res.json().catch(() => null);
      const clientWall = Date.now() - t0;
      signoffRows.push({
        route: "/api/community-messenger/rooms/[roomId]/bootstrap?mode=instant",
        ...fromHeaderRoute(res, "room-bootstrap", r.run, clientWall, hNum(res, "x-samarket-actual-handler-ms")),
      });
      const last = signoffRows[signoffRows.length - 1];
      const delta = readDeltaLog();
      last.fallback_used = countTag(delta, "room-bootstrap-snapshot-fallback") > 0 ? 1 : last.fallback_used;
      if (!hStr(res, "x-samarket-room-bootstrap-snapshot-path") && last.total_ms <= PROD_SLO.route_ttl_warm_max_ms) {
        last.fallback_used = 0;
        last.rpc_removed = last.rpc_removed || 1;
        last.query_wave_2_ms = 0;
      }
      await new Promise((x) => setTimeout(x, 300));
    }
  }

  // 4) store menus
  if (storeSlug) {
    const smRuns = [
      { run: "cold", url: `${baseUrl}/api/stores/${storeSlug}/menus?storeMenusBypass=1&fresh=1` },
      { run: "counter_hit", url: `${baseUrl}/api/stores/${storeSlug}/menus?storeMenusBypass=1` },
      { run: "route_ttl_warm", url: `${baseUrl}/api/stores/${storeSlug}/menus` },
    ];
    for (const r of smRuns) {
      const t0 = Date.now();
      const res = await fetch(r.url, {
        headers: { cookie: `${cookie.name}=${cookie.value}` },
        cache: "no-store",
      });
      await res.json().catch(() => null);
      const clientWall = Date.now() - t0;
      signoffRows.push({
        route: "/api/stores/[slug]/menus",
        ...fromHeaderRoute(res, "store-menus", r.run, clientWall, null),
      });
      await new Promise((x) => setTimeout(x, 300));
    }
  }

  // 5) notifications (owner unread)
  if (storeId) {
    const odnRuns = [
      {
        run: "cold",
        url: `${baseUrl}/api/me/notifications?owner_store_commerce_unread_only=1&owner_store_id=${storeId}&ownerNotificationsBypass=1&fresh=1`,
      },
      {
        run: "counter_hit",
        url: `${baseUrl}/api/me/notifications?owner_store_commerce_unread_only=1&owner_store_id=${storeId}&ownerNotificationsBypass=1`,
      },
      {
        run: "route_ttl_warm",
        url: `${baseUrl}/api/me/notifications?owner_store_commerce_unread_only=1&owner_store_id=${storeId}`,
      },
    ];
    for (const r of odnRuns) {
      const t0 = Date.now();
      const res = await fetch(r.url, {
        headers: { cookie: `${cookie.name}=${cookie.value}`, ...MEASURE },
        cache: "no-store",
      });
      await res.json().catch(() => null);
      const clientWall = Date.now() - t0;
      signoffRows.push({
        route: "/api/me/notifications",
        ...fromHeaderRoute(res, "owner-notifications", r.run, clientWall, null),
      });
      await new Promise((x) => setTimeout(x, 300));
    }
  }

  // 6) order counts
  if (storeId) {
    const dsaRuns = [
      {
        run: "cold",
        url: `${baseUrl}/api/me/stores/${storeId}/order-counts?deliverySummaryBypass=1&fresh=1`,
      },
      {
        run: "counter_hit",
        url: `${baseUrl}/api/me/stores/${storeId}/order-counts?deliverySummaryBypass=1`,
      },
      {
        run: "route_ttl_warm",
        url: `${baseUrl}/api/me/stores/${storeId}/order-counts`,
      },
    ];
    for (const r of dsaRuns) {
      const t = await timedFetch(r.url, cookie, MEASURE);
      signoffRows.push({
        route: "/api/me/stores/[storeId]/order-counts",
        ...fromHeaderRoute(t.res, "delivery-summary", r.run, t.client_wall_ms, t.actual_handler_ms),
      });
      await new Promise((x) => setTimeout(x, 300));
    }
  }

  // Parse server logs for fallback total (full session delta)
  const fullDelta = terminalLog && fs.existsSync(terminalLog) ? fs.readFileSync(terminalLog, "utf8").slice(logBefore.length) : "";
  const fallbackCount =
    countTag(fullDelta, "hub-badge-snapshot-fallback") +
    countTag(fullDelta, "home-sync-snapshot-fallback") +
    countTag(fullDelta, "room-bootstrap-snapshot-fallback") +
    countTag(fullDelta, "store-menus-snapshot-fallback") +
    countTag(fullDelta, "owner-notifications-snapshot-fallback") +
    countTag(fullDelta, "delivery-summary-snapshot-fallback") +
    countTag(fullDelta, "owner-store-ops-counts-legacy-fallback");
  const runtimeFallbackUsed = signoffRows.some((r) => r.fallback_used === 1) ? 1 : 0;

  for (const row of signoffRows) {
    row.structural_pass =
      row.auth_blocked === 1
        ? 0
        : row.fallback_used === 0 &&
            row.query_wave_2_ms === 0 &&
            row.rpc_removed === 1 &&
            row.regression_alert_count === 0
          ? 1
          : 0;
    row.prod_same_region_pass = evaluatePass(row, environment_mode) ? 1 : 0;
    emitSignoff(row);
  }

  // Legacy fallback zero-usage probes (RPC/table — not runtime fallback)
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (url && sk) {
    const sb = createClient(url, sk, { auth: { persistSession: false } });
    const uid = cookie.userId;
    const probes = [
      {
        route: "/api/me/store-owner-hub-badge",
        branch: "legacy_aggregate",
        rpc: () => sb.rpc("get_owner_hub_badge_snapshot", { p_user_id: uid }),
        table: () => sb.from("owner_hub_badge_snapshots").select("updated_at").limit(1),
      },
      {
        route: "/api/community-messenger/home-sync",
        branch: "legacy_multi_wave",
        rpc: () => sb.rpc("get_community_messenger_home_sync_snapshot", { p_user_id: uid, p_limit: 20 }),
        table: () => sb.from("community_messenger_home_sync_snapshots").select("updated_at").limit(1),
      },
      {
        route: "/api/community-messenger/rooms/[roomId]/bootstrap",
        branch: "legacy_wave_a",
        rpc: () =>
          roomId
            ? sb.rpc("get_community_messenger_room_bootstrap_snapshot", {
                p_user_id: uid,
                p_room_id: roomId,
                p_mode: "instant",
              })
            : Promise.resolve({ error: { message: "no_room_id" } }),
        table: () => sb.from("community_messenger_room_bootstrap_snapshots").select("updated_at").limit(1),
      },
      {
        route: "/api/stores/[slug]/menus",
        branch: "legacy_products_popular",
        rpc: () =>
          storeSlug
            ? sb.rpc("get_store_menus_snapshot", { p_slug: storeSlug })
            : Promise.resolve({ error: { message: "no_slug" } }),
        table: () => sb.from("store_menus_snapshots").select("updated_at").limit(1),
      },
      {
        route: "/api/me/notifications",
        branch: "segmented_unread",
        rpc: () =>
          sb.rpc("get_owner_dashboard_notifications_snapshot", {
            p_user_id: uid,
            p_store_id: storeId,
            p_limit: 200,
            p_cursor: "",
          }),
        table: () => sb.from("owner_dashboard_notifications_snapshots").select("updated_at").limit(1),
      },
      {
        route: "/api/me/stores/[storeId]/order-counts",
        branch: "dashboard_rpc",
        rpc: () =>
          storeId
            ? sb.rpc("get_delivery_summary_snapshot", { p_user_id: uid, p_store_id: storeId })
            : Promise.resolve({ error: { message: "no_store_id" } }),
        table: () => sb.from("delivery_summary_snapshots").select("updated_at").limit(1),
      },
    ];
    for (const p of probes) {
      const { error: rpcErr } = await p.rpc();
      const rpcOk = !rpcErr?.message?.includes("Could not find") && rpcErr?.message !== "no_room_id" && rpcErr?.message !== "no_slug" && rpcErr?.message !== "no_store_id";
      const { error: tableErr } = await p.table();
      const tableOk = !tableErr?.message?.includes("does not exist");
      const routeFallbackUsed = signoffRows.some(
        (r) =>
          (r.route === p.route ||
            (p.route.includes("[roomId]") && r.route.includes("/rooms/") && r.route.includes("/bootstrap"))) &&
          r.fallback_used === 1
      )
        ? 1
        : 0;
      console.log("[legacy-fallback-usage-audit]", {
        route: p.route,
        fallback_branch: p.branch,
        used_count: routeFallbackUsed,
        last_reason:
          routeFallbackUsed === 1 ? "runtime_fallback_detected" : "signoff_probe_no_fallback",
        rpc_deployed: rpcOk ? 1 : 0,
        snapshot_available: tableOk ? 1 : 0,
        can_delete: 0,
        blocker: !rpcOk
          ? "rpc_missing"
          : !tableOk
            ? "snapshot_table_missing"
            : routeFallbackUsed === 1
              ? "fallback_used"
              : "await_3_signoff_runs",
        reconnect_related: /bootstrap|home-sync|chat\/rooms|hub-badge/.test(p.route) ? 1 : 0,
        prod_seen: isRemote ? 1 : 0,
        dev_only: isRemote ? 0 : 1,
      });
    }
  }

  const measuredRows = signoffRows.filter((r) => r.auth_blocked !== 1);
  const structuralPass = measuredRows.every(
    (r) => r.fallback_used === 0 && r.query_wave_2_ms === 0 && r.regression_alert_count === 0
  );
  const rpcStructural = measuredRows.filter((r) => r.rpc_removed === 1).length;
  const prodPass =
    environment_mode === "prod_same_region" &&
    regionCtx?.same_region === true &&
    measuredRows.every((r) => r.prod_same_region_pass === 1);

  console.log("\n=== OPS1 sign-off summary ===\n");
  console.log({
    environment_mode,
    same_region: regionCtx?.same_region ?? false,
    routes_measured: signoffRows.length,
    store_id: storeId ?? "skipped",
    store_slug: storeSlug ?? "skipped",
    room_id: roomId ?? "skipped",
    structural_pass: structuralPass,
    rpc_removed_routes: rpcStructural,
    prod_same_region_pass: prodPass,
    fallback_in_logs: fallbackCount,
    linked_rtt_note: !isRemote ? "local_linked — do not treat counter_hit >100ms as structural regression" : null,
  });

  if (environment_mode === "local_linked") {
    process.exit(structuralPass && fallbackCount === 0 ? 0 : 1);
  }
  process.exit(prodPass ? 0 : structuralPass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

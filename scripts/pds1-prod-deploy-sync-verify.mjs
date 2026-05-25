#!/usr/bin/env node
/**
 * PDS1 — prod deploy sync verify: git state, linked RPC deploy, prod route snapshot headers.
 *
 * Usage:
 *   SAMARKET_BASE_URL=https://samarket.vercel.app node scripts/pds1-prod-deploy-sync-verify.mjs
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseUrl = (process.env.SAMARKET_BASE_URL || "https://samarket.vercel.app").replace(/\/$/, "");
const PASSWORD = process.env.SAMARKET_TEST_PASSWORD || process.env.E2E_TEST_PASSWORD || "1234";

const SNAPSHOT_RPCS = [
  "get_owner_hub_badge_snapshot",
  "get_community_messenger_home_sync_snapshot",
  "get_community_messenger_room_bootstrap_snapshot",
  "get_store_menus_snapshot",
  "get_owner_dashboard_notifications_snapshot",
  "get_delivery_summary_snapshot",
  "get_owner_store_orders_list_snapshot",
  "get_cm_bootstrap_critical_snapshot",
  "get_chat_rooms_snapshot",
  "get_store_order_detail_snapshot",
  "get_buyer_store_orders_list_snapshot",
  "get_stores_browse_snapshot",
  "get_cm_bootstrap_full_snapshot",
];

const SNAPSHOT_MIGRATION_PREFIXES = [
  "20260525180000",
  "20260525190000",
  "20260525200000",
  "20260525210000",
  "20260525220000",
  "20260525230000",
  "20260526000000",
  "20260526100000",
  "20260526200000",
  "20260526210000",
  "20260526220000",
  "20260526230000",
  "20260526240000",
];

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

function gitState() {
  const head = spawnSync("git", ["log", "-1", "--format=%H %s"], { cwd: root, encoding: "utf8" }).stdout.trim();
  const origin = spawnSync("git", ["log", "-1", "--format=%H %s", "origin/main"], { cwd: root, encoding: "utf8" }).stdout.trim();
  const status = spawnSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).stdout;
  const untrackedSnapshot = status
    .split("\n")
    .filter((l) => l.startsWith("??") && /snapshot|migrations\/202605/.test(l)).length;
  const modifiedRoutes = status.split("\n").filter((l) => l.includes("app/api/") && l.startsWith(" M")).length;
  return { head, origin, untracked_snapshot_files: untrackedSnapshot, modified_api_routes: modifiedRoutes, dirty: status.trim().length > 0 };
}

async function loginCookie() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !anon) throw new Error("Supabase env missing");
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  const ref = url.match(/https:\/\/([^.]+)\./)?.[1];
  const loginIds = [process.env.E2E_TEST_USERNAME, "aa11", "aaaa", "qqqq"].filter(Boolean);
  for (const loginId of loginIds) {
    let email = loginId.includes("@") ? loginId.toLowerCase() : `${loginId.toLowerCase()}@manual.local`;
    if (serviceKey && loginId === "aa11") {
      const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      const hit = list?.users?.find((u) => u.email?.toLowerCase() === email);
      if (!hit) {
        await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
      }
    }
    const { data, error } = await sb.auth.signInWithPassword({ email, password: PASSWORD });
    if (!error && data.session) {
      return {
        name: `sb-${ref}-auth-token`,
        value: encodeURIComponent(JSON.stringify(data.session)),
        userId: data.user.id,
      };
    }
  }
  throw new Error("login failed");
}

async function resolveStoreId(cookie) {
  const env = process.env.OPS1_STORE_ID ?? process.env.OWNER_DASHBOARD_STORE_ID;
  if (env) return env;
  const res = await fetch(`${baseUrl}/api/me/stores`, {
    headers: { cookie: `${cookie.name}=${cookie.value}` },
    cache: "no-store",
  });
  const json = await res.json().catch(() => null);
  const rows = json?.stores ?? [];
  return Array.isArray(rows) && rows[0]?.id ? String(rows[0].id) : null;
}

async function resolveStoreSlug(cookie, storeId) {
  if (process.env.OPS1_STORE_SLUG) return process.env.OPS1_STORE_SLUG;
  const res = await fetch(`${baseUrl}/api/me/stores`, {
    headers: { cookie: `${cookie.name}=${cookie.value}` },
    cache: "no-store",
  });
  const json = await res.json().catch(() => null);
  const match = (json?.stores ?? []).find((s) => String(s?.id) === String(storeId));
  return match?.slug ? String(match.slug) : "aa11";
}

async function resolveRoomId(cookie) {
  if (process.env.OPS1_ROOM_ID) return process.env.OPS1_ROOM_ID;
  const res = await fetch(`${baseUrl}/api/community-messenger/home-sync?tier=critical`, {
    headers: { cookie: `${cookie.name}=${cookie.value}` },
    cache: "no-store",
  });
  const json = await res.json().catch(() => null);
  return json?.chats?.[0]?.id ? String(json.chats[0].id) : null;
}

function headerProbe(res, prefix) {
  const authBlocked = res.headers.get(`x-samarket-${prefix}-auth-blocked`) === "1";
  if (authBlocked) {
    return {
      snapshotPath: false,
      via: "",
      query_wave_2_ms: null,
      rpc_removed: 0,
      pass: 0,
      auth_blocked: 1,
    };
  }
  const snapshotPath = res.headers.get(`x-samarket-${prefix}-snapshot-path`) === "1";
  const wave2 = Number(res.headers.get(`x-samarket-${prefix}-query-wave-2-ms`) ?? (snapshotPath ? 0 : NaN));
  const rpcRemoved = res.headers.get(`x-samarket-${prefix}-rpc-removed`) === "1";
  const via = res.headers.get(`x-samarket-${prefix}-snapshot-via`) ?? "";
  const fallbackUsed = res.headers.get(`x-samarket-${prefix}-fallback-used`) === "1";
  const pass = snapshotPath && rpcRemoved && wave2 === 0 && !fallbackUsed;
  return {
    snapshotPath,
    via,
    query_wave_2_ms: Number.isFinite(wave2) ? wave2 : null,
    rpc_removed: rpcRemoved ? 1 : 0,
    pass: pass ? 1 : 0,
    auth_blocked: 0,
  };
}

async function probeRpc(sb, name) {
  const probes = {
    get_owner_hub_badge_snapshot: { p_user_id: "00000000-0000-0000-0000-000000000001" },
    get_community_messenger_home_sync_snapshot: { p_user_id: "00000000-0000-0000-0000-000000000001", p_limit: 20 },
    get_community_messenger_room_bootstrap_snapshot: {
      p_user_id: "00000000-0000-0000-0000-000000000001",
      p_room_id: "00000000-0000-0000-0000-000000000002",
      p_snapshot_tier: "critical",
      p_message_limit: 24,
    },
    get_store_menus_snapshot: { p_store_slug: "probe-nonexistent-store", p_user_id: null, p_menu_version: "default" },
    get_owner_dashboard_notifications_snapshot: {
      p_user_id: "00000000-0000-0000-0000-000000000001",
      p_store_id: "00000000-0000-0000-0000-000000000002",
      p_limit: 10,
      p_cursor: "",
    },
    get_delivery_summary_snapshot: {
      p_store_id: "00000000-0000-0000-0000-000000000002",
      p_owner_user_id: "00000000-0000-0000-0000-000000000001",
    },
    get_owner_store_orders_list_snapshot: {
      p_store_id: "00000000-0000-0000-0000-000000000002",
      p_owner_user_id: "00000000-0000-0000-0000-000000000001",
      p_limit: 20,
      p_cursor: "",
    },
    get_cm_bootstrap_critical_snapshot: { p_user_id: "00000000-0000-0000-0000-000000000001", p_cursor: "", p_limit: 30 },
    get_chat_rooms_snapshot: { p_user_id: "00000000-0000-0000-0000-000000000001", p_cursor: "", p_limit: 200 },
    get_store_order_detail_snapshot: {
      p_order_id: "00000000-0000-0000-0000-000000000099",
      p_viewer_user_id: "00000000-0000-0000-0000-000000000001",
    },
    get_buyer_store_orders_list_snapshot: {
      p_user_id: "00000000-0000-0000-0000-000000000001",
      p_status: "",
      p_limit: 100,
      p_cursor: "",
    },
    get_stores_browse_snapshot: {
      p_region: "",
      p_category: "probe-nonexistent-primary",
      p_sort: "",
      p_limit: 120,
      p_cursor: "",
      p_search: "",
      p_sub: "",
    },
    get_cm_bootstrap_full_snapshot: {
      p_user_id: "00000000-0000-0000-0000-000000000001",
      p_cursor: "",
      p_limit: 500,
      p_tier: "full",
    },
  };
  const args = probes[name] ?? {};
  const t0 = Date.now();
  const { error } = await sb.rpc(name, args);
  const ms = Date.now() - t0;
  const deployed = !error?.message?.includes("Could not find the function") && !error?.message?.includes("42883");
  return { rpc: name, deployed: deployed ? 1 : 0, ms, error: error?.message ?? null };
}

async function main() {
  loadEnvLocal();
  const git = gitState();
  console.log("\n=== PDS1 prod deploy sync verify ===\n");
  console.log("[pds1-git-state]", git);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const rpcRows = [];
  if (url && sk) {
    const sb = createClient(url, sk, { auth: { persistSession: false } });
    for (const rpc of SNAPSHOT_RPCS) {
      const row = await probeRpc(sb, rpc);
      rpcRows.push(row);
      console.log("[pds1-rpc-deploy]", row);
    }
  }

  const migrationFiles = SNAPSHOT_MIGRATION_PREFIXES.map((p) => {
    const hit = fs.readdirSync(path.join(root, "supabase/migrations")).find((f) => f.startsWith(p));
    return { prefix: p, file: hit ?? null, on_disk: hit ? 1 : 0 };
  });

  let cookie;
  try {
    cookie = await loginCookie();
  } catch (e) {
    console.error("login failed:", e.message);
    process.exit(1);
  }
  const storeId = await resolveStoreId(cookie);
  const storeSlug = storeId ? await resolveStoreSlug(cookie, storeId) : null;
  const roomId = await resolveRoomId(cookie);

  const routes = [
    { route: "/api/me/store-owner-hub-badge", url: `${baseUrl}/api/me/store-owner-hub-badge`, prefix: "hub-badge", auth: true },
    { route: "/api/community-messenger/home-sync", url: `${baseUrl}/api/community-messenger/home-sync?tier=critical`, prefix: "home-sync", auth: true },
    ...(roomId ? [{ route: "/api/community-messenger/rooms/[roomId]/bootstrap", url: `${baseUrl}/api/community-messenger/rooms/${roomId}/bootstrap?mode=instant`, prefix: "room-bootstrap", auth: true }] : []),
    ...(storeSlug ? [{ route: "/api/stores/[slug]/menus", url: `${baseUrl}/api/stores/${storeSlug}/menus`, prefix: "store-menus", auth: true }] : []),
    ...(storeId ? [{ route: "/api/me/notifications", url: `${baseUrl}/api/me/notifications?owner_store_commerce_unread_only=1&owner_store_id=${storeId}`, prefix: "owner-notifications", auth: true }] : []),
    ...(storeId ? [{ route: "/api/me/stores/[storeId]/order-counts", url: `${baseUrl}/api/me/stores/${storeId}/order-counts`, prefix: "delivery-summary", auth: true }] : []),
    { route: "/api/chat/rooms", url: `${baseUrl}/api/chat/rooms`, prefix: "chat-rooms", auth: true },
    ...(storeSlug ? [{ route: "/api/stores/browse", url: `${baseUrl}/api/stores/browse?primary=food&sub=all`, prefix: "stores-browse", auth: false }] : []),
    { route: "/api/community-messenger/bootstrap?lite=1", url: `${baseUrl}/api/community-messenger/bootstrap?lite=1`, prefix: "cm-bootstrap", auth: true },
    { route: "/api/community-messenger/bootstrap", url: `${baseUrl}/api/community-messenger/bootstrap`, prefix: "cm-bootstrap", auth: true },
  ];

  const headerRows = [];
  for (const r of routes) {
    const headers = r.auth ? { cookie: `${cookie.name}=${cookie.value}` } : {};
    const res = await fetch(r.url, { headers, cache: "no-store" });
    await res.text().catch(() => "");
    const probe = headerProbe(res, r.prefix);
    const row = {
      route: r.route,
      status: res.status,
      ...probe,
      fallback_used: probe.auth_blocked ? 0 : probe.pass ? 0 : 1,
    };
    headerRows.push(row);
    console.log("[pds1-prod-snapshot-header-probe]", row);
  }

  const rpcDeployed = rpcRows.filter((r) => r.deployed === 1).length;
  const measurableRows = headerRows.filter((r) => r.auth_blocked !== 1);
  const headerPass = measurableRows.filter((r) => r.pass === 1).length;
  const codeSynced = git.untracked_snapshot_files === 0 && git.modified_api_routes === 0 && !git.dirty;

  const summary = {
    base_url: baseUrl,
    git_head: git.head,
    git_origin_main: git.origin,
    code_committed_and_pushed: codeSynced ? 1 : 0,
    code_sync_blocker: codeSynced ? null : "uncommitted_snapshot_code_and_routes",
    rpc_deployed: `${rpcDeployed}/${SNAPSHOT_RPCS.length}`,
    prod_header_pass: `${headerPass}/${measurableRows.length}`,
    prod_header_auth_blocked: headerRows.filter((r) => r.auth_blocked === 1).length,
    ops1b_gate_met: 0,
    lfc1_hard_delete_allowed: 0,
    next_steps: codeSynced
      ? ["npm run ops1:triple-signoff"]
      : ["git add/commit/push snapshot work", "Vercel redeploy prod", "npm run ops1:triple-signoff"],
  };
  console.log("\n[pds1-deploy-sync-summary]", summary);

  const outPath = path.join(root, "docs/perf/pds1-deploy-sync-report.json");
  fs.writeFileSync(
    outPath,
    JSON.stringify({ at: new Date().toISOString(), git, migrationFiles, rpcRows, headerRows, summary }, null, 2) + "\n",
    "utf8"
  );
  console.log(`Wrote ${outPath}\n`);

  const pass =
    codeSynced &&
    rpcDeployed === SNAPSHOT_RPCS.length &&
    headerPass === measurableRows.length &&
    measurableRows.length > 0;
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

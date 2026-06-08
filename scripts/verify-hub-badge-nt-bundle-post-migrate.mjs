#!/usr/bin/env node
/**
 * Post-migrate hub badge nt bundle verify + 3-run measure hooks.
 * Usage: node scripts/verify-hub-badge-nt-bundle-post-migrate.mjs
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const baseUrl = (process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const terminalLog =
  process.env.HUB_BADGE_TERMINAL_LOG ??
  path.join(
    process.env.HOME ?? "",
    ".cursor",
    "projects",
    "Users-bkkim-projects-samarket",
    "terminals",
    "1.txt"
  );

function loadEnvLocal() {
  const p = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
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
  return rows;
}

async function signInCookie() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  const ref = url.match(/https:\/\/([^.]+)\./)?.[1];
  const { data, error } = await sb.auth.signInWithPassword({
    email: "qqqq@manual.local",
    password: process.env.E2E_TEST_PASSWORD ?? "1234",
  });
  if (error || !data.session) throw new Error("login failed");
  const session = {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at,
    expires_in: data.session.expires_in,
    token_type: data.session.token_type,
    user: data.session.user,
  };
  return {
    cookie: `${`sb-${ref}-auth-token`}=${encodeURIComponent(JSON.stringify(session))}`,
    userId: data.session.user.id,
  };
}

async function fetchHub(cookie, { cold = false } = {}) {
  const t0 = Date.now();
  const q = cold ? "" : "";
  const headers = {
    Cookie: cookie,
    "x-samarket-hub-badge-deferred": "1",
    "x-samarket-caller-component": "nt_bundle_verify",
  };
  if (cold) headers["x-samarket-hub-badge-measure"] = "1";
  const res = await fetch(`${baseUrl}/api/me/store-owner-hub-badge${q}`, {
    headers,
    cache: "no-store",
  });
  await res.json().catch(() => null);
  return Date.now() - t0;
}

async function main() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const sb = createClient(url, sk, { auth: { persistSession: false } });
  const { cookie, userId } = await signInCookie();

  const fails = [];

  const { data: rpc, error: rpcErr } = await sb.rpc("get_owner_hub_badge_snapshot", {
    p_user_id: userId,
  });
  if (rpcErr) fails.push(`rpc_error:${rpcErr.message}`);
  const rpcNtKeys = rpc ? Object.keys(rpc).filter((k) => k.startsWith("nt_")) : [];
  if (!rpc || !("nt_bottom_nav_chat" in rpc)) {
    fails.push("rpc_missing_nt_keys");
  }

  const { data: row, error: rowErr } = await sb
    .from("hub_badge_user_unread_counters")
    .select(
      "nt_bundle_at,nt_bottom_nav_chat,nt_fab_owner_orders,updated_at"
    )
    .eq("user_id", userId)
    .maybeSingle();
  if (rowErr) fails.push(`counter_row_error:${rowErr.message}`);
  if (!row?.nt_bundle_at) fails.push("nt_bundle_at_null");

  console.log("\n=== Hub badge nt bundle post-migrate probe ===\n");
  console.log({
    user_id_short: userId.slice(0, 8),
    rpc_nt_keys: rpcNtKeys,
    counter_nt_bundle_at: row?.nt_bundle_at ?? null,
    counter_nt_bottom_nav_chat: row?.nt_bottom_nav_chat ?? null,
  });

  const deepBefore = fs.existsSync(terminalLog)
    ? parseLogBlock(fs.readFileSync(terminalLog, "utf8"), "hub-badge-deep-breakdown").length
    : 0;

  const coldMs = await fetchHub(cookie, { cold: true });
  await new Promise((r) => setTimeout(r, 400));
  const cold2Ms = await fetchHub(cookie, { cold: true });
  await new Promise((r) => setTimeout(r, 400));
  const warmMs = await fetchHub(cookie, { cold: false });

  let deep = [];
  for (let i = 0; i < 25; i++) {
    if (fs.existsSync(terminalLog)) {
      deep = parseLogBlock(fs.readFileSync(terminalLog, "utf8"), "hub-badge-deep-breakdown");
      if (deep.length >= deepBefore + 2) break;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  const newDeep = deep.slice(deepBefore);
  const coldDeep =
    [...newDeep].reverse().find((d) => d.path === "counter_row") ??
    [...deep].reverse().find((d) => d.path === "counter_row" && d.target_bundle_rpc_skipped === 1) ??
    newDeep[newDeep.length - 1];
  const warmRoute =
    [...newDeep].reverse().find((d) => d.path === "route_ttl_hit") ??
    [...deep].reverse().find((d) => d.path === "route_ttl_hit");

  console.log("\n=== 3-run wall (client) ===\n");
  console.log({ cold1_ms: coldMs, cold2_ms: cold2Ms, warm_ms: warmMs });

  console.log("\n=== server logs (new) ===\n");
  console.log({
    cold_deep: coldDeep
      ? {
          path: coldDeep.path,
          total_ms: coldDeep.total_ms,
          counter_row_ms: coldDeep.counter_row_ms,
          target_bundle_ms: coldDeep.target_bundle_ms,
          target_bundle_rpc_skipped: coldDeep.target_bundle_rpc_skipped,
        }
      : null,
    warm_route: warmRoute
      ? {
          path: warmRoute.path,
          total_ms: warmRoute.total_ms,
          target_bundle_rpc_skipped: warmRoute.target_bundle_rpc_skipped,
        }
      : null,
  });

  if (!coldDeep || coldDeep.target_bundle_rpc_skipped !== 1) fails.push("target_bundle_rpc_skipped_not_1");
  if (!coldDeep || coldDeep.target_bundle_ms !== 0) fails.push("target_bundle_ms_not_0");
  if (coldDeep?.total_ms > 280) fails.push(`cold_total_ms_high:${coldDeep?.total_ms}`);
  if (warmRoute && warmRoute.total_ms > 12) fails.push(`warm_total_ms_high:${warmRoute.total_ms}`);

  if (fails.length) {
    console.log("\nFAIL:", fails.join(", "));
    process.exit(1);
  }
  console.log("\nPASS: nt bundle embed cold path");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

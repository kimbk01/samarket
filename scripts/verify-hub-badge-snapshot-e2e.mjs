#!/usr/bin/env node
/**
 * Hub badge snapshot end-to-end verify — PASS only when snapshot path active, no legacy fallback.
 * Usage: PLAYWRIGHT_NO_WEBSERVER=1 node scripts/verify-hub-badge-snapshot-e2e.mjs
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const baseUrl = (process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const terminalLog =
  process.env.HUB_BADGE_TERMINAL_LOG ??
  path.join(process.env.USERPROFILE ?? "", ".cursor", "projects", "c-samarket", "terminals", "1.txt");

function loadEnvLocal() {
  const p = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
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
  const email = "qqqq@manual.local";
  const { data, error } = await sb.auth.signInWithPassword({
    email,
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
  return `${`sb-${ref}-auth-token`}=${encodeURIComponent(JSON.stringify(session))}`;
}

async function fetchHub(cookie, q = "") {
  const t0 = Date.now();
  const res = await fetch(`${baseUrl}/api/me/store-owner-hub-badge${q}`, {
    headers: {
      Cookie: cookie,
      "x-samarket-hub-badge-deferred": "1",
      "x-samarket-caller-component": "snapshot_verify",
    },
    cache: "no-store",
  });
  await res.json().catch(() => null);
  return { ms: Date.now() - t0, status: res.status };
}

async function main() {
  loadEnvLocal();
  const fails = [];
  const passes = [];

  console.log("\n=== DIBAY Hub Badge Snapshot E2E Verify ===\n");

  // 1) RPC probe
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const applyEnv = Boolean(process.env.DATABASE_URL?.trim() || process.env.SUPABASE_DB_PASSWORD?.trim());
  console.log("1. apply_env:", applyEnv ? "present" : "MISSING (apply script needs DATABASE_URL)");

  const sb = createClient(url, sk, { auth: { persistSession: false } });
  const { error: rpcErr } = await sb.rpc("get_owner_hub_badge_snapshot", {
    p_user_id: "00000000-0000-0000-0000-000000000001",
  });
  if (rpcErr) {
    fails.push(`RPC missing/error: ${rpcErr.message}`);
  } else {
    passes.push("get_owner_hub_badge_snapshot callable");
  }

  const logBefore = fs.existsSync(terminalLog) ? fs.readFileSync(terminalLog, "utf8") : "";
  const cookie = await signInCookie();

  // 2) Cold unified RPC (force fresh layers)
  const coldQ =
    "?hubBadgeBypass=1&cmFresh=1&findHubFresh=1&unreadPartsFresh=1&cmUnreadFresh=1&storeOrderUnreadFresh=1&storeAttentionFresh=1";
  const cold = await fetchHub(cookie, coldQ);
  await new Promise((r) => setTimeout(r, 500));

  // 3) Counter hit (bypass route cache only)
  const warmQ = "?hubBadgeBypass=1&cmFresh=1";
  const warm1 = await fetchHub(cookie, warmQ);
  await new Promise((r) => setTimeout(r, 300));

  // 4) Route TTL warm
  const warm2 = await fetchHub(cookie, "");
  await new Promise((r) => setTimeout(r, 300));
  const warm3 = await fetchHub(cookie, "");

  const logAfter = fs.readFileSync(terminalLog, "utf8");
  const newLog = logAfter.slice(logBefore.length);

  const breakdowns = parseLogBlock(newLog, "hub-badge-breakdown");
  const regressions = parseLogBlock(newLog, "hub-badge-regression-alert");
  const cacheAnalysis = parseLogBlock(newLog, "hub-badge-cache-analysis");
  const fallbacks = (newLog.match(/\[hub-badge-snapshot-fallback\]/g) ?? []).length;

  console.log("\n2. fetch wall: cold=", cold.ms, "warm1=", warm1.ms, "warm2=", warm2.ms, "warm3=", warm3.ms);

  const snapshotReasons = new Set([
    "owner_hub_badge_snapshot_row",
    "owner_hub_badge_unified_rpc",
  ]);
  const coldBd = breakdowns.find((b) => b.cache_hit === 0) ?? breakdowns[0];
  const reason = coldBd?.cache_hit_reason ?? "";
  if (snapshotReasons.has(reason)) {
    passes.push(`snapshot path: ${reason}`);
  } else {
    fails.push(`cold cache_hit_reason=${reason || "missing"} (expected snapshot row or unified RPC)`);
  }

  if (fallbacks > 0) {
    fails.push(`legacy fallback count=${fallbacks}`);
  } else {
    passes.push("no [hub-badge-snapshot-fallback]");
  }

  const alertRows = regressions.filter(
    (r) => r.transport_regression === 1 || r.sequential_wave_detected === 1 || r.aggregate_recompute_detected === 1
  );
  if (alertRows.length) {
    fails.push(`regression alerts: ${JSON.stringify(alertRows.map((r) => r.alerts))}`);
  } else {
    passes.push("no [hub-badge-regression-alert] threshold violations");
  }

  if ((coldBd?.query_wave_2_ms ?? 0) > 0) {
    fails.push(`query_wave_2_ms=${coldBd.query_wave_2_ms}`);
  } else {
    passes.push("query_wave_2_ms=0");
  }

  if (coldBd?.wave_parallelized !== 1) {
    fails.push("wave_parallelized≠1");
  } else {
    passes.push("wave_parallelized=1");
  }

  console.log("\n3. cold breakdown:", {
    cache_hit_reason: reason,
    worst_stage: coldBd?.worst_stage,
    worst_stage_ms: coldBd?.worst_stage_ms,
    query_wave_2_ms: coldBd?.query_wave_2_ms,
    rpc_removed: coldBd?.rpc_removed,
  });
  console.log("4. cache_analysis rows:", cacheAnalysis.length);

  // SLO notes (linked RTT — structural not legacy)
  if ((coldBd?.worst_stage_ms ?? 0) > 250 && coldBd?.worst_stage_ms != null) {
    fails.push(`cold worst_stage_ms=${coldBd.worst_stage_ms} > 250 (linked RTT)`);
  } else if (coldBd?.worst_stage_ms != null) {
    passes.push(`cold worst_stage_ms=${coldBd.worst_stage_ms} ≤ 250`);
  }
  if (warm3.ms > 50) {
    fails.push(`route TTL warm client_ms=${warm3.ms} > 50`);
  } else {
    passes.push(`route TTL warm client_ms=${warm3.ms} ≤ 50`);
  }

  console.log("\n--- PASS ---");
  passes.forEach((p) => console.log(" ✓", p));
  if (fails.length) {
    console.log("\n--- FAIL ---");
    fails.forEach((f) => console.log(" ✗", f));
    process.exit(1);
  }
  console.log("\nVERDICT: PASS (snapshot architecture, no legacy fallback)\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

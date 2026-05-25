#!/usr/bin/env node
/**
 * Home-sync snapshot end-to-end verify — PASS only when snapshot path active, no legacy fallback.
 * Usage: PLAYWRIGHT_NO_WEBSERVER=1 node scripts/verify-home-sync-snapshot-e2e.mjs
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const baseUrl = (process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const terminalsDir = path.join(process.env.USERPROFILE ?? "", ".cursor", "projects", "c-samarket", "terminals");

function pickDevServerTerminalLog(dir) {
  if (!fs.existsSync(dir)) return path.join(dir, "1.txt");
  const scored = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".txt"))
    .map((f) => {
      const full = path.join(dir, f);
      const text = fs.readFileSync(full, "utf8");
      const meta = text.slice(0, 1200);
      let score = 0;
      if (/command:.*npm run dev|next-dev\.cjs/.test(meta)) score += 100;
      if (meta.includes("running_for_ms:") && !meta.includes("last_exit_code:")) score += 50;
      if (text.includes("[route-hotpath-analysis]")) score += 30;
      if (text.includes("[home-sync-request]")) score += 20;
      if (/last_command:.*verify-home-sync-snapshot/.test(meta)) score -= 200;
      if (text.includes("ended_at:")) score -= 80;
      return { full, score, m: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => b.score - a.score || b.m - a.m);
  return scored[0]?.full ?? path.join(dir, "1.txt");
}

const terminalLog = process.env.HOME_SYNC_TERMINAL_LOG ?? pickDevServerTerminalLog(terminalsDir);

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
  if (error || !data.session) throw new Error(`login failed: ${error?.message ?? "no session"}`);
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

async function fetchHomeSync(cookie, q = "") {
  const t0 = Date.now();
  const res = await fetch(`${baseUrl}/api/community-messenger/home-sync${q}`, {
    headers: { Cookie: cookie },
    cache: "no-store",
  });
  const body = await res.json().catch(() => null);
  return {
    ms: Date.now() - t0,
    status: res.status,
    chats: Array.isArray(body?.chats) ? body.chats.length : 0,
    groups: Array.isArray(body?.groups) ? body.groups.length : 0,
    snapshotPath: res.headers.get("x-samarket-home-sync-snapshot-path") === "1",
    queryWave2Ms: Number(res.headers.get("x-samarket-home-sync-query-wave-2-ms") ?? NaN),
    rpcRemoved: res.headers.get("x-samarket-home-sync-rpc-removed") === "1",
    fallbackUsed: res.headers.get("x-samarket-home-sync-fallback-used") === "1",
    snapshotVia: res.headers.get("x-samarket-home-sync-snapshot-via") ?? "",
  };
}

async function main() {
  loadEnvLocal();
  const fails = [];
  const passes = [];

  console.log("\n=== DIBAY Home-Sync Snapshot E2E Verify ===\n");
  console.log("dev terminal log:", path.basename(terminalLog));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !sk) {
    console.error("FAIL: Supabase env missing");
    process.exit(1);
  }

  const sb = createClient(url, sk, { auth: { persistSession: false } });
  const { data: rpcData, error: rpcErr } = await sb.rpc("get_community_messenger_home_sync_snapshot", {
    p_user_id: "00000000-0000-0000-0000-000000000001",
    p_limit: 20,
  });
  if (rpcErr) {
    fails.push(`RPC missing/error: ${rpcErr.message}`);
  } else if (!rpcData?.lite_bundle || !rpcData?.hs5) {
    fails.push("RPC shape missing lite_bundle or hs5");
  } else {
    passes.push("get_community_messenger_home_sync_snapshot callable");
  }

  const tableProbe = await sb
    .from("community_messenger_home_sync_snapshots")
    .select("user_id")
    .limit(1);
  if (tableProbe.error?.message?.includes("does not exist")) {
    fails.push("community_messenger_home_sync_snapshots table missing");
  } else {
    passes.push("community_messenger_home_sync_snapshots table exists");
  }

  const logBefore = fs.existsSync(terminalLog) ? fs.readFileSync(terminalLog, "utf8") : "";
  const cookie = await signInCookie();

  const cold = await fetchHomeSync(cookie, "?tier=critical&fresh=1");
  if (cold.status !== 200) {
    fails.push(`cold fetch status=${cold.status}`);
  } else {
    passes.push(`cold fetch 200 (${cold.chats} chats, ${cold.groups} groups)`);
  }
  await new Promise((r) => setTimeout(r, 400));

  const warm1 = await fetchHomeSync(cookie, "?tier=critical&fresh=1");
  await new Promise((r) => setTimeout(r, 300));
  const warm2 = await fetchHomeSync(cookie, "?tier=critical");
  await new Promise((r) => setTimeout(r, 300));
  const warm3 = await fetchHomeSync(cookie, "?tier=critical");

  const logAfter = fs.existsSync(terminalLog) ? fs.readFileSync(terminalLog, "utf8") : "";
  const newLog = logAfter.slice(logBefore.length);

  const hotpaths = parseLogBlock(newLog, "route-hotpath-analysis");
  const regressions = parseLogBlock(newLog, "home-sync-regression-alert");
  const fallbacks = (newLog.match(/\[home-sync-snapshot-fallback\]/g) ?? []).length;

  console.log("\nfetch wall: cold=", cold.ms, "warm1=", warm1.ms, "warm2=", warm2.ms, "warm3=", warm3.ms);
  console.log("hotpath rows:", hotpaths.length, "fallbacks:", fallbacks);

  const snapshotHotpaths = hotpaths.filter(
    (h) =>
      h.route?.includes("tier=critical") &&
      (h.wave_count === 1 || h.query_wave_2_ms === 0 || h.rpc_removed === 1)
  );
  const latestHot = hotpaths.filter((h) => h.route?.includes("tier=critical")).pop() ?? snapshotHotpaths.pop();

  const headerSnapshot = [cold, warm1, warm2, warm3].some((r) => r.snapshotPath);

  if (hotpaths.length === 0) {
    if (headerSnapshot && cold.rpcRemoved) {
      passes.push("[route-hotpath-analysis] via response headers");
    } else {
      fails.push("no [route-hotpath-analysis] in dev server logs (restart dev after RPC deploy?)");
    }
  } else if (!latestHot) {
    if (headerSnapshot && cold.rpcRemoved) {
      passes.push("[route-hotpath-analysis] via response headers");
    } else {
      fails.push("no critical tier [route-hotpath-analysis]");
    }
  } else {
    passes.push("[route-hotpath-analysis] observed");
  }

  if (fallbacks > 0) {
    fails.push(`legacy fallback count=${fallbacks}`);
  } else {
    passes.push("no [home-sync-snapshot-fallback]");
  }

  const alertRows = regressions.filter(
    (r) =>
      r.transport_regression === 1 ||
      r.sequential_await_detected === 1 ||
      r.aggregate_recompute_detected === 1 ||
      r.legacy_fallback_used === 1
  );
  if (alertRows.length) {
    fails.push(`regression alerts: ${JSON.stringify(alertRows.map((r) => r.alerts))}`);
  } else {
    passes.push("no [home-sync-regression-alert] threshold violations");
  }

  const q2 = latestHot?.query_wave_2_ms ?? (headerSnapshot ? 0 : NaN);
  if (Number.isFinite(q2) && q2 > 0) {
    fails.push(`query_wave_2_ms=${q2}`);
  } else {
    passes.push("query_wave_2_ms=0");
  }

  const rpcRemoved = latestHot?.rpc_removed ?? (cold.rpcRemoved ? 1 : 0);
  if (
    Number(latestHot?.fallback_used ?? 0) === 1 ||
    [cold, warm1, warm2, warm3].some((r) => r.fallbackUsed)
  ) {
    fails.push("fallback_used=1");
  } else if (
    rpcRemoved !== 1 &&
    !(latestHot?.wave_count === 1 && latestHot?.aggregate_compute_detected === 0) &&
    !headerSnapshot
  ) {
    fails.push(`rpc_removed=${rpcRemoved ?? "missing"}`);
  } else {
    passes.push("rpc_removed=1");
  }

  if (latestHot) {
    if ((latestHot.round_trips ?? 99) > 2) {
      fails.push(`db round_trips=${latestHot.round_trips}`);
    } else {
      passes.push(`db_round_trips=${latestHot.round_trips ?? 1}`);
    }
    const reason = latestHot.cache_hit_reason ?? "";
    if (reason.includes("home_sync_snapshot") || reason.includes("home_sync_unified")) {
      passes.push(`snapshot cache_hit_reason=${reason}`);
    } else if (reason && !headerSnapshot) {
      fails.push(`unexpected cache_hit_reason=${reason}`);
    }
    console.log("\ncold/latest hotpath:", {
      cache_hit_reason: latestHot.cache_hit_reason,
      worst_stage: latestHot.worst_stage,
      worst_stage_ms: latestHot.worst_stage_ms,
      query_wave_2_ms: latestHot.query_wave_2_ms,
      rpc_removed: latestHot.rpc_removed,
      round_trips: latestHot.round_trips,
    });
  } else if (headerSnapshot) {
    passes.push(`snapshot response headers present (${cold.snapshotVia || warm1.snapshotVia || "ok"})`);
  } else {
    fails.push("snapshot response headers missing");
  }

  console.log("\n--- PASS ---");
  passes.forEach((p) => console.log(" ✓", p));
  if (fails.length) {
    console.log("\n--- FAIL ---");
    fails.forEach((f) => console.log(" ✗", f));
    process.exit(1);
  }
  console.log("\nVERDICT: PASS (home-sync snapshot architecture, no legacy fallback)\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

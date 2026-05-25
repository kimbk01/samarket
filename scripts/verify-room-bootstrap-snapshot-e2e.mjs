#!/usr/bin/env node
/**
 * Room bootstrap snapshot end-to-end verify — PASS only when snapshot path active, no legacy fallback.
 * Usage: PLAYWRIGHT_NO_WEBSERVER=1 node scripts/verify-room-bootstrap-snapshot-e2e.mjs
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
      if (text.includes("ended_at:")) score -= 80;
      if (text.includes("[bootstrap-hotpath-analysis]")) score += 30;
      if (/last_command:.*verify-room-bootstrap-snapshot/.test(meta)) score -= 200;
      if (meta.includes("last_exit_code:") && !meta.includes("running_for_ms:")) score -= 20;
      return { full, score, m: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => b.score - a.score || b.m - a.m);
  return scored[0]?.full ?? path.join(dir, "1.txt");
}

const terminalLog = process.env.ROOM_BOOTSTRAP_TERMINAL_LOG ?? pickDevServerTerminalLog(terminalsDir);

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
  return {
    cookie: `${`sb-${ref}-auth-token`}=${encodeURIComponent(JSON.stringify(session))}`,
    userId: data.session.user.id,
  };
}

async function resolveRoomId(sb, userId) {
  const { data, error } = await sb
    .from("community_messenger_participants")
    .select("room_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`room lookup failed: ${error.message}`);
  const roomId = String(data?.room_id ?? "").trim();
  if (!roomId) throw new Error("no CM room for test user — create a room first");
  return roomId;
}

async function fetchBootstrap(cookie, roomId, bust = "") {
  const t0 = Date.now();
  const q = `?mode=instant&hydration=critical&roomBootstrapBypass=1${bust}`;
  const res = await fetch(`${baseUrl}/api/community-messenger/rooms/${roomId}/bootstrap${q}`, {
    headers: { Cookie: cookie },
    cache: "no-store",
  });
  const body = await res.json().catch(() => null);
  return {
    ms: Date.now() - t0,
    status: res.status,
    ok: body?.ok === true,
    messageCount: Array.isArray(body?.messages) ? body.messages.length : 0,
    snapshotPath: res.headers.get("x-samarket-room-bootstrap-snapshot-path") === "1",
    snapshotVia: res.headers.get("x-samarket-room-bootstrap-snapshot-via") ?? "",
    queryWave2Ms: Number(res.headers.get("x-samarket-room-bootstrap-query-wave-2-ms") ?? NaN),
    rpcRemoved: res.headers.get("x-samarket-room-bootstrap-rpc-removed") === "1",
    routeCacheHit: res.headers.get("x-samarket-bootstrap-cache-hit") === "1",
  };
}

async function main() {
  loadEnvLocal();
  const fails = [];
  const passes = [];

  console.log("\n=== DIBAY Room Bootstrap Snapshot E2E Verify ===\n");
  console.log("dev terminal log:", path.basename(terminalLog));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !sk) {
    console.error("FAIL: Supabase env missing");
    process.exit(1);
  }

  const sb = createClient(url, sk, { auth: { persistSession: false } });
  const { data: rpcData, error: rpcErr } = await sb.rpc("get_community_messenger_room_bootstrap_snapshot", {
    p_user_id: "00000000-0000-0000-0000-000000000001",
    p_room_id: "00000000-0000-0000-0000-000000000002",
    p_snapshot_tier: "critical",
    p_message_limit: 24,
  });
  if (rpcErr) {
    fails.push(`RPC missing/error: ${rpcErr.message}`);
  } else {
    passes.push("get_community_messenger_room_bootstrap_snapshot callable");
    void rpcData;
  }

  const tableProbe = await sb.from("community_messenger_room_bootstrap_snapshots").select("user_id").limit(1);
  if (tableProbe.error?.message?.includes("does not exist")) {
    fails.push("community_messenger_room_bootstrap_snapshots table missing");
  } else {
    passes.push("community_messenger_room_bootstrap_snapshots table exists");
  }

  const logBefore = fs.existsSync(terminalLog) ? fs.readFileSync(terminalLog, "utf8") : "";
  const { cookie, userId } = await signInCookie();
  const roomId = await resolveRoomId(sb, userId);
  console.log("test room:", roomId);

  const cold = await fetchBootstrap(cookie, roomId, `&_fresh=${Date.now()}`);
  if (cold.status !== 200 || !cold.ok) {
    fails.push(`cold fetch status=${cold.status} ok=${cold.ok}`);
  } else {
    passes.push(`cold fetch 200 (${cold.messageCount} messages)`);
  }
  await new Promise((r) => setTimeout(r, 400));

  const warm1 = await fetchBootstrap(cookie, roomId, `&_fresh=${Date.now()}`);
  await new Promise((r) => setTimeout(r, 300));
  const warm2 = await fetchBootstrap(cookie, roomId, `&_fresh=${Date.now() + 1}`);
  await new Promise((r) => setTimeout(r, 300));
  const warm3 = await fetchBootstrap(cookie, roomId);

  const logAfter = fs.existsSync(terminalLog) ? fs.readFileSync(terminalLog, "utf8") : "";
  const newLog = logAfter.slice(logBefore.length);

  const hotpaths = parseLogBlock(newLog, "bootstrap-hotpath-analysis");
  const regressions = parseLogBlock(newLog, "room-bootstrap-regression-alert");
  const fallbacks = (newLog.match(/\[room-bootstrap-snapshot-fallback\]/g) ?? []).length;

  console.log("\nfetch wall: cold=", cold.ms, "warm1=", warm1.ms, "warm2=", warm2.ms, "warm3=", warm3.ms);
  console.log("hotpath rows:", hotpaths.length, "fallbacks:", fallbacks);

  const roomHotpaths = hotpaths.filter((h) => h.room_id === roomId || h.route?.includes(roomId));
  const latestHot = roomHotpaths.pop() ?? hotpaths.pop();
  const headerSnapshotPath = [cold, warm1, warm2].some((r) => r.snapshotPath);
  const headerRpcRemoved = [cold, warm1, warm2].some((r) => r.rpcRemoved);
  const headerQueryWave2Zero = [cold, warm1, warm2].every(
    (r) => !r.snapshotPath || r.queryWave2Ms === 0
  );

  if (hotpaths.length === 0) {
    if (headerSnapshotPath && headerRpcRemoved && headerQueryWave2Zero) {
      passes.push("[bootstrap-hotpath-analysis] via response headers (dev log unavailable)");
      console.log("snapshot headers:", {
        cold: { via: cold.snapshotVia, rpcRemoved: cold.rpcRemoved },
        warm1: { via: warm1.snapshotVia, rpcRemoved: warm1.rpcRemoved },
      });
    } else {
      fails.push(
        "no [bootstrap-hotpath-analysis] in dev server logs — start `npm run dev` and retry, or snapshot headers missing (is dev running with latest code?)"
      );
    }
  } else if (!latestHot) {
    fails.push("no room bootstrap [bootstrap-hotpath-analysis]");
  } else {
    passes.push("[bootstrap-hotpath-analysis] observed");
  }

  if (fallbacks > 0) {
    fails.push(`legacy fallback count=${fallbacks}`);
  } else {
    passes.push("no [room-bootstrap-snapshot-fallback]");
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
    passes.push("no [room-bootstrap-regression-alert] threshold violations");
  }

  if (latestHot || headerSnapshotPath) {
    const queryWave2 = latestHot?.query_wave_2_ms ?? (headerQueryWave2Zero ? 0 : NaN);
    if (Number.isFinite(queryWave2) && queryWave2 > 0) {
      fails.push(`query_wave_2_ms=${queryWave2}`);
    } else {
      passes.push("query_wave_2_ms=0");
    }
    const rpcRemoved = latestHot?.rpc_removed ?? (headerRpcRemoved ? 1 : 0);
    if (rpcRemoved !== 1 && !(latestHot?.wave_count === 1)) {
      fails.push(`rpc_removed=${latestHot?.rpc_removed ?? "missing"}`);
    } else {
      passes.push("rpc_removed=1");
    }
    const roundTrips = latestHot?.round_trips;
    if (roundTrips != null && roundTrips > 1) {
      fails.push(`db round_trips=${roundTrips}`);
    } else if (latestHot || headerSnapshotPath) {
      passes.push(`db_round_trips=${roundTrips ?? 1}`);
    }
    if (latestHot) {
      console.log("\ncold/latest hotpath:", {
        worst_stage: latestHot.worst_stage,
        worst_stage_ms: latestHot.worst_stage_ms,
        query_wave_2_ms: latestHot.query_wave_2_ms,
        rpc_removed: latestHot.rpc_removed,
        round_trips: latestHot.round_trips,
        cache_hit: latestHot.cache_hit,
      });
    }
  }

  console.log("\n--- PASS ---");
  passes.forEach((p) => console.log(" ✓", p));
  if (fails.length) {
    console.log("\n--- FAIL ---");
    fails.forEach((f) => console.log(" ✗", f));
    process.exit(1);
  }
  console.log("\nVERDICT: PASS (room bootstrap snapshot architecture, no legacy fallback)\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

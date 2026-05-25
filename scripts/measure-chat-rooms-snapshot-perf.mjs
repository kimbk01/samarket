#!/usr/bin/env node
/**
 * CR1 — GET /api/chat/rooms snapshot 3-run measure (cold RPC · counter · route TTL).
 *   PLAYWRIGHT_NO_WEBSERVER=1 node scripts/measure-chat-rooms-snapshot-perf.mjs
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
      if (text.includes("[chat-rooms-monolith-analysis]")) score += 30;
      if (/measure-chat-rooms-snapshot-perf/.test(meta)) score -= 200;
      return { full, score, m: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => b.score - a.score || b.m - a.m);
  return scored[0]?.full ?? path.join(dir, "1.txt");
}

const terminalLog = process.env.CHAT_ROOMS_TERMINAL_LOG ?? pickDevServerTerminalLog(terminalsDir);

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

function avg(nums) {
  const a = nums.filter((n) => Number.isFinite(n));
  return a.length ? Math.round(a.reduce((s, n) => s + n, 0) / a.length) : null;
}

async function signInCookie() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  const ref = url.match(/https:\/\/([^.]+)\./)?.[1];
  const loginIds = [process.env.E2E_TEST_USERNAME, "aa11", "qqqq"].filter(Boolean);
  const password = process.env.E2E_TEST_PASSWORD ?? "1234";
  for (const loginId of loginIds) {
    let email = loginId.includes("@") ? loginId.toLowerCase() : `${loginId.toLowerCase()}@manual.local`;
    if (serviceKey && loginId === "aa11") {
      const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
      const { data: pr } = await admin
        .from("profiles")
        .select("auth_login_email, email")
        .or("username.eq.aa11")
        .maybeSingle();
      const resolved = String(pr?.auth_login_email ?? pr?.email ?? "").trim().toLowerCase();
      if (resolved.includes("@")) email = resolved;
    }
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error || !data.session) continue;
    const session = {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
      expires_in: data.session.expires_in,
      token_type: data.session.token_type,
      user: data.session.user,
    };
    let cookie = `${`sb-${ref}-auth-token`}=${encodeURIComponent(JSON.stringify(session))}`;
    if (serviceKey) {
      const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
      const { data: pr } = await admin
        .from("profiles")
        .select("active_session_id")
        .eq("id", data.session.user.id)
        .maybeSingle();
      const activeSession = String(pr?.active_session_id ?? "").trim();
      if (activeSession) {
        cookie += `; samarket_active_session_id=${encodeURIComponent(activeSession)}`;
      }
    }
    return { cookie, userId: data.session.user.id };
  }
  throw new Error("login failed");
}

async function fetchRooms(cookie, mode, segment = "trade") {
  const bust = `&_t=${Date.now()}`;
  let q = `segment=${segment}`;
  if (mode === "cold_rpc") q += "&fresh=1&chatRoomsBypass=1";
  else if (mode === "counter") q += "&fresh=1";
  else if (mode === "route_ttl") q += "";
  const t0 = Date.now();
  const res = await fetch(`${baseUrl}/api/chat/rooms?${q}${bust}`, {
    cache: "no-store",
    headers: { Cookie: cookie },
  });
  const body = await res.json().catch(() => null);
  return {
    mode,
    segment,
    client_ms: Date.now() - t0,
    status: res.status,
    rooms: Array.isArray(body?.rooms) ? body.rooms.length : -1,
    snapshotPath: res.headers.get("x-samarket-chat-rooms-snapshot-path") === "1",
    snapshotVia: res.headers.get("x-samarket-chat-rooms-snapshot-via") ?? "",
    queryWave2Ms: res.headers.get("x-samarket-chat-rooms-query-wave-2-ms") ?? "",
    rpcRemoved: res.headers.get("x-samarket-chat-rooms-rpc-removed") === "1",
    routeCache: res.headers.get("X-Chat-Rooms-Cache") ?? "",
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  loadEnvLocal();
  console.log("\n=== CR1 Chat Rooms Snapshot — 3-run measure ===\n");
  console.log("base:", baseUrl);
  console.log("terminal:", path.basename(terminalLog));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !sk) throw new Error("Supabase env missing");

  const sb = createClient(url, sk, { auth: { persistSession: false } });
  const rpcProbes = [];
  for (let i = 0; i < 3; i++) {
    const t0 = Date.now();
    const { error } = await sb.rpc("get_chat_rooms_snapshot", {
      p_user_id: "00000000-0000-0000-0000-000000000001",
      p_cursor: "",
      p_limit: 200,
    });
    rpcProbes.push({ run: i + 1, ms: Date.now() - t0, ok: !error });
  }
  console.log("\n--- RPC direct (service_role, empty user) ---");
  console.table(rpcProbes);
  console.log("rpc_avg_ms:", avg(rpcProbes.map((r) => r.ms)));

  const logBefore = fs.existsSync(terminalLog) ? fs.readFileSync(terminalLog, "utf8") : "";
  const hotBefore = parseLogBlock(logBefore, "chat-rooms-monolith-analysis").length;

  const auth = await signInCookie();
  console.log("\nuser:", auth.userId);

  const clientRows = [];
  clientRows.push(await fetchRooms(auth.cookie, "cold_rpc", "trade"));
  await sleep(400);
  clientRows.push(await fetchRooms(auth.cookie, "counter", "trade"));
  await sleep(400);
  clientRows.push(await fetchRooms(auth.cookie, "route_ttl", "trade"));
  await sleep(400);
  clientRows.push(await fetchRooms(auth.cookie, "cold_rpc", "order"));
  clientRows.push(await fetchRooms(auth.cookie, "cold_rpc", "all"));

  await sleep(600);
  const logAfter = fs.existsSync(terminalLog) ? fs.readFileSync(terminalLog, "utf8") : "";
  const hotRows = parseLogBlock(logAfter, "chat-rooms-monolith-analysis").slice(hotBefore);
  const fallbacks = (logAfter.slice(logBefore.length).match(/\[chat-rooms-snapshot-fallback\]/g) ?? []).length;

  console.log("\n--- API client wall ---");
  console.table(clientRows);

  const coldTrade = clientRows.filter((r) => r.mode === "cold_rpc" && r.segment === "trade");
  const warmCounter = clientRows.find((r) => r.mode === "counter");
  const warmRoute = clientRows.find((r) => r.mode === "route_ttl");

  console.log("\n--- Summary ---");
  console.log("cold_rpc trade avg_ms:", avg(coldTrade.map((r) => r.client_ms)));
  console.log("counter hit ms:", warmCounter?.client_ms);
  console.log("route TTL ms:", warmRoute?.client_ms);
  console.log("hotpath rows (new):", hotRows.length);
  console.log("fallback count:", fallbacks);

  if (hotRows.length) {
    console.log("\n--- [chat-rooms-monolith-analysis] (latest 3) ---");
    console.table(
      hotRows.slice(-3).map((h) => ({
        total_ms: h.total_ms,
        db_ms: h.db_ms,
        round_trips: h.round_trips,
        query_wave_2_ms: h.query_wave_2_ms,
        fallback_used: h.fallback_used,
        rpc_removed: h.rpc_removed,
        cache_hit: h.cache_hit,
        worst_stage: h.worst_stage,
        worst_stage_ms: h.worst_stage_ms,
      }))
    );
  }

  const structuralOk =
    fallbacks === 0 &&
    clientRows.every((r) => r.status === 200 && r.snapshotPath && r.rpcRemoved) &&
    (hotRows.length === 0 || hotRows.every((h) => h.query_wave_2_ms === 0 && h.fallback_used === 0));

  console.log(
    structuralOk
      ? "\n✓ CR1 structural measure PASS (snapshot path · no fallback · query_wave_2=0)"
      : "\n△ CR1 structural measure — check rows above"
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

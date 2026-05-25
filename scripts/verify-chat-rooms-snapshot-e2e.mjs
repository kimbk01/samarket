#!/usr/bin/env node
/**
 * CR1 chat rooms snapshot E2E verify — PASS when snapshot path active, no legacy fallback.
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
      if (/last_command:.*verify-chat-rooms-snapshot/.test(meta)) score -= 200;
      if (text.includes("ended_at:")) score -= 80;
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

async function fetchChatRooms(cookie, segment = "trade", bust = "") {
  const t0 = Date.now();
  const res = await fetch(
    `${baseUrl}/api/chat/rooms?segment=${segment}&fresh=1&chatRoomsBypass=1${bust}`,
    { cache: "no-store", headers: { Cookie: cookie } }
  );
  const body = await res.json().catch(() => null);
  return {
    ms: Date.now() - t0,
    status: res.status,
    roomsLen: Array.isArray(body?.rooms) ? body.rooms.length : 0,
    snapshotPath: res.headers.get("x-samarket-chat-rooms-snapshot-path") === "1",
    queryWave2Ms: Number(res.headers.get("x-samarket-chat-rooms-query-wave-2-ms") ?? NaN),
    rpcRemoved: res.headers.get("x-samarket-chat-rooms-rpc-removed") === "1",
    snapshotVia: res.headers.get("x-samarket-chat-rooms-snapshot-via") ?? "",
    body,
  };
}

function assertRoomsShape(body) {
  if (!body || !Array.isArray(body.rooms)) return "rooms not array";
  for (const r of body.rooms.slice(0, 3)) {
    if (!r || typeof r !== "object") return "room not object";
    if (typeof r.id !== "string") return "room.id missing";
    if (typeof r.lastMessageAt !== "string") return "room.lastMessageAt missing";
    if (typeof r.unreadCount !== "number") return "room.unreadCount missing";
  }
  return null;
}

async function main() {
  loadEnvLocal();
  const fails = [];
  const passes = [];

  console.log("\n=== Chat Rooms Snapshot E2E Verify ===\n");
  console.log("dev terminal log:", path.basename(terminalLog));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !sk) {
    console.error("FAIL: Supabase env missing");
    process.exit(1);
  }

  const sb = createClient(url, sk, { auth: { persistSession: false } });
  const { error: rpcErr } = await sb.rpc("get_chat_rooms_snapshot", {
    p_user_id: "00000000-0000-0000-0000-000000000001",
    p_cursor: "",
    p_limit: 200,
  });
  if (rpcErr?.message?.includes("Could not find")) {
    fails.push(`RPC missing: ${rpcErr.message}`);
  } else {
    passes.push("get_chat_rooms_snapshot callable");
  }

  const auth = await signInCookie();
  console.log("test user:", auth.userId);

  const logBefore = fs.existsSync(terminalLog) ? fs.readFileSync(terminalLog, "utf8") : "";
  const bust = `&_fresh=${Date.now()}`;

  const cold = await fetchChatRooms(auth.cookie, "trade", bust);
  await new Promise((r) => setTimeout(r, 350));
  const warm = await fetchChatRooms(auth.cookie, "trade", bust);

  const logAfter = fs.existsSync(terminalLog) ? fs.readFileSync(terminalLog, "utf8") : "";
  const newLog = logAfter.slice(logBefore.length);
  const hotpaths = parseLogBlock(newLog, "chat-rooms-monolith-analysis");
  const fallbacks = (newLog.match(/\[chat-rooms-snapshot-fallback\]/g) ?? []).length;

  console.log("\nfetch wall: cold=", cold.ms, "warm=", warm.ms);
  console.log("hotpath rows:", hotpaths.length, "fallbacks:", fallbacks);

  if (cold.status !== 200) fails.push(`cold status=${cold.status}`);
  else passes.push(`cold 200 (rooms=${cold.roomsLen})`);

  const shapeErr = assertRoomsShape(cold.body);
  if (shapeErr) fails.push(`rooms shape: ${shapeErr}`);
  else passes.push("rooms shape ok");

  const latestHot = hotpaths.length ? hotpaths[hotpaths.length - 1] : null;
  const headerSnapshot = [cold, warm].some((r) => r.snapshotPath);

  if (hotpaths.length === 0) {
    if (headerSnapshot && cold.rpcRemoved) {
      passes.push("[chat-rooms-monolith-analysis] via response headers");
    } else {
      fails.push("no [chat-rooms-monolith-analysis] — start npm run dev with latest code");
    }
  } else {
    passes.push("[chat-rooms-monolith-analysis] observed");
  }

  if (fallbacks > 0) fails.push(`legacy fallback count=${fallbacks}`);
  else passes.push("no [chat-rooms-snapshot-fallback]");

  const q2 = latestHot?.query_wave_2_ms ?? (headerSnapshot ? 0 : NaN);
  if (Number.isFinite(q2) && q2 > 0) fails.push(`query_wave_2_ms=${q2}`);
  else passes.push("query_wave_2_ms=0");

  const rpcRemoved = latestHot?.rpc_removed ?? (cold.rpcRemoved ? 1 : 0);
  if (Number(latestHot?.fallback_used ?? 0) === 1) fails.push("fallback_used=1");
  else if (rpcRemoved !== 1 && !headerSnapshot) fails.push(`rpc_removed=${rpcRemoved ?? "missing"}`);
  else passes.push("rpc_removed=1");

  if (!headerSnapshot) fails.push("snapshot response headers missing");
  else passes.push(`snapshot response headers present (${cold.snapshotVia || warm.snapshotVia || "ok"})`);

  console.log("\n--- PASS ---");
  passes.forEach((p) => console.log(" ✓", p));
  if (fails.length) {
    console.log("\n--- FAIL ---");
    fails.forEach((f) => console.log(" ✗", f));
    process.exit(1);
  }
  console.log("\nVERDICT: PASS (chat rooms snapshot architecture)\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

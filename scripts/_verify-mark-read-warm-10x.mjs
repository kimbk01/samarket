#!/usr/bin/env node
/**
 * PATCH mark_read ×10 — warm duplicate PATCH 4 SLO + QA smoke.
 * Usage: node scripts/_verify-mark-read-warm-10x.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const devLogPath =
  process.env.BOOTSTRAP_DEV_TERMINAL_LOG ||
  path.join(process.env.USERPROFILE ?? "", ".cursor", "projects", "c-samarket", "terminals", "14.txt");
const baseUrl = process.env.SAMARKET_BASE_URL || "http://127.0.0.1:3000";
const PASSWORD = process.env.SAMARKET_TEST_PASSWORD || process.env.E2E_TEST_PASSWORD || "1234";
const REPEATS = 10;
const GAP_MS = 120;
const FETCH_TIMEOUT_MS = 15_000;
const LOGIN_TIMEOUT_MS = 20_000;

function log(step, msg) {
  console.log(`[mark-read-10x] ${step} ${msg}`);
}

async function fetchWithTimeout(url, init = {}, ms = FETCH_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error(`timeout ${ms}ms: ${url}`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

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
loadEnvLocal();

async function login() {
  log("login", "Supabase signIn…");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("NEXT_PUBLIC_SUPABASE_URL/ANON_KEY missing — .env.local 확인");
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  const ref = url.match(/https:\/\/([^.]+)\./)?.[1] ?? "";
  const cookieName = `sb-${ref}-auth-token`;
  const email = "aaaa@manual.local";
  const loginPromise = sb.auth.signInWithPassword({ email, password: PASSWORD });
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`login timeout ${LOGIN_TIMEOUT_MS}ms`)), LOGIN_TIMEOUT_MS)
  );
  const { data, error } = await Promise.race([loginPromise, timeout]);
  if (error || !data.session) throw error ?? new Error("login failed");
  log("login", "ok");
  const session = {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at,
    expires_in: data.session.expires_in,
    token_type: data.session.token_type,
    user: data.session.user,
  };
  return `${cookieName}=${encodeURIComponent(JSON.stringify(session))}`;
}

function parseMarkReadDevApiPerf(afterLineCount) {
  if (!fs.existsSync(devLogPath)) return [];
  const text = fs.readFileSync(devLogPath, "utf8");
  const slice = text.split(/\r?\n/).slice(afterLineCount).join("\n");
  const hits = [];
  const re = /\[dev-api-perf\]\s+\/api\/community-messenger\/rooms\/\[roomId\]\s+PATCH mark_read\s+\{/g;
  let m;
  while ((m = re.exec(slice)) !== null) {
    const start = m.index + m[0].length - 1;
    let depth = 0;
    let end = start;
    for (let i = start; i < slice.length; i++) {
      const ch = slice[i];
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    const block = slice.slice(start, end);
    const obj = {};
    for (const line of block.split(/\r?\n/)) {
      const t = line.trim().replace(/,$/, "");
      const ci = t.indexOf(":");
      if (ci < 1) continue;
      const key = t.slice(0, ci).trim();
      let val = t.slice(ci + 1).trim();
      if (val === "null") obj[key] = null;
      else if (val === "true") obj[key] = true;
      else if (val === "false") obj[key] = false;
      else if (/^['"]/.test(val)) obj[key] = val.slice(1, -1);
      else if (/^-?\d+(\.\d+)?$/.test(val)) obj[key] = Number(val);
      else obj[key] = val;
    }
    hits.push(obj);
  }
  return hits;
}

async function pickRoomId(cookie) {
  if (process.env.CM_VERIFY_ROOM_ID?.trim()) return process.env.CM_VERIFY_ROOM_ID.trim();
  const res = await fetchWithTimeout(`${baseUrl}/api/community-messenger/bootstrap?lite=1`, {
    headers: { cookie },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`bootstrap HTTP ${res.status}`);
  const j = await res.json();
  const rooms = [...(j.chats ?? []), ...(j.groups ?? [])];
  const unread = rooms.find((r) => (r.unreadCount ?? r.unread?.count ?? 0) > 0);
  const id = unread?.id ?? unread?.roomId ?? rooms[0]?.id ?? rooms[0]?.roomId;
  if (id && String(id).length > 30) return String(id);
  throw new Error("no room id from bootstrap");
}

async function markOpen(cookie, roomId, lastReadMessageId) {
  const body = { action: "mark_read", flushOpen: true };
  if (lastReadMessageId) body.lastReadMessageId = lastReadMessageId;
  const t0 = performance.now();
  const res = await fetchWithTimeout(`${baseUrl}/api/community-messenger/rooms/${roomId}`, {
    method: "PATCH",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const wall = Math.round(performance.now() - t0);
  const json = await res.json().catch(() => ({}));
  return { status: res.status, wall, json };
}

function warmPass(p, i) {
  if (i < 2) return { pass: true, note: "cold/warm-up (skip SLO)" };
  const fails = [];
  if (p.duplicate_fast_path !== 1) fails.push("duplicate_fast_path≠1");
  if (p.fetch_existing_skipped !== 1) fails.push("fetch_existing_skipped≠1");
  if ((p.mark_read_fetch_existing_ms ?? 999) !== 0) fails.push(`fetch_existing=${p.mark_read_fetch_existing_ms}`);
  if ((p.mark_read_compare_ms ?? 999) > 10) fails.push(`compare=${p.mark_read_compare_ms}`);
  if (p.patch_room_auth_cache_hit !== 1) fails.push("auth_cache_hit≠1");
  if ((p.patch_room_response_wall_ms ?? 999) > 80) fails.push(`wall=${p.patch_room_response_wall_ms}`);
  return { pass: fails.length === 0, note: fails.join("; ") || "OK" };
}

async function main() {
  log("start", `baseUrl=${baseUrl} (보통 20~40초, 1분 넘으면 Ctrl+C)`);
  if (!fs.existsSync(devLogPath)) {
    log("warn", `dev 로그 없음: ${devLogPath} — npm run dev 터미널 번호에 맞게 BOOTSTRAP_DEV_TERMINAL_LOG 설정`);
  }

  const logLinesBefore = fs.existsSync(devLogPath)
    ? fs.readFileSync(devLogPath, "utf8").split(/\r?\n/).length
    : 0;

  const cookie = await login();
  log("room", "bootstrap에서 roomId 선택…");
  const roomId = await pickRoomId(cookie);
  console.log("baseUrl", baseUrl);
  console.log("roomId", roomId);
  console.log("devLogPath", devLogPath);
  console.log("repeats", REPEATS);

  log("seed", "room bootstrap (membership seed)…");
  await fetchWithTimeout(
    `${baseUrl}/api/community-messenger/rooms/${roomId}/bootstrap?mode=instant&cmReqSrc=warm10x`,
    { headers: { cookie }, cache: "no-store" }
  );
  await new Promise((r) => setTimeout(r, 200));

  const httpResults = [];
  for (let i = 0; i < REPEATS; i++) {
    log("patch", `${i + 1}/${REPEATS} flushOpen mark_read…`);
    const r = await markOpen(cookie, roomId);
    httpResults.push(r);
    log("patch", `${i + 1}/${REPEATS} HTTP ${r.status} client=${r.wall}ms`);
    await new Promise((res) => setTimeout(res, GAP_MS));
  }

  await new Promise((r) => setTimeout(r, 600));
  const perfs = parseMarkReadDevApiPerf(logLinesBefore);

  console.log("\n=== PATCH mark_read ×10 ===\n");
  console.log("| # | HTTP | client_wall | dup_skip | advanced | regression | warm SLO |");
  let warmFails = 0;
  for (let i = 0; i < REPEATS; i++) {
    const http = httpResults[i];
    const p = perfs[i] ?? {};
    const warm = warmPass(p, i + 1);
    if (i >= 1 && !warm.pass) warmFails++;
    const dup = p.patch_room_duplicate_ack_skipped ?? (http.json?.ok ? "?" : "-");
    const adv = p.patch_room_last_read_advanced ?? "-";
    const reg = p.patch_room_regression_blocked ?? "-";
    console.log(
      `| ${i + 1} | ${http.status} | ${http.wall}ms | dup=${dup} adv=${adv} reg=${reg} | ${warm.pass ? "PASS" : "FAIL"} | ${warm.note} |`
    );
    if (i >= 1 && p.duplicate_fast_path === 1) {
      console.log(
        `    perf: wall=${p.patch_room_response_wall_ms} fetch=${p.mark_read_fetch_existing_ms} compare=${p.mark_read_compare_ms} auth_hit=${p.patch_room_auth_cache_hit} src=${p.snapshot_source ?? "-"} inflight=${p.inflight_dedupe_hit ?? 0}`
      );
    }
  }

  console.log("\n=== QA smoke (same session) ===\n");

  const lastOk = httpResults.filter((r) => r.json?.ok).at(-1)?.json;
  const lastReadId = lastOk?.lastReadMessageId ?? null;
  console.log("Q1 advance: last response lastReadMessageId =", lastReadId ?? "(null)");

  const dupAck = await markOpen(cookie, roomId, lastReadId ?? undefined);
  await new Promise((r) => setTimeout(r, 400));
  const dupPerfs = parseMarkReadDevApiPerf(logLinesBefore);
  const dupPerf = dupPerfs[REPEATS] ?? {};
  console.log(
    "Q2 duplicate same cursor:",
    dupAck.json?.ok ? "ok" : "fail",
    `client=${dupAck.wall}ms`,
    `dup_skip=${dupPerf.patch_room_duplicate_ack_skipped ?? "?"}`,
    `fast=${dupPerf.duplicate_fast_path ?? "?"}`
  );

  const staleId = "00000000-0000-4000-8000-000000000001";
  const regAck = await markOpen(cookie, roomId, staleId);
  await new Promise((r) => setTimeout(r, 400));
  const regPerfs = parseMarkReadDevApiPerf(logLinesBefore);
  const regPerf = regPerfs[REPEATS + 1] ?? {};
  const regBlocked =
    regPerf.patch_room_regression_blocked === 1 ||
    (regAck.json?.ok && regAck.json.lastReadMessageId !== staleId);
  console.log(
    "Q3 regression stale cursor:",
    regAck.json?.ok ? "ok" : "fail",
    `regression_blocked=${regPerf.patch_room_regression_blocked ?? "?"}`,
    `returned_id=${regAck.json?.lastReadMessageId ?? "null"}`,
    regBlocked ? "PASS (no rollback)" : "CHECK"
  );

  console.log("Q4 cross-tab badge: manual — other device/tab unread after real advance only (broadcast after response, duplicate skips broadcast)");

  console.log("\n--- summary ---");
  if (warmFails > 0) {
    console.log(`OVERALL: FAIL — warm SLO miss on ${warmFails}/${REPEATS - 1} iterations (2..${REPEATS})`);
    process.exit(1);
  }
  console.log("OVERALL: PASS — warm duplicate SLO (iterations 2..10)");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

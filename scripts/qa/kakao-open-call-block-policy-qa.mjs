#!/usr/bin/env node
/**
 * Kakao open call + block SSOT — production API QA (aaaa ↔ qqqq).
 * Usage: QA_ORIGIN=https://samarket.vercel.app node scripts/qa/kakao-open-call-block-policy-qa.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ORIGIN = (process.env.QA_ORIGIN ?? "https://samarket.vercel.app").replace(/\/$/, "");
const LOG_PATH = path.join(ROOT, "docs/perf/kakao-policy-qa-run.log");

function loadEnvLocal() {
  for (const rel of [".env.local", ".env"]) {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) continue;
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
}

function log(line) {
  const msg = `[kakao-qa] ${line}`;
  console.log(msg);
  fs.appendFileSync(LOG_PATH, msg + "\n");
}

async function signIn(email) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  const password = process.env.E2E_TEST_PASSWORD?.trim() || "1234";
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`login ${email}: ${error?.message ?? "no session"}`);
  const session = {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at,
    expires_in: data.session.expires_in,
    token_type: data.session.token_type,
    user: data.session.user,
  };
  const ref = url.match(/https:\/\/([^.]+)\./)?.[1] ?? "";
  let cookie = `${`sb-${ref}-auth-token`}=${encodeURIComponent(JSON.stringify(session))}`;
  if (sk) {
    const admin = createClient(url, sk, { auth: { persistSession: false } });
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
  return { session: data.session, cookie };
}

async function api(cookie, method, pathname, body) {
  const headers = {
    cookie,
    accept: "application/json",
  };
  if (body != null) headers["content-type"] = "application/json";
  const res = await fetch(`${ORIGIN}${pathname}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

async function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !sk) return null;
  return createClient(url, sk, { auth: { persistSession: false } });
}

async function resetPair(aId, bId) {
  const sb = await serviceClient();
  if (!sb) {
    log("WARN: no service role — skip DB reset");
    return;
  }
  await sb.from("user_social_relations").delete().eq("owner_user_id", aId).eq("target_user_id", bId);
  await sb.from("user_social_relations").delete().eq("owner_user_id", bId).eq("target_user_id", aId);
  await sb
    .from("user_social_relations")
    .update({ is_active: false, unblocked_at: new Date().toISOString() })
    .eq("owner_user_id", aId)
    .eq("target_user_id", bId)
    .eq("relation_type", "blocked");
  await sb
    .from("user_social_relations")
    .update({ is_active: false, unblocked_at: new Date().toISOString() })
    .eq("owner_user_id", bId)
    .eq("target_user_id", aId)
    .eq("relation_type", "blocked");
}

async function hasFriendRow(ownerId, targetId) {
  const sb = await serviceClient();
  if (!sb) return false;
  const { data } = await sb
    .from("user_social_relations")
    .select("id")
    .eq("owner_user_id", ownerId)
    .eq("target_user_id", targetId)
    .eq("relation_type", "friend")
    .maybeSingle();
  return !!data;
}

async function getBlockRow(ownerId, targetId) {
  const sb = await serviceClient();
  if (!sb) return null;
  const { data } = await sb
    .from("user_social_relations")
    .select("relation_type,is_active,block_source,blocked_at,unblocked_at")
    .eq("owner_user_id", ownerId)
    .eq("target_user_id", targetId)
    .eq("relation_type", "blocked")
    .maybeSingle();
  return data;
}

async function checkMigrationColumns() {
  const sb = await serviceClient();
  if (!sb) return { pass: false, note: "no service role" };
  const { error } = await sb.from("user_social_relations").select("is_active,block_source,blocked_at").limit(1);
  if (error) return { pass: false, note: error.message };
  return { pass: true, note: "columns ok" };
}

const results = [];

function record(id, name, pass, detail = "") {
  results.push({ id, name, pass, detail });
  log(`${pass ? "PASS" : "FAIL"} #${id} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
  fs.writeFileSync(LOG_PATH, `[kakao-qa] origin=${ORIGIN} started=${new Date().toISOString()}\n`);
  loadEnvLocal();

  const mig = await checkMigrationColumns();
  record("M", "migration columns (is_active, block_source)", mig.pass, mig.note);

  const authA = await signIn("aaaa@manual.local");
  const authB = await signIn("qqqq@manual.local");
  const cookieA = authA.cookie;
  const cookieB = authB.cookie;
  const userIdA = authA.session.user.id;
  const userIdB = authB.session.user.id;
  log(`userIdA=${userIdA} userIdB=${userIdB}`);

  await resetPair(userIdA, userIdB);

  const roomRes = await api(cookieA, "POST", "/api/community-messenger/rooms", {
    roomType: "direct",
    peerUserId: userIdB,
  });
  const roomId = roomRes.json?.room?.id ?? roomRes.json?.roomId ?? roomRes.json?.id;
  if (!roomId) {
    record(0, "ensure direct room", false, JSON.stringify(roomRes.json ?? roomRes.status));
    throw new Error("no roomId");
  }
  log(`roomId=${roomId}`);

  const boot = await api(cookieA, "GET", `/api/community-messenger/rooms/${roomId}/bootstrap?mode=instant`);
  const gate = boot.json?.directCallGate;
  const label = boot.json?.peerRelationLabel;
  const deployOk =
    gate?.canStartVoice === true &&
    gate?.canStartVideo === true &&
    (label === "stranger" || label === "saved_by_peer" || label === "saved_by_me");
  record("D", "Vercel deploy signal (open call gate)", deployOk, `gate=${JSON.stringify(gate)} label=${label}`);

  record(1, "stranger message", (await api(cookieA, "POST", `/api/community-messenger/rooms/${roomId}/messages`, { content: `[qa-${Date.now()}] stranger msg` })).status === 200);

  const voice = await api(cookieA, "POST", `/api/community-messenger/rooms/${roomId}/calls`, { callKind: "voice", dialIntent: "fresh" });
  record(2, "stranger voice call", voice.status === 200 && voice.json?.ok === true, `status=${voice.status} err=${voice.json?.error ?? "-"}`);

  const video = await api(cookieA, "POST", `/api/community-messenger/rooms/${roomId}/calls`, { callKind: "video", dialIntent: "fresh" });
  record(3, "stranger video call", video.status === 200 && video.json?.ok === true, `status=${video.status} err=${video.json?.error ?? "-"}`);

  const friendAdd = await api(cookieA, "POST", "/api/community-messenger/relations/friend", { targetUserId: userIdB });
  record(6, "friend add", friendAdd.json?.ok === true || friendAdd.status === 200, JSON.stringify(friendAdd.json?.error ?? "ok"));

  const blockFriend = await api(cookieA, "POST", "/api/community-messenger/relations/block", {
    targetUserId: userIdB,
    blockSource: "friend_list",
  });
  const blockRow7 = await getBlockRow(userIdA, userIdB);
  record(7, "friend list block", blockFriend.json?.blocked === true && blockRow7?.is_active === true, `block_source=${blockRow7?.block_source ?? "-"}`);

  const msgBlocked = await api(cookieA, "POST", `/api/community-messenger/rooms/${roomId}/messages`, { content: "should fail" });
  const callBlocked = await api(cookieA, "POST", `/api/community-messenger/rooms/${roomId}/calls`, { callKind: "voice" });
  record("7b", "block denies message+call", msgBlocked.status !== 200 && (callBlocked.status === 403 || callBlocked.json?.error?.includes("blocked")), `msg=${msgBlocked.status} call=${callBlocked.status}`);

  await api(cookieA, "DELETE", "/api/community-messenger/relations/block", { targetUserId: userIdB });
  const blockRowAfterUnblock = await getBlockRow(userIdA, userIdB);
  const friendAfterUnblock = await hasFriendRow(userIdA, userIdB);
  record(11, "unblock works", blockRowAfterUnblock?.is_active === false, `is_active=${blockRowAfterUnblock?.is_active}`);
  record(12, "no auto friend restore after unblock", !friendAfterUnblock, `stillFriend=${friendAfterUnblock}`);

  await resetPair(userIdA, userIdB);
  const msgAgain = await api(cookieA, "POST", `/api/community-messenger/rooms/${roomId}/messages`, { content: `[qa-${Date.now()}] post-unblock` });
  const callAgain = await api(cookieA, "POST", `/api/community-messenger/rooms/${roomId}/calls`, { callKind: "voice", dialIntent: "fresh" });
  record(13, "post-unblock message+call", msgAgain.status === 200 && callAgain.status === 200, `msg=${msgAgain.status} call=${callAgain.status}`);

  const blockChat = await api(cookieA, "POST", "/api/community-messenger/relations/block", {
    targetUserId: userIdB,
    roomId,
    blockSource: "chat_room",
  });
  const blockRow8 = await getBlockRow(userIdA, userIdB);
  record(8, "chat room block", blockChat.json?.blocked === true && blockRow8?.block_source === "chat_room", `source=${blockRow8?.block_source}`);
  await api(cookieA, "DELETE", "/api/community-messenger/relations/block", { targetUserId: userIdB });

  const blockIncoming = await api(cookieA, "POST", "/api/community-messenger/relations/block", {
    targetUserId: userIdB,
    blockSource: "incoming_call",
  });
  const blockRow9 = await getBlockRow(userIdA, userIdB);
  record(9, "incoming_call block source", blockIncoming.json?.blocked === true && blockRow9?.block_source === "incoming_call", `source=${blockRow9?.block_source}`);
  await api(cookieA, "DELETE", "/api/community-messenger/relations/block", { targetUserId: userIdB });

  const blockedList = await api(cookieA, "GET", "/api/me/relations/blocked");
  record(10, "block list API reachable", blockedList.status === 200, `status=${blockedList.status}`);

  log(`SUMMARY pass=${results.filter((r) => r.pass).length}/${results.length}`);
  for (const r of results) {
    if (!r.pass) log(`FAIL_DETAIL id=${r.id} ${r.detail}`);
  }
  process.exitCode = results.every((r) => r.pass) ? 0 : 1;
}

main().catch((e) => {
  log(`FATAL ${e?.stack ?? e}`);
  process.exit(1);
});

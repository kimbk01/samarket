#!/usr/bin/env node
/**
 * Room Unread Authority Runtime Matrix (DB/RPC layer).
 * DO NOT declare Product PASS. Badge numbers are out of scope.
 *
 * Invariant: participant.unread_count === dibay_cm_canonical_unread_count(...)
 * And append/mark use atomic RPCs (fallbackUsed = false by construction).
 *
 * Usage:
 *   node --env-file=.env.local scripts/room-unread-authority-runtime-matrix.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { withRedTeamViewerLock } from "./qa/lib/red-team-viewer-lock.mjs";

const OUT = join(process.cwd(), ".qa-logs/room-unread-authority-v1");
mkdirSync(OUT, { recursive: true });

const VIEWER = process.env.ROOM_UNREAD_VIEWER_ID || "35dd245c-d398-4ea3-93a0-c0eda37cc777";
const PEER = process.env.ROOM_UNREAD_PEER_ID || "";
const ROUNDS = Number(process.env.ROOM_UNREAD_ROUNDS || 3);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("missing SUPABASE env");
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

function fail(msg, detail) {
  console.error("FAIL", msg, detail || "");
  return { ok: false, error: msg, detail };
}

async function getParticipant(roomId, userId) {
  const { data, error } = await sb
    .from("community_messenger_participants")
    .select("user_id, unread_count, last_read_message_id, last_read_at, left_at")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function canonical(roomId, userId) {
  const p = await getParticipant(roomId, userId);
  const { data, error } = await sb.rpc("dibay_cm_canonical_unread_count", {
    p_room_id: roomId,
    p_viewer_id: userId,
  });
  if (error) throw new Error(error.message);
  return { stored: Number(p?.unread_count ?? 0), canonical: Number(data ?? 0), cursor: p?.last_read_message_id ?? null };
}

function assertEqual(label, snap) {
  if (snap.stored !== snap.canonical) {
    return fail(`${label}: stored!=canonical`, snap);
  }
  return { ok: true, ...snap };
}

async function pickRooms() {
  const { data, error } = await sb
    .from("community_messenger_rooms")
    .select("id, chat_domain, domain_identity_key, deleted_at")
    .is("deleted_at", null)
    .in("chat_domain", ["general_direct", "group", "trade", "store_order"])
    .limit(200);
  if (error) throw new Error(error.message);
  const rooms = data || [];
  const byDomain = {};
  for (const r of rooms) {
    const { data: parts } = await sb
      .from("community_messenger_participants")
      .select("user_id, left_at")
      .eq("room_id", r.id)
      .is("left_at", null);
    const users = (parts || []).map((p) => p.user_id);
    if (!users.includes(VIEWER)) continue;
    const peer = users.find((u) => u !== VIEWER);
    if (!peer && r.chat_domain !== "group") continue;
    const list = byDomain[r.chat_domain] || [];
    if (list.length >= 2) continue;
    list.push({ ...r, peer: peer || null, members: users });
    byDomain[r.chat_domain] = list;
  }
  return byDomain;
}

async function appendAtomic({ room, senderId, messageType, content, forceNull = false, key }) {
  const args = {
    p_idempotency_key: key,
    p_room_id: room.id,
    p_chat_domain: room.chat_domain,
    p_domain_identity_key: room.domain_identity_key,
    p_sender_id: senderId,
    p_sender_role: "member",
    p_message_type: messageType,
    p_content: content,
    p_metadata: {},
    p_counts_as_unread: true,
    p_force_null_message_sender: forceNull,
  };
  const { data, error } = await sb.rpc("dibay_append_room_message_atomic", args);
  if (error) return { ok: false, error: error.message, fallbackUsed: false, rpc_used: "dibay_append_room_message_atomic" };
  if (!data?.ok) return { ok: false, error: data?.error || "append_failed", fallbackUsed: false, rpc_used: "dibay_append_room_message_atomic", data };
  return {
    ok: true,
    messageId: data.message?.id,
    fallbackUsed: false,
    rpc_used: "dibay_append_room_message_atomic",
    data,
  };
}

async function markReadAtomic({ room, userId, key, viewerRole }) {
  const args = {
    p_viewer_id: userId,
    p_room_id: room.id,
    p_chat_domain: room.chat_domain,
    p_domain_identity_key: room.domain_identity_key,
    p_viewer_role: viewerRole || "member",
    p_idempotency_key: key,
  };
  if (room.chat_domain === "store_order") {
    const orderId = String(room.domain_identity_key || "").replace(/^store_order:/, "").trim();
    const { data: order } = await sb
      .from("store_orders")
      .select("id, store_id, buyer_user_id, stores(owner_user_id)")
      .eq("id", orderId)
      .maybeSingle();
    const buyer = order?.buyer_user_id;
    const owner = order?.stores?.owner_user_id;
    args.p_order_id = orderId || null;
    args.p_store_id = order?.store_id || null;
    if (!viewerRole) {
      if (userId === buyer) args.p_viewer_role = "customer";
      else if (userId === owner) args.p_viewer_role = "owner";
      else args.p_viewer_role = "customer";
    }
  }
  const { data, error } = await sb.rpc("dibay_mark_room_read_atomic", args);
  if (error) return { ok: false, error: error.message, fallbackUsed: false, rpc_used: "dibay_mark_room_read_atomic" };
  if (!data?.ok) return { ok: false, error: data?.error || "mark_failed", fallbackUsed: false, rpc_used: "dibay_mark_room_read_atomic", data };
  return { ok: true, fallbackUsed: false, rpc_used: "dibay_mark_room_read_atomic", data };
}

async function resetViewerUnread(room) {
  // One-shot mark-read to start each run at 0 — not an always-on heal.
  const key = `runtime_reset:${room.id}:${VIEWER}:${Date.now()}`;
  await markReadAtomic({ room, userId: VIEWER, key });
}

async function runDomainCase(domain, room, round) {
  const log = { domain, roomId: room.id, round, steps: [] };
  const peer = room.peer || PEER;
  if (!peer) return { ...log, ok: false, error: "no_peer" };

  await resetViewerUnread(room);
  let snap = assertEqual("initial", await canonical(room.id, VIEWER));
  log.steps.push({ step: "initial", ...snap });
  if (!snap.ok) return { ...log, ok: false };

  // peer message 1
  let ap = await appendAtomic({
    room,
    senderId: peer,
    messageType: "text",
    content: `runtime ${domain} r${round} m1`,
    key: `runtime:${domain}:r${round}:m1:${Date.now()}`,
  });
  log.steps.push({ step: "peer_1", ...ap, ...(await canonical(room.id, VIEWER)) });
  if (!ap.ok || ap.fallbackUsed) return { ...log, ok: false };
  snap = assertEqual("after_peer_1", await canonical(room.id, VIEWER));
  if (!snap.ok || snap.stored !== 1) return { ...log, ok: false, error: "expect_stored_1" };

  // peer +2
  for (const n of [2, 3]) {
    ap = await appendAtomic({
      room,
      senderId: peer,
      messageType: "text",
      content: `runtime ${domain} r${round} m${n}`,
      key: `runtime:${domain}:r${round}:m${n}:${Date.now()}`,
    });
    if (!ap.ok) return { ...log, ok: false, error: ap.error };
  }
  snap = assertEqual("after_peer_3", await canonical(room.id, VIEWER));
  log.steps.push({ step: "peer_3", ...snap });
  if (!snap.ok || snap.stored !== 3) return { ...log, ok: false, error: "expect_stored_3" };

  // own message — must not increment own unread (sender-read-on-send may clear to 0).
  const beforeOwn = snap.stored;
  ap = await appendAtomic({
    room,
    senderId: VIEWER,
    messageType: "text",
    content: `runtime ${domain} r${round} own`,
    key: `runtime:${domain}:r${round}:own:${Date.now()}`,
  });
  snap = assertEqual("after_own", await canonical(room.id, VIEWER));
  log.steps.push({ step: "own", append: ap, beforeOwn, ...snap });
  if (!ap.ok || !snap.ok) return { ...log, ok: false, error: "own_append_failed" };
  if (snap.stored > beforeOwn) return { ...log, ok: false, error: "own_incremented_unread" };

  // mark read
  const mk = await markReadAtomic({
    room,
    userId: VIEWER,
    key: `runtime:${domain}:r${round}:read:${Date.now()}`,
  });
  snap = assertEqual("after_read", await canonical(room.id, VIEWER));
  log.steps.push({ step: "read", mark: mk, ...snap });
  if (!mk.ok || mk.fallbackUsed || !snap.ok || snap.stored !== 0) return { ...log, ok: false, error: "read_not_zero" };

  // post-read
  ap = await appendAtomic({
    room,
    senderId: peer,
    messageType: "text",
    content: `runtime ${domain} r${round} post`,
    key: `runtime:${domain}:r${round}:post:${Date.now()}`,
  });
  snap = assertEqual("post_read", await canonical(room.id, VIEWER));
  log.steps.push({ step: "post_read", append: ap, ...snap });
  if (!ap.ok || !snap.ok || snap.stored !== 1) return { ...log, ok: false, error: "post_read_expect_1" };

  // retry same idempotency
  const idem = `runtime:${domain}:r${round}:retry:${Date.now()}`;
  const a1 = await appendAtomic({ room, senderId: peer, messageType: "text", content: "retry-body", key: idem });
  const a2 = await appendAtomic({ room, senderId: peer, messageType: "text", content: "retry-body", key: idem });
  snap = assertEqual("after_retry", await canonical(room.id, VIEWER));
  log.steps.push({ step: "retry", a1, a2, ...snap });
  if (!a1.ok || !a2.ok) return { ...log, ok: false, error: "retry_append_failed" };
  if (!a1.messageId || a1.messageId !== a2.messageId) {
    return { ...log, ok: false, error: "retry_created_duplicate_message" };
  }
  // post-read left stored=1; retry must increment once only → 2
  if (!snap.ok || snap.stored !== 2) return { ...log, ok: false, error: "retry_increment_not_once" };

  return { ...log, ok: true };
}

async function runTypeMatrix(room, messageType, round, opts = {}) {
  const peer = room.peer || PEER;
  if (!peer) return { ok: false, error: "no_peer", messageType, round };
  await resetViewerUnread(room);
  // Ensure projection is clean before append (avoid cross-round flake).
  for (let i = 0; i < 3; i++) {
    const clean = await canonical(room.id, VIEWER);
    if (clean.stored === 0 && clean.canonical === 0) break;
    await resetViewerUnread(room);
    await new Promise((r) => setTimeout(r, 50));
  }
  const pre = await canonical(room.id, VIEWER);
  if (pre.stored !== 0 || pre.canonical !== 0) {
    return { ok: false, error: "reset_not_clean", messageType, round, ...pre };
  }
  const key = `runtime:type:${messageType}:r${round}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
  const senderId = opts.usePeerAsActor || !opts.forceNull ? peer : VIEWER;
  const ap = await appendAtomic({
    room,
    senderId,
    messageType,
    content: `${opts.content || `type-${messageType}-${round}`}#${round}#${Date.now()}`,
    forceNull: opts.forceNull === true,
    key,
  });
  if (!ap.ok) return { ok: false, messageType, round, roomId: room.id, append: ap, error: ap.error };
  let snap = await canonical(room.id, VIEWER);
  if (snap.stored !== snap.canonical) {
    await new Promise((r) => setTimeout(r, 100));
    snap = await canonical(room.id, VIEWER);
  }
  const eq = assertEqual(`type_${messageType}`, snap);
  const expect = opts.expectUnread ?? 1;
  const ok = !ap.fallbackUsed && eq.ok && snap.stored === expect;
  return { ok, messageType, round, roomId: room.id, append: ap, ...eq, expect, pre };
}

async function mainUnlocked() {
  const expectedCommit = process.env.ROOM_UNREAD_EXPECTED_COMMIT || "f27dcc6f0";
  const byDomain = await pickRooms();
  const report = {
    generated_at: new Date().toISOString(),
    expected_commit: expectedCommit,
    viewer: VIEWER,
    rooms: Object.fromEntries(Object.entries(byDomain).map(([k, v]) => [k, v.map((r) => r.id)])),
    domains: {},
    types: {},
    verdict: null,
  };

  for (const domain of ["general_direct", "group", "trade", "store_order"]) {
    const room = (byDomain[domain] || [])[0];
    report.domains[domain] = [];
    if (!room) {
      report.domains[domain].push({ ok: false, error: "no_room" });
      continue;
    }
    for (let r = 1; r <= ROUNDS; r++) {
      const res = await runDomainCase(domain, room, r);
      report.domains[domain].push(res);
      console.log(`[domain ${domain} r${r}] ok=${res.ok} err=${res.error || ""}`);
    }
  }

  const gd = (byDomain.general_direct || [])[0];
  const so = (byDomain.store_order || [])[0];
  const typeSpecs = [
    { type: "text", room: gd },
    { type: "image", room: gd, content: "https://example.invalid/img.jpg" },
    { type: "sticker", room: gd, content: "sticker://runtime" },
    { type: "voice", room: gd, content: "https://example.invalid/a.m4a" },
    { type: "file", room: gd, content: "https://example.invalid/f.bin" },
    { type: "call_stub", room: gd, content: "통화" },
    {
      type: "system",
      room: so,
      forceNull: true,
      content: "주문 상태 안내",
      // actor must be a participant; forceNull nulls message.sender_id while unread uses actor id.
      usePeerAsActor: true,
      expectUnread: 1,
    },
  ];
  for (const spec of typeSpecs) {
    report.types[spec.type] = [];
    if (!spec.room) {
      report.types[spec.type].push({ ok: false, error: "no_room" });
      continue;
    }
    for (let r = 1; r <= ROUNDS; r++) {
      const res = await runTypeMatrix(spec.room, spec.type, r, {
        forceNull: spec.forceNull,
        content: spec.content,
        usePeerAsActor: spec.usePeerAsActor,
        expectUnread: spec.expectUnread,
      });
      report.types[spec.type].push(res);
      console.log(`[type ${spec.type} r${r}] ok=${res.ok} stored=${res.stored} canonical=${res.canonical}`);
    }
  }

  const domainPass = Object.values(report.domains).every((arr) => arr.length === ROUNDS && arr.every((x) => x.ok));
  const typePass = Object.values(report.types).every((arr) => arr.length === ROUNDS && arr.every((x) => x.ok));
  report.verdict = {
    domainPass,
    typePass,
    room_unread_authority_runtime_pass: domainPass && typePass,
    badge_cutover: "BLOCKED",
    product_pass: false,
    lock: false,
  };

  writeFileSync(join(OUT, "runtime-matrix-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.verdict, null, 2));
  return report.verdict.room_unread_authority_runtime_pass === true;
}

async function main() {
  const ok = await withRedTeamViewerLock(
    { viewerId: VIEWER, owner: "room-unread-authority-runtime-matrix", script: import.meta.url },
    mainUnlocked
  );
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(e?.code === "RED_TEAM_LOCK_HELD" ? 3 : 1);
});

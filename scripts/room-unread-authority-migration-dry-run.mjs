#!/usr/bin/env node
/**
 * Room Unread Authority v1 — migration DRY-RUN only (no apply).
 *
 * Computes canonical unread (cursor + created_at,id) vs stored unread_count
 * for rooms with stored > 0. Includes the known 27 mismatch sample when present.
 *
 * Usage:
 *   node --env-file=.env.local scripts/room-unread-authority-migration-dry-run.mjs
 *
 * DO NOT: UPDATE unread_count · heal · badge cutover
 */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const KNOWN_MISMATCH_ROOMS = [
  "97aaf3dc-0294-48c1-b3d0-c7d607a10759",
  "4dfbb7bf-a504-4cee-9fda-569f57435e4c",
  "1577e6c7-fc7c-4761-bfd4-8212dbd16f9a",
  "363c00d8-d76d-4a85-96a5-e67030be4ab6",
  "3b347cb0-b965-402b-9b5f-3b90f374f506",
  "e731758e-cef8-439b-a84c-492c05f066c4",
  "a9d1008c-1d7c-4177-8d41-1910913ebd98",
  "ec57c633-32e5-4f6b-91e4-c68b3f35b433",
  "eb322218-0e15-4b7f-b7e4-60fb4bb376f9",
  "efb8ec00-b018-406f-9c35-1baf19c2612a",
  "1c27c719-91a9-4fae-8072-b6882a33cec6",
  "9d949058-688d-4062-b631-ded78187bf9f",
  "71b6cca9-5dbf-498f-a4cd-db140cb25138",
  "a14484c7-5c0d-48ff-bcc3-cfd4570b7510",
  "77777648-8d7a-4e20-ae7d-b1b10959423b",
  "390c01d2-53c3-4030-8904-1b84101133c6",
  "62ef12a3-ec55-4461-a921-483a85225606",
  "1b9ccad1-a31b-4adb-b38c-0bdd9c90f400",
  "a5ca1328-de69-4d3b-8341-ba6a33200bb9",
  "1c5900c9-4e46-4078-81e3-f5eaa315add3",
  "60efb79a-e76e-46f1-9e2c-3e4ca4d110de",
  "569a08f5-df4f-4c5b-b016-8861cc94002c",
  "9cf74195-fa97-406e-bd9a-35bd99548758",
  "cf1b4d85-e9b5-4c11-8432-92c2bc6d498b",
  "0d887630-772d-4bbb-8944-b54194276965",
  "079988ad-137f-4788-a0b5-8865f0d10edf",
  "d36570aa-65ce-4aba-8569-db564c62e47d",
];

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const viewer = process.env.ROOM_UNREAD_DRY_RUN_VIEWER || "35dd245c-d398-4ea3-93a0-c0eda37cc777";

if (!url || !key) {
  console.error("Missing SUPABASE url/service role key");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

async function canonicalUnread(roomId, viewerId, cursorId, joinedAt) {
  // PostgREST cannot easily do tuple compare; fetch and filter in JS for dry-run.
  const { data, error } = await sb
    .from("community_messenger_messages")
    .select("id, created_at, sender_id")
    .eq("room_id", roomId)
    .is("deleted_at", null);
  if (error) throw error;
  let cursorAt = null;
  if (cursorId) {
    const hit = (data || []).find((m) => m.id === cursorId);
    cursorAt = hit?.created_at ?? null;
  }
  const joinedMs = joinedAt ? Date.parse(joinedAt) : null;
  let n = 0;
  for (const m of data || []) {
    if (m.sender_id === viewerId) continue;
    if (joinedMs != null && Date.parse(m.created_at) < joinedMs) continue;
    if (!cursorId || !cursorAt) {
      n += 1;
      continue;
    }
    const at = Date.parse(m.created_at);
    const cAt = Date.parse(cursorAt);
    if (at > cAt || (at === cAt && m.id > cursorId)) n += 1;
  }
  return n;
}

function reason(oldC, newC) {
  if (oldC === newC) return "match";
  if (oldC > 0 && newC === 0) return "stale_fixed";
  if (oldC < newC) return "undercount_fixed";
  if (oldC > newC) return "overcount_fixed";
  return "changed";
}

async function main() {
  const { data: parts, error } = await sb
    .from("community_messenger_participants")
    .select(
      "room_id, user_id, unread_count, last_read_message_id, last_read_at, joined_at, left_at, community_messenger_rooms!inner(chat_domain, deleted_at)"
    )
    .eq("user_id", viewer)
    .is("left_at", null)
    .gt("unread_count", 0);
  if (error) throw error;

  const rows = [];
  for (const p of parts || []) {
    const room = p.community_messenger_rooms;
    if (room?.deleted_at) continue;
    const oldCount = Math.max(0, Number(p.unread_count) || 0);
    const newCount = await canonicalUnread(
      p.room_id,
      viewer,
      p.last_read_message_id,
      p.joined_at
    );
    rows.push({
      room: p.room_id,
      domain: room?.chat_domain ?? "unknown",
      role: "viewer",
      old_count: oldCount,
      new_count: newCount,
      cursor: p.last_read_message_id,
      reason: reason(oldCount, newCount),
      known_27: KNOWN_MISMATCH_ROOMS.includes(p.room_id),
    });
  }

  // Ensure known 27 appear even if unread_count already 0
  const have = new Set(rows.map((r) => r.room));
  for (const rid of KNOWN_MISMATCH_ROOMS) {
    if (have.has(rid)) continue;
    const { data: one } = await sb
      .from("community_messenger_participants")
      .select(
        "room_id, unread_count, last_read_message_id, joined_at, community_messenger_rooms!inner(chat_domain)"
      )
      .eq("user_id", viewer)
      .eq("room_id", rid)
      .maybeSingle();
    if (!one) continue;
    const oldCount = Math.max(0, Number(one.unread_count) || 0);
    const newCount = await canonicalUnread(
      rid,
      viewer,
      one.last_read_message_id,
      one.joined_at
    );
    rows.push({
      room: rid,
      domain: one.community_messenger_rooms?.chat_domain ?? "unknown",
      role: "viewer",
      old_count: oldCount,
      new_count: newCount,
      cursor: one.last_read_message_id,
      reason: reason(oldCount, newCount),
      known_27: true,
    });
  }

  const summary = {
    viewer,
    generated_at: new Date().toISOString(),
    apply: false,
    note: "DRY-RUN only — no UPDATE issued",
    totals: {
      rows: rows.length,
      match: rows.filter((r) => r.reason === "match").length,
      stale_fixed: rows.filter((r) => r.reason === "stale_fixed").length,
      undercount_fixed: rows.filter((r) => r.reason === "undercount_fixed").length,
      overcount_fixed: rows.filter((r) => r.reason === "overcount_fixed").length,
      known_27_covered: rows.filter((r) => r.known_27).length,
    },
    rows: rows.sort((a, b) => a.domain.localeCompare(b.domain) || a.room.localeCompare(b.room)),
  };

  const outDir = join(process.cwd(), ".qa-logs/room-unread-authority-v1");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "migration-dry-run.json");
  writeFileSync(outPath, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary.totals, null, 2));
  console.log("wrote", outPath);
  console.log("Room\tDomain\tOld\tNew\tReason");
  for (const r of summary.rows) {
    console.log(`${r.room}\t${r.domain}\t${r.old_count}\t${r.new_count}\t${r.reason}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

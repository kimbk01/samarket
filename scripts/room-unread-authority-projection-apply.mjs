#!/usr/bin/env node
/**
 * Room Unread Authority v1 — one-time projection APPLY.
 *
 * Updates ONLY community_messenger_participants.unread_count
 * ← dibay_cm_canonical_unread_count (cursor Authority).
 *
 * DO NOT: wipe cursor · delete message_reads · clear Bell · mass unread=0
 *
 * Usage:
 *   node --env-file=.env.local scripts/room-unread-authority-projection-apply.mjs           # dry
 *   node --env-file=.env.local scripts/room-unread-authority-projection-apply.mjs --apply  # write
 */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const APPLY = process.argv.includes("--apply");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const viewer = process.env.ROOM_UNREAD_DRY_RUN_VIEWER || "35dd245c-d398-4ea3-93a0-c0eda37cc777";

if (!url || !key) {
  console.error("Missing SUPABASE url/service role key");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });
const outDir = join(process.cwd(), ".qa-logs/room-unread-authority-v1");
mkdirSync(outDir, { recursive: true });

const dryPath = join(outDir, "migration-dry-run.json");
if (!existsSync(dryPath)) {
  console.error("Run dry-run first:", dryPath);
  process.exit(1);
}

const dry = JSON.parse(readFileSync(dryPath, "utf8"));
const candidates = (dry.rows || []).filter((r) => r.old_count !== r.new_count);
const manual = (dry.rows || []).filter((r) => r.reason === "manual_review_required");
if (manual.length) {
  console.error("manual_review_required present — refuse apply", manual.map((m) => m.room));
  process.exit(1);
}

const evidence = {
  viewer,
  generated_at: new Date().toISOString(),
  apply: APPLY,
  source_dry_run: dryPath,
  totals: {
    processed: 0,
    unchanged: 0,
    stale_fixed: 0,
    undercount_fixed: 0,
    overcount_fixed: 0,
    skipped: 0,
    failed: 0,
  },
  rooms: [],
};

function bucket(oldC, newC) {
  if (oldC === newC) return "unchanged";
  if (oldC > 0 && newC === 0) return "stale_fixed";
  if (oldC < newC) return "undercount_fixed";
  if (oldC > newC) return "overcount_fixed";
  return "changed";
}

async function processOne(row) {
  const roomId = row.room;
  const { data: canonical, error: rpcErr } = await sb.rpc("dibay_cm_canonical_unread_count", {
    p_room_id: roomId,
    p_viewer_id: viewer,
  });
  if (rpcErr) {
    evidence.totals.failed += 1;
    evidence.rooms.push({
      room: roomId,
      domain: row.domain,
      status: "failed",
      error: rpcErr.message,
    });
    return;
  }
  const newCount = Math.max(0, Math.floor(Number(canonical) || 0));
  const { data: part, error: partErr } = await sb
    .from("community_messenger_participants")
    .select("id, unread_count, last_read_message_id, left_at")
    .eq("room_id", roomId)
    .eq("user_id", viewer)
    .maybeSingle();
  if (partErr || !part) {
    evidence.totals.failed += 1;
    evidence.rooms.push({ room: roomId, status: "failed", error: partErr?.message || "no_participant" });
    return;
  }
  if (part.left_at) {
    evidence.totals.skipped += 1;
    evidence.rooms.push({ room: roomId, status: "skipped", reason: "left" });
    return;
  }
  const oldCount = Math.max(0, Math.floor(Number(part.unread_count) || 0));
  const kind = bucket(oldCount, newCount);
  if (oldCount === newCount) {
    evidence.totals.unchanged += 1;
    evidence.rooms.push({
      room: roomId,
      domain: row.domain,
      status: "unchanged",
      old_count: oldCount,
      new_count: newCount,
      cursor: part.last_read_message_id,
    });
    return;
  }

  evidence.totals.processed += 1;
  if (kind === "stale_fixed") evidence.totals.stale_fixed += 1;
  if (kind === "undercount_fixed") evidence.totals.undercount_fixed += 1;
  if (kind === "overcount_fixed") evidence.totals.overcount_fixed += 1;

  const entry = {
    room: roomId,
    domain: row.domain,
    status: APPLY ? "applied" : "would_apply",
    reason: kind,
    old_count: oldCount,
    new_count: newCount,
    cursor: part.last_read_message_id,
    participant_id: part.id,
  };

  if (APPLY) {
    const { error: upErr } = await sb
      .from("community_messenger_participants")
      .update({ unread_count: newCount })
      .eq("id", part.id)
      .eq("user_id", viewer)
      .eq("room_id", roomId);
    if (upErr) {
      evidence.totals.failed += 1;
      evidence.totals.processed -= 1;
      entry.status = "failed";
      entry.error = upErr.message;
    } else {
      // verify
      const { data: after } = await sb
        .from("community_messenger_participants")
        .select("unread_count, last_read_message_id")
        .eq("id", part.id)
        .maybeSingle();
      entry.after_count = after?.unread_count;
      entry.after_cursor = after?.last_read_message_id;
      entry.cursor_preserved = after?.last_read_message_id === part.last_read_message_id;
    }
  }

  evidence.rooms.push(entry);
}

async function main() {
  console.log(APPLY ? "APPLY mode" : "DRY preview (pass --apply to write)");
  console.log("candidates", candidates.length);
  for (const row of candidates) {
    await processOne(row);
  }
  // also reconcile any other viewer rooms with unread>0 not in candidates? Stick to dry-run deltas only.
  const outName = APPLY ? "projection-apply.json" : "projection-apply-preview.json";
  const outPath = join(outDir, outName);
  writeFileSync(outPath, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence.totals, null, 2));
  console.log("wrote", outPath);
  for (const r of evidence.rooms) {
    console.log(
      [r.room, r.domain || "", r.status, r.old_count, r.new_count, r.reason || r.error || ""].join("\t")
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

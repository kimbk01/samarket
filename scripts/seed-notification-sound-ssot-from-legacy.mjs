#!/usr/bin/env node
/**
 * Backfill notification_sound_assets.file_url from legacy admin tables.
 * Usage: node scripts/seed-notification-sound-ssot-from-legacy.mjs [--dry-run]
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (or local supabase).
 */
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const dryRun = process.argv.includes("--dry-run");

function checksum(url) {
  return crypto.createHash("sha256").update(url ?? "").digest("hex").slice(0, 16);
}

function parseOrderMatchUrl(valueJson) {
  if (!valueJson || typeof valueJson !== "object") return null;
  for (const k of ["value", "url"]) {
    const s = valueJson[k];
    if (typeof s === "string" && s.trim()) return s.trim();
  }
  return null;
}

function parseDeliveryUrl(valueJson) {
  if (!valueJson || typeof valueJson !== "object") return null;
  const u = valueJson.url;
  return typeof u === "string" && u.trim() ? u.trim() : null;
}

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("[seed] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

const ASSET_LEGACY_MAP = [
  { assetId: "DIBAY-SND-011", table: "admin_notification_settings", key: "community_direct_chat", column: "sound_url" },
  { assetId: "DIBAY-SND-012", table: "admin_notification_settings", key: "community_group_chat", column: "sound_url" },
  { assetId: "DIBAY-SND-013", table: "admin_notification_settings", key: "trade_chat", column: "sound_url" },
  { assetId: "DIBAY-SND-020", table: "admin_notification_settings", key: "order", column: "sound_url" },
  { assetId: "DIBAY-SND-021", table: "admin_notification_settings", key: "store", column: "sound_url" },
];

const CALL_COLUMNS = [
  { assetId: "DIBAY-SND-040", column: "voice_incoming_sound_url" },
  { assetId: "DIBAY-SND-041", column: "video_incoming_sound_url" },
  { assetId: "DIBAY-SND-042", column: "voice_outgoing_ringback_url" },
  { assetId: "DIBAY-SND-043", column: "video_outgoing_ringback_url" },
  { assetId: "DIBAY-SND-044", column: "missed_notification_sound_url" },
  { assetId: "DIBAY-SND-045", column: "call_end_sound_url" },
  { assetId: "DIBAY-SND-046", column: "default_fallback_sound_url" },
];

async function patchAsset(assetId, fileUrl, legacyPatch) {
  const legacy_source = {
    ...legacyPatch,
    url_at_seed: fileUrl,
    checksum: checksum(fileUrl),
    null_at_seed: !fileUrl,
    seeded_at: new Date().toISOString(),
  };
  console.log(`[seed] ${assetId} url=${fileUrl ?? "(null)"} dry=${dryRun}`);
  if (dryRun) return;
  const { error } = await sb
    .from("notification_sound_assets")
    .update({ file_url: fileUrl, legacy_source, updated_at: new Date().toISOString() })
    .eq("id", assetId);
  if (error) throw new Error(`${assetId}: ${error.message}`);
}

async function main() {
  const { data: notifRows } = await sb.from("admin_notification_settings").select("type, sound_url");
  for (const m of ASSET_LEGACY_MAP) {
    const row = (notifRows ?? []).find((r) => r.type === m.key);
    const fileUrl = typeof row?.sound_url === "string" ? row.sound_url.trim() || null : null;
    await patchAsset(m.assetId, fileUrl, { table: m.table, key: m.key, column: m.column });
  }

  const { data: deliveryRow } = await sb
    .from("admin_settings")
    .select("value_json")
    .eq("key", "store_delivery_alert_sound")
    .maybeSingle();
  await patchAsset(
    "DIBAY-SND-030",
    parseDeliveryUrl(deliveryRow?.value_json),
    { table: "admin_settings", key: "store_delivery_alert_sound", column: "value_json.url" }
  );

  const { data: matchRow } = await sb
    .from("admin_settings")
    .select("value_json")
    .eq("key", "order_match_chat_alert_sound")
    .maybeSingle();
  await patchAsset(
    "DIBAY-SND-031",
    parseOrderMatchUrl(matchRow?.value_json),
    { table: "admin_settings", key: "order_match_chat_alert_sound", column: "value_json" }
  );

  const { data: callRow } = await sb
    .from("admin_messenger_call_sound_settings")
    .select("*")
    .eq("id", "default")
    .maybeSingle();
  if (callRow) {
    for (const c of CALL_COLUMNS) {
      const raw = callRow[c.column];
      const fileUrl = typeof raw === "string" ? raw.trim() || null : null;
      await patchAsset(c.assetId, fileUrl, {
        table: "admin_messenger_call_sound_settings",
        key: "default",
        column: c.column,
      });
    }
  }

  console.log("[seed] done");
}

main().catch((e) => {
  console.error("[seed] failed", e);
  process.exit(1);
});

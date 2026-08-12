#!/usr/bin/env node
/**
 * D4 repeat probe — no tsx / path-alias required.
 * Mirrors scheduleNextRecurringOccurrence status gate + ensure RPC.
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const campaignId = process.argv[2];
const action = process.argv[3] || "next";

function loadEnv() {
  for (const rel of [".env.local", ".env"]) {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i < 1) continue;
      const k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim();
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

async function scheduleNext(sb, id) {
  const { data: campaign } = await sb
    .from("admin_notification_campaigns")
    .select(
      "id, title, body, type, channel, target_type, deeplink_url, web_url, push_image_url, in_app_image_url, send_mode, recurrence_kind, recurrence_time, recurrence_timezone, recurrence_start_at, recurrence_end_at, recurrence_max_count, status"
    )
    .eq("id", id)
    .maybeSingle();
  if (!campaign) return null;
  if (String(campaign.send_mode) !== "recurring" || String(campaign.status) !== "active") return null;
  if (String(campaign.recurrence_kind) === "none") return null;

  const { data: lastRows } = await sb
    .from("admin_notification_campaign_occurrences")
    .select("sequence_number, scheduled_for, completed_at")
    .eq("campaign_id", id)
    .order("sequence_number", { ascending: false })
    .limit(1);
  const last = lastRows?.[0];
  const seq = Number(last?.sequence_number ?? 0) + 1;
  const after = new Date(String(last?.completed_at ?? last?.scheduled_for ?? campaign.recurrence_start_at ?? Date.now()));
  const next = new Date(after.getTime() + 86_400_000);
  if (campaign.recurrence_end_at && next > new Date(campaign.recurrence_end_at)) return null;

  const { data, error } = await sb.rpc("ensure_admin_notification_campaign_occurrence", {
    p_campaign_id: id,
    p_sequence_number: seq,
    p_trigger_type: "recurring",
    p_scheduled_for: next.toISOString(),
    p_idempotency_key: `recurring:${id}:${seq}`,
    p_triggered_by: null,
    p_content_snapshot: {
      title: campaign.title,
      body: campaign.body,
      type: campaign.type,
      channel: campaign.channel,
    },
  });
  if (error) return null;
  return data ?? null;
}

async function main() {
  loadEnv();
  if (!campaignId) {
    console.log(JSON.stringify({ id: null, error: "missing_campaign_id" }));
    process.exit(1);
  }
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const row = await scheduleNext(sb, campaignId);
  console.log(JSON.stringify({ id: row?.id ?? null, action }));
}

main().catch((e) => {
  console.log(JSON.stringify({ id: null, error: String(e?.message || e) }));
  process.exit(1);
});

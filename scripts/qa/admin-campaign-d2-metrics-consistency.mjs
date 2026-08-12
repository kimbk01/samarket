#!/usr/bin/env node
/** D2 — List/Detail metrics consistency (READ-ONLY on existing campaigns) */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function loadEnv() {
  for (const rel of [".env.local", ".env.vercel.production", ".env"]) {
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

async function main() {
  loadEnv();
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: campaigns } = await sb
    .from("admin_notification_campaigns")
    .select("id, title, status, sent_count, target_count, is_qa")
    .in("status", ["sent", "partially_failed"])
    .eq("is_qa", false)
    .order("updated_at", { ascending: false })
    .limit(5);

  const results = [];
  for (const c of campaigns ?? []) {
    const cid = String(c.id);
    const { data: occRows } = await sb
      .from("admin_notification_campaign_occurrences")
      .select(
        "id, status, target_member_count, push_device_count, push_sent, push_skipped, push_failed, in_app_sent, in_app_member_count, in_app_failed"
      )
      .eq("campaign_id", cid)
      .order("sequence_number", { ascending: false })
      .limit(1);
    const occ = occRows?.[0];
    if (!occ) {
      results.push({ cid, title: c.title, fail: "no_occurrence" });
      continue;
    }

    const { count: deliveryCount } = await sb
      .from("notification_campaign_deliveries")
      .select("*", { count: "exact", head: true })
      .eq("occurrence_id", occ.id);

    const { count: targetCount } = await sb
      .from("admin_notification_campaign_targets")
      .select("*", { count: "exact", head: true })
      .eq("occurrence_id", occ.id);

    const { count: pushDelSent } = await sb
      .from("notification_campaign_deliveries")
      .select("*", { count: "exact", head: true })
      .eq("occurrence_id", occ.id)
      .eq("channel", "push")
      .eq("status", "sent");

    const listPushSent = Number(occ.push_sent ?? 0);
    const listInAppSent = Number(occ.in_app_sent ?? 0);
    const detailTarget = Number(occ.target_member_count ?? 0);
    const inconsistentTargetZero =
      detailTarget === 0 && ((deliveryCount ?? 0) > 0 || (targetCount ?? 0) > 0);

    results.push({
      cid,
      title: c.title,
      occurrenceId: occ.id,
      list: { push_sent: listPushSent, in_app_sent: listInAppSent, push_devices: occ.push_device_count },
      detail: {
        target_members: detailTarget,
        push_sent: listPushSent,
        in_app_sent: listInAppSent,
        targets_rows: targetCount,
        deliveries_rows: deliveryCount,
        push_delivery_sent: pushDelSent,
      },
      inconsistentTargetZero,
      legacy_sent_count: c.sent_count,
    });
  }

  const fails = results.filter((r) => r.fail || r.inconsistentTargetZero);
  console.log("=== D2 METRICS CONSISTENCY ===");
  for (const r of results) {
    console.log(JSON.stringify(r));
  }
  console.log(`LIST/DETAIL CONSISTENCY: ${fails.length === 0 ? "PASS" : "FAIL"} (${fails.length} issues)`);
  fs.writeFileSync(
    path.join(ROOT, ".qa-logs/admin-campaign-d2-metrics.json"),
    JSON.stringify({ pass: fails.length === 0, results }, null, 2)
  );
  process.exit(fails.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});

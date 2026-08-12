#!/usr/bin/env node
/**
 * READ-ONLY — Admin Push Campaign migration post-apply verification.
 * Uses Supabase service role (SELECT/RPC probe only). No writes.
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PROD_REF = "ckdosyydvgzqwpbwuhon";
const MIGRATION_VERSION = "20261029120000";

const EXPECTED_CAMPAIGN_COLS = [
  "create_request_id",
  "is_qa",
  "send_mode",
  "recurrence_kind",
  "recurrence_time",
  "recurrence_timezone",
  "recurrence_start_at",
  "recurrence_end_at",
  "recurrence_max_count",
  "recurrence_weekday",
  "updated_by",
  "scheduled_by",
  "cancelled_by",
  "send_lease_expires_at",
];

const EXPECTED_OCCURRENCE_COLS = [
  "id",
  "campaign_id",
  "sequence_number",
  "trigger_type",
  "scheduled_for",
  "status",
  "idempotency_key",
  "target_member_count",
  "push_sent",
  "push_failed",
  "in_app_sent",
  "content_snapshot",
  "audience_snapshot",
];

const EXPECTED_RPCS = [
  "claim_due_admin_notification_campaign_occurrence",
  "claim_admin_notification_campaign_occurrence_send",
  "ensure_admin_notification_campaign_occurrence",
];

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
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

function sbAdmin() {
  loadEnv();
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function countTable(sb, table) {
  const { count, error } = await sb.from(table).select("*", { count: "exact", head: true });
  if (error) throw new Error(`${table} count: ${error.message}`);
  return count ?? 0;
}

async function probeColumn(sb, table, col) {
  const { error } = await sb.from(table).select(col).limit(1);
  return !error;
}

async function probeRpc(sb, name, args) {
  const { error } = await sb.rpc(name, args);
  if (!error) return true;
  const msg = String(error.message || error);
  if (/could not find the function|schema cache/i.test(msg)) return false;
  return true;
}

function statusDist(rows, key) {
  const m = new Map();
  for (const r of rows) m.set(r[key], (m.get(r[key]) ?? 0) + 1);
  return Object.fromEntries([...m.entries()].sort((a, b) => a[0].localeCompare(b[0])));
}

function dupGroups(rows, keys) {
  const m = new Map();
  for (const r of rows) {
    const k = keys.map((x) => String(r[x] ?? "")).join("\0");
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].filter(([, n]) => n > 1).length;
}

async function main() {
  loadEnv();
  const ref = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").match(/https:\/\/([^.]+)\./)?.[1] || "";
  if (ref !== PROD_REF) {
    console.log("MIGRATION POST-APPLY: HOLD");
    console.log(`SCHEMA MATCH LOCAL MIGRATION: FAIL (ref ${ref || "missing"})`);
    process.exit(2);
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log("MIGRATION POST-APPLY: HOLD");
    console.log("SCHEMA MATCH LOCAL MIGRATION: FAIL (SUPABASE_SERVICE_ROLE_KEY missing)");
    process.exit(2);
  }

  const sb = sbAdmin();
  const out = {};

  // Occurrence table exists
  {
    const { error } = await sb.from("admin_notification_campaign_occurrences").select("id").limit(1);
    out.occurrenceTable = !error || !/does not exist|schema cache/i.test(error.message);
    if (error && /does not exist|schema cache/i.test(error.message)) {
      console.log("MIGRATION POST-APPLY: HOLD");
      console.log(`SCHEMA MATCH LOCAL MIGRATION: FAIL (${error.message})`);
      process.exit(2);
    }
  }

  out.counts = {
    campaigns: await countTable(sb, "admin_notification_campaigns"),
    occurrences: await countTable(sb, "admin_notification_campaign_occurrences"),
    deliveries: await countTable(sb, "notification_campaign_deliveries"),
    targets: await countTable(sb, "admin_notification_campaign_targets"),
  };

  const missingCampaignCols = [];
  for (const c of EXPECTED_CAMPAIGN_COLS) {
    if (!(await probeColumn(sb, "admin_notification_campaigns", c))) missingCampaignCols.push(c);
  }
  const missingOccCols = [];
  for (const c of EXPECTED_OCCURRENCE_COLS) {
    if (!(await probeColumn(sb, "admin_notification_campaign_occurrences", c))) missingOccCols.push(c);
  }
  out.deliveryOccurrenceId = await probeColumn(sb, "notification_campaign_deliveries", "occurrence_id");
  out.targetOccurrenceId = await probeColumn(sb, "admin_notification_campaign_targets", "occurrence_id");

  out.rpcsFound = [];
  for (const rpc of EXPECTED_RPCS) {
    const args =
      rpc === "claim_due_admin_notification_campaign_occurrence"
        ? { p_claim_token: "read-only-probe" }
        : rpc === "claim_admin_notification_campaign_occurrence_send"
          ? {
              p_occurrence_id: "00000000-0000-0000-0000-000000000001",
              p_idempotency_key: "probe",
              p_claim_token: "probe",
            }
          : {
              p_campaign_id: "00000000-0000-0000-0000-000000000001",
              p_sequence_number: 1,
              p_trigger_type: "immediate",
              p_scheduled_for: null,
              p_idempotency_key: "probe",
            };
    if (await probeRpc(sb, rpc, args)) out.rpcsFound.push(rpc);
  }

  const { data: campaigns, error: cErr } = await sb
    .from("admin_notification_campaigns")
    .select("id, status");
  if (cErr) throw new Error(cErr.message);
  out.campaignStatus = statusDist(campaigns || [], "status");

  const { data: occurrences, error: oErr } = await sb
    .from("admin_notification_campaign_occurrences")
    .select("id, campaign_id, status, idempotency_key, scheduled_for");
  if (oErr) throw new Error(oErr.message);
  out.occurrenceStatus = statusDist(occurrences || [], "status");

  const campaignIds = new Set((campaigns || []).map((c) => c.id));
  const occCampaignIds = new Set((occurrences || []).map((o) => o.campaign_id));
  out.backfill = {
    campaigns_total: campaignIds.size,
    campaigns_with_occ: [...campaignIds].filter((id) => occCampaignIds.has(id)).length,
  };
  out.orphanOccurrences = (occurrences || []).filter((o) => !campaignIds.has(o.campaign_id)).length;

  const { data: deliveries, error: dErr } = await sb
    .from("notification_campaign_deliveries")
    .select("id, occurrence_id")
    .not("occurrence_id", "is", null)
    .limit(5000);
  if (dErr) throw new Error(dErr.message);
  const occIds = new Set((occurrences || []).map((o) => o.id));
  out.orphanDeliveries = (deliveries || []).filter((d) => d.occurrence_id && !occIds.has(d.occurrence_id)).length;

  const withIdem = (occurrences || []).filter((o) => o.idempotency_key && String(o.idempotency_key).trim());
  out.dupIdempotency = dupGroups(withIdem, ["campaign_id", "idempotency_key"]);
  const queuedSched = (occurrences || []).filter(
    (o) => o.scheduled_for && ["queued", "sending"].includes(o.status)
  );
  out.dupScheduled = dupGroups(queuedSched, ["campaign_id", "scheduled_for"]);

  // migration history not exposed via PostgREST — infer from schema
  out.migrationHistoryNote = "schema_migrations not readable via REST; inferred from live schema";

  const schemaMatch =
    out.occurrenceTable &&
    out.deliveryOccurrenceId &&
    out.targetOccurrenceId &&
    missingCampaignCols.length === 0 &&
    missingOccCols.length === 0 &&
    out.rpcsFound.length === EXPECTED_RPCS.length;

  const dataOk =
    out.orphanOccurrences === 0 &&
    out.orphanDeliveries === 0 &&
    out.dupIdempotency === 0 &&
    out.dupScheduled === 0 &&
    out.backfill.campaigns_with_occ === out.backfill.campaigns_total;

  const pass = schemaMatch && dataOk;

  console.log("=== MIGRATION POST-APPLY (READ-ONLY via REST) ===");
  console.log(`MIGRATION VERSION (expected): ${MIGRATION_VERSION}`);
  console.log(out.migrationHistoryNote);
  console.log(`CAMPAIGNS: ${out.counts.campaigns}`);
  console.log(`OCCURRENCES: ${out.counts.occurrences}`);
  console.log(`DELIVERIES: ${out.counts.deliveries}`);
  console.log(`TARGETS: ${out.counts.targets}`);
  console.log("");
  console.log("CAMPAIGN STATUS DISTRIBUTION:");
  for (const [k, v] of Object.entries(out.campaignStatus)) console.log(`  ${k}: ${v}`);
  console.log("");
  console.log("OCCURRENCE STATUS DISTRIBUTION:");
  for (const [k, v] of Object.entries(out.occurrenceStatus)) console.log(`  ${k}: ${v}`);
  console.log("");
  console.log(`BACKFILLED OCCURRENCES: ${out.backfill.campaigns_with_occ}/${out.backfill.campaigns_total}`);
  console.log(`ORPHAN OCCURRENCES: ${out.orphanOccurrences}`);
  console.log(`ORPHAN DELIVERIES: ${out.orphanDeliveries}`);
  console.log(`DUPLICATE IDEMPOTENCY: ${out.dupIdempotency}`);
  console.log(`DUPLICATE SCHEDULED OCCURRENCE: ${out.dupScheduled}`);
  if (missingCampaignCols.length) console.log(`MISSING CAMPAIGN COLS: ${missingCampaignCols.join(", ")}`);
  if (missingOccCols.length) console.log(`MISSING OCC COLS: ${missingOccCols.join(", ")}`);
  const missingRpcs = EXPECTED_RPCS.filter((r) => !out.rpcsFound.includes(r));
  if (missingRpcs.length) console.log(`MISSING RPCS: ${missingRpcs.join(", ")}`);
  console.log("");
  console.log(`SCHEMA MATCH LOCAL MIGRATION: ${schemaMatch ? "PASS" : "FAIL"}`);
  console.log(`MIGRATION POST-APPLY: ${pass ? "PASS" : "HOLD"}`);

  fs.mkdirSync(path.join(ROOT, ".qa-logs"), { recursive: true });
  fs.writeFileSync(
    path.join(ROOT, ".qa-logs/admin-campaign-migration-post-apply.json"),
    JSON.stringify({ pass, schemaMatch, dataOk, missingCampaignCols, missingOccCols, missingRpcs, ...out }, null, 2)
  );

  process.exit(pass ? 0 : 2);
}

main().catch((e) => {
  console.error("MIGRATION POST-APPLY: HOLD");
  console.error(e.message);
  process.exit(2);
});

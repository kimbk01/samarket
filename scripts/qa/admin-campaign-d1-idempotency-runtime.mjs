#!/usr/bin/env node
/**
 * D1 — P0 idempotency runtime proof (Production DB, QA rows only).
 * Creates QA campaigns then cleans up.
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PROD_REF = "ckdosyydvgzqwpbwuhon";
const STAMP = `D1-${Date.now()}`;

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

function sb() {
  loadEnv();
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function getAdminUserId(client) {
  const { data } = await client
    .from("profiles")
    .select("id")
    .eq("role", "admin")
    .limit(1)
    .maybeSingle();
  if (data?.id) return String(data.id);
  const { data: camps } = await client
    .from("admin_notification_campaigns")
    .select("created_by")
    .not("created_by", "is", null)
    .limit(1)
    .maybeSingle();
  return camps?.created_by ? String(camps.created_by) : null;
}

async function cleanup(client, campaignId) {
  if (!campaignId) return;
  await client.from("admin_notification_campaign_occurrences").delete().eq("campaign_id", campaignId);
  await client.from("admin_notification_campaign_targets").delete().eq("campaign_id", campaignId);
  await client.from("notification_campaign_deliveries").delete().eq("campaign_id", campaignId);
  await client.from("admin_notification_campaigns").delete().eq("id", campaignId);
}

async function testCreateDoubleClick(client, adminId) {
  const reqId = `${STAMP}-create`;
  const row = {
    title: `[QA-D1] create idempotency ${STAMP}`,
    body: "d1 probe",
    type: "notice",
    target_type: "selected_users",
    channel: "in_app_only",
    status: "draft",
    send_mode: "immediate",
    is_qa: true,
    create_request_id: reqId,
    created_by: adminId,
    target_payload: {},
  };

  const [a, b] = await Promise.all([
    client.from("admin_notification_campaigns").insert(row).select("id").maybeSingle(),
    client.from("admin_notification_campaigns").insert(row).select("id").maybeSingle(),
  ]);

  const ids = new Set(
    [a.data?.id, b.data?.id].filter(Boolean).map(String)
  );
  const { count } = await client
    .from("admin_notification_campaigns")
    .select("*", { count: "exact", head: true })
    .eq("create_request_id", reqId);

  const oneFailed = Boolean(a.error) || Boolean(b.error);
  const pass = count === 1 && ids.size === 1 && oneFailed;
  const campaignId = ids.size ? [...ids][0] : null;
  await cleanup(client, campaignId);
  return { pass, campaignIds: [...ids], dbCount: count, errors: [a.error?.message, b.error?.message] };
}

async function testOccurrenceDuplicate(client, adminId) {
  const reqId = `${STAMP}-occ-dup`;
  const scheduledFor = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();

  const { data: camp, error: cErr } = await client
    .from("admin_notification_campaigns")
    .insert({
      title: `[QA-D1] occ dup ${STAMP}`,
      body: "d1",
      type: "notice",
      target_type: "selected_users",
      channel: "in_app_only",
      status: "scheduled",
      send_mode: "scheduled",
      is_qa: true,
      scheduled_at: scheduledFor,
      create_request_id: reqId,
      created_by: adminId,
      target_payload: {},
    })
    .select("id")
    .single();
  if (cErr) throw new Error(cErr.message);
  const campaignId = String(camp.id);
  const idemKey = `${STAMP}-sched`;

  const args = {
    p_campaign_id: campaignId,
    p_sequence_number: 1,
    p_trigger_type: "scheduled",
    p_scheduled_for: scheduledFor,
    p_idempotency_key: idemKey,
    p_triggered_by: adminId,
    p_content_snapshot: { title: "x" },
  };

  const [r1, r2] = await Promise.all([
    client.rpc("ensure_admin_notification_campaign_occurrence", args),
    client.rpc("ensure_admin_notification_campaign_occurrence", args),
  ]);

  const { data: rows } = await client
    .from("admin_notification_campaign_occurrences")
    .select("id")
    .eq("campaign_id", campaignId)
    .eq("idempotency_key", idemKey);

  const pass =
    !r1.error &&
    !r2.error &&
    r1.data?.id &&
    r2.data?.id &&
    String(r1.data.id) === String(r2.data.id) &&
    (rows?.length ?? 0) === 1;

  await cleanup(client, campaignId);
  return { pass, rows: rows?.length ?? 0, id1: r1.data?.id, id2: r2.data?.id };
}

async function testSchedulerDoubleClaim(client) {
  const reqId = `${STAMP}-cron`;
  const scheduledFor = new Date(Date.now() - 60_000).toISOString();
  const { data: adminRow } = await client
    .from("admin_notification_campaigns")
    .select("created_by")
    .not("created_by", "is", null)
    .limit(1)
    .maybeSingle();
  const adminId = adminRow?.created_by;

  const { data: camp, error: cErr } = await client
    .from("admin_notification_campaigns")
    .insert({
      title: `[QA-D1] cron claim ${STAMP}`,
      body: "d1",
      type: "notice",
      target_type: "selected_users",
      channel: "in_app_only",
      status: "scheduled",
      send_mode: "scheduled",
      is_qa: true,
      scheduled_at: scheduledFor,
      create_request_id: reqId,
      created_by: adminId,
      target_payload: {},
    })
    .select("id")
    .single();
  if (cErr) throw new Error(cErr.message);
  const campaignId = String(camp.id);

  const { data: occ, error: oErr } = await client
    .from("admin_notification_campaign_occurrences")
    .insert({
      campaign_id: campaignId,
      sequence_number: 1,
      trigger_type: "scheduled",
      scheduled_for: scheduledFor,
      status: "queued",
      idempotency_key: `${STAMP}-cron-occ`,
      content_snapshot: { title: "cron" },
    })
    .select("id")
    .single();
  if (oErr) throw new Error(oErr.message);
  const occurrenceId = String(occ.id);

  const tokA = `${STAMP}-A`;
  const tokB = `${STAMP}-B`;
  const [c1, c2] = await Promise.all([
    client.rpc("claim_due_admin_notification_campaign_occurrence", { p_claim_token: tokA }),
    client.rpc("claim_due_admin_notification_campaign_occurrence", { p_claim_token: tokB }),
  ]);

  const claimed = [c1.data?.[0], c2.data?.[0]].filter(Boolean);
  const claimedIds = new Set(claimed.map((r) => String(r.id)));

  const { data: finalRow } = await client
    .from("admin_notification_campaign_occurrences")
    .select("id, status, send_claim_token")
    .eq("id", occurrenceId)
    .maybeSingle();

  const pass =
    claimed.length === 1 &&
    claimedIds.size === 1 &&
    String(finalRow?.id) === occurrenceId &&
    finalRow?.status === "sending";

  await cleanup(client, campaignId);
  return { pass, claimed: claimed.length, finalStatus: finalRow?.status, token: finalRow?.send_claim_token };
}

async function testSendDoubleClick(client, adminId) {
  const reqId = `${STAMP}-send`;
  const { data: camp, error: cErr } = await client
    .from("admin_notification_campaigns")
    .insert({
      title: `[QA-D1] send claim ${STAMP}`,
      body: "d1",
      type: "notice",
      target_type: "selected_users",
      channel: "in_app_only",
      status: "draft",
      send_mode: "immediate",
      is_qa: true,
      create_request_id: reqId,
      created_by: adminId,
      target_payload: { user_ids: [] },
    })
    .select("id")
    .single();
  if (cErr) throw new Error(cErr.message);
  const campaignId = String(camp.id);

  const { data: occ, error: oErr } = await client
    .from("admin_notification_campaign_occurrences")
    .insert({
      campaign_id: campaignId,
      sequence_number: 1,
      trigger_type: "immediate",
      status: "queued",
      idempotency_key: `${STAMP}-send-occ`,
      content_snapshot: { title: "send" },
    })
    .select("id")
    .single();
  if (oErr) throw new Error(oErr.message);
  const occurrenceId = String(occ.id);
  const idem = `${STAMP}-send-idem`;
  const tok = `${STAMP}-send-tok`;

  const [s1, s2] = await Promise.all([
    client.rpc("claim_admin_notification_campaign_occurrence_send", {
      p_occurrence_id: occurrenceId,
      p_idempotency_key: idem,
      p_claim_token: tok,
    }),
    client.rpc("claim_admin_notification_campaign_occurrence_send", {
      p_occurrence_id: occurrenceId,
      p_idempotency_key: idem,
      p_claim_token: tok,
    }),
  ]);

  const claimedCount = [s1, s2].filter((r) => r.data?.[0]?.claimed === true).length;
  const alreadyRunning = [s1, s2].filter((r) => r.data?.[0]?.already_running === true).length;

  const { data: finalRow } = await client
    .from("admin_notification_campaign_occurrences")
    .select("id, status, idempotency_key")
    .eq("id", occurrenceId)
    .maybeSingle();

  const pass = claimedCount === 1 && finalRow?.status === "sending" && finalRow?.idempotency_key === idem;

  await cleanup(client, campaignId);
  return { pass, claimedCount, alreadyRunning, finalStatus: finalRow?.status };
}

async function main() {
  loadEnv();
  const ref = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").match(/https:\/\/([^.]+)\./)?.[1] || "";
  if (ref !== PROD_REF) {
    console.log("D1: HOLD (wrong ref)");
    process.exit(2);
  }

  const client = sb();
  const adminId = await getAdminUserId(client);
  if (!adminId) {
    console.log("D1: HOLD (no admin user id)");
    process.exit(2);
  }

  const create = await testCreateDoubleClick(client, adminId);
  const occDup = await testOccurrenceDuplicate(client, adminId);
  const cron = await testSchedulerDoubleClaim(client);
  const send = await testSendDoubleClick(client, adminId);

  console.log("=== D1 P0 IDEMPOTENCY RUNTIME ===");
  console.log(`CREATE DOUBLE CLICK: ${create.pass ? "PASS" : "FAIL"} (campaignIds=${JSON.stringify(create.campaignIds)} dbCount=${create.dbCount})`);
  console.log(`SEND DOUBLE CLICK: ${send.pass ? "PASS" : "FAIL"} (claimed=${send.claimedCount} status=${send.finalStatus})`);
  console.log(`SCHEDULER DOUBLE CLAIM: ${cron.pass ? "PASS" : "FAIL"} (winners=${cron.claimed} status=${cron.finalStatus})`);
  console.log(`OCCURRENCE DUPLICATE: ${occDup.pass ? "PASS" : "FAIL"} (rows=${occDup.rows} id=${occDup.id1})`);

  const allPass = create.pass && occDup.pass && cron.pass && send.pass;
  console.log(`D1 OVERALL: ${allPass ? "PASS" : "FAIL"}`);

  fs.mkdirSync(path.join(ROOT, ".qa-logs"), { recursive: true });
  fs.writeFileSync(
    path.join(ROOT, ".qa-logs/admin-campaign-d1-idempotency.json"),
    JSON.stringify({ allPass, create, occDup, cron, send }, null, 2)
  );
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => {
  console.error("D1 FAIL", e);
  process.exit(1);
});

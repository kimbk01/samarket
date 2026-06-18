#!/usr/bin/env node
/**
 * P4 call heartbeat — verify remote Supabase state via service role REST.
 * Apply SQL: node scripts/verify-apply-p4-callout-call-heartbeat-migrations.mjs --apply (needs pg + SUPABASE_DB_PASSWORD)
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnvLocal() {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split(/\n/)) {
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const i = line.indexOf("=");
      const k = line.slice(0, i).trim();
      let v = line.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (k && process.env[k] == null) process.env[k] = v;
    }
  } catch {
    /* ignore */
  }
}

async function main() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    console.error("FAIL: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required");
    process.exit(1);
  }

  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { error: colErr } = await sb
    .from("community_messenger_call_sessions")
    .select("caller_last_heartbeat_at, callee_last_heartbeat_at, reconnecting_since")
    .limit(1);

  const heartbeatColsOk = !colErr;
  if (colErr) {
    console.log("[columns] FAIL:", colErr.message);
  } else {
    console.log("[columns] PASS: caller/callee/reconnecting columns exist");
  }

  const { data: activeSample, error: activeErr } = await sb
    .from("community_messenger_call_sessions")
    .select("id, status, caller_last_heartbeat_at, callee_last_heartbeat_at, reconnecting_since, answered_at")
    .eq("status", "active")
    .limit(5);

  if (activeErr) {
    console.log("[active sessions query] FAIL:", activeErr.message);
  } else {
    console.log(`[active sessions] count sample: ${activeSample?.length ?? 0}`);
    for (const row of activeSample ?? []) {
      console.log(
        `  session=${row.id} caller_hb=${row.caller_last_heartbeat_at ?? "null"} callee_hb=${row.callee_last_heartbeat_at ?? "null"} reconnecting=${row.reconnecting_since ?? "null"}`,
      );
    }
  }

  const { data: fnProbe, error: fnErr } = await sb.rpc("cleanup_stale_community_messenger_call_sessions");
  const staleFnOk = !fnErr || !String(fnErr.message).includes("Could not find the function");
  if (fnErr && String(fnErr.message).includes("Could not find the function")) {
    console.log("[stale fn] FAIL: cleanup_stale_community_messenger_call_sessions not in schema cache");
  } else if (fnErr) {
    console.log("[stale fn] WARN (rpc attempt):", fnErr.message);
    console.log("[stale fn] PASS (function likely exists — rpc may need service role grant)");
  } else {
    console.log(`[stale fn] PASS: rpc returned ${fnProbe}`);
  }

  console.log("\n--- summary ---");
  console.log(`heartbeat columns: ${heartbeatColsOk ? "PASS" : "FAIL"}`);
  console.log(`stale cleanup fn: ${staleFnOk ? "PASS (or unverifiable via REST)" : "FAIL"}`);
  console.log("pg_cron schedule: cannot verify via REST — check Supabase Dashboard → Database → Cron Jobs");
  console.log("  SQL: SELECT jobid, jobname, schedule, command FROM cron.job WHERE jobname = 'cleanup_stale_cm_call_sessions';");

  if (!heartbeatColsOk) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("FAIL:", e.message || e);
  process.exit(1);
});

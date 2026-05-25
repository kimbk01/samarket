#!/usr/bin/env node
/**
 * Hub badge snapshot RPC deploy + runtime verify.
 * PASS only when get_owner_hub_badge_snapshot exists and returns jsonb without error.
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

function loadEnvLocal() {
  const p = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

async function main() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const dbUrl = process.env.DATABASE_URL?.trim();
  const dbPass = process.env.SUPABASE_DB_PASSWORD?.trim();

  console.log("\n=== Hub badge snapshot RPC verify ===\n");

  const applyEnvOk = Boolean(dbUrl || dbPass);
  console.log("apply_env:", applyEnvOk ? "present" : "MISSING (DATABASE_URL or SUPABASE_DB_PASSWORD)");

  if (!url || !serviceKey) {
    console.error("FAIL: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required");
    process.exit(1);
  }

  const sb = createClient(url, serviceKey, { auth: { persistSession: false } });

  // Probe RPC with nil UUID — expect jsonb object, not "function does not exist"
  const probeUserId = "00000000-0000-0000-0000-000000000001";
  const rpc0 = Date.now();
  const { data, error } = await sb.rpc("get_owner_hub_badge_snapshot", {
    p_user_id: probeUserId,
  });
  const rpcMs = Date.now() - rpc0;

  if (error) {
    const msg = error.message ?? String(error);
    console.log("rpc_probe_ms:", rpcMs);
    console.log("rpc_error:", msg);
    if (
      msg.includes("Could not find the function") ||
      msg.includes("does not exist") ||
      msg.includes("42883")
    ) {
      console.log("\nFAIL: get_owner_hub_badge_snapshot NOT deployed");
      console.log("Run: node scripts/apply-owner-hub-badge-snapshot-rpc.mjs");
      console.log("(requires DATABASE_URL or SUPABASE_DB_PASSWORD in .env.local)");
      process.exit(1);
    }
    console.log("\nFAIL: RPC error (not missing-function):", msg);
    process.exit(1);
  }

  if (!data || typeof data !== "object") {
    console.log("rpc_data:", data);
    console.log("\nFAIL: RPC returned unexpected shape");
    process.exit(1);
  }

  const d = data;
  const required = [
    "has_hub_store",
    "community_messenger_unread_room_count",
    "store_order_chat_unread",
    "refund_pending_count",
  ];
  const missing = required.filter((k) => !(k in d));
  if (missing.length) {
    console.log("\nFAIL: RPC payload missing keys:", missing.join(", "));
    process.exit(1);
  }

  // Counter table snapshot columns
  const { error: colErr } = await sb
    .from("hub_badge_user_unread_counters")
    .select(
      "has_hub_store,hub_store_id,store_order_chat_unread,refund_pending_count,order_pending_count,inquiry_pending_count"
    )
    .limit(0);

  if (colErr) {
    const msg = colErr.message ?? "";
    if (msg.includes("has_hub_store") || msg.includes("42703")) {
      console.log("\nFAIL: hub_badge_user_unread_counters snapshot columns NOT migrated");
      console.log("col_error:", msg);
      process.exit(1);
    }
    if (!msg.includes("does not exist")) {
      console.log("counter_table_warn:", msg);
    }
  } else {
    console.log("counter_columns: ok");
  }

  console.log("rpc_probe_ms:", rpcMs);
  console.log("rpc_keys:", Object.keys(d).sort().join(", "));
  console.log("\nPASS: get_owner_hub_badge_snapshot deployed and callable");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Home-sync snapshot RPC deploy + runtime verify.
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

  console.log("\n=== Home-sync snapshot RPC verify ===\n");

  const applyEnvOk = Boolean(dbUrl || dbPass);
  console.log("apply_env:", applyEnvOk ? "present" : "MISSING (DATABASE_URL or SUPABASE_DB_PASSWORD)");

  if (!url || !serviceKey) {
    console.error("FAIL: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required");
    process.exit(1);
  }

  const sb = createClient(url, serviceKey, { auth: { persistSession: false } });
  const probeUserId = "00000000-0000-0000-0000-000000000001";
  const rpc0 = Date.now();
  const { data, error } = await sb.rpc("get_community_messenger_home_sync_snapshot", {
    p_user_id: probeUserId,
    p_limit: 20,
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
      console.log("\nFAIL: get_community_messenger_home_sync_snapshot NOT deployed");
      console.log("Run: node scripts/apply-home-sync-snapshot-rpc.mjs");
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
  const hasLite = d.lite_bundle != null && typeof d.lite_bundle === "object";
  const hasHs5 = d.hs5 != null && typeof d.hs5 === "object";
  console.log("rpc_probe_ms:", rpcMs);
  console.log("lite_bundle:", hasLite ? "present" : "MISSING");
  console.log("hs5:", hasHs5 ? "present" : "MISSING");

  if (!hasLite || !hasHs5) {
    console.log("\nFAIL: snapshot columns missing");
    process.exit(1);
  }

  console.log("\nPASS: get_community_messenger_home_sync_snapshot deployed and callable");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Full bootstrap snapshot RPC deploy + runtime verify (FBT1).
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

async function probeRpc(sb, tier) {
  const rpc0 = Date.now();
  const { data, error } = await sb.rpc("get_cm_bootstrap_full_snapshot", {
    p_user_id: "00000000-0000-0000-0000-000000000001",
    p_cursor: "",
    p_limit: tier === "critical" ? 30 : 500,
    p_tier: tier,
  });
  return { data, error, rpcMs: Date.now() - rpc0, tier };
}

async function main() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  console.log("\n=== FBT1 Full bootstrap snapshot RPC verify ===\n");

  if (!url || !serviceKey) {
    console.error("FAIL: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required");
    process.exit(1);
  }

  const sb = createClient(url, serviceKey, { auth: { persistSession: false } });

  for (const tier of ["critical", "full"]) {
    const { data, error, rpcMs } = await probeRpc(sb, tier);
    if (error) {
      const msg = error.message ?? String(error);
      console.log(`tier=${tier} rpc_probe_ms:`, rpcMs);
      console.log(`tier=${tier} rpc_error:`, msg);
      if (
        msg.includes("Could not find the function") ||
        msg.includes("does not exist") ||
        msg.includes("42883")
      ) {
        console.log(`\nFAIL: get_cm_bootstrap_full_snapshot NOT deployed (${tier})`);
        process.exit(1);
      }
      console.log(`\nFAIL: RPC error (${tier}):`, msg);
      process.exit(1);
    }
    console.log(`tier=${tier} rpc_probe_ms:`, rpcMs);
    console.log(`tier=${tier} rpc_ok:`, data?.ok);
    console.log(`tier=${tier} rpc_tier:`, data?.tier);
  }

  const tableProbe = await sb.from("community_messenger_bootstrap_snapshots").select("user_id").limit(1);
  if (tableProbe.error?.message?.includes("does not exist")) {
    console.log("\nFAIL: community_messenger_bootstrap_snapshots table missing");
    process.exit(1);
  }

  console.log("\nPASS: get_cm_bootstrap_full_snapshot deployed (critical + full tiers)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

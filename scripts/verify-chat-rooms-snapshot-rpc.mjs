#!/usr/bin/env node
/**
 * CR1 chat rooms snapshot RPC deploy + runtime verify.
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

  console.log("\n=== Chat rooms snapshot RPC verify ===\n");

  if (!url || !serviceKey) {
    console.error("FAIL: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required");
    process.exit(1);
  }

  const sb = createClient(url, serviceKey, { auth: { persistSession: false } });
  const probeUserId = "00000000-0000-0000-0000-000000000001";
  const rpc0 = Date.now();
  const { data, error } = await sb.rpc("get_chat_rooms_snapshot", {
    p_user_id: probeUserId,
    p_cursor: "",
    p_limit: 200,
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
      console.log("\nFAIL: get_chat_rooms_snapshot NOT deployed");
      process.exit(1);
    }
    console.log("\nFAIL: RPC error (not missing-function):", msg);
    process.exit(1);
  }

  console.log("rpc_probe_ms:", rpcMs);
  console.log("rpc_ok:", data?.ok);
  console.log("rpc_product_chats_len:", Array.isArray(data?.product_chats) ? data.product_chats.length : "n/a");
  console.log("rpc_chat_rooms_len:", Array.isArray(data?.chat_rooms) ? data.chat_rooms.length : "n/a");

  const tableProbe = await sb.from("trade_chat_rooms_snapshots").select("user_id").limit(1);
  if (tableProbe.error?.message?.includes("does not exist")) {
    console.log("\nFAIL: trade_chat_rooms_snapshots table missing");
    process.exit(1);
  }

  console.log("\nPASS: get_chat_rooms_snapshot deployed and callable");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

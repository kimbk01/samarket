/**
 * Load completedOrderCount30d for store ids — P1-B3 popular order proof helper.
 * Usage: P1_B3_STORE_IDS='["id1"]' npx tsx scripts/qa/p1-b3-store-order-counts.mts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { resolveStorePopularitySinceIso } from "../../lib/stores/store-discovery-popular-store";

function loadEnvLocal() {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split(/\n/)) {
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const i = line.indexOf("=");
      const k = line.slice(0, i).trim();
      let v = line.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
        v = v.slice(1, -1);
      if (k && process.env[k] == null) process.env[k] = v;
    }
  } catch {
    /* optional */
  }
}

loadEnvLocal();

async function main() {
  const ids = JSON.parse(process.env.P1_B3_STORE_IDS ?? "[]") as string[];
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key || ids.length === 0) {
    process.stdout.write(`${JSON.stringify({ counts: {} })}\n`);
    return;
  }
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const since = resolveStorePopularitySinceIso();
  const { data, error } = await sb.rpc("get_store_completed_order_counts", {
    p_store_ids: ids,
    p_since: since,
  });
  if (error) {
    process.stdout.write(`${JSON.stringify({ error: error.message, counts: {} })}\n`);
    return;
  }
  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    counts[String(row.store_id)] = Number(row.completed_order_count) || 0;
  }
  process.stdout.write(`${JSON.stringify({ counts })}\n`);
}

main().catch((e) => {
  process.stdout.write(`${JSON.stringify({ error: String(e), counts: {} })}\n`);
});

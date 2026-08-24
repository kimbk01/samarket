#!/usr/bin/env node
/**
 * READ-ONLY — verify Stores A migration tables exist on linked Supabase.
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
    console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required");
    process.exit(1);
  }
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const checks = [
    { table: "store_paid_ad_campaigns", column: null },
    { table: "store_coupon_campaigns", column: null },
    { table: "store_coupon_redemptions", column: null },
    { table: "store_orders", column: "coupon_campaign_id" },
  ];
  let ok = true;
  for (const c of checks) {
    const sel = c.column ? `${c.column}` : "id";
    const { error } = await sb.from(c.table).select(sel).limit(1);
    if (error) {
      ok = false;
      console.error("[FAIL]", c.table, c.column ?? "", error.message);
    } else {
      console.log("[PASS]", c.table, c.column ?? "table");
    }
  }
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

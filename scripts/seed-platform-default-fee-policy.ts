/**
 * Seed / verify Platform Default fee policy via service role (PostgREST).
 * Prefer SQL migration when DATABASE_URL available; this is the runtime apply path.
 * Usage: npx tsx scripts/seed-platform-default-fee-policy.ts
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

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
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
}

async function main() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    console.log(JSON.stringify({ ok: false, error: "missing_env" }));
    process.exit(1);
  }
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { data: existing, error: e1 } = await sb
    .from("store_fee_policies")
    .select("id, policy_name, fee_percent, is_active, is_archived, priority, updated_at")
    .is("store_id", null)
    .is("category_id", null)
    .is("topic_id", null)
    .eq("is_active", true)
    .eq("is_archived", false)
    .limit(5);

  if (e1) {
    console.log(JSON.stringify({ ok: false, error: e1.message }));
    process.exit(1);
  }

  if ((existing ?? []).length > 0) {
    console.log(
      JSON.stringify({
        ok: true,
        action: "already_present",
        rows: existing,
      })
    );
    process.exit(0);
  }

  // Preserve prior bridge effective: store_settlement_fee_bp = 0 → fee_percent 0
  const { data: inserted, error: e2 } = await sb
    .from("store_fee_policies")
    .insert({
      policy_name: "Platform Default",
      store_id: null,
      category_id: null,
      topic_id: null,
      fee_percent: 0,
      fixed_fee: 0,
      delivery_fee_mode: "none",
      delivery_fee_percent: 0,
      is_active: true,
      starts_at: null,
      ends_at: null,
      priority: 100,
      memo: "SSOT Platform Default — migrated from commerce_settings bridge (0 bp).",
      is_archived: false,
    })
    .select("id, policy_name, fee_percent, is_active, priority, created_at, updated_at")
    .maybeSingle();

  if (e2) {
    console.log(JSON.stringify({ ok: false, error: e2.message }));
    process.exit(1);
  }

  console.log(JSON.stringify({ ok: true, action: "inserted", row: inserted }, null, 2));
}

main().catch((e) => {
  console.error(String(e));
  process.exit(2);
});

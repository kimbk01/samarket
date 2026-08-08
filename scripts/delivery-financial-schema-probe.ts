/**
 * Probe live DB for Delivery Financial SSOT schema readiness.
 * Usage: npx tsx scripts/delivery-financial-schema-probe.ts
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
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

async function main() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    console.log(JSON.stringify({ ok: false, error: "missing_env" }));
    process.exit(2);
  }
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const checks: Record<string, unknown>[] = [];

  {
    const { data, error } = await sb.from("store_fee_policies").select("id, topic_id").limit(1);
    const missing = Boolean(error && /topic_id/i.test(error.message) && /does not exist|unknown/i.test(error.message));
    checks.push({
      column: "store_fee_policies.topic_id",
      applied: !missing && !error,
      error: error?.message ?? null,
      sample_has_key: data?.[0] ? Object.prototype.hasOwnProperty.call(data[0], "topic_id") : null,
    });
  }

  {
    const { data, error } = await sb
      .from("store_settlements")
      .select("id, commission_reversal_amount")
      .limit(1);
    const missing = Boolean(
      error && /commission_reversal_amount/i.test(error.message) && /does not exist|unknown/i.test(error.message)
    );
    checks.push({
      column: "store_settlements.commission_reversal_amount",
      applied: !missing && !error,
      error: error?.message ?? null,
      sample_has_key: data?.[0] ? Object.prototype.hasOwnProperty.call(data[0], "commission_reversal_amount") : null,
    });
  }

  {
    const q = sb
      .from("store_fee_policies")
      .select("id", { count: "exact", head: true })
      .is("store_id", null)
      .is("category_id", null);
    // topic null if column exists
    const withTopic = await q.is("topic_id", null);
    if (withTopic.error && /topic_id/i.test(withTopic.error.message)) {
      const legacy = await sb
        .from("store_fee_policies")
        .select("id", { count: "exact", head: true })
        .is("store_id", null)
        .is("category_id", null);
      checks.push({ default_policies_count: legacy.count, error: legacy.error?.message ?? null });
    } else {
      checks.push({ default_policies_count: withTopic.count, error: withTopic.error?.message ?? null });
    }
  }

  const allApplied = checks
    .filter((c) => typeof c.column === "string")
    .every((c) => c.applied === true);

  console.log(
    JSON.stringify(
      {
        ok: true,
        urlHost: new URL(url).host,
        MIGRATION_RUNTIME_PASS: allApplied,
        checks,
      },
      null,
      2
    )
  );
  process.exit(allApplied ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});

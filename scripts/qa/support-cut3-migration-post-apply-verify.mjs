#!/usr/bin/env node
/**
 * Post-apply DB verification — Support CUT 3.
 * Usage: node --env-file=.env.local scripts/qa/support-cut3-migration-post-apply-verify.mjs
 */
import {
  MIGRATION_VERSION,
  SUPPORT_TABLES,
  pgClient,
  tableExists,
} from "./support-cut3-lib.mjs";

async function main() {
  const client = await pgClient();
  const report = {
    phase: "POST_APPLY_VERIFY",
    at: new Date().toISOString(),
    items: {},
  };

  try {
    for (const t of SUPPORT_TABLES) {
      report.items[`table_${t}`] = (await tableExists(client, t)) ? "PASS" : "FAIL";
    }

    const { rows: chk } = await client.query(
      `SELECT pg_get_constraintdef(oid) AS def
       FROM pg_constraint WHERE conname = 'support_cases_member_no_store' LIMIT 1`
    );
    report.items.constraint_member_no_store =
      chk[0]?.def?.includes("audience") && chk[0]?.def?.includes("owner_store_id") ? "PASS" : "FAIL";

    const { rows: rls } = await client.query(
      `SELECT c.relname, c.relrowsecurity
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname = ANY($1::text[])`,
      [SUPPORT_TABLES]
    );
    report.items.rls_enabled =
      rls.length === SUPPORT_TABLES.length && rls.every((r) => r.relrowsecurity === true)
        ? "PASS"
        : "FAIL";

    const { rows: policies } = await client.query(
      `SELECT policyname, tablename FROM pg_policies
       WHERE schemaname = 'public' AND tablename = ANY($1::text[])`,
      [SUPPORT_TABLES]
    );
    report.items.policies_exist = policies.length >= 6 ? "PASS" : "FAIL";
    report.policy_count = policies.length;

    const { rows: rt } = await client.query(
      `SELECT tablename FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename IN ('support_cases', 'support_messages')`
    );
    const rtSet = new Set(rt.map((r) => r.tablename));
    report.items.realtime_support_cases = rtSet.has("support_cases") ? "PASS" : "FAIL";
    report.items.realtime_support_messages = rtSet.has("support_messages") ? "PASS" : "FAIL";

    const { rows: mig } = await client.query(
      `SELECT version FROM supabase_migrations.schema_migrations WHERE version = $1 LIMIT 1`,
      [MIGRATION_VERSION]
    );
    report.items.migration_history = mig.length > 0 ? "PASS" : "FAIL";

    const { rows: idx } = await client.query(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname = 'public' AND tablename = 'support_cases'
         AND indexname LIKE 'idx_support_cases_%'`
    );
    report.items.indexes_exist = idx.length >= 3 ? "PASS" : "FAIL";

    const failKeys = Object.entries(report.items).filter(([, v]) => v === "FAIL");
    report.ok = failKeys.length === 0;
    report.MIGRATION = report.ok ? "PASS" : "FAIL";
    report.DB_TABLES = SUPPORT_TABLES.every((t) => report.items[`table_${t}`] === "PASS")
      ? "PASS"
      : "FAIL";
    report.RLS = report.items.rls_enabled === "PASS" && report.items.policies_exist === "PASS" ? "PASS" : "FAIL";
    report.REALTIME_PUBLICATION =
      report.items.realtime_support_cases === "PASS" &&
      report.items.realtime_support_messages === "PASS"
        ? "PASS"
        : "FAIL";

    console.log(JSON.stringify(report, null, 2));
    process.exit(report.ok ? 0 : 1);
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((e) => {
  console.error(JSON.stringify({ phase: "POST_APPLY_VERIFY", ok: false, error: String(e?.message || e) }));
  process.exit(2);
});

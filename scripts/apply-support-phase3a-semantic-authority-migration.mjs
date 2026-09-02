#!/usr/bin/env node
/**
 * Apply ONLY 20261203010000_support_phase3a_semantic_authority.sql once.
 * Usage: node --env-file=.env.local scripts/apply-support-phase3a-semantic-authority-migration.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertHost,
  buildConnectionString,
  loadEnvLocal,
  pgClient,
  tableExists,
} from "./qa/support-cut3-lib.mjs";

const MIGRATION_FILE = "20261203010000_support_phase3a_semantic_authority.sql";
const MIGRATION_VERSION = "20261203010000";

function readMigrationSql() {
  const p = resolve(process.cwd(), "supabase/migrations", MIGRATION_FILE);
  if (!existsSync(p)) throw new Error(`missing_migration:${MIGRATION_FILE}`);
  return readFileSync(p, "utf8");
}

async function verify(client) {
  const { rows: cols } = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name='support_cases'
       AND column_name = ANY($1::text[])
     ORDER BY column_name`,
    [["issue_type", "initial_summary", "guidance_key", "guidance_revision", "guidance_outcome"]]
  );
  const { rows: mig } = await client.query(
    `SELECT version FROM supabase_migrations.schema_migrations WHERE version = $1 LIMIT 1`,
    [MIGRATION_VERSION]
  );
  const guidance = await tableExists(client, "support_guidance_entries");
  const { rows: rls } = await client.query(
    `SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname='public' AND c.relname='support_guidance_entries'`
  );
  const { rows: caseCount } = await client.query(
    `SELECT count(*)::int AS n FROM public.support_cases`
  );
  return {
    columns: cols.map((r) => r.column_name),
    schema_migration_row: mig.length > 0,
    guidance_table: guidance,
    guidance_rls: rls[0]?.relrowsecurity === true,
    support_cases_count: caseCount[0]?.n ?? null,
  };
}

async function main() {
  loadEnvLocal();
  const sql = readMigrationSql();
  const conn = buildConnectionString();
  if (!conn) {
    console.log(
      JSON.stringify({
        phase: "NOT_PROVEN",
        reason: "MISSING_DB_CREDENTIALS",
        need: "SUPABASE_DB_PASSWORD or DATABASE_URL",
      })
    );
    process.exit(3);
  }
  assertHost(conn);

  const client = await pgClient();
  try {
    const before = await verify(client);
    if (
      before.schema_migration_row &&
      before.guidance_table &&
      before.columns.length === 5
    ) {
      console.log(JSON.stringify({ phase: "ALREADY_APPLIED", proof: before }, null, 2));
      return;
    }

    await client.query(sql);
    try {
      await client.query(
        `INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
         VALUES ($1, $2, ARRAY[]::text[])
         ON CONFLICT DO NOTHING`,
        [MIGRATION_VERSION, MIGRATION_FILE]
      );
    } catch (e) {
      console.warn("schema_migrations insert skipped:", e?.message ?? e);
    }

    const after = await verify(client);
    console.log(
      JSON.stringify(
        {
          phase: "APPLIED",
          migration: MIGRATION_FILE,
          before,
          after,
        },
        null,
        2
      )
    );
    if (!after.guidance_table || after.columns.length < 5) {
      process.exit(2);
    }
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(JSON.stringify({ phase: "FAIL", error: String(e?.message ?? e) }));
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Apply ONLY 20261202170000_support_cases_ssot.sql to linked Production DB.
 * Usage: node --env-file=.env.local scripts/apply-support-cases-ssot-migration.mjs
 */
import {
  MIGRATION_FILE,
  MIGRATION_VERSION,
  assertHost,
  assertMigrationSqlSafe,
  buildConnectionString,
  loadEnvLocal,
  pgClient,
  readMigrationSql,
  migrationAlreadyApplied,
  tableExists,
  SUPPORT_TABLES,
} from "./qa/support-cut3-lib.mjs";

async function verify(client) {
  const tables = {};
  for (const t of SUPPORT_TABLES) {
    tables[t] = await tableExists(client, t);
  }
  const { rows: chk } = await client.query(
    `SELECT conname FROM pg_constraint WHERE conname = 'support_cases_member_no_store' LIMIT 1`
  );
  const { rows: mig } = await client.query(
    `SELECT version FROM supabase_migrations.schema_migrations WHERE version = $1 LIMIT 1`,
    [MIGRATION_VERSION]
  );
  const { rows: fn } = await client.query(
    `SELECT p.proname FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public' AND p.proname='allocate_support_public_case_no' LIMIT 1`
  );
  return {
    tables,
    constraint_member_no_store: chk.length > 0,
    schema_migration_row: mig.length > 0,
    rpc_allocate_case_no: fn.length > 0,
  };
}

async function main() {
  loadEnvLocal();
  const sql = readMigrationSql();
  assertMigrationSqlSafe(sql);

  const conn = buildConnectionString();
  if (!conn) {
    console.error(
      JSON.stringify({
        phase: "BLOCKED",
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
    if (before.schema_migration_row && SUPPORT_TABLES.every((t) => before.tables[t])) {
      console.log(JSON.stringify({ phase: "ALREADY_APPLIED", proof: before }, null, 2));
      return;
    }

    await client.query("BEGIN");
    await client.query(sql);
    let history = { recorded: false, note: null };
    try {
      await client.query(
        `INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
         VALUES ($1, $2, ARRAY[]::text[])
         ON CONFLICT DO NOTHING`,
        [MIGRATION_VERSION, MIGRATION_FILE]
      );
      history = { recorded: true, note: "version+name+statements" };
    } catch (e1) {
      try {
        await client.query(
          `INSERT INTO supabase_migrations.schema_migrations (version, name)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [MIGRATION_VERSION, MIGRATION_FILE]
        );
        history = { recorded: true, note: "version+name" };
      } catch (e2) {
        try {
          await client.query(
            `INSERT INTO supabase_migrations.schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING`,
            [MIGRATION_VERSION]
          );
          history = { recorded: true, note: "version_only" };
        } catch (e3) {
          history = {
            recorded: false,
            note: String(e3?.message || e2?.message || e1?.message).slice(0, 200),
          };
        }
      }
    }
    await client.query("COMMIT");

    const proof = await verify(client);
    const ok =
      proof.schema_migration_row &&
      proof.constraint_member_no_store &&
      SUPPORT_TABLES.every((t) => proof.tables[t]);
    console.log(
      JSON.stringify(
        {
          phase: ok ? "AFTER_SCHEMA" : "AFTER_SCHEMA_INCOMPLETE",
          migrationApply: ok ? "PASS" : "FAIL",
          history,
          proof,
          at: new Date().toISOString(),
        },
        null,
        2
      )
    );
    if (!ok) process.exit(1);
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(JSON.stringify({ phase: "FAIL", error: String(e?.message || e) }));
  process.exit(1);
});

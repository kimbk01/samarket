#!/usr/bin/env node
/**
 * READ-ONLY preflight for Support CUT 3 migration apply.
 * Usage: node --env-file=.env.local scripts/qa/support-cut3-migration-preflight.mjs
 */
import {
  MIGRATION_VERSION,
  SUPPORT_TABLES,
  assertMigrationSqlSafe,
  buildConnectionString,
  loadEnvLocal,
  pgClient,
  readMigrationSql,
  migrationAlreadyApplied,
  tableExists,
} from "./support-cut3-lib.mjs";

async function main() {
  loadEnvLocal();
  const sql = readMigrationSql();
  const checks = {};

  try {
    assertMigrationSqlSafe(sql);
    checks.destructive_sql = "PASS";
    checks.legacy_impact = "PASS";
  } catch (e) {
    checks.destructive_sql = "FAIL";
    checks.legacy_impact = "FAIL";
    checks.error = String(e?.message || e);
    console.log(JSON.stringify({ phase: "PREFLIGHT", ok: false, checks }, null, 2));
    process.exit(1);
  }

  let client;
  try {
    const conn = buildConnectionString?.() ?? null;
    if (!conn) {
      checks.migration_history_absent = "NOT_PROVEN";
      checks.duplicate_objects = "NOT_PROVEN";
      checks.db_credentials = "MISSING";
      const ok = checks.destructive_sql === "PASS" && checks.legacy_impact === "PASS";
      console.log(
        JSON.stringify(
          {
            phase: "PREFLIGHT",
            ok,
            partial: true,
            version: MIGRATION_VERSION,
            checks,
            note: "sql_only_no_pg_credentials",
            at: new Date().toISOString(),
          },
          null,
          2
        )
      );
      process.exit(ok ? 0 : 1);
    }
    client = await pgClient();
    const applied = await migrationAlreadyApplied(client);
    checks.migration_history_absent = applied ? "FAIL" : "PASS";

    const dup = {};
    for (const t of SUPPORT_TABLES) {
      dup[t] = (await tableExists(client, t)) ? "EXISTS" : "ABSENT";
    }
    checks.duplicate_objects = Object.values(dup).every((v) => v === "ABSENT") ? "PASS" : "FAIL";
    checks.duplicate_detail = dup;

    const ok =
      checks.migration_history_absent === "PASS" && checks.duplicate_objects === "PASS";
    console.log(
      JSON.stringify(
        {
          phase: "PREFLIGHT",
          ok,
          version: MIGRATION_VERSION,
          checks,
          at: new Date().toISOString(),
        },
        null,
        2
      )
    );
    process.exit(ok ? 0 : 1);
  } catch (e) {
    console.log(
      JSON.stringify(
        {
          phase: "PREFLIGHT",
          ok: false,
          checks,
          error: String(e?.message || e),
        },
        null,
        2
      )
    );
    process.exit(2);
  } finally {
    if (client) await client.end().catch(() => {});
  }
}

main();

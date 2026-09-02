#!/usr/bin/env node
/**
 * Apply ONLY 20261202180000_support_notification_event_types.sql
 * Usage: node --env-file=.env.local scripts/apply-support-notification-event-types-migration.mjs
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertHost,
  buildConnectionString,
  loadEnvLocal,
  pgClient,
  MIGRATION_VERSION as _ignore,
} from "./qa/support-cut3-lib.mjs";

const VERSION = "20261202190000";
const FILE = "20261202190000_support_notification_event_types.sql";

async function main() {
  loadEnvLocal();
  const conn = buildConnectionString();
  if (!conn) throw new Error("missing_db_credentials");
  assertHost(conn);
  const sql = readFileSync(resolve(process.cwd(), "supabase/migrations", FILE), "utf8");
  if (!sql.includes("support_admin_replied")) throw new Error("migration_content_unexpected");

  const client = await pgClient();
  try {
    const { rows } = await client.query(
      `SELECT version FROM supabase_migrations.schema_migrations WHERE version = $1 LIMIT 1`,
      [VERSION]
    );
    if (rows.length) {
      console.log(JSON.stringify({ phase: "ALREADY_APPLIED", version: VERSION }));
      return;
    }
    await client.query("BEGIN");
    await client.query(sql);
    try {
      await client.query(
        `INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
         VALUES ($1, $2, ARRAY[]::text[]) ON CONFLICT DO NOTHING`,
        [VERSION, FILE]
      );
    } catch {
      await client.query(
        `INSERT INTO supabase_migrations.schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING`,
        [VERSION]
      );
    }
    await client.query("COMMIT");
    const { rows: chk } = await client.query(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'notification_events_type_check' LIMIT 1`
    );
    const def = String(chk[0]?.def || "");
    const ok = def.includes("support_admin_replied") && def.includes("support_case_resolved");
    console.log(JSON.stringify({ phase: ok ? "AFTER_SCHEMA" : "INCOMPLETE", ok, version: VERSION }, null, 2));
    if (!ok) process.exit(1);
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch { /* ignore */ }
    throw e;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(JSON.stringify({ phase: "FAIL", error: String(e?.message || e) }));
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Apply platform-popup BC spend/refund ledger column fix ONLY.
 * Requires DATABASE_URL or SUPABASE_DB_PASSWORD in .env.local
 * Does NOT run supabase db push for unrelated migrations.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const { Client } = pg;
const MIGRATION =
  "supabase/migrations/20261203170000_platform_popup_bc_spend_ledger_column_fix.sql";
const MIGRATION_VERSION = "20261203170000";
const MIGRATION_NAME = "20261203170000_platform_popup_bc_spend_ledger_column_fix.sql";

function loadEnvLocal() {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split(/\n/)) {
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const i = line.indexOf("=");
      const k = line.slice(0, i).trim();
      const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
      if (k && process.env[k] == null) process.env[k] = v;
    }
  } catch {
    /* ignore */
  }
}

function buildConnectionString() {
  if (process.env.DATABASE_URL?.trim()) return process.env.DATABASE_URL.trim();
  const pass = process.env.SUPABASE_DB_PASSWORD?.trim();
  if (!pass) return null;
  const pooler =
    process.env.SUPABASE_POOLER_URL?.trim() ||
    "postgresql://postgres.ckdosyydvgzqwpbwuhon@aws-1-ap-south-1.pooler.supabase.com:5432/postgres";
  const u = new URL(pooler.replace(/^postgresql:\/\//, "http://"));
  u.password = encodeURIComponent(pass);
  if (!u.username) u.username = "postgres.ckdosyydvgzqwpbwuhon";
  return `postgresql://${u.username}:${u.password}@${u.hostname}:${u.port || 5432}${u.pathname}`;
}

async function main() {
  loadEnvLocal();
  const cs = buildConnectionString();
  if (!cs) {
    console.error("SUPABASE_DB_PASSWORD or DATABASE_URL required (.env.local)");
    process.exit(2);
  }
  const sql = readFileSync(resolve(process.cwd(), MIGRATION), "utf8");
  const client = new Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(sql);
    const probe = await client.query(`
      SELECT pg_get_functiondef('public.business_cash_delivery_ad_spend(uuid,uuid,uuid,text,bigint)'::regprocedure) AS def
    `);
    const def = String(probe.rows[0]?.def || "");
    const ok =
      def.includes("entry_kind") &&
      !def.includes("entry_type") &&
      def.includes("platform_popup");
    if (ok) {
      await client.query(
        `
        INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
        VALUES ($1, $2, ARRAY[]::text[])
        ON CONFLICT (version) DO UPDATE
        SET name = EXCLUDED.name
        `,
        [MIGRATION_VERSION, MIGRATION_NAME]
      );
    }
    const history = await client.query(
      `SELECT version, name FROM supabase_migrations.schema_migrations WHERE version = $1`,
      [MIGRATION_VERSION]
    );
    console.log(
      JSON.stringify(
        {
          ok,
          migration: MIGRATION,
          hasEntryKind: def.includes("entry_kind"),
          hasEntryType: def.includes("entry_type"),
          hasPlatformPopup: def.includes("platform_popup"),
          migrationHistory: history.rows[0] || null,
        },
        null,
        2
      )
    );
    process.exit(ok ? 0 : 1);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(String(e?.stack || e));
  process.exit(1);
});

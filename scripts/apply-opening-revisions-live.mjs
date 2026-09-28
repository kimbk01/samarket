#!/usr/bin/env node
/**
 * Apply ONLY Opening revisions + live_revision_id to linked Production.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const { Client } = pg;
const VERSION = "20270328130000";
const NAME = "opening_revisions_live";
const MIGRATION = `supabase/migrations/${VERSION}_${NAME}.sql`;

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

async function verifySchema(client) {
  const checks = [
    [
      "opening_revisions",
      `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='opening_revisions'`,
    ],
    [
      "opening_shows.live_revision_id",
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name='opening_shows' AND column_name='live_revision_id'`,
    ],
    [
      "opening_shows_one_live",
      `SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='opening_shows_one_live'`,
    ],
    [
      "set_opening_live",
      `SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='public' AND p.proname='set_opening_live'`,
    ],
    [
      "runtimeDisplay kind",
      `SELECT 1 FROM pg_constraint
       WHERE conrelid='public.opening_media_derivatives'::regclass
         AND conname='opening_media_derivatives_kind_check'`,
    ],
  ];
  for (const [label, sql] of checks) {
    const { rows } = await client.query(sql);
    if (!rows.length) throw new Error(`MISSING: ${label}`);
    console.log("[verify]", label, "OK");
  }
}

async function main() {
  loadEnvLocal();
  const cs = buildConnectionString();
  if (!cs) {
    console.error("SUPABASE_DB_PASSWORD or DATABASE_URL required (.env.local)");
    process.exit(2);
  }
  const client = new Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const { rows: existing } = await client.query(
    `SELECT version, name FROM supabase_migrations.schema_migrations WHERE version = $1`,
    [VERSION]
  );
  if (existing.length) {
    console.log("[skip-apply] already in ledger:", existing[0]);
  } else {
    const sql = readFileSync(resolve(process.cwd(), MIGRATION), "utf8");
    console.log("[apply]", MIGRATION);
    await client.query(sql);
    await client.query(
      `INSERT INTO supabase_migrations.schema_migrations (version, name)
       VALUES ($1, $2)
       ON CONFLICT (version) DO NOTHING`,
      [VERSION, NAME]
    );
    console.log("[ok]", MIGRATION, "ledger recorded");
  }

  await verifySchema(client);
  await client.end();
  console.log("[apply-opening-revisions-live] PASS");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

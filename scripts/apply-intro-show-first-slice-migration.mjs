/**
 * Apply ONLY 20260929120000_intro_show_first_slice to Production DB.
 * Does NOT run `supabase db push`. Does NOT apply other pending migrations.
 *
 * Usage: node --env-file=.env.local scripts/apply-intro-show-first-slice-migration.mjs
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const { Client } = pg;
const MIGRATION_FILE = "20260929120000_intro_show_first_slice.sql";
const VERSION = "20260929120000";
const EXPECTED_HOST_FRAGMENT = "ckdosyydvgzqwpbwuhon";

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

function assertApprovedSql(sql) {
  const upper = sql.toUpperCase();
  for (const bad of ["DROP TABLE", "TRUNCATE", "DELETE FROM", "DROP COLUMN"]) {
    if (upper.includes(bad)) {
      throw new Error(`MIGRATION CONTENT DIFFERS FROM APPROVED SCOPE: contains ${bad}`);
    }
  }
  for (const must of [
    "intro_show_campaigns",
    "intro_show_drafts",
    "intro_show_revisions",
    "intro_show_media",
    "intro_show_live",
    "intro_show_set_live",
    "intro-show",
  ]) {
    if (!sql.includes(must)) throw new Error(`missing required first-slice marker: ${must}`);
  }
  if (sql.includes("opening_")) {
    throw new Error("first-slice migration must not touch opening_*");
  }
}

async function verify(client) {
  const { rows } = await client.query(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name IN (
         'intro_show_campaigns',
         'intro_show_drafts',
         'intro_show_revisions',
         'intro_show_media',
         'intro_show_media_assets',
         'intro_show_live'
       )
     ORDER BY table_name`,
  );
  if (rows.length !== 6) throw new Error(`LIVE FAIL: intro_show tables=${rows.length}`);
  const { rows: live } = await client.query(`SELECT count(*)::int AS n FROM public.intro_show_live`);
  if (Number(live[0]?.n) > 1) throw new Error("LIVE FAIL: live pointer not singleton");
}

async function main() {
  loadEnvLocal();
  const conn = buildConnectionString();
  if (!conn) {
    console.error("BLOCKED: no DATABASE_URL / SUPABASE_DB_PASSWORD");
    process.exit(1);
  }
  if (!conn.includes(EXPECTED_HOST_FRAGMENT)) {
    console.error("BLOCKED: unexpected database host");
    process.exit(1);
  }
  const sql = readFileSync(resolve(process.cwd(), "supabase/migrations", MIGRATION_FILE), "utf8");
  assertApprovedSql(sql);
  const client = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const { rows: already } = await client.query(
      `SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = $1`,
      [VERSION],
    );
    if (!already.length) {
      await client.query(sql);
      await client.query(`INSERT INTO supabase_migrations.schema_migrations (version) VALUES ($1)`, [VERSION]);
    }
    await verify(client);
    console.log(JSON.stringify({ ok: true, version: VERSION, applied: already.length === 0 }));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

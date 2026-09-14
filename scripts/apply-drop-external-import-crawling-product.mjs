/**
 * PHASE A — Apply ONLY 20261230180000_drop_external_import_crawling_product.sql
 * Does NOT run `supabase db push`. Does NOT apply other pending migrations.
 *
 * Usage: node --env-file=.env.local scripts/apply-drop-external-import-crawling-product.mjs
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const { Client } = pg;
const MIGRATION_FILE = "20261230180000_drop_external_import_crawling_product.sql";
const VERSION = "20261230180000";
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
  if (!sql.includes("PHASE A: DROP exclusive External Import")) {
    throw new Error("missing PHASE A DROP marker");
  }
  if (/community_posts\s*;|drop table if exists public\.community_posts/i.test(sql)) {
    throw new Error("FORBIDDEN: must not drop community_posts");
  }
  if (/community_topics\s*;|drop table if exists public\.community_topics/i.test(sql)) {
    throw new Error("FORBIDDEN: must not drop community_topics");
  }
  if (/drop column/i.test(sql)) {
    throw new Error("FORBIDDEN: must not DROP COLUMN in this migration");
  }
}

async function inventory(client) {
  const { rows } = await client.query(`
    select
      to_regclass('public.external_sites')::text as external_sites,
      to_regclass('public.external_import_jobs')::text as external_import_jobs,
      to_regclass('public.external_publish_links')::text as external_publish_links,
      to_regclass('public.external_board_sources')::text as external_board_sources,
      to_regclass('public.community_crawl_sources')::text as community_crawl_sources,
      to_regclass('public.board_import_sources')::text as board_import_sources
  `);
  const { rows: fns } = await client.query(`
    select p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (
        p.proname like 'claim_external_import%'
        or p.proname like 'community_crawl_%'
        or p.proname like 'board_import_%'
      )
    order by 1
  `);
  return { tables: rows[0], functions: fns.map((r) => r.proname) };
}

async function main() {
  loadEnvLocal();
  const conn = buildConnectionString();
  if (!conn) {
    console.error("BLOCKED: no DATABASE_URL / SUPABASE_DB_PASSWORD");
    process.exit(1);
  }
  if (!conn.includes(EXPECTED_HOST_FRAGMENT)) {
    console.error("BLOCKED: unexpected DB host");
    process.exit(1);
  }

  const sqlPath = resolve(process.cwd(), "supabase/migrations", MIGRATION_FILE);
  const sql = readFileSync(sqlPath, "utf8");
  assertApprovedSql(sql);

  const client = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const before = await inventory(client);
    console.log(JSON.stringify({ phase: "before", ...before }, null, 2));

    await client.query("begin");
    await client.query(sql);
    await client.query(
      `insert into supabase_migrations.schema_migrations (version)
       values ($1)
       on conflict (version) do nothing`,
      [VERSION],
    );
    await client.query("commit");

    const after = await inventory(client);
    console.log(JSON.stringify({ phase: "after", ...after }, null, 2));

    const still =
      after.tables.external_sites ||
      after.tables.external_import_jobs ||
      after.tables.external_publish_links ||
      after.tables.external_board_sources ||
      after.tables.community_crawl_sources ||
      after.tables.board_import_sources ||
      after.functions.length > 0;
    if (still) {
      console.error("LIVE FAIL: some exclusive External Import objects remain");
      process.exit(1);
    }
    console.log(JSON.stringify({ ok: true, version: VERSION, file: MIGRATION_FILE }, null, 2));
  } catch (e) {
    try {
      await client.query("rollback");
    } catch {
      /* ignore */
    }
    console.error(e);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();

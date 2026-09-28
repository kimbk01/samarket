#!/usr/bin/env node
/**
 * Apply ONLY Opening Show CUT 1A migration to linked Production.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const { Client } = pg;
const VERSION = "20270328100000";
const NAME = "opening_show_cut1a";
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
      "opening_shows",
      `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='opening_shows'`,
    ],
    [
      "opening_drafts",
      `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='opening_drafts'`,
    ],
    [
      "opening_media",
      `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='opening_media'`,
    ],
    [
      "opening_media_derivatives",
      `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='opening_media_derivatives'`,
    ],
    [
      "opening_revisions_absent",
      `SELECT 1 WHERE NOT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema='public' AND table_name='opening_revisions'
       )`,
    ],
    [
      "bucket opening-show-media",
      `SELECT 1 FROM storage.buckets WHERE id='opening-show-media'`,
    ],
  ];
  for (const [label, sql] of checks) {
    const { rows } = await client.query(sql);
    if (!rows.length) throw new Error(`MISSING: ${label}`);
    console.log("[verify]", label, "OK");
  }

  const { rows: bucket } = await client.query(
    `SELECT id, public, file_size_limit, allowed_mime_types
     FROM storage.buckets WHERE id='opening-show-media'`
  );
  console.log("[verify] bucket:", JSON.stringify(bucket[0]));
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
    try {
      await client.query(sql);
      await client.query(
        `INSERT INTO supabase_migrations.schema_migrations (version, name)
         VALUES ($1, $2)
         ON CONFLICT (version) DO NOTHING`,
        [VERSION, NAME]
      );
      console.log("[ok]", MIGRATION, "ledger recorded");
    } catch (e) {
      throw e;
    }
  }

  await verifySchema(client);
  await client.end();
  console.log("[apply-opening-show-cut1a] PASS");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

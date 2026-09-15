#!/usr/bin/env node
/**
 * Apply ONLY 20261230230000_community_post_view_unique_forever.sql
 * Usage: node --env-file=.env.local scripts/apply-community-post-view-unique-forever-migration.mjs
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const { Client } = pg;
const MIGRATION_FILE = "20261230230000_community_post_view_unique_forever.sql";
const VERSION = "20261230230000";
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

  const sql = readFileSync(resolve(process.cwd(), "supabase/migrations", MIGRATION_FILE), "utf8");
  const client = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const idx = await client.query(
      `select 1 as ok from pg_indexes
       where schemaname='public' and indexname='community_post_views_post_user_unique'`,
    );
    const fn = await client.query(
      `select pg_get_functiondef('public.record_community_post_view(uuid,uuid,text)'::regprocedure) as def`,
    );
    const def = String(fn.rows[0]?.def || "");
    const alreadyForever = idx.rowCount > 0 && def.includes("ON CONFLICT") && !def.includes("interval '24 hours'");
    if (alreadyForever) {
      console.log(JSON.stringify({ ok: true, already: true, index: "community_post_views_post_user_unique" }));
      return;
    }

    await client.query("begin");
    await client.query(sql);
    try {
      await client.query(
        `insert into supabase_migrations.schema_migrations(version) values ($1) on conflict do nothing`,
        [VERSION],
      );
    } catch {
      /* ignore ledger shape */
    }
    await client.query("commit");

    const checkIdx = await client.query(
      `select 1 as ok from pg_indexes
       where schemaname='public' and indexname='community_post_views_post_user_unique'`,
    );
    const checkFn = await client.query(
      `select pg_get_functiondef('public.record_community_post_view(uuid,uuid,text)'::regprocedure) as def`,
    );
    const checkDef = String(checkFn.rows[0]?.def || "");
    console.log(
      JSON.stringify({
        ok: checkIdx.rowCount > 0 && checkDef.includes("ON CONFLICT") && !checkDef.includes("interval '24 hours'"),
        applied: true,
        version: VERSION,
        hasUserUnique: checkIdx.rowCount > 0,
        hasOnConflict: checkDef.includes("ON CONFLICT"),
        dropped24h: !checkDef.includes("interval '24 hours'"),
      }),
    );
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

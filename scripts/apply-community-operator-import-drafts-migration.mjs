#!/usr/bin/env node
/**
 * Apply ONLY 20261230190000_community_operator_import_drafts.sql
 * Usage: node --env-file=.env.local scripts/apply-community-operator-import-drafts-migration.mjs
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const { Client } = pg;
const MIGRATION_FILE = "20261230190000_community_operator_import_drafts.sql";
const VERSION = "20261230190000";
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
    const { rows } = await client.query(
      `select to_regclass('public.community_operator_import_drafts')::text as t`,
    );
    if (rows[0]?.t) {
      console.log(JSON.stringify({ ok: true, already: true, table: rows[0].t }));
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
      /* ignore migration ledger shape differences */
    }
    await client.query("commit");
    const check = await client.query(
      `select to_regclass('public.community_operator_import_drafts')::text as t`,
    );
    console.log(JSON.stringify({ ok: true, applied: true, version: VERSION, table: check.rows[0]?.t }));
  } catch (e) {
    await client.query("rollback").catch(() => {});
    console.error(e);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();

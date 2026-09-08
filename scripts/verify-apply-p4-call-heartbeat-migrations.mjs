#!/usr/bin/env node
/**
 * P4 call heartbeat migrations — verify + idempotent apply.
 * - 20260618140000_community_messenger_call_heartbeat.sql
 * - 20260618150000_community_messenger_call_stale_cron.sql
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const { Client } = pg;

const MIGRATIONS = [
  "20260618140000_community_messenger_call_heartbeat.sql",
  "20260618150000_community_messenger_call_stale_cron.sql",
];

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

async function verifyState(client) {
  const { rows } = await client.query(`
    SELECT
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'community_messenger_call_sessions'
          AND column_name = 'caller_last_heartbeat_at'
      ) AS caller_hb_col,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'community_messenger_call_sessions'
          AND column_name = 'callee_last_heartbeat_at'
      ) AS callee_hb_col,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'community_messenger_call_sessions'
          AND column_name = 'reconnecting_since'
      ) AS reconnecting_col,
      EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname = 'community_messenger_call_sessions_active_heartbeat_idx'
      ) AS heartbeat_idx,
      EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'cleanup_stale_community_messenger_call_sessions'
      ) AS stale_fn,
      EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') AS pg_cron_ext,
      (
        SELECT COUNT(*)::int FROM cron.job
        WHERE jobname = 'cleanup_stale_cm_call_sessions'
      ) AS stale_cron_jobs
  `);
  return rows[0];
}

async function applyMigration(client, filename) {
  const sql = readFileSync(resolve(process.cwd(), "supabase/migrations", filename), "utf8");
  await client.query(sql);
  console.log(`  applied: ${filename}`);
}

async function main() {
  loadEnvLocal();
  const apply = process.argv.includes("--apply");
  const cs = buildConnectionString();
  if (!cs) {
    console.error(
      "FAIL: set DATABASE_URL or SUPABASE_DB_PASSWORD in .env.local (or env) for Postgres verify/apply",
    );
    process.exit(1);
  }

  const client = new Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    let state = await verifyState(client);
    console.log("[P4 migration verify] before:", JSON.stringify(state, null, 2));

    const needsApply =
      !state.caller_hb_col ||
      !state.callee_hb_col ||
      !state.reconnecting_col ||
      !state.stale_fn;

    if (needsApply && apply) {
      console.log("[P4 migration apply] applying missing migrations…");
      for (const f of MIGRATIONS) {
        await applyMigration(client, f);
      }
      state = await verifyState(client);
      console.log("[P4 migration verify] after apply:", JSON.stringify(state, null, 2));
    }

    const pass =
      state.caller_hb_col &&
      state.callee_hb_col &&
      state.reconnecting_col &&
      state.stale_fn;

    if (!pass) {
      console.error("FAIL: P4 heartbeat migrations not fully applied. Re-run with --apply");
      process.exit(1);
    }

    if (state.pg_cron_ext && state.stale_cron_jobs < 1) {
      console.warn("WARN: pg_cron ext present but cleanup_stale_cm_call_sessions job not registered");
    } else if (!state.pg_cron_ext) {
      console.warn("WARN: pg_cron extension not installed — use POST stale-cleanup API + CRON_SECRET");
    } else {
      console.log("OK: pg_cron job cleanup_stale_cm_call_sessions registered");
    }

    console.log("PASS: P4 heartbeat migration state verified");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("FAIL:", err.message || err);
  process.exit(1);
});

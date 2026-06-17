#!/usr/bin/env node
/**
 * Verify + idempotent apply CM social relations batch:
 * - 20260918120000_user_social_relations_cm.sql
 * - 20260918130000_cm_bootstrap_social_relations.sql
 * - 20260918140000_community_messenger_peer_notices.sql
 * - 20260918150000_community_messenger_participant_block_hide.sql
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const { Client } = pg;

const MIGRATIONS = [
  "20260918120000_user_social_relations_cm.sql",
  "20260918130000_cm_bootstrap_social_relations.sql",
  "20260918140000_community_messenger_peer_notices.sql",
  "20260918150000_community_messenger_participant_block_hide.sql",
];

function loadEnvLocal() {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split(/\n/)) {
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const i = line.indexOf("=");
      const k = line.slice(0, i).trim();
      const v = line.slice(i + 1).trim();
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
  const checks = await client.query(`
    SELECT
      EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'user_social_relations'
      ) AS user_social_relations_table,
      EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'community_messenger_peer_notices'
      ) AS peer_notices_table,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'community_messenger_participants'
          AND column_name = 'blocked_hidden_at'
      ) AS participant_blocked_hidden_col,
      EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'get_cm_bootstrap_full_snapshot'
          AND pg_get_functiondef(p.oid) ILIKE '%user_social_relations%'
      ) AS bootstrap_uses_social_relations,
      EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'get_cm_bootstrap_full_snapshot'
          AND pg_get_functiondef(p.oid) ILIKE '%friend_requests%'
          AND pg_get_functiondef(p.oid) ILIKE '%[]%jsonb%'
      ) AS bootstrap_empty_friend_requests
  `);
  return checks.rows[0];
}

function allVerified(row) {
  return (
    row.user_social_relations_table &&
    row.peer_notices_table &&
    row.participant_blocked_hidden_col &&
    row.bootstrap_uses_social_relations &&
    row.bootstrap_empty_friend_requests
  );
}

async function applyMigration(client, fileName) {
  const sql = readFileSync(resolve(process.cwd(), "supabase/migrations", fileName), "utf8");
  console.log(`[apply] ${fileName} ...`);
  await client.query(sql);
  console.log(`[apply] ${fileName} ok`);
}

async function main() {
  loadEnvLocal();
  const cs = buildConnectionString();
  if (!cs) {
    console.error("SUPABASE_DB_PASSWORD or DATABASE_URL required (.env.local)");
    process.exit(1);
  }

  const client = new Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const before = await verifyState(client);
  console.log("[verify:before]", before);

  if (allVerified(before)) {
    console.log("[apply-cm-social-relations-migrations] all checks passed — skip apply");
    await client.end();
    return;
  }

  for (const file of MIGRATIONS) {
    await applyMigration(client, file);
  }

  const after = await verifyState(client);
  console.log("[verify:after]", after);

  await client.end();

  if (!allVerified(after)) {
    console.error("[apply-cm-social-relations-migrations] FAIL — verification incomplete");
    process.exit(1);
  }
  console.log("[apply-cm-social-relations-migrations] ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

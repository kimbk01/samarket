#!/usr/bin/env node
/**
 * Apply friendship SSOT migrations:
 * - 20260918170000_community_messenger_friendships.sql
 * - 20260918180000_community_messenger_friendships_backfill.sql
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const { Client } = pg;

const MIGRATIONS = [
  "20260918170000_community_messenger_friendships.sql",
  "20260918180000_community_messenger_friendships_backfill.sql",
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

async function main() {
  loadEnvLocal();
  const cs = buildConnectionString();
  if (!cs) {
    console.error("SUPABASE_DB_PASSWORD or DATABASE_URL 필요 (.env.local)");
    process.exit(1);
  }
  const client = new Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
  await client.connect();
  for (const file of MIGRATIONS) {
    const sql = readFileSync(resolve(process.cwd(), "supabase/migrations", file), "utf8");
    console.info(`[apply-friendships] applying ${file} ...`);
    await client.query(sql);
    console.info(`[apply-friendships] ok ${file}`);
  }
  await client.end();
  console.log("[apply-community-messenger-friendships-migration] all ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

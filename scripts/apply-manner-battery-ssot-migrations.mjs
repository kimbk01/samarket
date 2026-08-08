#!/usr/bin/env node
/**
 * Apply Manner Battery SSOT migrations to Production (additive only).
 * Order: 120000 schema → 130000 backfill
 * Requires DATABASE_URL or SUPABASE_DB_PASSWORD in env / .env.local
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const { Client } = pg;

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
  const cs = buildConnectionString();
  if (!cs) {
    console.error("SUPABASE_DB_PASSWORD or DATABASE_URL required (session env or .env.local)");
    process.exit(2);
  }
  const files = [
    "supabase/migrations/20260808145000_manner_battery_trust_ssot.sql",
    "supabase/migrations/20260808145100_manner_battery_trust_events_backfill.sql",
  ];
  const client = new Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    for (const f of files) {
      const sql = readFileSync(resolve(process.cwd(), f), "utf8");
      console.log("[apply]", f);
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("COMMIT");
        console.log("[ok]", f);
      } catch (e) {
        await client.query("ROLLBACK");
        console.error("[FAIL]", f, e.message);
        throw e;
      }
    }
  } finally {
    await client.end();
  }
  console.log("[apply-manner-battery-ssot-migrations] ok");
}

main().catch(() => process.exit(1));

#!/usr/bin/env node
/**
 * Apply additive Delivery Financial SSOT migrations (topic_id + commission_reversal).
 * Requires DATABASE_URL or SUPABASE_DB_PASSWORD in .env.local
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
  const files = [
    "supabase/migrations/20261025120000_store_fee_policies_topic_id.sql",
    "supabase/migrations/20261025130000_store_settlements_commission_reversal.sql",
    "supabase/migrations/20261025140000_store_fee_policies_platform_default.sql",
  ];
  const client = new Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
  await client.connect();
  for (const f of files) {
    const sql = readFileSync(resolve(process.cwd(), f), "utf8");
    console.log("[apply]", f);
    await client.query(sql);
    console.log("[ok]", f);
  }
  await client.end();
  console.log("[apply-delivery-financial-ssot-migrations] ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

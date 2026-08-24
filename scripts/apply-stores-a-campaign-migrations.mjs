#!/usr/bin/env node
/**
 * Apply Stores A paid ad + coupon campaign migrations.
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

async function verifyTables(client) {
  const tables = ["store_paid_ad_campaigns", "store_coupon_campaigns", "store_coupon_redemptions"];
  for (const table of tables) {
    const { rows } = await client.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
      [table]
    );
    if (!rows.length) throw new Error(`missing table: ${table}`);
    console.log("[verify] table ok:", table);
  }
  const { rows: col } = await client.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'store_orders' AND column_name = 'coupon_campaign_id'`
  );
  if (!col.length) throw new Error("missing column: store_orders.coupon_campaign_id");
  console.log("[verify] column ok: store_orders.coupon_campaign_id");
}

async function main() {
  loadEnvLocal();
  const cs = buildConnectionString();
  if (!cs) {
    console.error("SUPABASE_DB_PASSWORD or DATABASE_URL 필요 (.env.local)");
    process.exit(1);
  }
  const files = [
    "supabase/migrations/20260824150000_store_paid_ad_coupon_campaigns.sql",
    "supabase/migrations/20260824160000_store_coupon_redemptions.sql",
  ];
  const client = new Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
  await client.connect();
  for (const f of files) {
    const sql = readFileSync(resolve(process.cwd(), f), "utf8");
    console.log("[apply]", f);
    await client.query(sql);
    console.log("[ok]", f);
  }
  await verifyTables(client);
  await client.end();
  console.log("[apply-stores-a-campaign-migrations] ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

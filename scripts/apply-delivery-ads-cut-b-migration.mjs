#!/usr/bin/env node
/**
 * Apply Delivery Ads CUT B SSOT migration.
 * Requires DATABASE_URL or SUPABASE_DB_PASSWORD in .env.local
 * Does NOT run supabase db push for unrelated migrations.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const { Client } = pg;

const MIGRATION = "supabase/migrations/20261201120000_delivery_ads_cut_b_ssot.sql";

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

async function verify(client) {
  const tables = [
    "delivery_ad_products",
    "delivery_ad_inventories",
    "delivery_ad_creatives",
    "delivery_store_sponsored_campaign_inventories",
    "delivery_banner_campaign_inventories",
    "delivery_ad_audit_logs",
  ];
  for (const table of tables) {
    const { rows } = await client.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
      [table]
    );
    if (!rows.length) throw new Error(`missing table: ${table}`);
    console.log("[verify] table ok:", table);
  }
  for (const col of ["lifecycle_status", "review_status", "product_key"]) {
    const { rows } = await client.query(
      `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'store_paid_ad_campaigns' AND column_name = $1`,
      [col]
    );
    if (!rows.length) throw new Error(`missing store_paid_ad_campaigns.${col}`);
  }
  for (const col of ["lifecycle_status", "creative_id", "store_id"]) {
    const { rows } = await client.query(
      `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'store_banner_ad_campaigns' AND column_name = $1`,
      [col]
    );
    if (!rows.length) throw new Error(`missing store_banner_ad_campaigns.${col}`);
  }
  const { rows: products } = await client.query(
    `SELECT key FROM public.delivery_ad_products ORDER BY key`
  );
  console.log(
    "[verify] products:",
    products.map((r) => r.key).join(",")
  );
  const { rows: activeInv } = await client.query(
    `SELECT key FROM public.delivery_ad_inventories WHERE is_active = true ORDER BY key`
  );
  console.log(
    "[verify] active inventories:",
    activeInv.map((r) => r.key).join(",")
  );
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
  const sql = readFileSync(resolve(process.cwd(), MIGRATION), "utf8");
  console.log("[apply]", MIGRATION);
  await client.query(sql);
  console.log("[ok]", MIGRATION);
  await verify(client);
  await client.end();
  console.log("[apply-delivery-ads-cut-b-migration] ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

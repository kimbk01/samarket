#!/usr/bin/env node
/**
 * Apply FREE COUPON v3.2 authority/lifecycle migration.
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

async function verify(client) {
  const { rows: issuer } = await client.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'store_coupon_campaigns' AND column_name = 'issuer_role'`
  );
  if (!issuer.length) throw new Error("missing column: store_coupon_campaigns.issuer_role");
  const { rows: num } = await client.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'coupon_user_entitlements' AND column_name = 'coupon_number'`
  );
  if (!num.length) throw new Error("missing column: coupon_user_entitlements.coupon_number");
  const { rows: fn } = await client.query(
    `SELECT 1 FROM pg_proc WHERE proname = 'reconcile_coupon_campaign_issued'`
  );
  if (!fn.length) throw new Error("missing function: reconcile_coupon_campaign_issued");
  console.log("[verify] v3.2 columns + reconcile RPC ok");
}

async function main() {
  loadEnvLocal();
  const cs = buildConnectionString();
  if (!cs) {
    console.error("SUPABASE_DB_PASSWORD or DATABASE_URL 필요 (.env.local)");
    process.exit(1);
  }
  const file = "supabase/migrations/20260826180000_free_coupon_v32_authority_lifecycle.sql";
  const client = new Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const sql = readFileSync(resolve(process.cwd(), file), "utf8");
  console.log("[apply]", file);
  await client.query(sql);
  console.log("[ok]", file);
  await verify(client);
  await client.end();
  console.log("[apply-free-coupon-v32-migration] ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

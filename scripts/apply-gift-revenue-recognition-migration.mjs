#!/usr/bin/env node
/**
 * Apply gift order-completion revenue recognition migration only.
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
  const { rows: fn } = await client.query(
    `SELECT 1 FROM pg_proc WHERE proname = 'gift_certificate_recognize_revenue_for_completed_order'`
  );
  if (!fn.length) throw new Error("missing function gift_certificate_recognize_revenue_for_completed_order");
  const { rows: trg } = await client.query(
    `SELECT 1 FROM pg_trigger WHERE tgname = 'trg_store_orders_gift_revenue_recognition'`
  );
  if (!trg.length) throw new Error("missing trigger trg_store_orders_gift_revenue_recognition");
  console.log("[verify] recognition RPC + trigger ok");
}

async function main() {
  loadEnvLocal();
  const cs = buildConnectionString();
  if (!cs) {
    console.error("SUPABASE_DB_PASSWORD or DATABASE_URL required (.env.local)");
    process.exit(1);
  }
  const file = "supabase/migrations/20261128140000_gift_certificate_order_completion_revenue.sql";
  const client = new Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const sql = readFileSync(resolve(process.cwd(), file), "utf8");
  console.log("[apply]", file);
  await client.query(sql);
  console.log("[ok]", file);
  await verify(client);
  await client.end();
  console.log("[apply-gift-revenue-recognition-migration] ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

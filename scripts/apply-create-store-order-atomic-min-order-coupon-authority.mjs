/**
 * FINAL CUT — apply min_order + coupon discount authority migration to Production DB.
 * READ/WRITE: CREATE OR REPLACE FUNCTION only. No table DDL/DML on orders.
 *
 * Usage: node --env-file=.env.local scripts/apply-create-store-order-atomic-money-authority.mjs
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const { Client } = pg;
const MIGRATION_FILE =
  "supabase/migrations/20261217120000_create_store_order_atomic_min_order_coupon_authority.sql";
const VERSION = "20261217120000";
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

function assertApprovedSql(sql) {
  const upper = sql.toUpperCase();
  for (const bad of ["DROP TABLE", "TRUNCATE", "DELETE FROM", "DISABLE ROW LEVEL SECURITY"]) {
    if (upper.includes(bad)) {
      throw new Error(`MIGRATION CONTENT DIFFERS FROM APPROVED SCOPE: contains ${bad}`);
    }
  }
  for (const must of [
    "create_store_order_atomic",
    "below_min_order",
    "v_discount_auth",
    "v_items_subtotal",
    "v_delivery_fee_auth",
    "SECURITY DEFINER",
  ]) {
    if (!sql.includes(must)) throw new Error(`missing required marker: ${must}`);
  }
}

async function verify(client) {
  const { rows: src } = await client.query(
    `SELECT pg_get_functiondef(p.oid) AS def
     FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'create_store_order_atomic'
     LIMIT 1`
  );
  const def = src[0]?.def ?? "";
  if (!def.includes("below_min_order")) throw new Error("RPC missing below_min_order");
  if (!def.includes("v_discount_auth")) throw new Error("RPC missing v_discount_auth");
  if (!def.includes("v_items_subtotal")) throw new Error("RPC missing v_items_subtotal");
  if (!def.includes("v_delivery_fee_auth")) throw new Error("RPC missing v_delivery_fee_auth");
  if (def.includes("v_discount := round(coalesce((p_order->>'discount_amount')::numeric, 0))")) {
    throw new Error("RPC still assigns discount from payload as authority");
  }
  if (!def.includes("v_discount := round(v_discount_auth)")) {
    throw new Error("RPC missing authoritative discount assignment");
  }
  if (/gift_certificate_instance_redeem_fee_rate\s*\(/.test(def)) {
    throw new Error("RPC depends on unapplied gift_certificate_instance_redeem_fee_rate");
  }
  if (!/FROM public\.gift_certificate_products/.test(def)) {
    throw new Error("RPC missing live-compat gift fee from gift_certificate_products");
  }
}

loadEnvLocal();
const cs = buildConnectionString();
if (!cs || !cs.includes(EXPECTED_HOST_FRAGMENT)) {
  console.error("BLOCKED: missing/unexpected DB connection");
  process.exit(2);
}

const sql = readFileSync(resolve(process.cwd(), MIGRATION_FILE), "utf8");
assertApprovedSql(sql);

const client = new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query("BEGIN");
  await client.query(sql);
  await client.query(
    `INSERT INTO supabase_migrations.schema_migrations (version)
     VALUES ($1)
     ON CONFLICT DO NOTHING`,
    [VERSION]
  );
  await verify(client);
  await client.query("COMMIT");
  console.log(JSON.stringify({ ok: true, applied: MIGRATION_FILE, version: VERSION }));
} catch (e) {
  try {
    await client.query("ROLLBACK");
  } catch {
    /* ignore */
  }
  console.error("FAIL:", e.message || e);
  process.exit(1);
} finally {
  await client.end();
}

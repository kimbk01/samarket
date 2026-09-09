/**
 * CUT-2 — apply ONLY money-authority migration to Production DB.
 * READ/WRITE: CREATE OR REPLACE FUNCTION only. No table DDL/DML on orders.
 *
 * Usage: node --env-file=.env.local scripts/apply-create-store-order-atomic-money-authority.mjs
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const { Client } = pg;
const MIGRATION_FILE =
  "supabase/migrations/20261216120000_create_store_order_atomic_money_authority.sql";
const VERSION = "20261216120000";
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
    "store_charged_delivery_fee_php",
    "create_store_order_atomic",
    "v_items_subtotal",
    "v_delivery_fee_auth",
    "SECURITY DEFINER",
  ]) {
    if (!sql.includes(must)) throw new Error(`missing required marker: ${must}`);
  }
}

async function verify(client) {
  const { rows: feeFn } = await client.query(
    `SELECT 1 AS ok FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'store_charged_delivery_fee_php'`
  );
  if (!feeFn.length) throw new Error("store_charged_delivery_fee_php missing after apply");

  const { rows: src } = await client.query(
    `SELECT pg_get_functiondef(p.oid) AS def
     FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'create_store_order_atomic'
     LIMIT 1`
  );
  const def = src[0]?.def ?? "";
  if (!def.includes("v_items_subtotal")) throw new Error("RPC missing v_items_subtotal");
  if (!def.includes("v_delivery_fee_auth")) throw new Error("RPC missing v_delivery_fee_auth");
  if (!def.includes("store_charged_delivery_fee_php")) {
    throw new Error("RPC missing store_charged_delivery_fee_php call");
  }
  if (/v_payment_amount := coalesce\(\(p_order->>'payment_amount'\)::numeric, 0\)/.test(def)) {
    throw new Error("RPC still trusts payload payment_amount as authority");
  }
  if (/gift_certificate_instance_redeem_fee_rate\s*\(/.test(def)) {
    throw new Error("RPC depends on unapplied gift_certificate_instance_redeem_fee_rate");
  }
  if (!/FROM public\.gift_certificate_products/.test(def)) {
    throw new Error("RPC missing live-compat gift fee from gift_certificate_products");
  }

  // Fee helper parity samples vs resolveChargedDeliveryFeePhp semantics
  const samples = [
    {
      hours: { delivery_fee_mode: "self", delivery_fee_php: 50 },
      sub: 100,
      fulfillment: "local_delivery",
      expect: 50,
    },
    {
      hours: { delivery_fee_mode: "self", delivery_fee_php: 50, free_delivery_over_php: 200 },
      sub: 200,
      fulfillment: "local_delivery",
      expect: 0,
    },
    {
      hours: { delivery_fee_mode: "courier", delivery_courier_label: "Grab" },
      sub: 100,
      fulfillment: "local_delivery",
      expect: 0,
    },
    {
      hours: { delivery_fee_mode: "self", delivery_fee_php: 40 },
      sub: 100,
      fulfillment: "pickup",
      expect: 0,
    },
  ];
  for (const s of samples) {
    const { rows } = await client.query(
      `SELECT public.store_charged_delivery_fee_php($1::jsonb, $2::numeric, $3::text) AS fee`,
      [JSON.stringify(s.hours), s.sub, s.fulfillment]
    );
    const fee = Number(rows[0]?.fee);
    if (fee !== s.expect) {
      throw new Error(`fee sample mismatch: got ${fee} expect ${s.expect} for ${JSON.stringify(s)}`);
    }
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

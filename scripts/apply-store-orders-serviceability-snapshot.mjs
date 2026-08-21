/**
 * Apply store_orders serviceability snapshot columns (idempotent).
 * Requires DATABASE_URL or SUPABASE_DB_PASSWORD in env / .env.local
 *
 * Usage:
 *   node scripts/apply-store-orders-serviceability-snapshot.mjs
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const { Client } = pg;

const MIGRATION = "20261120140000_store_orders_serviceability_snapshot.sql";

const COLUMNS = [
  "checkout_store_latitude",
  "checkout_store_longitude",
  "checkout_serviceability_eligible",
  "checkout_serviceability_max_km",
  "checkout_serviceability_reason",
];

function loadEnvLocal() {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split(/\n/)) {
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const i = line.indexOf("=");
      const k = line.slice(0, i).trim();
      const v = line.slice(i + 1).trim().replace(/^"|"$/g, "");
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

async function columnPresence(client) {
  const { rows } = await client.query(
    `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'store_orders'
      AND column_name = ANY($1::text[])
    ORDER BY column_name
    `,
    [COLUMNS]
  );
  return new Set(rows.map((r) => r.column_name));
}

async function main() {
  loadEnvLocal();
  const conn = buildConnectionString();
  if (!conn) {
    console.error("FAIL: SUPABASE_DB_PASSWORD or DATABASE_URL required");
    process.exit(2);
  }

  const client = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const before = await columnPresence(client);
    console.log(
      "BEFORE:",
      COLUMNS.map((c) => `${c}=${before.has(c) ? "yes" : "NO"}`).join(" ")
    );

    const sql = readFileSync(resolve(process.cwd(), "supabase/migrations", MIGRATION), "utf8");
    await client.query(sql);

    // Record in supabase_migrations.schema_migrations if table exists (best-effort)
    try {
      await client.query(
        `INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
         VALUES ($1, $2, ARRAY[]::text[])
         ON CONFLICT DO NOTHING`,
        [MIGRATION.slice(0, 14), MIGRATION]
      );
    } catch (e) {
      console.log("schema_migrations note:", e instanceof Error ? e.message.slice(0, 120) : String(e));
    }

    const after = await columnPresence(client);
    const missing = COLUMNS.filter((c) => !after.has(c));
    console.log(
      "AFTER:",
      COLUMNS.map((c) => `${c}=${after.has(c) ? "yes" : "NO"}`).join(" ")
    );
    if (missing.length) {
      console.error("FAIL: missing columns", missing.join(","));
      process.exit(1);
    }
    console.log("PASS: serviceability snapshot columns present");
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error("FAIL:", e instanceof Error ? e.message : e);
  process.exit(1);
});

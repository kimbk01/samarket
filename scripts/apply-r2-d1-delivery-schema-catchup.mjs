/**
 * Apply store_order_deliveries schema catch-up (existing migrations only).
 *
 * Requires postgres password (Supabase Dashboard → Project Settings → Database):
 *   $env:SUPABASE_DB_PASSWORD='...'
 *   node scripts/apply-r2-d1-delivery-schema-catchup.mjs
 *
 * Or full URL:
 *   $env:DATABASE_URL='postgresql://postgres.ckdosyydvgzqwpbwuhon:PASSWORD@aws-1-ap-south-1.pooler.supabase.com:5432/postgres'
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
    console.error("Set SUPABASE_DB_PASSWORD or DATABASE_URL (Supabase → Database → Connection string).");
    process.exit(1);
  }

  const sqlPath = resolve(
    process.cwd(),
    "supabase/scripts/r2-d1-store-order-deliveries-schema-catchup.sql"
  );
  const sql = readFileSync(sqlPath, "utf8");

  const client = new Client({
    connectionString: cs,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  console.log("Connected. Applying catch-up SQL…");
  await client.query(sql);
  await client.end();
  console.log("OK — catch-up applied:", sqlPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

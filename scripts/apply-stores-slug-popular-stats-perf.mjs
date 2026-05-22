/**
 * Apply 20260822120000_stores_slug_gate_popular_stats_perf.sql
 *
 *   $env:SUPABASE_DB_PASSWORD='...'
 *   node scripts/apply-stores-slug-popular-stats-perf.mjs
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
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
        v = v.slice(1, -1);
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
    console.error("Set SUPABASE_DB_PASSWORD or DATABASE_URL in env / .env.local");
    process.exit(1);
  }

  const sqlPath = resolve(
    process.cwd(),
    "supabase/migrations/20260822120000_stores_slug_gate_popular_stats_perf.sql"
  );
  const sql = readFileSync(sqlPath, "utf8");

  const client = new Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log("Applying migration…");
  await client.query(sql);
  console.log("OK:", sqlPath);

  const idx = await client.query(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'stores' AND indexdef ILIKE '%slug%'
    ORDER BY indexname;
  `);
  console.log("\n=== stores slug indexes ===");
  for (const row of idx.rows) {
    console.log(row.indexname);
    console.log(" ", row.indexdef);
  }

  const slug = process.env.STORE_DETAIL_TEST_SLUG?.trim() || "aa11";
  const storeRow = await client.query(
    `SELECT id FROM stores WHERE slug = $1 AND approval_status = 'approved' AND is_visible = true LIMIT 1`,
    [slug]
  );
  const storeId = storeRow.rows[0]?.id;
  if (!storeId) {
    console.warn("No store for slug", slug);
    await client.end();
    return;
  }

  const explainSlug = await client.query(
    `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
     SELECT id, slug FROM stores
     WHERE slug = $1 AND approval_status = 'approved' AND is_visible = true
     LIMIT 1`,
    [slug]
  );
  console.log(`\n=== EXPLAIN stores slug='${slug}' ===`);
  for (const line of explainSlug.rows) console.log(line["QUERY PLAN"]);

  const hasSeqScan = explainSlug.rows.some((r) =>
    String(r["QUERY PLAN"]).includes("Seq Scan on stores")
  );
  console.log("\nSeq Scan on stores:", hasSeqScan ? "YES (bad)" : "NO (ok)");

  const explainRpc = await client.query(
    `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
     SELECT * FROM get_store_popular_product_stats($1::uuid, now() - interval '30 days', 5)`,
    [storeId]
  );
  console.log("\n=== EXPLAIN get_store_popular_product_stats ===");
  for (const line of explainRpc.rows) console.log(line["QUERY PLAN"]);

  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

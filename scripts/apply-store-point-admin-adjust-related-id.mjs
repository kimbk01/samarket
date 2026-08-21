/**
 * Apply Business Credit admin_adjust related_id fix (idempotent function replace).
 * Official path: migration file + DATABASE_URL / SUPABASE_DB_PASSWORD (same as other apply-*.mjs).
 *
 * Usage:
 *   node scripts/apply-store-point-admin-adjust-related-id.mjs
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const { Client } = pg;
const MIGRATION = "20261121150000_fix_store_point_admin_adjust_related_id.sql";

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

async function probe(client) {
  const idx = await client.query(
    `
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'store_point_ledger'
    ORDER BY indexname
    `
  );
  const fn = await client.query(
    `
    SELECT pg_get_functiondef(p.oid) AS def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'adjust_store_point_balance'
    LIMIT 1
    `
  );
  const def = fn.rows[0]?.def ?? "";
  return {
    indexes: idx.rows,
    relatedSpend: idx.rows.find((r) => r.indexname === "uq_store_point_ledger_related_spend") || null,
    orderFee: idx.rows.find((r) => r.indexname === "uq_store_point_ledger_order_fee") || null,
    fnUsesAdminUserAsRelatedId: /related_id[\s\S]{0,80}p_admin_user_id/i.test(def),
    fnUsesGenRandomUuid: /gen_random_uuid\(\)/i.test(def),
    fnLen: def.length,
  };
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
    const before = await probe(client);
    console.log(
      JSON.stringify(
        {
          phase: "BEFORE",
          relatedSpend: before.relatedSpend,
          orderFee: before.orderFee?.indexname ?? null,
          fnUsesAdminUserAsRelatedId: before.fnUsesAdminUserAsRelatedId,
          fnUsesGenRandomUuid: before.fnUsesGenRandomUuid,
        },
        null,
        2
      )
    );

    if (!before.relatedSpend && !before.orderFee) {
      console.warn("WARN: expected ledger unique indexes not found — still applying function fix");
    }

    const sql = readFileSync(resolve(process.cwd(), "supabase/migrations", MIGRATION), "utf8");
    await client.query(sql);

    try {
      await client.query(
        `INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
         VALUES ($1, $2, ARRAY[]::text[])
         ON CONFLICT DO NOTHING`,
        [MIGRATION.slice(0, 14), MIGRATION]
      );
    } catch (e) {
      console.log("schema_migrations note:", e instanceof Error ? e.message.slice(0, 160) : String(e));
    }

    const after = await probe(client);
    console.log(
      JSON.stringify(
        {
          phase: "AFTER",
          relatedSpend: after.relatedSpend,
          orderFee: after.orderFee?.indexname ?? null,
          fnUsesAdminUserAsRelatedId: after.fnUsesAdminUserAsRelatedId,
          fnUsesGenRandomUuid: after.fnUsesGenRandomUuid,
        },
        null,
        2
      )
    );

    if (after.fnUsesAdminUserAsRelatedId) {
      console.error("FAIL: function still binds related_id to p_admin_user_id");
      process.exit(1);
    }
    if (!after.fnUsesGenRandomUuid) {
      console.error("FAIL: function missing gen_random_uuid related_id");
      process.exit(1);
    }
    if (before.relatedSpend && !after.relatedSpend) {
      console.error("FAIL: uq_store_point_ledger_related_spend was dropped — not allowed");
      process.exit(1);
    }
    if (before.orderFee && !after.orderFee) {
      console.error("FAIL: uq_store_point_ledger_order_fee was dropped — not allowed");
      process.exit(1);
    }

    console.log("[apply-store-point-admin-adjust-related-id] ok");
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

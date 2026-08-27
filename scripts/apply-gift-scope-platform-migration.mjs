/**
 * Apply ONLY 20261128180000_gift_certificate_scope_platform to linked Production DB.
 * Does NOT run `supabase db push`. Does NOT apply other pending migrations.
 *
 * Backward-compatible with current Production Next.js (STORE-only writers):
 * - gift_scope DEFAULT/backfill STORE
 * - checkout helper treats missing scope as STORE
 * Apply BEFORE or immediately with new code deploy (new code requires columns).
 *
 * Usage: node --env-file=.env.local scripts/apply-gift-scope-platform-migration.mjs
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const { Client } = pg;
const MIGRATION_FILE = "20261128180000_gift_certificate_scope_platform.sql";
const VERSION = "20261128180000";
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
  for (const bad of ["DROP TABLE", "TRUNCATE", "DELETE FROM"]) {
    if (upper.includes(bad)) {
      throw new Error(`MIGRATION CONTENT DIFFERS FROM APPROVED SCOPE: contains ${bad}`);
    }
  }
  for (const must of [
    "gift_scope",
    "creation_source",
    "archived_at",
    "gift_certificate_instance_allows_checkout_store",
    "gift_certificate_purchase",
    "create_store_order_atomic",
    "gift_certificate_redeem",
    "ADMIN_DIRECT_PLATFORM",
  ]) {
    if (!sql.includes(must)) throw new Error(`missing ${must}`);
  }
}

async function verify(client) {
  const { rows: productCols } = await client.query(
    `SELECT column_name, is_nullable
     FROM information_schema.columns
     WHERE table_schema='public' AND table_name='gift_certificate_products'
       AND column_name IN ('gift_scope','creation_source','archived_at','store_id')`
  );
  const pmap = Object.fromEntries(productCols.map((r) => [r.column_name, r.is_nullable]));
  if (!pmap.gift_scope) throw new Error("products.gift_scope missing");
  if (!pmap.creation_source) throw new Error("products.creation_source missing");
  if (!pmap.archived_at) throw new Error("products.archived_at missing");
  if (pmap.store_id !== "YES") throw new Error("products.store_id must be nullable for PLATFORM");

  const { rows: instCols } = await client.query(
    `SELECT column_name, is_nullable
     FROM information_schema.columns
     WHERE table_schema='public' AND table_name='gift_certificate_instances'
       AND column_name IN ('gift_scope','store_id')`
  );
  const imap = Object.fromEntries(instCols.map((r) => [r.column_name, r.is_nullable]));
  if (!imap.gift_scope) throw new Error("instances.gift_scope missing");
  if (imap.store_id !== "YES") throw new Error("instances.store_id must be nullable for PLATFORM");

  const { rows: checks } = await client.query(
    `SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.gift_certificate_products'::regclass
       AND conname IN (
         'gift_certificate_products_gift_scope_chk',
         'gift_certificate_products_scope_store_chk'
       )`
  );
  if (checks.length < 2) throw new Error("product scope CHECKs missing");

  const { rows: fn } = await client.query(
    `SELECT 1 FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public' AND p.proname='gift_certificate_instance_allows_checkout_store'`
  );
  if (!fn.length) throw new Error("checkout helper missing");

  const { rows: purchaseDef } = await client.query(
    `SELECT pg_get_functiondef(p.oid) AS def
     FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public' AND p.proname='gift_certificate_purchase'
     LIMIT 1`
  );
  if (!String(purchaseDef[0]?.def || "").includes("gift_scope")) {
    throw new Error("purchase RPC missing gift_scope denorm");
  }

  const { rows: redeemDef } = await client.query(
    `SELECT pg_get_functiondef(p.oid) AS def
     FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public' AND p.proname='gift_certificate_redeem'
     LIMIT 1`
  );
  if (!String(redeemDef[0]?.def || "").includes("gift_certificate_instance_allows_checkout_store")) {
    throw new Error("redeem RPC missing scope helper");
  }

  const { rows: orderDef } = await client.query(
    `SELECT pg_get_functiondef(p.oid) AS def
     FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public' AND p.proname='create_store_order_atomic'
     LIMIT 1`
  );
  if (!String(orderDef[0]?.def || "").includes("gift_certificate_instance_allows_checkout_store")) {
    throw new Error("create_store_order_atomic missing scope helper");
  }

  return {
    products_gift_scope: true,
    products_creation_source: true,
    products_archived_at: true,
    products_store_id_nullable: true,
    instances_gift_scope: true,
    instances_store_id_nullable: true,
    purchase_rpc_scoped: true,
    redeem_rpc_scoped: true,
    order_rpc_scoped: true,
  };
}

async function main() {
  loadEnvLocal();
  const path = resolve(process.cwd(), "supabase/migrations", MIGRATION_FILE);
  const sql = readFileSync(path, "utf8");
  assertApprovedSql(sql);

  console.log(
    JSON.stringify(
      {
        phase: "PLAN",
        migrationPlan: "180000 ONLY",
        approvedMigration: MIGRATION_FILE,
        version: VERSION,
        otherMigrations: "NONE",
        compatibility:
          "backward_compatible_with_current_prod_code_STORE_default; apply_before_new_next_deploy",
      },
      null,
      2
    )
  );

  const conn = buildConnectionString();
  if (!conn) {
    console.error(
      JSON.stringify({
        phase: "BLOCKED",
        reason: "SAFE_SINGLE_MIGRATION_APPLY_PATH_MISSING_CREDENTIALS",
        need: "SUPABASE_DB_PASSWORD or DATABASE_URL in .env.local",
      })
    );
    process.exit(3);
  }

  const host = new URL(conn.replace(/^postgresql:/, "http:")).hostname;
  if (!host.includes(EXPECTED_HOST_FRAGMENT) && !conn.includes(EXPECTED_HOST_FRAGMENT)) {
    console.error(JSON.stringify({ phase: "BLOCKED", reason: "WRONG_DB_HOST", host }));
    process.exit(4);
  }

  const client = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    let already = false;
    try {
      const proof = await verify(client);
      already = true;
      console.log(JSON.stringify({ phase: "ALREADY_APPLIED", proof }, null, 2));
    } catch {
      already = false;
    }

    if (!already) {
      await client.query("BEGIN");
      await client.query(sql);
      let history = { recorded: false, note: null };
      try {
        await client.query(
          `INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
           VALUES ($1, $2, ARRAY[]::text[])
           ON CONFLICT DO NOTHING`,
          [VERSION, MIGRATION_FILE]
        );
        history = { recorded: true, note: "version+name+statements" };
      } catch (e1) {
        try {
          await client.query(
            `INSERT INTO supabase_migrations.schema_migrations (version, name)
             VALUES ($1, $2)
             ON CONFLICT DO NOTHING`,
            [VERSION, MIGRATION_FILE]
          );
          history = { recorded: true, note: "version+name" };
        } catch (e2) {
          try {
            await client.query(
              `INSERT INTO supabase_migrations.schema_migrations (version)
               VALUES ($1)
               ON CONFLICT DO NOTHING`,
              [VERSION]
            );
            history = { recorded: true, note: "version_only" };
          } catch (e3) {
            history = {
              recorded: false,
              note: String(e3?.message || e2?.message || e1?.message || e3).slice(0, 200),
            };
          }
        }
      }
      await client.query("COMMIT");
      const proof = await verify(client);
      console.log(
        JSON.stringify(
          {
            phase: "AFTER_SCHEMA",
            migrationApply: "PASS",
            otherMigrationsApplied: "NONE",
            history,
            proof,
          },
          null,
          2
        )
      );
    }
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    await client.end();
  }
  console.log("[apply-gift-scope-platform-migration] ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

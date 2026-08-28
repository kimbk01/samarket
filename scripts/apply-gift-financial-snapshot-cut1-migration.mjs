/**
 * Apply ONLY 20261129150000_gift_certificate_redeem_instance_fee_snapshot to linked Production DB.
 * Does NOT run `supabase db push`. Does NOT apply other pending migrations.
 *
 * Usage: node --env-file=.env.local scripts/apply-gift-financial-snapshot-cut1-migration.mjs
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const { Client } = pg;
const MIGRATION_FILE = "20261129150000_gift_certificate_redeem_instance_fee_snapshot.sql";
const VERSION = "20261129150000";
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
    if (upper.includes(bad)) throw new Error(`MIGRATION CONTENT DIFFERS FROM APPROVED SCOPE: contains ${bad}`);
  }
  if (sql.includes("SET platform_fee_rate_snapshot = p.platform_fee_rate")) {
    throw new Error("unsafe product fee backfill");
  }
  for (const must of [
    "gift_certificate_instance_redeem_fee_rate",
    "gift_certificate_purchase",
    "gift_certificate_redeem",
    "create_store_order_atomic",
    "legacy_fee_snapshot_unresolved",
  ]) {
    if (!sql.includes(must)) throw new Error(`missing ${must}`);
  }
}

async function verify(client) {
  const { rows: fnRows } = await client.query(
    `SELECT p.proname, pg_get_functiondef(p.oid) AS def
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public'
       AND p.proname IN (
         'gift_certificate_instance_redeem_fee_rate',
         'gift_certificate_purchase',
         'gift_certificate_redeem',
         'create_store_order_atomic'
       )`
  );
  const byName = Object.fromEntries(fnRows.map((r) => [r.proname, r.def]));
  if (!String(byName.gift_certificate_instance_redeem_fee_rate || "").includes("legacy_fee_snapshot_unresolved")) {
    throw new Error("fee authority helper missing fail-closed");
  }
  if (!String(byName.gift_certificate_redeem || "").includes("gift_certificate_instance_redeem_fee_rate")) {
    throw new Error("redeem missing fee authority helper");
  }
  if (!String(byName.create_store_order_atomic || "").includes("gift_certificate_instance_redeem_fee_rate")) {
    throw new Error("checkout missing fee authority helper");
  }
  if (!String(byName.gift_certificate_purchase || "").includes("platform_fee_rate_snapshot")) {
    throw new Error("purchase missing fee snapshot insert");
  }
  const { rows: counts } = await client.query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE platform_fee_rate_snapshot = 0)::int AS zero_snap
       FROM public.gift_certificate_instances`
  );
  return { functions: Object.keys(byName).sort(), instance_counts: counts[0] };
}

async function main() {
  loadEnvLocal();
  const path = resolve(process.cwd(), "supabase/migrations", MIGRATION_FILE);
  const sql = readFileSync(path, "utf8");
  assertApprovedSql(sql);

  const conn = buildConnectionString();
  if (!conn) {
    console.error(JSON.stringify({ phase: "BLOCKED", reason: "MISSING_DB_CREDENTIALS" }));
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
           VALUES ($1, $2, ARRAY[]::text[]) ON CONFLICT DO NOTHING`,
          [VERSION, MIGRATION_FILE]
        );
        history = { recorded: true, note: "version+name+statements" };
      } catch (e1) {
        try {
          await client.query(
            `INSERT INTO supabase_migrations.schema_migrations (version, name)
             VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [VERSION, MIGRATION_FILE]
          );
          history = { recorded: true, note: "version+name" };
        } catch (e2) {
          history = { recorded: false, note: String(e2?.message || e1?.message).slice(0, 200) };
        }
      }
      await client.query("COMMIT");
      const proof = await verify(client);
      console.log(JSON.stringify({ phase: "AFTER_SCHEMA", migrationApply: "PASS", history, proof }, null, 2));
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
  console.log("[apply-gift-financial-snapshot-cut1-migration] ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * Apply ONLY 20261128190000_gift_certificate_promo_economics to linked Production DB.
 * Does NOT run `supabase db push`. Does NOT apply other pending migrations
 * (including 20261128120000 security lint migration).
 *
 * Usage: node --env-file=.env.local scripts/apply-gift-promo-economics-migration.mjs
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const { Client } = pg;
const MIGRATION_FILE = "20261128190000_gift_certificate_promo_economics.sql";
const VERSION = "20261128190000";
const SECURITY_MIGRATION = "20261128120000";
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
    "gift_promo_obligations",
    "gift_promo_ledger",
    "gift_certificate_promo_accrue_for_instance",
    "gift_certificate_promo_recognize_for_redemption",
    "gift_certificate_promo_settle",
    "gift_certificate_promo_reverse_for_redemption",
    "purchase_discount_amount",
    "discount_funding_party_snapshot",
  ]) {
    if (!sql.includes(must)) throw new Error(`missing ${must}`);
  }
}

async function migrationHistory(client) {
  const { rows } = await client.query(
    `SELECT version, name
     FROM supabase_migrations.schema_migrations
     WHERE version IN ($1, $2, $3)
     ORDER BY version`,
    [VERSION, SECURITY_MIGRATION, "20261128180000"]
  );
  return rows;
}

async function verify(client) {
  const tables = ["gift_promo_obligations", "gift_promo_ledger"];
  for (const t of tables) {
    const { rows } = await client.query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema='public' AND table_name=$1`,
      [t]
    );
    if (!rows.length) throw new Error(`${t} missing`);
  }

  const { rows: instCols } = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name='gift_certificate_instances'
       AND column_name IN ('purchase_discount_amount','discount_funding_party_snapshot','platform_fee_rate_snapshot')`
  );
  if (instCols.length < 3) throw new Error("instance snapshot columns missing");

  const rpcs = [
    "gift_certificate_promo_accrue_for_instance",
    "gift_certificate_promo_recognize_for_redemption",
    "gift_certificate_promo_settle",
    "gift_certificate_promo_reverse_for_redemption",
  ];
  for (const rpc of rpcs) {
    const { rows } = await client.query(
      `SELECT 1 FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname='public' AND p.proname=$1`,
      [rpc]
    );
    if (!rows.length) throw new Error(`${rpc} missing`);
  }

  const { rows: purchaseDef } = await client.query(
    `SELECT pg_get_functiondef(p.oid) AS def
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public' AND p.proname='gift_certificate_purchase' LIMIT 1`
  );
  if (!String(purchaseDef[0]?.def || "").includes("gift_certificate_promo_accrue_for_instance")) {
    throw new Error("purchase RPC missing promo accrual hook");
  }

  const { rows: rls } = await client.query(
    `SELECT c.relname, c.relrowsecurity
     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname='public' AND c.relname IN ('gift_promo_obligations','gift_promo_ledger')`
  );
  if (rls.some((r) => !r.relrowsecurity)) throw new Error("RLS not enabled on promo tables");

  const { rows: grants } = await client.query(
    `SELECT p.proname, has_function_privilege('service_role', p.oid, 'EXECUTE') AS svc
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public'
       AND p.proname IN ('gift_certificate_promo_settle','gift_certificate_promo_recognize_for_redemption')`
  );
  if (grants.some((g) => !g.svc)) throw new Error("service_role EXECUTE missing on promo RPC");

  return { tables, rpcs, rls: true, serviceRoleExecute: true };
}

async function main() {
  loadEnvLocal();
  const path = resolve(process.cwd(), "supabase/migrations", MIGRATION_FILE);
  const sql = readFileSync(path, "utf8");
  assertApprovedSql(sql);

  const conn = buildConnectionString();
  if (!conn) {
    console.error(
      JSON.stringify({
        phase: "BLOCKED",
        reason: "SAFE_SINGLE_MIGRATION_APPLY_PATH_MISSING_CREDENTIALS",
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
    const historyBefore = await migrationHistory(client);
    const securityApplied = historyBefore.some((r) => String(r.version).startsWith(SECURITY_MIGRATION));

    let already = false;
    try {
      const proof = await verify(client);
      already = true;
      console.log(
        JSON.stringify(
          {
            phase: "ALREADY_APPLIED",
            migration: VERSION,
            securityMigration: securityApplied ? "APPLIED_IN_HISTORY" : "NOT_IN_HISTORY",
            history: historyBefore,
            proof,
          },
          null,
          2
        )
      );
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
             VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [VERSION, MIGRATION_FILE]
          );
          history = { recorded: true, note: "version+name" };
        } catch (e2) {
          try {
            await client.query(
              `INSERT INTO supabase_migrations.schema_migrations (version)
               VALUES ($1) ON CONFLICT DO NOTHING`,
              [VERSION]
            );
            history = { recorded: true, note: "version_only" };
          } catch (e3) {
            history = { recorded: false, note: String(e3?.message || e2?.message || e1?.message).slice(0, 200) };
          }
        }
      }
      await client.query("COMMIT");
      const proof = await verify(client);
      const historyAfter = await migrationHistory(client);
      console.log(
        JSON.stringify(
          {
            phase: "AFTER_SCHEMA",
            migrationApply: "PASS",
            migration: VERSION,
            otherMigrationsApplied: "NONE",
            securityMigration: securityApplied ? "APPLIED_IN_HISTORY" : "NOT_IN_HISTORY",
            history,
            historyAfter,
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
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * Apply ONLY 20261128170000_gift_certificate_cash_out to linked Production DB.
 * Does NOT run `supabase db push`. Does NOT apply other pending migrations.
 *
 * Usage: node --env-file=.env.local scripts/apply-gift-cash-out-migration.mjs
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const { Client } = pg;
const MIGRATION_FILE = "20261128170000_gift_certificate_cash_out.sql";
const VERSION = "20261128170000";
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
  for (const bad of ["DROP TABLE", "DROP COLUMN", "TRUNCATE", "DELETE FROM"]) {
    if (upper.includes(bad)) {
      throw new Error(`MIGRATION CONTENT DIFFERS FROM APPROVED SCOPE: contains ${bad}`);
    }
  }
  if (!sql.includes("gift_certificate_cash_out_requests")) {
    throw new Error("missing gift_certificate_cash_out_requests");
  }
  for (const fn of [
    "gift_certificate_cash_out_request",
    "gift_certificate_cash_out_cancel",
    "gift_certificate_cash_out_reject",
    "gift_certificate_cash_out_approve",
    "gift_certificate_cash_out_mark_paid",
    "gift_certificate_store_revenue_available",
  ]) {
    if (!sql.includes(fn)) throw new Error(`missing ${fn}`);
  }
  if (!sql.includes("CASH_OUT_HOLD") || !sql.includes("CASH_OUT_RELEASE") || !sql.includes("CASH_OUT_PAID")) {
    throw new Error("missing cash-out ledger entry types");
  }
}

async function verify(client) {
  const { rows: tables } = await client.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema='public' AND table_name='gift_certificate_cash_out_requests'`
  );
  if (!tables.length) throw new Error("table missing");

  const { rows: cols } = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name='gift_certificate_cash_out_requests'
     ORDER BY ordinal_position`
  );
  const colSet = new Set(cols.map((r) => r.column_name));
  for (const c of [
    "id",
    "store_id",
    "owner_user_id",
    "amount",
    "status",
    "destination_type",
    "account_number",
    "account_name",
    "idempotency_key",
    "payout_method",
    "payout_reference",
  ]) {
    if (!colSet.has(c)) throw new Error(`column missing: ${c}`);
  }

  const { rows: idxs } = await client.query(
    `SELECT indexname FROM pg_indexes
     WHERE schemaname='public' AND tablename='gift_certificate_cash_out_requests'`
  );
  const idxNames = idxs.map((r) => r.indexname);
  if (!idxNames.some((n) => n.includes("store"))) throw new Error("store index missing");
  if (!idxNames.some((n) => n.includes("idempotency") || n.includes("pkey"))) {
    /* idempotency is UNIQUE constraint — check constraints */
  }

  const { rows: cons } = await client.query(
    `SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.gift_certificate_cash_out_requests'::regclass`
  );
  const conNames = cons.map((r) => r.conname);
  if (!conNames.some((n) => n.includes("idempotency"))) throw new Error("idempotency constraint missing");

  const { rows: rls } = await client.query(
    `SELECT relrowsecurity FROM pg_class WHERE oid = 'public.gift_certificate_cash_out_requests'::regclass`
  );
  if (!rls[0]?.relrowsecurity) throw new Error("RLS not enabled");

  const { rows: policies } = await client.query(
    `SELECT polname FROM pg_policy WHERE polrelid = 'public.gift_certificate_cash_out_requests'::regclass`
  );
  if (!policies.length) throw new Error("RLS policy missing");

  for (const fn of [
    "gift_certificate_cash_out_request",
    "gift_certificate_cash_out_cancel",
    "gift_certificate_cash_out_reject",
    "gift_certificate_cash_out_approve",
    "gift_certificate_cash_out_mark_paid",
    "gift_certificate_store_revenue_available",
  ]) {
    const { rows } = await client.query(`SELECT 1 FROM pg_proc WHERE proname = $1`, [fn]);
    if (!rows.length) throw new Error(`RPC missing: ${fn}`);
  }

  const { rows: availDef } = await client.query(
    `SELECT pg_get_functiondef(p.oid) AS def
     FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public' AND p.proname='gift_certificate_store_revenue_available'
     LIMIT 1`
  );
  const def = String(availDef[0]?.def || "");
  if (!def.includes("CASH_OUT_HOLD")) throw new Error("available() missing CASH_OUT_HOLD");
  if (!def.includes("gift_certificate_conversion_requests")) {
    throw new Error("available() missing conversion REQUESTED subtract");
  }

  return {
    table: true,
    columns: [...colSet],
    indexes: idxNames,
    constraints: conNames,
    rls: true,
    policies: policies.map((p) => p.polname),
    rpcs: true,
    availableIncludesHold: true,
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
        migrationPlan: "170000 ONLY",
        approvedMigration: MIGRATION_FILE,
        version: VERSION,
        otherMigrations: "NONE",
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
  console.log("[apply-gift-cash-out-migration] ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

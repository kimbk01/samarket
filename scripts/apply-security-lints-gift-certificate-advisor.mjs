/**
 * Apply ONLY 20261129200000_security_lints_gift_certificate_advisor to linked Production DB.
 * Does NOT run `supabase db push`. Does NOT apply other pending migrations.
 *
 * Usage: node --env-file=.env.local scripts/apply-security-lints-gift-certificate-advisor.mjs
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const { Client } = pg;
const MIGRATION_FILE = "20261129200000_security_lints_gift_certificate_advisor.sql";
const VERSION = "20261129200000";
const EXPECTED_HOST_FRAGMENT = "ckdosyydvgzqwpbwuhon";

const SERVICE_ONLY = [
  "generate_gift_public_number",
  "gift_certificate_cash_out_approve",
  "gift_certificate_cash_out_cancel",
  "gift_certificate_cash_out_mark_paid",
  "gift_certificate_cash_out_reject",
  "gift_certificate_cash_out_request",
  "gift_certificate_correct_legacy_recognition",
  "gift_certificate_promo_accrue_for_instance",
  "gift_certificate_promo_recognize_for_redemption",
  "gift_certificate_promo_reverse_for_redemption",
  "gift_certificate_promo_settle",
  "gift_certificate_recognize_revenue_for_completed_order",
  "gift_certificate_redemption_is_recognized",
  "gift_certificate_redemption_recognized_net",
  "trg_store_orders_gift_revenue_on_completed",
  "gift_certificate_issue_date",
  "gift_certificate_instance_is_expired",
  "gift_certificate_resolve_validity_at_issue",
  "gift_certificate_instance_allows_checkout_store",
];

const SEARCH_PATH_FNS = [
  "gift_certificate_issue_date",
  "gift_certificate_instance_is_expired",
  "gift_certificate_resolve_validity_at_issue",
  "gift_certificate_instance_allows_checkout_store",
];

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
  const code = sql
    .split(/\n/)
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n")
    .toUpperCase();
  for (const bad of ["DROP TABLE", "DROP COLUMN", "TRUNCATE", "DELETE FROM", "CREATE OR REPLACE"]) {
    if (code.includes(bad)) {
      throw new Error(`MIGRATION CONTENT DIFFERS FROM APPROVED SCOPE: contains ${bad}`);
    }
  }
  for (const must of [
    "SET search_path = public",
    "REVOKE EXECUTE",
    "FROM anon",
    "FROM authenticated",
    "gift_certificate_cash_out_approve",
    "gift_certificate_issue_date",
  ]) {
    if (!sql.includes(must)) throw new Error(`missing ${must}`);
  }
}

async function historyHasVersion(client) {
  const { rows } = await client.query(
    `SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = $1`,
    [VERSION]
  );
  return rows.length > 0;
}

async function verify(client) {
  const { rows: pathRows } = await client.query(
    `SELECT p.proname, p.proconfig
     FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = ANY($1::text[])`,
    [SEARCH_PATH_FNS]
  );
  const byName = Object.fromEntries(pathRows.map((r) => [r.proname, r.proconfig]));
  for (const name of SEARCH_PATH_FNS) {
    const cfg = byName[name];
    const joined = Array.isArray(cfg) ? cfg.join(",") : String(cfg || "");
    if (!joined.includes("search_path")) {
      throw new Error(`search_path missing: ${name}`);
    }
  }

  const { rows: aclRows } = await client.query(
    `SELECT p.proname,
            has_function_privilege('anon', p.oid, 'execute') AS anon_exec,
            has_function_privilege('authenticated', p.oid, 'execute') AS auth_exec,
            has_function_privilege('service_role', p.oid, 'execute') AS service_exec
     FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = ANY($1::text[])`,
    [SERVICE_ONLY]
  );
  const leaks = [];
  const missingService = [];
  for (const r of aclRows) {
    if (r.anon_exec || r.auth_exec) leaks.push(r.proname);
    if (!r.service_exec) missingService.push(r.proname);
  }
  if (leaks.length) throw new Error(`client EXECUTE still open: ${leaks.join(", ")}`);
  if (missingService.length) {
    throw new Error(`service_role EXECUTE missing: ${missingService.join(", ")}`);
  }
  if (aclRows.length < SERVICE_ONLY.length) {
    const found = new Set(aclRows.map((r) => r.proname));
    const missing = SERVICE_ONLY.filter((n) => !found.has(n));
    throw new Error(`functions missing: ${missing.join(", ")}`);
  }

  return {
    searchPathLocked: SEARCH_PATH_FNS,
    serviceOnlyCount: aclRows.length,
    clientExecuteClosed: true,
  };
}

async function recordHistory(client) {
  try {
    await client.query(
      `INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
       VALUES ($1, $2, ARRAY[]::text[]) ON CONFLICT DO NOTHING`,
      [VERSION, MIGRATION_FILE]
    );
    return { recorded: true, note: "version+name+statements" };
  } catch (e1) {
    try {
      await client.query(
        `INSERT INTO supabase_migrations.schema_migrations (version, name)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [VERSION, MIGRATION_FILE]
      );
      return { recorded: true, note: "version+name" };
    } catch (e2) {
      try {
        await client.query(
          `INSERT INTO supabase_migrations.schema_migrations (version)
           VALUES ($1) ON CONFLICT DO NOTHING`,
          [VERSION]
        );
        return { recorded: true, note: "version_only" };
      } catch (e3) {
        return {
          recorded: false,
          note: String(e3?.message || e2?.message || e1?.message || e3).slice(0, 200),
        };
      }
    }
  }
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
    const inHistory = await historyHasVersion(client);
    if (inHistory) {
      const proof = await verify(client);
      console.log(JSON.stringify({ phase: "ALREADY_APPLIED", proof }, null, 2));
    } else {
      await client.query(sql);
      const history = await recordHistory(client);
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
  } finally {
    await client.end();
  }
  console.log("[apply-security-lints-gift-certificate-advisor] ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

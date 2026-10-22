/**
 * Apply ONLY 20270608120000_cm_bootstrap_snapshot_watermark_fence_rpc to Production DB.
 * Does NOT run `supabase db push`. Does NOT apply other pending migrations.
 *
 * Usage: node --env-file=.env.local scripts/apply-cm-bootstrap-snapshot-watermark-fence-rpc.mjs
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const { Client } = pg;
const MIGRATION_FILE = "20270608120000_cm_bootstrap_snapshot_watermark_fence_rpc.sql";
const VERSION = "20270608120000";
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
    "invalidate_cm_bootstrap_snapshot_watermark",
    "upsert_cm_bootstrap_snapshot_if_watermark_fence",
    "SECURITY DEFINER",
    "SET search_path = public",
    "pg_advisory_xact_lock",
    "service_role",
  ]) {
    if (!sql.includes(must)) throw new Error(`missing required marker: ${must}`);
  }
}

async function verify(client) {
  const { rows: fns } = await client.query(
    `SELECT p.proname
     FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN (
         'invalidate_cm_bootstrap_snapshot_watermark',
         'upsert_cm_bootstrap_snapshot_if_watermark_fence'
       )
     ORDER BY 1`
  );
  if (fns.length !== 2) {
    throw new Error(`LIVE FAIL: functions missing (${fns.map((r) => r.proname)})`);
  }

  const { rows: defs } = await client.query(
    `SELECT p.proname, p.prosecdef AS security_definer,
            COALESCE(pg_catalog.array_to_string(p.proconfig, ','), '') AS config
     FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN (
         'invalidate_cm_bootstrap_snapshot_watermark',
         'upsert_cm_bootstrap_snapshot_if_watermark_fence'
       )`
  );
  for (const row of defs) {
    if (!row.security_definer) throw new Error(`LIVE FAIL: ${row.proname} not SECURITY DEFINER`);
    if (!String(row.config).includes("search_path=public")) {
      throw new Error(`LIVE FAIL: ${row.proname} search_path not locked to public`);
    }
  }

  const { rows: grants } = await client.query(
    `SELECT p.proname, r.rolname, has_function_privilege(r.oid, p.oid, 'EXECUTE') AS can_exec
     FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     CROSS JOIN pg_roles r
     WHERE n.nspname = 'public'
       AND p.proname IN (
         'invalidate_cm_bootstrap_snapshot_watermark',
         'upsert_cm_bootstrap_snapshot_if_watermark_fence'
       )
       AND r.rolname IN ('service_role', 'anon', 'authenticated')
     ORDER BY 1, 2`
  );
  for (const g of grants) {
    if (g.rolname === "service_role" && !g.can_exec) {
      throw new Error(`LIVE FAIL: service_role missing EXECUTE on ${g.proname}`);
    }
    if ((g.rolname === "anon" || g.rolname === "authenticated") && g.can_exec) {
      throw new Error(`LIVE FAIL: ${g.rolname} still has EXECUTE on ${g.proname}`);
    }
  }
}

async function main() {
  loadEnvLocal();
  const conn = buildConnectionString();
  if (!conn) {
    console.error("BLOCKED: no DATABASE_URL / SUPABASE_DB_PASSWORD");
    process.exit(1);
  }
  if (!conn.includes(EXPECTED_HOST_FRAGMENT)) {
    console.error("BLOCKED: connection host fragment mismatch");
    process.exit(1);
  }
  const sqlPath = resolve(process.cwd(), "supabase/migrations", MIGRATION_FILE);
  const sql = readFileSync(sqlPath, "utf8");
  assertApprovedSql(sql);

  const client = new Client({
    connectionString: conn,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20000,
  });
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
    console.log(JSON.stringify({ ok: true, version: VERSION, file: MIGRATION_FILE }));
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    console.error("APPLY FAIL:", e instanceof Error ? e.message : String(e));
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();

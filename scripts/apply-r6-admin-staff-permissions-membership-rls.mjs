/**
 * Apply ONLY 20270413120000_r6_admin_staff_permissions_membership_rls to Production DB.
 * Does NOT run `supabase db push`. Does NOT mutate profiles / memberships / mirror data.
 *
 * Usage: node --env-file=.env.local scripts/apply-r6-admin-staff-permissions-membership-rls.mjs
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const { Client } = pg;
const MIGRATION_FILE = "20270413120000_r6_admin_staff_permissions_membership_rls.sql";
const VERSION = "20270413120000";
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
  for (const bad of [
    "DROP TABLE",
    "TRUNCATE",
    "DELETE FROM",
    "UPDATE PUBLIC.PROFILES",
    "UPDATE PUBLIC.ADMIN_MEMBERSHIPS",
    "INSERT INTO",
  ]) {
    if (upper.includes(bad)) {
      throw new Error(`MIGRATION CONTENT DIFFERS FROM APPROVED SCOPE: contains ${bad}`);
    }
  }
  for (const must of [
    "admin_staff_permissions_select_admin",
    "public.is_platform_admin(auth.uid())",
    "DROP POLICY IF EXISTS",
    "CREATE POLICY",
  ]) {
    if (!sql.includes(must)) throw new Error(`missing required marker: ${must}`);
  }
  const body = sql.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  if (/p\.is_admin\s*=\s*true/i.test(body) || /profiles\.is_admin/i.test(body)) {
    throw new Error("must not authorize via profiles.is_admin");
  }
}

async function precheckHelper(client) {
  const { rows } = await client.query(`
    SELECT n.nspname AS schema, p.proname, p.prosecdef AS security_definer,
           pg_get_functiondef(p.oid) AS def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'is_platform_admin'
      AND n.nspname IN ('public', 'internal')
    ORDER BY n.nspname
  `);
  if (rows.length === 0) throw new Error("PRECHECK FAIL: is_platform_admin missing");
  const internal = rows.find((r) => r.schema === "internal") || rows.find((r) => r.schema === "public");
  const def = String(internal.def || "");
  if (!/admin_memberships/i.test(def)) {
    throw new Error("PRECHECK FAIL: helper not membership-based");
  }
  if (/profiles\.role|profiles\.is_admin|p\.is_admin/i.test(def)) {
    throw new Error("PRECHECK FAIL: helper still references profile mirrors");
  }
  if (!/status\s*=\s*'active'/i.test(def)) {
    throw new Error("PRECHECK FAIL: helper missing active status");
  }
  if (!/admin',\s*'super_admin'|admin',\s*"super_admin"/i.test(def) && !/super_admin/i.test(def)) {
    throw new Error("PRECHECK FAIL: helper missing admin|super_admin roles");
  }
  console.log(
    JSON.stringify({
      precheck: "PASS",
      helpers: rows.map((r) => ({
        schema: r.schema,
        security_definer: r.security_definer,
        has_memberships: /admin_memberships/i.test(r.def),
      })),
    })
  );
}

async function verifyPolicy(client) {
  const { rows } = await client.query(`
    SELECT policyname, cmd, qual
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'admin_staff_permissions'
      AND policyname = 'admin_staff_permissions_select_admin'
  `);
  if (rows.length !== 1) throw new Error(`LIVE READBACK FAIL: policy rows=${rows.length}`);
  const qual = String(rows[0].qual || "");
  if (!/is_platform_admin/i.test(qual)) {
    throw new Error(`LIVE READBACK FAIL: qual missing is_platform_admin: ${qual}`);
  }
  if (/is_admin/i.test(qual) && !/is_platform_admin/i.test(qual)) {
    throw new Error(`LIVE READBACK FAIL: still is_admin: ${qual}`);
  }
  if (/profiles/i.test(qual)) {
    throw new Error(`LIVE READBACK FAIL: still references profiles: ${qual}`);
  }
  console.log(JSON.stringify({ live_readback: "PASS", policy: rows[0].policyname, qual }));
}

async function main() {
  loadEnvLocal();
  const sqlPath = resolve(process.cwd(), "supabase/migrations", MIGRATION_FILE);
  const sql = readFileSync(sqlPath, "utf8");
  assertApprovedSql(sql);

  const cs = buildConnectionString();
  if (!cs) throw new Error("No DATABASE_URL / SUPABASE_DB_PASSWORD");
  if (!cs.includes(EXPECTED_HOST_FRAGMENT)) {
    throw new Error(`Refusing unexpected DB host (want ${EXPECTED_HOST_FRAGMENT})`);
  }

  const client = new Client({
    connectionString: cs,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });
  await client.connect();
  try {
    await precheckHelper(client);

    const { rows: before } = await client.query(
      `SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = $1`,
      [VERSION]
    );
    if (before.length > 0) {
      console.log(JSON.stringify({ apply: "ALREADY_APPLIED", version: VERSION }));
      await verifyPolicy(client);
      return;
    }

    await client.query("BEGIN");
    await client.query(sql);
    await client.query(
      `INSERT INTO supabase_migrations.schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING`,
      [VERSION]
    );
    await client.query("COMMIT");
    console.log(JSON.stringify({ apply: "APPLIED", version: VERSION, file: MIGRATION_FILE }));
    await verifyPolicy(client);
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

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

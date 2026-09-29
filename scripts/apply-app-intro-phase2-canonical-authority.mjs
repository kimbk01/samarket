/**
 * Apply ONLY 20270401120000_app_intro_canonical_db_storage_security.
 * Does NOT run `supabase db push`. Does NOT apply other pending migrations.
 *
 * Usage:
 *   node --env-file=.env.local scripts/apply-app-intro-phase2-canonical-authority.mjs
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const { Client } = pg;
const MIGRATION_FILE =
  "20270401120000_app_intro_canonical_db_storage_security.sql";
const VERSION = "20270401120000";
const EXPECTED_HOST_FRAGMENT = "ckdosyydvgzqwpbwuhon";
const TABLES = [
  "app_intro_documents",
  "app_intro_media",
  "app_intro_source_generations",
  "app_intro_runtime_artifacts",
  "app_intro_publish_operations",
  "app_intro_revisions",
  "app_intro_sealed_assets",
  "app_intro_packs",
  "app_intro_live",
];

function loadEnvLocal() {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split(/\n/)) {
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const i = line.indexOf("=");
      const k = line.slice(0, i).trim();
      let v = line.slice(i + 1).trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
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
  for (const bad of [
    "DROP TABLE",
    "DROP COLUMN",
    "TRUNCATE",
    "DELETE FROM",
    "CREATE POLICY",
    "ALTER POLICY",
  ]) {
    if (code.includes(bad)) {
      throw new Error(
        `MIGRATION CONTENT DIFFERS FROM APPROVED SCOPE: contains ${bad}`,
      );
    }
  }
  for (const must of [
    "app_intro_documents",
    "app_intro_media",
    "app_intro_source_generations",
    "app_intro_runtime_artifacts",
    "app_intro_publish_operations",
    "app_intro_revisions",
    "app_intro_sealed_assets",
    "app_intro_packs",
    "app_intro_live",
    "NEVER_CONFIGURED",
    "ENABLE ROW LEVEL SECURITY",
    "FORCE ROW LEVEL SECURITY",
    "REVOKE ALL ON TABLE",
    "FROM PUBLIC, anon, authenticated",
    "GRANT ALL ON TABLE",
    "TO service_role",
    "dibay-intro",
    "authority/v1/",
  ]) {
    if (!sql.includes(must)) throw new Error(`missing required marker: ${must}`);
  }
  for (const forbidden of [
    "dibay_intro_documents",
    "intro_v3_",
    "opening_",
    "intro12_",
  ]) {
    // Allow comments mentioning quarantine; forbid DDL targeting historical names.
    const re = new RegExp(
      String.raw`(?:CREATE|ALTER|DROP|INSERT\s+INTO|UPDATE|TRUNCATE)\s+(?:TABLE\s+)?(?:public\.)?${forbidden}`,
      "i",
    );
    if (re.test(sql)) {
      throw new Error(`historical namespace mutation forbidden: ${forbidden}`);
    }
  }
}

async function verifyCanonical(client) {
  const { rows: tables } = await client.query(
    `SELECT tablename
     FROM pg_tables
     WHERE schemaname = 'public' AND tablename LIKE 'app_intro_%'
     ORDER BY tablename`,
  );
  const names = tables.map((r) => r.tablename);
  for (const t of TABLES) {
    if (!names.includes(t)) throw new Error(`LIVE FAIL: missing table ${t}`);
  }

  const { rows: live } = await client.query(
    `SELECT singleton, live_kind, published_revision_id, pack_id, disabled_at
     FROM public.app_intro_live
     WHERE singleton = true`,
  );
  if (live.length !== 1) throw new Error("LIVE FAIL: singleton live row count");
  if (live[0].live_kind !== "NEVER_CONFIGURED") {
    throw new Error(`LIVE FAIL: expected NEVER_CONFIGURED, got ${live[0].live_kind}`);
  }
  if (live[0].published_revision_id != null || live[0].pack_id != null) {
    throw new Error("LIVE FAIL: initial live must be inert (null pointers)");
  }

  const { rows: bucket } = await client.query(
    `SELECT id, public FROM storage.buckets WHERE id = 'dibay-intro'`,
  );
  if (!bucket.length || bucket[0].public !== false) {
    throw new Error("LIVE FAIL: dibay-intro must remain private");
  }

  for (const t of TABLES) {
    const { rows: rls } = await client.query(
      `SELECT c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname = $1`,
      [t],
    );
    if (!rls[0]?.rls_enabled || !rls[0]?.rls_forced) {
      throw new Error(`LIVE FAIL: RLS/FORCE missing on ${t}`);
    }
    const { rows: pols } = await client.query(
      `SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = $1`,
      [t],
    );
    if (pols.length !== 0) {
      throw new Error(`LIVE FAIL: unexpected client policies on ${t}`);
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
    console.error("BLOCKED: connection host is not approved production project");
    process.exit(1);
  }

  const sqlPath = resolve(process.cwd(), "supabase/migrations", MIGRATION_FILE);
  const sql = readFileSync(sqlPath, "utf8");
  assertApprovedSql(sql);

  // Refuse collateral apply of other not-yet-applied migration files.
  // This script only ever applies VERSION.
  const client = new Client({
    connectionString: conn,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const { rows: existing } = await client.query(
      `SELECT version, name FROM supabase_migrations.schema_migrations WHERE version = $1`,
      [VERSION],
    );
    if (existing.length) {
      console.log(`SKIP: ${VERSION} already applied`);
      await verifyCanonical(client);
      console.log("VERIFY: canonical app_intro_* + zero-live + private bucket");
      return;
    }

    console.log(`APPLY: ${MIGRATION_FILE}`);
    await client.query(sql);
    await client.query(
      `INSERT INTO supabase_migrations.schema_migrations (version, name)
       VALUES ($1, $2)
       ON CONFLICT (version) DO NOTHING`,
      [VERSION, MIGRATION_FILE.replace(/\.sql$/, "")],
    );
    await verifyCanonical(client);

    const outDir = resolve(process.cwd(), ".tmp/intro-phase-2");
    mkdirSync(outDir, { recursive: true });
    writeFileSync(
      resolve(outDir, "APPLY_RESULT.json"),
      JSON.stringify(
        {
          at: new Date().toISOString(),
          version: VERSION,
          file: MIGRATION_FILE,
          method: "single-file pg Client (NOT supabase db push)",
          collateralMigrations: "NONE",
        },
        null,
        2,
      ),
    );
    console.log("PASS: Phase 2 canonical authority migration applied");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("FAIL:", err instanceof Error ? err.message : err);
  process.exit(1);
});

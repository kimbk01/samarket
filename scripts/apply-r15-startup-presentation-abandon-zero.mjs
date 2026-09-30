/**
 * Apply ONLY 20270408130000_r15_startup_presentation_abandon_zero to Production DB.
 * Demolition: drop R15 startup tables/bucket/objects. No Intro recreate.
 *
 * Usage: node scripts/apply-r15-startup-presentation-abandon-zero.mjs
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const MIGRATION_FILE = "20270408130000_r15_startup_presentation_abandon_zero.sql";
const VERSION = "20270408130000";
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

function assertApprovedSql(sql) {
  const upper = sql.toUpperCase();
  for (const bad of ["CREATE TABLE", "CREATE POLICY", "CREATE INDEX"]) {
    if (upper.includes(bad)) throw new Error(`abandon migration outside scope: contains ${bad}`);
  }
  if (/\bR16\b/.test(sql)) throw new Error("abandon migration outside scope: contains R16");
  for (const must of [
    "r15_startup_documents",
    "r15_startup_generations",
    "r15_startup_media",
    "r15-startup-media",
    "DROP TABLE",
  ]) {
    if (!sql.includes(must)) throw new Error(`missing required marker: ${must}`);
  }
}

function psql(args, env) {
  const r = spawnSync("psql", args, {
    encoding: "utf8",
    env: { ...process.env, ...env, PGSSLMODE: "require" },
  });
  if (r.status !== 0) {
    throw new Error(`psql failed: ${r.stderr || r.stdout || r.status}`);
  }
  return (r.stdout || "").trim();
}

loadEnvLocal();
const pass = process.env.SUPABASE_DB_PASSWORD?.trim();
if (!pass) {
  console.error("SUPABASE_DB_PASSWORD missing");
  process.exit(2);
}

const sqlPath = resolve(process.cwd(), "supabase/migrations", MIGRATION_FILE);
const sql = readFileSync(sqlPath, "utf8");
assertApprovedSql(sql);

const host = "aws-1-ap-south-1.pooler.supabase.com";
const user = `postgres.${EXPECTED_HOST_FRAGMENT}`;
const connArgs = ["-h", host, "-p", "5432", "-d", "postgres", "-U", user, "-v", "ON_ERROR_STOP=1"];
const env = { PGPASSWORD: pass };

const existing = psql(
  [...connArgs, "-At", "-c", `SELECT version FROM supabase_migrations.schema_migrations WHERE version = '${VERSION}'`],
  env
);
if (existing === VERSION) {
  console.log(JSON.stringify({ alreadyRecorded: true, version: VERSION }));
} else {
  console.log("[apply] running R15 abandonment zero migration...");
  psql([...connArgs, "-f", sqlPath], env);
  psql(
    [
      ...connArgs,
      "-At",
      "-c",
      `INSERT INTO supabase_migrations.schema_migrations (version, name)
       VALUES ('${VERSION}', 'r15_startup_presentation_abandon_zero')
       ON CONFLICT DO NOTHING`,
    ],
    env
  );
}

const check = psql(
  [
    ...connArgs,
    "-At",
    "-c",
    `SELECT
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='r15_startup_documents') THEN 'DOC_LIVE' ELSE 'DOC_ZERO' END
       || '|' || CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='r15_startup_generations') THEN 'GEN_LIVE' ELSE 'GEN_ZERO' END
       || '|' || CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='r15_startup_media') THEN 'MEDIA_LIVE' ELSE 'MEDIA_ZERO' END
       || '|' || CASE WHEN EXISTS (SELECT 1 FROM storage.buckets WHERE id='r15-startup-media') THEN 'BUCKET_LIVE' ELSE 'BUCKET_ZERO' END
       || '|' || COALESCE((SELECT count(*)::text FROM storage.objects WHERE bucket_id='r15-startup-media'), '0')
       || '|' || CASE WHEN EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='${VERSION}') THEN 'MIG_RECORDED' ELSE 'MIG_MISSING' END`,
  ],
  env
);

console.log(JSON.stringify({ version: VERSION, check }, null, 2));
if (
  !check.includes("DOC_ZERO") ||
  !check.includes("GEN_ZERO") ||
  !check.includes("MEDIA_ZERO") ||
  !check.includes("BUCKET_ZERO") ||
  !check.includes("MIG_RECORDED")
) {
  console.error("R15 abandonment ZERO check FAILED");
  process.exit(1);
}
console.log("R15 DB/STORAGE ZERO PASS");

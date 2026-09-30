/**
 * Apply ONLY 20270408120000_r15_startup_presentation_phase1 to Production DB.
 * Does NOT run `supabase db push`. Does NOT apply other pending migrations.
 *
 * Usage: node scripts/apply-r15-startup-presentation-phase1.mjs
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const MIGRATION_FILE = "20270408120000_r15_startup_presentation_phase1.sql";
const VERSION = "20270408120000";
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
  for (const bad of ["DROP TABLE", "TRUNCATE", "DELETE FROM"]) {
    if (upper.includes(bad)) throw new Error(`migration outside Phase 1 scope: contains ${bad}`);
  }
  for (const bad of ["APP_INTRO", "INTRO_V2", "OPENING_SHOW", "DIBAY-INTRO", "INTRO-SHOW", "OPENING-SHOW-MEDIA"]) {
    if (upper.includes(bad)) throw new Error(`migration reuses R14 authority: ${bad}`);
  }
  for (const must of [
    "r15_startup_documents",
    "r15_startup_generations",
    "r15_startup_media",
    "r15-startup-media",
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
  console.log("[apply] running R15 startup presentation migration...");
  psql([...connArgs, "-f", sqlPath], env);
  psql(
    [
      ...connArgs,
      "-At",
      "-c",
      `INSERT INTO supabase_migrations.schema_migrations (version, name)
       VALUES ('${VERSION}', 'r15_startup_presentation_phase1')
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
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='r15_startup_documents') THEN 'DOC_OK' ELSE 'DOC_MISSING' END
       || '|' || CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='r15_startup_generations') THEN 'GEN_OK' ELSE 'GEN_MISSING' END
       || '|' || CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='r15_startup_media') THEN 'MEDIA_OK' ELSE 'MEDIA_MISSING' END
       || '|' || CASE WHEN EXISTS (SELECT 1 FROM storage.buckets WHERE id='r15-startup-media') THEN 'BUCKET_OK' ELSE 'BUCKET_MISSING' END
       || '|' || CASE WHEN EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='${VERSION}') THEN 'MIG_RECORDED' ELSE 'MIG_MISSING' END`,
  ],
  env
);

console.log(JSON.stringify({ version: VERSION, check }, null, 2));
if (
  !check.includes("DOC_OK") ||
  !check.includes("GEN_OK") ||
  !check.includes("MEDIA_OK") ||
  !check.includes("BUCKET_OK") ||
  !check.includes("MIG_RECORDED")
) {
  process.exit(3);
}
console.log("APPLY_AND_VERIFY=PASS");

/**
 * Apply ONLY 20261222120000_community_crawl_runs_skipped_invalid_count to Production DB.
 * Does NOT run `supabase db push`. Does NOT apply other pending migrations.
 *
 * Usage: node --env-file=.env.local scripts/apply-community-crawl-runs-skipped-invalid-count-migration.mjs
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const MIGRATION_FILE = "20261222120000_community_crawl_runs_skipped_invalid_count.sql";
const VERSION = "20261222120000";

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
  for (const bad of ["DROP TABLE", "TRUNCATE", "DELETE FROM", "DISABLE ROW LEVEL SECURITY"]) {
    if (upper.includes(bad)) throw new Error(`MIGRATION CONTENT DIFFERS FROM APPROVED SCOPE: contains ${bad}`);
  }
  for (const must of ["skipped_invalid_count", "community_crawl_runs", "ADD COLUMN"]) {
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
const user = "postgres.ckdosyydvgzqwpbwuhon";
const connArgs = ["-h", host, "-p", "5432", "-d", "postgres", "-U", user, "-v", "ON_ERROR_STOP=1"];
const env = { PGPASSWORD: pass };

const existing = psql(
  [...connArgs, "-At", "-c", `SELECT version FROM supabase_migrations.schema_migrations WHERE version = '${VERSION}'`],
  env
);
if (existing === VERSION) {
  console.log(JSON.stringify({ alreadyRecorded: true, version: VERSION }));
} else {
  console.log("[apply] running migration SQL…");
  psql([...connArgs, "-f", sqlPath], env);
  psql(
    [
      ...connArgs,
      "-At",
      "-c",
      `INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('${VERSION}') ON CONFLICT DO NOTHING`,
    ],
    env
  );
}

const check = psql(
  [
    ...connArgs,
    "-At",
    "-c",
    `SELECT CASE WHEN EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'community_crawl_runs'
         AND column_name = 'skipped_invalid_count'
     ) THEN 'HAS_SKIPPED_INVALID_COUNT' ELSE 'MISSING_COLUMN' END
     || '|' || CASE WHEN EXISTS (
       SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '${VERSION}'
     ) THEN 'MIGRATION_RECORDED' ELSE 'MIGRATION_MISSING' END`,
  ],
  env
);

console.log(JSON.stringify({ ok: check === "HAS_SKIPPED_INVALID_COUNT|MIGRATION_RECORDED", check, version: VERSION }));
if (check !== "HAS_SKIPPED_INVALID_COUNT|MIGRATION_RECORDED") process.exit(1);

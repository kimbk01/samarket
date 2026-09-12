/**
 * Apply ONLY 20261229120000_community_board_import_reconstruction.sql
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const MIGRATION_FILE = "20261229120000_community_board_import_reconstruction.sql";
const VERSION = "20261229120000";

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

const host = "aws-1-ap-south-1.pooler.supabase.com";
const user = "postgres.ckdosyydvgzqwpbwuhon";
const connArgs = ["-h", host, "-p", "5432", "-d", "postgres", "-U", user, "-v", "ON_ERROR_STOP=1"];
const env = { PGPASSWORD: pass };

const existing = psql(
  [...connArgs, "-At", "-c", `SELECT version FROM supabase_migrations.schema_migrations WHERE version = '${VERSION}'`],
  env
);
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

const check = psql(
  [
    ...connArgs,
    "-At",
    "-c",
    `SELECT CASE WHEN EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema='public' AND table_name='community_author_pools'
     ) THEN 'HAS_AUTHOR_POOLS' ELSE 'NO_AUTHOR_POOLS' END
     || '|' || CASE WHEN EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name='community_crawl_boards'
         AND column_name='author_pool_id'
     ) THEN 'HAS_BOARD_AUTHOR_POOL' ELSE 'NO_BOARD_AUTHOR_POOL' END
     || '|' || CASE WHEN EXISTS (
       SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='${VERSION}'
     ) THEN 'MIGRATION_RECORDED' ELSE 'MIGRATION_MISSING' END`,
  ],
  env
);

const ok = check === "HAS_AUTHOR_POOLS|HAS_BOARD_AUTHOR_POOL|MIGRATION_RECORDED";
console.log(JSON.stringify({ ok, check, version: VERSION }));
if (!ok) process.exit(1);

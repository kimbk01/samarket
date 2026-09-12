/**
 * Apply ONLY 20260912202000_board_import_claim_publish.sql
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const MIGRATION_FILE = "20260912202000_board_import_claim_publish.sql";
const VERSION = "20260912202000";

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

const host = "aws-1-ap-south-1.pooler.supabase.com";
const user = "postgres.ckdosyydvgzqwpbwuhon";
const connArgs = ["-h", host, "-p", "5432", "-d", "postgres", "-U", user, "-v", "ON_ERROR_STOP=1"];
const env = { PGPASSWORD: pass };

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
       SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name='board_import_articles'
         AND column_name='publish_inflight_at'
     ) THEN 'HAS_INFLIGHT' ELSE 'NO_INFLIGHT' END
     || '|' || CASE WHEN EXISTS (
       SELECT 1 FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname='public' AND p.proname='board_import_claim_publish'
     ) THEN 'HAS_CLAIM_RPC' ELSE 'NO_CLAIM_RPC' END
     || '|' || CASE WHEN EXISTS (
       SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='${VERSION}'
     ) THEN 'MIGRATION_RECORDED' ELSE 'MIGRATION_MISSING' END`,
  ],
  env
);

const ok = check === "HAS_INFLIGHT|HAS_CLAIM_RPC|MIGRATION_RECORDED";
console.log(JSON.stringify({ ok, check, version: VERSION }));
if (!ok) process.exit(1);
